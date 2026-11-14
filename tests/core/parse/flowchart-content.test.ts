// Flowchart content (T06): icon and image nodes from node data (every key, its default and its diagnostics), the
// separate-statement merge of Mermaid Chart files, markdown strings, `~~~`, Mermaid's link length, edge ids and edge
// data, linkStyle curves and colours, `classDef default`, several classes, classes on subgraphs, tooltips, `accTitle` /
// `accDescr` (F1), `title`, the frontmatter settings that change the content, and repeated subgraphs (Mermaid 12.1).
import { describe, expect, it } from 'vitest';
import { linkLength, parseFlowchart, titleToFrontmatter } from '../../../src/core/kinds/flowchart/parse.js';

const P = parseFlowchart;
const codes = (code: string): string[] => P(code).diagnostics.map((d) => d.code);

describe('icon nodes (§3.1)', () => {
  it('reads icon, form, label, pos, h and w; the node is an icon node whatever the shape says', () => {
    const m = P('flowchart LR\n  A@{ icon: "fa:user", form: "square", label: "User", pos: "t", h: 60, w: 40, shape: rect }');
    const a = m.nodes.get('A')!;
    expect(a.shape).toBe('icon');
    expect(a.shapeFrom).toBe('data');
    expect(a.data).toEqual({ icon: 'fa:user', form: 'square', pos: 't', h: 60, w: 40 });
    expect([a.label, a.labelFrom]).toEqual(['User', 'data']);
    expect(m.diagnostics).toEqual([]);
  });

  it('without a label the caption is empty, not the id (as Mermaid)', () => {
    const a = P('flowchart LR\n  A@{ icon: "fa:user" }').nodes.get('A')!;
    expect(a.label).toBe('');
    expect(a.data).toEqual({ icon: 'fa:user' });
  });

  it('unknown values and sizes are reported, the defaults used', () => {
    const m = P('flowchart LR\n  A@{ icon: "fa:user", form: "hex", pos: "l", h: tall, w: -3 }');
    expect(m.diagnostics.map((d) => [d.code, d.params?.['key']])).toEqual([
      ['flow.node-data-value', 'form'], ['flow.node-data-value', 'pos'], ['flow.node-data-value', 'h'], ['flow.node-data-value', 'w'],
    ]);
    expect(m.nodes.get('A')!.data).toEqual({ icon: 'fa:user', form: 'hex', pos: 'l' });
  });
});

describe('image nodes (§3.2)', () => {
  it('reads img, label, pos, w, h and constraint; img wins over icon (as Mermaid)', () => {
    const m = P('flowchart LR\n  A@{ img: "https://x.y/a.png", icon: "fa:user", label: "Pic", pos: "b", w: 60, h: 40, constraint: "on" }');
    const a = m.nodes.get('A')!;
    expect(a.shape).toBe('image');
    expect(a.data).toEqual({ img: 'https://x.y/a.png', icon: 'fa:user', pos: 'b', w: 60, h: 40, constraint: 'on' });
    expect(a.label).toBe('Pic');
    expect(codes('flowchart LR\n  A@{ img: "https://x.y/a.png", constraint: "yes" }')).toEqual(['flow.node-data-value']);
  });
});

describe('node data in a separate statement (§3.7)', () => {
  it('merges into the node defined earlier: the label from the bracket, the image from @{}, whitespace-tolerant', () => {
    const m = P('flowchart TB\n  subgraph s1["S"]\n    n3["This is sample label"]\n  end\n  n3@{ img: "https://a.b/c.svg", h: 200, w: 200, pos: "b"}\n  n1["Text Block"] --> n3\n  n1@{ shape: text}');
    const n3 = m.nodes.get('n3')!, n1 = m.nodes.get('n1')!;
    expect([n3.shape, n3.label, n3.parent, n3.labelFrom]).toEqual(['image', 'This is sample label', 's1', 'bracket']);
    expect(n3.data).toEqual({ img: 'https://a.b/c.svg', h: 200, w: 200, pos: 'b' });
    expect([n1.shape, n1.label]).toEqual(['text', 'Text Block']);
    expect(m.diagnostics).toEqual([]);
  });
});

