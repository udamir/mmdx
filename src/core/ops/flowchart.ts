// Flowchart editing ops as Mermaid source rewrites (prototype edit.js, flowchart part).
// Every function takes (code, model, …) and returns the new code (+ what to select); the caller re-parses.
import type { FlowEdge, FlowGroup, FlowNode, FlowchartModel } from '../model.js';
import { encodeLabel } from '../parse/label.js';
import type { ItemRef } from '../types.js';
import { edgeText, nodeDef } from './connect.js';
import { copyIds, uniqueId } from './ids.js';
import { append, applyEdits, contentEnd, indentOf, splice, type LineEdit } from './lines.js';
import type { CloneResult, CodeResult, SelectResult } from './types.js';

/** Per-line indexes of a model, built once per op so line regeneration stays linear. */
interface LineIndex {
  nodes: Map<number, FlowNode[]>;
  edges: Map<number, FlowEdge[]>;
}

function lineIndex(model: FlowchartModel): LineIndex {
  const nodes = new Map<number, FlowNode[]>(), edges = new Map<number, FlowEdge[]>();
  for (const n of model.nodes.values()) for (const li of n.lines) (nodes.get(li) ?? nodes.set(li, []).get(li)!).push(n);
  for (const e of model.edges) (edges.get(e.src) ?? edges.set(e.src, []).get(e.src)!).push(e);
  return { nodes, edges };
}

interface RegenOpts {
  edgeFn?: (e: FlowEdge) => FlowEdge | null;
  nodeFn?: (n: FlowNode) => FlowNode;
  drop?: ReadonlySet<string>;
}

// Regenerate one statement line: inline node definitions first, then its edges.
function regenFlowLine(lines: readonly string[], idx: LineIndex, li: number, { edgeFn = (e) => e, nodeFn = (n) => n, drop = new Set() }: RegenOpts = {}): string[] {
  const indent = indentOf(lines[li]);
  const edges: FlowEdge[] = [];
  for (const e of idx.edges.get(li) ?? []) {
    const x = edgeFn(e);
    if (x && !drop.has(x.from) && !drop.has(x.to)) edges.push(x);
  }
  const used = new Set<string>();
  for (const e of edges) used.add(e.from).add(e.to);
  const out: string[] = [];
  for (const n of idx.nodes.get(li) ?? []) {
    if (drop.has(n.id)) continue;
    if (n.defLine === li) out.push(indent + nodeDef(nodeFn(n)));
    else if (!used.has(n.id) && n.lines.size === 1) out.push(indent + n.id); // only listed here: keep it alive
  }
  for (const e of edges) out.push(indent + edgeText(e, e.from, e.to));
  return out;
}

type StatementKind = 'class' | 'ref' | 'other' | 'stmt';
const statementKind = (t: string): StatementKind =>
  /^class\s/.test(t) ? 'class' : /^(style|click)\s/.test(t) ? 'ref' : /^(subgraph\b|end$|classDef|linkStyle|direction|%%)/.test(t) ? 'other' : 'stmt';

export interface AddFlowNodeOpts {
  label?: string;
  shape?: string;
  /** Subgraph to add the node to (before its `end`). */
  group?: string | null;
  /** Inline `:::class`. */
  cls?: string | null;
}

/** A new node `n<k>["label"]` at the end of the code, or at the end of a subgraph. */
export function addFlowNode(code: string, model: FlowchartModel, { label = 'New', shape = 'rect', group = null, cls = null }: AddFlowNodeOpts = {}): SelectResult & { select: ItemRef } {
  const id = uniqueId(model, 'n');
  const def = nodeDef({ id, label, shape, inlineClass: cls });
  const g = group ? model.groups.get(group) : undefined;
  if (g && g.endLine != null) {
    const L = code.split('\n');
    return { code: splice(code, g.endLine, 0, [indentOf(L[g.line]) + '  ' + def]), select: { kind: 'node', id } };
  }
  return { code: append(code, ['  ' + def]), select: { kind: 'node', id } };
}

/**
 * Deletes nodes (with their edges and `class` / `style` / `click` mentions), edges and subgraph frames.
 * Deleting a group removes the frame only; its contents move up one level.
 */
