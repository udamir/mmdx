// Mermaid erDiagram parser (A.9, T11). Mermaid's jison lexer (erDiagram.jison, identical in 11.17 and 12.2: its rules,
// start conditions and first-match order) is reproduced rule by rule over the code as Mermaid's preprocessing leaves
// it (frontmatter, `%%{init}%%` and comment lines blanked, `#9829;` entities kept whole), so what Mermaid reads as one
// token mmdx reads the same way: ids, attribute types and names are any run of non-ASCII characters, word
// characters, `-`, `*` and `.` (Unicode and emoji included), a relationship label is one word or a quoted text
// (`: places order` labels the relationship "places" and adds an entity `order`), the word cardinalities are exactly
// Mermaid's (`only one`, `zero or more`, `many(1)`, `1+`, `many`, `u`…), `.-` and `-.` are non-identifying lines. A
// small grammar over the tokens gives the statements; a statement Mermaid rejects is reported and skipped (the parse
// goes on at the next line), with two exceptions mmdx reads anyway because their meaning is plain: a relationship
// without its `: label` (an error with a fix) and a `title` statement (Mermaid reads its words as entities; a warning
// with the fix that moves it to the frontmatter).
//
// The model follows Mermaid's ErDB: an entity's alias is the first one written; `:::a,b`, `class` and `style` apply
// to the entities (and subgraphs) that exist when they are read; a subgraph's members are the entities its statements
// name (both ends of a relationship written in it), unique across subgraphs in the order they close (an inner
// subgraph claims first); a relationship to a subgraph's id ends on the subgraph, and an entity of that id is not
// drawn. Offsets of every statement, relationship token and label are kept, so the ops rewrite only what changes
// (T11.5).
import type { AttrKey, Cardinality, Direction, Entity, ErAttribute, ErEntityStmt, ErGroup, ErModel, ErRel, MermaidStyle } from '../model.js';
import { diag } from '../types.js';
import { frontmatterValues, titleToFrontmatter } from './frontmatter.js';
import { guardParse, ItemBudget, LexBudget } from './limits.js';
import { LineScan } from './line-scan.js';
import { firstMatch, lexRule, prepareSource, type LexRule } from './jison.js';
import { labelText, lineIndex, unquotePair } from './kit.js';
import { parseStyleList } from './style.js';
import { minOf } from '../geom.js';

// ---- attributes as the editor types them ------------------------------------------------------------------------

// Mermaid's attribute word (block rule 25): a letter, `_`, `*` or a character from U+00C0, then also digits, `-`,
// brackets, `.` and `,`
const AWORD = String.raw`[*A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-_[\]().,\u00C0-\uFFFF*]*`;
// type[?] name [PK|FK|UK[, ...]] ["comment"]
const ATTR = new RegExp(`^(${AWORD})(\\s*\\?)?\\s+(${AWORD})(?:\\s+((?:PK|FK|UK)(?:\\s*,\\s*(?:PK|FK|UK))*))?(?:\\s+"([^"]*)")?\\s*$`, 'i');
const KEYS = /^(?:PK|FK|UK)$/i;

/**
 * Splits an attribute's editor text into its head and its comment: the comment is the text in brackets after a space
 * (`name (comment)`), or Mermaid's quotes. Brackets without a space before them belong to the word (`INT(11)`).
 */
