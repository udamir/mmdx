// The graph render kit's scene part (X1, R1): the scope tests, containers from metadata, the compound result applied,
// the ports, the routing around scopes, an edge's stroke and label, a group's frame.
import { describe, expect, it } from 'vitest';
import { layoutCompound } from '../../../src/core/layout/compound.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { serializeNode as serialize } from '../../../src/core/scene/serialize.js';
import { containerBox, crossedOf, edgeLabel, edgeStroke, groupFrame, handFrame, placeAuto, placedContainer, placePorts, rectOf, routeAroundScopes, withinOf, type GraphEdge } from '../../../src/core/render/graph-scene.js';
import { makeCtx, registry } from './helpers.js';

const parents: Record<string, string | null> = { g: null, h: 'g', a: 'h', b: null, c: 'g' };
const within = withinOf((id) => parents[id] ?? null);

describe('graph kit scene part', () => {
  it('withinOf and crossedOf: inside at any depth; a link from outside to an item inside crosses, one to the group does not', () => {
    expect([within('a', 'g'), within('a', 'h'), within('b', 'g'), within('g', 'g')]).toEqual([true, true, false, true]);
    const loop = withinOf((id) => (id === 'p' ? 'q' : 'p'));
    expect(loop('p', 'x')).toBe(false);
    const crossed = crossedOf([{ from: 'b', to: 'a' }, { from: 'b', to: 'g' }], within);
    expect([crossed('g'), crossed('h')]).toEqual([true, true]);
    expect(crossedOf([{ from: 'b', to: 'g' }, { from: 'a', to: 'c' }], within)('g')).toBe(false);
  });

  it('handFrame and placedContainer: a frame by hand is fixed, a top-left alone is at, neither leaves the container', () => {
    expect(handFrame({ x: 1, y: 2, w: 30, h: 40 })).toEqual({ x: 1, y: 2, w: 30, h: 40 });
    expect(handFrame({ x: 1, y: 2 })).toBeNull();
    expect(placedContainer({ id: 'g' }, { x: 1, y: 2, w: 30, h: 40 })).toEqual({ id: 'g', fixed: { x: 1, y: 2, w: 30, h: 40 } });
    expect(placedContainer({ id: 'g' }, { x: 1, y: 2 })).toEqual({ id: 'g', at: { x: 1, y: 2 } });
    expect(placedContainer({ id: 'g' }, { w: 30, h: 40 })).toEqual({ id: 'g' });
  });

  it('placeAuto moves what the layout placed; containerBox and rectOf convert between rects and centre boxes', () => {
    const R = layoutCompound({ nodes: [{ id: 'a', w: 40, h: 20 }, { id: 'b', w: 40, h: 20, fixed: { x: 500, y: 500 } }], containers: [], edges: [] });
    const items = new Map([['a', { x: NaN, y: NaN }], ['b', { x: 500, y: 500 }]]);
    placeAuto(R, items);
    expect(items.get('a')).toMatchObject({ auto: true });
    expect(Number.isFinite(items.get('a')!.x)).toBe(true);
    expect(items.get('b')).toEqual({ x: 500, y: 500 });
    expect(containerBox({ x: 0, y: 10, w: 20, h: 40 }, true)).toEqual({ x: 10, y: 30, w: 20, h: 40, fixed: true });
    expect(containerBox({ x: 0, y: 10, w: 20, h: 40 }, false)).toEqual({ x: 10, y: 30, w: 20, h: 40 });
    expect(rectOf({ x: 10, y: 30, w: 20, h: 40 })).toEqual({ x: 0, y: 10, w: 20, h: 40 });
  });

  const box = (x: number, y: number): { x: number; y: number; w: number; h: number } => ({ x, y, w: 40, h: 20 });
  const edge = (id: string, from: string, to: string, a: { x: number; y: number; w: number; h: number }, b: typeof a, m = {}): GraphEdge => ({ e: { id, from, to }, m, a, b, points: [] });

  it('placePorts: the sides set by hand, else facing the bend points', () => {
    const e = edge('e', 'a', 'b', box(0, 0), box(200, 0));
    expect(placePorts([e], new Map(), null, () => false, {}).get('e')).toMatchObject({ sa: 'r', sb: 'l' });
    expect(placePorts([edge('e', 'a', 'b', box(0, 0), box(200, 0), { fromSide: 't' })], new Map(), null, () => false, {}).get('e')).toMatchObject({ sa: 't' });
    expect(placePorts([e], new Map([['e', [[0, 200], [200, 200]] as [number, number][]]]), null, () => false, {}).get('e')).toMatchObject({ sa: 'b', sb: 'b' });
  });

  it('routeAroundScopes: a line across a frame that holds neither end goes around it, and the ports are placed again', () => {
    const R = layoutCompound({ nodes: [{ id: 'a', w: 40, h: 20, fixed: { x: 0, y: 0 } }, { id: 'b', w: 40, h: 20, fixed: { x: 400, y: 0 } }], containers: [], edges: [{ id: 'e', from: 'a', to: 'b' }] });
    const e = edge('e', 'a', 'b', box(0, 0), box(400, 0));
    const routed = new Map<string, [number, number][]>();
    let placed = 0;
    const ports = (): ReturnType<typeof placePorts> => placePorts([e], routed, R, () => true, {});
    routeAroundScopes(R, {
      todo: [e], frames: [{ id: 'g', r: { x: 150, y: -50, w: 100, h: 100 } }], boxes: [], near: () => true,
      ends: (_, pp) => [pp.a, pp.b], path: () => ({ routing: 'straight', curve: 1 }), margins: [14, 24],
      ports: ports(), replacePorts: () => (placed++, ports()), routed,
    });
    expect(routed.get('e')?.length).toBeGreaterThan(0);
    expect(placed).toBe(1);
    const free = new Map<string, [number, number][]>();
    routeAroundScopes(R, { todo: [e], frames: [], boxes: [], near: () => true, ends: (_, pp) => [pp.a, pp.b], path: () => ({ routing: 'straight', curve: 1 }), margins: [14, 24], ports: ports(), replacePorts: ports, routed: free });
    expect(free.size).toBe(0);
  });

  it('edgeStroke, edgeLabel and groupFrame draw the shared scene', () => {
    const ctx = makeCtx(registry.get('default-light'), emptyMeta());
    const stroke = serialize(edgeStroke('rel', 'r1', 'rel', { from: 'a', to: 'b' }, { d: 'M0,0 L1,1', stroke: '#000' }));
    expect(stroke).toContain('class="el rel"');
    expect(stroke).toContain('data-from="a"');
    expect(stroke).toContain('class="hit"');
    const lo = { size: 12, color: '#111', family: 'sans-serif', halo: '#fff' };
    const label = serialize(edgeLabel('edge', 'e1', { lines: ['yes'] }, 5, 6, lo, null, ctx, () => null, { from: 'a', to: 'b' }));
    expect(label).toContain('data-part="label"');
    expect(label).toContain('data-to="b"');
    expect(serialize(edgeLabel('rel', 'r1', { lines: ['x'] }, 0, 0, lo, null, ctx, () => null))).not.toContain('data-from');
    const st = { stroke: '#333', fill: '#eee', titleSize: 14, pad: 10, padTop: 30 };
    const frame = serialize(groupFrame({ id: 'g', box: { x: 50, y: 50, w: 100, h: 100 }, st, title: { lines: ['Group'] }, href: null, family: 'sans-serif', cls: 'group' }, ctx, () => null));
    expect(frame).toContain('>Group<');
    expect(serialize(groupFrame({ id: 'g', box: { x: 50, y: 50, w: 100, h: 100 }, st, title: null, href: null, family: 'sans-serif', cls: 'group' }, ctx, () => null))).not.toContain('Group');
  });
});
