// Edge routing (render/common.ts), including the linear orthogonal tidy pass, and port distribution.
import { describe, expect, it } from 'vitest';
import { assignPorts, crowFoot, edgePath, portPoint, type PortLink } from '../../../src/core/render/common.js';
import { walk } from '../../../src/core/scene/build.js';
import type { Side } from '../../../src/core/style.js';

interface P { x: number; y: number }

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nums = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
const SIDES: Side[] = ['t', 'b', 'l', 'r'];

describe('edge paths', () => {
  it('start and end at the ports for every routing; straight lines pass the bend points', () => {
    const r = rng(42);
    const rows: string[] = [];
    const r2 = (p: P): string => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
    for (let k = 0; k < 400; k++) {
      const box = (): { x: number; y: number; w: number; h: number } => ({ x: r() * 800, y: r() * 600, w: 40 + r() * 100, h: 30 + r() * 60 });
      // snap some coordinates so orthogonal tidy sees collinear corners
      const snap = (v: number): number => (r() < 0.4 ? Math.round(v / 50) * 50 : v);
      const a = portPoint(box(), SIDES[Math.floor(r() * 4)]!, r());
      const b = portPoint(box(), SIDES[Math.floor(r() * 4)]!, r());
      const n = Math.floor(r() * 4);
      const points: [number, number][] = Array.from({ length: n }, () => [snap(r() * 800), snap(r() * 600)]);
      if (n && r() < 0.3) points.push([points[0]![0], points[0]![1] + 100]);
      const routing = (['curved', 'orthogonal', 'straight'] as const)[k % 3];
      const curve = r() < 0.1 ? 0 : 0.5 + r();
      const path = edgePath(a, b, { routing, curve, points });
      const where = `${k} ${routing} ${path.d}`;
      const d = nums(path.d);
      expect(path.d.startsWith('M'), where).toBe(true);
      expect(Math.abs(d[0]! - a.x) + Math.abs(d[1]! - a.y), where).toBeLessThan(0.11);
      expect(Math.abs(d.at(-2)! - b.x) + Math.abs(d.at(-1)! - b.y), where).toBeLessThan(0.11);
      for (const [t, p] of [[0, a], [1, b]] as const) expect(Math.abs(path.at(t).x - p.x) + Math.abs(path.at(t).y - p.y), where).toBeLessThan(1e-6);
      expect(path.mids.length, where).toBeGreaterThanOrEqual(1);
      if (routing === 'straight') {
        expect(path.d, where).toMatch(/^M[^A-Z]+(L[^A-Z]+)+$/);
        for (const [x, y] of points) expect(path.d, where).toContain(`L${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`);
      }
      if (k < 90) rows.push(`${routing} ${path.d} | ${path.mids.map(r2).join(' ')} | ${[0.18, 0.5, 0.82].map((t) => r2(path.at(t))).join(' ')}`);
    }
    expect(rows).toMatchSnapshot();
  });

  it('distributes shared sides', () => {
    const r = rng(7);
    const boxes = Array.from({ length: 6 }, () => ({ x: r() * 600, y: r() * 600, w: 120, h: 60 }));
    const links: PortLink[] = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.floor(r() * 6), b = (a + 1 + Math.floor(r() * 5)) % 6;
      const l: PortLink = { id: `e${i}`, a: boxes[a]!, b: boxes[b]!, aKey: `n${a}`, bKey: `n${b}` };
      if (i % 5 === 0) l.fromAt = 0.2;
      if (i % 4 === 0) l.toSide = 'l';
      links.push(l);
    }
    const ports = assignPorts(links, { prefer: 'v' });
    expect([...ports.keys()]).toEqual(links.map((l) => l.id));
    // each port lies on its side of its box (boxes are centred: x, y is the middle)
    const onSide = (box: { x: number; y: number; w: number; h: number }, side: Side, p: P): boolean =>
      side === 't' || side === 'b'
        ? Math.abs(p.y - (box.y + (side === 'b' ? 1 : -1) * box.h / 2)) < 1e-9 && Math.abs(p.x - box.x) <= box.w / 2 + 1e-9
        : Math.abs(p.x - (box.x + (side === 'r' ? 1 : -1) * box.w / 2)) < 1e-9 && Math.abs(p.y - box.y) <= box.h / 2 + 1e-9;
    for (const l of links) {
      const p = ports.get(l.id)!;
      expect(onSide(l.a, p.sa, p.a), `${l.id} a`).toBe(true);
      expect(onSide(l.b, p.sb, p.b), `${l.id} b`).toBe(true);
      if (l.toSide) expect(p.sb).toBe(l.toSide);
    }
    const r3 = (v: number): number => Math.round(v * 1000) / 1000;
    expect([...ports].map(([id, p]) => `${id} ${p.sa}${p.sb} ${r3(p.a.x)},${r3(p.a.y)} ${r3(p.b.x)},${r3(p.b.y)}`)).toMatchSnapshot();
  });

  it('draws every cardinality', () => {
    const p = portPoint({ x: 0, y: 0, w: 100, h: 50 }, 'r');
    for (const c of ['one', 'zero-one', 'one-many', 'zero-many']) {
      const n = crowFoot(p, c, '#000', 1, '#fff');
      let paths = 0;
      for (const x of n) walk(x, (y) => void (y.t === 'path' && paths++));
      expect(paths).toBe(1);
    }
  });
});
