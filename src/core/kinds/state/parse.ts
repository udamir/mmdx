// Mermaid state diagram parser (T09): `stateDiagram` and `stateDiagram-v2` (one grammar, identical in Mermaid 11.17 and
// 12.2). Mermaid's jison lexer (stateDiagram.jison: its rules, start conditions and actions, first rule that matches)
// is reproduced rule by rule over the code as Mermaid's preprocessing leaves it (frontmatter, `%%{init}%%` and comment
// lines blanked, `#9829;` entities kept whole, a line break added), so what Mermaid reads as one token mmdx reads the
// same way: `;` ends a label (`a --> b : x; y` adds the states `;` and `y`), `%%` after a label is part of it, newlines
// inside a composite are not statement ends, `direction TD` is two states. A small grammar over the tokens gives the
// statements; a statement Mermaid rejects is reported and skipped (the lexer goes on at the next line).
//
// The model follows Mermaid's StateDB and data fetcher: states are one set across scopes, a state's kind comes from its
// first mention (`state c <<choice>>` after `a --> c` is ignored), its composite and region from the last mention
// inside a composite, its title from the first text the code gives it and its description rows from the others; one
// start and one end pseudo-state per scope (`[*]start`, `X/[*]end`, `X/2/[*]start` in X's second region).
import type { Direction, MermaidStyle, StateBlock, StateEdge, StateGroup, StateKind, StateModel, StateNode } from '../../model.js';
import type { DiagnosticFix } from '../../types.js';
import { diag } from '../../types.js';
import { frontmatterValues } from '../../parse/frontmatter.js';
import { guardParse, ItemBudget, LexBudget, stripControl } from '../../parse/limits.js';
import { LineScan } from '../../parse/line-scan.js';
import { firstMatch, lexRule, prepareSource, type LexRule } from '../../parse/jison.js';
import { labelText, lineIndex, stripQuotes } from '../../parse/kit.js';
import { parseStyleList } from '../../parse/style.js';
import { minOf } from '../../geom.js';

export function emptyState(): StateModel {
  return {
    type: 'state', header: 'stateDiagram-v2', headerLine: -1, direction: 'TB', nodes: new Map(), groups: new Map(), edges: [], notes: [],
    classDefs: {}, classDefLines: {}, undefinedClasses: [], diagnostics: [],
  };
}

// ---- pseudo-state ids ---------------------------------------------------------------------------------------------

/** The start or end pseudo-state of a scope: `[*]start`, `X/[*]end`, `X/2/[*]start` (X's second region). */
export function pseudoId(scope: string | null, region: number, end: boolean): string {
  const name = end ? '[*]end' : '[*]start';
  if (scope === null) return name;
  return region > 0 ? `${scope}/${region + 1}/${name}` : `${scope}/${name}`;
}

/** Is the id a pseudo-state's (`[*]start`, `X/[*]end`…)? */
export const isPseudo = (id: string): boolean => /(?:^|\/)\[\*\](?:start|end)$/.test(id);

// ---- lexer --------------------------------------------------------------------------------------------------------

interface Tok {
  t: string;
  /** yytext after the rule's action. */
  v: string;
  /** Offsets of the match (shortened by the `%%` rule of ids). */
  s: number;
  e: number;
}

/** What a rule's action does to the condition stack, the text and the token. */
interface Act {
  /** Conditions popped, then pushed (jison's popState / pushState / begin). */
  pop?: boolean;
  push?: string;
  /** The token (none: the text is skipped). */
  tok?: string;
  /** Rewrites yytext. */
  text?: (v: string) => string;
  /** Mermaid's processId: an id ends before `%%`; one starting with `%%` is no token. */
  id?: boolean;
  /** `state My State {`: Mermaid throws. */
  throws?: string;
}

type Rule = LexRule<Act>;

const R = (re: string, act: Act, more: Partial<Rule> = {}): Rule => lexRule(re, act, more);
// `.*direction\s+TB[^\n]*` in Mermaid's lexer, answered from a per-line index
const DIRS = (): Rule[] =>
  (['TB', 'BT', 'RL', 'LR'] as const).map((d) => R(`.*direction\\s+${d}[^\\n]*`, { tok: `dir_${d}` }, { test: (L, pos) => L.direction(pos, d) }));
// `.*<<fork>>` and the like: up to the word's last occurrence on the line
const UPTO = (re: string, needle: RegExp, act: Act): Rule => R(re, act, { test: (L, pos) => L.upToLast(pos, needle) });

