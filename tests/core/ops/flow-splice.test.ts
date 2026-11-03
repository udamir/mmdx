// @vitest-environment jsdom
// Flowchart ops by splicing (T02.5) and shapes written to the code (T02.6): a relabel, reconnect or delete changes only
// its own tokens — `@{…}` data, edge lengths and styles, chains, `&` groups, `:::` and edge ids stay as written — and a
// shape change writes a bracket or `@{ shape }` in Mermaid Chart's style. Every output is parsed by stock Mermaid 11.17.
import { beforeAll, describe, expect, it } from 'vitest';
import type { FlowchartModel } from '../../../src/core/model.js';
import { addFlowNode, cloneFlow, deleteFlow, relabelFlowEdge, relabelFlowNode, setFlowShape } from '../../../src/core/ops/flowchart.js';
import { reconnectFlow } from '../../../src/core/ops/connect.js';
import { parseFlowchart } from '../../../src/core/parse/flowchart.js';

const P = (code: string): FlowchartModel => parseFlowchart(code);
let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  mermaidParse = (code) => mermaid.parse(code);
});
/** Stock Mermaid reads it, and so does mmdx without warnings. */
async function valid(code: string): Promise<void> {
  await expect(mermaidParse(code), code).resolves.toBeTruthy();
  expect(P(code).diagnostics.filter((d) => d.severity !== 'info').map((d) => d.message), code).toEqual([]);
}

// analysis F4: node data, an edge length, a chain, an `&` group, a class on a bare mention and a dotted labelled link
const F4 = 'flowchart LR\n  A@{ shape: doc, label: "Report" } ---> B:::hot & C -.->|"x"| D\n  E["Old"] --> D';

describe('relabel', () => {
  it('a node: only its label changes (node data, bracket, unquoted bracket)', async () => {
    const m = P(F4);
    const a = relabelFlowNode(F4, m, 'A', 'Annual "report"').code;
    expect(a).toBe(F4.replace('label: "Report"', 'label: "Annual #quot;report#quot;"'));
    const e = relabelFlowNode(F4, m, 'E', 'New').code;
    expect(e).toBe(F4.replace('E["Old"]', 'E["New"]'));
    const plain = 'flowchart LR\n  X[plain text] --> Y';
    expect(relabelFlowNode(plain, P(plain), 'X', 'a (b)').code).toBe('flowchart LR\n  X["a (b)"] --> Y');
    for (const c of [a, e]) await valid(c);
    expect(P(a).nodes.get('A')!.label).toBe('Annual "report"');
  });

  it('an edge alone in its link: only the link changes, keeping its arrow (length, dots, heads, edge id)', async () => {
    const m = P(F4);
    const out = relabelFlowEdge(F4, m, 'B->D', 'y').code;
    // B & C -.-> D is one link of two edges: B's is split out, C's keeps the link as written
    expect(out).toBe('flowchart LR\n  A@{ shape: doc, label: "Report" } ---> B:::hot & C\n  B -.->|"y"| D\n  C -.->|"x"| D\n  E["Old"] --> D');
    const chain = 'flowchart LR\n  A --> B ---> C\n  A e1@-.-> D';
    expect(relabelFlowEdge(chain, P(chain), 'B->C', 'long').code).toBe('flowchart LR\n  A --> B --->|"long"| C\n  A e1@-.-> D');
    // an edge with its own id is that id (T06)
    expect(relabelFlowEdge(chain, P(chain), 'e1', 'id').code).toBe('flowchart LR\n  A --> B ---> C\n  A e1@-.->|"id"| D');
    const inline = 'flowchart LR\n  A -- old text --> B';
    expect(relabelFlowEdge(inline, P(inline), 'A->B', '').code).toBe('flowchart LR\n  A --> B');
    for (const c of [out, relabelFlowEdge(chain, P(chain), 'B->C', 'long').code, relabelFlowEdge(inline, P(inline), 'A->B', 'new').code]) await expect(mermaidParse(c)).resolves.toBeTruthy();
  });
});

