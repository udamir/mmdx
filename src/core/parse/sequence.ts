// Mermaid sequenceDiagram parser (A.9, T11.1). Line by line, each statement read the way Mermaid's jison lexer reads it
// (sequenceDiagram.jison at 11.17.2 and 12.2.0, whose compiled rules are in node_modules/mermaid*/dist/chunks): a
// participant id, an alias, a `@{…}` block, a message's two actors, its arrow (26 tokens, in the lexer's order — the
// first that matches wins), its `+` / `-` / `()` markers and its text. The ops read lines through the same scans
// (`lexMessage`, `lexDecl`), so what they rewrite is exactly what the parser read.
//
// items: message | note | blockStart | blockElse | blockEnd | activate | deactivate. Besides the items: participants
// and boxes, the `autonumber` statements (`numbering`, applied by line), `title`, `accTitle` / `accDescr`, and per
// participant its `create` / `destroy` messages, its `link` / `links` menu and its `properties`.
//
// Mermaid 12.1 syntax that 11.17 rejects (whitespace before `@{`, a hyphen in an id with `@{}`, `Link` / `Links` /
// `Properties` / `Details` as ids) is read and reported with the info `seq.v12-syntax`; mmdx never writes it.
//
// T10.2: a participant's type is Mermaid's — `@{ "type": "…" }` (one of the 8 types; it outranks the `actor` keyword,
// as in Mermaid's SequenceDB) else the keyword — read into its shape (`participant` → `box`); a type Mermaid does not
// draw warns `seq.bad-type`. Its `properties` icon (`{"icon": "https://…"}`, Mermaid's undocumented corner image) is
// the participant's image unless its metadata has one (render/sequence.ts).
import type {
  BlockKind, MessageHead, Participant, SeqBlockStart, SeqBox, SeqItem, SeqLink, SeqMessage, SeqNumbering, SequenceModel,
} from '../model.js';
import { diag } from '../types.js';
import { isColorLiteral } from '../validate.js';
import { cleanLabel } from './label.js';
import { readAccDescrBlock } from './acc-descr.js';
import { frontmatterAt, frontmatterValues } from './frontmatter.js';
import { guardParse, ItemBudget, stripControl } from './limits.js';
import { readNodeData, type NodeDataBlock } from './node-data.js';

// ---- arrows ---------------------------------------------------------------------------------------------------

/** What an arrow token draws. */
export interface ArrowKind {
  line: 'solid' | 'dotted';
  head: MessageHead;
  both?: true;
  half?: 'top' | 'bottom';
  stick?: true;
  reverse?: true;
}

const K = (line: 'solid' | 'dotted', head: MessageHead, more: Omit<ArrowKind, 'line' | 'head'> = {}): ArrowKind => ({ line, head, ...more });

/**
 * Mermaid's arrow tokens in its lexer's order (rules 61–86 at 11.17.2; 12.2 has the same): the first one that matches at
 * a position is the arrow, so `-->>` is never read as `-->` and `--|\` never as `--`. `x` is matched in either case.
 */