export function splitAttrComment(text: string): { head: string; comment: string } {
  const t = text.trim();
  // scans, not `^(.*?)\s+(?:\((.*)\)|"([^"]*)")$`, which backtracks quadratically on a long run of spaces
  if (t.endsWith(')')) {
    // from the first `(` after a space
    const at = t.search(/\s\(/);
    if (at >= 0) return { head: t.slice(0, at).trim(), comment: t.slice(at + 2, -1).trim() };
  } else if (t.endsWith('"')) {
    // the last quoted text, after a space
    const q = t.lastIndexOf('"', t.length - 2);
    if (q > 0 && /\s/.test(t[q - 1] ?? '')) return { head: t.slice(0, q).trim(), comment: t.slice(q + 1, -1).trim() };
  }
  return { head: t, comment: '' };
}

const keysOf = (s: string | undefined): AttrKey[] => (s ? (s.split(/\s*,\s*/).map((k) => k.toUpperCase()) as AttrKey[]) : []);

/**
 * One attribute as typed in the editor: `type[?] name [PK|FK|UK, …] [(comment)]`, the comment in brackets (Mermaid's
 * quotes work too); a single word is the name of a `string` attribute. Null when the text is not an attribute.
 */
export function parseAttrLine(line: string): ErAttribute | null {
  const { head, comment } = splitAttrComment(line);
  if (!head) return null;
  const m = ATTR.exec(head);
  if (m && !KEYS.test(m[3] ?? '')) return { type: (m[1] ?? '') + (m[2] ? '?' : ''), name: m[3] ?? '', keys: keysOf(m[4]), comment };
  return new RegExp(`^${AWORD}$`).test(head) && !KEYS.test(head) ? { type: 'string', name: head, keys: [], comment } : null;
}

export function emptyEr(): ErModel {
  return { type: 'er', direction: 'TB', entities: new Map(), rels: [], groups: new Map(), classDefs: {}, undefinedClasses: [], headerLine: -1, diagnostics: [] };
}

// ---- lexer --------------------------------------------------------------------------------------------------------

interface Tok {
  t: string;
  /** yytext (a cardinality's: its category; a relationship line's: `id` or `non`). */
  v: string;
  s: number;
  e: number;
}

/** What a rule's action does: the condition begun or popped, the token (none: skipped), its value. */
interface Act {
  begin?: string;
  pop?: boolean;
  tok?: string;
  v?: string;
}

type Rule = LexRule<Act>;

const R = (re: string, act: Act, more: Partial<Rule> = {}): Rule => lexRule(re, act, more);
const CARD = (re: string, v: Cardinality | 'md-parent'): Rule => R(re, { tok: 'CARD', v });
// `.*direction\s+TB[^\n]*` in Mermaid's lexer, answered from a per-line index
const DIR = (d: Direction): Rule => R(`.*direction\\s+${d}[^\\n]*`, { tok: 'DIR', v: d }, { test: (L, pos) => L.direction(pos, d) });

// erDiagram.jison's rules, by their index in Mermaid's lexer
const RULES: Rule[] = [
  /* 0 */ R('accTitle\\s*:\\s*', { begin: 'acc_title', tok: 'ACC_TITLE' }),
  /* 1 */ R('[^\\n]*', { pop: true, tok: 'ACC_VALUE' }),
  /* 2 */ R('accDescr\\s*:\\s*', { begin: 'acc_descr', tok: 'ACC_DESCR' }),
  /* 3 */ R('[^\\n]*', { pop: true, tok: 'ACC_VALUE' }),
  /* 4 */ R('accDescr\\s*\\{\\s*', { begin: 'acc_descr_multiline' }),
  /* 5 */ R('[\\}]', { pop: true }),
  /* 6 */ R('[^\\}]*', { tok: 'ACC_DESCR_BLOCK' }),
  /* 7–10 */ DIR('TB'), DIR('BT'), DIR('RL'), DIR('LR'),
  /* 11 */ R('[ \\t\\r]+', {}),
  /* 12 */ R('[\\n]+', { tok: 'NL' }),
  /* 13 */ R('"[^"%\\r\\n\\v\\b\\\\]+"', { tok: 'ENTITY_NAME' }),
  /* 14 */ R('"[^"]*"', { tok: 'WORD' }),
  /* 15 */ R('erDiagram\\b', { tok: 'ER' }),
  /* 16 */ R('\\{', { begin: 'block', tok: 'BLOCK_START' }),
  /* 17 */ R('#', { tok: 'BRKT' }),
  /* 18 */ R('#', { tok: 'BRKT' }),
  /* 19 */ R(',', { tok: 'COMMA' }),
  /* 20 */ R(':::', { tok: 'SEP' }),
  /* 21 */ R(':', { tok: 'COLON' }),
  /* 22 */ R('\\s+', {}),
  /* 23 */ R('\\b((?:PK)|(?:FK)|(?:UK))\\b', { tok: 'KEY' }),
  /* 24 */ R('([^\\s]*)[~].*[~]([^\\s]*)', { tok: 'AWORD' }, { scan: 'line' }),
  /* 25 */ R(AWORD, { tok: 'AWORD' }),
  /* 26 */ R('[`]', { begin: 'block_bq' }),
  /* 27 */ R('[^`]+', { tok: 'AWORD' }),
  /* 28 */ R('[`]', { pop: true }),
  /* 29 */ R('"[^"]*"', { tok: 'COMMENT' }),
  /* 30 */ R('[\\n]+', {}),
  /* 31 */ R('\\}', { pop: true, tok: 'BLOCK_STOP' }),
  /* 32 */ R('.', { tok: 'CHAR' }),
  /* 33 */ R('\\[', { tok: 'SQS' }),
  /* 34 */ R('\\]', { tok: 'SQE' }),
  /* 35 */ R('style\\b', { begin: 'style', tok: 'STYLE' }),
  /* 36 */ R('[\\n]+', { pop: true, tok: 'NL' }),
  /* 37 */ R('\\s+', {}),
  /* 38 */ R(':', { tok: 'COLON' }),
  /* 39 */ R(',', { tok: 'COMMA' }),
  /* 40 */ R('#', { tok: 'BRKT' }),
  /* 41 */ R('classDef\\b', { begin: 'style', tok: 'CLASSDEF' }),
  /* 42 */ R('class\\b', { tok: 'CLASS' }),
  /* 43 */ R('subgraph\\b', { tok: 'SUBGRAPH' }),
  /* 44 */ R('end\\b\\s*', { tok: 'END' }),
  /* 45 */ CARD('one or zero\\b', 'zero-one'),
  /* 46 */ CARD('one or more\\b', 'one-many'),
  /* 47 */ CARD('one or many\\b', 'one-many'),
  /* 48 */ CARD('1\\+', 'one-many'),
  /* 49 */ CARD('\\|o\\b', 'zero-one'),
  /* 50 */ CARD('zero or one\\b', 'zero-one'),
  /* 51 */ CARD('zero or more\\b', 'zero-many'),
  /* 52 */ CARD('zero or many\\b', 'zero-many'),
  /* 53 */ CARD('0\\+', 'zero-many'),
  /* 54 */ CARD('\\}o\\b', 'zero-many'),
  /* 55 */ CARD('many\\(0\\)', 'zero-many'),
  /* 56 */ CARD('many\\(1\\)', 'one-many'),
  /* 57 */ CARD('many\\b', 'zero-many'),
  /* 58 */ CARD('\\}\\|', 'one-many'),
  /* 59 */ CARD('one\\b', 'one'),
  /* 60 */ CARD('only one\\b', 'one'),
  /* 61 */ R('[0-9]+\\.[0-9]+', { tok: 'DECIMAL' }),
  /* 62 */ CARD('1(?=\\s+[A-Za-z_"\'])', 'one'),
  /* 63 */ CARD('1(?=\\s+[0-9])', 'one'),
  /* 64 */ CARD('1(?=(--|\\.\\.|\\.-|-\\.))', 'one'),
  /* 65 */ R('1\\b', { tok: 'ENTITY_ONE' }),
  /* 66 */ R('[0-9]+', { tok: 'NUM' }),
  /* 67 */ CARD('\\|\\|', 'one'),
  /* 68 */ CARD('o\\|', 'zero-one'),
  /* 69 */ CARD('o\\{', 'zero-many'),
  /* 70 */ CARD('\\|\\{', 'one-many'),
  /* 71 */ CARD('u(?=[\\.\\-\\|])', 'md-parent'),
  /* 72 */ R('\\.\\.', { tok: 'LINE', v: 'non' }),
  /* 73 */ R('--', { tok: 'LINE', v: 'id' }),
  /* 74 */ R('to\\b', { tok: 'LINE', v: 'id' }),
  /* 75 */ R('optionally to\\b', { tok: 'LINE', v: 'non' }),
  /* 76 */ R('\\.-', { tok: 'LINE', v: 'non' }),
  /* 77 */ R('-\\.', { tok: 'LINE', v: 'non' }),
  /* 78 */ R('(?:[^\\x00-\\x7F]|\\w|-|\\*)+', { tok: 'STEXT' }),
  /* 79 */ R(';', { tok: 'SEMI' }),
  /* 80 */ R('(?:[^\\x00-\\x7F]|\\w|-|\\*|\\.)+', { tok: 'TEXT' }),
  /* 81 */ R('.', { tok: 'CHAR' }),
];

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CONDITIONS: Readonly<Record<string, readonly number[]>> = {
  style: [36, 37, 38, 39, 40, 78, 79],
  acc_descr_multiline: [5, 6],
  acc_descr: [3],
  acc_title: [1],
  block_bq: [27, 28],
  block: [22, 23, 24, 25, 26, 29, 30, 31, 32],
  INITIAL: [0, 2, 4, ...range(7, 21), 33, 34, 35, ...range(41, 77), 80, 81],
};

/** Every token of the prepared source, and the offsets of the characters no rule reads (Mermaid fails on them). */
function lex(src: string): { toks: Tok[]; bad: number[] } {
  const toks: Tok[] = [], bad: number[] = [];
  const stack = ['INITIAL'];
  const L = new LineScan(src), budget = new LexBudget(src.length);
  let pos = 0;
  while (pos < src.length) {
    const cond = stack[stack.length - 1]!;
    const hit = firstMatch(RULES, CONDITIONS[cond] ?? CONDITIONS['INITIAL']!, src, pos, L, budget);
    if (!hit) {
      bad.push(pos++);
      continue;
    }
    const { m, act } = hit;
    if (act.pop && stack.length > 1) stack.pop();
    if (act.begin) stack.push(act.begin);
    if (act.tok) toks.push({ t: act.tok, v: act.v ?? m, s: pos, e: pos + m.length });
    // an empty match that changes nothing would read the same place forever
    if (!m.length && !act.pop && !act.begin) {
      bad.push(pos++);
      continue;
    }
    pos += m.length;
  }
  toks.push({ t: 'EOF', v: '', s: src.length, e: src.length });
  return { toks, bad };
}

// ---- ids written back ---------------------------------------------------------------------------------------------

export { erId, erLabel, erQuoted, isErWord } from './er-id.js';

/** The tokens Mermaid's lexer reads in one line of code (for tests of the writers' quoting). */
export const lexLine = (line: string): { t: string; text: string }[] => lex(`${line}\n`).toks.filter((t) => t.t !== 'NL' && t.t !== 'EOF').map((t) => ({ t: t.t, text: line.slice(t.s, t.e) }));

// ---- grammar ------------------------------------------------------------------------------------------------------

const NAME_TOKENS = new Set(['TEXT', 'NUM', 'ENTITY_NAME', 'DECIMAL', 'ENTITY_ONE']);
/** A label as Mermaid shows it: entity codes decoded, `<br>` as a line break, control characters out. */
const textOf = labelText;
const unquote = unquotePair;

interface OpenGroup {
  g: ErGroup;
  members: string[];
}

/** Never throws: a source past the lexer's limits gives an empty model with `doc.too-complex`. */
export function parseER(code: string): ErModel {
  return guardParse(emptyEr, () => readER(code));
}

function readER(code: string): ErModel {
  const model = emptyEr();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const orig = (typeof code === 'string' ? code : '') + '\n';
  const { src, front } = prepareSource(typeof code === 'string' ? code : '');
  const lineAt = lineIndex(src), starts = lineAt.starts;
  const raw = (t: Tok): string => orig.slice(t.s, t.e);
  const { toks, bad } = lex(src);
  const badLines = new Set<number>();
  for (const at of bad) {
    const li = lineAt(at);
    if (badLines.has(li)) continue;
    badLines.add(li);
    D.push(diag('error', 'er.cannot-parse', `Mermaid cannot read "${orig[at]}" here`, li));
  }

  // ---- frontmatter: the title
  const fm = frontmatterValues(front);
  const fmTitle = fm.get('title');
  if (fmTitle) model.title = textOf(fmTitle);

  let i = 0;
  const peek = (k = 0): Tok => toks[Math.min(i + k, toks.length - 1)]!;
  const take = (): Tok => toks[Math.min(i++, toks.length - 1)]!;
  const is = (t: string, k = 0): boolean => peek(k).t === t;
  let reported = -1;
  const syntax = (tok: Tok, msg: string): void => {
    const li = lineAt(tok.s);
    if (li === reported || badLines.has(li)) return;
    reported = li;
    D.push(diag('error', 'er.cannot-parse', `Mermaid cannot read this line of the ER diagram: ${msg}`, li));
  };
  /** Skips to the next line (the next newline token; a block in between goes with it). */
  const recover = (): void => {
    while (!is('EOF') && !is('NL')) take();
  };

  const relCount = new Map<string, number>();
  /** The ends of each relationship that named no closed subgraph when it was read. */
  const early = new Map<ErRel, string[]>();
  const open: OpenGroup[] = [];
  const closed: ErGroup[] = [];
  /** Members already claimed by a closed subgraph (Mermaid's makeUniq). */
  const claimed = new Set<string>();
  const parentOf = new Map<string, string>();

  const touch = (id: string, li: number, alias?: string): Entity | null => {
    let e = model.entities.get(id);
    if (!e) {
      if (!budget.take(li)) return null;
      e = { id, label: id, attrs: [], order: model.entities.size, lines: new Set(), classes: [], style: {}, parent: null, stmts: [] };
      model.entities.set(id, e);
    }
    if (alias !== undefined && e.alias === undefined && alias) {
      e.alias = alias;
      e.label = alias;
    }
    return e;
  };
  const mark = (e: Entity, from: number, to: number): void => {
    for (let li = lineAt(from); li <= lineAt(Math.max(from, to - 1)); li++) e.lines.add(li);
  };
  const useClass = (cls: string, li: number): void => {
    if (!Object.hasOwn(model.classDefs, cls) && !model.undefinedClasses.some((u) => u.cls === cls)) model.undefinedClasses.push({ cls, line: li });
  };
  const groupNow = (id: string): ErGroup | undefined => closed.find((g) => g.id === id);
  const setClass = (ids: readonly string[], classes: readonly string[], li: number): void => {
    for (const id of ids) {
      const x = model.entities.get(id) ?? groupNow(id);
      if (!x) continue;
      for (const c of classes) {
        x.classes.push(c);
        useClass(c, li);
      }
    }
  };
  const addStyle = (ids: readonly string[], st: MermaidStyle): void => {
    for (const id of ids) {
      const x = model.entities.get(id) ?? groupNow(id);
      if (x) Object.assign(x.style, st);
    }
  };

  /** An entity name: a word, a number or a quoted name (its quotes dropped). */
  const name = (): Tok | null => (NAME_TOKENS.has(peek().t) ? take() : null);
  const nameOf = (t: Tok): string => (t.t === 'ENTITY_NAME' ? unquote(raw(t)) : raw(t));
  /** `a,b,c` after `:::` or `class`. */
  const idList = (tok = 'TEXT'): string[] | null => {
    if (!is(tok)) return null;
    const out = [raw(take())];
    while (is('COMMA') && is(tok, 1)) {
      take();
      out.push(raw(take()));
    }
    return out;
  };
  /** `:::a,b` after a name, if any (null: `:::` without a class). */
  const classesAfter = (): string[] | null | undefined => {
    if (!is('SEP')) return undefined;
    take();
    return idList();
  };
  /** The styles of `style` / `classDef` up to the line's end (or `;`), as written. */
  const styles = (): { text: string; ok: boolean } => {
    const first = peek();
    let last: Tok | null = null;
    while (['STEXT', 'COLON', 'COMMA', 'BRKT'].includes(peek().t)) last = take();
    const ok = !!last && (is('NL') || is('SEMI') || is('EOF'));
    if (is('SEMI')) take();
    return { text: last ? orig.slice(first.s, last.e) : '', ok };
  };

  /** The attributes of a block, up to its `}` (a bad one is reported and the block goes on at the next line). */
  const attributes = (e: Entity | null): Tok | null => {
    while (!is('BLOCK_STOP')) {
      if (is('EOF') || is('NL')) return null;
      const t0 = peek();
      const at = lineAt(t0.s);
      const fail = (msg: string): void => {
        if (!badLines.has(at)) D.push(diag('error', 'er.bad-attribute', `Mermaid cannot read the attribute "${orig.slice(starts[at]!, (starts[at + 1] ?? src.length) - 1).trim()}": ${msg}`, at));
        while (!is('BLOCK_STOP') && !is('EOF') && lineAt(peek().s) === at) take();
      };
      if (!is('AWORD')) {
        fail('it must start with a type');
        continue;
      }
      let type = raw(take());
      if (is('CHAR') && peek().v === '?') {
        take();
        type += '?';
      }
      if (!is('AWORD')) {
        fail(is('KEY') ? 'it needs a name before its keys' : 'it needs a type and a name');
        continue;
      }
      const nm = raw(take());
      const keys: AttrKey[] = [];
      if (is('KEY')) {
        keys.push(raw(take()).toUpperCase() as AttrKey);
        while (is('CHAR') && peek().v === ',' && is('KEY', 1)) {
          take();
          keys.push(raw(take()).toUpperCase() as AttrKey);
        }
      }
      const comment = is('COMMENT') ? unquote(raw(take())) : '';
      e?.attrs.push({ type, name: nm, keys, comment });
    }
    return take();
  };

  /** A relationship after its first name (and its classes): cardinality, line, cardinality, name, `: label`. */
  const relationship = (a: Tok, aClasses: string[] | undefined): string[] => {
    const li = lineAt(a.s);
    const aName = nameOf(a);
    const c1 = take();
    if (!is('LINE')) {
      syntax(c1, 'a relationship needs "--", "..", "to" or "optionally to" between its cardinalities');
      recover();
      return [];
    }
    const ln = take();
    if (!is('CARD')) {
      syntax(ln, 'a relationship needs a cardinality on both sides');
      recover();
      return [];
    }
    const c2 = take();
    const b = name();
    if (!b) {
      syntax(c2, 'a relationship needs an entity on both sides');
      recover();
      return [];
    }
    const bClasses = classesAfter();
    if (bClasses === null) {
      syntax(b, 'a class name must follow ":::"');
      recover();
      return [];
    }
    let label = '', labelTok: Tok | null = null, end = bClasses ? peek(-1).e : b.e;
    if (is('COLON')) {
      const colon = take();
      if (is('WORD') || is('ENTITY_NAME') || is('TEXT')) {
        labelTok = take();
        label = textOf(labelTok.t === 'TEXT' ? raw(labelTok) : unquote(raw(labelTok)));
        end = labelTok.e;
      } else {
        syntax(colon, 'the label after ":" must be one word or a quoted text');
        recover();
        return [];
      }
    } else {
      const at = end;
      D.push(diag('error', 'er.rel-label', 'Mermaid needs a label after a relationship (": label", or ": \\"\\"" for none)', li, {
        fix: { title: 'Add an empty label', apply: (c: string) => c.slice(0, at) + ' : ""' + c.slice(at) },
      }));
    }
    const bName = nameOf(b);
    const ea = touch(aName, li), eb = touch(bName, li);
    if (!ea || !eb || !budget.take(li)) return [aName, bName];
    mark(ea, a.s, end);
    mark(eb, a.s, end);
    if (aClasses) setClass([aName], aClasses, li);
    if (bClasses) setClass([bName], bClasses, li);
    const key = `${aName}--${bName}`;
    const n = (relCount.get(key) ?? 0) + 1;
    relCount.set(key, n);
    for (const c of [c1, c2])
      if (c.v === 'md-parent') D.push(diag('info', 'er.md-parent', 'Mermaid\'s "u" cardinality has no marker of its own: mmdx draws it as exactly one', li));
    const card = (c: Tok): Cardinality => (c.v === 'md-parent' ? 'one' : (c.v as Cardinality));
    const rel: ErRel = {
      id: n > 1 ? `${key}#${n}` : key, from: aName, to: bName, fromCard: card(c1), toCard: card(c2), identifying: ln.v === 'id', label, src: li,
      start: a.s, end, fromAt: [a.s, a.e], toAt: [b.s, b.e], fromCardAt: [c1.s, c1.e], lineAt: [ln.s, ln.e], toCardAt: [c2.s, c2.e],
    };
    if (labelTok) rel.labelAt = [labelTok.s, labelTok.e];
    model.rels.push(rel);
    early.set(rel, [aName, bName].filter((x) => !groupNow(x)));
    return [aName, bName];
  };

  /** An entity statement or a relationship, from its first name. Returns the names it gives its subgraph. */
  const entityStatement = (a: Tok): string[] => {
    const li = lineAt(a.s);
    const aName = nameOf(a);
    const aClasses = classesAfter();
    if (aClasses === null) {
      syntax(a, 'a class name must follow ":::"');
      recover();
      return [];
    }
    if (is('CARD')) return relationship(a, aClasses);
    // ---- an entity: `A`, `A[Alias]`, `:::classes`, a block
    let alias: string | undefined, aliasAt: [number, number] | undefined;
    let classes = aClasses;
    if (is('SQS') && !aClasses) {
      const sqs = take();
      const al = name();
      if (!al || !is('SQE')) {
        syntax(a, 'an alias is one word or a quoted text in square brackets');
        recover();
        return [];
      }
      const sqe = take();
      aliasAt = [sqs.s, sqe.e];
      // a markdown string's backticks (`"`**x**`"`) are not part of the text
      alias = textOf(nameOf(al).replace(/^`([\s\S]*)`$/, '$1'));
      const c = classesAfter();
      if (c === null) {
        syntax(a, 'a class name must follow ":::"');
        recover();
        return [];
      }
      classes = c;
      // an alias on a relationship line: Mermaid fails; mmdx reads both, the fix gives the alias its own line
      if (is('CARD')) {
        const lineStart = starts[li]!, from = a.e, to = sqe.e;
        const decl = orig.slice(a.s, to);
        D.push(diag('error', 'er.rel-alias', 'Mermaid has no alias on a relationship line: declare it on its own line', li, {
          fix: {
            title: 'Move the alias to its own line',
            apply: (c: string) => {
              const indent = /^[^\S\n]*/.exec(c.slice(lineStart))?.[0] ?? '';
              return c.slice(0, lineStart) + indent + decl + '\n' + c.slice(lineStart, from) + c.slice(to);
            },
          },
        }));
        touch(aName, li, alias);
        return relationship(a, classes);
      }
    }
    const e = touch(aName, li, alias);
    let end = peek(-1).e, endLine = li, block = false, blockAt: [number, number] | undefined;
    if (is('BLOCK_START')) {
      const brace = take();
      block = true;
      const stop = attributes(e);
      if (!stop) {
        syntax(a, `the block of "${aName}" has no closing "}"`);
        return [aName];
      }
      end = stop.e;
      endLine = lineAt(stop.s);
      blockAt = [brace.s, stop.e];
      if (e) {
        e.defLine = li;
        e.endLine = endLine;
      }
    }
    if (!e) return [aName];
    mark(e, a.s, end);
    const stmt: ErEntityStmt = { line: li, endLine, start: a.s, end, block, nameAt: [a.s, a.e] };
    if (aliasAt) stmt.aliasAt = aliasAt;
    if (blockAt) stmt.blockAt = blockAt;
    e.stmts.push(stmt);
    if (classes) setClass([aName], classes, li);
    return [aName];
  };

  /** One statement; the names it gives the subgraph it is in. */
  const statement = (): string[] => {
    const t = peek();
    const li = lineAt(t.s);
    switch (t.t) {
      case 'NL':
        take();
        return [];
      case 'ACC_TITLE':
      case 'ACC_DESCR': {
        take();
        const v = is('ACC_VALUE') ? textOf(raw(take()).trim()) : '';
        if (t.t === 'ACC_TITLE') model.accTitle = v;
        else model.accDescr = v;
        return [];
      }
      case 'ACC_DESCR_BLOCK':
        take();
        // Mermaid drops the indentation after a line break
        model.accDescr = textOf(raw(t).trim().replace(/\n\s+/g, '\n'));
        return [];
      case 'DIR': {
        take();
        if (open.length) open[open.length - 1]!.g.dir = t.v as Direction;
        else {
          model.direction = t.v as Direction;
          model.dirLine = li;
        }
        return [];
      }
      case 'CLASSDEF':
      case 'STYLE': {
        take();
        const ids = idList('STEXT');
        const st = ids ? styles() : { text: '', ok: false };
        if (!ids || !st.ok) {
          syntax(t, t.t === 'STYLE' ? 'write "style id property:value,…"' : 'write "classDef name property:value,…"');
          recover();
          return [];
        }
        const parsed = parseStyleList(st.text, (msg) => D.push(diag('warning', 'er.bad-style', msg, li)));
        if (t.t === 'STYLE') addStyle(ids, parsed);
        else for (const id of ids) model.classDefs[id] = { ...(model.classDefs[id] ?? {}), ...parsed };
        return [];
      }
      case 'CLASS': {
        take();
        const ids = idList();
        const classes = ids ? idList() : null;
        if (!ids || !classes) {
          syntax(t, 'write "class id1,id2 className"');
          recover();
          return [];
        }
        setClass(ids, classes, li);
        return [];
      }
      case 'SUBGRAPH': {
        take();
        const id = name();
        if (!id) {
          syntax(t, 'a subgraph needs an id');
          recover();
          return [];
        }
        let label = nameOf(id), headEnd = id.e;
        if (is('SQS')) {
          take();
          const words: string[] = [];
          for (let w = name(); w; w = name()) words.push(nameOf(w));
          if (!words.length || !is('SQE')) {
            syntax(t, 'a subgraph title is words or a quoted text in square brackets');
            recover();
            return [];
          }
          headEnd = take().e;
          label = words.join(' ');
        }
        if (!is('NL') && !is('EOF')) {
          syntax(t, 'the subgraph header must end its line');
          recover();
          return [];
        }
        if (!budget.take(li)) {
          recover();
          return [];
        }
        const g: ErGroup = {
          id: nameOf(id), label: textOf(label).trim(), parent: null, children: [], order: model.groups.size + open.length, line: li,
          start: t.s, end: src.length, idAt: [id.s, id.e], headEnd, lines: new Set([li]), classes: [], style: {},
        };
        open.push({ g, members: [] });
        return [];
      }
      case 'END': {
        take();
        const top = open.pop();
        if (!top) {
          syntax(t, '"end" closes no subgraph');
          return [];
        }
        top.g.endLine = lineAt(t.s);
        top.g.end = t.s + raw(t).trimEnd().length;
        top.g.lines.add(top.g.endLine);
        close(top);
        return [top.g.id];
      }
      default: {
        if (NAME_TOKENS.has(t.t)) {
          // `title …`: Mermaid reads its words as entities; mmdx takes it as the diagram's title (with a fix)
          if (t.t === 'TEXT' && /^title$/i.test(raw(t)) && lineAt(peek(1).s) === li && ['TEXT', 'NUM', 'DECIMAL', 'ENTITY_ONE', 'ENTITY_NAME', 'WORD', 'CHAR', 'COMMA', 'COLON'].includes(peek(1).t)) {
            const lineEnd = (starts[li + 1] ?? src.length) - 1;
            model.title = textOf(orig.slice(t.e, lineEnd).trim());
            D.push(diag('warning', 'er.title-statement', 'Mermaid reads the words of a `title` statement as entities in an ER diagram — the frontmatter\'s `title:` is the portable form', li, {
              fix: { title: 'Move to the frontmatter', apply: (c: string) => titleToFrontmatter(c, li) },
            }));
            while (!is('EOF') && !is('NL')) take();
            return [];
          }
          return entityStatement(take());
        }
        if (t.t === 'EOF') return [];
        syntax(t, `unexpected "${raw(t).trim() || t.t}"`);
        take();
        recover();
        return [];
      }
    }
  };

  /** A subgraph closes: its members (unique, not claimed by a subgraph closed before) and its `direction`. */
  const close = (top: OpenGroup): void => {
    const g = top.g;
    const seen = new Set<string>();
    for (const m of top.members) {
      const id = m.trim();
      if (!id || seen.has(id) || claimed.has(id) || id === g.id) continue;
      seen.add(id);
      g.children.push(id);
    }
    for (const c of g.children) claimed.add(c);
    const prev = model.groups.get(g.id);
    if (prev) {
      // the same id again: one subgraph, its members added
      for (const c of g.children) if (!prev.children.includes(c)) prev.children.push(c);
      prev.lines = new Set([...prev.lines, ...g.lines]);
      if (g.dir) prev.dir = g.dir;
    } else {
      model.groups.set(g.id, g);
      closed.push(g);
    }
    if (open.length) open[open.length - 1]!.members.push(g.id);
  };

  // ---- the header, then the statements
  while (is('NL')) take();
  if (is('ER')) model.headerLine = lineAt(take().s);
  else {
    D.push(diag('error', 'er.header', 'The "erDiagram" header is missing'));
  }
  while (!is('EOF') && !budget.over) {
    const names = statement();
    if (open.length) open[open.length - 1]!.members.push(...names);
  }
  for (let k = open.length - 1; k >= 0; k--) {
    const top = open[k]!;
    D.push(diag('error', 'er.unclosed', `The subgraph "${top.g.id}" has no "end"`, top.g.line, { params: { id: top.g.id } }));
    top.g.lines.add(lineAt(src.length - 1));
    open.length = k;
    close(top);
  }

  // ---- members: an entity (or subgraph) is in the first subgraph to close that names it
  for (const g of model.groups.values())
    for (const c of g.children) if (!parentOf.has(c)) parentOf.set(c, g.id);
  for (const g of model.groups.values()) {
    const p = parentOf.get(g.id);
    // no cycles (a subgraph named as a member of one it holds)
    let ok = !!p;
    for (let q = p, n = 0; ok && q && n <= model.groups.size; q = parentOf.get(q), n++) if (q === g.id) ok = false;
    g.parent = ok ? p! : null;
  }
  for (const g of model.groups.values()) g.children = g.children.filter((c) => (model.entities.has(c) || model.groups.has(c)) && parentOf.get(c) === g.id && (!model.groups.has(c) || model.groups.get(c)!.parent === g.id));
  // a relationship names a subgraph only after the subgraph's `end` (Mermaid links it to a table of that id before,
  // which it does not draw); mmdx draws it to the subgraph
  for (const [r, ends] of early)
    for (const id of ends)
      if (model.groups.has(id))
        D.push(diag('warning', 'er.subgraph-later', `Mermaid links "${id}" to the subgraph only in relationships after its "end"`, r.src, { params: { id } }));
  // a subgraph's id names the subgraph: an entity of that id is not drawn (Mermaid skips it)
  for (const id of model.groups.keys()) {
    const e = model.entities.get(id);
    if (!e) continue;
    if (e.attrs.length || e.alias) D.push(diag('warning', 'er.id-clash', `"${id}" is a subgraph and an entity: Mermaid draws only the subgraph`, e.defLine ?? minOf(e.lines), { params: { id } }));
    model.entities.delete(id);
  }
  let order = 0;
  for (const e of model.entities.values()) {
    e.order = order++;
    const p = parentOf.get(e.id);
    e.parent = p && model.groups.has(p) ? p : null;
  }
  // subgraphs in code order (they were added as they closed: inner ones first)
  const byLine = [...model.groups.values()].sort((a, b) => a.line - b.line);
  model.groups = new Map(byLine.map((g, k) => {
    g.order = k;
    return [g.id, g];
  }));
  // classes that have a classDef after all (a classDef may follow its use)
  model.undefinedClasses = model.undefinedClasses.filter((u) => !Object.hasOwn(model.classDefs, u.cls));
  return model;
}
