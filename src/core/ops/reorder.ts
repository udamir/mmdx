// Reorder: move an item up / down in the Mermaid code (prototype edit.js `moveStatement`).
// Order in the code is the drawing order (z-order) for flowcharts and ER, and the diagram order for sequence
// diagrams. An item moves past its neighbour statement — a whole block when the neighbour is a block — and never
// leaves its container (subgraph, box, loop…), so membership is unchanged.
import { isHeaderLine } from '../kinds/info.js';
import { withOps } from '../kinds/registry.js';
import type { DiagramModel } from '../model.js';
import type { ItemRef } from '../types.js';
import type { LineSpan, MoveResult } from './types.js';

/** Multi-line blocks of a model: subgraphs, entity bodies, boxes and sequence blocks. */
export function blocksOf(model: DiagramModel): LineSpan[] {
  return withOps(model, (k, m) => k.blocks(m)) ?? [];
}

/** Line range of an item (null when it has no line of its own). */
export function unitOf(model: DiagramModel, sel: ItemRef): LineSpan | null {
  return withOps(model, (k, m) => k.unit(m, sel)) ?? null;
}

const skip = (t: string): boolean => !t || t.startsWith('%%');
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
    if (isHeaderLine(t)) return { code, reason: 'Already first' };
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
  const refused = withOps(model, (k) => k.checkMove?.(out));
  if (refused) return { code, reason: refused };
  return { code: out, line };
}