describe('labels', () => {
  it('markdown strings keep their emphasis and are marked; no warning', () => {
    const m = P('flowchart LR\n  A["`**bold** *it*`"] -->|"`x`"| B\n  subgraph S ["`**T**`"]\n    B\n  end');
    expect(m.nodes.get('A')).toMatchObject({ label: '**bold** *it*', md: true });
    expect(m.edges[0]).toMatchObject({ label: 'x', md: true });
    expect(m.groups.get('S')).toMatchObject({ label: '**T**', md: true });
    expect(m.diagnostics).toEqual([]);
  });

  it('a markdown string written over several lines: real line breaks, the indentation dropped', () => {
    const m = P('flowchart LR\n  A["`first\n     second`"] --> B\n  B --> C');
    expect(m.nodes.get('A')!.label).toBe('first\nsecond');
    expect(m.edges.map((e) => [e.id, e.src])).toEqual([['A->B', 1], ['B->C', 3]]);
    expect(m.diagnostics).toEqual([]);
  });

  it('a later plain label replaces a markdown one; labelType markdown in node data', () => {
    const m = P('flowchart LR\n  A["`**x**`"]\n  A["plain"]\n  B@{ label: "**y**", labelType: "markdown" }');
    expect(m.nodes.get('A')!.md).toBeUndefined();
    expect(m.nodes.get('B')).toMatchObject({ label: '**y**', md: true });
  });

  it('</br> breaks a line', () => {
    expect(P('flowchart LR\n  A["a</br>b<br/>c"]').nodes.get('A')!.label).toBe('a\nb\nc');
  });
});

describe('links', () => {
  it('~~~ is an invisible link (F2): the target node exists', () => {
    const m = P('flowchart LR\n  A ~~~ B --> C');
    expect([...m.nodes.keys()]).toEqual(['A', 'B', 'C']);
    expect(m.edges.map((e) => [e.id, e.line])).toEqual([['A->B', 'invisible'], ['B->C', 'solid']]);
  });

  it('minlen follows Mermaid (F5), labelled links count their closing part', () => {
    expect(['-->', '---', '---->', '-.-', '-.->', '-..->', '==>', '===', '<-->', 'x--x', '~~~'].map(linkLength)).toEqual([1, 1, 3, 1, 1, 2, 1, 1, 1, 1, 1]);
    const m = P('flowchart LR\n  A -- a --> B\n  B -- b ---> C\n  C -. c .-> D\n  D == d ==> E\n  E -- e --- F\n  F ----------------> G');
    expect(m.edges.map((e) => e.minlen)).toEqual([1, 2, 1, 1, 1, 10]);
  });

  it('edge ids: the id is the edge id (the from->to id kept as `key`), given as Mermaid gives it', () => {
    const m = P('flowchart LR\n  A & B e1@--> C & D\n  C e1@--> D\n  A e2@-.-> D');
    expect(m.edges.map((e) => [e.id, e.uid, e.key])).toEqual([
      ['A->C', undefined, undefined], ['A->D', undefined, undefined], ['e1', 'e1', 'B->C'], ['B->D', undefined, undefined],
      ['C->D', undefined, undefined], ['e2', 'e2', 'A->D#2'],
    ]);
    expect(m.diagnostics).toEqual([]);
  });

  it('edge data: animate, animation and curve typed, every entry kept; an unknown curve is reported', () => {
    const m = P('flowchart LR\n  A e1@--> B\n  e1@{ animate: true, animation: slow, curve: linear, custom: 1 }\n  e1@{\n    curve: zig\n  }');
    const e = m.edges[0]!;
    expect(e.data).toEqual({ animate: true, animation: 'slow', curve: 'linear' });
    expect(e.blocks?.map((b) => b.entries.map((x) => x.key))).toEqual([['animate', 'animation', 'curve', 'custom'], ['curve']]);
    expect(m.nodes.has('e1')).toBe(false);
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['flow.node-data-value', 3]]);
  });

  it('linkStyle: color and interpolate, with or without styles, default included', () => {
    const m = P('flowchart LR\n  A --> B --> C\n  linkStyle 0 stroke:red,color:blue\n  linkStyle 0 interpolate basis\n  linkStyle default interpolate linear stroke:#333');
    expect({ ...m.linkStyles }).toEqual({ '0': { stroke: 'red', text: 'blue', interpolate: 'basis' }, default: { stroke: '#333', interpolate: 'linear' } });
    expect(m.diagnostics).toEqual([]);
    expect(codes('flowchart LR\n  A --> B\n  linkStyle 0 interpolate zig')).toEqual(['flow.bad-style']);
  });
});