export function deleteFlow(code: string, model: FlowchartModel, items: readonly ItemRef[]): CodeResult {
  const L = code.split('\n');
  const drop = new Set(items.filter((s) => s.kind === 'node').map((s) => s.id));
  const dropEdges = new Set(items.filter((s) => s.kind === 'edge').map((s) => s.id));
  const groups = items.filter((s) => s.kind === 'group').map((s) => model.groups.get(s.id)).filter((g): g is FlowGroup => !!g);
  const affected = new Set<number>();
  for (const id of drop) model.nodes.get(id)?.lines.forEach((li) => affected.add(li));
  for (const e of model.edges) if (dropEdges.has(e.id) || drop.has(e.from) || drop.has(e.to)) affected.add(e.src);
  const idx = lineIndex(model);
  const edits: LineEdit[] = [];
  for (const li of affected) {
    const t = (L[li] ?? '').trim();
    const kind = statementKind(t);
    if (kind === 'class') {
      const m = /^class\s+(\S+)\s+(.+)$/.exec(t);
      const ids = m ? (m[1] ?? '').split(',').filter((x) => !drop.has(x)) : [];
      edits.push({ at: li, del: 1, ins: m && ids.length ? [`${indentOf(L[li])}class ${ids.join(',')} ${m[2]}`] : [] });
    } else if (kind === 'ref') {
      const id = t.split(/\s+/)[1] ?? '';
      if (drop.has(id)) edits.push({ at: li, del: 1, ins: [] });
    } else if (kind === 'stmt') {
      edits.push({ at: li, del: 1, ins: regenFlowLine(L, idx, li, { drop, edgeFn: (e) => (dropEdges.has(e.id) ? null : e) }) });
    }
  }
  for (const g of groups) {
    edits.push({ at: g.line, del: 1, ins: [] });
    if (g.endLine != null) edits.push({ at: g.endLine, del: 1, ins: [] });
  }
  return { code: applyEdits(code, edits) };
}

/** New label for a node: its defining statement is regenerated, or a definition is added (in its subgraph). */
export function relabelFlowNode(code: string, model: FlowchartModel, id: string, label: string): CodeResult {
  const n = model.nodes.get(id);
  if (!n) return { code };
  const L = code.split('\n');
  if (n.defLine != null)
    return { code: splice(code, n.defLine, 1, regenFlowLine(L, lineIndex(model), n.defLine, { nodeFn: (x) => (x.id === id ? { ...x, label } : x) })) };
  const def = nodeDef({ ...n, label });
  const g = n.parent ? model.groups.get(n.parent) : undefined;
  if (g && g.endLine != null) return { code: splice(code, g.endLine, 0, [indentOf(L[g.line]) + '  ' + def]) };
  return { code: splice(code, 1, 0, ['  ' + def]) };
}

export function relabelFlowEdge(code: string, model: FlowchartModel, edgeId: string, label: string): CodeResult {
  const e = model.edges.find((x) => x.id === edgeId);
  if (!e) return { code };
  const L = code.split('\n');
  return { code: splice(code, e.src, 1, regenFlowLine(L, lineIndex(model), e.src, { edgeFn: (x) => (x.id === edgeId ? { ...x, label } : x) })) };
}

export function relabelGroup(code: string, model: FlowchartModel, gid: string, title: string): CodeResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const L = code.split('\n');
  return { code: splice(code, g.line, 1, [`${indentOf(L[g.line])}subgraph ${gid} ["${encodeLabel(title)}"]`]) };
}

/**
 * Wraps nodes (and whole subgraphs) into a new subgraph. Mermaid assigns a node to the first subgraph that closes
 * listing it, so the new block goes inside the common parent, right before its `end` (or at the end of the file
 * for top level) — it closes first and claims the nodes.
 */
export function groupFlow(code: string, model: FlowchartModel, items: readonly ItemRef[], title = 'Group'): SelectResult {
  const nodes = items.filter((s) => s.kind === 'node').map((s) => s.id);
  const subs = items.filter((s) => s.kind === 'group').map((s) => model.groups.get(s.id)).filter((g): g is FlowGroup => !!g);
  if (nodes.length + subs.length < 1) return { code };
  const parentOf = (x: string): string | null => (model.groups.has(x) ? model.groups.get(x)!.parent : model.nodes.get(x)?.parent) || null;
  const chain = (x: string): string[] => {
    const c: string[] = [];
    const seen = new Set<string>();
    for (let p = parentOf(x); p && !seen.has(p); p = model.groups.get(p)?.parent || null) {
      seen.add(p);
      c.unshift(p);
    }
    return c;
  };
  const chains = [...nodes, ...subs.map((g) => g.id)].map(chain);
  const common: string[] = [];
  for (let i = 0; ; i++) {
    const v = chains[0]?.[i];
    if (v && chains.every((c) => c[i] === v)) common.push(v);
    else break;
  }
  const parent = common[common.length - 1] ?? null;
  const id = uniqueId(model, 'group');
  const L = code.split('\n');
  const pg = parent ? model.groups.get(parent) : undefined;
  const indent = pg ? indentOf(L[pg.line]) + '  ' : '  ';
  // Move selected subgraph blocks into the new group.
  const moved: string[] = [];
  const edits: LineEdit[] = [];
  for (const g of [...subs].sort((a, b) => a.line - b.line)) {
    if (g.endLine == null) continue; // an unterminated subgraph has no block to move
    const block = L.slice(g.line, g.endLine + 1);
    const base = indentOf(block[0]).length;
    moved.push(...block.map((l) => indent + '  ' + l.slice(Math.min(base, indentOf(l).length))));
    edits.push({ at: g.line, del: g.endLine - g.line + 1, ins: [] });
  }
  const block = [`${indent}subgraph ${id} ["${encodeLabel(title)}"]`, ...nodes.map((n) => `${indent}  ${n}`), ...moved, `${indent}end`];
  if (pg?.endLine != null) edits.push({ at: pg.endLine, del: 0, ins: block });
  else edits.push({ at: contentEnd(L), del: 0, ins: block });
  let out = applyEdits(code, edits);
  if (pg?.endLine == null) out = out.replace(/\s+$/, '') + '\n';
  return { code: out, select: { kind: 'group', id } };
}

