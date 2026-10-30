// Mermaid erDiagram parser (A.9), with Mermaid's word cardinality aliases (`one or more`, `0+`, `only one`…) and
// `to` / `optionally to` relationship keywords (R2).
import type { AttrKey, Cardinality, Direction, Entity, ErAttribute, ErModel } from '../model.js';
import { diag } from '../types.js';
import { cleanLabel } from './label.js';
import { ItemBudget } from './limits.js';

const LEFT = new Map<string, Cardinality>([['|o', 'zero-one'], ['||', 'one'], ['}o', 'zero-many'], ['}|', 'one-many']]);
const RIGHT = new Map<string, Cardinality>([['o|', 'zero-one'], ['||', 'one'], ['o{', 'zero-many'], ['|{', 'one-many']]);
// Mermaid's aliases; the same word works on either side.
const WORDS = new Map<string, Cardinality>([
  ['one or zero', 'zero-one'], ['zero or one', 'zero-one'],
  ['one or more', 'one-many'], ['one or many', 'one-many'], ['many(1)', 'one-many'], ['1+', 'one-many'],
  ['zero or more', 'zero-many'], ['zero or many', 'zero-many'], ['many(0)', 'zero-many'], ['0+', 'zero-many'],
  ['only one', 'one'], ['1', 'one'],
]);
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
// longest first, so `1+` wins over `1`
const WORD = `(?<![\\w])(?:${[...WORDS.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\\w])`;
const ENT = String.raw`("[^"]+"|[\w-]+(?:\[[^\]]*\])?)`;
const REL = new RegExp(
  `^${ENT}\\s*(?:(\\|o|\\|\\||\\}o|\\}\\|)|(${WORD}))\\s*(--|\\.\\.|(?<![\\w])(?:optionally\\s+to|to)(?![\\w]))` +
    `\\s*(?:(o\\||\\|\\||o\\{|\\|\\{)|(${WORD}))\\s*${ENT}\\s*(?::\\s*(.*))?$`,
  'i',
);
const BLOCK_OPEN = new RegExp(`^${ENT}\\s*\\{\\s*$`);
const BLOCK_EMPTY = new RegExp(`^${ENT}\\s*\\{\\s*\\}\\s*$`);
const BARE = new RegExp(`^${ENT}$`);
// type name [PK|FK|UK[, ...]] ["comment"]
const ATTR = /^([\w\-[\]()<>,.*]+)\s+([\w\-[\]().*]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?\s*$/;

/**
 * Splits an attribute's editor text into its head and its comment: the comment is the text in brackets after a space
 * (`name (comment)`), or Mermaid's quotes. Brackets without a space before them belong to the word (`INT(11)`).
 */
export function splitAttrComment(text: string): { head: string; comment: string } {
  const t = text.trim();
  const m = /^(.*?)\s+(?:\((.*)\)|"([^"]*)")$/.exec(t);
  return m ? { head: (m[1] ?? '').trim(), comment: (m[2] ?? m[3] ?? '').trim() } : { head: t, comment: '' };
}

/**
 * One attribute as typed in the editor: `type name [PK|FK|UK, …] [(comment)]`, the comment in brackets (Mermaid's
 * quotes work too); a single word is the name of a `string` attribute. Null when the text is not an attribute.
 */
export function parseAttrLine(line: string): ErAttribute | null {
  const { head, comment } = splitAttrComment(line);
  if (!head) return null;
  const m = ATTR.exec(head);
  if (m) return { type: m[1] ?? '', name: m[2] ?? '', keys: m[3] ? (m[3].split(/\s*,\s*/) as AttrKey[]) : [], comment };
  return /^[\w\-[\]().*]+$/.test(head) ? { type: 'string', name: head, keys: [], comment } : null;
}

const word = (w: string): Cardinality | undefined => WORDS.get(w.toLowerCase().replace(/\s+/g, ' '));

export function emptyEr(): ErModel {
  return { type: 'er', direction: 'TB', entities: new Map(), rels: [], diagnostics: [] };
}

export function parseER(code: string): ErModel {
  const model = emptyEr();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const relCount = new Map<string, number>();
  let current: Entity | null = null;
  let curLine = 0;

  const touch = (raw: string): Entity | null => {
    let id = raw.trim();
    let label: string | undefined;
    const al = /^([\w-]+)\[(.*)\]$/.exec(id);
    if (al) { id = al[1] ?? ''; label = cleanLabel(al[2]); }
    if (/^".*"$/.test(id)) id = id.slice(1, -1);
    let e = model.entities.get(id);
    if (!e) {
      if (!budget.take(curLine)) return null;
      e = { id, label: id, attrs: [], order: model.entities.size, lines: new Set() };
      model.entities.set(id, e);
    }
    e.lines.add(curLine);
    if (label) e.label = label;
    return e;
  };

  const lines = code.split('\n');
  for (let li = 0; li < lines.length && !budget.over; li++) {
    curLine = li;
    const t = (lines[li] ?? '').trim();
    if (!t || t.startsWith('%%') || /^erDiagram\b/.test(t)) continue;
    let m: RegExpExecArray | null;
    if (current) {
      current.lines.add(li);
      if (t === '}') { current.endLine = li; current = null; continue; }
      if ((m = ATTR.exec(t))) {
        const keys = m[3] ? (m[3].split(/\s*,\s*/) as AttrKey[]) : [];
        current.attrs.push({ type: m[1] ?? '', name: m[2] ?? '', keys, comment: m[4] ?? '' });
      } else D.push(diag('warning', 'er.bad-attribute', `cannot parse attribute "${t}"`, li));
      continue;
    }
    if ((m = /^direction\s+(TB|TD|BT|LR|RL)/.exec(t))) { model.direction = (m[1] ?? 'TB').replace('TD', 'TB') as Direction; continue; }
    if ((m = BLOCK_OPEN.exec(t))) {
      current = touch(m[1] ?? '');
      if (current) current.defLine = li;
      continue;
    }
    if ((m = BLOCK_EMPTY.exec(t))) { touch(m[1] ?? ''); continue; }
    if ((m = REL.exec(t))) {
      const [, a = '', lSym, lWord, rel = '', rSym, rWord, b = '', label] = m;
      const fromCard = lSym ? LEFT.get(lSym.toLowerCase()) : word(lWord ?? '');
      const toCard = rSym ? RIGHT.get(rSym.toLowerCase()) : word(rWord ?? '');
      const ea = touch(a), eb = touch(b);
      if (!ea || !eb || !fromCard || !toCard || !budget.take(li)) continue;
      const key = `${ea.id}--${eb.id}`;
      const n = (relCount.get(key) ?? 0) + 1;
      relCount.set(key, n);
      model.rels.push({
        id: n > 1 ? `${key}#${n}` : key, from: ea.id, to: eb.id, fromCard, toCard,
        identifying: rel === '--' || rel.toLowerCase() === 'to', label: cleanLabel(label ?? ''), src: li,
      });
      continue;
    }
    if ((m = BARE.exec(t))) { touch(m[1] ?? ''); continue; }
    if (/^(style|classDef|class)\b/.test(t)) continue;
    D.push(diag('warning', 'er.cannot-parse', `cannot parse "${t}"`, li));
  }
  return model;
}