describe('reconnect', () => {
  it('an edge alone in its link gets its new end in place; the old end keeps its definition', async () => {
    const src = 'flowchart LR\n  A["A"] --> B["B"]:::k\n  C["C"]';
    const r = reconnectFlow(src, P(src), 'A->B', 'b', 'C');
    expect(r.code).toBe('flowchart LR\n  B["B"]:::k\n  A["A"] --> C\n  C["C"]');
    expect(r.line).toBe(2);
    const s2 = 'flowchart LR\n  A@{ shape: doc } -.-> B\n  C';
    expect(reconnectFlow(s2, P(s2), 'A->B', 'a', 'C').code).toBe('flowchart LR\n  A@{ shape: doc }\n  C -.-> B\n  C');
    await valid(r.code);
  });

  it('an edge of a chain or a group is split out; the rest keeps its syntax', async () => {
    const chain = 'flowchart LR\n  A --> B ==> C';
    const r = reconnectFlow(chain, P(chain), 'A->B', 'b', 'X');
    expect(r.code).toBe('flowchart LR\n  A --> X\n  B ==> C');
    expect(r.line).toBe(1);
    const fan = 'flowchart LR\n  A & B --o C';
    const f = reconnectFlow(fan, P(fan), 'B->C', 'b', 'X');
    expect(f.code).toBe('flowchart LR\n  A --o C\n  B --o X');
    expect(P(f.code).edges.map((e) => `${e.id}:${e.end}`)).toEqual(['A->C:circle', 'B->X:circle']);
    await valid(r.code);
    await valid(f.code);
  });

  it('inside a subgraph the edge moves to the end (top level), with its own link', async () => {
    const src = 'flowchart LR\n  subgraph G\n    A ---> B\n  end\n  C';
    const r = reconnectFlow(src, P(src), 'A->B', 'b', 'C');
    expect(r.code).toBe('flowchart LR\n  subgraph G\n    A\n    B\n  end\n  C\n  A ---> C\n');
    expect(P(r.code).nodes.get('A')!.parent).toBe('G');
    await valid(r.code);
  });
});

describe('delete', () => {
  it('a node leaves its & group and chain; the rest stays as written', async () => {
    const out = deleteFlow(F4, P(F4), [{ kind: 'node', id: 'C' }]).code;
    expect(out).toBe('flowchart LR\n  A@{ shape: doc, label: "Report" } ---> B:::hot -.->|"x"| D\n  E["Old"] --> D');
    const mid = deleteFlow(F4, P(F4), [{ kind: 'node', id: 'B' }, { kind: 'node', id: 'C' }]).code;
    expect(mid).toBe('flowchart LR\n  A@{ shape: doc, label: "Report" }\n  E["Old"] --> D');
    await valid(out);
    await valid(mid);
  });

  it('one edge of a chain: the chain splits there only; a node with its separate @{} goes with it', async () => {
    const src = 'flowchart LR\n  A --> B --> C --> D\n  B["Bee"]\n  C@{ shape: tri }';
    const out = deleteFlow(src, P(src), [{ kind: 'edge', id: 'B->C' }]).code;
    expect(out).toBe('flowchart LR\n  A --> B\n  C --> D\n  B["Bee"]\n  C@{ shape: tri }');
    const gone = deleteFlow(src, P(src), [{ kind: 'node', id: 'C' }]).code;
    expect(gone).toBe('flowchart LR\n  A --> B\n  D\n  B["Bee"]');
    await valid(out);
    await valid(gone);
  });

  it('several statements on a line and multi-line node data', async () => {
    const src = 'flowchart LR\n  A --> B; B --> C\n  B@{\n    shape: doc\n    custom: 1\n  }\n  C --> D';
    const out = deleteFlow(src, P(src), [{ kind: 'edge', id: 'B->C' }]).code;
    expect(out).toBe('flowchart LR\n  A --> B\n  B@{\n    shape: doc\n    custom: 1\n  }\n  C --> D');
    // C lives on in `C --> D`: the second statement goes with its `;`, A stays (only listed here)
    expect(deleteFlow(src, P(src), [{ kind: 'node', id: 'B' }]).code).toBe('flowchart LR\n  A\n  C --> D');
    await valid(out);
  });
});

