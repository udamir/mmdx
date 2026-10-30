import { describe, it, expect } from 'vitest';
import { parseER } from '../../../src/core/parse/er.js';

const E = (src: string) => parseER(`erDiagram\n${src}`);

describe('ER entities', () => {
  it('reads blocks, attributes, aliases, quoted ids, {} and bare lines', () => {
    const m = E([
      '  direction LR',
      '  CUSTOMER["Customer<br>account"] {',
      '    string id PK "the key"',
      '    int order_id FK, UK',
      '    varchar(255) name',
      '    string[] tags',
      '  }',
      '  "LINE ITEM" {}',
      '  PRODUCT',
    ].join('\n'));
    expect(m.direction).toBe('LR');
    expect([...m.entities.values()].map((e) => [e.id, e.label, e.order, e.defLine, e.endLine])).toEqual([
      ['CUSTOMER', 'Customer\naccount', 0, 2, 7],
      ['LINE ITEM', 'LINE ITEM', 1, undefined, undefined],
      ['PRODUCT', 'PRODUCT', 2, undefined, undefined],
    ]);
    expect(m.entities.get('CUSTOMER')?.attrs).toEqual([
      { type: 'string', name: 'id', keys: ['PK'], comment: 'the key' },
      { type: 'int', name: 'order_id', keys: ['FK', 'UK'], comment: '' },
      { type: 'varchar(255)', name: 'name', keys: [], comment: '' },
      { type: 'string[]', name: 'tags', keys: [], comment: '' },
    ]);
    expect([...(m.entities.get('CUSTOMER')?.lines ?? [])]).toEqual([2, 3, 4, 5, 6, 7]);
    expect(m.diagnostics).toEqual([]);
  });
  it('reports bad attributes and unknown lines; ignores style / classDef / class', () => {
    const m = E('  A {\n    only\n  }\n  ???\n  style A fill:#f00\n  classDef c fill:#f00\n  class A c');
    expect(m.diagnostics.map((d) => [d.code, d.range?.line, d.message])).toEqual([
      ['er.bad-attribute', 2, 'cannot parse attribute "only"'],
      ['er.cannot-parse', 4, 'cannot parse "???"'],
    ]);
  });
});

describe('ER relationships', () => {
  it.each([
    ['A ||--o{ B : places', 'one', 'zero-many', true, 'places'],
    ['A |o..|{ B : "may have"', 'zero-one', 'one-many', false, 'may have'],
    ['A }o--o| B', 'zero-many', 'zero-one', true, ''],
    ['A }|--|| B : x', 'one-many', 'one', true, 'x'],
    ['A||--||B', 'one', 'one', true, ''],
  ])('symbolic: %s', (src, fromCard, toCard, identifying, label) => {
    const m = E(`  ${src}`);
    expect(m.rels).toEqual([{ id: 'A--B', from: 'A', to: 'B', fromCard, toCard, identifying, label, src: 1 }]);
    expect(m.diagnostics).toEqual([]);
  });
  it.each([
    ['A 1 to zero or more B : allows', 'one', 'zero-many', true],
    ['A only one optionally to one or many B : x', 'one', 'one-many', false],
    ['A one or zero to 1+ B : x', 'zero-one', 'one-many', true],
    ['A zero or one to many(0) B : x', 'zero-one', 'zero-many', true],
    ['A many(1) optionally to 0+ B : x', 'one-many', 'zero-many', false],
    ['A one or more to only one B : x', 'one-many', 'one', true],
    ['A zero or many to zero   or one B : x', 'zero-many', 'zero-one', true],
    ['A ||--zero or more B : x', 'one', 'zero-many', true],
    ['A one or more..o{ B : x', 'one-many', 'zero-many', false],
    ['A 1 TO 1 B : x', 'one', 'one', true],
  ])('words: %s', (src, fromCard, toCard, identifying) => {
    const m = E(`  ${src}`);
    expect(m.rels).toHaveLength(1);
    expect(m.rels[0]).toMatchObject({ from: 'A', to: 'B', fromCard, toCard, identifying });
    expect(m.diagnostics).toEqual([]);
  });
  it('numbers parallel relationships and keeps entity aliases / quotes', () => {
    const m = E('  "A x" ||--o{ b[Bee] : one\n  "A x" ||--o{ b : two');
    expect(m.rels.map((r) => r.id)).toEqual(['A x--b', 'A x--b#2']);
    expect(m.entities.get('b')?.label).toBe('Bee');
  });
  it('does not read a word cardinality glued to an entity name', () => {
    expect(E('  CAR1 to 1 B').rels).toEqual([]);
  });
});
