// Flowchart content in the scene (T06): goldens of icon nodes (4 frames × 2 caption positions), image nodes (fit ×
// aspect lock), a blocked image, an unknown icon, markdown labels, icon tokens in node, edge and subgraph labels, and
// the Mermaid Chart sample; natural image sizes, connectors on the asset, invisible links, curves, edge animation,
// classDef default and classes on subgraphs, tooltips, the title, and the SVG's accessible title and description.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import { parse } from '../../../src/core/parse/index.js';
import { render, renderSvgString } from '../../../src/core/render/index.js';
import type { FlowGeometry, ImageSizes } from '../../../src/core/render/types.js';
import { makeCtx, registry, renderProd } from './helpers.js';
import { CANVAS_CSS } from '../../../src/dom/canvas.js';

const flow = (body: string): string => `flowchart TB\n${body}`;
const geomOf = (src: string): FlowGeometry => renderProd(src).result.geom as FlowGeometry;
/** The scene of one node, serialized. */
const nodeSvg = (svg: string, id: string): string => {
  const at = svg.indexOf(`data-kind="node" data-id="${id}"`);
  const start = svg.lastIndexOf('<g ', at);
  let depth = 0, i = start;
  for (; i < svg.length; i++) {
    if (svg.startsWith('<g', i)) depth++;
    else if (svg.startsWith('</g>', i) && --depth === 0) break;
  }
  return svg.slice(start, i + 4);
};

/** A render with an image size lookup (the browser's, in components). */
function withSizes(src: string, sizes: ImageSizes): ReturnType<typeof render> {
  const { doc } = splitSource(src);
  const theme = registry.get('default-light');
  const ctx = makeCtx(theme, doc.meta);
  ctx.imageSizes = sizes;
  return render(parse(doc.code), doc.meta, theme, ctx);
}

describe('icon nodes (goldens)', () => {
  for (const form of ['', 'square', 'circle', 'rounded'])
    for (const pos of ['t', 'b'])
      it(`form ${form || 'none'} × pos ${pos}`, () => {
        const src = flow(`  A["Start"] --> n1\n  n1["User account"]\n  n1@{ icon: "tabler:user"${form ? `, form: "${form}"` : ''}, pos: "${pos}", h: 48 }`);
        const r = renderProd(src);
        expect(nodeSvg(r.svg, 'n1')).toMatchSnapshot();
        expect(r.result.diagnostics).toBeUndefined();
      });

  it('the selection box holds the asset and the caption; connectors end on the asset, past the caption on its side', () => {
    const g = geomOf(flow('  A --> n1\n  n1 --> B\n  n1["A long caption under it"]\n  n1@{ icon: "tabler:user", form: "square", h: 40, w: 40 }'));
    const n = g.nodes.get('n1')!;
    expect(n.asset).toEqual({ x: n.x, y: n.y - n.h / 2 + 28, w: 40, h: 40 });
    expect(n.w).toBeGreaterThan(56);
    expect(n.h).toBeCloseTo(56 + 8 + 18 * 1.3, 0);
    // into the top of the frame, out of the bottom of the caption
    expect(g.edges.get('A->n1')!.b.y).toBeCloseTo(n.y - n.h / 2, 5);
    expect(g.edges.get('n1->B')!.a.y).toBeCloseTo(n.y + n.h / 2, 5);
  });

  it('Mermaid sizes: 48 by default, max(h, w); the code\'s stroke colours a monochrome icon, the frame takes the fill', () => {
    expect(geomOf(flow('  n1@{ icon: "tabler:user" }')).nodes.get('n1')!.asset).toMatchObject({ w: 48, h: 48 });
    expect(geomOf(flow('  n1@{ icon: "tabler:user", h: 30, w: 70 }')).nodes.get('n1')!.asset).toMatchObject({ w: 70, h: 70 });
    const svg = renderProd(flow('  n1@{ icon: "tabler:user", form: "rounded" }\n  style n1 stroke:#2962FF,fill:#cccccc')).svg;
    expect(nodeSvg(svg, 'n1')).toContain('fill="#cccccc"');
    expect(decodeURIComponent(nodeSvg(svg, 'n1'))).toContain('#2962FF');
  });

  it('an unknown icon draws the "?" placeholder with icon.unknown (golden)', () => {
    const r = renderProd(flow('  n1["Vision"]\n  n1@{ icon: "azure:computer-vision", form: "rounded" }'));
    expect(nodeSvg(r.svg, 'n1')).toMatchSnapshot();
    expect(nodeSvg(r.svg, 'n1')).toContain('mmdx-icon-missing');
    expect(r.result.diagnostics?.map((d) => [d.code, d.message])).toEqual([['icon.unknown', 'Icons from "azure" are not available']]);
  });
});

