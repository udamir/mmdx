import { describe, expect, it } from 'vitest';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import {
  applyOrderState, cloneItems, copyItems, duplicateItems, moveOrder, orderPositions, orderRank, orderStep, pasteItems, pasteable,
} from '../../../src/core/ops/index.js';
import { er, expectParses, flow, geomOf, seq } from './helpers.js';

const FLOW = `flowchart LR
  A["Alpha"]:::core --> B["Beta"]
  subgraph G ["Group"]
    C["Gamma"] --> D
  end
  B --> C
`;
const meta = (m: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...m });

describe('clipboard', () => {
  const model = flow(FLOW);
  const geom = geomOf(FLOW);
  if (geom.type !== 'flowchart') throw new Error();

  it('copyItems keeps copyable items only; pasteable needs them to still exist', () => {
    const data = copyItems(model, emptyMeta(), [{ kind: 'node', id: 'A' }, { kind: 'edge', id: 'A->B' }, { kind: 'node', id: 'A' }]);
    expect(data).toEqual({ type: 'flowchart', items: [{ kind: 'node', id: 'A' }] });
    expect(copyItems(model, emptyMeta(), [{ kind: 'edge', id: 'A->B' }])).toBeNull();
    expect(pasteable(flow('flowchart LR\n  B'), data)).toBeNull();
    expect(pasteable(seq('sequenceDiagram\n  A->>B: x'), data)).toBeNull();
    expect(copyItems(seq('sequenceDiagram\n  A->>B: x'), emptyMeta(), [{ kind: 'participant', id: 'A' }])).toBeNull();
  });

  it('cloneItems copies metadata (minus lock) and connector looks, shifted', () => {
    const m = meta({ nodes: { C: { fill: '#f00', locked: true } }, edges: { 'C->D': { color: '#0f0' } }, groups: { G: { x: 10, y: 20, w: 300, h: 200 } } });
    const r = cloneItems(FLOW, m, model, geom, [{ kind: 'group', id: 'G' }], 30, 30)!;
    expect(r.selection).toEqual([{ kind: 'group', id: 'G_2' }]);
    expectParses(FLOW, r.code);
    expect(r.meta.nodes!['C_2']).toMatchObject({ fill: '#f00' });
    expect(r.meta.nodes!['C_2']!.locked).toBeUndefined();
    expect(r.meta.nodes!['C_2']!.x).toBe(Math.round(geom.nodes.get('C')!.x + 30));
    expect(r.meta.groups!['G_2']).toEqual({ x: 40, y: 50, w: 300, h: 200 });
    expect(r.meta.edges!['C_2->D_2']).toEqual({ color: '#0f0' });
    expect(m.nodes!['C_2']).toBeUndefined(); // input untouched
  });

  it('pasteItems centres the copies at a point (snapped), or offsets them', () => {
    const data = copyItems(model, emptyMeta(), [{ kind: 'node', id: 'A' }])!;
    const r = pasteItems(FLOW, emptyMeta(), model, geom, data, { x: 1000, y: 1000 })!;
    const a = geom.nodes.get('A')!, c = r.meta.nodes!['A_2']!;
    // the shift is snapped to the 5-unit grid, so the copy lands within half a step of the point
    expect((Number(c.x) - Math.round(a.x)) % 5).toBe(0);
    expect(Math.abs(Number(c.x) - 1000)).toBeLessThanOrEqual(3);
    expect(Math.abs(Number(c.y) - 1000)).toBeLessThanOrEqual(3);
    const off = pasteItems(FLOW, emptyMeta(), model, geom, data)!;
    expect(off.meta.nodes!['A_2']!.x).toBe(Math.round(geom.nodes.get('A')!.x + 30));
    expect(flow(off.code).nodes.get('A_2')!.classes).toEqual(['core']);
    expect(duplicateItems(FLOW, emptyMeta(), model, geom, [{ kind: 'edge', id: 'A->B' }])).toBeNull();
    expect(duplicateItems(FLOW, emptyMeta(), model, geom, [{ kind: 'node', id: 'B' }])!.selection).toEqual([{ kind: 'node', id: 'B_2' }]);
  });

  it('ER tables copy with their relationships', () => {
    const E = 'erDiagram\n  A {\n    int id PK\n  }\n  B {\n    int id\n  }\n  A ||--o{ B : has\n';
    const em = er(E);
    const eg = geomOf(E);
    const r = cloneItems(E, meta({ rels: { [em.rels[0]!.id]: { color: '#00f' } } }), em, eg, [{ kind: 'entity', id: 'A' }, { kind: 'entity', id: 'B' }], 10, 0)!;
    const after = er(r.code);
    const rel = after.rels.find((x) => x.from === 'A_2')!;
    expect(r.meta.rels![rel.id]).toEqual({ color: '#00f' });
  });
});

describe('order', () => {
  it('orderStep follows positional ids', () => {
    const m = flow(FLOW);
    const s = orderStep(FLOW, m, { kind: 'edge', id: 'B->C' }, -1);
    expect(s && 'code' in s && s.sel).toEqual({ kind: 'edge', id: 'B->C' });
    expect(orderStep(FLOW, m, { kind: 'node', id: 'A' }, -1)).toEqual({ reason: 'Already first' });
  });

  it('orderPositions lists distinct draw ranks; every state parses', () => {
    const m = flow(FLOW);
    const o = orderPositions(FLOW, m, { kind: 'node', id: 'B' });
    expect(o.labels).toEqual(['back', 'front']);
    expect(o.states[o.index]!.code).toBe(FLOW);
    const ranks = o.states.map((s) => orderRank(s.model, s.sel));
    // one state per visible change: neighbouring states never share a rank
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).not.toBe(ranks[i - 1]);
    for (const s of o.states) expectParses(FLOW, s.code);
    const doc = applyOrderState({ code: FLOW, model: m, meta: emptyMeta() }, o.states[0]!);
    expect(doc.selection).toEqual([{ kind: 'node', id: 'B' }]);
  });

  it('sequence: messages carry their metadata; participants trade hand-placed x', () => {
    const S = 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: one\n  B->>A: two\n';
    const m = seq(S);
    const g = geomOf(S);
    const md = meta({ messages: { m1: { color: '#111' } }, participants: { A: { x: 10 } } });
    const r = moveOrder(S, md, m, g, { kind: 'message', id: 'm1' }, 1);
    expect(r.selection).toEqual([{ kind: 'message', id: 'm2' }]);
    expect(r.meta.messages).toEqual({ m2: { color: '#111' } });
    const p = moveOrder(S, md, m, g, { kind: 'participant', id: 'A' }, 1);
    expect(seq(p.code).participants.map((x) => x.id)).toEqual(['B', 'A']);
    const bx = g.type === 'sequence' ? g.participants.get('B')!.x : 0;
    expect(p.meta.participants).toEqual({ A: { x: Math.round(bx) }, B: { x: 10 } });
    expect(moveOrder(S, md, m, g, { kind: 'participant', id: 'A' }, -1).reason).toBe('Already the first participant');
    const o = orderPositions(S, m, { kind: 'message', id: 'm1' });
    expect(o.labels).toEqual(['earlier', 'later']);
    expect(o.states.length).toBeGreaterThan(1);
    for (const st of o.states) expectParses(S, st.code);
  });
});
