// The tidy tree layout (T08.2): two-sided balance in code order (clockwise), `side` overrides, right and down,
// nudges, determinism, the per-subtree cache, and no overlap over random trees.
import { describe, expect, it } from 'vitest';
import { layoutTree, type TreeMode, type TreeNode } from '../../../src/core/layout/tree.js';
import type { Point } from '../../../src/core/types.js';

/** A tree from `parent: children` pairs, every node w × h. */
function build(spec: Record<string, string[]>, size: (id: string) => [number, number] = () => [80, 30]): Map<string, TreeNode> {
  const ids = new Set([...Object.keys(spec), ...Object.values(spec).flat()]);
  return new Map([...ids].map((id) => {
    const [w, h] = size(id);
    return [id, { id, w, h, children: spec[id] ?? [] }];
  }));
}

/** Boxes that overlap (with a small tolerance). */
function overlaps(nodes: Map<string, TreeNode>, pos: Map<string, Point>): string[] {
  const out: string[] = [];
  const ids = [...pos.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = nodes.get(ids[i]!)!, b = nodes.get(ids[j]!)!, pa = pos.get(a.id)!, pb = pos.get(b.id)!;
      if (Math.abs(pa.x - pb.x) < (a.w + b.w) / 2 - 0.01 && Math.abs(pa.y - pb.y) < (a.h + b.h) / 2 - 0.01) out.push(`${a.id}/${b.id}`);
    }
  return out;
}

describe('tidy tree', () => {
  const SPEC = { r: ['a', 'b', 'c', 'd'], a: ['a1', 'a2'], b: ['b1'], c: ['c1', 'c2', 'c3'], d: ['d1'] };

  it('both sides: the root in the middle, the first branches on the right, the left side clockwise (bottom to top)', () => {
    const nodes = build(SPEC);
    const { pos, side } = layoutTree('r', nodes);
    expect(pos.get('r')).toEqual({ x: 0, y: 0 });
    expect(['a', 'b', 'c', 'd'].map((id) => side.get(id))).toEqual(['r', 'r', 'l', 'l']);
    expect(pos.get('a')!.y).toBeLessThan(pos.get('b')!.y);
    expect(pos.get('d')!.y).toBeLessThan(pos.get('c')!.y);
    expect(pos.get('a1')!.x).toBeGreaterThan(pos.get('a')!.x);
    expect(pos.get('c1')!.x).toBeLessThan(pos.get('c')!.x);
    // a parent midway between its first and last child
    expect(pos.get('c')!.y).toBeCloseTo((pos.get('c1')!.y + pos.get('c3')!.y) / 2);
    expect(overlaps(nodes, pos)).toEqual([]);
  });

  it('balance by subtree height: a tall first branch has the right side to itself', () => {
    const nodes = build({ r: ['big', 'x', 'y'], big: ['1', '2', '3', '4', '5', '6'] });
    const { side } = layoutTree('r', nodes);
    expect(['big', 'x', 'y'].map((id) => side.get(id))).toEqual(['r', 'l', 'l']);
  });

  it('a side of its own overrides the split', () => {
    const nodes = build(SPEC);
    nodes.get('a')!.side = 'l';
    nodes.get('d')!.side = 'r';
    const { side } = layoutTree('r', nodes);
    expect(side.get('a')).toBe('l');
    expect(side.get('d')).toBe('r');
  });

  it('right: one side; down: top to bottom', () => {
    const nodes = build(SPEC);
    const right = layoutTree('r', nodes, { mode: 'right' });
    expect([...right.side.values()].every((s) => s === 'r')).toBe(true);
    expect(Math.min(...[...right.pos.values()].map((p) => p.x))).toBe(0);
    const down = layoutTree('r', nodes, { mode: 'down' });
    expect([...down.side.values()].every((s) => s === 'd')).toBe(true);
    expect(down.pos.get('a1')!.y).toBeGreaterThan(down.pos.get('a')!.y);
    expect(down.pos.get('a')!.y).toBeGreaterThan(down.pos.get('r')!.y);
    expect(overlaps(nodes, down.pos)).toEqual([]);
  });

  it('nudges move a node with its subtree', () => {
    const base = layoutTree('r', build(SPEC)).pos;
    const nodes = build(SPEC);
    nodes.get('c')!.dx = 10;
    nodes.get('c')!.dy = -5;
    const { pos } = layoutTree('r', nodes);
    for (const id of ['c', 'c1', 'c3']) expect(pos.get(id)).toEqual({ x: base.get(id)!.x + 10, y: base.get(id)!.y - 5 });
    expect(pos.get('a')).toEqual(base.get('a'));
  });

  it('collapsed subtrees are not laid out', () => {
    const nodes = build(SPEC);
    nodes.get('c')!.collapsed = true;
    const { pos } = layoutTree('r', nodes);
    expect(pos.has('c')).toBe(true);
    expect(pos.has('c1')).toBe(false);
  });

  it('deterministic, with or without the cache; an edit in one branch lays out that branch and its ancestors', () => {
    const store = new Map<string, Map<string, Point>>();
    let sets = 0;
    const cache = { get: (k: string) => store.get(k), set: (k: string, v: Map<string, Point>) => void (sets++, store.set(k, v)) };
    const a = layoutTree('r', build(SPEC)).pos;
    const b = layoutTree('r', build(SPEC), { cache }).pos;
    const first = sets;
    const c = layoutTree('r', build(SPEC), { cache }).pos;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(sets).toBe(first);
    const edited = build(SPEC, (id) => (id === 'c2' ? [140, 30] : [80, 30]));
    layoutTree('r', edited, { cache });
    // c2, c (its parent) — the other branches come from the cache
    expect(sets - first).toBe(2);
  });

  it('no overlap over random trees of random sizes, in every mode (property)', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let t = 0; t < 60; t++) {
      const n = 2 + Math.floor(rnd() * 40);
      const spec: Record<string, string[]> = {};
      for (let i = 1; i < n; i++) {
        const p = `n${Math.floor(rnd() * i)}`;
        (spec[p] ??= []).push(`n${i}`);
      }
      const sizes = new Map(Array.from({ length: n }, (_, i) => [`n${i}`, [30 + rnd() * 200, 20 + rnd() * 60] as [number, number]]));
      const nodes = build(spec, (id) => sizes.get(id)!);
      for (const mode of ['both', 'right', 'down'] as TreeMode[]) {
        const { pos } = layoutTree('n0', nodes, { mode });
        expect(pos.size).toBe(n);
        expect(overlaps(nodes, pos), `tree ${t} ${mode}`).toEqual([]);
      }
    }
  });
});