describe('image nodes', () => {
  const IMG = 'https://example.com/photo.png';
  for (const fit of ['contain', 'cover', 'stretch'])
    for (const lock of ['off', 'on'])
      it(`fit ${fit} × constraint ${lock} (golden)`, () => {
        const meta = fit === 'contain' ? '' : `\n%%@ node n1 {"imgFit":"${fit}"}`;
        const r = withSizes(flow(`  n1["Photo"]\n  n1@{ img: "${IMG}", w: 120, h: 60, constraint: "${lock}" }${meta}`), { get: () => ({ w: 400, h: 300 }) });
        const svg = renderSvgString(r, makeCtx(registry.get('default-light'), { canvas: {}, styles: {} }));
        expect(nodeSvg(svg, 'n1')).toMatchSnapshot();
        // the aspect lock: the width follows h × the picture's aspect
        expect((r.geom as FlowGeometry).nodes.get('n1')!.asset).toMatchObject(lock === 'on' ? { w: 80, h: 60 } : { w: 120, h: 60 });
      });

  it('a blocked image draws the placeholder with image.blocked (golden)', () => {
    const r = renderProd(flow('  n1["Old"]\n  n1@{ img: "http://example.com/a.png", w: 96, h: 72 }'));
    expect(nodeSvg(r.svg, 'n1')).toMatchSnapshot();
    expect(r.result.diagnostics?.map((d) => d.code)).toEqual(['image.blocked']);
  });

  it('without w / h: the natural size when known, 96 × 96 while it loads, and 96 × 96 with image.size-unknown where it cannot be known', () => {
    const src = flow(`  n1@{ img: "${IMG}" }`);
    const asset = (r: ReturnType<typeof render>): unknown => (r.geom as FlowGeometry).nodes.get('n1')!.asset;
    expect(asset(withSizes(src, { get: () => ({ w: 320, h: 160 }) }))).toMatchObject({ w: 320, h: 160 });
    expect(asset(withSizes(flow(`  n1@{ img: "${IMG}", h: 80 }`), { get: () => ({ w: 320, h: 160 }) }))).toMatchObject({ w: 160, h: 80 });
    const loading = withSizes(src, { get: () => undefined });
    expect([asset(loading), loading.diagnostics]).toEqual([expect.objectContaining({ w: 96, h: 96 }), undefined]);
    const ssr = renderProd(src).result;
    expect((ssr.geom as FlowGeometry).nodes.get('n1')!.asset).toMatchObject({ w: 96, h: 96 });
    expect(ssr.diagnostics?.map((d) => [d.code, d.severity])).toEqual([['image.size-unknown', 'info']]);
  });
});

