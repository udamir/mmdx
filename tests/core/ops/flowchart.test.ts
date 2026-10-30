import { describe, expect, it } from 'vitest';
import {
  addFlowEdge, addFlowNode, cloneFlow, deleteFlow, edgeText, groupFlow, moveStatement, nodeDef, reconnectFlow, relabelFlowEdge,
  relabelFlowNode, relabelGroup, renameGroupId, ungroupFlow, unitOf,
} from '../../../src/core/ops/index.js';
import { expectKept, expectParses, flow } from './helpers.js';

const CODE = `flowchart TB
  A["Start"] --> B["Mid"]
  subgraph G ["Group"]
    C["In"] --> D["In2"]
  end
  B --> C
  B --> E
  class A,B hot
  style A fill:#f00
  click B href "https://example.com"
`;
const M = flow(CODE);

describe('flowchart ops', () => {
  it('nodeDef / edgeText write Mermaid with escaped labels', () => {
    expect(nodeDef({ id: 'x', label: 'a "b"\nc', shape: 'diamond', inlineClass: 'k' })).toBe('x{"a #quot;b#quot;<br>c"}:::k');
    expect(nodeDef({ id: 'x', label: 'q', shape: 'queue' })).toBe('x["q"]');
    expect(edgeText({ start: 'arrow', end: 'arrow', line: 'thick', label: 'go' }, 'a', 'b')).toBe('a <==>|"go"| b');
    expect(edgeText({ start: 'none', end: 'none', line: 'dotted', label: '' }, 'a', 'b')).toBe('a -.- b');
    expect(edgeText({ start: 'none', end: 'cross', line: 'solid', label: '' }, 'a', 'b')).toBe('a --x b');
  });

  it('addFlowNode adds a free id at the end, or inside a subgraph', () => {
    const r = addFlowNode(CODE, M, { label: 'New "one"', shape: 'rounded' });
    expect(r.select).toEqual({ kind: 'node', id: 'n1' });
    const m = expectParses(CODE, r.code);
    expectKept(M, m);
    expect(m.type === 'flowchart' && m.nodes.get('n1')).toMatchObject({ label: 'New "one"', shape: 'rounded', parent: null });
    const g = flow(addFlowNode(CODE, M, { group: 'G', cls: 'hot' }).code);
    expect(g.nodes.get('n1')).toMatchObject({ parent: 'G', classes: ['hot'] });
  });

  it('deleteFlow removes a node with its edges and class / style / click mentions', () => {
    const r = deleteFlow(CODE, M, [{ kind: 'node', id: 'A' }]);
    const m = flow(expectParses(CODE, r.code) && r.code);
    expectKept(M, m, ['node:A', 'edge:A->B']);
    expect(m.nodes.has('A')).toBe(false);
    expect(r.code).toContain('class B hot');
    expect(r.code).not.toContain('style A');
    expect(m.nodes.get('B')!.label).toBe('Mid'); // its definition moved with the line rewrite
  });

  it('deleteFlow removes edges, and a group frame only', () => {
    const e = flow(deleteFlow(CODE, M, [{ kind: 'edge', id: 'B->C' }]).code);
    expect(e.edges.map((x) => x.id)).not.toContain('B->C');
    expectKept(M, e, ['edge:B->C']);
    const g = flow(deleteFlow(CODE, M, [{ kind: 'group', id: 'G' }]).code);
    expect(g.groups.size).toBe(0);
    expect(g.nodes.get('C')!.parent).toBeNull();
    expectKept(M, g, ['group:G']);
    // deleting the only node of a `class` line drops the line
    const c = deleteFlow(CODE, M, [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]).code;
    expect(c).not.toMatch(/^\s*class /m);
    expectParses(CODE, c);
  });

  it('relabels nodes (defined or not), edges and groups', () => {
    const lbl = 'Two\nlines & "quotes" <br>';
    const n = flow(relabelFlowNode(CODE, M, 'B', lbl).code);
    expect(n.nodes.get('B')!.label).toBe(lbl);
    expectKept(M, n);
    const und = flow(relabelFlowNode(CODE, M, 'E', 'Eee').code);
    expect(und.nodes.get('E')!.label).toBe('Eee');
    expect(flow(relabelFlowNode(CODE, M, 'C', 'Inner').code).nodes.get('C')).toMatchObject({ label: 'Inner', parent: 'G' });
    const e = flow(relabelFlowEdge(CODE, M, 'A->B', 'yes').code);
    expect(e.edges.find((x) => x.id === 'A->B')!.label).toBe('yes');
    expect(flow(relabelGroup(CODE, M, 'G', 'Grp "x"').code).groups.get('G')!.label).toBe('Grp "x"');
    expect(relabelFlowNode(CODE, M, 'nope', 'x').code).toBe(CODE);
  });

  it('groupFlow wraps nodes in their common parent and selects the new group', () => {
    const r = groupFlow(CODE, M, [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }], 'Pair');
    expect(r.select).toEqual({ kind: 'group', id: 'group1' });
    const m = flow(r.code);
    expectParses(CODE, r.code);
    expectKept(M, m);
    expect(m.groups.get('group1')).toMatchObject({ label: 'Pair', parent: null });
    expect(m.nodes.get('A')!.parent).toBe('group1');
    const inner = flow(groupFlow(CODE, M, [{ kind: 'node', id: 'C' }]).code);
    expect(inner.groups.get('group1')!.parent).toBe('G');
    expect(inner.nodes.get('C')!.parent).toBe('group1');
    const outer = flow(groupFlow(CODE, M, [{ kind: 'group', id: 'G' }]).code);
    expect(outer.groups.get('G')!.parent).toBe('group1');
    expect(groupFlow(CODE, M, []).code).toBe(CODE);
  });

  it('renameGroupId and ungroupFlow', () => {
    const r = renameGroupId(CODE, M, 'G', 'G2');
    expect(r.select).toEqual({ kind: 'group', id: 'G2' });
    expect(flow(r.code).groups.get('G2')!.label).toBe('Group');
    const u = flow(ungroupFlow(CODE, M, 'G').code);
    expect(u.groups.size).toBe(0);
    expectKept(M, u, ['group:G']);
    // a bare listing line is dropped when the node also lives elsewhere
    const code = 'flowchart LR\n  X --> Y\n  subgraph S\n    X\n  end\n';
    expect(ungroupFlow(code, flow(code), 'S').code).toBe('flowchart LR\n  X --> Y\n');
  });

  it('cloneFlow copies a subgraph with its contents and internal edges', () => {
    const r = cloneFlow(CODE, M, [{ kind: 'group', id: 'G' }]);
    expect(r.map).toEqual({ G: 'G_2', C: 'C_2', D: 'D_2' });
    const m = flow(r.code);
    expectParses(CODE, r.code);
    expectKept(M, m);
    expect(m.groups.get('G_2')!.children).toEqual(['C_2', 'D_2']);
    expect(m.edges.some((e) => e.id === 'C_2->D_2')).toBe(true);
    expect(m.nodes.get('C_2')!.label).toBe('In');
    // a copy of a copy: api_2 → api_3
    const again = cloneFlow(r.code, m, [{ kind: 'node', id: 'C_2' }]);
    expect(again.map).toEqual({ C_2: 'C_3' });
    expect(flow(again.code).nodes.get('C_3')!.parent).toBe('G_2'); // next to the original, in its subgraph
    expect(cloneFlow(CODE, M, [{ kind: 'edge', id: 'A->B' }])).toEqual({ code: CODE });
  });

  it('reconnectFlow rewrites one end and reports the edge line', () => {
    const r = reconnectFlow(CODE, M, 'B->C', 'b', 'D');
    expect(r).toMatchObject({ from: 'B', to: 'D' });
    expect(r.code.split('\n')[r.line!]!.trim()).toBe('B --> D');
    const m = flow(r.code);
    expectKept(M, m, ['edge:B->C']);
    // inside a subgraph the edge moves to the top level, so Mermaid does not pull the new end into the group
    const g = reconnectFlow(CODE, M, 'C->D', 'b', 'A');
    expect(g.code.split('\n')[g.line!]).toBe('  C --> A');
    expect(flow(g.code).nodes.get('A')!.parent).toBeNull();
    const chain = 'flowchart LR\n  A --> B --> C\n';
    const c = reconnectFlow(chain, flow(chain), 'B->C', 'a', 'A');
    expect(c.code).toBe('flowchart LR\n  A --> B\n  A --> C\n');
    expect(c.line).toBe(2);
  });

  it('addFlowEdge appends', () => {
    expect(addFlowEdge('flowchart LR\n  A\n\n', 'A', 'B')).toEqual({ code: 'flowchart LR\n  A\n  A --> B\n', line: 2 });
  });

  it('moveStatement moves past neighbours and stays inside the subgraph', () => {
    expect(unitOf(M, { kind: 'group', id: 'G' })).toEqual({ start: 2, end: 4 });
    expect(unitOf(M, { kind: 'node', id: 'E' })).toEqual({ start: 6, end: 6 });
    const d = moveStatement(CODE, M, { kind: 'edge', id: 'B->C' }, -1);
    expect(d.line).toBe(2);
    expect(d.code.split('\n').slice(2, 7).map((l) => l.trim())).toEqual(['B --> C', 'subgraph G ["Group"]', 'C["In"] --> D["In2"]', 'end', 'B --> E']);
    expectParses(CODE, d.code);
    expect(moveStatement(CODE, M, { kind: 'node', id: 'A' }, -1)).toEqual({ code: CODE, reason: 'Already first' });
    expect(moveStatement(CODE, M, { kind: 'node', id: 'C' }, 1).reason).toBe('Already last in its group');
    expect(moveStatement(CODE, M, { kind: 'node', id: 'C' }, -1).reason).toBe('Already first in its group');
    expect(moveStatement(CODE, M, { kind: 'node', id: 'zz' }, 1).reason).toBe('This item has no line of its own to move');
  });
});
