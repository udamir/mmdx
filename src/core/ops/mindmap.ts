// Mindmap ops (T08 §3.7): rewrites of the mindmap's indented lines. A node's subtree is a block of lines (the node,
// its `::icon` / `:::` lines and its descendants, with the comments between them); adding, moving, re-parenting,
// indenting and deleting work on those blocks, re-indented to their new depth in the file's own indentation step.
// Text is written in the node's own delimiters, quoted only when it needs it (`["a (b)"]`); a node without delimiters
// whose text cannot stand alone becomes `(-"…"-)`, Mermaid's other form of the default shape. Icons are label tokens
// (`fa:fa-book Book`), which stock Mermaid draws; an `::icon()` line is replaced by one when the icon changes.
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { MindmapModel, MindNode, MindShape } from '../model.js';
import { descendantsOf, MIND_DELIMS, MIND_SHAPES, mindKeys, parseMindmap } from '../parse/mindmap.js';
import { labelText } from '../parse/label.js';
import { setOwn } from '../own.js';
import type { ItemRef } from '../types.js';
import type { CloneResult, CodeResult, LineResult, MoveResult, RefusableResult } from './types.js';

/** The text of a new node. */
export const MIND_NEW = 'New idea';

const isMindShape = (s: string): s is MindShape => (MIND_SHAPES as readonly string[]).includes(s);

// ---- writing a node ---------------------------------------------------------------------------------------------

/** Text that `cleanLabel` would read differently (entities, `<br>`), or that would start a string or markdown. */
const DECODES = /#quot;|#\d+;|&(?:amp|lt|gt);|<\/?br\b|^["`]|`$/i;

/** Can the text stand alone on its line (a bare node: its id and its text)? */
function bareText(label: string): boolean {
  return !!label && label === label.trim() && !/[()[\]{}\n]/.test(label) && !/^(?:::|%%|mindmap\b|-\))/i.test(label) && !DECODES.test(label);
}

/** Can the text stand unquoted between delimiters? */
const plainText = (label: string): boolean => !!label && label === label.trim() && !/[()[\]{}\n"]/.test(label) && !DECODES.test(label);

/** A node statement: `id((text))`, a bare line, or the default shape with quotes (`(-"a (b)"-)`). */
function mindStatement(o: { written: string | null; label: string; shape: MindShape; md?: boolean; quoted?: boolean }): string {
  const id = o.written ?? '';
  if (o.shape === 'mm-default') {
    if (!o.md && !o.quoted && !id && bareText(o.label)) return o.label;
    return `${id}(-${labelText(o.label, !!o.md)}-)`;
  }
  const [open, close] = MIND_DELIMS[o.shape];
  const inner = o.md ? labelText(o.label, true) : o.quoted || !plainText(o.label) ? labelText(o.label) : o.label;
  return `${id}${open}${inner}${close}`;
}

/** Replaces a node's statement in the code (its indentation and the lines after it stay). */
function rewrite(code: string, n: MindNode, stmt: string): string {
  return code.slice(0, n.start) + stmt + code.slice(n.end);
}

/** The shape a node is written with: its own, else the default (an odd `id(text(` cloud keeps its look). */
const shapeOf = (n: MindNode): MindShape => n.shape;

/** New text for a node, in its delimiters; `md`: as a markdown string (undefined: keep what it is). */
export function relabelMind(code: string, model: MindmapModel, id: string, label: string, md?: boolean): CodeResult {
  const n = model.nodes.get(id);
  if (!n) return { code };
  const text = label.replace(/\r/g, '').trim() || MIND_NEW;
  const isMd = md ?? n.md;
  return { code: rewrite(code, n, mindStatement({ written: n.written, label: text, shape: shapeOf(n), md: isMd, quoted: n.quote === 'str' && !isMd })) };
}

/** A Mermaid shape written in the node's delimiters; null for a shape a mindmap has no delimiters for (metadata). */
export function setMindShape(code: string, model: MindmapModel, id: string, shape: string): CodeResult | null {
  const n = model.nodes.get(id);
  if (!n) return null;
  const s = shape === 'rounded-rect' ? 'rounded' : shape === 'default' || shape === 'no-border' ? 'mm-default' : shape;
  if (!isMindShape(s)) return null;
  return { code: rewrite(code, n, mindStatement({ written: n.written, label: n.label, shape: s, md: n.md, quoted: n.quote === 'str' })) };
}

// ---- blocks of lines --------------------------------------------------------------------------------------------

/** The last line of a node's subtree. */
export function subtreeEnd(model: MindmapModel, id: string, skip?: string): number {
  const n = model.nodes.get(id);
  if (!n) return -1;
  let end = n.endLine;
  for (const c of n.children) if (c !== skip) end = Math.max(end, subtreeEnd(model, c, skip));
  return end;
}

/** The indentation of a node's children (its first child's, else one step deeper than the node). */
function childIndent(model: MindmapModel, id: string): string {
  const n = model.nodes.get(id);
  if (!n) return model.indentUnit;
  const first = n.children.map((c) => model.nodes.get(c)).find((c) => c && c.indent > n.indent);
  return first ? first.indentText : n.indentText + model.indentUnit;
}

/** Lines re-indented from one indentation to another (blank lines stay blank). */
function reindent(lines: readonly string[], from: string, to: string): string[] {
  return lines.map((l) => (!l.trim() ? '' : l.startsWith(from) ? to + l.slice(from.length) : to + l.trimStart()));
}

/** Is `id` inside the subtree of `of` (or `of` itself)? */
const within = (model: MindmapModel, id: string, of: string): boolean => {
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === of) return true;
    seen.add(cur);
    cur = model.nodes.get(cur)?.parent ?? null;
  }
  return false;
};

