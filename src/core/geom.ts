// Small geometry helpers shared by layout, renderers and (later) the editor's controllers (prototype `util.js`).
import type { Point } from './types.js';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** One decimal, like the prototype's `round` (use `fmt` from scene/serialize for output strings). */
export const round = (v: number): number => Math.round(v * 10) / 10;

/** Point at parameter t on the cubic Bézier p0 → p3. */
export function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Point at fraction t (0…1) of the length of a polyline. */
export function polylinePoint(pts: readonly Point[], t: number): Point {
  const first = pts[0];
  if (!first) return { x: 0, y: 0 };
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(l);
    total += l;
  }
  let d = total * t;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const s = seg[i - 1]!;
    if (d <= s || i === pts.length - 1) {
      const k = s ? d / s : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= s;
  }
  return { x: first.x, y: first.y };
}

/** Minimum / maximum of a list without spreading it into arguments (no stack limit on long lists, §12). */
export function minOf(values: Iterable<number>, empty = Infinity): number {
  let m = empty;
  let any = false;
  for (const v of values) {
    if (!any || v < m) m = v;
    any = true;
  }
  return any ? m : empty;
}

export function maxOf(values: Iterable<number>, empty = -Infinity): number {
  let m = empty;
  let any = false;
  for (const v of values) {
    if (!any || v > m) m = v;
    any = true;
  }
  return any ? m : empty;
}
