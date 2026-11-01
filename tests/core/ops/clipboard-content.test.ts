// The content clipboard (component architecture §9): a copy carries the items as a document of their own, so what was
// copied from an old version can be pasted into a document that no longer has it.
import { describe, expect, it } from 'vitest';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { copyItems, pasteable, pasteItems } from '../../../src/core/ops/index.js';
import { er, expectParses, flow, geomOf } from './helpers.js';

const OLD = `flowchart LR
  A["Alpha"]:::core --> B["Beta"]
  subgraph G ["Group"]
    C["Gamma"] --> D
  end
  B --> C
`;
const meta = (m: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...m });

describe('content clipboard', () => {
  const model = flow(OLD);
  const geom = geomOf(OLD);
  const m = meta({ nodes: { A: { fill: '#f00', x: 100, y: 50, locked: true } }, edges: { [model.type === 'flowchart' ? model.edges[0]!.id : '']: { color: '#0f0' } } });

  it('carries the items, the connectors between them and their looks', () => {
    const data = copyItems(model, m, [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }], { code: OLD, geom })!;
    expect(data.items).toEqual([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    const c = data.content!;
    expect(c.code).toContain('Alpha');
    expect(c.code).toContain('Beta');
    expect(c.code).not.toContain('Gamma');
    expect(c.meta.nodes?.['A']).toMatchObject({ fill: '#f00' });
    expect(Object.values(c.links)).toEqual([{ color: '#0f0' }]);
    expect(c.box).not.toBeNull();
  });

  it('pastes items the target no longer has, with fresh ids and the source looks', () => {
    const data = copyItems(model, m, [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }], { code: OLD, geom })!;
    const now = 'flowchart LR\n  B["Other B"] --> X\n';
    const target = flow(now);
    expect(pasteable(target, data)).toEqual(data.items);
    const r = pasteItems(now, emptyMeta(), target, geomOf(now), data, null)!;
    expectParses(now, r.code);
    const after = flow(r.code);
    if (after.type !== 'flowchart') throw new Error();
    const ids = r.selection!.map((s) => s.id);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(['B', 'X']).not.toContain(id);
    expect(ids.map((id) => after.nodes.get(id)!.label)).toEqual(['Alpha', 'Beta']);
    // the target's own B keeps its label
    expect(after.nodes.get('B')!.label).toBe('Other B');
    expect(after.edges.some((e) => e.from === ids[0] && e.to === ids[1])).toBe(true);
    expect(r.meta.nodes?.[ids[0]!]).toMatchObject({ fill: '#f00', x: 130, y: 80 });
    expect(r.meta.nodes?.[ids[0]!]?.locked).toBeUndefined();
    const edge = after.edges.find((e) => e.from === ids[0] && e.to === ids[1])!;
    expect(r.meta.edges?.[edge.id]).toEqual({ color: '#0f0' });
  });

  it('a copied group brings what is inside it; an uncopied group around a copied node is dropped', () => {
    const data = copyItems(model, emptyMeta(), [{ kind: 'group', id: 'G' }], { code: OLD, geom })!;
    expect(data.content!.code).toContain('Gamma');
    expect(data.content!.code).toContain('subgraph G');
    const inner = copyItems(model, emptyMeta(), [{ kind: 'node', id: 'C' }], { code: OLD, geom })!;
    expect(inner.content!.code).not.toContain('subgraph');
    const r = pasteItems('flowchart LR\n  Q\n', emptyMeta(), flow('flowchart LR\n  Q\n'), null, data, { x: 0, y: 0 })!;
    const after = flow(r.code);
    if (after.type !== 'flowchart') throw new Error();
    expect([...after.groups.keys()]).toHaveLength(1);
    expect([...after.nodes.values()].some((n) => n.label === 'Gamma')).toBe(true);
  });

  it('items still in the target are copied from the target as it is now', () => {
    const data = copyItems(model, m, [{ kind: 'node', id: 'A' }], { code: OLD, geom })!;
    const r = pasteItems(OLD.replace('Alpha', 'Alpha now'), emptyMeta(), flow(OLD.replace('Alpha', 'Alpha now')), geom, data, null)!;
    const after = flow(r.code);
    if (after.type !== 'flowchart') throw new Error();
    expect(after.nodes.get(r.selection![0]!.id)!.label).toBe('Alpha now');
  });

  it('ER tables; another diagram type is refused', () => {
    const OLD_ER = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string id\n  }\n';
    const em = er(OLD_ER);
    const data = copyItems(em, emptyMeta(), [{ kind: 'entity', id: 'CUSTOMER' }, { kind: 'entity', id: 'ORDER' }], { code: OLD_ER, geom: geomOf(OLD_ER) })!;
    const now = 'erDiagram\n  PRODUCT {\n    string sku\n  }\n';
    const r = pasteItems(now, emptyMeta(), er(now), geomOf(now), data, null)!;
    expectParses(now, r.code);
    const after = er(r.code);
    if (after.type !== 'er') throw new Error();
    expect(after.entities.size).toBe(3);
    expect(after.rels).toHaveLength(1);
    expect(pasteable(flow('flowchart LR\n  A'), data)).toBeNull();
  });
});