export const ARROW_KINDS: readonly (readonly [string, ArrowKind])[] = [
  ['->>', K('solid', 'arrow')], ['<<->>', K('solid', 'arrow', { both: true })],
  ['-->>', K('dotted', 'arrow')], ['<<-->>', K('dotted', 'arrow', { both: true })],
  ['->', K('solid', 'open')], ['-->', K('dotted', 'open')],
  ['-x', K('solid', 'cross')], ['--x', K('dotted', 'cross')],
  ['-)', K('solid', 'async')], ['--)', K('dotted', 'async')],
  // half heads (11.17+): `|` a filled half, a doubled stroke a stick; `\` above the line, `/` below; written before
  // the line (`/|-`) the head is at the sender's end
  ['--|\\', K('dotted', 'arrow', { half: 'top' })], ['--|/', K('dotted', 'arrow', { half: 'bottom' })],
  ['--\\\\', K('dotted', 'arrow', { half: 'top', stick: true })], ['--//', K('dotted', 'arrow', { half: 'bottom', stick: true })],
  ['/|--', K('dotted', 'arrow', { half: 'top', reverse: true })], ['\\|--', K('dotted', 'arrow', { half: 'bottom', reverse: true })],
  ['//--', K('dotted', 'arrow', { half: 'top', stick: true, reverse: true })], ['\\\\--', K('dotted', 'arrow', { half: 'bottom', stick: true, reverse: true })],
  ['-|\\', K('solid', 'arrow', { half: 'top' })], ['-|/', K('solid', 'arrow', { half: 'bottom' })],
  ['-\\\\', K('solid', 'arrow', { half: 'top', stick: true })], ['-//', K('solid', 'arrow', { half: 'bottom', stick: true })],
  ['/|-', K('solid', 'arrow', { half: 'top', reverse: true })], ['\\|-', K('solid', 'arrow', { half: 'bottom', reverse: true })],
  ['//-', K('solid', 'arrow', { half: 'top', stick: true, reverse: true })], ['\\\\-', K('solid', 'arrow', { half: 'bottom', stick: true, reverse: true })],
];
const KIND_OF = new Map(ARROW_KINDS);

/** What arrow token `a` draws (undefined: not an arrow). */
export const arrowKind = (a: string): ArrowKind | undefined => KIND_OF.get(a.toLowerCase());

/** The arrow token at `s[i]`, else null. */
function arrowAt(s: string, i: number): string | null {
  for (const [a] of ARROW_KINDS) if (s.slice(i, i + a.length).toLowerCase() === a) return s.slice(i, i + a.length);
  return null;
}

// Mermaid's ACTOR token in a statement (rule 60, unchanged in 12.2): no `/ \ + ( ) < - > : , ;` in its first run, then
// runs of hyphens and other characters as long as no arrow, `--` or `()` starts there. It never fails after its first
// character, so it never backtracks; sticky, it reads at a given index.
const ACTOR = /[^/\\+()<\->:\n,;]+((?!(-x|--x|-\)|--\)|-\|\\|-\\|-\/|-\/\/|-\|\/|\/\|-|\\\|-|\/\/-|\\\\-|\/\|-|--\|\\|--|\(\)))[-]*[^+<\->:\n,;]+)*/iy;

/** The actor at `s[i]` (trimmed, with its end), else null. */
function actorAt(s: string, i: number): { id: string; at: number; end: number } | null {
  ACTOR.lastIndex = i;
  const m = ACTOR.exec(s);
  if (!m) return null;
  const raw = m[0];
  const lead = raw.length - raw.trimStart().length;
  const id = raw.trim();
  return id ? { id, at: i + lead, end: i + lead + id.length } : null;
}

const skipWs = (s: string, i: number): number => {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r')) i++;
  return i;
};

/** A message line as Mermaid's lexer splits it, with offsets in the line. */
export interface MessageLex {
  from: string;
  fromAt: number;
  fromEnd: number;
  /** `()` before the arrow (a central connection at the sender). */
  fromCentral: boolean;
  arrow: string;
  arrowAt: number;
  /** `+` / `-` after the arrow ('' none). */
  act: '' | '+' | '-';
  /** Where the marker is (the `+` / `-`, or `()` before the target), -1 without one. */
  markAt: number;
  /** `()` before the target (a central connection at the receiver). */
  toCentral: boolean;
  to: string;
  toAt: number;
  toEnd: number;
  /** Index of the `:` that starts the text. */
  colon: number;
}

/**
 * A message statement (`from [()] arrow [+|-|()] to : text`) as Mermaid's lexer reads it, or null. Mermaid's grammar
 * has no `()` together with `+` / `-`, and a message always has a `:` (its text may be empty).
 */
