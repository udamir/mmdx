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
import type { AttrKey, Cardinality, Direction, Entity, ErAttribute, ErEntityStmt, ErGroup, ErModel, ErRel, MermaidStyle } from '../../model.js';
import { diag, type Diagnostic } from '../../types.js';
import { frontmatterValues, titleToFrontmatter } from '../../parse/frontmatter.js';
import { guardParse, ItemBudget, LexBudget } from '../../parse/limits.js';
import { LineScan } from '../../parse/line-scan.js';
import { firstMatch, lexRule, prepareSource, type LexRule } from '../../parse/jison.js';
import { labelText, lineIndex, unquotePair, type LineIndex } from '../../parse/kit.js';
import { parseStyleList } from '../../parse/style.js';
import { minOf } from '../../geom.js';

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

// split, then trimmed: `\s*,\s*` backtracks quadratically on a long run of spaces without a comma (regex fuzz, X11)
const keysOf = (s: string | undefined): AttrKey[] => (s ? (s.split(',').map((k) => k.trim().toUpperCase()) as AttrKey[]) : []);

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

export { erId, erLabel, erQuoted, isErWord } from './parse-id.js';

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

/** The token cursor of a parse: the grammar looks one token ahead (two at most) and back at the one just read. */
class Cursor {
  i = 0;
  constructor(private readonly toks: readonly Tok[]) {}
  readonly peek = (k = 0): Tok => this.toks[Math.min(this.i + k, this.toks.length - 1)]!;
  readonly take = (): Tok => this.toks[Math.min(this.i++, this.toks.length - 1)]!;
  readonly is = (t: string, k = 0): boolean => this.peek(k).t === t;
}

/**
 * What an ER parse holds while it reads the statements (R2): the model and its budget, the code and the prepared
 * source with its line index, the token cursor, the lines already reported, the relationship numbering and the
 * subgraphs open and closed so far.
 */
interface ErParse {
  readonly model: ErModel;
  readonly D: Diagnostic[];
  readonly budget: ItemBudget;
  /** The code with a final line break: token offsets are offsets into it (the prepared source only blanks text). */
  readonly orig: string;
  readonly src: string;
  readonly lineAt: LineIndex;
  readonly c: Cursor;
  /** Lines with a character no rule reads (reported once, by the lexer). */
  readonly badLines: Set<number>;
  /** The last line a syntax error was reported on. */
  reported: number;
  readonly relCount: Map<string, number>;
  /** The ends of each relationship that named no closed subgraph when it was read. */
  readonly early: Map<ErRel, string[]>;
  readonly open: OpenGroup[];
  readonly closed: ErGroup[];
  /** Members already claimed by a closed subgraph (Mermaid's makeUniq). */
  readonly claimed: Set<string>;
}

/** Never throws: a source past the lexer's limits gives an empty model with `doc.too-complex`. */
export function parseER(code: string): ErModel {
  return guardParse(emptyEr, () => readER(code));
}

function readER(code: string): ErModel {
  const text = typeof code === 'string' ? code : '';
  const { src, front } = prepareSource(text);
  const { toks, bad } = lex(src);
  const model = emptyEr();
  const P: ErParse = {
    model, D: model.diagnostics, budget: new ItemBudget(model.diagnostics), orig: text + '\n', src, lineAt: lineIndex(src), c: new Cursor(toks),
    badLines: new Set(), reported: -1, relCount: new Map(), early: new Map(), open: [], closed: [], claimed: new Set(),
  };
  for (const at of bad) {
    const li = P.lineAt(at);
    if (P.badLines.has(li)) continue;
    P.badLines.add(li);
    P.D.push(diag('error', 'er.cannot-parse', `Mermaid cannot read "${P.orig[at]}" here`, li));
  }
  // ---- frontmatter: the title
  const fmTitle = frontmatterValues(front).get('title');
  if (fmTitle) model.title = textOf(fmTitle);
  readStatements(P);
  resolveER(P);
  return model;
}

