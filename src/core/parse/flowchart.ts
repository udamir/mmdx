// Mermaid flowchart parser (the commonly used subset, A.9).
// Line fields are 0-based whole lines; statements split by `;` share a line.
import type {
  Direction, EdgeHead, EdgeLine, FlowEdge, FlowGroup, FlowNode, FlowchartModel, MermaidStyle, NodeShape,
} from '../model.js';
import { diag } from '../types.js';
import { cleanLabel, encodeLabel, isMarkdownString } from './label.js';
import { ItemBudget, stripControl } from './limits.js';
import { parseStyleList } from './style.js';

type Opener = readonly [open: string, closers: readonly string[], shape: NodeShape, alt?: NodeShape];
const OPENERS: readonly Opener[] = [
  ['(((', [')))'], 'doublecircle'],
  ['((', ['))'], 'circle'],
  ['([', ['])'], 'stadium'],
  ['[[', [']]'], 'subroutine'],
  ['[(', [')]'], 'cylinder'],
  ['{{', ['}}'], 'hexagon'],
  ['[/', ['/]', '\\]'], 'parallelogram', 'trapezoid'],
  ['[\\', ['\\]', '/]'], 'parallelogram-alt', 'trapezoid-alt'],
  ['(', [')'], 'rounded'],
  ['[', [']'], 'rect'],
  ['{', ['}'], 'diamond'],
  ['>', [']'], 'asymmetric'],
];
// A Map, not an object: `@{ shape: constructor }` must not find Object.prototype members.
const NEW_SHAPES = new Map<string, NodeShape>(Object.entries({
  rect: 'rect', rounded: 'rounded', stadium: 'stadium', circle: 'circle', diamond: 'diamond', hex: 'hexagon',
  hexagon: 'hexagon', cyl: 'cylinder', cylinder: 'cylinder', db: 'cylinder', database: 'cylinder',
  'h-cyl': 'hcyl', das: 'hcyl', 'lin-cyl': 'cylinder', subproc: 'subroutine', 'dbl-circ': 'doublecircle',
  lean_r: 'parallelogram', 'lean-r': 'parallelogram', lean_l: 'parallelogram-alt', 'lean-l': 'parallelogram-alt',
  trap_b: 'trapezoid', 'trap-b': 'trapezoid', trap_t: 'trapezoid-alt', 'trap-t': 'trapezoid-alt', doc: 'document',
  document: 'document', 'sm-circ': 'circle', 'f-circ': 'circle', notch_rect: 'card', card: 'card',
} satisfies Record<string, NodeShape>));

const ID = /^[A-Za-z0-9_À-￿](?:[A-Za-z0-9_À-￿]|-(?=[A-Za-z0-9_À-￿]))*/;
// `-- text -->`: the opener, then the first closer that follows a whitespace run. Two regexes instead of the
// prototype's `\s+(.+?)\s+(closer)`, which backtracks cubically on long runs of spaces.
const INLINE_OPEN = /^([<ox])?(--|==|-\.)\s+/;
const INLINE_CLOSE = /(?<!\s)\s+(-{2,}|={2,}|\.-)(>|[ox](?![\w]))?/g;
const EDGE = /^(<|[ox](?=[-=]))?(-{2,}|={2,}|-\.+-)(>|[ox](?![\w]))?/;
const PIPE = /^\s*\|([^|]*)\|/;
// Mermaid v11 edge ids: `A e1@--> B`, then `e1@{ animate: true }`
const EDGE_ID = /^([A-Za-z0-9_][\w-]*)@(?=[<ox]?[-=.])/;
const HEADER = /^(flowchart|graph)(-elk)?\b\s*(TB|TD|BT|LR|RL)?/i;
const ELK_HINT = /\b(?:layout\s*:\s*["']?elk|defaultRenderer["']?\s*:\s*["']?elk)/i;

