// Flowchart editing ops as Mermaid source rewrites (prototype edit.js, flowchart part).
// Every function takes (code, model, …) and returns the new code (+ what to select); the caller re-parses.
import type { Direction, FlowEdge, FlowGroup, FlowchartModel } from '../model.js';
import { cleanLabel, encodeLabel } from '../parse/label.js';
import { applySplices, editBlock, type Splice } from '../parse/node-data.js';
import { resolveShape } from '../shapes/registry.js';
import type { ItemRef } from '../types.js';
import { edgeText, nodeDataOf, nodeDef } from './connect.js';
import { rewriteStatement, statementSplice, type StatementEdit } from './flow-statements.js';
import { copyIds, uniqueId } from './ids.js';
import { append, applyEdits, contentEnd, indentOf, splice, type LineEdit } from './lines.js';

/** An edge as its own statement with the link as written (`a -.->|"x"| b`), else as `edgeText` writes it. */
export function linkOf(code: string, model: FlowchartModel, e: FlowEdge, from: string, to: string): string {
  const link = e.stmt !== undefined && e.seg !== undefined ? model.statements[e.stmt]?.links[e.seg] : undefined;
  return link ? `${from} ${code.slice(link.idEnd ?? link.start, link.end)} ${to}` : edgeText(e, from, to);
}
import type { CloneInto, CloneResult, CodeResult, SelectResult } from './types.js';

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

/**
 * A new node `n<k>["label"]` at the end of the code, or at the end of a subgraph, in its shape: a bracket where one
 * exists (`n3{"Decision"}`), else the label in `[ ]` and a separate `n3@{ shape: lin-cyl }` after the graph's statements.
 * A shape Mermaid lacks comes back as `metaShape` (the caller keeps it in metadata).
 */
export function addFlowNode(code: string, model: FlowchartModel, { label = 'New', shape = 'rect', group = null, cls = null }: AddFlowNodeOpts = {}): SelectResult & { select: ItemRef; metaShape?: string } {
  const id = uniqueId(model, 'n');
  const sd = (resolveShape(shape) ?? resolveShape('rect')!).names;
  const def = nodeDef({ id, label, shape: sd.id, inlineClass: cls });
  const data = !sd.bracket && sd.mermaid ? `  ${id}@{ shape: ${sd.mermaid} }` : null;
  const extra = !sd.mermaid ? { metaShape: sd.id } : {};
  const g = group ? model.groups.get(group) : undefined;
  if (g && g.endLine != null) {
    const L = code.split('\n');
    const out = splice(code, g.endLine, 0, [indentOf(L[g.line]) + '  ' + def]);
    return { code: data ? append(out, [data]) : out, select: { kind: 'node', id }, ...extra };
  }
  return { code: append(code, data ? ['  ' + def, data] : ['  ' + def]), select: { kind: 'node', id }, ...extra };
}

/** Rewrites the statements an edit touches (in place, by splicing). */
function rewrite(code: string, model: FlowchartModel, edits: ReadonlyMap<number, StatementEdit>, more: Splice[] = []): string {
  const splices = [...more];
  for (const [si, edit] of edits) {
    const st = model.statements[si];
    const r = st ? rewriteStatement(code, model, si, edit) : null;
    if (st && r) splices.push(statementSplice(code, st, r.text));
  }
  return applySplices(code, splices);
}

/** The splice that replaces whole line `li` (with its newline) by `ins` lines. */
function lineSplice(code: string, li: number, ins: readonly string[]): Splice {
  let from = 0;
  for (let i = 0; i < li; i++) from = code.indexOf('\n', from) + 1;
  const e = code.indexOf('\n', from);
  if (!ins.length) return e < 0 ? { from: Math.max(0, from - 1), to: code.length, text: '' } : { from, to: e + 1, text: '' };
  return { from, to: e < 0 ? code.length : e, text: ins.join('\n') };
}

/**
 * Deletes nodes (with their edges and `class` / `style` / `click` mentions), edges and subgraph frames.
 * Deleting a group removes the frame only; its contents move up one level. Statements keep everything the deleted
 * items leave (a chain is split only where an edge goes, an `&` group only loses a node).
 */