// ---- statements ---------------------------------------------------------------------------------------------------

/** The header, then the statements, then the subgraphs left open. */
function readStatements(P: ErParse): void {
  const { model, D, open, c: { is, take } } = P;
  while (is('NL')) take();
  if (is('ER')) model.headerLine = P.lineAt(take().s);
  else {
    D.push(diag('error', 'er.header', 'The "erDiagram" header is missing'));
  }
  while (!is('EOF') && !P.budget.over) {
    const names = statement(P);
    if (open.length) open[open.length - 1]!.members.push(...names);
  }
  for (let k = open.length - 1; k >= 0; k--) {
    const top = open[k]!;
    D.push(diag('error', 'er.unclosed', `The subgraph "${top.g.id}" has no "end"`, top.g.line, { params: { id: top.g.id } }));
    top.g.lines.add(P.lineAt(P.src.length - 1));
    open.length = k;
    close(P, top);
  }
}

const raw = (P: ErParse, t: Tok): string => P.orig.slice(t.s, t.e);

function syntax(P: ErParse, tok: Tok, msg: string): void {
  const li = P.lineAt(tok.s);
  if (li === P.reported || P.badLines.has(li)) return;
  P.reported = li;
  P.D.push(diag('error', 'er.cannot-parse', `Mermaid cannot read this line of the ER diagram: ${msg}`, li));
}

/** Skips to the next line (the next newline token; a block in between goes with it). */
function recover(P: ErParse): void {
  const { is, take } = P.c;
  while (!is('EOF') && !is('NL')) take();
}

/** A syntax error, then the next line: the statement gives its subgraph no names. */
function reject(P: ErParse, tok: Tok, msg: string): string[] {
  syntax(P, tok, msg);
  recover(P);
  return [];
}

/** One statement; the names it gives the subgraph it is in. */
function statement(P: ErParse): string[] {
  const { model, c: { peek, take } } = P;
  const t = peek();
  const li = P.lineAt(t.s);
  switch (t.t) {
    case 'NL':
      take();
      return [];
    case 'ACC_TITLE':
    case 'ACC_DESCR': {
      take();
      const v = P.c.is('ACC_VALUE') ? textOf(raw(P, take()).trim()) : '';
      if (t.t === 'ACC_TITLE') model.accTitle = v;
      else model.accDescr = v;
      return [];
    }
    case 'ACC_DESCR_BLOCK':
      take();
      // Mermaid drops the indentation after a line break
      model.accDescr = textOf(raw(P, t).trim().replace(/\n\s+/g, '\n'));
      return [];
    case 'DIR': {
      take();
      if (P.open.length) P.open[P.open.length - 1]!.g.dir = t.v as Direction;
      else {
        model.direction = t.v as Direction;
        model.dirLine = li;
      }
      return [];
    }
    case 'CLASSDEF':
    case 'STYLE':
      return styleStatement(P, t, li);
    case 'CLASS': {
      take();
      const ids = idList(P);
      const classes = ids ? idList(P) : null;
      if (!ids || !classes) return reject(P, t, 'write "class id1,id2 className"');
      setClass(P, ids, classes, li);
      return [];
    }
    case 'SUBGRAPH':
      return subgraphStatement(P, t, li);
    case 'END':
      return endStatement(P, t);
    default:
      return otherStatement(P, t, li);
  }
}

/** `style ids styles` / `classDef names styles`. */
function styleStatement(P: ErParse, t: Tok, li: number): string[] {
  const { model, D } = P;
  P.c.take();
  const ids = idList(P, 'STEXT');
  const st = ids ? styles(P) : { text: '', ok: false };
  if (!ids || !st.ok) return reject(P, t, t.t === 'STYLE' ? 'write "style id property:value,…"' : 'write "classDef name property:value,…"');
  const parsed = parseStyleList(st.text, (msg) => D.push(diag('warning', 'er.bad-style', msg, li)));
  if (t.t === 'STYLE') addStyle(P, ids, parsed);
  else for (const id of ids) model.classDefs[id] = { ...(model.classDefs[id] ?? {}), ...parsed };
  return [];
}

