// Geometry of the production renderer on feature fixtures: boxes, ports, label boxes, bend points and bounds, rounded
// to 0.01 px. The markup itself is covered by the golden SVGs (examples) and features.test.ts.
import { describe, expect, it } from 'vitest';
import type { RenderOptions } from '../../../src/core/render/types.js';
import { renderProd, THEME_IDS } from './helpers.js';

const round = (_k: string, v: unknown): unknown => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

/** One line per item of every geometry collection (path data left out: it is in the SVG), plus the bounds. */
function geometry(src: string, themeId?: string, opts: RenderOptions = {}): Record<string, string[] | string> {
  const { result } = renderProd(src, themeId, { opts });
  const out: Record<string, string[] | string> = {
    bounds: JSON.stringify(result.bounds, round),
    content: JSON.stringify(result.contentBounds, round),
  };
  for (const [k, v] of Object.entries(result.geom))
    if (v instanceof Map)
      out[k] = [...v].map(([id, g]) => {
        if (g && typeof g === 'object') {
          const { d: _d, ...rest } = g as Record<string, unknown>;
          return `${id} ${JSON.stringify(rest, round)}`;
        }
        return `${id} ${JSON.stringify(g, round)}`;
      });
  return out;
}

const check = (src: string, themeId?: string, opts: RenderOptions = {}): void => expect(geometry(src, themeId, opts)).toMatchSnapshot();

const FLOW = `flowchart TB
  A[Start] --> B{Decide}
  B -->|yes| C([Stadium]) --> D[(DB)]
  B -->|no| E{{Hex}} -.-> F>Asym]
  B ==> G[[Sub]]
  G --> H((Circle)) --> I(((Double)))
  C --> J[/Para/] --> K[\\Alt\\] --> L[/Trap\\] --> M[\\TrapAlt/]
  A ----> M
  M --> A
  subgraph S1 [Outer]
    subgraph S2 [Inner]
      N1 --> N2
    end
    N3
  end
  N2 --> A
  S1 --> D
  style A fill:#ffcc00,stroke:#333,stroke-width:3px
  classDef hot fill:#f99
  class N1,N3 hot
  linkStyle 0 stroke:#f00,stroke-width:2px
  click A href "https://example.com"
`;

const FLOW_META = `${FLOW}
%%@ canvas {"routing":"orthogonal"}
%%@ node B {"x":400,"y":300,"stack":2}
%%@ node C {"x":200,"y":420,"shape":"hcyl"}
%%@ edge A->B {"points":[[300,200],[420,240]],"fromSide":"r","labelAt":0.3}
%%@ edge B->C {"routing":"straight","points":[[250,380]]}
%%@ edge C->D {"routing":"curved","points":[[100,600],[150,700]],"labelDx":10,"labelDy":-4}
%%@ group S2 {"x":700,"y":100,"w":300,"h":200}
`;

const SEQ = `sequenceDiagram
  autonumber
  box Aqua Front
    actor U as User
    participant W as Web
  end
  participant A as API
  participant D@{ "type": "database" }
  U->>+W: open
  W->>W: self check
  W->>+A: POST /order
  Note over W,A: validate<br>twice
  alt ok
    A-->>-W: 201
  else fail
    A--xW: 500
  end
  loop retry
    W-)A: ping
    Note right of A: async
  end
  rect rgb(200,220,255)
    A->>D: insert
    activate D
    D-->>A: id
    deactivate D
  end
  Note left of U: done
  W-->>-U: page
  create participant Late
  A->>Late: hello
`;

const ER = `erDiagram
  direction LR
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE : contains
  CUSTOMER }|..|{ ADDRESS : uses
  ORDER |o--o| ORDER : parent
  CUSTOMER {
    string id PK
    string name "full name"
    int age
  }
  ORDER {
    int id PK
    string customer FK "owner"
  }
`;

describe('geometry on feature fixtures', () => {
  for (const theme of THEME_IDS) {
    it(`flowchart shapes, groups, classes × ${theme}`, () => check(FLOW, theme));
    it(`sequence features × ${theme}`, () => check(SEQ, theme));
    it(`ER features × ${theme}`, () => check(ER, theme));
  }
  it('flowchart with metadata: positions, bend points, routings, fixed group', () => check(FLOW_META));
  it('flowchart LR / BT / RL', () => {
    for (const dir of ['LR', 'BT', 'RL']) check(FLOW.replace('flowchart TB', `flowchart ${dir}`));
  });
  it('sequence mirrored, touched blocks, gaps', () => {
    check(`${SEQ}\n%%@ canvas {"mirror":true,"blockSpan":"touched","gap":60,"rowH":70}\n%%@ participant W {"x":500,"w":200}\n%%@ message m3 {"dy":30}\n%%@ block b1 {"showTag":true}`);
  });
  it('ER table mode, highlights, orthogonal, bend points', () => {
    check(
      `${ER}\n%%@ canvas {"routing":"orthogonal"}\n%%@ entity CUSTOMER {"mode":"table","showTypes":true,"showComments":false,"x":100,"y":100}\n` +
        `%%@ entity ORDER {"attrs":{"id":{"bold":true,"color":"@red"},"customer":{"underline":true}},"pkUnderline":true}\n` +
        `%%@ rel CUSTOMER--ORDER {"points":[[300,50],[400,80]]}`,
    );
  });
  it('page presets and ratio', () => {
    check(`${FLOW}\n%%@ canvas {"preset":"slide"}`);
    check(`${ER}\n%%@ canvas {"ratio":"4:3"}`);
    check(`${SEQ}\n%%@ canvas {"preset":"mirrored"}`);
  });
  it('unsupported and empty diagrams', () => {
    check('pie\n "a": 1');
    check('flowchart TB');
    check('sequenceDiagram');
    check('erDiagram');
  });
});

describe('hidden layers', () => {
  const hiddenIds = (g: Record<string, string[] | string>, k: string): string[] =>
    (g[k] as string[]).filter((l) => l.includes('"hidden":true')).map((l) => l.split(' ')[0]!);

  it('a hidden group hides its nested groups and nodes', () => {
    const g = geometry(FLOW, undefined, { hidden: { group: new Set(['S1']), node: new Set(['A']) } });
    expect(hiddenIds(g, 'nodes').sort()).toEqual(['A', 'N1', 'N2', 'N3']);
    expect(g).toMatchSnapshot();
  });

  it('hidden entities', () => {
    const g = geometry(ER, undefined, { hidden: { entity: new Set(['CUSTOMER']) } });
    expect(hiddenIds(g, 'entities')).toEqual(['CUSTOMER']);
    expect(g).toMatchSnapshot();
  });

  it('hidden participants and blocks, labels hidden', () => {
    expect(geometry(SEQ, undefined, { hidden: { participant: new Set(['W']), block: new Set(['b2']) }, hideLabels: true })).toMatchSnapshot();
  });
});