export function lexMessage(line: string): MessageLex | null {
  let i = skipWs(line, 0);
  const a = actorAt(line, i);
  if (!a) return null;
  i = skipWs(line, a.end);
  const fromCentral = line.startsWith('()', i);
  if (fromCentral) i = skipWs(line, i + 2);
  const arrowStart = i;
  const arrow = arrowAt(line, i);
  if (!arrow) return null;
  i = skipWs(line, i + arrow.length);
  let act: '' | '+' | '-' = '', markAt = -1, toCentral = false;
  if (line[i] === '+' || line[i] === '-') {
    act = line[i] as '+' | '-';
    markAt = i;
    i = skipWs(line, i + 1);
  } else if (line.startsWith('()', i)) {
    toCentral = true;
    markAt = i;
    i = skipWs(line, i + 2);
  }
  if (fromCentral && act) return null;
  const b = actorAt(line, i);
  if (!b) return null;
  i = skipWs(line, b.end);
  if (line[i] !== ':') return null;
  return {
    from: a.id, fromAt: a.at, fromEnd: a.end, fromCentral, arrow, arrowAt: arrowStart, act, markAt, toCentral, to: b.id, toAt: b.at, toEnd: b.end, colon: i,
  };
}

export interface RawMessage { from: string; arrow: string; act: string; to: string; text: string; central?: 'to' | 'from' | 'both' }
/** One trimmed line as a message (`from arrow [+|-] to : text`), or null. The ops read lines through it too. */
export function splitMessage(t: string): RawMessage | null {
  const x = lexMessage(t);
  if (!x) return null;
  const out: RawMessage = { from: x.from, arrow: x.arrow, act: x.act, to: x.to, text: t.slice(x.colon + 1) };
  if (x.fromCentral || x.toCentral) out.central = x.fromCentral && x.toCentral ? 'both' : x.fromCentral ? 'from' : 'to';
  return out;
}

// ---- participant declarations ----------------------------------------------------------------------------------

/** A `participant` / `actor` declaration as Mermaid's lexer reads it (its ID, CONFIG and ALIAS states), with offsets. */
export interface DeclLex {
  create: boolean;
  word: 'participant' | 'actor';
  id: string;
  idAt: number;
  idEnd: number;
  /** The `@{…}` block: `@` at `dataAt`, after its `}` at `dataEnd`; its entries as Mermaid's YAML reader reads them. */
  dataAt?: number;
  dataEnd?: number;
  data?: NodeDataBlock | null;
  /** ` as Alias`: from the space before `as` (`asAt`), the alias text from `aliasAt` to the line's end (trailing spaces left out). */
  asAt?: number;
  aliasAt?: number;
  alias?: string;
  /** What only Mermaid 12.1+ reads in this line ('' none): whitespace before `@{`, a hyphen or `=` in an id with `@{}`. */
  v12: string;
}

const DECL = /^(\s*)(create\s+)?(participant|actor)\b/i;
// the ID state's rules: an id before `@{` (12.2: whitespace allowed in between, hyphens in the id; 11.17: neither),
// an id before ` as `, an id up to the end of the statement
const ID_DATA = /[^<>:\n,;@\s]+(?=\s*@\{)/y;
const ID_AS = /[^<>:\n,;@\s]+(?=\s+as\s)/iy;
const ID_END = /[^<>:\n,;@]+$/y;
const AS = /\s+as\s/iy;

/** A declaration line, or null (not one, or one Mermaid's lexer rejects). */
export function lexDecl(line: string): DeclLex | null {
  const m = DECL.exec(line);
  if (!m) return null;
  const word = (m[3] ?? '').toLowerCase() === 'actor' ? 'actor' : 'participant';
  const i = skipWs(line, m[0].length);
  const base = { create: !!m[2], word, v12: '' } as const;
  const asAlias = (from: number, out: DeclLex): DeclLex | null => {
    AS.lastIndex = from;
    if (!AS.exec(line)) return null;
    out.asAt = from;
    out.aliasAt = skipWs(line, AS.lastIndex);
    out.alias = line.slice(out.aliasAt).trim();
    return out;
  };
  ID_DATA.lastIndex = i;
  let r = ID_DATA.exec(line);
  if (r) {
    const id = r[0], idEnd = i + id.length;
    const at = line.indexOf('@{', idEnd);
    const close = line.indexOf('}', at + 2);
    if (close < 0) return null;
    const out: DeclLex = { ...base, id, idAt: i, idEnd, dataAt: at, dataEnd: close + 1, data: readNodeData(line, at + 1, 0), v12: '' };
    if (at > idEnd) out.v12 = 'whitespace before @{';
    else if (/[-=]/.test(id)) out.v12 = `"${id}" with @{…}`;
    const rest = line.slice(close + 1);
    if (!rest.trim()) return out;
    return asAlias(close + 1, out);
  }
  ID_AS.lastIndex = i;
  if ((r = ID_AS.exec(line))) return asAlias(i + r[0].length, { ...base, id: r[0], idAt: i, idEnd: i + r[0].length });
  ID_END.lastIndex = i;
  if ((r = ID_END.exec(line))) {
    const id = r[0].trim();
    return id ? { ...base, id, idAt: i, idEnd: i + id.length } : null;
  }
  return null;
}

// ---- participant types -----------------------------------------------------------------------------------------

/** Mermaid's participant types (`PARTICIPANT_TYPE` in its SequenceDB, 11.17 and 12.2), in the toolbar's order. */
export const PARTICIPANT_TYPES = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];
const TYPES = new Set<string>(PARTICIPANT_TYPES);