/** `subgraph id [title]`: the subgraph opens. */
function subgraphStatement(P: ErParse, t: Tok, li: number): string[] {
  const { model, c: { is, take } } = P;
  take();
  const id = name(P);
  if (!id) return reject(P, t, 'a subgraph needs an id');
  let label = nameOf(P, id), headEnd = id.e;
  if (is('SQS')) {
    take();
    const words: string[] = [];
    for (let w = name(P); w; w = name(P)) words.push(nameOf(P, w));
    if (!words.length || !is('SQE')) return reject(P, t, 'a subgraph title is words or a quoted text in square brackets');
    headEnd = take().e;
    label = words.join(' ');
  }
  if (!is('NL') && !is('EOF')) return reject(P, t, 'the subgraph header must end its line');
  if (!P.budget.take(li)) {
    recover(P);
    return [];
  }
  const g: ErGroup = {
    id: nameOf(P, id), label: textOf(label).trim(), parent: null, children: [], order: model.groups.size + P.open.length, line: li,
    start: t.s, end: P.src.length, idAt: [id.s, id.e], headEnd, lines: new Set([li]), classes: [], style: {},
  };
  P.open.push({ g, members: [] });
  return [];
}

/** `end`: the innermost subgraph closes; its id is a name in the subgraph around it. */
function endStatement(P: ErParse, t: Tok): string[] {
  P.c.take();
  const top = P.open.pop();
  if (!top) {
    syntax(P, t, '"end" closes no subgraph');
    return [];
  }
  top.g.endLine = P.lineAt(t.s);
  top.g.end = t.s + raw(P, t).trimEnd().length;
  top.g.lines.add(top.g.endLine);
  close(P, top);
  return [top.g.id];
}

/** A `title` statement, an entity statement or a relationship (from a name), or an unexpected token. */
function otherStatement(P: ErParse, t: Tok, li: number): string[] {
  const { model, D, c: { peek, take, is } } = P;
  if (NAME_TOKENS.has(t.t)) {
    // `title …`: Mermaid reads its words as entities; mmdx takes it as the diagram's title (with a fix)
    if (t.t === 'TEXT' && /^title$/i.test(raw(P, t)) && P.lineAt(peek(1).s) === li && ['TEXT', 'NUM', 'DECIMAL', 'ENTITY_ONE', 'ENTITY_NAME', 'WORD', 'CHAR', 'COMMA', 'COLON'].includes(peek(1).t)) {
      const lineEnd = (P.lineAt.starts[li + 1] ?? P.src.length) - 1;
      model.title = textOf(P.orig.slice(t.e, lineEnd).trim());
      D.push(diag('warning', 'er.title-statement', 'Mermaid reads the words of a `title` statement as entities in an ER diagram — the frontmatter\'s `title:` is the portable form', li, {
        fix: { title: 'Move to the frontmatter', apply: (c: string) => titleToFrontmatter(c, li) },
      }));
      while (!is('EOF') && !is('NL')) take();
      return [];
    }
    return entityStatement(P, take());
  }
  if (t.t === 'EOF') return [];
  syntax(P, t, `unexpected "${raw(P, t).trim() || t.t}"`);
  take();
  recover(P);
  return [];
}

/** A subgraph closes: its members (unique, not claimed by a subgraph closed before) and its `direction`. */
function close(P: ErParse, top: OpenGroup): void {
  const { model, claimed, open } = P;
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
    P.closed.push(g);
  }
  if (open.length) open[open.length - 1]!.members.push(g.id);
}

// ---- entities and relationships -----------------------------------------------------------------------------------