// ---- adding -------------------------------------------------------------------------------------------------------

/** A new last child of `parentId` (on its own line after the parent's subtree). */
export function addMindChild(code: string, model: MindmapModel, parentId: string, label = MIND_NEW, shape: MindShape = 'mm-default'): LineResult {
  const p = model.nodes.get(parentId);
  if (!p) return addMindRoot(code, model, label);
  const at = subtreeEnd(model, parentId) + 1;
  const L = code.split('\n');
  L.splice(at, 0, childIndent(model, parentId) + mindStatement({ written: null, label, shape }));
  return { code: L.join('\n'), line: at };
}

/** A new sibling after `id` and its subtree (the root has none: its new child instead). */
export function addMindSibling(code: string, model: MindmapModel, id: string, label = MIND_NEW): LineResult {
  const n = model.nodes.get(id);
  if (!n || !n.parent) return addMindChild(code, model, id, label);
  const at = subtreeEnd(model, id) + 1;
  const L = code.split('\n');
  L.splice(at, 0, n.indentText + mindStatement({ written: null, label, shape: 'mm-default' }));
  return { code: L.join('\n'), line: at };
}

/** The root of an empty map (or, when it has one, a child of the root). */
export function addMindRoot(code: string, model: MindmapModel, label = 'Topic', shape: MindShape = 'circle'): LineResult {
  if (model.root) return addMindChild(code, model, model.root, label);
  const L = code.split('\n');
  let at = model.header >= 0 ? model.header + 1 : L.length;
  if (model.header < 0) {
    L.push('mindmap');
    at = L.length;
  }
  // after the header and any comment lines right after it
  while (at < L.length && /^\s*%%/.test(L[at] ?? '')) at++;
  L.splice(at, 0, model.indentUnit + mindStatement({ written: null, label, shape }));
  return { code: L.join('\n'), line: at };
}

/** The node defined on a line (after an op: the new or moved node). */
export const mindNodeAt = (model: MindmapModel, line: number): MindNode | undefined => [...model.nodes.values()].find((n) => n.line === line);

