// Characterization of the ER parser's phases (R2, BUG-003): branches the other parser tests do not reach, written before
// readER was split into prepare → lex → statements → resolve over an explicit ErParse record.
import { describe, expect, it } from 'vitest';
import { parseER } from '../../../src/core/kinds/er/parse.js';
import type { ErModel } from '../../../src/core/model.js';

const diags = (m: ErModel): [string, number | undefined][] => m.diagnostics.map((d) => [d.code, d.range?.line]);

describe('ER phases', () => {
  it('no header: reported, the statements still read', () => {
    const m = parseER('A ||--o{ B : has\n');
    expect(diags(m)).toEqual([['er.header', undefined]]);
    expect(m.rels.map((r) => r.id)).toEqual(['A--B']);
  });

  it('a relationship to a subgraph before its end, and a subgraph that is also an entity', () => {
    const m = parseER('erDiagram\n  X ||--o{ G : early\n  G {\n    int id\n  }\n  subgraph G\n    C\n  end\n  X ||--o{ G : late\n');
    expect(diags(m)).toEqual([['er.subgraph-later', 1], ['er.id-clash', 2]]);
    expect([...m.entities.keys()]).toEqual(['X', 'C']);
    expect(m.entities.get('C')?.parent).toBe('G');
  });

  it('a bad style, an end without a subgraph and a style statement without styles', () => {
    const m = parseER('erDiagram\n  A\n  style A fill:#f00,bogus\n  end\n  style A\n  classDef c color:red\n');
    expect(diags(m).map(([c]) => c)).toEqual(['er.bad-style', 'er.cannot-parse', 'er.cannot-parse']);
    expect(m.entities.get('A')?.style).toMatchObject({ fill: '#f00' });
    expect(m.classDefs['c']).toEqual({ text: 'red' });
  });

  it('nested subgraphs: inner ones claim first, the order follows the code', () => {
    const m = parseER('erDiagram\n  subgraph O [Outer box]\n    A\n    subgraph I\n      A\n      B\n    end\n    direction LR\n  end\n');
    expect([...m.groups.keys()]).toEqual(['O', 'I']);
    expect(m.groups.get('O')).toMatchObject({ label: 'Outer box', children: ['I'], dir: 'LR', parent: null });
    expect(m.groups.get('I')).toMatchObject({ children: ['A', 'B'], parent: 'O' });
    expect(m.entities.get('A')?.parent).toBe('I');
  });
});
