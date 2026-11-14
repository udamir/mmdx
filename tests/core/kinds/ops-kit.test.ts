// The ops-kind kit (X3, task 4.5): lookups from collection declarations, the line helpers, pinning auto-placed items,
// and "Reset positions in this group" (B22: a hand-placed group outside keeps the reset group in place).
import { describe, expect, it } from 'vitest';
import { collectionOps, lineSpan, pinAutoPlaced, rankByLine, resetGroupScope } from '../../../src/core/kinds/ops-kit.js';
import { emptyMeta, type DiagramMeta } from '../../../src/core/meta/types.js';
import type { FlowchartModel } from '../../../src/core/model.js';
import type { FlowGeometry } from '../../../src/core/render/types.js';

const meta = (m: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...m });

interface Toy {
  nodes: Map<string, { label: string }>;
  edges: { id: string; label: string }[];
}
const toy: Toy = { nodes: new Map([['a', { label: 'Alpha' }], ['b', { label: 'Beta' }]]), edges: [{ id: 'a->b', label: 'go' }] };
const geom = {
  nodes: new Map([['a', { x: 0, y: 0, w: 10, h: 10 }]]),
  edges: new Map([['a->b', { d: 'M0,0L1,1', label: null }]]),
};
const ops = collectionOps<FlowchartModel, FlowGeometry>([
  { kind: 'node', ids: (m) => (m as unknown as Toy).nodes.keys(), has: (m, id) => (m as unknown as Toy).nodes.has(id), taken: true, boxes: (g) => (g as unknown as typeof geom).nodes as never, texts: (m) => [...(m as unknown as Toy).nodes].map(([id, n]) => [id, [id, n.label]] as const) },
  { kind: 'edge', ids: (m) => (m as unknown as Toy).edges.map((e) => e.id), lines: (g) => (g as unknown as typeof geom).edges as never, texts: (m) => (m as unknown as Toy).edges.map((e) => [e.id, [e.label]] as const) },
]);
const M = toy as unknown as FlowchartModel, G = geom as unknown as FlowGeometry;

describe('ops kit', () => {
  it('collectionOps: find, exists, search, taken and used ids, drawn items, a box and a line', () => {
    expect(ops.find(M, 'a')).toEqual({ kind: 'node', id: 'a' });
    expect(ops.find(M, 'a->b')).toEqual({ kind: 'edge', id: 'a->b' });
    expect(ops.find(M, 'zz')).toBeNull();
    expect(ops.exists(M, { kind: 'edge', id: 'a->b' })).toBe(true);
    expect(ops.exists(M, { kind: 'group', id: 'a' })).toBe(false);
    expect(ops.search(M).map((x) => [x.ref.id, x.texts])).toEqual([['a', ['a', 'Alpha']], ['b', ['b', 'Beta']], ['a->b', ['go']]]);
    expect([...ops.takenIds(M, false)]).toEqual(['a', 'b']);
    expect(ops.usedIds(M)).toEqual({ nodes: new Set(['a', 'b']), edges: new Set(['a->b']) });
    expect(ops.drawn(G).map((x) => x.ref.id)).toEqual(['a', 'a->b']);
    expect(ops.box(G, { kind: 'node', id: 'a' })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(ops.box(G, { kind: 'edge', id: 'a->b' })).toBeNull();
    expect(ops.edge!(G, { kind: 'edge', id: 'a->b' })?.d).toBe('M0,0L1,1');
  });

  it('lineSpan and rankByLine', () => {
    expect(lineSpan(3)).toEqual({ start: 3, end: 3 });
    expect(lineSpan(null)).toBeNull();
    expect(rankByLine([{ id: 'x', key: 5 }, { id: 'y', key: 1 }, { id: 'z', key: null }], 'x')).toBe(1);
  });

  it('pinAutoPlaced pins auto-placed items where they are drawn, and then drops a group\'s top-left without a size', () => {
    const m = meta({ nodes: { b: { x: 1, y: 2 } }, groups: { G: { x: 5, y: 5 }, F: { x: 1, y: 1, w: 50, h: 50 } } });
    const boxes = new Map([['a', { x: 10.4, y: 20.6, auto: true }], ['b', { x: 99, y: 99, auto: true }], ['c', { x: NaN, y: 0, auto: true }]]);
    pinAutoPlaced(m, boxes, 'node');
    expect(m.nodes).toEqual({ a: { x: 10, y: 21 }, b: { x: 1, y: 2 } });
    expect(m.groups).toEqual({ F: { x: 1, y: 1, w: 50, h: 50 } });
    const untouched = meta({ groups: { G: { x: 5, y: 5 } } });
    pinAutoPlaced(untouched, new Map([['a', { x: 1, y: 1 }]]), 'node');
    expect(untouched.groups).toEqual({ G: { x: 5, y: 5 } });
  });

  it('resetGroupScope forgets the places inside, keeps a fixed frame, and keeps the top-left when a group outside is placed (B22)', () => {
    const inside = { nodes: ['a'], groups: ['H'] };
    const box = { x: 60, y: 40, w: 40, h: 20 };
    const cleared: string[] = [];
    const m = meta({ nodes: { a: { x: 1, y: 2, fill: '#fff' } }, groups: { H: { x: 0, y: 0, w: 9, h: 9 }, G: { x: 3, y: 3 }, O: { x: 200, y: 200 } } });
    resetGroupScope(m, 'G', { leaf: 'node', inside, box, clearLines: (within) => cleared.push(String(within('a')), String(within('zz'))) });
    expect(m.nodes).toEqual({ a: { fill: '#fff' } });
    expect(m.groups?.['H']).toBeUndefined();
    // a hand-placed group outside (O): G keeps its drawn top-left, without a size
    expect(m.groups?.['G']).toEqual({ x: 40, y: 30 });
    expect(cleared).toEqual(['true', 'false']);
    // nothing placed outside: G has no place left
    const alone = meta({ groups: { G: { x: 3, y: 3 } } });
    resetGroupScope(alone, 'G', { leaf: 'node', inside, box, clearLines: () => undefined });
    expect(alone.groups?.['G']).toBeUndefined();
    // a fixed frame stays
    const framed = meta({ groups: { G: { x: 3, y: 3, w: 30, h: 30 } } });
    resetGroupScope(framed, 'G', { leaf: 'node', inside, box, clearLines: () => undefined });
    expect(framed.groups?.['G']).toEqual({ x: 3, y: 3, w: 30, h: 30 });
  });
});