describe('rich labels', () => {
  it('markdown: bold, italic, line breaks and auto-wrap at 200 px (golden)', () => {
    const r = renderProd(flow('  A["`**Bold** and *italic*<br/>second line, and then a sentence long enough to wrap on its own`"] -->|"`**yes**`"| B'));
    expect(nodeSvg(r.svg, 'A')).toMatchSnapshot();
    expect(nodeSvg(r.svg, 'A')).toContain('<tspan font-weight="700">Bold</tspan>');
    expect(nodeSvg(r.svg, 'A')).toContain('<tspan font-style="italic">italic</tspan>');
    expect((r.result.geom as FlowGeometry).nodes.get('A')!.w).toBeLessThanOrEqual(200 + 2 * 20 + 1);
    // markdownAutoWrap: false breaks at line breaks only
    const nowrap = renderProd(`---\nconfig:\n  markdownAutoWrap: false\n---\n${flow('  A["`a sentence long enough to wrap on its own when auto-wrap is on`"]')}`);
    expect((nowrap.result.geom as FlowGeometry).nodes.get('A')!.h).toBeLessThan(60);
    // a plain label stays plain: its stars are text
    expect(renderProd(flow('  A["**not bold**"]')).svg).toContain('**not bold**');
  });

  it('fa: and registered pack tokens are icons in node, edge and subgraph labels (golden); other prefixes stay text', () => {
    const r = renderProd(flow('  subgraph S ["tabler:cloud Cloud"]\n    A["fa:fa-car Car"] -->|"tabler:bolt fast"| B["foo:bar text"]\n  end'));
    expect(r.svg.match(/<image [^>]*aria-hidden="true"/g)).toHaveLength(3);
    expect(nodeSvg(r.svg, 'A')).toMatchSnapshot();
    expect(r.svg).toContain('foo:bar text');
    expect(r.result.diagnostics?.map((d) => d.code)).toEqual(['icon.fa-fallback']);
  });
});

describe('links', () => {
  it('an invisible link places its nodes and is not drawn, nor in the geometry', () => {
    const r = renderProd(flow('  A ~~~ B'));
    const g = r.result.geom as FlowGeometry;
    expect(g.edges.size).toBe(0);
    expect(g.nodes.get('B')!.y).toBeGreaterThan(g.nodes.get('A')!.y);
    expect(r.svg).not.toContain('data-kind="edge"');
  });

  it('curves: the edge\'s, linkStyle\'s and the frontmatter\'s, unless metadata routes the edge', () => {
    const d = (src: string, id = 'A->B'): string => (renderProd(src).result.geom as FlowGeometry).edges.get(id)!.d;
    const straight = (s: string): boolean => !/C/.test(s);
    expect(straight(d(flow('  A --> B')))).toBe(false);
    expect(straight(d(flow('  A e1@--> B\n  e1@{ curve: linear }'), 'e1'))).toBe(true);
    expect(straight(d(flow('  A --> B\n  linkStyle 0 interpolate linear')))).toBe(true);
    expect(straight(d(flow('  A --> B\n  linkStyle default interpolate linear')))).toBe(true);
    expect(straight(d(`---\nconfig:\n  flowchart:\n    curve: linear\n---\n${flow('  A --> B')}`))).toBe(true);
    expect(straight(d(`${flow('  A --> B\n  linkStyle 0 interpolate linear')}\n%%@ edge A->B {"routing":"curved"}`))).toBe(false);
  });

  it('linkStyle color is the label colour', () => {
    expect(renderProd(flow('  A -->|x| B\n  linkStyle 0 color:#ff0000')).svg).toMatch(/data-part="label"[^>]*><text[^>]*fill="#ff0000"/);
  });

  it('animate: dashes with the animation class (slow, fast), still in exports; the CSS moves them only without reduced motion', () => {
    const svg = renderProd(flow('  A e1@--> B --> C\n  e1@{ animate: true }\n  B e2@--> D\n  e2@{ animation: slow }')).svg;
    expect(svg).toMatch(/class="line mmdx-flow" [^>]*stroke-dasharray="9 5"/);
    expect(svg).toMatch(/class="line mmdx-flow mmdx-flow-slow"/);
    expect(svg).not.toContain('animation');
    const css = CANVAS_CSS.replace(/\s+/g, ' ');
    const media = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(media).toBeGreaterThan(0);
    expect(css.indexOf('.mmdx-flow { animation')).toBeGreaterThan(media);
    expect(css).toContain('[data-edge-anim="off"] .mmdx-flow { animation: none; }');
  });

  it('metadata written under from->to still applies to an edge given its own id', () => {
    const svg = renderProd(`${flow('  A e1@--> B')}\n%%@ edge A->B {"color":"#ff0000"}`).svg;
    expect(svg).toMatch(/data-id="e1"[^>]*>(?:<path[^>]*>)*?<path class="line"[^>]*stroke="#ff0000"/);
  });
});

