// Routing around containers (T07.3): a connector must not cross a container that holds neither of its ends. Given the
// line as drawn (sample points) and the containers in the way, `routeAround` finds the shortest polyline between the
// two ends that keeps outside every obstacle grown by a margin (a visibility graph over the grown boxes' corners,
// Dijkstra), whose inner points become the connector's bend points. Kind-independent and deterministic (ties go to the
// lower index). Containers are few, so the graph is small; a line that crosses nothing is never routed.
import type { Point, Rect } from '../types.js';

/** Whether segment a–b passes through the inside of r (touching its border does not count). */
export function segmentCrosses(a: Point, b: Point, r: Rect, eps = 0.5): boolean {
  const x0 = r.x + eps, y0 = r.y + eps, x1 = r.x + r.w - eps, y1 = r.y + r.h - eps;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang–Barsky clipping
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dy, a.y - y0) && clip(dy, y1 - a.y) && t1 - t0 > 1e-9;
}

/** Whether a polyline passes through the inside of any of the rects. */
export function polylineCrosses(pts: readonly Point[], rects: readonly Rect[]): boolean {
  for (let i = 1; i < pts.length; i++) for (const r of rects) if (segmentCrosses(pts[i - 1]!, pts[i]!, r)) return true;
  return false;
}

const grow = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const inside = (p: Point, r: Rect): boolean => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

/**
 * The bend points of the shortest way from `a` to `b` around the obstacles grown by `margin` (null: no way around, or
 * none needed). An obstacle holding an end is left out (the end is inside it already).
 */
export function routeAround(a: Point, b: Point, obstacles: readonly Rect[], margin = 16): Point[] | null {
  const grown = obstacles.map((r) => grow(r, margin)).filter((r) => !inside(a, r) && !inside(b, r));
  if (!grown.length) return null;
  // the walls a leg must not cross: the grown boxes less a little, so a leg along a grown box's side is fine
  const walls = grown.map((r) => grow(r, -1));
  const clear = (p: Point, q: Point): boolean => {
    for (const w of walls) if (segmentCrosses(p, q, w, 0)) return false;
    return true;
  };
  if (clear(a, b)) return null;
  const V: Point[] = [a, b];
  for (const r of grown)
    for (const c of [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }])
      if (!walls.some((w) => inside(c, w))) V.push(c);
  // Dijkstra over the visibility graph (dense: O(V²) with V = 2 + 4 × obstacles)
  const n = V.length;
  const dist = new Array<number>(n).fill(Infinity), prev = new Array<number>(n).fill(-1), done = new Array<boolean>(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const d = dist[u]! + Math.hypot(V[v]!.x - V[u]!.x, V[v]!.y - V[u]!.y);
      if (d < dist[v]! - 1e-9 && clear(V[u]!, V[v]!)) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (dist[1] === Infinity) return null;
  const path: Point[] = [];
  for (let v = prev[1]!; v > 0; v = prev[v]!) path.unshift(V[v]!);
  return path.length ? path : null;
}
