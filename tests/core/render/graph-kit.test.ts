// The graph render kit (X1, task 4.4a): the pieces the flowchart, state and ER renderers shared by copying.
import { describe, expect, it } from 'vitest';
import { Bounds, depthOf, diagramTitle, EMPTY_META, hiddenGroups, str } from '../../../src/core/render/graph-kit.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { makeCtx, registry } from './helpers.js';

const groups = new Map([
  ['a', { id: 'a', parent: null, children: ['b', 'x'] }],
  ['b', { id: 'b', parent: 'a', children: ['c'] }],
  ['c', { id: 'c', parent: 'b', children: [] }],
  ['d', { id: 'd', parent: null, children: [] }],
]);

describe('graph kit', () => {
  it('EMPTY_META is empty and cannot be written; str reads a non-empty string', () => {
    expect(Object.keys(EMPTY_META)).toEqual([]);
    expect(Object.isFrozen(EMPTY_META)).toBe(true);
    expect([str('a'), str(''), str(3), str(null)]).toEqual(['a', undefined, undefined, undefined]);
  });

  it('hiddenGroups: a hidden group hides the groups inside it, at any depth; unknown children are skipped', () => {
    expect([...hiddenGroups(groups, new Set(['b']))].sort()).toEqual(['b', 'c']);
    expect([...hiddenGroups(groups, new Set(['a']))].sort()).toEqual(['a', 'b', 'c']);
    expect(hiddenGroups(groups, new Set()).size).toBe(0);
  });

  it('depthOf counts the parents, and stops on a cycle', () => {
    const depth = depthOf(groups);
    expect(['a', 'b', 'c', 'd', 'missing'].map(depth)).toEqual([0, 1, 2, 0, 0]);
    const loop = depthOf(new Map([['p', { parent: 'q' }], ['q', { parent: 'p' }]]));
    expect(loop('p')).toBe(1);
  });

  it('Bounds grows by centred boxes (skipping unplaced ones) with slack past the far edges, then pads', () => {
    const b = new Bounds(6);
    expect(b.empty).toBe(true);
    expect(b.rect(10)).toEqual({ x: -10, y: -10, w: 420, h: 320 });
    b.grow({ x: 50, y: 50, w: 20, h: 10 });
    b.grow({ x: NaN, y: 0, w: 1000, h: 1000 });
    b.grow({ x: 100, y: 80, w: 0, h: 0 });
    expect(b.empty).toBe(false);
    expect(b.rect(5)).toEqual({ x: 35, y: 40, w: 76, h: 51 });
  });

  it('diagramTitle grows the bounds up (and wide enough) and draws the title; no title draws nothing', () => {
    const ctx = makeCtx(registry.get('default-light'), emptyMeta());
    const bounds = { x: 0, y: 0, w: 10, h: 100 };
    expect(diagramTitle(bounds, '  ', ctx, 'sans-serif', 8)).toEqual([]);
    expect(bounds).toEqual({ x: 0, y: 0, w: 10, h: 100 });
    const nodes = diagramTitle(bounds, 'Orders', ctx, 'sans-serif', 8);
    expect(nodes).toHaveLength(1);
    expect(bounds.y).toBeCloseTo(-(22 * 1.3 + 14));
    expect(bounds.w).toBeGreaterThan(10);
    expect(bounds.x).toBeLessThan(0);
  });
});
