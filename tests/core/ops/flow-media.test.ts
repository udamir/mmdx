// @vitest-environment jsdom
// Icons and images of flowchart nodes in the code (T05): icon and image nodes in Mermaid Chart's style — the label in
// its bracket, the node data in a separate `id@{ … }` statement — label tokens on other nodes, and their layout keys
// changed in place. Every output is parsed by stock Mermaid 11.17 and by mmdx without warnings.
import { beforeAll, describe, expect, it } from 'vitest';
import { addFlowMediaNode, flowMedia, iconToken, leadingIcon, setFlowIcon, setFlowImage, setFlowMedia, withIconToken, writeNodeData } from '../../../src/core/ops/flow-media.js';
import { parseFlowchart } from '../../../src/core/parse/flowchart.js';

const P = parseFlowchart;
let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  mermaidParse = (code) => mermaid.parse(code);
});
async function valid(code: string): Promise<void> {
  await expect(mermaidParse(code), code).resolves.toBeTruthy();
  expect(P(code).diagnostics.filter((d) => d.severity !== 'info').map((d) => d.message), code).toEqual([]);
}
const reg = (t: string): boolean => /^(fa|tabler|azure):/.test(t);

describe('label tokens', () => {
  it('Font Awesome in its Mermaid form, other packs as written; a leading token is replaced', () => {
    expect(iconToken('fa:car')).toBe('fa:fa-car');
    expect(iconToken('fab:github')).toBe('fab:fa-github');
    expect(iconToken('azure:computer-vision')).toBe('azure:computer-vision');
    expect(withIconToken('Car', 'fa:car')).toBe('fa:fa-car Car');
    expect(withIconToken('fa:fa-car Car', 'fa:bus')).toBe('fa:fa-bus Car');
    expect(withIconToken('tabler:user Vision', 'azure:computer-vision', reg)).toBe('azure:computer-vision Vision');
    expect(withIconToken('fa:fa-car Car', null)).toBe('Car');
    expect(withIconToken('', 'tabler:user', reg)).toBe('tabler:user');
    // `Note: x` and URLs are not tokens; an unregistered prefix is text
    expect(leadingIcon('Note: x', reg)).toBeNull();
    expect(leadingIcon('http://x.y', reg)).toBeNull();
    expect(withIconToken('foo:bar Baz', 'fa:car', reg)).toBe('fa:fa-car foo:bar Baz');
    expect(leadingIcon('fa:fa-car Car')).toEqual({ token: 'fa:fa-car', name: 'fa:car', rest: 'Car' });
  });
});

describe('icon nodes', () => {
  it('a new one: the label in its bracket, the node data in its own statement', async () => {
    const code = 'flowchart LR\n  A["Start"] --> B';
    const r = addFlowMediaNode(code, P(code), { label: 'User', data: { icon: 'tabler:user', form: 'rounded', pos: 'b', h: 60 } });
    expect(r.code).toBe('flowchart LR\n  A["Start"] --> B\n  n1["User"]\n  n1@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }\n');
    expect(r.select).toEqual({ kind: 'node', id: 'n1' });
    await valid(r.code);
    const m = P(r.code);
    expect(m.nodes.get('n1')!.data).toMatchObject({ icon: 'tabler:user', form: 'rounded', pos: 'b', h: 60 });
    expect(flowMedia(m, 'n1')).toEqual({ icon: 'tabler:user', image: null, node: 'icon', form: 'rounded', pos: 'b', h: 60 });
  });

  it('in a subgraph: the definition before its end', async () => {
    const code = 'flowchart TB\n  subgraph g ["G"]\n    A\n  end';
    const r = addFlowMediaNode(code, P(code), { label: 'Car', data: { icon: 'fa:car', form: 'square' }, group: 'g' });
    expect(r.code).toBe('flowchart TB\n  subgraph g ["G"]\n    A\n    n1["Car"]\n  end\n  n1@{ icon: "fa:car", form: "square" }\n');
    await valid(r.code);
    expect(P(r.code).nodes.get('n1')!.parent).toBe('g');
  });

  it('set, change and remove its icon in place', async () => {
    const code = 'flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }\n  n4 --> B';
    const set = setFlowIcon(code, P(code), 'n4', 'azure:computer-vision')!.code;
    expect(set).toBe(code.replace('tabler:user', 'azure:computer-vision'));
    const pos = setFlowMedia(code, P(code), 'n4', { pos: 't', form: 'circle', h: 80 })!.code;
    expect(pos).toBe(code.replace('form: "rounded", pos: "b", h: 60', 'form: "circle", pos: "t", h: 80'));
    // the node data statement goes with the icon (it had nothing else)
    const off = setFlowIcon(code, P(code), 'n4', null)!.code;
    expect(off).toBe('flowchart LR\n  n4["User"]\n  n4 --> B');
    for (const c of [set, pos, off]) await valid(c);
    // other keys stay
    const more = 'flowchart LR\n  n4["User"]\n  n4@{ icon: "fa:user", custom: "kept" }';
    expect(setFlowIcon(more, P(more), 'n4', null)!.code).toBe('flowchart LR\n  n4["User"]\n  n4@{ custom: "kept" }');
  });
});

