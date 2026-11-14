// "Reset positions in this group" (T07): resetGroupPositions forgets the hand-placed positions inside a group
// (descendants, nested frames, bend points of the connectors inside) and keeps the group in place; groupHasPositions
// says whether there is anything to forget.
import { describe, expect, it } from 'vitest';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { groupHasPositions, resetGroupPositions } from '../../../src/core/ops/positions.js';
import { parse as parseAny } from '../../../src/core/parse/index.js';
import { flow, geomOf, seq } from './helpers.js';

const CODE = [
  'flowchart TB',
  '  subgraph G[Team]',
  '    A --> B',
  '    subgraph H[Inner]',
  '      C',
  '    end',
  '  end',
  '  X --> A',
  '  B --> C',
  '',
].join('\n');

const G = { kind: 'group', id: 'G' } as const;

const metaOf = (o: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...structuredClone(o) });

/** The ids of the model's edges by their ends (`A->B`). */
const edgeId = (from: string, to: string): string => {
  const e = flow(CODE).edges.find((x) => x.from === from && x.to === to);
  if (!e) throw new Error(`no edge ${from}->${to}`);
  return e.id;
};

describe('resetGroupPositions', () => {
  const model = flow(CODE);
  const placed = metaOf({
    nodes: { A: { x: 10, y: 20, fill: '#fff' }, B: { x: 30, y: 40 }, C: { x: 50, y: 60 }, X: { x: 200, y: 10 } },
    groups: { H: { x: 0, y: 0, w: 120, h: 80 } },
    edges: {
      [edgeId('A', 'B')]: { points: [[1, 2]] },
      [edgeId('B', 'C')]: { points: [[3, 4]], color: '#000' },
      [edgeId('X', 'A')]: { points: [[5, 6]] },
    },
  });

  it('forgets the descendants\' positions, nested frames and the bend points inside; keeps styles and what is outside', () => {
    const geom = geomOf(CODE, placed);
    const r = resetGroupPositions(model, placed, geom, G)!.meta;
    expect(r.nodes).toEqual({ A: { fill: '#fff' }, X: { x: 200, y: 10 } });
    expect(r.groups?.['H']).toBeUndefined();
    expect(r.edges?.[edgeId('A', 'B')]).toBeUndefined();
    expect(r.edges?.[edgeId('B', 'C')]).toEqual({ color: '#000' });
    // a connector crossing the border keeps its bend points
    expect(r.edges?.[edgeId('X', 'A')]).toEqual({ points: [[5, 6]] });
    // the input is not mutated
    expect(placed.nodes!['B']).toEqual({ x: 30, y: 40 });
  });

  it('keeps the group in place (its top-left, no size) when something outside it is placed by hand', () => {
    const geom = geomOf(CODE, placed);
    if (geom.type !== 'flowchart') throw new Error('flowchart expected');
    const box = geom.groups.get('G')!;
    const r = resetGroupPositions(model, placed, geom, G)!.meta;
    expect(r.groups?.['G']).toEqual({ x: Math.round(box.x - box.w / 2), y: Math.round(box.y - box.h / 2) });
  });

  it('writes no anchor when nothing outside the group is placed', () => {
    const inside = metaOf({ nodes: { A: { x: 10, y: 20 }, B: { x: 30, y: 40 } } });
    const r = resetGroupPositions(model, inside, geomOf(CODE, inside), G)!.meta;
    expect(r.groups?.['G']).toBeUndefined();
    expect(r.nodes ?? {}).toEqual({});
  });

  it('a group with a fixed frame keeps its frame', () => {
    const framed = metaOf({ nodes: { A: { x: 10, y: 20 }, X: { x: 200, y: 10 } }, groups: { G: { x: 5, y: 6, w: 300, h: 200, fill: '#eee' } } });
    const r = resetGroupPositions(model, framed, geomOf(CODE, framed), G)!.meta;
    expect(r.groups?.['G']).toEqual({ x: 5, y: 6, w: 300, h: 200, fill: '#eee' });
    expect(r.nodes).toEqual({ X: { x: 200, y: 10 } });
  });

  it('a nested group: only its own contents', () => {
    const r = resetGroupPositions(model, placed, geomOf(CODE, placed), { kind: 'group', id: 'H' })!.meta;
    expect(r.nodes).toMatchObject({ A: { x: 10, y: 20 }, B: { x: 30, y: 40 }, X: { x: 200, y: 10 } });
    expect(r.nodes?.['C']).toBeUndefined();
    // the inner group's frame is fixed: it stays
    expect(r.groups?.['H']).toEqual({ x: 0, y: 0, w: 120, h: 80 });
    // B → C crosses H's border
    expect(r.edges?.[edgeId('B', 'C')]).toEqual({ points: [[3, 4]], color: '#000' });
  });

  it('null for an item that is not a group, or a type without the action', () => {
    expect(resetGroupPositions(model, placed, null, { kind: 'node', id: 'A' })).toBeNull();
    const s = seq('sequenceDiagram\n  box Team\n    participant P\n  end\n  P->>P: hi\n');
    expect(resetGroupPositions(s, emptyMeta(), null, { kind: 'group', id: 'G' })).toBeNull();
    expect(groupHasPositions(s, emptyMeta(), { kind: 'group', id: 'G' })).toBe(false);
  });
});

describe('groupHasPositions', () => {
  const model = flow(CODE);

  it('true when a descendant node or a nested group is placed, at any depth', () => {
    expect(groupHasPositions(model, metaOf({ nodes: { C: { x: 1, y: 2 } } }), G)).toBe(true);
    expect(groupHasPositions(model, metaOf({ groups: { H: { x: 1, y: 2, w: 50, h: 40 } } }), G)).toBe(true);
    expect(groupHasPositions(model, metaOf({ nodes: { C: { x: 1, y: 2 } } }), { kind: 'group', id: 'H' })).toBe(true);
  });

  it('false when only styles, the group itself or items outside are placed', () => {
    expect(groupHasPositions(model, emptyMeta(), G)).toBe(false);
    expect(groupHasPositions(model, metaOf({ nodes: { A: { fill: '#fff' }, X: { x: 1, y: 2 } }, groups: { G: { x: 1, y: 2, w: 300, h: 200 } } }), G)).toBe(false);
    expect(groupHasPositions(model, metaOf({ nodes: { A: { x: 1, y: 2 } } }), { kind: 'group', id: 'H' })).toBe(false);
    expect(groupHasPositions(model, metaOf({ nodes: { A: { x: 1, y: 2 } } }), { kind: 'node', id: 'A' })).toBe(false);
  });
});

describe('ER and state: a hand-placed sibling group keeps the reset group in place (B22)', () => {
  it.each([
    ['ER', 'erDiagram\n  subgraph G\n    A\n  end\n  subgraph S\n    B\n  end\n', 'er'],
    ['state', 'stateDiagram-v2\n  state G {\n    A\n  }\n  state S {\n    B\n  }\n', 'state'],
  ])('%s', (_, code) => {
    // only the sibling group S is placed by hand, no single table or state outside G
    const meta = metaOf({ groups: { S: { x: 400, y: 40 } } });
    const model = parseAny(code);
    const r = resetGroupPositions(model, meta, geomOf(code, meta), G);
    expect(typeof r?.meta.groups?.['G']?.x).toBe('number');
    expect(r?.meta.groups?.['S']).toEqual({ x: 400, y: 40 });
  });
});