// ---- moving -------------------------------------------------------------------------------------------------------

/**
 * Moves (or copies) a node's subtree to be child `index` of `parentId` (index past the end: the last child), its lines
 * re-indented. Refused into its own subtree, and for the root.
 */
export function reparentMind(code: string, model: MindmapModel, id: string, parentId: string, index: number, copy = false): MoveResult {
  const n = model.nodes.get(id), p = model.nodes.get(parentId);
  if (!n || !p) return { code };
  if (!n.parent) return { code, reason: 'The root stays where it is' };
  if (!copy && within(model, parentId, id)) return { code, reason: 'A node cannot move into its own branch' };
  const L = code.split('\n');
  const a = n.line, b = subtreeEnd(model, id);
  const kids = p.children.filter((c) => c !== id || copy);
  const i = Math.max(0, Math.min(index, kids.length));
  const at = i < kids.length ? model.nodes.get(kids[i]!)!.line : subtreeEnd(model, parentId, copy ? undefined : id) + 1;
  const indent = kids.length ? model.nodes.get(kids[0]!)!.indentText : p.indentText + model.indentUnit;
  let block = reindent(L.slice(a, b + 1), n.indentText, indent);
  if (copy) block = uniqueIds(block, model);
  if (!copy && at >= a && at <= b + 1) {
    // the same place: only the indentation can change
    L.splice(a, b - a + 1, ...block);
    return { code: L.join('\n'), line: a };
  }
  if (!copy) L.splice(a, b - a + 1);
  const to = !copy && at > b ? at - (b - a + 1) : at;
  L.splice(to, 0, ...block);
  return { code: L.join('\n'), line: to };
}

/** ⌥↑ / ⌥↓: the node trades places with its previous / next sibling (with their subtrees). */
export function moveMind(code: string, model: MindmapModel, id: string, dir: -1 | 1): MoveResult {
  const n = model.nodes.get(id);
  const p = n?.parent ? model.nodes.get(n.parent) : undefined;
  if (!n || !p) return { code };
  const i = p.children.indexOf(id), j = i + dir;
  if (j < 0 || j >= p.children.length) return { code, reason: dir < 0 ? 'Already the first' : 'Already the last' };
  const first = model.nodes.get(p.children[Math.min(i, j)]!)!, second = model.nodes.get(p.children[Math.max(i, j)]!)!;
  const L = code.split('\n');
  const A = [first.line, subtreeEnd(model, first.id)], B = [second.line, subtreeEnd(model, second.id)];
  const a = L.slice(A[0]!, A[1]! + 1), between = L.slice(A[1]! + 1, B[0]!), b = L.slice(B[0]!, B[1]! + 1);
  // siblings may be written at different indentations: each takes the other's place and its indentation
  const out = [...L.slice(0, A[0]!), ...reindent(b, second.indentText, first.indentText), ...between, ...reindent(a, first.indentText, second.indentText), ...L.slice(B[1]! + 1)];
  return { code: out.join('\n'), line: dir < 0 ? A[0]! : A[0]! + b.length + between.length };
}

/** Tab / ⌥→: the node becomes the last child of its previous sibling. */
export function indentMind(code: string, model: MindmapModel, id: string): MoveResult {
  const n = model.nodes.get(id);
  const p = n?.parent ? model.nodes.get(n.parent) : undefined;
  const i = p ? p.children.indexOf(id) : -1;
  if (!n || !p || i < 1) return { code, reason: 'Nothing above it to go under' };
  const prev = p.children[i - 1]!;
  return reparentMind(code, model, id, prev, model.nodes.get(prev)!.children.length);
}

/** Shift+Tab / ⌥←: the node leaves its parent and follows it (its later siblings stay with the parent). */
export function outdentMind(code: string, model: MindmapModel, id: string): MoveResult {
  const n = model.nodes.get(id);
  const p = n?.parent ? model.nodes.get(n.parent) : undefined;
  const g = p?.parent ? model.nodes.get(p.parent) : undefined;
  if (!n || !p || !g) return { code, reason: 'A first-level node cannot move further out' };
  return reparentMind(code, model, id, g.id, g.children.indexOf(p.id) + 1);
}