describe('icons on other nodes', () => {
  it('a token at the start of the label, written where the label is', async () => {
    const code = 'flowchart LR\n  A["Car"] --> B@{ shape: doc, label: "Report" }';
    const a = setFlowIcon(code, P(code), 'A', 'fa:car')!.code;
    expect(a).toBe('flowchart LR\n  A["fa:fa-car Car"] --> B@{ shape: doc, label: "Report" }');
    const b = setFlowIcon(code, P(code), 'B', 'azure:computer-vision', reg)!.code;
    expect(b).toBe('flowchart LR\n  A["Car"] --> B@{ shape: doc, label: "azure:computer-vision Report" }');
    const back = setFlowIcon(a, P(a), 'A', null)!.code;
    expect(back).toBe(code);
    for (const c of [a, b, back]) await valid(c);
    expect(flowMedia(P(a), 'A')).toEqual({ icon: 'fa:car', image: null, node: null });
  });
});

describe('image nodes', () => {
  it('a new one, a replaced URL, the aspect lock and size, removal', async () => {
    const code = 'flowchart LR\n  A --> B';
    const r = addFlowMediaNode(code, P(code), { label: 'Caption', data: { img: 'https://example.com/a.png', h: 200, w: 200, pos: 'b' } });
    expect(r.code).toBe('flowchart LR\n  A --> B\n  n1["Caption"]\n  n1@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b" }\n');
    await valid(r.code);
    const m = P(r.code);
    expect(flowMedia(m, 'n1')).toMatchObject({ image: 'https://example.com/a.png', node: 'image', w: 200, h: 200, pos: 'b' });
    const url = setFlowImage(r.code, m, 'n1', 'https://example.com/b.png?x="1"')!.code;
    expect(url).toContain('img: "https://example.com/b.png?x=%221%22"');
    const lock = setFlowMedia(r.code, m, 'n1', { constraint: 'on', w: 320, form: 'circle' })!.code;
    expect(lock).toContain('n1@{ img: "https://example.com/a.png", h: 200, w: 320, pos: "b", constraint: "on" }');
    const off = setFlowImage(r.code, m, 'n1', null)!.code;
    expect(off).toBe('flowchart LR\n  A --> B\n  n1["Caption"]\n');
    for (const c of [url, lock, off]) await valid(c);
  });

  it('a node becomes an image node; an icon node gives up its icon', async () => {
    const code = 'flowchart LR\n  A["Photo"]\n  B["User"]\n  B@{ icon: "fa:user", form: "square", h: 40 }';
    const a = setFlowImage(code, P(code), 'A', 'https://example.com/a.png')!.code;
    expect(a).toBe(code + '\n  A@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b", constraint: "on" }\n');
    const b = setFlowImage(code, P(code), 'B', 'https://example.com/b.png')!.code;
    expect(b).toBe('flowchart LR\n  A["Photo"]\n  B["User"]\n  B@{ h: 40, img: "https://example.com/b.png", w: 200, pos: "b", constraint: "on" }');
    for (const c of [a, b]) await valid(c);
    expect(setFlowMedia(code, P(code), 'A', { h: 10 })).toBeNull();
  });

  it('writeNodeData removes a key from every block', async () => {
    const code = 'flowchart LR\n  A@{ shape: doc, h: 10 }\n  A@{ h: 20, label: "x" }';
    const r = writeNodeData(code, P(code), 'A', { h: null });
    expect(r.code).toBe('flowchart LR\n  A@{ shape: doc }\n  A@{ label: "x" }');
    await valid(r.code);
  });
});
