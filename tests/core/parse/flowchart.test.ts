import { describe, it, expect } from 'vitest';
import { parseFlowchart, renameClashingSubgraph } from '../../../src/core/parse/flowchart.js';
import type { FlowchartModel } from '../../../src/core/model.js';

const codes = (m: FlowchartModel): string[] => m.diagnostics.map((d) => d.code);
const node = (m: FlowchartModel, id: string) => {
  const n = m.nodes.get(id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

describe('flowchart header', () => {
  it.each([
    ['flowchart LR', 'LR'], ['graph TD', 'TB'], ['graph', 'TB'], ['flowchart BT', 'BT'], ['graph rl', 'RL'], ['flowchart TB', 'TB'],
  ])('%s -> %s', (h, dir) => {
    expect(parseFlowchart(`${h}\n  A`).direction).toBe(dir);
  });
  it('skips front matter before the header', () => {
    const m = parseFlowchart('---\ntitle: x\nflowchart: y\n---\nflowchart LR\n  A --> B');
    expect(m.direction).toBe('LR');
    expect([...m.nodes.keys()]).toEqual(['A', 'B']);
    expect(m.diagnostics).toEqual([]);
  });
  it('keeps statements after `graph TD;`', () => {
    const m = parseFlowchart('graph TD; A-->B; B-->C');
    expect(m.edges.map((e) => e.id)).toEqual(['A->B', 'B->C']);
  });
});

describe('flowchart nodes', () => {
  it.each([
    ['A[t]', 'rect'], ['A(t)', 'rounded'], ['A([t])', 'stadium'], ['A[[t]]', 'subroutine'], ['A[(t)]', 'cylinder'],
    ['A((t))', 'circle'], ['A(((t)))', 'doublecircle'], ['A{t}', 'diamond'], ['A{{t}}', 'hexagon'],
    ['A[/t/]', 'parallelogram'], ['A[\\t\\]', 'parallelogram-alt'], ['A[/t\\]', 'trapezoid'], ['A[\\t/]', 'trapezoid-alt'],
    ['A>t]', 'asymmetric'],
    ['A@{ shape: cyl, label: "t" }', 'cylinder'], ['A@{ shape: "lean-r", label: "t" }', 'parallelogram'],
    ['A@{ shape: notch_rect, label: "t" }', 'card'], ['A@{ shape: doc, label: "t" }', 'document'],
    ['A@{ shape: das, label: "t" }', 'hcyl'], ['A@{ shape: constructor, label: "t" }', 'rect'],
  ])('%s -> %s', (src, shape) => {
    const m = parseFlowchart(`flowchart LR\n  ${src}`);
    expect(node(m, 'A').shape).toBe(shape);
    expect(node(m, 'A').label).toBe('t');
    expect(node(m, 'A').defLine).toBe(1);
    expect(m.diagnostics).toEqual([]);
  });
  it('reads quoted labels with <br>, #quot; and #35;', () => {
    const m = parseFlowchart('flowchart LR\n  A["a<br>b #quot;c#quot; #35;1"]\n  B("x [y] (z)")');
    expect(node(m, 'A').label).toBe('a\nb "c" #1');
    expect(node(m, 'B').label).toBe('x [y] (z)');
  });
  it('ids may contain unicode and inner hyphens', () => {
    const m = parseFlowchart('flowchart LR\n  über-node --> b_2');
    expect([...m.nodes.keys()]).toEqual(['über-node', 'b_2']);
  });
  it('`@{` with only a quoted label is accepted', () => {
    const m = parseFlowchart('flowchart LR\n  A@{ label: "Hi" }');
    expect(node(m, 'A').label).toBe('Hi');
    expect(node(m, 'A').shape).toBe('rect');
  });
  it('tracks every line that mentions a node', () => {
    const m = parseFlowchart('flowchart LR\n  A --> B\n  A["x"]\n  style A fill:#f00');
    expect([...node(m, 'A').lines]).toEqual([1, 2, 3]);
    expect(node(m, 'A').defLine).toBe(2);
    expect(node(m, 'A').order).toBe(0);
    expect(node(m, 'B').order).toBe(1);
  });
});

describe('flowchart edges', () => {
  // minlen is the prototype's (count of -=. minus one), which is one more than Mermaid's for open and dotted links
  it.each([
    ['A --> B', 'solid', 'none', 'arrow', 1],
    ['A --- B', 'solid', 'none', 'none', 2],
    ['A ---> B', 'solid', 'none', 'arrow', 2],
    ['A -----> B', 'solid', 'none', 'arrow', 4],
    ['A ==> B', 'thick', 'none', 'arrow', 1],
    ['A === B', 'thick', 'none', 'none', 2],
    ['A -.-> B', 'dotted', 'none', 'arrow', 2],
    ['A -..-> B', 'dotted', 'none', 'arrow', 3],
    ['A -.- B', 'dotted', 'none', 'none', 2],
    ['A --x B', 'solid', 'none', 'cross', 1],
    ['A --o B', 'solid', 'none', 'circle', 1],
    ['A <--> B', 'solid', 'arrow', 'arrow', 1],
    ['A x--x B', 'solid', 'cross', 'cross', 1],
    ['A o--o B', 'solid', 'circle', 'circle', 1],
    ['A <==> B', 'thick', 'arrow', 'arrow', 1],
  ])('%s', (src, line, start, end, minlen) => {
    const m = parseFlowchart(`flowchart LR\n  ${src}`);
    expect(m.edges).toHaveLength(1);
    expect(m.edges[0]).toMatchObject({ id: 'A->B', from: 'A', to: 'B', line, start, end, minlen, index: 0, src: 1, label: '' });
    expect(m.diagnostics).toEqual([]);
  });
  it('reads `-- text -->` and `|text|` labels', () => {
    const m = parseFlowchart('flowchart LR\n  A -- yes --> B\n  B -->|"no<br>way"| C\n  C == big ==> D\n  D -. maybe .-> E');
    expect(m.edges.map((e) => [e.id, e.label, e.line])).toEqual([
      ['A->B', 'yes', 'solid'], ['B->C', 'no\nway', 'solid'], ['C->D', 'big', 'thick'], ['D->E', 'maybe', 'dotted'],
    ]);
  });
  it('expands & and chains, numbering parallel edges', () => {
    const m = parseFlowchart('flowchart LR\n  A & B --> C --> D\n  A --> C');
    expect(m.edges.map((e) => e.id)).toEqual(['A->C', 'B->C', 'C->D', 'A->C#2']);
    expect(m.edges.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  });
  it('splits statements on `;` outside quotes and brackets', () => {
    const m = parseFlowchart('flowchart LR\n  A["a;b"] --> B; B --> C');
    expect(node(m, 'A').label).toBe('a;b');
    expect(m.edges.map((e) => e.src)).toEqual([1, 1]);
  });
  it('reports a missing target and leftover text', () => {
    const m = parseFlowchart('flowchart LR\n  A -->\n  B --> C junk');
    expect(m.diagnostics.map((d) => [d.code, d.range?.line, d.message])).toEqual([
      ['flow.edge-no-target', 1, 'edge without target'],
      ['flow.ignored-text', 1, 'ignored "-->"'],
      ['flow.ignored-text', 2, 'ignored "junk"'],
    ]);
  });
  it('reports what it cannot parse', () => {
    const m = parseFlowchart('flowchart LR\n  --> B');
    expect(m.diagnostics[0]).toMatchObject({ code: 'flow.cannot-parse', severity: 'warning', message: 'cannot parse "--> B"', range: { line: 1 } });
  });
});

describe('flowchart subgraphs', () => {
  it('reads id [title], "title", bare id and nesting', () => {
    const m = parseFlowchart([
      'flowchart LR',
      '  subgraph outer [Outer box]',
      '    A',
      '    subgraph "Inner"',
      '      B',
      '    end',
      '  end',
      '  subgraph plain',
      '    C',
      '  end',
    ].join('\n'));
    expect([...m.groups.values()].map((g) => [g.id, g.label, g.parent, g.children, g.line, g.endLine])).toEqual([
      ['outer', 'Outer box', null, ['Inner', 'A'], 1, 6],
      ['Inner', 'Inner', 'outer', ['B'], 3, 5],
      ['plain', 'plain', null, ['C'], 7, 9],
    ]);
    expect(node(m, 'B').parent).toBe('Inner');
  });
  it('a node belongs to the first subgraph that closes listing it', () => {
    const m = parseFlowchart('flowchart LR\n  subgraph g1\n    A --> B\n  end\n  subgraph g2\n    B --> C\n  end');
    expect(node(m, 'B').parent).toBe('g1');
    expect(node(m, 'C').parent).toBe('g2');
  });
  it('an edge to a subgraph id refers to the subgraph, not a node', () => {
    const m = parseFlowchart('flowchart LR\n  subgraph G\n    A\n  end\n  X --> G');
    expect(m.nodes.has('G')).toBe(false);
    expect(m.edges[0]?.to).toBe('G');
    expect([...(m.groups.get('G')?.lines ?? [])]).toEqual([1, 4]);
  });
  it('ignores `direction` inside a subgraph', () => {
    const m = parseFlowchart('flowchart LR\n  subgraph G\n    direction TB\n    A\n  end');
    expect(m.diagnostics).toEqual([]);
    expect(m.direction).toBe('LR');
  });
  it('keeps unterminated subgraphs without endLine', () => {
    const m = parseFlowchart('flowchart LR\n  subgraph G\n    A');
    expect(m.groups.get('G')?.endLine).toBeUndefined();
    expect(node(m, 'A').parent).toBe('G');
  });
});

describe('flowchart styles and classes', () => {
  it('reads classDef, :::class, class (incl. subgraphs), style and linkStyle', () => {
    const m = parseFlowchart([
      'flowchart LR',
      '  A:::hot --> B["b"]:::cold',
      '  subgraph G',
      '    C',
      '  end',
      '  classDef hot,warm fill:#f00,stroke:#333,stroke-width:2px',
      '  class B,G warm',
      '  style A fill:#0f0,color:#fff',
      '  style G stroke-dasharray:4 2',
      '  linkStyle 0 stroke:#00f,stroke-width:3',
      '  linkStyle default stroke:gray',
    ].join('\n'));
    expect(m.classDefs['hot']).toEqual({ fill: '#f00', stroke: '#333', strokeWidth: 2 });
    expect(m.classDefs['warm']).toEqual(m.classDefs['hot']);
    expect(node(m, 'A').classes).toEqual(['hot']);
    expect(node(m, 'A').inlineClass).toBe('hot');
    expect(node(m, 'A').style).toEqual({ fill: '#0f0', text: '#fff' });
    expect(node(m, 'B').classes).toEqual(['cold', 'warm']);
    expect(m.groups.get('G')?.classes).toEqual(['warm']);
    expect(m.groups.get('G')?.style).toEqual({ dash: '4 2' });
    expect(m.linkStyles['0']).toEqual({ stroke: '#00f', strokeWidth: 3 });
    expect(m.linkStyles['default']).toEqual({ stroke: 'gray' });
    expect(m.undefinedClasses).toEqual([{ cls: 'cold', line: 1 }]);
    expect(m.diagnostics).toEqual([]);
  });
  it('a node mentioned only by style / class lines is reported', () => {
    const m = parseFlowchart('flowchart LR\n  A --> B\n  style Typo fill:#f00\n  class Typo,A c\n  classDef c fill:#fff');
    expect(m.diagnostics.map((d) => [d.code, d.range?.line, d.message])).toEqual([
      ['flow.unknown-style-target', 2, 'style refers to unknown node "Typo"'],
      ['flow.unknown-style-target', 3, 'class refers to unknown node "Typo"'],
    ]);
  });
  it('a styled node that is defined, or used by an edge, is fine', () => {
    const m = parseFlowchart('flowchart LR\n  style A fill:#f00\n  style B fill:#f00\n  A --> X\n  B["b"]');
    expect(m.diagnostics).toEqual([]);
  });
  it('reports linkStyle indexes out of range', () => {
    const m = parseFlowchart('flowchart LR\n  A --> B\n  linkStyle 0,3 stroke:#f00');
    expect(m.diagnostics.map((d) => d.message)).toEqual(['linkStyle index 3 is out of range — the diagram has 1 link (0–0)']);
    expect(m.diagnostics[0]?.code).toBe('flow.linkstyle-range');
  });
  it('reports bad style values on their line and drops them', () => {
    const m = parseFlowchart('flowchart LR\n  A\n  style A fill:nope,stroke:#000');
    expect(node(m, 'A').style).toEqual({ stroke: '#000' });
    expect(m.diagnostics).toMatchObject([{ code: 'flow.bad-style', severity: 'warning', range: { line: 2 }, message: 'invalid color "nope" for fill' }]);
  });
  it('`classDef __proto__` is an ordinary name', () => {
    const m = parseFlowchart('flowchart LR\n  classDef __proto__ fill:#f00\n  A:::__proto__');
    expect(m.classDefs['__proto__']).toEqual({ fill: '#f00' });
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(m.undefinedClasses).toEqual([]);
  });
});

describe('flowchart click and ignored statements', () => {
  it('keeps click links raw (minus control characters) on nodes only', () => {
    const m = parseFlowchart('flowchart LR\n  A\n  subgraph G\n  end\n  click A href "https://x.test/?a=1"\n  click B "java\tscript:alert(1)"\n  click G "https://g"\n  click A callback');
    expect(node(m, 'A').link).toBe('https://x.test/?a=1');
    expect(node(m, 'B').link).toBe('javascript:alert(1)');
    expect(m.nodes.has('G')).toBe(false);
    expect(m.diagnostics).toEqual([]);
  });
  it('ignores accTitle, accDescr, title and %% comments', () => {
    const m = parseFlowchart('flowchart LR\n  accTitle: t\n  accDescr: d\n  title x\n  %% note\n  A');
    expect(m.diagnostics).toEqual([]);
    expect([...m.nodes.keys()]).toEqual(['A']);
  });
});

describe('flowchart known limits give diagnostics', () => {
  it('markdown strings', () => {
    const m = parseFlowchart('flowchart LR\n  A["`**bold**`"] -->|"`x`"| B');
    expect(node(m, 'A').label).toBe('**bold**');
    expect(codes(m)).toEqual(['flow.markdown-label', 'flow.markdown-label']);
  });
  it('ELK hints: flowchart-elk, front matter and init directive', () => {
    const a = parseFlowchart('flowchart-elk LR\n  A');
    expect(a.direction).toBe('LR');
    expect(codes(a)).toEqual(['flow.elk']);
    expect(codes(parseFlowchart('---\nconfig:\n  layout: elk\n---\nflowchart LR\n  A'))).toEqual(['flow.elk']);
    expect(codes(parseFlowchart('%%{init: {"flowchart": {"defaultRenderer": "elk"}}}%%\nflowchart LR\n  A'))).toEqual(['flow.elk']);
  });
  it('edge ids and edge property lines', () => {
    const m = parseFlowchart('flowchart LR\n  A e1@--> B\n  e1@{ animate: true }');
    expect(m.edges.map((e) => e.id)).toEqual(['A->B']);
    expect(m.nodes.has('e1')).toBe(false);
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['flow.edge-id', 1], ['flow.edge-id', 2]]);
  });
});

describe('flowchart id clash', () => {
  const code = 'flowchart LR\n  subgraph G ["Group"]\n    A\n  end\n  G["Node"] --> A\n%%@ group G {"x":1}';
  it('is reported on the subgraph line with a fix', () => {
    const m = parseFlowchart(code);
    expect(m.idClashes).toEqual(['G']);
    const d = m.diagnostics.find((x) => x.code === 'flow.id-clash');
    expect(d).toMatchObject({ severity: 'error', range: { line: 1 }, params: { id: 'G', newId: 'G_group' } });
    expect(d?.message).toBe('Subgraph and node both use the id "G" — Mermaid cannot render this (cycle error). Use Fix to give the subgraph its own id.');
    const fixed = d?.fix?.apply(code) ?? '';
    expect(fixed.split('\n')[1]).toBe('  subgraph G_group ["Group"]');
    expect(fixed.split('\n')[5]).toBe('%%@ group G_group {"x":1}');
    const after = parseFlowchart(fixed);
    expect(after.idClashes).toEqual([]);
    expect(after.groups.has('G_group')).toBe(true);
  });
  it('picks a free id', () => {
    const c = 'flowchart LR\n  subgraph G\n  end\n  G["n"]\n  G_group\n';
    expect(renameClashingSubgraph(c, 'G').split('\n')[1]).toBe('  subgraph G_group2 ["G"]');
    expect(renameClashingSubgraph('flowchart LR\n  A', 'G')).toBe('flowchart LR\n  A');
  });
});