/** Gives a subgraph a new id (its title stays). Used to resolve a clash with a node of the same id. */
export function renameGroupId(code: string, model: FlowchartModel, gid: string, newId: string): SelectResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const L = code.split('\n');
  return { code: splice(code, g.line, 1, [`${indentOf(L[g.line])}subgraph ${newId} ["${encodeLabel(g.label || gid)}"]`]), select: { kind: 'group', id: newId } };
}

/** Removes a subgraph's frame; its contents move up one level (and one indent step left). */
export function ungroupFlow(code: string, model: FlowchartModel, gid: string): CodeResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const L = code.split('\n');
  const edits: LineEdit[] = [{ at: g.line, del: 1, ins: [] }];
  if (g.endLine != null) {
    edits.push({ at: g.endLine, del: 1, ins: [] });
    for (let i = g.line + 1; i < g.endLine; i++) {
      // A bare `id` line only existed to list the node in the group: drop it if the node lives elsewhere too.
      const raw = L[i] ?? '';
      const n = model.nodes.get(raw.trim());
      const redundant = !!n && [...n.lines].some((li) => li !== i);
      edits.push({ at: i, del: 1, ins: redundant ? [] : [raw.replace(/^ {2}/, '')] });
    }
  }
  return { code: applyEdits(code, edits) };
}

/**
 * Copies flowchart nodes and subgraphs (with everything inside them) next to the originals, in the same parent
 * subgraph, plus the edges running between copied nodes. `map`: old id → new id.
 */
export function cloneFlow(code: string, model: FlowchartModel, items: readonly ItemRef[]): CloneResult {
  const roots: ItemRef[] = [], nodes = new Set<string>(), groups = new Set<string>();
  const walk = (gid: string): void => {
    for (const c of model.groups.get(gid)?.children ?? []) {
      if (model.groups.has(c)) {
        if (groups.has(c)) continue;
        groups.add(c);
        walk(c);
      } else if (model.nodes.has(c)) nodes.add(c);
    }
  };
  for (const it of items) {
    if (it.kind === 'node' && model.nodes.has(it.id) && !nodes.has(it.id)) {
      roots.push(it);
      nodes.add(it.id);
    }
    if (it.kind === 'group' && model.groups.has(it.id) && !groups.has(it.id)) {
      roots.push(it);
      groups.add(it.id);
      walk(it.id);
    }
  }
  const parentOf = (r: ItemRef): string | null => (r.kind === 'node' ? model.nodes.get(r.id)?.parent : model.groups.get(r.id)?.parent) ?? null;
  // a root that sits inside another copied group is copied with it
  const inside = (own: string | null): boolean => {
    for (let p = own, guard = 0; p && guard <= model.groups.size; p = model.groups.get(p)?.parent ?? null, guard++) if (groups.has(p)) return true;
    return false;
  };
  const tops = roots.filter((r) => !inside(parentOf(r)));
  if (!tops.length) return { code };
  const map = copyIds(model, [...groups, ...nodes]);
  const nodeLines = (id: string, ind: string): string[] => {
    const n = model.nodes.get(id)!;
    const cls = n.classes;
    const own = n.inlineClass || cls[0];
    const out = [ind + nodeDef({ id: map[id]!, label: n.label, shape: n.shape, inlineClass: own })];
    const extra = cls.filter((c) => c !== own);
    if (extra.length) out.push(`${ind}class ${map[id]} ${extra.join(',')}`);
    return out;
  };
  const groupLines = (gid: string, ind: string): string[] => {
    const g = model.groups.get(gid)!;
    const out = [`${ind}subgraph ${map[gid]} ["${encodeLabel(g.label ?? gid)}"]`];
    for (const c of g.children) out.push(...(model.groups.has(c) ? groupLines(c, ind + '  ') : model.nodes.has(c) ? nodeLines(c, ind + '  ') : []));
    out.push(`${ind}end`);
    if (g.classes?.length) out.push(`${ind}class ${map[gid]} ${g.classes.join(',')}`);
    return out;
  };
  const L = code.split('\n');
  const edits: LineEdit[] = [];
  const end = contentEnd(L);
  const atEnd: string[] = [];
  for (const r of tops) {
    const parent = parentOf(r);
    const pg = parent ? model.groups.get(parent) : undefined;
    const ind = pg ? indentOf(L[pg.line]) + '  ' : '  ';
    const lines = r.kind === 'node' ? nodeLines(r.id, ind) : groupLines(r.id, ind);
    if (pg?.endLine != null) edits.push({ at: pg.endLine, del: 0, ins: lines });
    else atEnd.push(...lines);
  }
  for (const e of model.edges) if (nodes.has(e.from) && nodes.has(e.to)) atEnd.push('  ' + edgeText(e, map[e.from]!, map[e.to]!));
  if (atEnd.length) edits.push({ at: end, del: 0, ins: atEnd });
  return { code: applyEdits(code, edits).replace(/\s+$/, '') + '\n', map };
}