// stateDiagram.jison's rules, by their index in Mermaid's lexer
const RULES: Rule[] = [
  /* 0 */ R('click\\b', { tok: 'CLICK' }),
  /* 1 */ R('href\\b', { tok: 'HREF' }),
  /* 2 */ R('"[^"]*"', { tok: 'STRING' }),
  /* 3 */ R('default\\b', { tok: 'DEFAULT' }),
  /* 4–7 */ ...DIRS(),
  /* 8 */ R('[\\n]+', { tok: 'NL' }),
  /* 9 */ R('[\\s]+', {}),
  /* 10 */ R('((?!\\n)\\s)+', {}),
  /* 11 */ R('#[^\\n]*', {}),
  /* 12 */ R('%%(?!\\{)[^\\n]*', {}),
  /* 13 */ R('scale\\s+', { push: 'SCALE', tok: 'scale' }),
  /* 14 */ R('\\d+', { tok: 'WIDTH' }),
  /* 15 */ R('\\s+width\\b', { pop: true }),
  /* 16 */ R('accTitle\\s*:\\s*', { push: 'acc_title', tok: 'acc_title' }),
  /* 17 */ R('(?!\\n||)*[^\\n]*', { pop: true, tok: 'acc_title_value' }),
  /* 18 */ R('accDescr\\s*:\\s*', { push: 'acc_descr', tok: 'acc_descr' }),
  /* 19 */ R('(?!\\n||)*[^\\n]*', { pop: true, tok: 'acc_descr_value' }),
  /* 20 */ R('accDescr\\s*\\{\\s*', { push: 'acc_descr_multiline' }),
  /* 21 */ R('[\\}]', { pop: true }),
  /* 22 */ R('[^\\}]*', { tok: 'acc_descr_multiline_value' }),
  /* 23 */ R('classDef\\s+', { push: 'CLASSDEF', tok: 'classDef' }),
  /* 24 */ R('DEFAULT\\s+', { pop: true, push: 'CLASSDEFID', tok: 'DEFAULT_CLASSDEF_ID' }),
  /* 25 */ R('\\w+\\s+', { pop: true, push: 'CLASSDEFID', tok: 'CLASSDEF_ID' }),
  /* 26 */ R('[^\\n]*', { pop: true, tok: 'CLASSDEF_STYLEOPTS' }),
  /* 27 */ R('class\\s+', { push: 'CLASS', tok: 'class' }),
  /* 28 */ R('(\\w+)+((,\\s*\\w+)*)', { pop: true, push: 'CLASS_STYLE', tok: 'CLASSENTITY_IDS' }),
  /* 29 */ R('[^\\n]*', { pop: true, tok: 'STYLECLASS' }),
  /* 30 */ R('style\\s+', { push: 'STYLE', tok: 'style' }),
  /* 31 */ R('[\\w,]+\\s+', { pop: true, push: 'STYLEDEF_STYLES', tok: 'STYLE_IDS' }),
  /* 32 */ R('[^\\n]*', { pop: true, tok: 'STYLEDEF_STYLEOPTS' }),
  /* 33 */ R('scale\\s+', { push: 'SCALE', tok: 'scale' }),
  /* 34 */ R('\\d+', { tok: 'WIDTH' }),
  /* 35 */ R('\\s+width\\b', { pop: true }),
  /* 36 */ R('state\\s+', { push: 'STATE' }),
  /* 37 */ UPTO('.*<<fork>>', /<<fork>>/gi, { pop: true, tok: 'FORK', text: (v) => v.slice(0, -8).trim() }),
  /* 38 */ UPTO('.*<<join>>', /<<join>>/gi, { pop: true, tok: 'JOIN', text: (v) => v.slice(0, -8).trim() }),
  /* 39 */ UPTO('.*<<choice>>', /<<choice>>/gi, { pop: true, tok: 'CHOICE', text: (v) => v.slice(0, -10).trim() }),
  /* 40 */ UPTO('.*\\[\\[fork\\]\\]', /\[\[fork\]\]/gi, { pop: true, tok: 'FORK', text: (v) => v.slice(0, -8).trim() }),
  /* 41 */ UPTO('.*\\[\\[join\\]\\]', /\[\[join\]\]/gi, { pop: true, tok: 'JOIN', text: (v) => v.slice(0, -8).trim() }),
  /* 42 */ UPTO('.*\\[\\[choice\\]\\]', /\[\[choice\]\]/gi, { pop: true, tok: 'CHOICE', text: (v) => v.slice(0, -10).trim() }),
  /* 43–46 */ ...DIRS(),
  /* 47 */ R('["]', { push: 'STATE_STRING' }),
  /* 48 */ R('\\s*as\\s+', { push: 'STATE_ID', tok: 'AS' }),
  /* 49 */ R('[^\\n\\{]*', { id: true, pop: true, tok: 'ID' }),
  /* 50 */ R('["]', { pop: true }),
  /* 51 */ R('[^"]*', { tok: 'STATE_DESCR' }),
  /* 52 */ R('\\w+\\s+\\w+.*?\\{', { throws: 'single-word' }, { scan: 'line' }),
  /* 53 */ R('[^\\n\\s\\{]+', { tok: 'COMPOSIT_STATE' }),
  /* 54 */ R('\\n', { pop: true }),
  /* 55 */ R('\\{', { pop: true, push: 'struct', tok: 'STRUCT_START' }),
  /* 56 */ R('\\}', { pop: true, tok: 'STRUCT_STOP' }),
  /* 57 */ R('[\\n]', {}),
  /* 58 */ R('note\\s+', { push: 'NOTE', tok: 'note' }),
  /* 59 */ R('left of\\b', { pop: true, push: 'NOTE_ID', tok: 'left_of' }),
  /* 60 */ R('right of\\b', { pop: true, push: 'NOTE_ID', tok: 'right_of' }),
  /* 61 */ R('"', { pop: true, push: 'FLOATING_NOTE' }),
  /* 62 */ R('\\s*as\\s*', { pop: true, push: 'FLOATING_NOTE_ID', tok: 'AS' }),
  /* 63 */ R('["]', {}),
  /* 64 */ R('[^"]*', { tok: 'NOTE_TEXT' }),
  /* 65 */ R('[^\\n]*', { id: true, pop: true, tok: 'ID' }),
  /* 66 */ R('\\s*[^:\\n\\s\\-]+', { id: true, pop: true, push: 'NOTE_TEXT', tok: 'ID' }),
  /* 67 */ R('\\s*:[^:\\n;]+', { pop: true, tok: 'NOTE_TEXT', text: (v) => v.substring(2).trim() }),
  /* 68 */ R('[\\s\\S]*?\\n\\s*end note\\b', { pop: true, tok: 'NOTE_TEXT', text: (v) => v.slice(0, -8).trim() }, { scan: 'all' }),
  /* 69 */ R('stateDiagram\\s+', { tok: 'SD' }),
  /* 70 */ R('stateDiagram-v2\\s+', { tok: 'SD' }),
  /* 71 */ R('hide empty description\\b', { tok: 'HIDE_EMPTY' }),
  /* 72 */ R('\\[\\*\\]', { tok: 'EDGE_STATE' }),
  /* 73 */ R('[^:\\n\\s\\-\\{]+', { id: true, tok: 'ID' }),
  /* 74 */ R('\\s*:(?:[^:\\n;]|:[^:\\n;])+', { tok: 'DESCR', text: (v) => v.trim() }),
  /* 75 */ R('-->', { tok: '-->' }),
  /* 76 */ R('--', { tok: 'CONCURRENT' }),
  /* 77 */ R(':::', { tok: 'STYLE_SEPARATOR' }),
  /* 78 */ R('$', { tok: 'NL' }),
  /* 79 */ R('.', { tok: 'INVALID' }),
];