/** The shape a Mermaid type is drawn with (its own name; `participant` is the box). */
export const typeShape = (type: ParticipantType): string => (type === 'participant' ? 'box' : type);

/**
 * The Mermaid type that writes a participant shape (`box` → `participant`; `hcyl`, the queue's look, → `queue`), or
 * null for the looks only mmdx draws (rounded, stadium: metadata `shape`).
 */
export function shapeType(shape: string): ParticipantType | null {
  if (shape === 'box') return 'participant';
  if (shape === 'hcyl') return 'queue';
  return shape !== 'participant' && TYPES.has(shape) ? (shape as ParticipantType) : null;
}

// ---- the parser ------------------------------------------------------------------------------------------------

const BLOCKS: readonly BlockKind[] = ['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect'];
const BLOCK = new RegExp(`^(${BLOCKS.join('|')})\\b\\s*(.*)$`);
const NUM = '(\\d+(?:\\.\\d{1,2})?|\\.\\d{1,2})';
const AUTONUMBER = new RegExp(`^autonumber(?:\\s+(off)|\\s+${NUM}(?:\\s+${NUM})?)?\\s*$`, 'i');
// `link`, `links`, `properties`, `details` start a statement when an actor follows (12.1); before that they were
// keywords wherever they stood, so 11.17 rejects them as ids outside a declaration
const ACTOR_DATA = /^(links?|properties|details)(?=[ \t]+[^/\\+()<>:\n,;\s-])\s+/i;
const DATA_WORD = /^(links?|properties|details)$/i;

export function emptySequence(): SequenceModel {
  return { type: 'sequence', participants: [], items: [], boxes: [], autonumber: false, numbering: [], title: '', diagnostics: [] };
}

/** `box` arguments: an optional leading colour, then the label. */
function boxColor(rest: string): { color: string | null; label: string; bad?: string } {
  let m = /^((?:rgba?|hsla?)\([^)]*\)?)\s*(.*)$/i.exec(rest) ?? /^(#[0-9a-fA-F]{3,8})(?=\s|$)\s*(.*)$/.exec(rest);
  if (m) {
    const c = m[1] ?? '';
    return isColorLiteral(c) ? { color: c, label: m[2] ?? '' } : { color: null, label: m[2] ?? '', bad: c };
  }
  // a first word that is not a colour is part of the label
  m = /^([a-zA-Z]+)(?=\s|$)\s*(.*)$/.exec(rest);
  if (m && isColorLiteral(m[1])) return { color: m[1] ?? null, label: m[2] ?? '' };
  return { color: null, label: rest };
}

/** Mermaid's text of `link` / `links` (its sanitizer leaves these two entities for the URLs). */
const linkText = (s: string): string => s.replace(/&equals;/g, '=').replace(/&amp;/g, '&');

/** Never throws: a statement past `MAX_STATEMENT_LENGTH` gives an empty model with `doc.too-complex`. */
export function parseSequence(code: string): SequenceModel {
  return guardParse(emptySequence, () => readSequence(code));
}