export function deleteFlow(code: string, model: FlowchartModel, items: readonly ItemRef[]): CodeResult {
  const L = code.split('\n');
  const drop = new Set(items.filter((s) => s.kind === 'node').map((s) => s.id));
  const dropEdges = new Set(items.filter((s) => s.kind === 'edge').map((s) => s.id));
  const groups = items.filter((s) => s.kind === 'group').map((s) => model.groups.get(s.id)).filter((g): g is FlowGroup => !!g);
  const edits = new Map<number, StatementEdit>();
  model.statements.forEach((st, si) => {
    if (st.groups.some((g) => g.some((m) => drop.has(m.id)))) edits.set(si, { dropNodes: drop, dropEdges });
  });
  for (const e of model.edges)
    if (e.stmt !== undefined && (dropEdges.has(e.id) || drop.has(e.from) || drop.has(e.to))) edits.set(e.stmt, { dropNodes: drop, dropEdges });
  // `class`, `style` and `click` lines name the nodes they apply to
  const lines = new Set<number>();
  for (const id of drop) model.nodes.get(id)?.lines.forEach((li) => lines.add(li));
  const splices: Splice[] = [];
  for (const li of lines) {
    const t = (L[li] ?? '').trim();
    const kind = statementKind(t);
    if (kind === 'class') {
      const m = /^class\s+(\S+)\s+(.+)$/.exec(t);
      const ids = m ? (m[1] ?? '').split(',').filter((x) => !drop.has(x)) : [];
      splices.push(lineSplice(code, li, m && ids.length ? [`${indentOf(L[li])}class ${ids.join(',')} ${m[2]}`] : []));
    } else if (kind === 'ref') {
      const id = t.split(/\s+/)[1] ?? '';
      if (drop.has(id)) splices.push(lineSplice(code, li, []));
    }
  }
  for (const g of groups) {
    splices.push(lineSplice(code, g.line, []));
    if (g.endLine != null) splices.push(lineSplice(code, g.endLine, []));
  }
  return { code: rewrite(code, model, edits, splices) };
}

/**
 * New label for a node, written where its label is: in its bracket (`A["new"]`), or in the `label` of its node data;
 * a node without either gets a definition (in its subgraph).
 */
export function relabelFlowNode(code: string, model: FlowchartModel, id: string, label: string): CodeResult {
  const n = model.nodes.get(id);
  if (!n) return { code };
  const text = `"${encodeLabel(label)}"`;
  const block = [...(n.blocks ?? [])].reverse().find((b) => b.entries.some((e) => e.key === 'label'));
  if (block && (n.labelFrom === 'data' || !n.bracket)) return { code: applySplices(code, editBlock(code, block, { label: text }, new Set(['label']))) };
  if (n.bracket) return { code: applySplices(code, [{ from: n.bracket.text[0], to: n.bracket.text[1], text }]) };
  const L = code.split('\n');
  // node data gives the shape: the definition only brings the label
  const def = nodeDef({ ...n, label, shape: n.shapeFrom === 'data' ? 'rect' : n.shape });
  const g = n.parent ? model.groups.get(n.parent) : undefined;
  if (g && g.endLine != null) return { code: splice(code, g.endLine, 0, [indentOf(L[g.line]) + '  ' + def]) };
  return { code: splice(code, 1, 0, ['  ' + def]) };
}

/** New label for an edge: only its link changes (its arrow as written); an edge of an `&` group is split out first. */
export function relabelFlowEdge(code: string, model: FlowchartModel, edgeId: string, label: string): CodeResult {
  const e = model.edges.find((x) => x.id === edgeId);
  if (!e || e.stmt === undefined) return { code };
  return { code: rewrite(code, model, new Map([[e.stmt, { change: { id: e.id, from: e.from, to: e.to, label } }]])) };
}

export function relabelGroup(code: string, model: FlowchartModel, gid: string, title: string): CodeResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const L = code.split('\n');
  return { code: splice(code, g.line, 1, [`${indentOf(L[g.line])}subgraph ${gid} ["${encodeLabel(title)}"]`]) };
}

/**
 * Writes a node's shape to the Mermaid code (T02.6, in Mermaid Chart's style): the shape in node data the node has
 * already (changed in place), else a bracket swap where both shapes have one, else a separate `id@{ shape: … }`
 * statement after the graph's statements (the label stays in its bracket). Null for a shape Mermaid lacks (the caller
 * keeps it in metadata).
 */
