// Mermaid mindmap parser (T08): Mermaid's lexer rules (mindmap.jison, 11.17 and 12.2) reproduced statement by
// statement, so what Mermaid reads as one node mmdx reads the same way — indentation counted in characters (a tab is
// one), the parent the nearest earlier node with a smaller indentation, the seven shapes from their delimiters (with
// the lexer's quirks: `id(text(` is a cloud, `(-text-)` the default shape), quoted and markdown text over several
// lines, `::icon(…)` and `:::classes` attached to the node before them. A statement Mermaid rejects is reported and
// skipped (mmdx goes on at the next line, so a half-typed node does not swallow the rest of the map).
import type { MindmapConfig, MindmapModel, MindNode, MindShape } from '../model.js';
import { diag } from '../types.js';
import { frontmatterAt, frontmatterValues } from './frontmatter.js';
import { initKey, initSection, lineIndex, textOnly } from './kit.js';
import { cleanLabel, markdownText } from './label.js';
import { ItemBudget, stripControl } from './limits.js';

/** Mermaid's default `maxNodeWidth`. */
const MIND_WRAP = 200;

export function emptyMindmap(): MindmapModel {
  return { type: 'mindmap', root: null, nodes: new Map(), colorBy: 'branch', maxNodeWidth: MIND_WRAP, config: {}, header: -1, indentUnit: '  ', diagnostics: [] };
}

// ---- lexer --------------------------------------------------------------------------------------------------------

type TokType = 'MINDMAP' | 'SPACELIST' | 'ICON' | 'CLASS' | 'START' | 'DESCR' | 'END' | 'ID' | 'STOP';

interface Tok {
  t: TokType;
  v: string;
  at: number;
  /** DESCR: read inside `"…"` (str) or `"`…`"` (md). */
  q?: 'str' | 'md';
}