function touch(P: ErParse, id: string, li: number, alias?: string): Entity | null {
  const { model } = P;
  let e = model.entities.get(id);
  if (!e) {
    if (!P.budget.take(li)) return null;
    e = { id, label: id, attrs: [], order: model.entities.size, lines: new Set(), classes: [], style: {}, parent: null, stmts: [] };
    model.entities.set(id, e);
  }
  if (alias !== undefined && e.alias === undefined && alias) {
    e.alias = alias;
    e.label = alias;
  }
  return e;
}

function mark(P: ErParse, e: Entity, from: number, to: number): void {
  for (let li = P.lineAt(from); li <= P.lineAt(Math.max(from, to - 1)); li++) e.lines.add(li);
}

function useClass(P: ErParse, cls: string, li: number): void {
  const { model } = P;
  if (!Object.hasOwn(model.classDefs, cls) && !model.undefinedClasses.some((u) => u.cls === cls)) model.undefinedClasses.push({ cls, line: li });
}

const groupNow = (P: ErParse, id: string): ErGroup | undefined => P.closed.find((g) => g.id === id);

function setClass(P: ErParse, ids: readonly string[], classes: readonly string[], li: number): void {
  for (const id of ids) {
    const x = P.model.entities.get(id) ?? groupNow(P, id);
    if (!x) continue;
    for (const c of classes) {
      x.classes.push(c);
      useClass(P, c, li);
    }
  }
}

function addStyle(P: ErParse, ids: readonly string[], st: MermaidStyle): void {
  for (const id of ids) {
    const x = P.model.entities.get(id) ?? groupNow(P, id);
    if (x) Object.assign(x.style, st);
  }
}

/** An entity name: a word, a number or a quoted name (its quotes dropped). */
const name = (P: ErParse): Tok | null => (NAME_TOKENS.has(P.c.peek().t) ? P.c.take() : null);
const nameOf = (P: ErParse, t: Tok): string => (t.t === 'ENTITY_NAME' ? unquote(raw(P, t)) : raw(P, t));

/** `a,b,c` after `:::` or `class`. */
function idList(P: ErParse, tok = 'TEXT'): string[] | null {
  const { is, take } = P.c;
  if (!is(tok)) return null;
  const out = [raw(P, take())];
  while (is('COMMA') && is(tok, 1)) {
    take();
    out.push(raw(P, take()));
  }
  return out;
}

/** `:::a,b` after a name, if any (null: `:::` without a class). */
function classesAfter(P: ErParse): string[] | null | undefined {
  if (!P.c.is('SEP')) return undefined;
  P.c.take();
  return idList(P);
}

/** The styles of `style` / `classDef` up to the line's end (or `;`), as written. */
function styles(P: ErParse): { text: string; ok: boolean } {
  const { peek, take, is } = P.c;
  const first = peek();
  let last: Tok | null = null;
  while (['STEXT', 'COLON', 'COMMA', 'BRKT'].includes(peek().t)) last = take();
  const ok = !!last && (is('NL') || is('SEMI') || is('EOF'));
  if (is('SEMI')) take();
  return { text: last ? P.orig.slice(first.s, last.e) : '', ok };
}

/** The attributes of a block, up to its `}` (a bad one is reported and the block goes on at the next line). */
function attributes(P: ErParse, e: Entity | null): Tok | null {
  const { D, lineAt, c: { peek, take, is } } = P;
  const starts = lineAt.starts;
  while (!is('BLOCK_STOP')) {
    if (is('EOF') || is('NL')) return null;
    const t0 = peek();
    const at = lineAt(t0.s);
    const fail = (msg: string): void => {
      if (!P.badLines.has(at)) D.push(diag('error', 'er.bad-attribute', `Mermaid cannot read the attribute "${P.orig.slice(starts[at]!, (starts[at + 1] ?? P.src.length) - 1).trim()}": ${msg}`, at));
      while (!is('BLOCK_STOP') && !is('EOF') && lineAt(peek().s) === at) take();
    };
    if (!is('AWORD')) {
      fail('it must start with a type');
      continue;
    }
    let type = raw(P, take());
    if (is('CHAR') && peek().v === '?') {
      take();
      type += '?';
    }
    if (!is('AWORD')) {
      fail(is('KEY') ? 'it needs a name before its keys' : 'it needs a type and a name');
      continue;
    }
    const nm = raw(P, take());
    const keys: AttrKey[] = [];
    if (is('KEY')) {
      keys.push(raw(P, take()).toUpperCase() as AttrKey);
      while (is('CHAR') && peek().v === ',' && is('KEY', 1)) {
        take();
        keys.push(raw(P, take()).toUpperCase() as AttrKey);
      }
    }
    const comment = is('COMMENT') ? unquote(raw(P, take())) : '';
    e?.attrs.push({ type, name: nm, keys, comment });
  }
  return take();
}

