import { describe, expect, it } from 'vitest';
import { layered, MAX_VIRTUAL, type LayoutEdge, type LayoutNode } from '../../../src/core/layout/layered.js';
import type { Point } from '../../../src/core/types.js';

/** Deterministic PRNG (mulberry32). */
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

function graph(seed: number, { dag, groups }: { dag: boolean; groups: boolean }): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const r = rng(seed);
  const n = 3 + Math.floor(r() * 30);
  const nodes: LayoutNode[] = [];
  for (let i = 0; i < n; i++) {
    const path: string[] = [];
    if (groups && r() < 0.6) {
      path.push(`g${Math.floor(r() * 3)}`);
      if (r() < 0.4) path.push(`h${Math.floor(r() * 2)}`);
    }
    nodes.push({ id: `n${i}`, w: 60 + Math.floor(r() * 120), h: 30 + Math.floor(r() * 50), path });
  }
  const edges: LayoutEdge[] = [];
  const m = Math.floor(r() * n * 2);
  for (let k = 0; k < m; k++) {
    let a = Math.floor(r() * n), b = Math.floor(r() * n);
    if (dag && a > b) [a, b] = [b, a];
    edges.push({ from: `n${a}`, to: `n${b}`, minlen: r() < 0.2 ? 2 + Math.floor(r() * 3) : 1 });
  }
  return { nodes, edges };
}

function expectSame(a: Map<string, Point>, b: Map<string, Point>): void {
  expect([...a.keys()]).toEqual([...b.keys()]);
  for (const [id, p] of b) {
    const q = a.get(id)!;
    expect(Math.abs(q.x - p.x), `${id}.x`).toBeLessThan(1e-6);
    expect(Math.abs(q.y - p.y), `${id}.y`).toBeLessThan(1e-6);
  }
}

describe('layered layout', () => {
  // positions, one line per graph: any change to the layout shows up here for review
  const rows = (pos: Map<string, Point>): string => [...pos].map(([id, p]) => `${id}:${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(' ');

  it('random DAGs: every edge goes down the rank direction', () => {
    const out: string[] = [];
    for (let s = 1; s <= 60; s++) {
      const { nodes, edges } = graph(s, { dag: true, groups: s % 2 === 0 });
      const dir = (['TB', 'LR', 'BT', 'RL'] as const)[s % 4]!;
      const o = { dir, rankSep: 70 + (s % 3) * 20, nodeSep: 46, groupGap: 60 };
      const pos = layered(nodes, edges, o);
      expect(pos.size).toBe(nodes.length);
      const rank = (p: Point): number => (dir === 'TB' ? p.y : dir === 'BT' ? -p.y : dir === 'LR' ? p.x : -p.x);
      for (const e of edges) if (e.from !== e.to) expect(rank(pos.get(e.to!)!), `seed ${s} ${e.from}->${e.to}`).toBeGreaterThan(rank(pos.get(e.from!)!));
      out.push(`${s} ${dir}: ${rows(pos)}`);
    }
    expect(out).toMatchSnapshot();
  });

  it('random graphs with cycles', () => {
    const out: string[] = [];
    for (let s = 100; s < 160; s++) {
      const { nodes, edges } = graph(s, { dag: false, groups: s % 3 === 0 });
      const pos = layered(nodes, edges, {});
      expect(pos.size).toBe(nodes.length);
      out.push(`${s}: ${rows(pos)}`);
    }
    expect(out).toMatchSnapshot();
  });

  it('lays out a 10 000-node chain without overflowing the stack', () => {
    const N = 10_000;
    const nodes: LayoutNode[] = Array.from({ length: N }, (_, i) => ({ id: `n${i}`, w: 80, h: 40 }));
    const edges: LayoutEdge[] = Array.from({ length: N - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
    edges.push({ from: `n${N - 1}`, to: 'n0' }); // and a cycle back to the start
    const pos = layered(nodes, edges, {});
    expect(pos.size).toBe(N);
    for (let i = 1; i < N; i++) expect(pos.get(`n${i}`)!.y).toBeGreaterThan(pos.get(`n${i - 1}`)!.y);
  });

  it('caps huge minlen and the number of virtual nodes', () => {
    const nodes: LayoutNode[] = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, w: 80, h: 40 }));
    const edges: LayoutEdge[] = [];
    for (let i = 0; i < 199; i++) edges.push({ from: `n${i}`, to: `n${i + 1}`, minlen: 1e9 });
    for (let i = 0; i < 199; i++) edges.push({ from: 'n0', to: `n${i + 1}` }); // long edges: many virtual nodes
    const t0 = Date.now();
    const pos = layered(nodes, edges, {});
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(pos.size).toBe(200);
    // minlen clamped to 50 ranks (each at least rankSep apart, at most a node plus rankSep)
    const dy = pos.get('n1')!.y - pos.get('n0')!.y;
    expect(dy).toBeGreaterThanOrEqual(50 * 70);
    expect(dy).toBeLessThanOrEqual(50 * 110);
    expect(MAX_VIRTUAL).toBe(20_000);
  });

  it('is deterministic and ignores dangling / self edges', () => {
    const { nodes, edges } = graph(7, { dag: false, groups: true });
    const extra: LayoutEdge[] = [...edges, { from: 'n0', to: 'n0' }, { from: 'n0', to: 'missing' }, { from: null, to: 'n1' }];
    const a = layered(nodes, extra, {}), b = layered(nodes, extra, {});
    expect(JSON.stringify([...a])).toBe(JSON.stringify([...b]));
    expectSame(a, layered(nodes, edges, {}));
  });
});