function splitStatements(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false, depth = 0;
  for (const ch of line) {
    if (ch === '"') q = !q;
    if (!q && '[({'.includes(ch)) depth++;
    if (!q && '])}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === ';' && !q && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
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

function inlineEdge(F: Finder, pos: number): { start?: string; body: string; raw: string; end?: string; length: number } | null {
  const rest = F.s.slice(pos);
  const o = INLINE_OPEN.exec(rest);
  if (!o) return null;
  const c = F.inlineClose(pos + o[0].length + 1); // the label has at least one character
  if (!c) return null;
  const at = c.index - pos;
  const r: { start?: string; body: string; raw: string; end?: string; length: number } = {
    body: (o[2] ?? '') + (c[1] ?? ''), raw: rest.slice(o[0].length, at), length: at + c[0].length,
  };
  if (o[1]) r.start = o[1];
  if (c[2]) r.end = c[2];
  return r;
}

const headOf = (c: string | undefined): EdgeHead =>
  c === '>' || c === '<' ? 'arrow' : c === 'x' ? 'cross' : c === 'o' ? 'circle' : 'none';

export function emptyFlowchart(): FlowchartModel {
  return {
    type: 'flowchart', direction: 'TB', nodes: new Map(), groups: new Map(), edges: [],
    // null-prototype records: `classDef __proto__ …` is just a name
    classDefs: Object.create(null) as Record<string, MermaidStyle>,
    linkStyles: Object.create(null) as Record<string, MermaidStyle>,
    undefinedClasses: [], idClashes: [], diagnostics: [],
  };
}

interface StyleRef { id: string; line: number; what: 'class' | 'style' }
interface ReadNode { id: string; p: number }
interface ReadEdge { p: number; label: string; line: EdgeLine; start: EdgeHead; end: EdgeHead; minlen: number }

export function parseFlowchart(code: string): FlowchartModel {
  const model = emptyFlowchart();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const stack: string[] = [];
  const edgeCount = new Map<string, number>();
  const edgeIds = new Set<string>();
  let curLine = 0; // source line of the statement being parsed (0-based)
  let F = new Finder('');
  const lines = code.split('\n');
  let headerSeen = false;
  // Style statements, checked once the whole file is read (classDefs may come after their use).
  const classUses: { cls: string; line: number }[] = [];
  const styleRefs: StyleRef[] = [];
  const linkUses: { i: number; line: number }[] = [];
  const styleWarn = (msg: string): void => { D.push(diag('warning', 'flow.bad-style', msg, curLine)); };
  const label = (raw: string): string => {
    if (isMarkdownString(raw)) D.push(diag('warning', 'flow.markdown-label', 'markdown strings are not supported — the label is shown as plain text', curLine));
    return cleanLabel(raw);
  };

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

  const readNode = (s: string, pos: number): ReadNode | null => {
    const m = ID.exec(s.slice(pos));
    if (!m) return null;
    const id = m[0];
    let p = pos + id.length;
    let text: string | undefined, shape: NodeShape | undefined;
    const rest = s.slice(p);
    if (rest.startsWith('@{')) {
      const brace = F.indexOf('}', p);
      const end = brace < 0 ? -1 : brace - p;
      if (end >= 0) {
        const body = rest.slice(2, end);
        const sm = /shape\s*:\s*"?([\w-]+)"?/.exec(body);
        const lm = /label\s*:\s*"([^"]*)"/.exec(body);
        if (sm) shape = NEW_SHAPES.get(sm[1] ?? '') ?? 'rect';
        if (lm) text = lm[1] ?? '';
        p += end + 1;
      }
    } else {
      for (const [open, closers, shp, alt] of OPENERS) {
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
        shape = which === 1 && alt ? alt : shp;
        p += best + (closers[which] ?? '').length;
        break;
      }
    }
    const g = model.groups.get(id);
    if (g && text === undefined) { g.lines.add(curLine); return { id, p }; }
    const n = touchNode(id);
    if (!n) return { id, p };
    if (text !== undefined) { n.label = label(text); n.defLine ??= curLine; }
    if (shape) n.shape = shape;
    const cm = /^:::([\w-]+)/.exec(s.slice(p));
    if (cm && cm[1]) {
      n.classes.push(cm[1]);
      n.inlineClass ??= cm[1];
      p += cm[0].length;
      classUses.push({ cls: cm[1], line: curLine });
    }
    return { id, p };
  };

  const readNodeGroup = (s: string, pos: number): { ids: string[]; p: number } => {
    const ids: string[] = [];
    let p = pos;
    for (;;) {
      while (s[p] === ' ' || s[p] === '\t') p++;
      const r = readNode(s, p);
      if (!r) break;
      ids.push(r.id);
      p = r.p;
      const amp = /^\s*&\s*/.exec(s.slice(p));
      if (!amp) break;
      p += amp[0].length;
    }
    return { ids, p };
  };

  const readEdge = (s: string, pos: number): ReadEdge | null => {
    let p = pos;
    while (s[p] === ' ' || s[p] === '\t') p++;
    const idm = EDGE_ID.exec(s.slice(p));
    if (idm && idm[1]) {
      edgeIds.add(idm[1]);
      D.push(diag('warning', 'flow.edge-id', `edge ids are not supported — "${idm[1]}@" is ignored`, curLine, { params: { id: idm[1] } }));
      p += idm[0].length;
    }
    const rest = s.slice(p);
    let raw: string | undefined, body: string, start: string | undefined, end: string | undefined;
    const inline = inlineEdge(F, p);
    if (inline) { ({ start, body, raw, end } = inline); p += inline.length; }
    else {
      const m = EDGE.exec(rest);
      if (!m) return null;
      start = m[1]; body = m[2] ?? ''; end = m[3];
      p += m[0].length;
    }
    const pm = PIPE.exec(s.slice(p));
    if (pm) { raw = pm[1] ?? ''; p += pm[0].length; }
    const line: EdgeLine = body.includes('=') ? 'thick' : body.includes('.') ? 'dotted' : 'solid';
    const minlen = Math.max(1, (body.match(/[-=.]/g) ?? []).length - 1);
    return { p, label: raw == null ? '' : label(raw), line, start: headOf(start), end: headOf(end), minlen };
  };

  const statement = (t: string, li: number): void => {
    F = new Finder(t);
    let m: RegExpExecArray | null;
    if ((m = /^subgraph\s+(.+)$/.exec(t))) {
      const rest = (m[1] ?? '').trim();
      let id: string, title: string;
      const b = /^([^\s[]+)\s*\[(.*)\]$/.exec(rest);
      if (b) { id = b[1] ?? ''; title = label(b[2] ?? ''); }
      else if (/^".*"$/.test(rest)) { title = label(rest); id = title; }
      else { id = rest; title = rest; }
      const parent = stack[stack.length - 1] ?? null;
      if (!model.groups.has(id)) {
        if (!budget.take(li)) return;
        const g: FlowGroup = { id, label: title, parent, children: [], order: model.groups.size, line: li, lines: new Set([li]) };
        model.groups.set(id, g);
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
    if (/^direction\s+\w+/.test(t)) return;
    if ((m = /^classDef\s+(\S+)\s+(.+)$/.exec(t))) {
      const st = parseStyleList(m[2] ?? '', styleWarn);
      for (const c of (m[1] ?? '').split(',')) if (c) model.classDefs[c] = { ...st };
      return;
    }
    if ((m = /^class\s+(\S+)\s+([\w-]+)/.exec(t))) {
      const cls = m[2] ?? '';
      classUses.push({ cls, line: li });
      for (const id of (m[1] ?? '').split(',')) {
        if (!id) continue;
        styleRefs.push({ id, line: li, what: 'class' });
        const g = model.groups.get(id);
        if (g) { (g.classes ??= []).push(cls); g.lines.add(li); }
        else touchNode(id, false)?.classes.push(cls);
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
    if ((m = /^linkStyle\s+([\d,\s]+|default)\s+(.+)$/.exec(t))) {
      const st = parseStyleList(m[2] ?? '', styleWarn);
      for (const raw of (m[1] ?? '').split(',')) {
        const k = raw.trim();
        if (!k) continue;
        model.linkStyles[k] = { ...st };
        if (k !== 'default') linkUses.push({ i: Number(k), line: li });
      }
      return;
    }
    if ((m = /^click\s+(\S+)\s+(?:href\s+)?"([^"]+)"/.exec(t))) {
      // the link stays a raw string: the renderer applies the link policy
      const id = m[1] ?? '';
      if (model.nodes.has(id) || !model.groups.has(id)) {
        const n = touchNode(id, false);
        if (n) n.link = stripControl(m[2] ?? '');
      }
      return;
    }
    if (/^(click|accTitle|accDescr|title)\b/.test(t)) return;
    // `e1@{ animate: true }` on an edge id: edge properties are not modelled
    if ((m = /^([A-Za-z0-9_][\w-]*)@\{/.exec(t)) && edgeIds.has(m[1] ?? '')) {
      D.push(diag('warning', 'flow.edge-id', `edge properties are not supported — "${t}" is ignored`, li, { params: { id: m[1] ?? '' } }));
      return;
    }

    // Statement: nodeGroup (edge nodeGroup)*
    const first = readNodeGroup(t, 0);
    let left = first.ids;
    let p = first.p;
    if (!left.length) { D.push(diag('warning', 'flow.cannot-parse', `cannot parse "${t}"`, li)); return; }
    for (;;) {
      const e = readEdge(t, p);
      if (!e) break;
      const r = readNodeGroup(t, e.p);
      if (!r.ids.length) { D.push(diag('warning', 'flow.edge-no-target', 'edge without target', li)); break; }
      for (const a of left) {
        for (const b of r.ids) {
          if (!budget.take(li)) return;
          const key = `${a}->${b}`;
          const n = (edgeCount.get(key) ?? 0) + 1;
          edgeCount.set(key, n);
          const edge: FlowEdge = {
            id: n > 1 ? `${key}#${n}` : key, from: a, to: b, label: e.label, line: e.line,
            start: e.start, end: e.end, minlen: e.minlen, index: model.edges.length, src: li,
          };
          model.edges.push(edge);
        }
      }
      left = r.ids;
      p = r.p;
    }
    const tail = t.slice(p).trim();
    if (tail) D.push(diag('warning', 'flow.ignored-text', `ignored "${tail}"`, li));
  };

  for (let li = 0; li < lines.length && !budget.over; li++) {
    const t0 = (lines[li] ?? '').trim();
    curLine = li;
    if (!t0) continue;
    if (t0.startsWith('%%')) {
      if (t0.startsWith('%%{') && ELK_HINT.test(t0)) D.push(diag('warning', 'flow.elk', 'ELK layout hints are not supported — the built-in layout is used', li));
      continue;
    }
    let stmts = splitStatements(t0);
    if (!headerSeen) {
      const h = HEADER.exec(stmts[0] ?? '');
      if (h) {
        headerSeen = true;
        model.direction = ((h[3] ?? 'TB').toUpperCase().replace('TD', 'TB')) as Direction;
        if (h[2]) D.push(diag('warning', 'flow.elk', 'ELK layout hints are not supported — the built-in layout is used', li));
        stmts = stmts.slice(1); // `graph TD; A-->B` keeps the statements after the header
      } else if (/^---/.test(t0)) {
        // front matter: only before the header
        let elk = false;
        while (++li < lines.length && !/^---/.test((lines[li] ?? '').trim())) if (ELK_HINT.test(lines[li] ?? '')) elk = true;
        if (elk) D.push(diag('warning', 'flow.elk', 'ELK layout hints are not supported — the built-in layout is used', curLine));
        continue;
      }
    }
    for (const t of stmts) {
      if (budget.over) break;
      statement(t, li);
    }
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