// ---- deleting -----------------------------------------------------------------------------------------------------

/** Del: the nodes with their subtrees. */
export function deleteMind(code: string, model: MindmapModel, refs: readonly ItemRef[]): RefusableResult {
  const ids = refs.filter((r) => r.kind === 'node' && model.nodes.has(r.id)).map((r) => r.id);
  // a node inside another deleted subtree goes with it
  const tops = ids.filter((id) => !ids.some((o) => o !== id && within(model, id, o)));
  if (!tops.length) return { code };
  const spans = tops.map((id) => [model.nodes.get(id)!.line, subtreeEnd(model, id)] as const).sort((x, y) => y[0] - x[0]);
  const L = code.split('\n');
  for (const [a, b] of spans) L.splice(a, b - a + 1);
  // an empty map: Mermaid needs the line break after its header
  if (model.root && tops.includes(model.root) && L[L.length - 1] !== '') L.push('');
  return { code: L.join('\n') };
}

/** Shift+Del: the node only; its children move up one level (the root: only when it has one child, the new root). */
export function liftMind(code: string, model: MindmapModel, id: string): RefusableResult {
  const n = model.nodes.get(id);
  if (!n) return { code };
  if (!n.parent && n.children.length > 1) return { code, reason: 'A mindmap has one root: delete the root with its branches, or keep it' };
  const L = code.split('\n');
  const edits: [number, number, string[]][] = [[n.line, n.endLine, []]];
  for (const c of n.children) {
    const k = model.nodes.get(c)!;
    const a = k.line, b = subtreeEnd(model, c);
    edits.push([a, b, reindent(L.slice(a, b + 1), k.indentText, n.indentText)]);
  }
  for (const [a, b, ins] of edits.sort((x, y) => y[0] - x[0])) L.splice(a, b - a + 1, ...ins);
  return { code: L.join('\n') };
}

// ---- copies -------------------------------------------------------------------------------------------------------

/** Written ids of copied lines made unique (`api` → `api_2`): a mindmap's ids must stay unique to keep their metadata. */
function uniqueIds(lines: readonly string[], model: MindmapModel, taken: Set<string> = new Set([...model.nodes.values()].flatMap((n) => (n.written ? [n.written] : [])))): string[] {
  const sub = parseMindmap(`mindmap\n${lines.join('\n')}`);
  const out = lines.slice();
  // bottom-up per line: offsets of earlier statements stay valid
  const nodes = [...sub.nodes.values()].filter((n) => n.written).sort((a, b) => b.start - a.start);
  const src = `mindmap\n${lines.join('\n')}`;
  let text = src;
  for (const n of nodes) {
    let id = n.written!, k = 2;
    if (!taken.has(id)) {
      taken.add(id);
      continue;
    }
    while (taken.has(`${n.written}_${k}`)) k++;
    id = `${n.written}_${k}`;
    taken.add(id);
    text = text.slice(0, n.start) + id + text.slice(n.start + n.written!.length);
  }
  if (text === src) return out;
  return text.split('\n').slice(1);
}

