// Golden SVGs (§14): every example × every built-in theme, measured with the static measurer, plus the Q7 fixes.
import { describe, expect, it } from 'vitest';
import { Lru } from '../../../src/core/text/measure.js';
import type { Point } from '../../../src/core/types.js';
import { EXAMPLES, renderProd, THEME_IDS } from './helpers.js';

describe('golden SVG', () => {
  for (const ex of EXAMPLES)
    for (const theme of THEME_IDS)
      it(`${ex.name} × ${theme}`, () => {
        expect(renderProd(ex.src, theme).svg).toMatchSnapshot();
      });
});

describe('determinism (§7.2)', () => {
  it('same input → byte-identical output, with or without a layout cache', () => {
    const cache = new Lru<string, Map<string, Point>>(16);
    for (const ex of EXAMPLES) {
      const a = renderProd(ex.src).svg;
      const b = renderProd(ex.src, undefined, { layoutCache: cache }).svg;
      const c = renderProd(ex.src, undefined, { layoutCache: cache }).svg; // cache hit
      expect(b).toBe(a);
      expect(c).toBe(a);
    }
    expect(cache.size).toBeGreaterThan(0);
  });
});

// Q7 (decided): per-item keys the prototype ignored
const Q7 = {
  'link on every item kind with text': `flowchart LR
  subgraph G [Group]
    A[Node] -->|label| B
  end
%%@ group G {"link":"https://example.com/g"}
%%@ edge A->B {"link":"https://example.com/e"}
%%@ node B {"link":"/relative/b"}`,
  'sequence links, labelOnLine and showTag per item': `sequenceDiagram
  title Per-item keys
  box Front
    participant A
  end
  participant B
  loop every minute
    A->>B: on the line
    A->>B: above the line
  end
  Note over A,B: a note
%%@ participant A {"link":"https://example.com/a"}
%%@ message m1 {"labelOnLine":true,"link":"https://example.com/m"}
%%@ message m2 {"labelOnLine":false}
%%@ note n1 {"link":"https://example.com/n"}
%%@ block b1 {"showTag":true,"link":"https://example.com/b"}
%%@ box box1 {"link":"https://example.com/box"}`,
  '_base for every kind': `sequenceDiagram
  participant A
  participant B
  A->>+B: hi
  Note right of B: n
  opt maybe
    B-->>-A: ok
  end
%%@ style.participant _base {"fill":"@sky"}
%%@ style.message _base {"color":"@red","labelColor":"@red"}
%%@ style.note _base {"fill":"@mint"}
%%@ style.block _base {"fill":"@pale-rose"}
%%@ style.activation _base {"fill":"@gold"}`,
  'ER __title bold / underline / colour, rel link': `erDiagram
  A ||--o{ B : has
  A {
    int id PK
    string name
  }
  B {
    int id
  }
%%@ entity A {"attrs":{"__title":{"color":"@red","bold":false,"underline":true},"name":{"bold":true}}}
%%@ entity B {"mode":"table","attrs":{"__title":{"bold":true,"underline":true}}}
%%@ rel A--B {"link":"https://example.com/r"}
%%@ style.rel _base {"color":"@blue"}`,
};

describe('golden SVG: Q7 fixes', () => {
  for (const [name, src] of Object.entries(Q7))
    it(name, () => {
      expect(renderProd(src).svg).toMatchSnapshot();
    });
});
