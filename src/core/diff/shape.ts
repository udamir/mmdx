// Where a diff highlight goes: an item's outline from the renderer's geometry index (a box, or a connector's path with
// its label). Each diagram type's view kind maps its geometry onto these with `boxShape` / `pathShape`.
import { shapeDef } from '../shapes/registry.js';
import { outlinePath } from '../shapes/outline.js';
import type { Rect } from '../types.js';
import type { ItemShape } from './types.js';

const box = (b: { x: number; y: number; w: number; h: number }): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });

/** The shape of a box given by its centre (null when missing or hidden). */
export const boxShape = (b: { x: number; y: number; w: number; h: number; hidden?: boolean; shape?: string } | undefined): ItemShape | null =>
  b && !b.hidden ? (b.shape ? { t: 'rect', r: box(b), d: outlinePath(shapeDef(b.shape), b, 8) } : { t: 'rect', r: box(b) }) : null;

/** The shape of a connector: its path, its label box and a middle point to badge. */
export function pathShape(e: { d: string; label: { x: number; y: number; w: number; h: number } | null; points: [number, number][]; a: { x: number; y: number }; b: { x: number; y: number } } | undefined): ItemShape | null {
  if (!e) return null;
  const p = e.points[Math.floor(e.points.length / 2)];
  const mid = e.label ? { x: e.label.x, y: e.label.y } : p ? { x: p[0], y: p[1] } : { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
  return { t: 'path', d: e.d, label: e.label ? box(e.label) : null, mid };
}