describe('copies keep node data and links', () => {
  it('clone writes the bracket and the node data of the copy', async () => {
    const src = 'flowchart LR\n  A["Disk"] -.->|"io"| B\n  A@{ shape: lin-cyl, icon: "fa:hdd" }';
    const r = cloneFlow(src, P(src), [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    expect(r.code).toContain('  A_2["Disk"]\n  A_2@{ icon: "fa:hdd", shape: lin-cyl }');
    expect(r.code).toContain('  A_2 -.->|"io"| B_2');
    await valid(r.code);
  });
});

describe('setShape (§4.5)', () => {
  const cases: [string, string, string, string][] = [
    // node written as … , new shape, expected statement(s)
    ['bracket → bracket', 'flowchart LR\n  A[Label] --> B', 'diam', 'flowchart LR\n  A{Label} --> B'],
    ['bracket → no bracket', 'flowchart LR\n  A[Label] --> B', 'doc', 'flowchart LR\n  A[Label] --> B\n  A@{ shape: doc }\n'],
    ['quoted bracket → bracket', 'flowchart LR\n  A["a (b)"]', 'circle', 'flowchart LR\n  A(("a (b)"))'],
    ['unquoted brackets inside → quoted', 'flowchart LR\n  A[f(x)]', 'stadium', 'flowchart LR\n  A(["f(x)"])'],
    ['separate @{} → in place', 'flowchart LR\n  A["L"] --> B\n  A@{ shape: doc, custom: "x" }', 'diam', 'flowchart LR\n  A["L"] --> B\n  A@{ shape: diam, custom: "x" }'],
    ['inline @{} → in place', 'flowchart LR\n  A@{ label: "L", shape: doc } --> B', 'lin-cyl', 'flowchart LR\n  A@{ label: "L", shape: lin-cyl } --> B'],
    ['@{} without shape → key added', 'flowchart LR\n  A@{ label: "L" } --> B', 'tri', 'flowchart LR\n  A@{ label: "L", shape: tri } --> B'],
    ['only in edges → bracket at first mention', 'flowchart LR\n  A --> B\n  A --> C', 'hexagon', 'flowchart LR\n  A{{"A"}} --> B\n  A --> C'],
    ['only in edges → @{} statement', 'flowchart LR\n  A --> B', 'cross-circ', 'flowchart LR\n  A --> B\n  A@{ shape: cross-circ }\n'],
    ['an old mmdx name is written as Mermaid\'s', 'flowchart LR\n  A[x]', 'parallelogram', 'flowchart LR\n  A[/x/]'],
    ['already that shape → unchanged', 'flowchart LR\n  A{x}', 'diamond', 'flowchart LR\n  A{x}'],
  ];
  for (const [name, src, shape, want] of cases)
    it(name, async () => {
      const r = setFlowShape(src, P(src), 'A', shape);
      expect(r?.code).toBe(want);
      expect(P(r!.code).nodes.get('A')!.shape).toBe(P(`flowchart LR\n  A@{ shape: ${shape === 'parallelogram' ? 'lean-r' : shape} }`).nodes.get('A')!.shape);
      await valid(r!.code);
    });

  it('a shape Mermaid lacks stays out of the code (metadata)', () => {
    expect(setFlowShape('flowchart LR\n  A', P('flowchart LR\n  A'), 'A', 'actor')).toBeNull();
  });

  it('inside a subgraph the @{} statement goes after the graph and the node stays in its subgraph', async () => {
    const src = 'flowchart LR\n  subgraph G\n    A["x"]\n  end';
    const r = setFlowShape(src, P(src), 'A', 'docs')!;
    expect(r.code).toBe('flowchart LR\n  subgraph G\n    A["x"]\n  end\n  A@{ shape: docs }\n');
    expect(P(r.code).nodes.get('A')!.parent).toBe('G');
    await valid(r.code);
  });

  it('palette drops go through it: a bracket, else a separate @{}, else metadata', async () => {
    const src = 'flowchart LR\n  A';
    const d = addFlowNode(src, P(src), { label: 'Decide', shape: 'diamond' });
    expect(d.code).toBe('flowchart LR\n  A\n  n1{"Decide"}\n');
    const l = addFlowNode(src, P(src), { label: 'Disk', shape: 'lin-cyl' });
    expect(l.code).toBe('flowchart LR\n  A\n  n1["Disk"]\n  n1@{ shape: lin-cyl }\n');
    const a = addFlowNode(src, P(src), { label: 'User', shape: 'actor' });
    expect([a.code, a.metaShape]).toEqual(['flowchart LR\n  A\n  n1["User"]\n', 'actor']);
    for (const c of [d.code, l.code, a.code]) await valid(c);
  });
});
