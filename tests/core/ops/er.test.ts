import { describe, expect, it } from 'vitest';
import { addERRel, addEntity, cloneER, deleteER, reconnectER, relText, updateEntity, updateRel } from '../../../src/core/ops/index.js';
import { er, expectKept, expectParses } from './helpers.js';

const CODE = `erDiagram
  USER {
    string id PK
    string name "full name"
  }
  ORDER["Customer order"] {
    int id PK
  }
  USER ||--o{ ORDER : places
  ORDER }|..|| ITEM : "has items"
`;
const M = er(CODE);

describe('ER ops', () => {
  it('relText writes cardinalities and quotes labels that need it', () => {
    expect(relText({ fromCard: 'zero-one', toCard: 'one-many', identifying: false, label: 'a b' }, 'A', 'B')).toBe('A |o..|{ B : "a b"');
    expect(relText({ fromCard: 'one', toCard: 'zero-many', identifying: true, label: '' }, 'A', 'B')).toBe('A ||--o{ B : ""');
  });

  it('addEntity adds ENTITY_<n> with an id column', () => {
    const r = addEntity(CODE, M);
    expect(r.select).toEqual({ kind: 'entity', id: 'ENTITY_1' });
    const m = er(r.code);
    expectParses(CODE, r.code);
    expectKept(M, m);
    expect(m.entities.get('ENTITY_1')!.attrs).toEqual([{ type: 'string', name: 'id', keys: ['PK'], comment: '' }]);
  });

  it('deleteER removes a table and its relationships; a table only named in them stays declared', () => {
    const r = deleteER(CODE, M, [{ kind: 'entity', id: 'ORDER' }]);
    const m = er(r.code);
    expectParses(CODE, r.code);
    expect([...m.entities.keys()].sort()).toEqual(['ITEM', 'USER']);
    expect(m.rels).toEqual([]);
    expectKept(M, m, ['entity:ORDER', ...M.rels.map((x) => `rel:${x.id}`)]);
    const rel = er(deleteER(CODE, M, [{ kind: 'rel', id: M.rels[0]!.id }]).code);
    expect(rel.rels.length).toBe(1);
  });

  it('updateEntity rewrites the label and attributes', () => {
    const r = updateEntity(CODE, M, 'USER', { label: 'App "user"', attrs: [{ type: 'int', name: 'n', keys: ['PK', 'FK'], comment: 'x' }] });
    const m = er(r.code);
    expectParses(CODE, r.code);
    expect(m.entities.get('USER')).toMatchObject({ label: 'App "user"', attrs: [{ type: 'int', name: 'n', keys: ['PK', 'FK'], comment: 'x' }] });
    expect(er(updateEntity(CODE, M, 'ORDER', { label: 'ORDER' }).code).entities.get('ORDER')!.label).toBe('ORDER');
    // an entity without a block gets one at the end
    const item = er(updateEntity(CODE, M, 'ITEM', { attrs: [{ type: 'string', name: 'sku', keys: [], comment: '' }] }).code);
    expect(item.entities.get('ITEM')!.attrs.map((a) => a.name)).toEqual(['sku']);
  });

  it('updateRel / reconnectER / addERRel', () => {
    const id = M.rels[0]!.id;
    const u = er(updateRel(CODE, M, id, { label: 'buys many', toCard: 'one-many', identifying: false }).code);
    expect(u.rels[0]).toMatchObject({ label: 'buys many', toCard: 'one-many', identifying: false, from: 'USER', to: 'ORDER' });
    const r = reconnectER(CODE, M, M.rels[1]!.id, 'b', 'USER');
    expect(r).toMatchObject({ from: 'ORDER', to: 'USER' });
    const m = er(r.code);
    expect(m.entities.has('ITEM')).toBe(true); // kept as a bare declaration
    expect(r.code.split('\n')[r.line!]!.trim()).toBe('ORDER }|..|| USER : "has items"');
    expect(addERRel(CODE, 'USER', 'ITEM').code.trimEnd().split('\n').pop()).toBe('  USER ||--o{ ITEM : ""');
  });

  it('cloneER copies blocks and the relationships between copies', () => {
    const r = cloneER(CODE, M, [{ kind: 'entity', id: 'USER' }, { kind: 'entity', id: 'ORDER' }]);
    expect(r.map).toEqual({ USER: 'USER_2', ORDER: 'ORDER_2' });
    const m = er(r.code);
    expectParses(CODE, r.code);
    expectKept(M, m);
    expect(m.entities.get('ORDER_2')!.label).toBe('Customer order');
    expect(m.rels.some((x) => x.from === 'USER_2' && x.to === 'ORDER_2')).toBe(true);
  });
});
