// @vitest-environment jsdom
// ER ops since T11: ids quoted where Mermaid needs it (E2), relationship edits that rewrite only what changes and keep
// the written form (E8: a round trip over every cardinality and line spelling of Mermaid's lexer), aliases rewritten
// where Mermaid reads them, `:::classes` kept, deletions that keep a table's subgraph, copies into the same subgraph,
// subgraph ops (⌘G, Ungroup, Delete, titles, directions) — and every output parsed by stock Mermaid 12.2 and 11.17.
import { afterAll, describe, expect, it } from 'vitest';
import type { Cardinality } from '../../../src/core/model.js';
import { parseER } from '../../../src/core/kinds/er/parse.js';
import {
  addERRel, addEntity, canGroupER, cloneER, deleteER, erFragment, groupER, reconnectER, relabelErGroup, relText, setErDirection, setErGroupDirection, ungroupER,
  updateEntity, updateRel,
} from '../../../src/core/kinds/er/ops.js';
import { stockParse } from '../../helpers/mermaid.js';

/** Every op output of this file, parsed by stock Mermaid at the end. */
const outputs = new Set<string>();
const out = (code: string): string => {
  outputs.add(code);
  return code;
};
const errors = (code: string): string[] => parseER(code).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code}: ${d.message}`);
afterAll(async () => {
  for (const code of outputs) await stockParse(code).catch((e: Error) => Promise.reject(new Error(`${e.message}\n${code}`)));
}, 60_000);

const CARDS: Cardinality[] = ['zero-one', 'one', 'zero-many', 'one-many'];
// every spelling of Mermaid's lexer (erDiagram.jison), and the cardinality it reads
const SPELLINGS: [string, Cardinality][] = [
  ['|o', 'zero-one'], ['o|', 'zero-one'], ['||', 'one'], ['}o', 'zero-many'], ['o{', 'zero-many'], ['}|', 'one-many'], ['|{', 'one-many'],
  ['one or zero', 'zero-one'], ['zero or one', 'zero-one'], ['one or more', 'one-many'], ['one or many', 'one-many'], ['many(1)', 'one-many'], ['1+', 'one-many'],
  ['zero or more', 'zero-many'], ['zero or many', 'zero-many'], ['many(0)', 'zero-many'], ['0+', 'zero-many'], ['many', 'zero-many'],
  ['only one', 'one'], ['one', 'one'], ['1', 'one'],
];
const LINES: [string, boolean][] = [['--', true], ['..', false], ['to', true], ['optionally to', false], ['.-', false], ['-.', false]];
const isSymbol = (s: string): boolean => /^(?:[|}][|o]|o[|{]|\|\{)$/.test(s);

describe('E8: relationship edits rewrite only what changes and keep the written form', () => {
  for (const [spelling, card] of SPELLINGS)
    for (const side of ['from', 'to'] as const)
      it(`${side} written "${spelling}"`, () => {
        const code = side === 'from' ? `erDiagram\n  A ${spelling} to || B : "has many"\n` : `erDiagram\n  A || to ${spelling} B : "has many"\n`;
        const M = parseER(code);
        expect(errors(code)).toEqual([]);
        const r = M.rels[0]!;
        expect(side === 'from' ? r.fromCard : r.toCard).toBe(card);
        const at = side === 'from' ? r.fromCardAt : r.toCardAt;
        for (const c of CARDS) {
          const res = out(updateRel(code, M, r.id, side === 'from' ? { fromCard: c } : { toCard: c }).code);
          const N = parseER(res);
          expect(errors(res), res).toEqual([]);
          expect(side === 'from' ? N.rels[0]!.fromCard : N.rels[0]!.toCard).toBe(c);
          // only the token changed; its form kept (symbols stay symbols, words stay words)
          expect(res.slice(0, at[0])).toBe(code.slice(0, at[0]));
          expect(res.slice(res.length - (code.length - at[1]))).toBe(code.slice(at[1]));
          const written = res.slice(at[0], res.length - (code.length - at[1]));
          expect(isSymbol(written), written).toBe(isSymbol(spelling));
          if (c === card) expect(res).toBe(code);
        }
      });

  for (const [line, identifying] of LINES)
    it(`line written "${line}"`, () => {
      const code = `erDiagram\n  A only one ${line} zero or more B : x\n`;
      const M = parseER(code);
      expect(M.rels[0]!.identifying).toBe(identifying);
      const res = out(updateRel(code, M, M.rels[0]!.id, { identifying: !identifying }).code);
      expect(parseER(res).rels[0]!.identifying).toBe(!identifying);
      expect(/^[a-z]/.test(res.split('\n')[1]!.replace(/^\s*A only one /, ''))).toBe(/^[a-z]/.test(line));
      expect(updateRel(code, M, M.rels[0]!.id, { identifying }).code).toBe(code);
    });

  it('the label: in place, bare when one word, quoted otherwise; a missing one is added', () => {
    const code = 'erDiagram\n  CUSTOMER only one to zero or more ORDER : places\n';
    const M = parseER(code);
    expect(out(updateRel(code, M, M.rels[0]!.id, { label: 'buys many' }).code)).toBe('erDiagram\n  CUSTOMER only one to zero or more ORDER : "buys many"\n');
    expect(out(updateRel(code, M, M.rels[0]!.id, { label: 'one' }).code)).toBe('erDiagram\n  CUSTOMER only one to zero or more ORDER : "one"\n');
    expect(out(updateRel(code, M, M.rels[0]!.id, { label: '' }).code)).toBe('erDiagram\n  CUSTOMER only one to zero or more ORDER : ""\n');
    const bare = 'erDiagram\n  A ||--o{ B\n';
    expect(out(updateRel(bare, parseER(bare), 'A--B', { label: 'has' }).code)).toBe('erDiagram\n  A ||--o{ B : has\n');
  });

  it('several changes at once; classes and the written spacing stay', () => {
    const code = 'erDiagram\n  A:::c1 ||--o{ B:::c2 : x\n';
    const M = parseER(code);
    expect(out(updateRel(code, M, 'A--B', { fromCard: 'zero-one', toCard: 'one-many', identifying: false, label: 'y' }).code)).toBe('erDiagram\n  A:::c1 |o..|{ B:::c2 : y\n');
  });
});

describe('E2: ids written back quoted where Mermaid needs it', () => {
  it('new relationships, reconnects and copies', () => {
    expect(relText({ fromCard: 'one', toCard: 'zero-many', identifying: true, label: '' }, 'my table', 'one')).toBe('"my table" ||--o{ "one" : ""');
    const code = 'erDiagram\n  "my table" ||--o{ B : x\n  "line item" {\n    string id\n  }\n';
    const M = parseER(code);
    const added = out(addERRel(code, 'line item', 'my table').code);
    expect(parseER(added).rels.at(-1)).toMatchObject({ from: 'line item', to: 'my table' });
    const re = reconnectER(code, M, 'my table--B', 'b', 'line item');
    out(re.code);
    expect(re.code).toBe('erDiagram\n  B\n  "my table" ||--o{ "line item" : x\n  "line item" {\n    string id\n  }\n');
    expect(parseER(re.code).entities.has('B')).toBe(true);
    const cl = cloneER(code, M, [{ kind: 'entity', id: 'line item' }, { kind: 'entity', id: 'my table' }]);
    out(cl.code);
    expect(cl.map).toEqual({ 'line item': 'line item_2', 'my table': 'my table_2' });
    expect(cl.code).toContain('  "line item_2" {');
    expect(errors(cl.code)).toEqual([]);
  });
});

describe('tables', () => {
  it('updateEntity: the first alias is rewritten, `:::classes` and the block stay', () => {
    const code = 'erDiagram\n  p[Person]:::c\n  p["Other"] {\n    string a\n  }\n';
    const M = parseER(code);
    const r = out(updateEntity(code, M, 'p', { label: 'Human **being**' }).code);
    expect(r).toBe('erDiagram\n  p["Human **being**"]:::c\n  p["Other"] {\n    string a\n  }\n');
    expect(parseER(r).entities.get('p')).toMatchObject({ label: 'Human **being**', classes: ['c'] });
    const no = out(updateEntity(code, M, 'p', { label: 'p' }).code);
    expect(parseER(no).entities.get('p')!.label).toBe('p');
    const at = out(updateEntity(code, M, 'p', { attrs: [{ type: 'strïng?', name: 'näme', keys: ['PK'], comment: 'x "y"' }] }).code);
    expect(at).toBe('erDiagram\n  p[Person]:::c\n  p["Other"] {\n    strïng? näme PK "x \'y\'"\n  }\n');
  });

  it('updateEntity: an alias added to the first statement; a table without one gets a statement', () => {
    const code = 'erDiagram\n  A ||--o{ B : x\n  B:::c {\n  }\n';
    const M = parseER(code);
    expect(out(updateEntity(code, M, 'B', { label: 'Bee' }).code)).toBe('erDiagram\n  A ||--o{ B : x\n  B["Bee"]:::c {\n  }\n');
    expect(out(updateEntity(code, M, 'A', { label: '50% "off"' }).code)).toBe('erDiagram\n  A ||--o{ B : x\n  B:::c {\n  }\n  A["50#37; #quot;off#quot;"]\n');
    expect(parseER(updateEntity(code, M, 'A', { label: '50% "off"' }).code).entities.get('A')!.label).toBe('50% "off"');
  });

  it('deleteER: a table only named in a deleted relationship stays where it was (in its subgraph)', () => {
    const code = 'erDiagram\n  subgraph S\n    A ||--o{ B : x\n  end\n  A {\n    string id\n  }\n';
    const M = parseER(code);
    const r = out(deleteER(code, M, [{ kind: 'entity', id: 'A' }]).code);
    expect(r).toBe('erDiagram\n  subgraph S\n    B\n  end\n');
    expect(parseER(r).entities.get('B')!.parent).toBe('S');
  });

  it('cloneER: a copy of a table in a subgraph goes into it; the relationships between copies keep their form', () => {
    const code = 'erDiagram\n  subgraph S\n    A only one to many B : has\n  end\n';
    const M = parseER(code);
    const r = cloneER(code, M, [{ kind: 'entity', id: 'A' }, { kind: 'entity', id: 'B' }]);
    out(r.code);
    expect(r.code).toBe('erDiagram\n  subgraph S\n    A only one to many B : has\n    A_2\n    B_2\n  end\n  A_2 only one to many B_2 : has\n');
    expect(parseER(r.code).entities.get('A_2')!.parent).toBe('S');
  });

  it('addEntity into a subgraph; the fragment copies statements as written', () => {
    const code = 'erDiagram\n  subgraph S\n    A\n  end\n';
    const M = parseER(code);
    const r = out(addEntity(code, M, 'S').code);
    expect(parseER(r).entities.get('ENTITY_1')!.parent).toBe('S');
    const src = 'erDiagram\n  A["x"]:::c\n  A ||--o{ B : one2\n';
    const f = out(erFragment(parseER(src), src, [{ kind: 'entity', id: 'A' }, { kind: 'entity', id: 'B' }]));
    expect(f).toBe('erDiagram\n  A["x"]:::c\n  B\n  A ||--o{ B : one2\n');
  });

  it('the direction: the top-level line, not a subgraph\'s', () => {
    const code = 'erDiagram\n  subgraph S\n    direction LR\n    A\n  end\n';
    const M = parseER(code);
    expect(out(setErDirection(code, M, 'RL').code)).toBe('erDiagram\n  direction RL\n  subgraph S\n    direction LR\n    A\n  end\n');
    expect(out(setErGroupDirection(code, M, 'S', 'BT').code)).toContain('    direction BT\n');
    expect(out(setErGroupDirection(code, M, 'S', null).code)).toBe('erDiagram\n  subgraph S\n    A\n  end\n');
  });
});

describe('E6: subgraph ops', () => {
  const code = 'erDiagram\n  subgraph S [Sales]\n    A ||--o{ B : x\n    C\n  end\n  D ||--|| A : y\n  D ||--|| S : z\n';
  const M = parseER(code);

  it('⌘G: tables of one scope only', () => {
    expect(canGroupER(M, [{ kind: 'entity', id: 'A' }, { kind: 'entity', id: 'D' }])).toBeTruthy();
    expect(canGroupER(M, [{ kind: 'entity', id: 'A' }, { kind: 'entity', id: 'C' }])).toBeNull();
    // a table inside a selected subgraph goes with it
    expect(canGroupER(M, [{ kind: 'group', id: 'S' }, { kind: 'entity', id: 'A' }, { kind: 'entity', id: 'D' }])).toBeNull();
  });

  it('⌘G inside a subgraph and at the top level', () => {
    const r = groupER(code, M, [{ kind: 'entity', id: 'A' }, { kind: 'entity', id: 'C' }], 'Core');
    out(r.code);
    expect(r.select).toEqual({ kind: 'group', id: 'group1' });
    const N = parseER(r.code);
    expect([N.entities.get('A')!.parent, N.entities.get('B')!.parent, N.entities.get('C')!.parent, N.groups.get('group1')!.parent]).toEqual(['group1', 'S', 'group1', 'S']);
    const t = groupER(code, M, [{ kind: 'group', id: 'S' }, { kind: 'entity', id: 'D' }], 'All');
    out(t.code);
    // at the first selected item: the relationship to S still follows its `end`
    expect(t.code).toBe('erDiagram\n  subgraph group1 ["All"]\n    D\n    subgraph S [Sales]\n      A ||--o{ B : x\n      C\n    end\n  end\n  D ||--|| A : y\n  D ||--|| S : z\n');
    const T = parseER(t.code);
    expect([T.groups.get('S')!.parent, T.entities.get('D')!.parent, T.rels.at(-1)!.to]).toEqual(['group1', 'group1', 'S']);
    expect(T.diagnostics).toEqual([]);
  });

  it('Ungroup and Delete remove the frame (and the relationships to it); the title is rewritten in place', () => {
    const u = ungroupER(code, M, 'S');
    out(u.code);
    expect(u.code).toBe('erDiagram\n  A ||--o{ B : x\n  C\n  D ||--|| A : y\n');
    expect(u.members).toEqual(['A', 'B', 'C']);
    expect(out(deleteER(code, M, [{ kind: 'group', id: 'S' }]).code)).toBe(u.code);
    expect(out(relabelErGroup(code, M, 'S', 'Sales and "more"').code)).toContain('  subgraph S ["Sales and #quot;more#quot;"]\n');
    expect(out(relabelErGroup(code, M, 'S', 'S').code)).toContain('  subgraph S\n');
  });
});