describe('classes', () => {
  it('class with several items and classes; :::c1:::c2 (an info: stock Mermaid 11 reads one)', () => {
    const m = P('flowchart LR\n  A:::c1:::c2 --> B\n  class A,B c3,c4\n  classDef c1,c2,c3,c4 fill:#eee');
    expect(m.nodes.get('A')!.classes).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(m.nodes.get('B')!.classes).toEqual(['c3', 'c4']);
    expect(m.diagnostics.map((d) => [d.code, d.severity])).toEqual([['flow.class-chain', 'info']]);
  });

  it('classes on subgraphs, classDef default; stroke-dasharray:none clears a dash', () => {
    const m = P('flowchart LR\n  subgraph S\n    A\n  end\n  class S hot\n  classDef hot fill:#f00\n  classDef default stroke-dasharray:none,fill:#fff');
    expect(m.groups.get('S')!.classes).toEqual(['hot']);
    expect(m.classDefs['default']).toEqual({ dash: '0', fill: '#fff' });
    expect(m.undefinedClasses).toEqual([]);
  });
});

describe('interaction and accessibility', () => {
  it('click with a tooltip, href and callback forms', () => {
    const m = P('flowchart LR\n  A --> B --> C\n  click A "https://x.y" "Go there"\n  click B href "https://z" "Zed"\n  click C callback "Calls back"');
    expect([m.nodes.get('A')!.tooltip, m.nodes.get('A')!.link]).toEqual(['Go there', 'https://x.y']);
    expect(m.nodes.get('B')!.tooltip).toBe('Zed');
    expect([m.nodes.get('C')!.tooltip, m.nodes.get('C')!.link]).toEqual(['Calls back', undefined]);
  });

  it('accTitle, accDescr and the accDescr block (F1: its lines are not nodes)', () => {
    const m = P('flowchart LR\n  accTitle: Order flow\n  accDescr {\n    How an order\n    moves along\n  }\n  A --> B');
    expect([m.accTitle, m.accDescr]).toEqual(['Order flow', 'How an order\nmoves along']);
    expect([...m.nodes.keys()]).toEqual(['A', 'B']);
    expect(m.edges[0]!.src).toBe(6);
    expect(P('flowchart LR\n  accDescr: one line\n  A').accDescr).toBe('one line');
    expect(P('flowchart LR\n  accDescr { inline } \n  A').accDescr).toBe('inline');
  });

  it('title: frontmatter, or the statement (warned, with a fix to the frontmatter)', () => {
    expect(P('---\ntitle: "Sales: Q3"\n---\nflowchart LR\n  A').title).toBe('Sales: Q3');
    const code = 'flowchart LR\n  title Orders\n  A';
    const m = P(code);
    expect(m.title).toBe('Orders');
    const d = m.diagnostics.find((x) => x.code === 'flow.title-statement')!;
    expect(d.fix!.apply(code)).toBe('---\ntitle: Orders\n---\nflowchart LR\n  A');
    expect(titleToFrontmatter('---\nconfig:\n  layout: fixed\n---\nflowchart LR\n  title A: b\n  A', 5)).toBe('---\ntitle: "A: b"\nconfig:\n  layout: fixed\n---\nflowchart LR\n  A');
    expect(P(d.fix!.apply(code)).title).toBe('Orders');
  });
});

describe('frontmatter and init settings (§3.5)', () => {
  it('flowchart.curve, htmlLabels, markdownAutoWrap and wrappingWidth are read; layout: fixed is kept and ignored', () => {
    const m = P('---\ntitle: T\nconfig:\n  layout: fixed\n  htmlLabels: false\n  markdownAutoWrap: false\n  flowchart:\n    curve: stepAfter\n    wrappingWidth: 150\n---\nflowchart LR\n  A --> B');
    expect(m.config).toEqual({ curve: 'stepAfter', htmlLabels: false, markdownAutoWrap: false, wrappingWidth: 150 });
    expect(m.diagnostics).toEqual([]);
    expect(P('%%{init: {"flowchart": {"curve": "linear", "htmlLabels": false}}}%%\nflowchart LR\n  A').config).toEqual({ curve: 'linear', htmlLabels: false });
    expect(P('flowchart LR\n  A').config).toBeUndefined();
  });
});

describe('repeated subgraphs (Mermaid 12.1)', () => {
  it('a second `subgraph X` adds to the first: one subgraph, its title the first written', () => {
    const m = P('flowchart LR\n  subgraph X ["First"]\n    A\n  end\n  subgraph X ["Second"]\n    B\n  end\n  subgraph Y\n    C\n  end\n  subgraph Y ["Named later"]\n    D\n  end');
    expect([...m.groups.keys()]).toEqual(['X', 'Y']);
    expect(m.groups.get('X')).toMatchObject({ label: 'First', children: ['A', 'B'], line: 1, endLine: 6 });
    expect([...m.groups.get('X')!.lines]).toEqual([1, 4]);
    expect(m.groups.get('Y')).toMatchObject({ label: 'Named later', children: ['C', 'D'] });
  });
});