/** Copies of nodes' subtrees, each placed right after its original (⌘D); `map` old id → new id of written ids. */
export function cloneMind(code: string, model: MindmapModel, refs: readonly ItemRef[], into?: { into?: string; taken?: Iterable<string> }): CloneResult {
  const ids = refs.filter((r) => r.kind === 'node' && model.nodes.has(r.id)).map((r) => r.id);
  const tops = ids.filter((id) => !ids.some((o) => o !== id && within(model, id, o)) && model.nodes.get(id)!.parent);
  if (!tops.length) return { code: into?.into ?? code };
  if (into?.into !== undefined) {
    // into another map: under its root
    const target = parseMindmap(into.into);
    const lines = tops.flatMap((id) => blockText(model, code, id));
    const res = target.root ? pasteMindLines(into.into, target, target.root, lines, new Set(into.taken ?? [])) : { code: into.into, line: -1 };
    return { code: res.code, map: mapIds(model, tops, parseMindmap(res.code), res.line) };
  }
  const L = code.split('\n');
  const taken = new Set([...model.nodes.values()].flatMap((n) => (n.written ? [n.written] : [])));
  const placed: [number, string[]][] = tops.map((id) => {
    const n = model.nodes.get(id)!, b = subtreeEnd(model, id);
    return [b + 1, uniqueIds(L.slice(n.line, b + 1), model, taken)];
  });
  for (const [at, block] of placed.sort((x, y) => y[0] - x[0])) L.splice(at, 0, ...block);
  const next = L.join('\n');
  const after = parseMindmap(next);
  // each copy starts on the line after its original's subtree, shifted by the copies placed above it
  const map: Record<string, string> = {};
  let shift = 0;
  for (const [at, block] of placed.sort((x, y) => x[0] - y[0])) {
    const orig = tops.find((id) => subtreeEnd(model, id) + 1 === at);
    const copy = mindNodeAt(after, at + shift);
    if (orig && copy) Object.assign(map, pairIds(model, orig, after, copy.id));
    shift += block.length;
  }
  return { code: next, map };
}

/** Old id → new id over two subtrees of the same shape. */
function pairIds(a: MindmapModel, ida: string, b: MindmapModel, idb: string): Record<string, string> {
  const out: Record<string, string> = {};
  const A = [ida, ...descendantsOf(a, ida)], B = [idb, ...descendantsOf(b, idb)];
  A.forEach((id, i) => {
    if (B[i]) out[id] = B[i]!;
  });
  return out;
}

function mapIds(a: MindmapModel, tops: readonly string[], b: MindmapModel, line: number): Record<string, string> {
  const out: Record<string, string> = {};
  let at = line;
  for (const id of tops) {
    const copy = mindNodeAt(b, at);
    if (!copy) break;
    Object.assign(out, pairIds(a, id, b, copy.id));
    at = subtreeEnd(b, copy.id) + 1;
  }
  return out;
}

/** A node's subtree lines, re-indented to start at no indentation. */
export function blockText(model: MindmapModel, code: string, id: string): string[] {
  const n = model.nodes.get(id);
  if (!n) return [];
  return reindent(code.split('\n').slice(n.line, subtreeEnd(model, id) + 1), n.indentText, '');
}

/** Plain Mermaid of copied subtrees (the system clipboard): a mindmap of them, under the first one's parent if several. */
export function mindFragment(model: MindmapModel, code: string, refs: readonly ItemRef[]): string {
  const ids = refs.filter((r) => r.kind === 'node' && model.nodes.has(r.id)).map((r) => r.id);
  const tops = ids.filter((id) => !ids.some((o) => o !== id && within(model, id, o)));
  if (!tops.length) return '';
  const body = tops.length === 1 ? blockText(model, code, tops[0]!) : [model.nodes.get(model.root ?? '')?.label.split('\n')[0] ?? 'Topic', ...tops.flatMap((id) => blockText(model, code, id).map((l) => (l ? `  ${l}` : l)))];
  return `mindmap\n${body.map((l) => (l ? `  ${l}` : l)).join('\n')}\n`;
}

/** Lines (a subtree as written, indentation from 0) pasted as the last children of a node. */
export function pasteMindLines(code: string, model: MindmapModel, parentId: string, lines: readonly string[], taken?: Set<string>): LineResult {
  const p = model.nodes.get(parentId);
  if (!p || !lines.some((l) => l.trim())) return { code, line: -1 };
  const at = subtreeEnd(model, parentId) + 1;
  const ind = childIndent(model, parentId);
  const block = uniqueIds(lines.map((l) => (l.trim() ? ind + l : '')), model, taken ?? new Set([...model.nodes.values()].flatMap((n) => (n.written ? [n.written] : []))));
  const L = code.split('\n');
  L.splice(at, 0, ...block);
  return { code: L.join('\n'), line: at };
}

