// @vitest-environment jsdom
// Flowchart content ops (T06): markdown labels written back as markdown strings, a plain label written as one, "Convert to icon
// node", an icon or image node's size in its node data (what a resize writes), invisible links in copies, edge-id
// metadata following the code, the `title` fix, and the Mermaid Chart sample: every output parsed by stock Mermaid
// 12.2 and 11.17, the sample unchanged by a no-op edit.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { OPS } from '../../../src/core/kinds/flowchart/ops-kind.js';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import { edgeText, nodeDef } from '../../../src/core/ops/connect.js';
import { setFlowIcon, setFlowImage, setFlowMedia, toFlowIconNode } from '../../../src/core/kinds/flowchart/ops-media.js';
import { relabelFlowEdge, relabelFlowNode, relabelGroup } from '../../../src/core/kinds/flowchart/ops.js';
import { parseFlowchart } from '../../../src/core/kinds/flowchart/parse.js';
import { stockParse } from '../../helpers/mermaid.js';

const P = parseFlowchart;
let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
});
async function valid(code: string): Promise<void> {
  await expect(mermaidParse(code), code).resolves.toBeTruthy();
  expect(P(code).diagnostics.filter((d) => d.severity !== 'info').map((d) => d.message), code).toEqual([]);
}
const reg = (t: string): boolean => /^(fa|tabler|azure):/.test(t);

describe('an icon as an image node\'s source', () => {
  it('an image node (also the empty placeholder) given an icon becomes an icon node; an icon node given a picture an image node', async () => {
    const code = 'flowchart LR\n  n5["Photo"]\n  n5@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "t", constraint: "on" }\n';
    const r = setFlowIcon(code, P(code), 'n5', 'tabler:car')!.code;
    expect(r).toBe('flowchart LR\n  n5["Photo"]\n  n5@{ h: 60, pos: "t", icon: "tabler:car", form: "square" }\n');
    await valid(r);
    const empty = 'flowchart LR\n  n6["Image"]\n  n6@{ img: "", h: 200, w: 200, pos: "b" }\n';
    expect(setFlowIcon(empty, P(empty), 'n6', 'tabler:car')!.code).toBe('flowchart LR\n  n6["Image"]\n  n6@{ h: 60, pos: "b", icon: "tabler:car", form: "square" }\n');
    const back = setFlowImage(r, P(r), 'n5', 'https://example.com/b.png')!.code;
    expect(P(back).nodes.get('n5')).toMatchObject({ shape: 'image', data: { img: 'https://example.com/b.png' } });
    expect(back).not.toContain('icon:');
    await valid(back);
  });
});

describe('markdown labels (§3.4)', () => {
  it('a relabel keeps a markdown string one: node (bracket and node data), edge, subgraph', async () => {
    const code = 'flowchart LR\n  subgraph S ["`**Team**`"]\n    A["`**old**`"] -->|"`*x*`"| B\n  end\n  C@{ label: "`*c*`" }';
    const m = P(code);
    const a = relabelFlowNode(code, m, 'A', '**new**\n*two*').code;
    expect(a).toContain('A["`**new**<br/>*two*`"]');
    expect(P(a).nodes.get('A')).toMatchObject({ label: '**new**\n*two*', md: true });
    const e = relabelFlowEdge(code, m, 'A->B', '**y**').code;
    expect(e).toContain('-->|"`**y**`"| B');
    const g = relabelGroup(code, m, 'S', '*T*').code;
    expect(g).toContain('subgraph S ["`*T*`"]');
    const c = relabelFlowNode(code, m, 'C', 'd').code;
    expect(c).toContain('C@{ label: "`d`" }');
    for (const x of [a, e, g, c]) await valid(x);
  });

  it('a plain label written as a markdown string (once formatted); the copy of a markdown node stays one', async () => {
    const code = 'flowchart LR\n  A["plain"] -->|"no"| B\n  subgraph S ["Plain"]\n    B\n  end';
    const m = P(code);
    const a = relabelFlowNode(code, m, 'A', '**rich**', true).code;
    expect(a).toBe('flowchart LR\n  A["`**rich**`"] -->|"no"| B\n  subgraph S ["Plain"]\n    B\n  end');
    const e = relabelFlowEdge(code, m, 'A->B', '*yes*', true).code;
    expect(e).toContain('A["plain"] -->|"`*yes*`"| B');
    const g = relabelGroup(code, m, 'S', '**P**', true).code;
    expect(g).toContain('subgraph S ["`**P**`"]');
    expect(nodeDef({ id: 'X', label: '**b**', md: true })).toBe('X["`**b**`"]');
    expect(edgeText({ start: 'none', end: 'arrow', line: 'solid', label: '*i*', md: true }, 'A', 'B')).toBe('A -->|"`*i*`"| B');
    for (const x of [a, e, g]) await valid(x);
  });
});