const CONDITIONS: Readonly<Record<string, readonly number[]>> = {
  struct: [10, 11, 12, 23, 27, 30, 36, 43, 44, 45, 46, 56, 57, 58, 72, 73, 74, 75, 76, 77],
  FLOATING_NOTE_ID: [65], FLOATING_NOTE: [62, 63, 64], NOTE_TEXT: [67, 68], NOTE_ID: [66], NOTE: [59, 60, 61],
  STYLEDEF_STYLES: [32], STYLE: [31], CLASS_STYLE: [29], CLASS: [28], CLASSDEFID: [26], CLASSDEF: [24, 25],
  acc_descr_multiline: [21, 22], acc_descr: [19], acc_title: [17], SCALE: [14, 15, 34, 35],
  STATE_ID: [49], STATE_STRING: [50, 51], STATE: [10, 11, 12, 37, 38, 39, 40, 41, 42, 47, 48, 52, 53, 54, 55],
  INITIAL: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 18, 20, 23, 27, 30, 33, 36, 55, 58, 69, 70, 71, 72, 73, 74, 75, 77, 78, 79],
};

class LexError extends Error {
  constructor(readonly at: number, readonly code: 'lexical' | 'single-word', msg: string, readonly end = at) {
    super(msg);
  }
}

/** Mermaid's lexer over the prepared source: `next()` gives the next token (EOF at the end). */
class Lexer {
  pos = 0;
  stack: string[] = ['INITIAL'];
  private done = false;
  /** Empty tokens in a row at one offset (a guard: Mermaid's lexer would loop there). */
  private empties = 0;
  private readonly L: LineScan;
  private readonly budget: LexBudget;
  constructor(private readonly src: string) {
    this.L = new LineScan(src);
    this.budget = new LexBudget(src.length);
  }

  /** The prepared source between two offsets. */
  text(s: number, e: number): string {
    return this.src.slice(s, e);
  }

  /** Restarts at an offset with a condition stack (error recovery). */
  reset(pos: number, depth: number): void {
    this.pos = pos;
    this.stack = ['INITIAL', ...Array.from({ length: depth }, () => 'struct')];
    this.done = false;
  }

  next(): Tok {
    for (;;) {
      if (this.done) return { t: 'EOF', v: '', s: this.pos, e: this.pos };
      if (this.pos >= this.src.length) this.done = true;
      const rules = CONDITIONS[this.stack[this.stack.length - 1]!] ?? CONDITIONS['INITIAL']!;
      const hit = firstMatch(RULES, rules, this.src, this.pos, this.L, this.budget);
      if (!hit) {
        if (this.pos >= this.src.length) return { t: 'EOF', v: '', s: this.pos, e: this.pos };
        throw new LexError(this.pos, 'lexical', 'Mermaid cannot read this text');
      }
      const { act } = hit;
      let m = hit.m;
      if (act.throws) throw new LexError(this.pos, 'single-word', `State name must be a single word (found "${m.slice(0, -1).trim()}")`, this.pos + m.length);
      const s = this.pos;
      if (act.id) {
        const i = m.indexOf('%%');
        if (i === 0) {
          // jison: the action returns nothing, so the text is consumed without a token
          this.pos += m.length;
          continue;
        }
        if (i > 0) m = m.slice(0, i);
      }
      this.pos += m.length;
      if (this.pos < this.src.length) this.done = false;
      if (act.pop && this.stack.length > 1) this.stack.pop();
      if (act.push) this.stack.push(act.push);
      if (m.length) this.empties = 0;
      else if (++this.empties > 8) throw new LexError(this.pos, 'lexical', 'Mermaid cannot read this text');
      if (!act.tok) {
        if (!m.length) {
          // a rule that skips nothing would loop (Mermaid's lexer would too): treat it as unreadable
          throw new LexError(this.pos, 'lexical', 'Mermaid cannot read this text');
        }
        continue;
      }
      return { t: act.tok, v: act.text ? act.text(m) : m, s, e: s + m.length };
    }
  }
}

// ---- statements ---------------------------------------------------------------------------------------------------

interface IdRef {
  /** As Mermaid keeps it (trimmed); `[*]` for a pseudo-state. */
  id: string;
  at: [number, number];
  cls?: string;
}