/**
 * Pasted text as a subtree under a node: a Mermaid mindmap (its nodes as written), or plain lines whose indentation
 * (or Markdown list markers: `-`, `*`, `+`, `1.`) gives the tree; each line's text becomes a node.
 */
export function pasteMindText(code: string, model: MindmapModel, parentId: string, text: string): LineResult {
  const raw = text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n');
  let lines: { indent: number; stmt: string }[];
  const first = raw.findIndex((l) => l.trim());
  if (first >= 0 && /^\s*mindmap\b/i.test(raw[first]!)) {
    const sub = parseMindmap(raw.join('\n'));
    if (!sub.root) return { code, line: -1 };
    const base = sub.nodes.get(sub.root)!.indent;
    const L = raw.join('\n').split('\n');
    lines = [];
    for (const n of sub.nodes.values()) {
      for (let i = n.line; i <= n.endLine; i++) lines.push({ indent: Math.max(0, (i === n.line ? n.indent : n.indent) - base), stmt: (L[i] ?? '').trim() });
    }
  } else {
    lines = raw
      .filter((l) => l.trim())
      .map((l) => {
        const m = /^(\s*)(?:[-*+]|\d+[.)])?\s*(.*)$/.exec(l)!;
        const label = m[2]!.trim();
        return { indent: m[1]!.length, stmt: label ? mindStatement({ written: null, label, shape: 'mm-default' }) : '' };
      })
      .filter((l) => l.stmt);
  }
  if (!lines.length) return { code, line: -1 };
  // relative depths from the indentation (a deeper line is a child of the nearest shallower line above it)
  const stack: number[] = [];
  const unit = model.indentUnit;
  const out = lines.map(({ indent, stmt }) => {
    while (stack.length && stack[stack.length - 1]! >= indent) stack.pop();
    const depth = stack.length;
    stack.push(indent);
    return unit.repeat(depth) + stmt;
  });
  return pasteMindLines(code, model, parentId, out);
}

// ---- settings -----------------------------------------------------------------------------------------------------

/**
 * `config.mindmap.colorBy` in the frontmatter (Mermaid 12.2): `depth` is written, `branch` (the default) removed, with
 * a frontmatter or `config:` / `mindmap:` key left empty.
 */