// INITIAL state, in Mermaid's rule order (jison takes the first rule that matches)
const COMMENT = /^\s*%%.*/;
const HEADER = /^mindmap\b/i;
const SPACELINE = /^\s+\n/;
const NL = /^\n+/;
const STARTS = /^(?:-\)|\(-|\)\)|\)|\(\(|\{\{|\(|\[)/;
const SPACES = /^\s+/;
const NODE_ID = /^[^([\n){}]+/;
// NODE state
const ENDS = /^(?:\)\)|\)|\]|\}\}|\(-|-\)|\(\(|\()/;
const DESCR = /^[^)\](}]+/;

/**
 * The tokens of one statement from `pos` (the start of a line, or after a statement): up to and including its stop
 * (a line break, a blank line or the end). `bad` is set when Mermaid's lexer has no rule for the text.
 */
function lexStatement(src: string, pos: number): { toks: Tok[]; end: number; bad: boolean } {
  const toks: Tok[] = [];
  let p = pos;
  const rest = (): string => src.slice(p);
  const push = (t: TokType, v: string, extra: Partial<Tok> = {}): void => void toks.push({ t, v, at: p, ...extra });
  while (p <= src.length) {
    if (p === src.length) {
      push('STOP', '');
      return { toks, end: p, bad: false };
    }
    const s = rest();
    let m: RegExpExecArray | null;
    if ((m = COMMENT.exec(s))) {
      p += m[0].length;
      continue;
    }
    if ((m = HEADER.exec(s))) {
      push('MINDMAP', m[0]);
      p += m[0].length;
      continue;
    }
    if (s.startsWith(':::')) {
      p += 3;
      const nl = src.indexOf('\n', p);
      const e = nl < 0 ? src.length : nl;
      if (e > p) push('CLASS', src.slice(p, e));
      p = e;
      continue;
    }
    if (/^::icon\(/i.test(s)) {
      p += 7;
      const close = src.indexOf(')', p);
      const e = close < 0 ? src.length : close;
      if (e > p) push('ICON', src.slice(p, e));
      p = close < 0 ? e : e + 1;
      continue;
    }
    if ((m = SPACELINE.exec(s)) || (m = NL.exec(s))) {
      push('STOP', m[0]);
      p += m[0].length;
      return { toks, end: p, bad: false };
    }
    if ((m = STARTS.exec(s))) {
      push('START', m[0]);
      p += m[0].length;
      // NODE state: the text (plain, "quoted" or "`markdown`") and the closing delimiter
      for (;;) {
        const n = src.slice(p);
        if (n.startsWith('"`')) {
          const close = src.indexOf('`"', p + 2);
          const e = close < 0 ? src.length : close;
          // Mermaid's NSTR2 text stops at any backtick or quote
          const stop = /[`"]/.exec(src.slice(p + 2, e));
          const te = stop ? p + 2 + stop.index : e;
          if (te > p + 2) toks.push({ t: 'DESCR', v: src.slice(p + 2, te), at: p + 2, q: 'md' });
          if (te !== e || close < 0) return { toks, end: te, bad: true };
          p = e + 2;
          continue;
        }
        if (n.startsWith('"')) {
          const close = src.indexOf('"', p + 1);
          if (close < 0) return { toks, end: src.length, bad: true };
          if (close > p + 1) toks.push({ t: 'DESCR', v: src.slice(p + 1, close), at: p + 1, q: 'str' });
          p = close + 1;
          continue;
        }
        if ((m = ENDS.exec(n))) {
          push('END', m[0]);
          p += m[0].length;
          break;
        }
        if ((m = DESCR.exec(n))) {
          push('DESCR', m[0]);
          p += m[0].length;
          continue;
        }
        // a lone `}`: Mermaid's last rule takes the rest of the line as text (and the statement then fails)
        const nl = src.indexOf('\n', p);
        const e = nl < 0 ? src.length : nl;
        push('DESCR', src.slice(p, e));
        p = e;
        if (p >= src.length) break;
      }
      continue;
    }
    if ((m = SPACES.exec(s))) {
      push('SPACELIST', m[0]);
      p += m[0].length;
      continue;
    }
    if ((m = NODE_ID.exec(s))) {
      push('ID', m[0]);
      p += m[0].length;
      continue;
    }
    // no rule matches (a lone `{`, `}`)
    const nl = src.indexOf('\n', p);
    return { toks, end: nl < 0 ? src.length : nl, bad: true };
  }
  return { toks, end: p, bad: false };
}

/** Mermaid's `getType`: the shape from the opening delimiter (and, for `(`, the closing one). */
function shapeOf(open: string, close: string): MindShape {
  switch (open) {
    case '[':
      return 'rect';
    case '(':
      return close === ')' ? 'rounded' : 'cloud';
    case '((':
      return 'circle';
    case ')':
      return 'cloud';
    case '))':
      return 'bang';
    case '{{':
      return 'hexagon';
    default:
      return 'mm-default';
  }
}

/** The delimiters mmdx writes for a shape (Mermaid's own forms). */
export const MIND_DELIMS: Readonly<Record<MindShape, readonly [string, string]>> = {
  'mm-default': ['', ''], rect: ['[', ']'], rounded: ['(', ')'], circle: ['((', '))'], bang: ['))', '(('], cloud: [')', '('], hexagon: ['{{', '}}'],
};

export const MIND_SHAPES: readonly MindShape[] = ['mm-default', 'rect', 'rounded', 'circle', 'bang', 'cloud', 'hexagon'];

// ---- settings -----------------------------------------------------------------------------------------------------

/** `config.mindmap.colorBy` / `maxNodeWidth` from frontmatter keys or an `%%{init}%%` directive. */
function mindConfig(v: ReadonlyMap<string, string>): MindmapConfig {
  const c: MindmapConfig = {};
  const by = v.get('config.mindmap.colorBy');
  if (by === 'branch' || by === 'depth') c.colorBy = by;
  const w = Number(v.get('config.mindmap.maxNodeWidth'));
  if (Number.isFinite(w) && w >= 20 && w <= 2000) c.maxNodeWidth = w;
  return c;
}

function initValues(t: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = initSection(t, 'mindmap');
  for (const k of ['colorBy', 'maxNodeWidth']) {
    const v = initKey(body, k);
    if (v !== undefined) out.set(`config.mindmap.${k}`, v);
  }
  return out;
}

// ---- parser -------------------------------------------------------------------------------------------------------


/** Lines Mermaid's mindmap has no syntax for (it draws them as nodes): `classDef x …`, `style id a:b`. */
const NOT_MINDMAP = /^(?:classDef\s+\S+|style\s+\S+\s+\S*:)/;

interface Raw {
  node: MindNode;
  level: number;
}

export function parseMindmap(code: string): MindmapModel {
  const model = emptyMindmap();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const src = code.replace(/\r/g, ' ');
  const lineAt = lineIndex(src);
  const settings = new Map<string, string>();

  // frontmatter: kept in the code, read for the settings that change the drawing
  let pos = 0;
  {
    const lines = src.split('\n');
    const fm = frontmatterAt(lines);
    if (fm) {
      for (const [k, v] of frontmatterValues(lines.slice(fm.start + 1, fm.end))) settings.set(k, v);
      for (let k = 0; k <= fm.end; k++) pos += lines[k]!.length + 1;
    }
    for (const l of lines) if (/^\s*%%\{/.test(l)) for (const [k, v] of initValues(l)) settings.set(k, v);
  }

  const raws: Raw[] = [];
  let baseLevel: number | undefined;
  let headerSeen = false;
  const syntax = (line: number, what: string): void =>
    void D.push(diag('error', 'mm.syntax', `Mermaid cannot read this line of the mindmap${what ? ` (${what})` : ''}`, line));

  while (pos < src.length) {
    const { toks, end, bad } = lexStatement(src, pos);
    const line = lineAt(toks[0]?.at ?? pos);
    const body = toks.filter((t) => t.t !== 'STOP');
    const next = (): number => {
      // a failed statement: go on at the next line
      const nl = src.indexOf('\n', pos);
      return Math.max(end, nl < 0 ? src.length : nl + 1);
    };
    if (!headerSeen) {
      const h = body.findIndex((t) => t.t === 'MINDMAP');
      if (h < 0) {
        if (body.some((t) => t.t !== 'SPACELIST')) syntax(line, 'before the "mindmap" header');
        pos = bad ? next() : end;
        continue;
      }
      headerSeen = true;
      model.header = line;
      body.splice(0, h + 1);
      if (!body.some((t) => t.t !== 'SPACELIST')) {
        pos = end;
        continue;
      }
    }
    if (bad) {
      syntax(line, '');
      pos = next();
      continue;
    }
    pos = end;
    if (!body.length) continue;
    let i = 0;
    let level = 0, indentText = '';
    if (body[0]!.t === 'SPACELIST') {
      indentText = body[0]!.v;
      level = indentText.length;
      i = 1;
    }
    const first = body[i];
    if (!first) continue;
    const last = raws[raws.length - 1]?.node;
    if (first.t === 'ICON' || first.t === 'CLASS') {
      if (i + 1 !== body.length) {
        syntax(line, '');
        continue;
      }
      if (!last) {
        D.push(diag('error', 'mm.dangling', `${first.t === 'ICON' ? '::icon' : ':::'} belongs to the node before it, and there is none`, line));
        continue;
      }
      if (first.t === 'ICON') {
        last.icon = stripControl(first.v).trim();
        D.push(diag('info', 'mm.icon-not-drawn', 'Stock Mermaid does not draw ::icon() (mmdx does); an icon written as a label token (fa:fa-book) shows in both', line));
      } else last.classes = stripControl(first.v).trim().split(/\s+/).filter(Boolean);
      last.endLine = Math.max(last.endLine, line);
      continue;
    }
    // a node: ID | ID START DESCR END | START DESCR END
    let written: string | null = null, open = '', close = '', text = '', quote: MindNode['quote'] = 'none';
    let k = i;
    if (body[k]?.t === 'ID') written = body[k++]!.v;
    if (body[k]?.t === 'START') {
      const s = body[k]!, d = body[k + 1], e = body[k + 2];
      if (d?.t !== 'DESCR' || e?.t !== 'END') {
        syntax(line, d?.t === 'DESCR' ? 'the text needs quotes or a closing bracket' : 'no text between the brackets');
        continue;
      }
      open = s.v;
      close = e.v;
      text = d.v;
      quote = d.q === 'md' ? 'md' : d.q === 'str' ? 'str' : 'none';
      k += 3;
    } else if (written === null) {
      syntax(line, '');
      continue;
    } else text = written;
    if (k !== body.length) {
      syntax(line, 'the text needs quotes');
      continue;
    }
    if (!budget.take(line)) break;
    const idText = written !== null ? stripControl(written).trim() : null;
    const rawText = quote === 'none' ? text.trim() : text;
    let label = textOnly(cleanLabel(quote === 'md' ? `\`${rawText}\`` : `"${rawText}"`));
    if (quote === 'md') label = markdownText(label);
    const lastTok = body[body.length - 1]!;
    const stmtStart = body[i]!.at;
    const stmtEnd = lastTok.at + lastTok.v.length;
    const node: MindNode = {
      id: '',
      written: open ? idText || null : null,
      label,
      md: quote === 'md',
      shape: shapeOf(open, close),
      open, close, quote,
      parent: null, children: [], depth: 0, section: -1,
      icon: null, classes: [],
      line, endLine: lineAt(stmtEnd), indentText, indent: level,
      start: stmtStart, end: stmtEnd,
    };
    if (NOT_MINDMAP.test(rawText) && !open)
      D.push(diag('warning', 'mm.classdef', 'A mindmap has no classDef or style: Mermaid draws this line as a node', line));
    // Mermaid: the first node is the root at level 0; the others are placed relative to it
    if (baseLevel === undefined) baseLevel = level;
    const rel = raws.length ? level - baseLevel : 0;
    raws.push({ node, level: rel });
  }

  // ids: a unique written id, else the node's place in the code
  const count = new Map<string, number>();
  for (const { node } of raws) if (node.written) count.set(node.written, (count.get(node.written) ?? 0) + 1);
  const taken = new Set([...count].filter(([, n]) => n === 1).map(([id]) => id));
  raws.forEach(({ node }, k) => {
    if (node.written && count.get(node.written) === 1) node.id = node.written;
    else {
      let id = `mm${k + 1}`, j = 2;
      while (taken.has(id)) id = `mm${k + 1}_${j++}`;
      taken.add(id);
      node.id = id;
    }
  });

  // the tree: the parent is the nearest earlier node with a smaller level (Mermaid's getParent)
  raws.forEach(({ node, level }, k) => {
    model.nodes.set(node.id, node);
    if (k === 0) {
      model.root = node.id;
      return;
    }
    let parent: MindNode | null = null;
    for (let j = k - 1; j >= 0; j--) if (raws[j]!.level < level) {
      parent = raws[j]!.node;
      break;
    }
    if (!parent) {
      D.push(diag('error', 'mm.second-root', `There can be only one root: Mermaid finds no parent for "${node.label.split('\n')[0]}" (indent it under the root)`, node.line));
      parent = raws[0]!.node;
    }
    node.parent = parent.id;
    parent.children.push(node.id);
  });

  const config = mindConfig(settings);
  model.config = config;
  model.colorBy = config.colorBy ?? 'branch';
  model.maxNodeWidth = config.maxNodeWidth ?? MIND_WRAP;
  assignDepths(model);

  // the indentation step new lines take: the most common step between a node and its parent
  const steps = new Map<string, number>();
  for (const n of model.nodes.values()) {
    const p = n.parent ? model.nodes.get(n.parent) : undefined;
    if (!p || n.indent <= p.indent) continue;
    const step = n.indentText.startsWith(p.indentText) ? n.indentText.slice(p.indentText.length) : n.indentText.slice(0, n.indent - p.indent);
    steps.set(step, (steps.get(step) ?? 0) + 1);
  }
  let best = '';
  for (const [s, n] of steps) if (!best || n > (steps.get(best) ?? 0)) best = s;
  if (best) model.indentUnit = best;
  if (!headerSeen) D.push(diag('error', 'mm.header', 'The mindmap header is missing'));
  return model;
}

/** Depths and sections (Mermaid's `assignSections`: each child of the root starts section i % 11; or by depth). */
export function assignDepths(model: MindmapModel): void {
  const root = model.root ? model.nodes.get(model.root) : undefined;
  if (!root) return;
  root.depth = 0;
  root.section = -1;
  // iterative: the depth is user input
  const stack: MindNode[] = [root];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    n.children.forEach((cid, i) => {
      const c = model.nodes.get(cid);
      if (!c) return;
      c.depth = n.depth + 1;
      c.section = model.colorBy === 'depth' ? (c.depth - 1) % 12 : n.depth === 0 ? i % 11 : n.section;
      stack.push(c);
    });
  }
}

/** Descendants of a node (any depth). */
export function descendantsOf(model: MindmapModel, id: string): string[] {
  const out: string[] = [];
  const stack = [...(model.nodes.get(id)?.children ?? [])].reverse();
  const seen = new Set<string>([id]);
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    stack.push(...[...(model.nodes.get(c)?.children ?? [])].reverse());
  }
  return out;
}

/** A node's key for matching across versions: its path of labels, its label and its place among same-label siblings. */
export function mindKeys(model: MindmapModel): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (id: string, path: string): void => {
    const n = model.nodes.get(id);
    if (!n) return;
    const seen = new Map<string, number>();
    for (const c of n.children) {
      const k = model.nodes.get(c);
      if (!k) continue;
      const i = seen.get(k.label) ?? 0;
      seen.set(k.label, i + 1);
      const key = `${path}\u0001${k.label}\u0002${i}`;
      out.set(c, key);
      walk(c, key);
    }
  };
  if (model.root) {
    const r = model.nodes.get(model.root)!;
    out.set(r.id, `\u0000${r.label}`);
    walk(r.id, `\u0000${r.label}`);
  }
  return out;
}
