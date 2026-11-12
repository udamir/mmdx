// Characterization of the flowchart parser's phases (R2, BUG-003): branches the other parser tests do not reach, written
// before readFlowchart was split into lines → statements → resolve over an explicit FlowParse record.
import { describe, expect, it } from 'vitest';
import { parseFlowchart } from '../../../src/core/kinds/flowchart/parse.js';

describe('flowchart phases', () => {
  it('edge data: an unclosed block is reported, text after a closed one is ignored, an unknown id is a node', () => {
    const m = parseFlowchart('flowchart LR\n  A e1@--> B\n  e1@{ animate: true } tail\n  x@{ shape: rect }\n  e1@{ curve: linear');
    expect(m.edges[0]).toMatchObject({ id: 'e1', uid: 'e1', key: 'A->B', data: { animate: true } });
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['flow.ignored-text', 2], ['flow.node-data', 4]]);
    expect(m.nodes.get('x')?.defLine).toBe(3);
  });

  it('an edge id goes to one edge of a group link, once per diagram', () => {
    const m = parseFlowchart('flowchart LR\n  A & B e1@--> C & D\n  E e1@--> F');
    expect(m.edges.map((e) => e.id)).toEqual(['A->C', 'A->D', 'e1', 'B->D', 'E->F']);
  });

  it('unterminated subgraphs: the outermost claims the nodes left', () => {
    const m = parseFlowchart('flowchart TB\n  subgraph O\n    A\n    subgraph I\n      B\n');
    expect(m.nodes.get('A')?.parent).toBe('O');
    expect(m.nodes.get('B')?.parent).toBe('O');
    expect(m.groups.get('I')?.endLine).toBeUndefined();
  });

  it('frontmatter ELK hints and settings, then %%{init}%% only where the frontmatter set nothing', () => {
    const m = parseFlowchart('---\nconfig:\n  layout: elk\n  flowchart:\n    curve: linear\n---\n%%{init: {"flowchart": {"curve": "step", "htmlLabels": false}}}%%\nflowchart LR\n  A');
    expect(m.config).toEqual({ curve: 'linear', htmlLabels: false });
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['flow.elk', 0]]);
  });

  it('a title statement wins over the frontmatter title', () => {
    const m = parseFlowchart('---\ntitle: Front\n---\nflowchart LR\n  title Inline\n  A');
    expect(m.title).toBe('Inline');
    expect(parseFlowchart('---\ntitle: Front\n---\nflowchart LR\n  A').title).toBe('Front');
  });
});