type Stmt =
  | { k: 'desc'; ref: IdRef; text: string; at: [number, number]; s: number; e: number }
  | { k: 'rel'; a: IdRef; b: IdRef; label?: { text: string; at: [number, number]; textAt: [number, number] }; s: number; e: number }
  | { k: 'state'; ref: IdRef; s: number; e: number }
  | { k: 'comp'; id: string; at: [number, number]; title?: { text: string; at: [number, number] }; doc: Stmt[]; s: number; e: number; closed: boolean }
  | { k: 'as'; id: string; at: [number, number]; title: { text: string; at: [number, number] }; more?: string; s: number; e: number }
  | { k: 'decl'; id: string; kind: 'choice' | 'fork' | 'join'; s: number; e: number }
  | { k: 'div'; s: number; e: number }
  | { k: 'note'; ref: IdRef; side: 'left' | 'right'; text: string; at: [number, number]; s: number; e: number; multi: boolean }
  | { k: 'dir'; dir: Direction | 'TD'; s: number; e: number }
  | { k: 'classDef'; name: string; styles: string; isDefault: boolean; s: number; e: number }
  | { k: 'class'; ids: string; cls: string; s: number; e: number }
  | { k: 'style'; ids: string; styles: string; s: number; e: number }
  | { k: 'click'; ref: IdRef; url: string; tooltip?: string; s: number; e: number }
  | { k: 'acc'; what: 'title' | 'descr'; text: string; s: number; e: number }
  | { k: 'skip'; s: number; e: number };

class SyntaxErr extends Error {
  constructor(readonly at: number, msg: string) {
    super(msg);
  }
}

const TOKEN_NAMES: Readonly<Record<string, string>> = {
  NL: 'a line break', EOF: 'the end', STRUCT_STOP: '"}"', STRUCT_START: '"{"', '-->': '"-->"', DESCR: 'a ": text"', INVALID: 'this character',
  DEFAULT_CLASSDEF_ID: '"default"', STRING: 'a quoted string', ID: 'a name',
};

/** The token-level grammar of stateDiagram.jison, with one statement per call; errors carry their offset. */
class Grammar {
  private la: Tok | null = null;
  depth = 0;
  constructor(readonly lex: Lexer) {}

  peek(): Tok {
    this.la ??= this.lex.next();
    return this.la;
  }
  take(): Tok {
    const t = this.peek();
    this.la = null;
    return t;
  }
  /** Forgets the lookahead (after the lexer was reset). */
  drop(): void {
    this.la = null;
  }
  expect(t: string, what: string): Tok {
    const x = this.peek();
    if (x.t !== t) throw new SyntaxErr(x.s, `expected ${what}, found ${TOKEN_NAMES[x.t] ?? `"${x.v.trim()}"`}`);
    return this.take();
  }

  /** idStatement: ID | [*] | ID ::: ID | [*] ::: ID. */
  idStatement(): IdRef {
    const t = this.take();
    const ref: IdRef = { id: t.t === 'EDGE_STATE' ? '[*]' : t.v.trim(), at: [t.s, t.e] };
    if (this.peek().t === 'STYLE_SEPARATOR') {
      this.take();
      const c = this.expect('ID', 'a class name');
      ref.cls = c.v.trim();
      ref.at = [t.s, c.e];
    }
    return ref;
  }