describe('classes and styles', () => {
  it('classDef default styles every node under its own classes; classes on subgraphs style the frame; dasharray none', () => {
    const svg = renderProd(flow('  subgraph S\n    A:::own --> B\n  end\n  classDef default fill:#abcdef\n  classDef own fill:#123456\n  classDef hot fill:#fedcba,stroke-dasharray:none\n  class S hot')).svg;
    expect(nodeSvg(svg, 'A')).toContain('fill="#123456"');
    expect(nodeSvg(svg, 'B')).toContain('fill="#abcdef"');
    const group = svg.slice(svg.indexOf('data-kind="group"'), svg.indexOf('</g>', svg.indexOf('data-kind="group"')));
    expect(group).toContain('fill="#fedcba"');
  });
});

describe('title, tooltips and accessibility (T06.8)', () => {
  it('a tooltip is the node\'s <title>; the title is drawn above the diagram', () => {
    const r = renderProd(`---\ntitle: Order flow\n---\n${flow('  A --> B\n  click A "https://example.com" "Opens the shop"')}`);
    expect(nodeSvg(r.svg, 'A')).toContain('<title>Opens the shop</title>');
    expect(r.svg).toMatch(/<g class="title" data-part="title"><text[^>]*font-size="22"[^>]*><tspan[^>]*>Order flow<\/tspan>/);
    const plain = renderProd(flow('  A --> B'));
    expect(r.result.bounds.y).toBeLessThan(plain.result.bounds.y);
  });

  it('accTitle and accDescr become the SVG\'s <title> and <desc>, and name it', () => {
    const r = renderProd(flow('  accTitle: Orders <&>\n  accDescr {\n    From cart\n    to delivery\n  }\n  A --> B'));
    expect(r.result.a11y).toEqual({ title: 'Orders <&>', desc: 'From cart\nto delivery' });
    expect(r.svg).toMatch(/^<svg [^>]* role="img" aria-label="Orders &lt;&amp;&gt;"><title>Orders &lt;&amp;&gt;<\/title><desc>From cart\nto delivery<\/desc><defs>/);
    expect(renderProd(flow('  A')).svg).not.toContain('<title>');
  });
});

describe('the Mermaid Chart sample (§3.7)', () => {
  const src = readFileSync(join(__dirname, '../../fixtures/mermaid-chart/whiteboard.mmd'), 'utf8');
  it('renders (golden): image nodes, the text block, the fa: token, the azure icon placeholder', () => {
    const r = renderProd(src);
    expect(r.svg).toMatchSnapshot();
    expect(r.result.diagnostics?.map((d) => d.code)).toEqual(['icon.fa-fallback', 'icon.unknown']);
    expect(r.model.diagnostics).toEqual([]);
    const g = r.result.geom as FlowGeometry;
    expect(g.nodes.get('n3')!.asset).toMatchObject({ w: 200, h: 200 });
    expect(g.nodes.get('n5')!.asset).toMatchObject({ w: 161, h: 161 });
    expect(nodeSvg(r.svg, 'n5')).toContain('fill="#cccccc"');
    expect(nodeSvg(r.svg, 'n1')).toContain('fill="#378E7A"');
  });
});
