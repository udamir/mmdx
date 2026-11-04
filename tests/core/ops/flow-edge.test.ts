// @vitest-environment jsdom
// A flowchart edge's animation in the code (Mermaid 11.10 edge data): an id given where the edge has none, the data
// written, changed and taken off in place; every output parsed by stock Mermaid and read back with the same animation.
import { beforeAll, describe, expect, it } from 'vitest';
import { flowEdgeAnimation, setFlowEdgeAnimation, type EdgeAnimation } from '../../../src/core/ops/flow-edge.js';
import { parseFlowchart } from '../../../src/core/parse/flowchart.js';

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  mermaidParse = (code) => mermaid.parse(code);
});

/** Sets the animation of the edge `from`→`to`; checks Mermaid reads the result and mmdx reads the animation back. */
async function set(code: string, from: string, to: string, a: EdgeAnimation): Promise<string> {
  const m = parseFlowchart(code);
  const e = m.edges.find((x) => x.from === from && x.to === to)!;
  const r = setFlowEdgeAnimation(code, m, e.id, a);
  expect(r, code).not.toBeNull();
  await expect(mermaidParse(r!.code), r!.code).resolves.toBeTruthy();
  const back = parseFlowchart(r!.code);
  const e2 = back.edges.find((x) => x.from === from && x.to === to)!;
  expect(flowEdgeAnimation(back, e2.id)).toBe(a);
  expect(back.edges).toHaveLength(m.edges.length);
  return r!.code;
}

describe('edge animation', () => {
  it('an edge without an id gets one, and its data a statement of its own', async () => {
    const out = await set('flowchart LR\n  A --> B\n  B -->|go| C\n', 'B', 'C', 'fast');
    expect(out).toBe('flowchart LR\n  A --> B\n  B e1@-->|go| C\n  e1@{ animate: true }\n');
    // no space before the link in the code: one is added
    expect(await set('flowchart LR\n  A-->B\n', 'A', 'B', 'slow')).toBe('flowchart LR\n  A e1@-->B\n  e1@{ animation: slow }\n');
  });

  it('an edge with an id and data: changed in place, other keys kept; off takes the keys out, and an emptied statement goes', async () => {
    const code = 'flowchart LR\n  A e7@--> B\n  e7@{ curve: linear, animate: true }\n';
    expect(await set(code, 'A', 'B', 'slow')).toBe('flowchart LR\n  A e7@--> B\n  e7@{ curve: linear, animation: slow }\n');
    expect(await set(code, 'A', 'B', 'off')).toBe('flowchart LR\n  A e7@--> B\n  e7@{ curve: linear }\n');
    expect(await set('flowchart LR\n  A e7@--> B\n  e7@{ animate: true }\n', 'A', 'B', 'off')).toBe('flowchart LR\n  A e7@--> B\n');
    expect(await set('flowchart LR\n  A e7@--> B\n', 'A', 'B', 'fast')).toBe('flowchart LR\n  A e7@--> B\n  e7@{ animate: true }\n');
    // fast to slow: a block of the animation keys only is written anew
    expect(await set('flowchart LR\n  A e7@--> B\n  e7@{ animate: true }\n', 'A', 'B', 'slow')).toBe('flowchart LR\n  A e7@--> B\n  e7@{ animation: slow }\n');
  });

  it('the new id is free among nodes, subgraphs and edges; a chain and an & group keep their other edges', async () => {
    const out = await set('flowchart LR\n  e1 --> A --> B\n  e2@{ shape: rect }\n', 'A', 'B', 'fast');
    expect(out).toContain('A e3@--> B');
    const g = await set('flowchart LR\n  A & B --> C\n', 'B', 'C', 'fast');
    expect(parseFlowchart(g).edges.find((x) => x.from === 'A')!.data).toBeUndefined();
  });

  it('reads Mermaid\'s rule: `animation` names the speed, `animate: true` alone is fast', () => {
    const m = parseFlowchart('flowchart LR\n  A a@--> B\n  B b@--> C\n  C c@--> D\n  a@{ animate: true }\n  b@{ animation: slow }\n  c@{ animation: fast }\n');
    expect(m.edges.map((e) => flowEdgeAnimation(m, e.id))).toEqual(['fast', 'slow', 'fast']);
  });
});