  /** One statement (null at a line break, `}` or the end), or throws. */
  statement(onDoc: (st: Stmt & { k: 'comp' }) => void): Stmt | null {
    const t = this.peek();
    const s = t.s;
    switch (t.t) {
      case 'NL':
        this.take();
        return null;
      case 'ID':
      case 'EDGE_STATE': {
        const a = this.idStatement();
        const n = this.peek();
        if (n.t === 'DESCR') {
          this.take();
          return { k: 'desc', ref: a, text: trimColon(n.v), at: textAt(this.lex.text(0, n.e), [n.s, n.e]), s, e: n.e };
        }
        if (n.t === '-->') {
          this.take();
          const x = this.peek();
          if (x.t !== 'ID' && x.t !== 'EDGE_STATE') throw new SyntaxErr(x.s, `expected a state after "-->", found ${TOKEN_NAMES[x.t] ?? `"${x.v.trim()}"`}`);
          const b = this.idStatement();
          const d = this.peek();
          if (d.t === 'DESCR') {
            this.take();
            return { k: 'rel', a, b, label: { text: trimColon(d.v), at: [d.s, d.e], textAt: textAt(this.lex.text(0, d.e), [d.s, d.e]) }, s, e: d.e };
          }
          return { k: 'rel', a, b, s, e: b.at[1] };
        }
        return { k: 'state', ref: a, s, e: a.at[1] };
      }
      case 'HIDE_EMPTY':
        this.take();
        return { k: 'skip', s, e: t.e };
      case 'scale': {
        this.take();
        const w = this.expect('WIDTH', 'a number');
        return { k: 'skip', s, e: w.e };
      }
      case 'COMPOSIT_STATE': {
        this.take();
        if (this.peek().t !== 'STRUCT_START') return { k: 'skip', s, e: t.e }; // `state x` alone declares nothing in Mermaid
        const st: Stmt & { k: 'comp' } = { k: 'comp', id: t.v.trim(), at: [t.s, t.e], doc: [], s, e: t.e, closed: false };
        this.block(st, onDoc);
        return st;
      }
      case 'STATE_DESCR': {
        this.take();
        this.expect('AS', '"as"');
        const id = this.expect('ID', 'a state id');
        const raw = id.v.trim();
        const title = { text: t.v.trim(), at: [t.s, t.e] as [number, number] };
        // `state "x" as id:more`: Mermaid splits at the colon
        const colon = raw.indexOf(':');
        const sid = colon >= 0 ? raw.slice(0, colon) : raw;
        const idAt: [number, number] = [id.s + (id.v.length - id.v.trimStart().length), id.s + (id.v.length - id.v.trimStart().length) + sid.length];
        if (this.peek().t === 'STRUCT_START') {
          const st: Stmt & { k: 'comp' } = { k: 'comp', id: sid, at: idAt, title, doc: [], s, e: id.e, closed: false };
          this.block(st, onDoc);
          return st;
        }
        const out: Stmt = { k: 'as', id: sid, at: idAt, title, s, e: id.e };
        if (colon >= 0) out.more = raw.slice(colon + 1);
        return out;
      }
      case 'FORK':
      case 'JOIN':
      case 'CHOICE':
        this.take();
        return { k: 'decl', id: t.v, kind: t.t === 'FORK' ? 'fork' : t.t === 'JOIN' ? 'join' : 'choice', s, e: t.e };
      case 'CONCURRENT':
        this.take();
        return { k: 'div', s, e: t.e };
      case 'note': {
        this.take();
        const p = this.peek();
        if (p.t === 'left_of' || p.t === 'right_of') {
          this.take();
          const id = this.expect('ID', 'the state of the note');
          const txt = this.expect('NOTE_TEXT', 'the note text (": text", or lines and "end note")');
          const ref: IdRef = { id: id.v.trim(), at: [id.s + (id.v.length - id.v.trimStart().length), id.e] };
          const multi = !/^\s*:/.test(this.lex.text(txt.s, txt.e));
          return { k: 'note', ref, side: p.t === 'left_of' ? 'left' : 'right', text: txt.v, at: [txt.s, txt.e], s, e: txt.e, multi };
        }
        // a floating note (`note "text" as N1`) parses, and Mermaid draws nothing for it
        this.expect('NOTE_TEXT', 'the note text');
        this.expect('AS', '"as"');
        const id = this.expect('ID', 'a note id');
        return { k: 'skip', s, e: id.e };
      }
      case 'dir_TB':
      case 'dir_BT':
      case 'dir_RL':
      case 'dir_LR':
        this.take();
        return { k: 'dir', dir: t.t.slice(4) as Direction, s, e: t.e };
      case 'acc_title': {
        this.take();
        const v = this.expect('acc_title_value', 'a title');
        return { k: 'acc', what: 'title', text: v.v.trim(), s, e: v.e };
      }
      case 'acc_descr': {
        this.take();
        const v = this.expect('acc_descr_value', 'a description');
        return { k: 'acc', what: 'descr', text: v.v.trim(), s, e: v.e };
      }
      case 'acc_descr_multiline_value':
        this.take();
        return { k: 'acc', what: 'descr', text: t.v.trim(), s, e: t.e };
      case 'CLICK': {
        this.take();
        const x = this.peek();
        if (x.t !== 'ID' && x.t !== 'EDGE_STATE') throw new SyntaxErr(x.s, 'expected the state of the link');
        const ref = this.idStatement();
        const k = this.peek();
        let url: string, tooltip: string | undefined;
        if (k.t === 'HREF') {
          this.take();
          url = this.expect('STRING', 'a quoted URL').v;
        } else {
          url = this.expect('STRING', 'a quoted URL or "href"').v;
          tooltip = this.expect('STRING', 'a quoted tooltip').v;
        }
        const nl = this.expect('NL', 'a line break after the link');
        const out: Stmt = { k: 'click', ref, url: unquote(url), s, e: nl.s };
        if (tooltip !== undefined) out.tooltip = unquote(tooltip);
        return out;
      }
      case 'classDef': {
        this.take();
        const n = this.peek();
        if (n.t !== 'CLASSDEF_ID' && n.t !== 'DEFAULT_CLASSDEF_ID') throw new SyntaxErr(n.s, 'expected a class name');
        this.take();
        const o = this.expect('CLASSDEF_STYLEOPTS', 'the class styles');
        return { k: 'classDef', name: n.v.trim(), styles: o.v.trim(), isDefault: n.t === 'DEFAULT_CLASSDEF_ID', s, e: o.e };
      }
      case 'style': {
        this.take();
        const ids = this.expect('STYLE_IDS', 'state ids');
        const o = this.expect('STYLEDEF_STYLEOPTS', 'the styles');
        return { k: 'style', ids: ids.v.trim(), styles: o.v.trim(), s, e: o.e };
      }
      case 'class': {
        this.take();
        const ids = this.expect('CLASSENTITY_IDS', 'state ids');
        const c = this.expect('STYLECLASS', 'a class name');
        return { k: 'class', ids: ids.v.trim(), cls: c.v.trim(), s, e: c.e };
      }
      default:
        throw new SyntaxErr(t.s, `unexpected ${TOKEN_NAMES[t.t] ?? `"${t.v.trim()}"`}`);
    }
  }

  /** `{ document }` of a composite. */
  private block(st: Stmt & { k: 'comp' }, onDoc: (st: Stmt & { k: 'comp' }) => void): void {
    this.take(); // {
    this.depth++;
    onDoc(st);
  }
}

const trimColon = (v: string): string => (v.startsWith(':') ? v.slice(1).trim() : v.trim());
const unquote = stripQuotes;
/** The offsets of a DESCR's text (after the colon, trimmed) in the source. */
function textAt(src: string, at: readonly [number, number]): [number, number] {
  const v = src.slice(at[0], at[1]);
  const c = v.indexOf(':');
  const body = v.slice(c + 1);
  const s = at[0] + c + 1 + (body.length - body.trimStart().length);
  return [s, s + body.trim().length];
}

// ---- parser -------------------------------------------------------------------------------------------------------

const textOf = labelText;

/** Never throws: a source past the lexer's limits gives an empty model with `doc.too-complex`. */
export function parseState(code: string): StateModel {
  return guardParse(emptyState, () => readState(code));
}

