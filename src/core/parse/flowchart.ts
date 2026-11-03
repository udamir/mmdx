// Mermaid flowchart parser (the commonly used subset, A.9).
// Line fields are 0-based whole lines; statements split by `;` share a line.
import type {
  BracketSpan, Direction, EdgeHead, EdgeLine, FlowConfig, FlowEdge, FlowGroup, FlowLink, FlowMention, FlowNode, FlowNodeData, FlowStatement, FlowchartModel,
  MermaidStyle, NodeShape,
} from '../model.js';
import { EXTENDED_NAMES } from '../shapes/names.js';
import { namedShapes, registerShapeNames, resolveShape } from '../shapes/registry.js';
import { diag } from '../types.js';
import { frontmatterValues } from './frontmatter.js';
import { cleanLabel, encodeLabel, isMarkdownString, markdownText } from './label.js';
import { ItemBudget, stripControl } from './limits.js';
import { applySplices, openBlock, readNodeData, type NodeDataBlock, type Splice } from './node-data.js';
import { parseStyleList } from './style.js';

// every Mermaid shape name, without the geometry of the shapes beyond the 17 (which loads when one is drawn, T02.9)
registerShapeNames(EXTENDED_NAMES);

/** The bracket forms, from the shapes' names: an opener with its closers and the shape each closer gives, longest openers first (`(((` before `((`). */
const OPENERS: readonly (readonly [open: string, closers: readonly string[], shapes: readonly NodeShape[]])[] = (() => {
  const by = new Map<string, { closers: string[]; shapes: NodeShape[] }>();
  for (const d of namedShapes()) {
    if (!d.bracket) continue;
    let e = by.get(d.bracket[0]);
    if (!e) by.set(d.bracket[0], (e = { closers: [], shapes: [] }));
    e.closers.push(d.bracket[1]);
    e.shapes.push(d.id);
  }
  return [...by].sort((a, b) => b[0].length - a[0].length).map(([open, e]) => [open, e.closers, e.shapes] as const);
})();
const ID = /^[A-Za-z0-9_À-￿](?:[A-Za-z0-9_À-￿]|-(?=[A-Za-z0-9_À-￿]))*/;
// `-- text -->`: the opener, then the first closer that follows a whitespace run. Two regexes instead of the
// prototype's `\s+(.+?)\s+(closer)`, which backtracks cubically on long runs of spaces.
const INLINE_OPEN = /^([<ox])?(--|==|-\.)\s+/;
const INLINE_CLOSE = /(?<!\s)\s+(-{2,}|={2,}|\.-)(>|[ox](?![\w]))?/g;
const EDGE = /^(<|[ox](?=[-=]))?(-{2,}|={2,}|-\.+-|~{3,})(>|[ox](?![\w]))?/;
const PIPE = /^\s*\|([^|]*)\|/;
// Mermaid v11 edge ids: `A e1@--> B`, then `e1@{ animate: true }`
const EDGE_ID = /^([A-Za-z0-9_][\w-]*)@(?=[<ox]?[-=.])/;
const HEADER = /^(flowchart|graph)(-elk)?\b\s*(TB|TD|BT|LR|RL)?/i;
/** Mermaid's curve names (`flowchart.curve`, `linkStyle … interpolate`, an edge's `curve`). */
export const FLOW_CURVES: readonly string[] = ['basis', 'bumpX', 'bumpY', 'cardinal', 'catmullRom', 'linear', 'monotoneX', 'monotoneY', 'natural', 'step', 'stepAfter', 'stepBefore'];
const ELK_HINT = /\b(?:layout\s*:\s*["']?elk|defaultRenderer["']?\s*:\s*["']?elk)/i;