describe('icon and image nodes (§3.6)', () => {
  it('"Convert to icon node": the label\'s leading icon becomes the node\'s, the rest its caption', async () => {
    const code = 'flowchart LR\n  C -- Three --> F["fa:fa-car Car"]';
    const r = toFlowIconNode(code, P(code), 'F')!.code;
    expect(r).toBe('flowchart LR\n  C -- Three --> F["Car"]\n  F@{ icon: "fa:car", form: "rounded", pos: "b", h: 60 }\n');
    expect(setFlowMedia(code, P(code), 'F', { node: 'icon' })!.code).toBe(r);
    const az = 'flowchart LR\n  V["azure:computer-vision Vision"]';
    expect(toFlowIconNode(az, P(az), 'V', reg)!.code).toBe('flowchart LR\n  V["Vision"]\n  V@{ icon: "azure:computer-vision", form: "rounded", pos: "b", h: 60 }\n');
    expect(toFlowIconNode(code, P(code), 'C')).toBeNull();
    await valid(r);
    expect(P(r).nodes.get('F')).toMatchObject({ shape: 'icon', label: 'Car' });
  });

  it('a resize writes h (and w) into the node data, in place; the size is clamped', async () => {
    const code = 'flowchart LR\n  n5["asdfasf"] --> s2\n  subgraph s2\n    n4\n  end\n  n5@{ icon: "azure:computer-vision", form: "rounded", pos: "b", h: 161}';
    const r = setFlowMedia(code, P(code), 'n5', { h: 96 })!.code;
    expect(r).toBe(code.replace('h: 161}', 'h: 96}'));
    const img = 'flowchart LR\n  n3["Pic"]\n  n3@{ img: "https://a.b/c.svg", h: 200, w: 200, pos: "b"}';
    expect(setFlowMedia(img, P(img), 'n3', { w: 120, h: 90 })!.code).toBe(img.replace('h: 200, w: 200', 'h: 90, w: 120'));
    expect(setFlowMedia(img, P(img), 'n3', { w: 1e6 })!.code).toContain('w: 2000');
    for (const x of [r]) await valid(x);
  });
});

describe('edges', () => {
  it('a copy writes an invisible link as one', async () => {
    const t = edgeText({ start: 'none', end: 'none', line: 'invisible', label: '' }, 'A', 'B');
    expect(t).toBe('A ~~~ B');
    await valid(`flowchart LR\n  ${t}`);
  });

  it('edge-id metadata: `from->to` moves to the id the code gives, and back when the id is removed', () => {
    const before = 'flowchart LR\n  A --> B', after = 'flowchart LR\n  A e1@--> B';
    const meta: DiagramMeta = { canvas: {}, styles: {}, edges: { 'A->B': { color: '#f00' } } };
    const moved = OPS.remapMeta!(meta, P(before), before, P(after), after);
    expect(moved.edges).toEqual({ e1: { color: '#f00' } });
    expect(OPS.remapMeta!(moved, P(after), after, P(before), before).edges).toEqual({ 'A->B': { color: '#f00' } });
    // an id that has metadata of its own keeps it
    const both: DiagramMeta = { canvas: {}, styles: {}, edges: { 'A->B': { color: '#f00' }, e1: { color: '#00f' } } };
    expect(OPS.remapMeta!(both, P(before), before, P(after), after)).toBe(both);
  });
});

describe('the Mermaid Chart sample (§3.7)', () => {
  const src = readFileSync(join(__dirname, '../../fixtures/mermaid-chart/whiteboard.mmd'), 'utf8');

  it('parses in stock Mermaid and in mmdx without diagnostics; the frontmatter is kept', async () => {
    await valid(src);
    expect(P(src).diagnostics).toEqual([]);
  });

  it('a no-op edit leaves the file as it is; a relabel changes the label only', async () => {
    const m = P(src);
    expect(relabelFlowNode(src, m, 'n3', 'This is sample label').code).toBe(src);
    expect(relabelFlowNode(src, m, 'n5', 'asdfasf').code).toBe(src);
    expect(setFlowMedia(src, m, 'n5', { h: 161 })!.code).toBe(src);
    const r = relabelFlowNode(src, m, 'n5', 'Vision').code;
    expect(r).toBe(src.replace('n5["asdfasf"]', 'n5["Vision"]'));
    await valid(r);
  });

  it('a node defined only by its node data gets its label after the header, not in the frontmatter', async () => {
    const code = '---\nconfig:\n  layout: fixed\n---\nflowchart TB\n  n9@{ icon: "fa:user" }';
    const r = relabelFlowNode(code, P(code), 'n9', 'User').code;
    expect(r).toBe('---\nconfig:\n  layout: fixed\n---\nflowchart TB\n  n9["User"]\n  n9@{ icon: "fa:user" }');
    await valid(r);
  });
});