export function setFlowShape(code: string, model: FlowchartModel, id: string, shape: string): CodeResult | null {
  const n = model.nodes.get(id);
  const sd = resolveShape(shape)?.names;
  if (!sd?.mermaid) return null;
  if (!n) return { code };
  const blocks = n.blocks ?? [];
  const block = [...blocks].reverse().find((b) => b.entries.some((e) => e.key === 'shape')) ?? blocks[blocks.length - 1];
  // node data after the last bracket decides the shape: change it there
  if (block && (!n.bracket || block.open > n.bracket.start)) {
    if (n.shape === sd.id && n.shapeFrom === 'data') return { code };
    return { code: applySplices(code, editBlock(code, block, { shape: sd.mermaid }, new Set(['shape']))) };
  }
  if (n.bracket && sd.bracket) {
    if (n.shape === sd.id) return { code };
    const [o, c] = sd.bracket;
    const t = code.slice(n.bracket.text[0], n.bracket.text[1]);
    // an unquoted label that holds bracket characters would end the new bracket early: quoted
    const text = /^\s*"/.test(t) || !/[[\](){}<>/\\]/.test(t) ? t : `"${encodeLabel(cleanLabel(t))}"`;
    return { code: applySplices(code, [{ from: n.bracket.start, to: n.bracket.end, text: o + text + c }]) };
  }
  if (!n.bracket && sd.id === 'rect' && n.shape === 'rect') return { code };
  if (!n.bracket && sd.bracket && !blocks.length) {
    // only mentioned in edges: a definition at its first mention
    const m = model.statements.flatMap((st) => st.groups.flat()).filter((x) => x.id === id).sort((a, b) => a.start - b.start)[0];
    if (m) return { code: applySplices(code, [{ from: m.start, to: m.idEnd, text: nodeDef({ id, label: n.label, shape: sd.id }).replace(/:::.*$/, '') }]) };
  }
  return { code: append(code, [`  ${id}@{ shape: ${sd.mermaid} }`]) };
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
export function cloneFlow(code: string, model: FlowchartModel, items: readonly ItemRef[], o: CloneInto = {}): CloneResult {
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
  const map = copyIds(model, [...groups, ...nodes], o.taken);
  const nodeLines = (id: string, ind: string): string[] => {
    const n = model.nodes.get(id)!;
    const cls = n.classes;
    const own = n.inlineClass || cls[0];
    const out = [ind + nodeDef({ id: map[id]!, label: n.label, shape: n.shape, inlineClass: own })];
    // the node's data (and a shape no bracket holds) goes with the copy
    const data = nodeDataOf(code, n, map[id]!);
    if (data) out.push(ind + data);
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
  // into another document (a paste from another version): every copy goes to its end
  const target = o.into ?? code;
  const L = code.split('\n');
  const edits: LineEdit[] = [];
  const end = contentEnd(target.split('\n'));
  const atEnd: string[] = [];
  for (const r of tops) {
    const parent = o.into === undefined ? parentOf(r) : null;
    const pg = parent ? model.groups.get(parent) : undefined;
    const ind = pg ? indentOf(L[pg.line]) + '  ' : '  ';
    const lines = r.kind === 'node' ? nodeLines(r.id, ind) : groupLines(r.id, ind);
    if (pg?.endLine != null) edits.push({ at: pg.endLine, del: 0, ins: lines });
    else atEnd.push(...lines);
  }
  // the copied edges keep their links as written (length, style, label)
  for (const e of model.edges) if (nodes.has(e.from) && nodes.has(e.to)) atEnd.push('  ' + linkOf(code, model, e, map[e.from]!, map[e.to]!));
  if (atEnd.length) edits.push({ at: end, del: 0, ins: atEnd });
  return { code: applyEdits(target, edits).replace(/\s+$/, '') + '\n', map };
}

/** Direction: the header's (`flowchart LR`). */
export function setFlowDirection(code: string, dir: Direction): CodeResult {
  const L = code.split('\n');
  const i = L.findIndex((l) => /^\s*(flowchart|graph)\b/i.test(l));
  if (i < 0) return { code };
  L[i] = L[i]!.replace(/^(\s*)(flowchart|graph)\b(\s+(TB|TD|BT|LR|RL)\b)?/i, (_m, sp: string, kw: string) => `${sp}${kw} ${dir}`);
  return { code: L.join('\n') };
}