function readSequence(code: string): SequenceModel {
  const model = emptySequence();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const byId = new Map<string, Participant>();
  const blocks = new Map<string, SeqBlockStart>(); // block id -> start item, for else/end (linear, not items.find)
  let box: SeqBox | null = null;
  let mi = 0, ni = 0, bi = 0;
  const blockStack: string[] = [];
  let curLine = 0;
  // `create` / `destroy` wait for the next message, which must be to (from or to) the participant
  let creating: Participant | null = null, destroying: Participant | null = null;
  // ids only Mermaid 12.1 reads outside a declaration: reported once per line
  let v12Line = -1;
  const v12 = (what: string, li: number): void => {
    if (v12Line === li) return;
    v12Line = li;
    D.push(diag('info', 'seq.v12-syntax', `${what} is read by Mermaid 12.1 and later only (11.x rejects it)`, li));
  };

  const touch = (rawId: string, label?: string, kind: 'participant' | 'actor' = 'participant', decl = false): Participant | null => {
    const id = rawId.trim();
    let p = byId.get(id);
    if (!p) {
      if (!budget.take(curLine)) return null;
      p = { id, label: id, kind, box: box?.id ?? null, lines: new Set() };
      byId.set(id, p);
      model.participants.push(p);
      if (box) box.members.push(id);
    }
    if (label) p.label = cleanLabel(label);
    if (kind === 'actor') p.kind = 'actor';
    p.lines.add(curLine);
    if (!decl && DATA_WORD.test(id)) v12(`"${id}" as an id`, curLine);
    return p;
  };
  const push = (item: SeqItem): void => { if (budget.take(curLine)) model.items.push(item); };
  const cannot = (t: string, li: number): void => { D.push(diag('warning', 'seq.cannot-parse', `cannot parse "${t}"`, li)); };

  const lines = code.split('\n');
  // the frontmatter (`---` … `---` before anything else): its `title` is the diagram's unless a statement sets one;
  // the rest (`config:` …) is Mermaid's and not read here (B13)
  const front = frontmatterAt(lines);
  const fmTitle = front ? frontmatterValues(lines.slice(front.start + 1, front.end)).get('title') : undefined;
  for (let li = front ? front.end + 1 : 0; li < lines.length && !budget.over; li++) {
    curLine = li;
    const raw = lines[li] ?? '';
    const t = raw.trim();
    if (!t || t.startsWith('%%') || /^sequenceDiagram\b/.test(t)) continue;
    let m: RegExpExecArray | null;
    if (/^autonumber\b/i.test(t)) {
      if (!(m = AUTONUMBER.exec(t))) { cannot(t, li); continue; }
      const n: SeqNumbering = { line: li, on: !m[1] };
      if (m[2]) n.start = Number(m[2]);
      if (m[3]) n.step = Number(m[3]);
      model.numbering.push(n);
      if (n.on) model.autonumber = true;
      continue;
    }
    if ((m = /^title\s*:?\s*(.+)$/.exec(t))) { model.title = m[1] ?? ''; continue; }
    if ((m = /^accTitle\s*:\s*(.*)$/.exec(t))) { model.accTitle = stripControl(m[1] ?? '').trim(); continue; }
    if ((m = /^accDescr\s*:\s*(.*)$/.exec(t))) { model.accDescr = stripControl(m[1] ?? '').trim(); continue; }
    if ((m = /^accDescr\s*\{(.*)$/.exec(t))) {
      // `accDescr { … }`: the description runs over the lines up to the first `}`
      const r = readAccDescrBlock(m[1] ?? '', lines, li);
      model.accDescr = r.text;
      li = r.last;
      continue;
    }
    const decl = lexDecl(raw);
    if (decl) {
      if (decl.create && byId.has(decl.id))
        D.push(diag('warning', 'seq.create-existing', `"${decl.id}" exists before it is created (Mermaid rejects this)`, li));
      const data = decl.data?.entries ?? [];
      const val = (k: string): string | undefined => {
        const e = data.find((x) => x.key === k);
        return e && typeof e.value === 'string' ? e.value : undefined;
      };
      // Mermaid: the `as` alias, unless it repeats the id; else `@{ "alias": … }` (11.13+)
      const alias = decl.alias !== undefined && decl.alias !== decl.id ? decl.alias : val('alias') ?? decl.alias;
      const p = touch(decl.id, alias, decl.word, true);
      if (!p) continue;
      p.defLine = li;
      if (decl.create) {
        p.created = true;
        creating = p;
      }
      if (box && p.box !== box.id) { p.box = box.id; if (!box.members.includes(p.id)) box.members.push(p.id); }
      // Mermaid: the block's type outranks the keyword
      const typ = val('type');
      if (typ !== undefined && TYPES.has(typ)) p.shape = typeShape(typ as ParticipantType);
      else if (typ !== undefined) D.push(diag('warning', 'seq.bad-type', `"${typ}" is not a participant type (Mermaid draws nothing for it): ${PARTICIPANT_TYPES.join(', ')}`, li));
      if (decl.v12) v12(decl.v12, li);
      continue;
    }
    if (/^(create\s+)?(participant|actor)\b/i.test(t)) { cannot(t, li); continue; }
    if ((m = /^box\b\s*(.*)$/.exec(t))) {
      const { color, label, bad } = boxColor((m[1] ?? '').trim());
      if (bad !== undefined) D.push(diag('warning', 'seq.bad-color', `invalid color "${bad}" for box`, li));
      box = { id: `box${model.boxes.length + 1}`, color, label, members: [], line: li };
      model.boxes.push(box);
      continue;
    }
    if ((m = /^(activate|deactivate)\s+(.+)$/.exec(t))) {
      const who = (m[2] ?? '').trim();
      touch(who, undefined, 'participant', true);
      push({ kind: m[1] === 'activate' ? 'activate' : 'deactivate', who, src: li });
      continue;
    }
    if ((m = /^destroy\s+(.+)$/i.exec(t))) {
      const p = touch(m[1] ?? '', undefined, 'participant', true);
      if (p) destroying = p;
      continue;
    }
    // the targets start at a character that is not a space: `\s+` and the targets never compete for the same spaces
    if ((m = /^note\s+(left of|right of|over)\s+([^\s:][^:]*):(.*)$/i.exec(t))) {
      const targets = (m[2] ?? '').split(',').map((s) => s.trim());
      for (const x of targets) touch(x);
      const pos = (m[1] ?? '').toLowerCase() as 'left of' | 'right of' | 'over';
      push({ kind: 'note', id: `n${++ni}`, pos, targets, text: cleanLabel(m[3]), src: li });
      continue;
    }
    if ((m = ACTOR_DATA.exec(t))) {
      const word = (m[1] ?? '').toLowerCase();
      const rest = t.slice(m[0].length);
      const a = actorAt(rest, 0);
      const colon = a ? skipWs(rest, a.end) : -1;
      if (!a || rest[colon] !== ':') { cannot(t, li); continue; }
      const p = touch(a.id);
      if (!p) continue;
      const text = rest.slice(colon + 1).trim();
      const add = (label: string, url: string): void => {
        const list = (p.links ??= []);
        const old = list.find((l) => l.label === label);
        if (old) old.url = url;
        else list.push({ label, url });
      };
      if (word === 'link') {
        // `Label @ url`: Mermaid cuts the label one character before the `@`
        const s = linkText(text), sep = s.indexOf('@');
        if (sep > 0) add(s.slice(0, sep - 1).trim(), s.slice(sep + 1).trim());
      } else if (word === 'links' || word === 'properties') {
        let obj: unknown = null;
        try { obj = JSON.parse(word === 'links' ? linkText(text) : text); } catch { obj = null; }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          D.push(diag('warning', 'seq.bad-json', `${word} of "${p.id}": not a JSON object (Mermaid ignores it)`, li));
          continue;
        }
        if (word === 'links') {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === 'string') add(k, v);
        } else p.properties = { ...p.properties, ...(obj as Record<string, unknown>) };
      }
      // `details X: element-id` names an element of the host page (Mermaid reads its JSON from the DOM): kept, not read
      continue;
    }
    if ((m = BLOCK.exec(t))) {
      const kind = m[1] as BlockKind;
      const arg = m[2] ?? '';
      let color: string | null = null;
      if (kind === 'rect') {
        const c = arg.trim();
        if (isColorLiteral(c)) color = c;
        else if (c) D.push(diag('warning', 'seq.bad-color', `invalid color "${c}" for rect`, li));
      }
      const blk: SeqBlockStart = {
        kind: 'blockStart', id: `b${++bi}`, block: kind, label: kind === 'rect' ? '' : cleanLabel(arg), color, src: li, lines: [li],
      };
      if (!budget.take(li)) continue;
      blocks.set(blk.id, blk);
      blockStack.push(blk.id);
      model.items.push(blk);
      continue;
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(t))) {
      const bid = blockStack[blockStack.length - 1];
      if (bid === undefined) { cannot(t, li); continue; }
      blocks.get(bid)?.lines.push(li);
      push({ kind: 'blockElse', id: bid, label: cleanLabel(m[2]), src: li });
      continue;
    }
    if (t === 'end') {
      const bid = blockStack.pop();
      if (bid !== undefined) {
        blocks.get(bid)?.lines.push(li);
        push({ kind: 'blockEnd', id: bid, src: li });
      } else if (box) { box.endLine = li; box = null; }
      continue;
    }
    const msg = splitMessage(t);
    if (msg) {
      const { from, arrow, act, to } = msg;
      const kind = arrowKind(arrow)!;
      touch(from); touch(to);
      const it: SeqMessage = {
        kind: 'message', id: `m${++mi}`, from, to, text: cleanLabel(msg.text), arrow,
        line: kind.line, head: kind.head, both: !!kind.both, activate: act === '+', deactivate: act === '-', src: li,
      };
      if (kind.half) it.half = kind.half;
      if (kind.stick) it.stick = true;
      if (kind.reverse) it.reverse = true;
      if (msg.central) it.central = msg.central;
      push(it);
      // Mermaid: a created participant's first message after `create` is to it; a destroyed one's is from or to it
      if (creating) {
        if (to === creating.id) creating.createdBy = it.id;
        else D.push(diag('warning', 'seq.create-message', `the message after "create ${creating.id}" must be to ${creating.id} (Mermaid rejects this)`, li));
        creating = null;
      } else if (destroying) {
        if (to === destroying.id || from === destroying.id) destroying.destroyedBy = it.id;
        else D.push(diag('warning', 'seq.destroy-message', `the message after "destroy ${destroying.id}" must be from or to ${destroying.id} (Mermaid rejects this)`, li));
        destroying = null;
      }
      continue;
    }
    cannot(t, li);
  }
  if (fmTitle && !model.title) model.title = stripControl(fmTitle);
  return model;
}

/**
 * The number Mermaid draws by each message (absent: not numbered). The counter starts at 1 and steps by 1; every
 * message counts, numbered or not; an `autonumber` statement switches the numbers on (`off`: off) and sets the next
 * number and the step when it gives them (a 0 keeps the current one, as in Mermaid).
 */
export function messageNumbers(model: Pick<SequenceModel, 'items' | 'numbering'>): Map<string, number> {
  const out = new Map<string, number>();
  const N = model.numbering ?? [];
  if (!N.length) return out;
  let next = 1, step = 1, on = false, k = 0;
  for (const it of model.items) {
    if (it.kind !== 'message') continue;
    while (k < N.length && N[k]!.line < it.src) {
      const n = N[k++]!;
      next = n.start || next;
      step = n.step || step;
      on = n.on;
    }
    if (on) out.set(it.id, next);
    next = Math.round((next + step) * 100) / 100;
  }
  return out;
}

/** A participant's links as the viewer's menu shows them. */
export const participantLinks = (p: Pick<Participant, 'links'>): readonly SeqLink[] => p.links ?? [];