/** The statements of a line split at `;` (outside quotes and brackets), trimmed, each with its offset in the line. */
function splitStatements(line: string): { t: string; off: number }[] {
  const out: { t: string; off: number }[] = [];
  let q = false, depth = 0, start = 0;
  const push = (end: number): void => {
    const raw = line.slice(start, end);
    const t = raw.trim();
    if (t) out.push({ t, off: start + (raw.length - raw.trimStart().length) });
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') q = !q;
    if (!q && '[({'.includes(ch)) depth++;
    if (!q && '])}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ';' && !q && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(line.length);
  return out;
}

/**
 * Searches within one statement that remember misses: a token absent after position q is absent after any later
 * position, so repeated failing searches (`A[ & A[ & …`, long edge chains) stay linear instead of rescanning the line.
 */
class Finder {
  private readonly miss = new Map<string, number>();
  constructor(readonly s: string) {}

  indexOf(tok: string, from: number): number {
    const m = this.miss.get(tok);
    if (m !== undefined && from >= m) return -1;
    const i = this.s.indexOf(tok, from);
    if (i < 0) this.miss.set(tok, Math.min(m ?? Infinity, from));
    return i;
  }

  /** INLINE_CLOSE from `from`; the result's index is absolute. */
  inlineClose(from: number): RegExpExecArray | null {
    const m = this.miss.get('\0close');
    if (m !== undefined && from >= m) return null;
    INLINE_CLOSE.lastIndex = from;
    const c = INLINE_CLOSE.exec(this.s);
    if (!c) this.miss.set('\0close', Math.min(m ?? Infinity, from));
    return c;
  }
}

interface InlineEdge {
  start?: string;
  body: string;
  raw: string;
  end?: string;
  length: number;
  /** The same link without its text (`-- a -->` → `-->`, `-. a .->` → `-.->`). */
  arrow: string;
}

function inlineEdge(F: Finder, pos: number): InlineEdge | null {
  const rest = F.s.slice(pos);
  const o = INLINE_OPEN.exec(rest);
  if (!o) return null;
  const c = F.inlineClose(pos + o[0].length + 1); // the label has at least one character
  if (!c) return null;
  const at = c.index - pos;
  const r: InlineEdge = {
    body: (o[2] ?? '') + (c[1] ?? ''), raw: rest.slice(o[0].length, at), length: at + c[0].length,
    arrow: (o[1] ?? '') + (o[2] === '-.' ? '-' : '') + (c[1] ?? '') + (c[2] ?? ''),
  };
  if (o[1]) r.start = o[1];
  if (c[2]) r.end = c[2];
  return r;
}

/**
 * A link's length in ranks (Mermaid's `destructEndLink`): the link without its closing character (and the start head
 * of a two-headed link) less one, or its dots when it is dotted — `-->` and `---` 1, `---->` 3, `-.-` and `-.->` 1,
 * `-..->` 2; a labelled link counts its closing part (`-- a --->` 2). At most 10, as Mermaid.
 */
export function linkLength(token: string): number {
  const last = token.slice(-1);
  let line = token.slice(0, -1);
  if ((last === '>' && token[0] === '<') || ((last === 'x' || last === 'o') && token[0] === last)) line = line.slice(1);
  const dots = line.split('.').length - 1;
  return Math.min(10, Math.max(1, dots || line.length - 1));
}

const headOf = (c: string | undefined): EdgeHead =>
  c === '>' || c === '<' ? 'arrow' : c === 'x' ? 'cross' : c === 'o' ? 'circle' : 'none';

export function emptyFlowchart(): FlowchartModel {
  return {
    type: 'flowchart', direction: 'TB', nodes: new Map(), groups: new Map(), edges: [],
    // null-prototype records: `classDef __proto__ …` is just a name
    classDefs: Object.create(null) as Record<string, MermaidStyle>,
    linkStyles: Object.create(null) as Record<string, MermaidStyle>,
    undefinedClasses: [], idClashes: [], statements: [], diagnostics: [],
  };
}

interface StyleRef { id: string; line: number; what: 'class' | 'style' }
interface ReadNode { id: string; p: number; mention: FlowMention }
interface ReadEdge { p: number; label: string; line: EdgeLine; start: EdgeHead; end: EdgeHead; minlen: number; link: FlowLink; md?: true; uid?: string }

/** The node data keys typed onto a node (besides `shape` and `label`). */
const DATA_STRINGS = ['labelType', 'icon', 'form', 'pos', 'img', 'constraint'] as const;
/** The values Mermaid draws for an icon node's frame, a caption's position and an image's aspect lock. */
const DATA_VALUES: Readonly<Record<string, readonly string[]>> = { form: ['square', 'circle', 'rounded'], pos: ['t', 'b'], constraint: ['on', 'off'] };

/** A markdown string's text (`"`…`"`); null for any other label. */
const mdText = (raw: string): string | null => (isMarkdownString(raw) ? markdownText(cleanLabel(raw)) : null);

/** Settings of an `%%{init: {…}}%%` directive (JSON-ish: keys and values, quoted or not), as frontmatter keys. */
function initValues(t: string): Map<string, string> {
  const out = new Map<string, string>();
  const at = (k: string): RegExpExecArray | null => new RegExp(`["']?${k}["']?\\s*:\\s*(?:["']([^"']*)["']|([\\w.]+))`).exec(t);
  const flow = /["']?flowchart["']?\s*:\s*\{([^}]*)\}/.exec(t)?.[1] ?? '';
  for (const k of ['curve', 'htmlLabels', 'wrappingWidth']) {
    const m = new RegExp(`["']?${k}["']?\\s*:\\s*(?:["']([^"']*)["']|([\\w.]+))`).exec(flow);
    if (m) out.set(`config.flowchart.${k}`, m[1] ?? m[2] ?? '');
  }
  for (const k of ['htmlLabels', 'markdownAutoWrap']) {
    const m = at(k);
    if (m && !out.has(`config.flowchart.${k}`)) out.set(`config.${k}`, m[1] ?? m[2] ?? '');
  }
  return out;
}

/** The settings a flowchart follows, from frontmatter / init keys (`config.` prefixed). */
function flowConfig(v: ReadonlyMap<string, string>): FlowConfig | undefined {
  const c: FlowConfig = {};
  const curve = v.get('config.flowchart.curve');
  if (curve && FLOW_CURVES.includes(curve)) c.curve = curve;
  const bool = (k: string): boolean | undefined => (v.get(k) === 'false' ? false : v.get(k) === 'true' ? true : undefined);
  const html = bool('config.flowchart.htmlLabels') ?? bool('config.htmlLabels');
  if (html !== undefined) c.htmlLabels = html;
  const wrap = bool('config.markdownAutoWrap');
  if (wrap !== undefined) c.markdownAutoWrap = wrap;
  const ww = Number(v.get('config.flowchart.wrappingWidth'));
  if (Number.isFinite(ww) && ww >= 20 && ww <= 2000) c.wrappingWidth = ww;
  return Object.keys(c).length ? c : undefined;
}

/** A markdown string that a line opens and does not close (it goes on over the next lines, as in Mermaid). */
function openMarkdown(s: string): boolean {
  let open = false;
  for (let i = 0; i < s.length - 1; i++) {
    if (!open && s[i] === '"' && s[i + 1] === '`') { open = true; i++; }
    else if (open && s[i] === '`' && s[i + 1] === '"') { open = false; i++; }
  }
  return open;
}

export function parseFlowchart(code: string): FlowchartModel {
  const model = emptyFlowchart();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const stack: string[] = [];
  const edgeCount = new Map<string, number>();
  const edgeIds = new Set<string>();
  let curLine = 0; // source line of the statement being parsed (0-based)
  let F = new Finder('');
  let base = 0; // code offset of the statement being parsed
  const lines = code.split('\n');
  let headerSeen = false;
  // Style statements, checked once the whole file is read (classDefs may come after their use).
  const classUses: { cls: string; line: number }[] = [];
  const styleRefs: StyleRef[] = [];
  const linkUses: { i: number; line: number }[] = [];
  const styleWarn = (msg: string): void => { D.push(diag('warning', 'flow.bad-style', msg, curLine)); };
  // a markdown string keeps its emphasis (drawn as runs); line breaks and indentation as Mermaid reads them
  const label = (raw: string): string => mdText(raw) ?? cleanLabel(raw);

  // Subgraph membership follows Mermaid: each subgraph lists every node mentioned inside it
  // (nested blocks included); a node belongs to the first subgraph that *closes* listing it.
  // The innermost open subgraph always closes first, so a mention is recorded there only and claimed when it
  // closes: linear, where listing it in every open subgraph is O(nodes × depth).
  const mentions: Set<string>[] = []; // parallel to `stack`
  const claims = new Map<string, string>(); // node id -> subgraph that closed first listing it
  const claim = (ids: Iterable<string>, gid: string): void => { for (const id of ids) if (!claims.has(id)) claims.set(id, gid); };
  const touchNode = (id: string, mention = true): FlowNode | null => {
    let n = model.nodes.get(id);
    if (!n) {
      if (!budget.take(curLine)) return null;
      n = { id, label: id, shape: 'rect', classes: [], style: {}, parent: null, order: model.nodes.size, lines: new Set(), defLine: null };
      model.nodes.set(id, n);
    }
    n.lines.add(curLine);
    if (mention) mentions[mentions.length - 1]?.add(id);
    return n;
  };

  /** Node data onto a node: its shape and label, the other keys Mermaid knows typed, every entry kept with the block. */
  const applyBlock = (n: FlowNode, block: NodeDataBlock): void => {
    (n.blocks ??= []).push(block);
    n.defLine ??= curLine;
    for (const e of block.entries) {
      const v = e.value;
      if (e.key === 'shape' && v !== null) {
        const name = String(v);
        const r = resolveShape(name);
        n.shape = r?.names.id ?? 'rect';
        n.shapeFrom = 'data';
        if (!r) D.push(diag('warning', 'flow.unknown-shape', `unknown shape "${name}" — drawn as a rectangle (stock Mermaid fails on it)`, curLine, { params: { shape: name } }));
        else if (!r.ok && r.names.mermaid) {
          const to = r.names.mermaid;
          D.push(diag('warning', 'flow.shape-name', `"${name}" is not a shape name Mermaid accepts — use "${to}"`, curLine, {
            params: { shape: name, name: to }, fix: { title: `Use "${to}"`, apply: fixShapeNames },
          }));
        } else if (!r.ok) D.push(diag('warning', 'flow.shape-name', `the "${name}" shape is drawn by mmdx only — stock Mermaid fails on it`, curLine, { params: { shape: name } }));
      } else if (e.key === 'label' && v !== null) {
        const md = mdText(String(v)) ?? (block.entries.some((x) => x.key === 'labelType' && x.value === 'markdown') ? String(v) : null);
        n.label = md ?? label(String(v));
        if (md !== null) n.md = true;
        else delete n.md;
        n.labelFrom = 'data';
      } else if (e.key === 'w' || e.key === 'h') {
        const num = typeof v === 'number' ? v : Number(v);
        if (v !== null && v !== '' && Number.isFinite(num) && num > 0) (n.data ??= {})[e.key] = num;
        else D.push(diag('warning', 'flow.node-data-value', `"${e.key}" should be a positive number — "${String(v)}" is ignored`, curLine, { params: { key: e.key, value: String(v) } }));
      } else if ((DATA_STRINGS as readonly string[]).includes(e.key) && v !== null) {
        const known = DATA_VALUES[e.key];
        if (known && !known.includes(String(v)))
          D.push(diag('warning', 'flow.node-data-value', `"${String(v)}" is not a value of "${e.key}" (${known.join(', ')}) — ${e.key === 'form' ? 'the icon is drawn without a frame' : 'the default is used'}`, curLine, { params: { key: e.key, value: String(v) } }));
        (n.data ??= {})[e.key as (typeof DATA_STRINGS)[number]] = String(v);
      }
    }
  };

  /** Edge data onto an edge: `animate`, `animation` and `curve` typed, every entry kept with the block. */
  const applyEdgeBlock = (e: FlowEdge, block: NodeDataBlock): void => {
    (e.blocks ??= []).push(block);
    for (const x of block.entries) {
      const v = x.value;
      if (x.key === 'animate' && v !== null) (e.data ??= {}).animate = v === true || v === 'true';
      else if (x.key === 'animation' && typeof v === 'string') (e.data ??= {}).animation = v;
      else if (x.key === 'curve' && typeof v === 'string') {
        if (FLOW_CURVES.includes(v)) (e.data ??= {}).curve = v;
        else D.push(diag('warning', 'flow.node-data-value', `unknown curve "${v}" — the line's routing is used`, curLine, { params: { key: 'curve', value: v } }));
      }
    }
  };

  const readNode = (s: string, pos: number): ReadNode | null => {
    const m = ID.exec(s.slice(pos));
    if (!m) return null;
    const id = m[0];
    let p = pos + id.length;
    const idEnd = p;
    let text: string | undefined, shape: NodeShape | undefined, bracket: BracketSpan | undefined, block: NodeDataBlock | undefined;
    const rest = s.slice(p);
    if (rest.startsWith('@{')) {
      const b = readNodeData(s, p + 1, base);
      if (b) {
        block = b;
        p = b.end - base;
      } else {
        D.push(diag('warning', 'flow.node-data', `"${id}@{" is not closed — the node data is ignored`, curLine, { params: { id } }));
        p = s.length;
      }
    } else {
      for (const [open, closers, shapes] of OPENERS) {
        if (!rest.startsWith(open)) continue;
        let i = open.length;
        let t = '';
        const quoted = rest[i] === '"';
        if (quoted) {
          const q = F.indexOf('"', p + i + 1);
          const qe = q < 0 ? -1 : q - p;
          if (qe < 0) break;
          t = rest.slice(i + 1, qe);
          i = qe + 1;
          while (rest[i] === ' ') i++;
        }
        let best = -1, which = 0;
        closers.forEach((c, ci) => {
          const a = F.indexOf(c, p + i);
          const at = a < 0 ? -1 : a - p;
          if (at >= 0 && (best < 0 || at < best)) { best = at; which = ci; }
        });
        if (best < 0) break;
        if (!quoted) t = rest.slice(i, best);
        text = t;
        shape = shapes[which];
        const close = closers[which] ?? '';
        bracket = { start: base + p, text: [base + p + open.length, base + p + best], end: base + p + best + close.length, open, close };
        p += best + close.length;
        break;
      }
    }
    const mention = (): FlowMention => ({ id, start: base + pos, end: base + p, idEnd: base + idEnd, def: text !== undefined || !!block });
    const g = model.groups.get(id);
    if (g && text === undefined) { g.lines.add(curLine); return { id, p, mention: mention() }; }
    const n = touchNode(id);
    if (!n) return { id, p, mention: mention() };
    if (text !== undefined) {
      n.label = label(text);
      if (isMarkdownString(text)) n.md = true;
      else delete n.md;
      n.defLine ??= curLine;
      n.labelFrom = 'bracket';
      if (bracket) n.bracket = bracket;
    }
    if (shape) {
      n.shape = shape;
      n.shapeFrom = 'bracket';
    }
    if (block) applyBlock(n, block);
    // `A:::c1:::c2`: several classes, in order (stock Mermaid 11 reads one: `class A c1,c2` is the portable form)
    let nc = 0;
    for (let cm = /^:::([\w-]+)/.exec(s.slice(p)); cm && cm[1]; cm = /^:::([\w-]+)/.exec(s.slice(p))) {
      n.classes.push(cm[1]);
      n.inlineClass ??= cm[1];
      p += cm[0].length;
      classUses.push({ cls: cm[1], line: curLine });
      if (++nc === 2) D.push(diag('info', 'flow.class-chain', `stock Mermaid 11 fails on several ":::" classes — "class ${id} …" with the classes separated by commas works in both`, curLine, { params: { id } }));
    }
    return { id, p, mention: mention() };
  };

  const readNodeGroup = (s: string, pos: number): { ids: string[]; mentions: FlowMention[]; p: number } => {
    const ids: string[] = [], mentions: FlowMention[] = [];
    let p = pos;
    for (;;) {
      while (s[p] === ' ' || s[p] === '\t') p++;
      const r = readNode(s, p);
      if (!r) break;
      ids.push(r.id);
      mentions.push(r.mention);
      p = r.p;
      const amp = /^\s*&\s*/.exec(s.slice(p));
      if (!amp) break;
      p += amp[0].length;
    }
    return { ids, mentions, p };
  };

  const readEdge = (s: string, pos: number): ReadEdge | null => {
    let p = pos;
    while (s[p] === ' ' || s[p] === '\t') p++;
    const l0 = p;
    let idEnd: number | undefined, uid: string | undefined;
    const idm = EDGE_ID.exec(s.slice(p));
    if (idm && idm[1]) {
      uid = idm[1];
      p += idm[0].length;
      idEnd = base + p;
    }
    const rest = s.slice(p);
    let raw: string | undefined, body: string, start: string | undefined, end: string | undefined, arrow: string, closing: string;
    const inline = inlineEdge(F, p);
    if (inline) {
      ({ start, body, raw, end, arrow } = inline);
      // the closing part decides the length (`-- a --->`): the arrow less its opener
      closing = arrow.slice((start ?? '').length + (arrow.startsWith('-.', (start ?? '').length) ? 1 : 0));
      p += inline.length;
    } else {
      const m = EDGE.exec(rest);
      if (!m) return null;
      start = m[1]; body = m[2] ?? ''; end = m[3]; arrow = m[0]; closing = m[0];
      p += m[0].length;
    }
    const pm = PIPE.exec(s.slice(p));
    if (pm) { raw = pm[1] ?? ''; p += pm[0].length; }
    const line: EdgeLine = body.startsWith('~') ? 'invisible' : body.includes('=') ? 'thick' : body.includes('.') ? 'dotted' : 'solid';
    const minlen = linkLength(closing);
    const link: FlowLink = { start: base + l0, end: base + p, arrow };
    if (idEnd !== undefined) link.idEnd = idEnd;
    const r: ReadEdge = { p, label: raw == null ? '' : label(raw), line, start: headOf(start), end: headOf(end), minlen, link };
    if (raw != null && isMarkdownString(raw)) r.md = true;
    if (uid) r.uid = uid;
    return r;
  };

  const statement = (t: string, li: number, at: number): void => {
    F = new Finder(t);
    base = at;
    let m: RegExpExecArray | null;
    if ((m = /^subgraph\s+(.+)$/.exec(t))) {
      const rest = (m[1] ?? '').trim();
      let id: string, title: string, raw: string | null = null;
      const b = /^([^\s[]+)\s*\[(.*)\]$/.exec(rest);
      if (b) { id = b[1] ?? ''; raw = b[2] ?? ''; title = label(raw); }
      else if (/^".*"$/.test(rest)) { raw = rest; title = label(rest); id = title; }
      else { id = rest; title = rest; }
      const parent = stack[stack.length - 1] ?? null;
      const known = model.groups.get(id);
      if (!known) {
        if (!budget.take(li)) return;
        const g: FlowGroup = { id, label: title, parent, children: [], order: model.groups.size, line: li, lines: new Set([li]) };
        if (raw !== null && isMarkdownString(raw)) g.md = true;
        model.groups.set(id, g);
      } else {
        // a repeated `subgraph X` adds to the same subgraph (Mermaid 12.1): its title stays the first one written,
        // unless only this declaration writes one
        known.lines.add(li);
        if (raw !== null && known.label === known.id && title !== known.id) {
          known.label = title;
          if (isMarkdownString(raw)) known.md = true;
        }
      }
      mentions.push(new Set());
      const pg = parent ? model.groups.get(parent) : undefined;
      if (pg && !pg.children.includes(id)) pg.children.push(id);
      stack.push(id);
      return;
    }
    if (t === 'end') {
      const gid = stack.pop();
      const ids = mentions.pop();
      const g = gid === undefined ? undefined : model.groups.get(gid);
      if (g && gid !== undefined) { g.endLine = li; if (ids) claim(ids, gid); }
      return;
    }
    if ((m = /^direction\s+(\w+)/.exec(t))) {
      // a subgraph's own direction (Mermaid ignores one at the top level)
      const d = (m[1] ?? '').toUpperCase().replace('TD', 'TB');
      const g = model.groups.get(stack[stack.length - 1] ?? '');
      if (g && (d === 'TB' || d === 'BT' || d === 'LR' || d === 'RL')) g.dir = d;
      return;
    }
    if ((m = /^classDef\s+(\S+)\s+(.+)$/.exec(t))) {
      const st = parseStyleList(m[2] ?? '', styleWarn);
      for (const c of (m[1] ?? '').split(',')) if (c) model.classDefs[c] = { ...st };
      return;
    }
    // `class a,b c1,c2`: several items, several classes (applied in order)
    if ((m = /^class\s+(\S+)\s+([\w-]+(?:\s*,\s*[\w-]+)*)/.exec(t))) {
      const classes = (m[2] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
      for (const cls of classes) classUses.push({ cls, line: li });
      for (const id of (m[1] ?? '').split(',')) {
        if (!id) continue;
        styleRefs.push({ id, line: li, what: 'class' });
        const g = model.groups.get(id);
        if (g) { (g.classes ??= []).push(...classes); g.lines.add(li); }
        else touchNode(id, false)?.classes.push(...classes);
      }
      return;
    }
    if ((m = /^style\s+(\S+)\s+(.+)$/.exec(t))) {
      const id = m[1] ?? '';
      styleRefs.push({ id, line: li, what: 'style' });
      const st = parseStyleList(m[2] ?? '', styleWarn);
      const g = model.groups.get(id);
      if (g) { g.style = st; g.lines.add(li); }
      else { const n = touchNode(id, false); if (n) Object.assign(n.style, st); }
      return;
    }
    if ((m = /^linkStyle\s+([\d,\s]+?|default)\s+(.+)$/.exec(t))) {
      // `linkStyle 0 interpolate basis stroke:red`: the curve, then the style (either may be missing)
      const ip = /^interpolate\s+(\w+)\s*(.*)$/.exec(m[2] ?? '');
      const curve = ip?.[1];
      if (curve && !FLOW_CURVES.includes(curve)) styleWarn(`unknown curve "${curve}" — the line's routing is used`);
      const list = ip ? ip[2] ?? '' : m[2] ?? '';
      const st = list.trim() ? parseStyleList(list, styleWarn) : null;
      for (const raw of (m[1] ?? '').split(',')) {
        const k = raw.trim();
        if (!k) continue;
        const prev = model.linkStyles[k];
        const next: MermaidStyle = st ? { ...st } : { ...prev };
        if (curve && FLOW_CURVES.includes(curve)) next.interpolate = curve;
        else if (prev?.interpolate) next.interpolate = prev.interpolate;
        model.linkStyles[k] = next;
        if (k !== 'default') linkUses.push({ i: Number(k), line: li });
      }
      return;
    }
    if ((m = /^click\s+(\S+)\s+(?:href\s+)?"([^"]+)"(?:\s+"([^"]*)")?/.exec(t))) {
      // the link stays a raw string: the renderer applies the link policy; the tooltip is text
      const id = m[1] ?? '';
      if (model.nodes.has(id) || !model.groups.has(id)) {
        const n = touchNode(id, false);
        if (n) {
          n.link = stripControl(m[2] ?? '');
          if (m[3]) n.tooltip = stripControl(cleanLabel(m[3]));
        }
      }
      return;
    }
    // a callback (`click A callback "tip"`, `click A call fn() "tip"`) is not run; its tooltip is shown
    if ((m = /^click\s+(\S+)\s+(?:call\s+)?[\w.$]+(?:\([^)]*\))?\s+"([^"]*)"/.exec(t))) {
      const n = model.nodes.get(m[1] ?? '');
      if (n && m[2]) n.tooltip = stripControl(cleanLabel(m[2]));
      return;
    }
    if ((m = /^accTitle\s*:\s*(.*)$/.exec(t))) { model.accTitle = stripControl(m[1] ?? '').trim(); return; }
    if ((m = /^accDescr\s*:\s*(.*)$/.exec(t))) { model.accDescr = stripControl(m[1] ?? '').trim(); return; }
    if ((m = /^title\s+(.+)$/.exec(t))) {
      // drawn, but stock Mermaid's flowchart has no `title` statement: the fix moves it to the frontmatter
      model.title = stripControl(m[1] ?? '').trim();
      D.push(diag('warning', 'flow.title-statement', 'stock Mermaid fails on a `title` statement in a flowchart — the frontmatter\'s `title:` is the portable form', li, {
        fix: { title: 'Move to the frontmatter', apply: (c: string) => titleToFrontmatter(c, li) },
      }));
      return;
    }
    if (/^(click|accTitle|accDescr|title)\b/.test(t)) return;
    // `e1@{ animate: true, curve: linear }` on an edge id (an edge written before it): its data
    if ((m = /^([A-Za-z0-9_][\w-]*)@\{/.exec(t)) && edgeIds.has(m[1] ?? '')) {
      const uid = m[1] ?? '';
      const b = readNodeData(t, uid.length + 1, at);
      const e = model.edges.find((x) => x.uid === uid);
      if (!b) { D.push(diag('warning', 'flow.node-data', `"${uid}@{" is not closed — the edge data is ignored`, li, { params: { id: uid } })); return; }
      if (e) applyEdgeBlock(e, b);
      const tail = t.slice(b.end - at).trim();
      if (tail) D.push(diag('warning', 'flow.ignored-text', `ignored "${tail}"`, li));
      return;
    }

    // Statement: nodeGroup (edge nodeGroup)*
    const first = readNodeGroup(t, 0);
    let left = first.ids;
    let p = first.p;
    if (!left.length) { D.push(diag('warning', 'flow.cannot-parse', `cannot parse "${t}"`, li)); return; }
    const stmt = model.statements.length;
    const st: FlowStatement = { line: li, start: at, end: at + p, groups: [first.mentions], links: [] };
    model.statements.push(st);
    for (;;) {
      const e = readEdge(t, p);
      if (!e) break;
      const r = readNodeGroup(t, e.p);
      if (!r.ids.length) { D.push(diag('warning', 'flow.edge-no-target', 'edge without target', li)); break; }
      st.links.push(e.link);
      st.groups.push(r.mentions);
      st.end = at + r.p;
      const seg = st.links.length - 1;
      for (const a of left) {
        for (const b of r.ids) {
          if (!budget.take(li)) return;
          const key = `${a}->${b}`;
          const n = (edgeCount.get(key) ?? 0) + 1;
          edgeCount.set(key, n);
          const sid = n > 1 ? `${key}#${n}` : key;
          const edge: FlowEdge = {
            id: sid, from: a, to: b, label: e.label, line: e.line,
            start: e.start, end: e.end, minlen: e.minlen, index: model.edges.length, src: li, stmt, seg,
          };
          if (e.md) edge.md = true;
          // as Mermaid: the id goes to the last start and the first end of `A & B e1@--> C & D`, once per diagram
          if (e.uid && a === left[left.length - 1] && b === r.ids[0] && !edgeIds.has(e.uid)) {
            edgeIds.add(e.uid);
            edge.id = e.uid;
            edge.uid = e.uid;
            edge.key = sid;
          }
          model.edges.push(edge);
        }
      }
      left = r.ids;
      p = r.p;
    }
    const tail = t.slice(p).trim();
    if (tail) D.push(diag('warning', 'flow.ignored-text', `ignored "${tail}"`, li));
  };

  // frontmatter and `%%{init}%%` keys (`title`, `config.flowchart.curve`…)
  const settings = new Map<string, string>();
  // code offset of each line (spans are offsets into the code)
  const lineStart: number[] = [];
  for (let i = 0, off = 0; i < lines.length; off += (lines[i] ?? '').length + 1, i++) lineStart.push(off);
  for (let li = 0; li < lines.length && !budget.over; li++) {
    let raw = lines[li] ?? '';
    let t0 = raw.trim();
    curLine = li;
    if (!t0) continue;
    // `accDescr { … }`: a description over several lines, up to the first `}` (F1: its lines are not statements)
    const ad = /^accDescr\s*\{(.*)$/.exec(t0);
    if (ad) {
      let body = ad[1] ?? '';
      while (!body.includes('}') && li + 1 < lines.length) body += '\n' + (lines[++li] ?? '');
      model.accDescr = body.slice(0, body.includes('}') ? body.indexOf('}') : undefined).split('\n').map((l) => stripControl(l).trim()).filter(Boolean).join('\n');
      continue;
    }
    // a node data block or a markdown string written over several lines: its statement goes on until it closes
    const first = li;
    if (!t0.startsWith('%%') && (openBlock(t0) || openMarkdown(t0))) {
      while (li + 1 < lines.length && (openBlock(raw.trim()) || openMarkdown(raw))) raw += '\n' + (lines[++li] ?? '');
      t0 = raw.trim();
    }
    const lineBase = (lineStart[first] ?? 0) + (raw.length - raw.trimStart().length);
    if (t0.startsWith('%%')) {
      if (t0.startsWith('%%{') && ELK_HINT.test(t0)) D.push(diag('warning', 'flow.elk', 'ELK layout hints are not supported — the built-in layout is used', li));
      if (t0.startsWith('%%{') && /^%%\{\s*init\s*:/i.test(t0)) for (const [k, v] of initValues(t0)) if (!settings.has(k)) settings.set(k, v);
      continue;
    }
    let stmts = splitStatements(t0);
    if (!headerSeen) {
      const h = HEADER.exec(stmts[0]?.t ?? '');
      if (h) {
        headerSeen = true;
        model.direction = ((h[3] ?? 'TB').toUpperCase().replace('TD', 'TB')) as Direction;
        if (h[2]) D.push(diag('warning', 'flow.elk', 'ELK layout hints are not supported — the built-in layout is used', li));
        stmts = stmts.slice(1); // `graph TD; A-->B` keeps the statements after the header
      } else if (/^---/.test(t0)) {
        // front matter: only before the header; kept in the code, read for the title and the settings that change the content
        let elk = false;
        const fm: string[] = [];
        while (++li < lines.length && !/^---/.test((lines[li] ?? '').trim())) {
          if (ELK_HINT.test(lines[li] ?? '')) elk = true;
          fm.push(lines[li] ?? '');
        }
        if (elk) D.push(diag('warning', 'flow.elk', 'ELK layout hints are not supported — the built-in layout is used', curLine));
        for (const [k, v] of frontmatterValues(fm)) settings.set(k, v);
        continue;
      }
    }
    for (const { t, off } of stmts) {
      if (budget.over) break;
      statement(t, first, lineBase + off);
    }
  }

  const fmTitle = settings.get('title');
  if (fmTitle && model.title === undefined) model.title = stripControl(fmTitle);
  const config = flowConfig(settings);
  if (config) model.config = config;

  // icon and image nodes (Mermaid draws `img`, else `icon`, whatever the shape says): their shape, and no caption
  // unless a label is written (the id is not shown, as in Mermaid)
  for (const n of model.nodes.values()) {
    if (!n.data?.img && !n.data?.icon) continue;
    n.shape = n.data.img ? 'image' : 'icon';
    n.shapeFrom = 'data';
    if (!n.labelFrom) n.label = '';
  }

  // classes without a classDef: may still be theme presets, which the editor checks (the parser has no theme)
  model.undefinedClasses = classUses.filter(({ cls }) => !model.classDefs[cls]);

  // A node only mentioned by style / class lines makes Mermaid draw a stray node — almost always a typo.
  // Linear: index the style lines per id and the ids touched by edges once.
  const styleLines = new Map<string, Set<number>>();
  for (const r of styleRefs) {
    let s = styleLines.get(r.id);
    if (!s) styleLines.set(r.id, (s = new Set()));
    s.add(r.line);
  }
  const onEdge = new Set<string>();
  for (const e of model.edges) { onEdge.add(e.from); onEdge.add(e.to); }
  const stray = new Map<string, boolean>();
  for (const { id, line, what } of styleRefs) {
    let isStray = stray.get(id);
    if (isStray === undefined) {
      const n = model.nodes.get(id);
      const own = styleLines.get(id);
      isStray = !!n && n.defLine == null && !onEdge.has(id) && [...n.lines].every((l) => own?.has(l));
      stray.set(id, isStray);
    }
    if (isStray) D.push(diag('warning', 'flow.unknown-style-target', `${what} refers to unknown node "${id}"`, line, { params: { id } }));
  }
  const ne = model.edges.length;
  for (const { i, line } of linkUses)
    if (!Number.isInteger(i) || i < 0 || i >= ne)
      D.push(diag('warning', 'flow.linkstyle-range',
        `linkStyle index ${Number.isNaN(i) ? '?' : i} is out of range — the diagram has ${ne} link${ne === 1 ? '' : 's'} (0–${Math.max(0, ne - 1)})`, line));

  // unterminated subgraphs close outermost first (prototype order), so the outermost claims everything left
  const outer = stack[0];
  if (outer !== undefined) for (const ids of mentions) claim(ids, outer);
  for (const [id, gid] of claims) {
    const n = model.nodes.get(id);
    const g = model.groups.get(gid);
    if (!n || !g || model.groups.has(id)) continue;
    n.parent = gid;
    g.children.push(id);
  }

  // A subgraph id used in an edge (`A --> G`) is a reference to the subgraph, not a node.
  // A real node definition (`G["…"]`, `G[(…)]`…) with a subgraph's id is a clash: Mermaid fails with
  // "Setting G as parent of G would create a cycle" — report it with a fix that renames the subgraph.
  for (const [id, g] of model.groups) {
    const n = model.nodes.get(id);
    if (!n) continue;
    if (n.defLine == null) {
      model.nodes.delete(id);
      const pg = n.parent ? model.groups.get(n.parent) : undefined;
      if (pg) pg.children = pg.children.filter((c) => c !== id);
    } else {
      model.idClashes.push(id);
      const newId = clashFreeId(model, id);
      D.push(diag('error', 'flow.id-clash',
        `Subgraph and node both use the id "${id}" — Mermaid cannot render this (cycle error). Use Fix to give the subgraph its own id.`,
        g.line, { params: { id, newId }, fix: { title: 'Rename subgraph', apply: (c: string) => renameClashingSubgraph(c, id) } }));
    }
  }
  return model;
}

/**
 * The `flow.shape-name` fix: every shape name Mermaid rejects (`lean_r`, `parallelogram`, an uppercase name) becomes
 * the shape's shortName, in place.
 */
export function fixShapeNames(code: string): string {
  const model = parseFlowchart(code);
  const splices: Splice[] = [];
  for (const n of model.nodes.values())
    for (const b of n.blocks ?? [])
      for (const e of b.entries) {
        if (e.key !== 'shape' || typeof e.value !== 'string') continue;
        const r = resolveShape(e.value);
        if (r && !r.ok && r.names.mermaid) splices.push({ from: e.valueAt, to: e.valueEnd, text: r.names.mermaid });
      }
  return applySplices(code, splices);
}

/**
 * The `flow.title-statement` fix: the `title` statement on line `li` becomes the frontmatter's `title:` (added to the
 * frontmatter there is, else a new one before the header).
 */
export function titleToFrontmatter(code: string, li: number): string {
  const L = code.split('\n');
  const m = /^\s*title\s+(.+?)\s*$/.exec(L[li] ?? '');
  if (!m) return code;
  const v = m[1]!;
  const yaml = /^[\w ,.()!?'-]+$/.test(v) && !/^['-]/.test(v) ? v : JSON.stringify(v);
  L.splice(li, 1);
  const first = L.findIndex((l) => l.trim() !== '');
  if (first >= 0 && /^---\s*$/.test(L[first]!)) {
    const close = L.findIndex((l, i) => i > first && /^---\s*$/.test(l));
    const at = L.findIndex((l, i) => i > first && i < close && /^title\s*:/.test(l));
    if (at >= 0) L[at] = `title: ${yaml}`;
    else L.splice(first + 1, 0, `title: ${yaml}`);
    return L.join('\n');
  }
  return ['---', `title: ${yaml}`, '---', ...L].join('\n');
}

function clashFreeId(model: FlowchartModel, id: string): string {
  let n = `${id}_group`, i = 2;
  while (model.nodes.has(n) || model.groups.has(n)) n = `${id}_group${i++}`;
  return n;
}

/**
 * The id-clash fix (prototype app `fixIdClash` + edit `renameGroupId`): rewrites the `subgraph` line to
 * `subgraph <id>_group ["title"]`, keeping the title, and moves the subgraph's `%%@ group` metadata line with it.
 * References to the id elsewhere keep pointing at the node.
 */
export function renameClashingSubgraph(code: string, id: string): string {
  const model = parseFlowchart(code);
  const g = model.groups.get(id);
  if (!g || !model.nodes.has(id)) return code;
  const nid = clashFreeId(model, id);
  const L = code.split('\n');
  const old = L[g.line] ?? '';
  const indent = /^\s*/.exec(old)?.[0] ?? '';
  L[g.line] = `${indent}subgraph ${nid} ["${encodeLabel(g.label || id)}"]`;
  const enc = encodeURIComponent(id);
  const meta = new RegExp(`^(\\s*%%@\\s+group\\s+)${enc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+\\{)`);
  for (let i = 0; i < L.length; i++) {
    const l = L[i] ?? '';
    if (meta.test(l)) L[i] = l.replace(meta, `$1${encodeURIComponent(nid)}$2`);
  }
  return L.join('\n');
}
