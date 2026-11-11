import { describe, expect, it } from 'vitest';
import { polylineCrosses, routeAround, segmentCrosses } from '../../../src/core/layout/route.js';
import type { Point, Rect } from '../../../src/core/types.js';

describe('routing around containers (T07.3)', () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };

  it('tells a segment through a box from one along or past it', () => {
    expect(segmentCrosses({ x: 0, y: 150 }, { x: 400, y: 150 }, box)).toBe(true);
    expect(segmentCrosses({ x: 0, y: 100 }, { x: 400, y: 100 }, box)).toBe(false); // along the border
    expect(segmentCrosses({ x: 0, y: 0 }, { x: 90, y: 400 }, box)).toBe(false);
    expect(segmentCrosses({ x: 150, y: 150 }, { x: 160, y: 160 }, box)).toBe(true); // inside
    expect(polylineCrosses([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 200, y: 150 }], [box])).toBe(true);
  });

  it('needs no route when nothing is in the way', () => {
    expect(routeAround({ x: 0, y: 0 }, { x: 400, y: 0 }, [box])).toBeNull();
  });

  it('goes around a box by its nearer corners, keeping the margin', () => {
    const a = { x: 0, y: 140 }, b = { x: 400, y: 140 };
    const pts = routeAround(a, b, [box], 16)!;
    expect(pts).toEqual([{ x: 84, y: 84 }, { x: 316, y: 84 }]);
    expect(polylineCrosses([a, ...pts, b], [box])).toBe(false);
  });

  it('threads between several boxes, and leaves out a box that holds an end', () => {
    const boxes = [box, { x: 100, y: 230, w: 200, h: 100 }, { x: 420, y: 0, w: 60, h: 400 }];
    const a = { x: 0, y: 215 }, b = { x: 600, y: 215 };
    const pts = routeAround(a, b, boxes, 10)!;
    expect(polylineCrosses([a, ...pts, b], boxes)).toBe(false);
    // the gap between the first two boxes is 30 wide: the way goes through it, then around the tall one
    expect(pts[0]!.y).toBeGreaterThan(200);
    expect(routeAround({ x: 150, y: 150 }, { x: 600, y: 150 }, [box])).toBeNull();
  });

  it('is deterministic', () => {
    const boxes = [box, { x: 350, y: 60, w: 50, h: 300 }];
    expect(routeAround({ x: 0, y: 150 }, { x: 600, y: 150 }, boxes)).toEqual(routeAround({ x: 0, y: 150 }, { x: 600, y: 150 }, boxes));
  });
});

describe('routeAround over many obstacles (P7)', () => {
  /** The whole visibility graph (the routing before P7): the reference for the length of the shortest way. */
  const reference = (a: Point, b: Point, obstacles: readonly Rect[], margin: number): number | null => {
    const grow = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
    const inside = (p: Point, r: Rect): boolean => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
    const grown = obstacles.map((r) => grow(r, margin)).filter((r) => !inside(a, r) && !inside(b, r));
    const walls = grown.map((r) => grow(r, -1));
    const clear = (p: Point, q: Point) => walls.every((w) => !segmentCrosses(p, q, w, 0));
    const V: Point[] = [a, b];
    for (const r of grown)
      for (const c of [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]) if (!walls.some((w) => inside(c, w))) V.push(c);
    const dist = V.map(() => Infinity), done = V.map(() => false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < V.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
      if (u < 0 || u === 1) break;
      done[u] = true;
      for (let v = 0; v < V.length; v++) {
        const d = dist[u]! + Math.hypot(V[v]!.x - V[u]!.x, V[v]!.y - V[u]!.y);
        if (!done[v] && d < dist[v]! && clear(V[u]!, V[v]!)) dist[v] = d;
      }
    }
    return dist[1] === Infinity ? null : dist[1]!;
  };
  const length = (pts: readonly Point[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
  /** A deterministic pseudo-random sequence. */
  const rng = (seed: number) => () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

  it('finds a way as short as the whole graph does, clear of every obstacle', () => {
    for (let s = 1; s <= 60; s++) {
      const r = rng(s);
      const obs: Rect[] = Array.from({ length: 4 + Math.floor(r() * 20) }, () => ({ x: r() * 900, y: r() * 600, w: 20 + r() * 120, h: 20 + r() * 80 }));
      const a = { x: -40, y: r() * 600 }, b = { x: 1100, y: r() * 600 };
      const way = routeAround(a, b, obs, 16);
      const ref = reference(a, b, obs, 16);
      if (!way) {
        // none needed, or none at all
        expect(ref === null || Math.abs(ref - Math.hypot(b.x - a.x, b.y - a.y)) < 1e-6).toBe(true);
        continue;
      }
      expect(ref).not.toBeNull();
      expect(length([a, ...way, b])).toBeCloseTo(ref!, 6);
      expect(polylineCrosses([a, ...way, b], obs.map((o) => ({ x: o.x - 15, y: o.y - 15, w: o.w + 30, h: o.h + 30 })))).toBe(false);
    }
  });

  it('obstacles off the line add little cost', () => {
    // a long line through one box, 300 boxes above and below it (none in its way)
    const a = { x: 0, y: 0 }, b = { x: 3000, y: 0 };
    const near: Rect[] = [{ x: 1500, y: -50, w: 60, h: 100 }];
    const off: Rect[] = Array.from({ length: 300 }, (_, i) => ({ x: (i % 50) * 60, y: (i % 2 ? 1 : -1) * (200 + Math.floor(i / 50) * 60), w: 30, h: 30 }));
    const t0 = performance.now();
    const way = routeAround(a, b, [...near, ...off], 16);
    const ms = performance.now() - t0;
    expect(way).toEqual(routeAround(a, b, near, 16));
    // the whole graph settles every corner within the way's length, each against 1200 others and 301 walls
    expect(ms).toBeLessThan(100);
  });
});
