// Reorder: move an item up / down in the Mermaid code (prototype edit.js `moveStatement`).
// Order in the code is the drawing order (z-order) for flowcharts and ER, and the diagram order for sequence
// diagrams. An item moves past its neighbour statement — a whole block when the neighbour is a block — and never
// leaves its container (subgraph, box, loop…), so membership is unchanged.
import { minOf } from '../geom.js';
import type { DiagramModel } from '../model.js';
import type { ItemRef } from '../types.js';
import { activationsBalanced } from './sequence.js';
import type { LineSpan, MoveResult } from './types.js';

/** Multi-line blocks of a model: subgraphs, entity bodies, boxes and sequence blocks. */
export function blocksOf(model: DiagramModel): LineSpan[] {
  const out: LineSpan[] = [];
  if (model.type === 'flowchart') for (const g of model.groups.values()) if (g.endLine != null) out.push({ start: g.line, end: g.endLine });
  if (model.type === 'er') for (const e of model.entities.values()) if (e.defLine != null && e.endLine != null) out.push({ start: e.defLine, end: e.endLine });
  if (model.type === 'sequence') {
    for (const b of model.boxes) if (b.endLine != null) out.push({ start: b.line, end: b.endLine });
    for (const it of model.items) if (it.kind === 'blockStart') out.push({ start: it.src, end: it.lines[it.lines.length - 1] ?? it.src });
  }
  return out;
}

const one = (li: number | null | undefined): LineSpan | null => (li == null ? null : { start: li, end: li });

/** Line range of an item (null when it has no line of its own). */
export function unitOf(model: DiagramModel, sel: ItemRef): LineSpan | null {
  const M = model;
  switch (sel.kind) {
    case 'node': {
      if (M.type !== 'flowchart') return null;
      const n = M.nodes.get(sel.id);
      return n ? one(n.defLine ?? minOf(n.lines)) : null;
    }
    case 'group': {
      if (M.type !== 'flowchart') return null;
      const g = M.groups.get(sel.id);
      return g ? { start: g.line, end: g.endLine ?? g.line } : null;
    }
    case 'edge':
      return M.type === 'flowchart' ? one(M.edges.find((e) => e.id === sel.id)?.src) : null;
    case 'entity': {
      if (M.type !== 'er') return null;
      const e = M.entities.get(sel.id);
      if (!e) return null;
      return e.defLine != null ? { start: e.defLine, end: e.endLine ?? e.defLine } : one(minOf(e.lines));
    }
    case 'rel':
      return M.type === 'er' ? one(M.rels.find((r) => r.id === sel.id)?.src) : null;
    case 'participant': {
      if (M.type !== 'sequence') return null;
      const p = M.participants.find((x) => x.id === sel.id);
      return p ? one(p.defLine) : null;
    }
    case 'box': {
      if (M.type !== 'sequence') return null;
      const b = M.boxes.find((x) => x.id === sel.id);
      return b ? { start: b.line, end: b.endLine ?? b.line } : null;
    }
    case 'block': {
      if (M.type !== 'sequence') return null;
      const it = M.items.find((x) => x.kind === 'blockStart' && x.id === sel.id);
      return it && it.kind === 'blockStart' ? { start: it.src, end: it.lines[it.lines.length - 1] ?? it.src } : null;
    }
    case 'message':
    case 'note':
      return M.type === 'sequence' ? one(M.items.find((x) => x.kind === sel.kind && x.id === sel.id)?.src) : null;
    default:
      return null;
  }
}

const skip = (t: string): boolean => !t || t.startsWith('%%');
const isHeader = (t: string): boolean => /^(flowchart|graph|sequenceDiagram|erDiagram)\b/.test(t);
const isBoundary = (t: string): boolean => /^(else|and|option)\b/.test(t) || t === 'end' || t === '}';

/**
 * dir: -1 = up (earlier, drawn behind), +1 = down (later, drawn in front). Returns the new code and the item's new
 * first line, or the unchanged code and a reason.
 */
export function moveStatement(code: string, model: DiagramModel, sel: ItemRef, dir: -1 | 1): MoveResult {
  const L = code.split('\n');
  const u = unitOf(model, sel);
  if (!u) return { code, reason: 'This item has no line of its own to move' };
  const blocks = blocksOf(model);
  const byEnd = new Map(blocks.map((b) => [b.end, b]));
  const byStart = new Map(blocks.map((b) => [b.start, b]));
  let i = dir < 0 ? u.start - 1 : u.end + 1;
  while (i >= 0 && i < L.length && skip((L[i] ?? '').trim())) i += dir;
  if (i < 0 || i >= L.length) return { code, reason: dir < 0 ? 'Already first' : 'Already last' };
  const t = (L[i] ?? '').trim();
  let nb: LineSpan;
  if (dir < 0) {
    if (isHeader(t)) return { code, reason: 'Already first' };
    if (byStart.has(i) || /^(else|and|option)\b/.test(t)) return { code, reason: 'Already first in its group' };
    nb = byEnd.get(i) ?? { start: i, end: i };
  } else {
    if (isBoundary(t) && !byStart.has(i)) return { code, reason: 'Already last in its group' };
    nb = byStart.get(i) ?? { start: i, end: i };
  }
  const unit = L.slice(u.start, u.end + 1);
  const other = L.slice(nb.start, nb.end + 1);
  let line: number;
  if (dir < 0) {
    const between = L.slice(nb.end + 1, u.start);
    L.splice(nb.start, u.end - nb.start + 1, ...unit, ...between, ...other);
    line = nb.start;
  } else {
    const between = L.slice(u.end + 1, nb.start);
    L.splice(u.start, nb.end - u.start + 1, ...other, ...between, ...unit);
    line = u.start + other.length + between.length;
  }
  const out = L.join('\n');
  if (model.type === 'sequence' && !activationsBalanced(out))
    return { code, reason: 'Moving it there would deactivate a participant before it is activated (+/− markers)' };
  return { code: out, line };
}