export function setMindColorBy(code: string, by: 'branch' | 'depth'): CodeResult {
  const L = code.split('\n');
  let s = 0;
  while (s < L.length && !L[s]!.trim()) s++;
  const has = s < L.length && /^---\s*$/.test(L[s]!.trim());
  let e = has ? L.findIndex((l, i) => i > s && /^---\s*$/.test(l.trim())) : -1;
  if (has && e < 0) return { code };
  const ind = (l: string): number => /^\s*/.exec(l)![0].length;
  /** The line of `key:` under the line `parent` (-1: the top level), or -1. */
  const find = (key: string, parent: number): number => {
    const pi = parent < 0 ? -1 : ind(L[parent]!);
    for (let i = parent < 0 ? s + 1 : parent + 1; i < e; i++) {
      const t = L[i]!;
      if (!t.trim() || t.trim().startsWith('#')) continue;
      if (ind(t) <= pi) break;
      if (parent < 0 && ind(t) > 0) continue;
      if (new RegExp(`^\\s*${key}\\s*:`).test(t)) return i;
    }
    return -1;
  };
  if (by === 'depth') {
    if (!has) return { code: ['---', 'config:', '  mindmap:', '    colorBy: depth', '---', ...L].join('\n') };
    const c = find('config', -1);
    if (c < 0) {
      L.splice(e, 0, 'config:', '  mindmap:', '    colorBy: depth');
      return { code: L.join('\n') };
    }
    const m = find('mindmap', c);
    const ci = ind(L[c]!) + 2;
    if (m < 0) {
      L.splice(c + 1, 0, `${' '.repeat(ci)}mindmap:`, `${' '.repeat(ci + 2)}colorBy: depth`);
      return { code: L.join('\n') };
    }
    const k = find('colorBy', m);
    if (k >= 0) L[k] = `${' '.repeat(ind(L[k]!))}colorBy: depth`;
    else L.splice(m + 1, 0, `${' '.repeat(ind(L[m]!) + 2)}colorBy: depth`);
    return { code: L.join('\n') };
  }
  if (!has) return { code };
  const c = find('config', -1), m = c >= 0 ? find('mindmap', c) : -1, k = m >= 0 ? find('colorBy', m) : -1;
  if (k < 0) return { code };
  L.splice(k, 1);
  e--;
  // drop keys left without children, then a frontmatter left empty
  const empty = (i: number): boolean => {
    for (let j = i + 1; j < e; j++) {
      if (!L[j]!.trim()) continue;
      return ind(L[j]!) <= ind(L[i]!);
    }
    return true;
  };
  if (/^\s*mindmap\s*:\s*$/.test(L[m]!) && empty(m)) {
    L.splice(m, 1);
    e--;
  }
  if (/^\s*config\s*:\s*$/.test(L[c]!) && empty(c)) {
    L.splice(c, 1);
    e--;
  }
  if (L.slice(s + 1, e).every((l) => !l.trim())) L.splice(s, e - s + 1);
  return { code: L.join('\n') };
}

// ---- metadata after code changes ----------------------------------------------------------------------------------

/**
 * Metadata of positional ids (`mm<k>`) moved to the nodes' new ids after a code change: matched by (parent path,
 * label, ordinal among same-label siblings), then by the label alone (a moved node), then by the same id. Written ids
 * keep their metadata as they are. Pure.
 */
export function remapMindMeta(meta: DiagramMeta, before: MindmapModel, after: MindmapModel): DiagramMeta {
  const m = meta.nodes;
  if (!m || !Object.keys(m).length) return meta;
  const positional = (model: MindmapModel, id: string): boolean => !!model.nodes.get(id) && model.nodes.get(id)!.written !== id;
  const ka = mindKeys(before), kb = mindKeys(after);
  const byKey = new Map<string, string>();
  for (const [id, k] of kb) if (positional(after, id) && !byKey.has(k)) byKey.set(k, id);
  const byLabel = new Map<string, string[]>();
  for (const n of after.nodes.values()) if (positional(after, n.id)) byLabel.set(n.label, [...(byLabel.get(n.label) ?? []), n.id]);
  const out: Record<string, ItemMeta> = {};
  const used = new Set<string>();
  // written ids and entries of ids no node has stay as they are
  // ids come from the document: never a plain assignment (`__proto__`, B32)
  for (const [id, v] of Object.entries(m)) if (!positional(before, id)) setOwn(out, id, v);
  for (const id of Object.keys(out)) used.add(id);
  const pending: string[] = [];
  for (const id of Object.keys(m)) {
    if (!positional(before, id)) continue;
    const k = ka.get(id);
    const hit = k !== undefined ? byKey.get(k) : undefined;
    if (hit && !used.has(hit)) {
      setOwn(out, hit, m[id]!);
      used.add(hit);
    } else pending.push(id);
  }
  for (const id of pending) {
    const label = before.nodes.get(id)!.label;
    const hit = byLabel.get(label)?.find((x) => !used.has(x));
    const same = after.nodes.has(id) && positional(after, id) && !used.has(id) ? id : undefined;
    const to = hit ?? same;
    if (to) {
      setOwn(out, to, m[id]!);
      used.add(to);
    }
  }
  return { ...meta, nodes: out };
}