function readState(code: string): StateModel {
  const model = emptyState();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const { src, front } = prepareSource(typeof code === 'string' ? code : '');
  const orig = (typeof code === 'string' ? code : '') + '\n';
  const lineAt = lineIndex(src);
  const raw = (at: readonly [number, number]): string => orig.slice(at[0], at[1]);
  const lex = new Lexer(src);
  const G = new Grammar(lex);

  // ---- statements, with error recovery at the next line
  const root: Stmt[] = [];
  /** Open composites (innermost last) with their documents. */
  const open: (Stmt & { k: 'comp' })[] = [];
  const docOf = (): Stmt[] => (open.length ? open[open.length - 1]!.doc : root);
  const recover = (at: number): void => {
    const nl = src.indexOf('\n', at);
    G.drop();
    lex.reset(nl < 0 ? src.length : nl + 1, open.length);
    G.depth = open.length;
  };
  const syntax = (at: number, msg: string, code = 'state.syntax'): void => {
    D.push(diag('error', code, `Mermaid cannot read this line of the state diagram: ${msg}`, lineAt(at)));
  };

  // the header (`stateDiagram` / `stateDiagram-v2`), after blank lines only
  let started = false;
  while (!started) {
    let t: Tok;
    try {
      t = G.peek();
    } catch (e) {
      if (!(e instanceof LexError)) throw e;
      syntax(e.at, e.message);
      recover(e.at);
      continue;
    }
    if (t.t === 'NL') {
      G.take();
      continue;
    }
    if (t.t === 'EOF') break;
    if (t.t !== 'SD') {
      syntax(t.s, 'the "stateDiagram" header must come first');
      recover(t.s);
      continue;
    }
    G.take();
    model.header = /-v2/i.test(t.v) ? 'stateDiagram-v2' : 'stateDiagram';
    model.headerLine = lineAt(t.s);
    started = true;
  }
  if (!started) D.push(diag('error', 'state.header', 'The "stateDiagram-v2" header is missing'));

  while (started) {
    let t: Tok;
    try {
      t = G.peek();
      if (t.t === 'EOF') {
        if (open.length) {
          const c = open[open.length - 1]!;
          D.push(diag('error', 'state.unclosed', `The composite state "${c.id}" has no closing "}"`, lineAt(c.s), { params: { id: c.id } }));
        }
        break;
      }
      if (t.t === 'STRUCT_STOP' && open.length) {
        G.take();
        const c = open.pop()!;
        c.closed = true;
        c.e = t.e;
        G.depth = open.length;
        continue;
      }
      const st = G.statement((c) => {
        docOf().push(c);
        open.push(c);
      });
      if (st && st.k !== 'comp') docOf().push(st);
    } catch (e) {
      if (e instanceof LexError) {
        if (e.code === 'single-word') {
          // `state My State {`: reported, and read as a composite named by its first word so its block still parses
          syntax(e.at, e.message, 'state.single-word');
          const name = src.slice(e.at, e.end - 1).trim();
          const id = name.split(/\s+/)[0]!;
          const c: Stmt & { k: 'comp' } = { k: 'comp', id, at: [e.at, e.at + id.length], doc: [], s: src.lastIndexOf('state', e.at), e: e.end, closed: false };
          docOf().push(c);
          open.push(c);
          G.drop();
          lex.reset(e.end, open.length);
          G.depth = open.length;
          continue;
        }
        syntax(e.at, e.message);
        recover(e.at);
      } else if (e instanceof SyntaxErr) {
        syntax(e.at, e.message);
        recover(e.at);
      } else throw e;
    }
  }

  // ---- settings: frontmatter title
  const fm = frontmatterValues(front);
  const fmTitle = fm.get('title');
  if (fmTitle) model.title = stripControl(fmTitle);

  // ---- the model, as Mermaid's StateDB and data fetcher build it (document order, depth first)
  const N = model.nodes, Gs = model.groups;
  let order = 0;
  /** Composites by id while building (also before they are known as composites). */
  const lineOfAt = (at: number): number => lineAt(at);
  const pseudo = (ref: IdRef, scope: string | null, region: number, end: boolean): string => (ref.id === '[*]' ? pseudoId(scope, region, end) : ref.id);
  const kindDecl = new Map<string, number>();

  /** A mention of a state in a scope: created on the first, re-parented by every mention inside a composite. */
  const visit = (id: string, scope: string | null, region: number, line: number, kind: StateKind = 'state'): StateNode | StateGroup | null => {
    const g = Gs.get(id);
    if (g) {
      g.lines.add(line);
      if (scope !== null && scope !== id) {
        g.parent = scope;
        g.region = region;
      }
      return g;
    }
    let n = N.get(id);
    if (!n) {
      if (!budget.take(line)) return null;
      const k: StateKind = isPseudo(id) ? (id.endsWith('end') ? 'end' : 'start') : kind;
      n = { id, kind: k, label: '', descriptions: [], texts: [], parent: scope, region, classes: [], style: {}, lines: new Set(), defLine: null, order: order++ };
      N.set(id, n);
    } else if (scope !== null) {
      n.parent = scope;
      n.region = region;
    }
    n.lines.add(line);
    return n;
  };
  const classUses: { cls: string; line: number }[] = [];
  const addClass = (item: StateNode | StateGroup | null, cls: string | undefined, line: number): void => {
    if (!item || !cls) return;
    item.classes.push(cls);
    classUses.push({ cls, line });
  };
  const addText = (item: StateNode | StateGroup | null, text: string, form: 'as' | 'colon', line: number, at: [number, number]): void => {
    if (!item) return;
    item.texts.push({ text: textOf(text), form, line, start: at[0], end: at[1] });
    if ('kind' in item && item.defLine === null) item.defLine = line;
  };
  const styles: { ids: string[]; st: MermaidStyle }[] = [];
  const classes: { ids: string[]; cls: string; line: number }[] = [];
  const clicks: { id: string; url: string; tooltip?: string }[] = [];
  let edgeCount = new Map<string, number>();
  let noteN = 0;

  const walk = (doc: readonly Stmt[], scope: string | null, block: StateBlock | null): void => {
    let region = 0;
    for (const st of doc) {
      const line = lineOfAt(st.s);
      switch (st.k) {
        // `a:::c` and `a:::c : text` on their own: Mermaid's StateDB drops the class (only a transition's ends keep it)
        case 'state':
          visit(pseudo(st.ref, scope, region, false), scope, region, line);
          break;
        case 'desc': {
          const it = visit(pseudo(st.ref, scope, region, false), scope, region, line);
          addText(it, raw(st.at), 'colon', line, st.at);
          break;
        }
        case 'as': {
          const it = visit(st.id, scope, region, line);
          addText(it, raw(st.title.at), 'as', line, st.title.at);
          if (st.more !== undefined && it) it.texts.push({ text: textOf(st.more.trim()), form: 'colon', line, start: st.at[1], end: st.at[1] });
          if (it && 'kind' in it) it.defLine = line;
          break;
        }
        case 'decl': {
          const known = N.has(st.id) || Gs.has(st.id);
          const it = visit(st.id, scope, region, line, st.kind);
          if (it && 'kind' in it) {
            if (it.defLine === null || !known) it.defLine = line;
            if (known && it.kind !== st.kind) {
              // Mermaid keeps the kind of the first mention
              D.push(diag('warning', 'state.kind-late', `Mermaid draws "${st.id}" as a ${it.kind === 'state' ? 'plain state' : it.kind}: declare it as <<${st.kind}>> before its first use`, line, { params: { id: st.id, kind: st.kind } }));
            }
          }
          kindDecl.set(st.id, line);
          break;
        }
        case 'rel': {
          const from = pseudo(st.a, scope, region, false), to = pseudo(st.b, scope, region, true);
          const a = visit(from, scope, region, line);
          const b = visit(to, scope, region, line);
          addClass(a, st.a.cls, line);
          addClass(b, st.b.cls, line);
          if (!a || !b || !budget.take(line)) break;
          const key = `${from}->${to}`;
          const n = (edgeCount.get(key) ?? 0) + 1;
          edgeCount.set(key, n);
          const e: StateEdge = {
            id: n > 1 ? `${key}#${n}` : key, from, to, label: st.label ? textOf(raw(st.label.textAt)) : '',
            src: line, index: model.edges.length, scope, region, start: st.s, end: st.e, fromAt: st.a.at, toAt: st.b.at,
          };
          if (st.label) e.labelAt = st.label.at;
          model.edges.push(e);
          // a `;` ends the label: Mermaid reads what follows as states
          if (st.label) {
            const after = src.slice(st.label.at[1], src.indexOf('\n', st.label.at[1]));
            if (after.startsWith(';')) D.push(diag('warning', 'state.semicolon', 'Mermaid ends the label at ";" and reads the rest of the line as states: write ";" as #59;', line, { fix: semicolonFix(st.label.at[1]) }));
          }
          break;
        }
        case 'note': {
          const target = pseudo(st.ref, scope, region, false);
          const it = visit(target, scope, region, line);
          if (!it || !budget.take(line)) break;
          noteN++;
          model.notes.push({
            id: `n${noteN}`, target, side: st.side, text: textOf(st.multi ? dedent(raw(st.at).replace(/\n[^\S\n]*end note$/i, '')) : st.text),
            line, endLine: lineAt(Math.max(st.s, st.e - 1)), multi: st.multi, scope, region,
          });
          break;
        }
        case 'comp': {
          let g = Gs.get(st.id);
          if (!g) {
            const n = N.get(st.id);
            if (!budget.take(line)) break;
            g = {
              id: st.id, label: '', texts: n?.texts ?? [], parent: n ? n.parent : scope, region: n ? n.region : region, children: [], order: n?.order ?? order++,
              line, blocks: [], regions: 1, lines: n?.lines ?? new Set(), classes: n?.classes ?? [], style: {},
            };
            if (n) N.delete(st.id);
            Gs.set(st.id, g);
          }
          if (scope !== null && scope !== st.id) {
            g.parent = scope;
            g.region = region;
          }
          g.lines.add(line);
          const b: StateBlock = { line, start: st.s, end: st.e, dividers: [] };
          if (st.closed) b.endLine = lineAt(st.e - 1);
          if (b.endLine !== undefined) g.lines.add(b.endLine);
          if (!g.blocks.length && b.endLine !== undefined) g.endLine = b.endLine;
          g.blocks.push(b);
          if (st.title) addText(g, raw(st.title.at), 'as', line, st.title.at);
          walk(st.doc, st.id, b);
          g.regions = Math.max(g.regions, b.dividers.length + 1);
          break;
        }
        case 'div':
          if (block) {
            block.dividers.push(line);
            region++;
          }
          break;
        case 'dir':
          if (scope === null) {
            model.direction = st.dir === 'TD' ? 'TB' : st.dir;
            model.dirLine = line;
          } else {
            const g = Gs.get(scope);
            if (g && st.dir !== 'TD') g.dir = st.dir;
          }
          break;
        case 'classDef': {
          const st2 = parseStyleList(st.styles, (msg) => D.push(diag('warning', 'state.bad-style', msg, line)));
          model.classDefs[st.name] = st2;
          model.classDefLines[st.name] = line;
          if (st.isDefault) {
            model.classDefs['default'] = st2;
            D.push(diag('warning', 'state.classdef-default', 'Stock Mermaid (11.17, 12.2) fails to parse "classDef default" in a state diagram; mmdx applies it to every state', line, {
              fix: { title: 'Remove the line', apply: (c: string) => removeLine(c, line) },
            }));
          }
          break;
        }
        case 'class':
          classes.push({ ids: st.ids.split(',').map((x) => x.trim()).filter(Boolean), cls: st.cls, line });
          break;
        case 'style':
          styles.push({ ids: st.ids.split(',').map((x) => x.trim()).filter(Boolean), st: parseStyleList(st.styles.replace(/;/g, ''), (msg) => D.push(diag('warning', 'state.bad-style', msg, line))) });
          break;
        case 'click': {
          const id = pseudo(st.ref, scope, region, false);
          const c: { id: string; url: string; tooltip?: string } = { id, url: st.url };
          if (st.tooltip) c.tooltip = st.tooltip;
          clicks.push(c);
          break;
        }
        case 'acc':
          if (st.what === 'title') model.accTitle = stripControl(st.text);
          else model.accDescr = st.text.split('\n').map((l) => stripControl(l).trim()).filter(Boolean).join('\n');
          break;
        case 'skip':
          break;
      }
    }
  };
  walk(root, null, null);
  edgeCount = new Map();

  // ---- `direction TD`: Mermaid has no TD, it reads two states
  for (const [id, n] of N)
    if (id === 'TD' && N.has('direction')) {
      const li = [...n.lines][0]!;
      D.push(diag('warning', 'state.td', 'Mermaid has no "direction TD" in state diagrams (it draws two states): use TB', li, {
        fix: { title: 'Use TB', apply: (c: string) => replaceOnLine(c, li, /\bdirection(\s+)TD\b/i, 'direction$1TB') },
      }));
    }

  // ---- titles and description rows; composites have a title only
  for (const n of N.values()) {
    if (n.kind === 'start' || n.kind === 'end') continue;
    n.label = n.texts[0]?.text ?? n.id;
    n.descriptions = n.texts.slice(1).map((t) => t.text);
    if (n.defLine === null && n.texts.length) n.defLine = n.texts[0]!.line;
  }
  for (const g of Gs.values()) {
    g.label = g.texts[0]?.text ?? g.id;
    if (g.texts.length > 1)
      D.push(diag('error', 'state.composite-description', `Mermaid fails on a composite state with description rows ("${g.id}" has ${g.texts.length} texts): give it one title`, g.texts[1]!.line, { params: { id: g.id } }));
  }

  // ---- the tree: children in code order (cycles cut: a composite inside itself goes to the top level)
  for (const g of Gs.values()) {
    const seen = new Set<string>([g.id]);
    for (let p = g.parent; p; p = Gs.get(p)?.parent ?? null) {
      if (seen.has(p)) {
        g.parent = null;
        g.region = 0;
        break;
      }
      seen.add(p);
    }
  }
  const kids = [...[...N.values()].map((n) => ({ id: n.id, parent: n.parent, order: n.order })), ...[...Gs.values()].map((g) => ({ id: g.id, parent: g.parent, order: g.order }))].sort((a, b) => a.order - b.order);
  for (const k of kids) if (k.parent) Gs.get(k.parent)?.children.push(k.id);
  for (const n of N.values()) if (n.parent && !Gs.has(n.parent)) n.parent = null;

  // ---- classes, styles, links
  const item = (id: string): StateNode | StateGroup | undefined => N.get(id) ?? Gs.get(id);
  for (const c of classes) for (const id of c.ids) addClass(item(id) ?? null, c.cls, c.line);
  for (const s of styles) for (const id of s.ids) {
    const it = item(id);
    if (it) it.style = { ...it.style, ...s.st };
  }
  for (const c of clicks) {
    const it = item(c.id);
    if (!it) continue;
    it.link = c.url;
    if (c.tooltip) it.tooltip = c.tooltip;
  }
  const seenUse = new Set<string>();
  for (const u of classUses)
    if (!Object.hasOwn(model.classDefs, u.cls) && !seenUse.has(u.cls)) {
      seenUse.add(u.cls);
      model.undefinedClasses.push(u);
    }

  // ---- transitions between the inner states of two composites (Mermaid forbids them; mmdx draws them)
  const holder = (id: string): string | null => N.get(id)?.parent ?? Gs.get(id)?.parent ?? null;
  for (const e of model.edges) {
    const a = holder(e.from), b = holder(e.to);
    if (a && b && a !== b && !isPseudo(e.from) && !isPseudo(e.to))
      D.push(diag('warning', 'state.cross-composite', `Mermaid does not allow a transition between states of different composites ("${e.from}" in "${a}", "${e.to}" in "${b}"); mmdx draws it`, e.src, { params: { from: e.from, to: e.to } }));
  }
  return model;
}

/** Common indentation removed from a multi-line note's lines (Mermaid's markdown drops it). */
function dedent(t: string): string {
  const lines = t.replace(/^\s*\n/, '').split('\n');
  const ind = minOf(lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0).trimEnd()).join('\n').trim();
}

function removeLine(code: string, li: number): string {
  const L = code.split('\n');
  L.splice(li, 1);
  return L.join('\n');
}

function replaceOnLine(code: string, li: number, re: RegExp, to: string): string {
  const L = code.split('\n');
  if (L[li] !== undefined) L[li] = L[li]!.replace(re, to);
  return L.join('\n');
}

/** The `state.semicolon` fix: the `;` at `at` (and every `;` after it on the line) written as `#59;`. */
function semicolonFix(at: number): DiagnosticFix {
  return {
    title: 'Write ";" as #59;',
    apply: (c: string) => {
      const nl = c.indexOf('\n', at);
      const e = nl < 0 ? c.length : nl;
      return c.slice(0, at) + c.slice(at, e).replace(/;/g, '#59;') + c.slice(e);
    },
  };
}