/** A relationship after its first name (and its classes): cardinality, line, cardinality, name, `: label`. */
function relationship(P: ErParse, a: Tok, aClasses: string[] | undefined): string[] {
  const { D, c: { peek, take, is } } = P;
  const li = P.lineAt(a.s);
  const aName = nameOf(P, a);
  const c1 = take();
  if (!is('LINE')) return reject(P, c1, 'a relationship needs "--", "..", "to" or "optionally to" between its cardinalities');
  const ln = take();
  if (!is('CARD')) return reject(P, ln, 'a relationship needs a cardinality on both sides');
  const c2 = take();
  const b = name(P);
  if (!b) return reject(P, c2, 'a relationship needs an entity on both sides');
  const bClasses = classesAfter(P);
  if (bClasses === null) return reject(P, b, 'a class name must follow ":::"');
  let label = '', labelTok: Tok | null = null, end = bClasses ? peek(-1).e : b.e;
  if (is('COLON')) {
    const colon = take();
    if (!is('WORD') && !is('ENTITY_NAME') && !is('TEXT')) return reject(P, colon, 'the label after ":" must be one word or a quoted text');
    labelTok = take();
    label = textOf(labelTok.t === 'TEXT' ? raw(P, labelTok) : unquote(raw(P, labelTok)));
    end = labelTok.e;
  } else {
    const at = end;
    D.push(diag('error', 'er.rel-label', 'Mermaid needs a label after a relationship (": label", or ": \\"\\"" for none)', li, {
      fix: { title: 'Add an empty label', apply: (c: string) => c.slice(0, at) + ' : ""' + c.slice(at) },
    }));
  }
  const bName = nameOf(P, b);
  const ea = touch(P, aName, li), eb = touch(P, bName, li);
  if (!ea || !eb || !P.budget.take(li)) return [aName, bName];
  mark(P, ea, a.s, end);
  mark(P, eb, a.s, end);
  if (aClasses) setClass(P, [aName], aClasses, li);
  if (bClasses) setClass(P, [bName], bClasses, li);
  const key = `${aName}--${bName}`;
  const n = (P.relCount.get(key) ?? 0) + 1;
  P.relCount.set(key, n);
  for (const c of [c1, c2])
    if (c.v === 'md-parent') D.push(diag('info', 'er.md-parent', 'Mermaid\'s "u" cardinality has no marker of its own: mmdx draws it as exactly one', li));
  const card = (c: Tok): Cardinality => (c.v === 'md-parent' ? 'one' : (c.v as Cardinality));
  const rel: ErRel = {
    id: n > 1 ? `${key}#${n}` : key, from: aName, to: bName, fromCard: card(c1), toCard: card(c2), identifying: ln.v === 'id', label, src: li,
    start: a.s, end, fromAt: [a.s, a.e], toAt: [b.s, b.e], fromCardAt: [c1.s, c1.e], lineAt: [ln.s, ln.e], toCardAt: [c2.s, c2.e],
  };
  if (labelTok) rel.labelAt = [labelTok.s, labelTok.e];
  P.model.rels.push(rel);
  P.early.set(rel, [aName, bName].filter((x) => !groupNow(P, x)));
  return [aName, bName];
}

