// Connector ends and frames on a shape's outline (T02.3): a port the layout puts on the side of an item's box moves
// along the side's normal onto the shape (a diamond's slope, a circle, the wave of a document), and highlight frames
// follow the outline instead of the box.
import { fmt } from '../scene/serialize.js';
import type { CenterBox, Point } from '../types.js';
import type { ShapeDef } from './types.js';

interface Port extends Point {
  n: Point;
}

/** Where a ray from `o` along `d` first meets the outline of `def` drawn in box `b` (its parameter t ≥ 0), or null. */
function hit(def: ShapeDef, b: CenterBox, o: Point, d: Point): number | null {
  const ol = def.outline(b.w, b.h);
  if (ol === 'ellipse') {
    const rx = b.w / 2 || 1, ry = b.h / 2 || 1;
    const px = (o.x - b.x) / rx, py = (o.y - b.y) / ry, dx = d.x / rx, dy = d.y / ry;
    const A = dx * dx + dy * dy, B = 2 * (px * dx + py * dy), C = px * px + py * py - 1;
    const disc = B * B - 4 * A * C;
    if (!A || disc < 0) return null;
    const s = Math.sqrt(disc), t0 = (-B - s) / (2 * A), t1 = (-B + s) / (2 * A);
    return t0 >= -1e-6 ? Math.max(0, t0) : t1 >= -1e-6 ? Math.max(0, t1) : null;
  }
  let best: number | null = null;
  for (let i = 0; i < ol.length; i++) {
    const a = ol[i]!, c = ol[(i + 1) % ol.length]!;
    const ax = b.x + a.x, ay = b.y + a.y, ex = c.x - a.x, ey = c.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - o.x) * ey - (ay - o.y) * ex) / den;
    const u = ((ax - o.x) * d.y - (ay - o.y) * d.x) / den;
    if (t >= -1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = Math.max(0, t);
  }
  return best;
}

/** A port on box `b`'s side, moved inward along the side's normal onto the shape's outline (unchanged where the line misses it). */
export function onOutline<T extends Port>(def: ShapeDef, b: CenterBox, port: T): T {
  if (def.id === 'rect') return port;
  const t = hit(def, b, port, { x: -port.n.x, y: -port.n.y });
  return t === null || t === 0 ? port : { ...port, x: port.x - port.n.x * t, y: port.y - port.n.y * t };
}

/** The outline of a shape drawn in box `b`, in diagram coordinates (an ellipse as 48 points). */
export function outlinePoints(def: ShapeDef, b: CenterBox): Point[] {
  const ol = def.outline(b.w, b.h);
  if (ol === 'ellipse') return Array.from({ length: 48 }, (_, i) => ({ x: b.x + (b.w / 2) * Math.cos((i / 48) * Math.PI * 2), y: b.y + (b.h / 2) * Math.sin((i / 48) * Math.PI * 2) }));
  return ol.map((p) => ({ x: b.x + p.x, y: b.y + p.y }));
}

/** The outline as a closed SVG path, grown outward by `pad` from the centre (highlight frames). */
export function outlinePath(def: ShapeDef, b: CenterBox, pad = 0): string {
  const sx = b.w ? (b.w + 2 * pad) / b.w : 1, sy = b.h ? (b.h + 2 * pad) / b.h : 1;
  const pts = outlinePoints(def, b).map((p) => `${fmt(b.x + (p.x - b.x) * sx)},${fmt(b.y + (p.y - b.y) * sy)}`);
  return pts.length ? `M${pts.join(' L')} Z` : '';
}
