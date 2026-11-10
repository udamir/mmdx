// The ER diff since T11: subgraphs (11.17+) matched by id; a table or a subgraph moved into another subgraph is a
// layout change, classes and Mermaid styles are style changes; the merged picture keeps removed tables and subgraphs
// in their old subgraph, and draws.
import { describe, expect, it } from 'vitest';
import { diffDiagrams } from '../../../src/core/diff/all.js';
import { diffModels, mergeDiagrams } from '../../../src/core/diff/index.js';
import { renderDiffWith } from '../../../src/core/diff/render.js';
import { createContext } from '../../../src/core/context.js';
import { ALL_VIEW_KINDS } from '../../../src/core/kinds/all.js';
import { DIFF } from '../../../src/core/kinds/er-diff.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { ErModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';

const A = `erDiagram
  subgraph Sales [Sales domain]
    CUSTOMER ||--o{ ORDER : places
    subgraph Pay
      PAYMENT
    end
  end
  subgraph Stock
    PRODUCT
  end
  ORDER }o--|| PRODUCT : contains
  classDef hot fill:#f00
`;

type Diff = ReturnType<typeof diffDiagrams>;
const item = (d: Diff, kind: string, id: string) => d.items.find((i) => i.kind === kind && i.id === id);
const changed = (d: Diff) => d.items.filter((i) => i.status !== 'unchanged');

function merged(before: string, after: string) {
  const [a, b] = [before, after].map((s) => splitSource(s).doc);
  const ma = parse(a!.code) as ErModel, mb = parse(b!.code) as ErModel;
  return mergeDiagrams(diffModels(ma, mb, a!.meta, b!.meta), ma, mb, a!.meta, b!.meta)!;
}

describe('ER diff with subgraphs', () => {
  it('identical sources: nothing changed', () => {
    expect(changed(diffDiagrams(A, A))).toEqual([]);
  });

  it('subgraphs added, removed and retitled; a table moved into another subgraph is layout; classes are style', () => {
    const B = A.replace('subgraph Sales [Sales domain]', 'subgraph Sales [Sales]')
      .replace('  subgraph Stock\n    PRODUCT\n  end\n', '  subgraph Warehouse\n    PRODUCT\n  end\n')
      .replace('      PAYMENT\n', '')
      .replace('    CUSTOMER ||--o{ ORDER : places\n', '    CUSTOMER ||--o{ ORDER : places\n    PAYMENT:::hot\n');
    const d = diffDiagrams(A, B);
    expect(item(d, 'group', 'Sales')).toMatchObject({ status: 'changed', facets: ['content'] });
    expect(item(d, 'group', 'Stock')).toMatchObject({ status: 'removed' });
    expect(item(d, 'group', 'Warehouse')).toMatchObject({ status: 'added' });
    expect(item(d, 'entity', 'PRODUCT')).toMatchObject({ status: 'changed', facets: ['layout'] });
    expect(item(d, 'entity', 'PAYMENT')).toMatchObject({ status: 'changed', facets: ['layout', 'style'] });
  });

  it('the merged picture keeps removed tables and subgraphs in their old subgraph, and draws', () => {
    const B = A.replace('    subgraph Pay\n      PAYMENT\n    end\n', '').replace('    CUSTOMER ||--o{ ORDER : places\n', '    ORDER\n');
    const m = merged(A, B);
    const model = m.model as ErModel;
    expect(model.groups.get('Pay~del')).toMatchObject({ parent: 'Sales' });
    expect(model.entities.get('PAYMENT~del')).toMatchObject({ parent: 'Pay~del' });
    expect(model.entities.get('CUSTOMER~del')).toMatchObject({ parent: 'Sales' });
    expect(model.groups.get('Sales')!.children).toEqual(expect.arrayContaining(['Pay~del', 'CUSTOMER~del']));
    expect(m.status.get('group:Pay~del')?.status).toBe('removed');
    const r = renderDiffWith(ALL_VIEW_KINDS, A, B, createContext());
    const geom = r.merged!.result.geom;
    if (geom.type !== 'er') throw new Error('not an ER diagram');
    const pay = geom.entities.get('PAYMENT~del')!, box = geom.groups.get('Pay~del')!;
    expect(Math.abs(pay.x - box.x)).toBeLessThan(box.w / 2);
    expect(Math.abs(pay.y - box.y)).toBeLessThan(box.h / 2);
  });

  it('diff lines and highlight shapes of a subgraph', () => {
    const model = parse(A) as ErModel;
    expect([...DIFF.diffLines(model, { kind: 'group', id: 'Pay' })].sort((x, y) => x - y)).toEqual([3, 5]);
    const geom = renderDiffWith(ALL_VIEW_KINDS, A, A, createContext()).after.result.geom;
    if (geom.type !== 'er') throw new Error('not an ER diagram');
    expect(DIFF.shape(geom, { kind: 'group', id: 'Sales' })?.t).toBe('rect');
  });
});

describe('ER diff details (B34)', () => {
  it('a removed attribute is spelled like an added one: type, name, keys and comment', () => {
    const a = 'erDiagram\n  A {\n    int id PK "the key"\n  }\n', b = 'erDiagram\n  A {\n  }\n';
    const f = diffDiagrams(a, b).items.find((i) => i.kind === 'entity' && i.id === 'A')!.fields;
    expect(f).toContainEqual({ facet: 'content', field: 'attribute id', before: 'int id PK "the key"' });
    const back = diffDiagrams(b, a).items.find((i) => i.kind === 'entity' && i.id === 'A')!.fields;
    expect(back).toContainEqual({ facet: 'content', field: 'attribute id', after: 'int id PK "the key"' });
  });

  it('classDef changes are reported', () => {
    const d = diffDiagrams('erDiagram\n  A\n  classDef hot fill:#f00\n', 'erDiagram\n  A\n  classDef hot fill:#0f0\n');
    expect(d.doc.map((x) => x.field)).toContain('classDef hot');
  });
});