/** An entity statement or a relationship, from its first name. Returns the names it gives its subgraph. */
function entityStatement(P: ErParse, a: Tok): string[] {
  const { peek, take, is } = P.c;
  const li = P.lineAt(a.s);
  const aName = nameOf(P, a);
  const aClasses = classesAfter(P);
  if (aClasses === null) return reject(P, a, 'a class name must follow ":::"');
  if (is('CARD')) return relationship(P, a, aClasses);
  // ---- an entity: `A`, `A[Alias]`, `:::classes`, a block
  let alias: string | undefined, aliasAt: [number, number] | undefined;
  let classes = aClasses;
  if (is('SQS') && !aClasses) {
    const sqs = take();
    const al = name(P);
    if (!al || !is('SQE')) return reject(P, a, 'an alias is one word or a quoted text in square brackets');
    const sqe = take();
    aliasAt = [sqs.s, sqe.e];
    // a markdown string's backticks (`"`**x**`"`) are not part of the text
    alias = textOf(nameOf(P, al).replace(/^`([\s\S]*)`$/, '$1'));
    const c = classesAfter(P);
    if (c === null) return reject(P, a, 'a class name must follow ":::"');
    classes = c;
    // an alias on a relationship line: Mermaid fails; mmdx reads both, the fix gives the alias its own line
    if (is('CARD')) {
      relAlias(P, a, sqe, li);
      touch(P, aName, li, alias);
      return relationship(P, a, classes);
    }
  }
  const e = touch(P, aName, li, alias);
  let end = peek(-1).e, endLine = li, block = false, blockAt: [number, number] | undefined;
  if (is('BLOCK_START')) {
    const brace = take();
    block = true;
    const stop = attributes(P, e);
    if (!stop) {
      syntax(P, a, `the block of "${aName}" has no closing "}"`);
      return [aName];
    }
    end = stop.e;
    endLine = P.lineAt(stop.s);
    blockAt = [brace.s, stop.e];
    if (e) {
      e.defLine = li;
      e.endLine = endLine;
    }
  }
  if (!e) return [aName];
  mark(P, e, a.s, end);
  const stmt: ErEntityStmt = { line: li, endLine, start: a.s, end, block, nameAt: [a.s, a.e] };
  if (aliasAt) stmt.aliasAt = aliasAt;
  if (blockAt) stmt.blockAt = blockAt;
  e.stmts.push(stmt);
  if (classes) setClass(P, [aName], classes, li);
  return [aName];
}

/** `A[Alias] ||--o{ B : x`: the error, with the fix that declares the alias on a line of its own. */
function relAlias(P: ErParse, a: Tok, sqe: Tok, li: number): void {
  const lineStart = P.lineAt.starts[li]!, from = a.e, to = sqe.e;
  const decl = P.orig.slice(a.s, to);
  P.D.push(diag('error', 'er.rel-alias', 'Mermaid has no alias on a relationship line: declare it on its own line', li, {
    fix: {
      title: 'Move the alias to its own line',
      apply: (c: string) => {
        const indent = /^[^\S\n]*/.exec(c.slice(lineStart))?.[0] ?? '';
        return c.slice(0, lineStart) + indent + decl + '\n' + c.slice(lineStart, from) + c.slice(to);
      },
    },
  }));
}

// ---- resolve: what needs the whole file ---------------------------------------------------------------------------

function resolveER(P: ErParse): void {
  const { model, D } = P;
  // ---- members: an entity (or subgraph) is in the first subgraph to close that names it
  const parentOf = subgraphTree(model);
  // a relationship names a subgraph only after the subgraph's `end` (Mermaid links it to a table of that id before,
  // which it does not draw); mmdx draws it to the subgraph
  for (const [r, ends] of P.early)
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
}

/** Each subgraph's parent and children (no cycles); returns every member's subgraph. */
function subgraphTree(model: ErModel): Map<string, string> {
  const parentOf = new Map<string, string>();
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
  return parentOf;
}
