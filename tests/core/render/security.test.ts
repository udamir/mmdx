// @vitest-environment jsdom
// XSS and id-collision regression tests (§12, §3): the serialized SVG must never carry markup, event handlers or
// script URLs from the input, and two diagrams on one page must not share any `id`.
import { describe, expect, it } from 'vitest';
import { emptyMeta, type DiagramMeta } from '../../../src/core/meta/types.js';
import { parse } from '../../../src/core/parse/index.js';
import { render, renderSvgString } from '../../../src/core/render/index.js';
import { ALLOWED_ATTRS, DATA_ATTRS } from '../../../src/core/scene/serialize.js';
import { makeCtx, registry, renderProd } from './helpers.js';

const XSS = '<img src=x onerror=alert(1)>';
const ELEMENTS = new Set(['svg', 'defs', 'g', 'path', 'rect', 'ellipse', 'circle', 'line', 'polygon', 'polyline', 'text', 'tspan', 'a', 'marker', 'pattern', 'clipPath']);

/** Parses the SVG as XML and checks every element and attribute against the allowlists. */
function assertSafe(svg: string): void {
  expect(svg).not.toMatch(/<img/i);
  expect(svg).not.toMatch(/<[^>]*\son\w+\s*=/i); // no event handler attribute in any tag
  expect(svg.toLowerCase()).not.toContain('javascript:');
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror').length, svg.slice(0, 300)).toBe(0);
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    expect(ELEMENTS.has(el.tagName), el.tagName).toBe(true);
    for (const a of Array.from(el.attributes)) {
      const ok = ALLOWED_ATTRS.has(a.name) || DATA_ATTRS.has(a.name) || (el.tagName === 'a' && (a.name === 'href' || a.name === 'rel')) || (el.tagName === 'svg' && (a.name === 'xmlns' || a.name === 'width' || a.name === 'height' || a.name === 'viewBox'));
      expect(ok, `${el.tagName} ${a.name}`).toBe(true);
      if (/url\s*\(/i.test(a.value)) expect(a.value, `${el.tagName} ${a.name}`).toMatch(/^url\(#[\w-]+\)$/);
    }
  }
}

describe('XSS', () => {
  it('labels with markup are text, never elements', () => {
    const sources = [
      `flowchart LR\n  A["${XSS}"] -->|"${XSS}"| B\n  subgraph G ["${XSS}"]\n    B\n  end`,
      `sequenceDiagram\n  title ${XSS}\n  participant A as ${XSS}\n  A->>A: ${XSS}\n  Note over A: ${XSS}\n  loop ${XSS}\n    A->>B: x\n  end\n  box ${XSS}\n    participant B\n  end`,
      `erDiagram\n  A["${XSS}"] ||--o{ B : "${XSS}"\n  A {\n    string ${'x'} "${XSS}"\n  }\n%%@ entity A {"showComments":true}`,
    ];
    for (const src of sources) {
      const { svg, result } = renderProd(src);
      expect(result.body.length).toBeGreaterThan(0);
      assertSafe(svg);
      expect(svg).toContain('&lt;img');
    }
  });

  it('ids with quotes and angle brackets stay inside their attribute', () => {
    const src = `flowchart LR\n  a"b --> c<d\n  e'f --> a"b`;
    const { svg } = renderProd(src);
    assertSafe(svg);
  });

  it('Mermaid style values that try to break out are dropped', () => {
    const src = `flowchart LR\n  A --> B\n  style A fill:x" onmouseover="alert(1),stroke:url(javascript:alert(1))\n  classDef c fill:red;color:expression(alert(1))\n  class B c\n  linkStyle 0 stroke:#f00" onclick="x`;
    assertSafe(renderProd(src).svg);
  });

  it('metadata colours that slipped past validation are dropped by the renderer', () => {
    // bypass core/meta's sanitizer on purpose: the renderer is the second line of defence
    const model = parse('flowchart LR\n  A -->|x| B\n  subgraph G\n    B\n  end');
    const meta: DiagramMeta = emptyMeta();
    const bad = {
      fill: 'red" onmouseover="alert(1)', stroke: 'url(javascript:alert(1))', text: '</text><script>alert(1)</script>',
      color: 'javascript:alert(1)', labelColor: '#fff"/><img src=x>', strokeWidth: '2" onclick="x' as unknown as number,
      dash: '4 4" onload="x', fontFamily: 'x" onload="y', fontWeight: 'bold" onclick="x', radius: '1e999' as unknown as number,
      titleColor: 'expression(alert(1))', shape: '"><img src=x>', arrow: '"><script>',
    };
    meta.nodes = { A: { ...bad }, B: { ...bad } };
    meta.edges = { 'A->B': { ...bad, endArrow: '"><img>', points: [['1" onclick="', 2], [3, 4]] as unknown as [number, number][] } };
    meta.groups = { G: { ...bad } };
    meta.canvas = { background: 'url(javascript:alert(1))', border: '"><img>', grid: 'red" onload="x' };
    meta.styles = { node: { _base: { fill: '"><img src=x onerror=alert(1)>' } }, palette: { evil: { color: '"><img>' } } };
    const theme = registry.get('default-light');
    const ctx = makeCtx(theme, meta);
    const svg = renderSvgString(render(model, meta, theme, ctx), ctx);
    assertSafe(svg);
    expect(svg).not.toContain('<script');
  });

  it('links with a forbidden protocol are not rendered as links', () => {
    const src = [
      'flowchart LR',
      '  A --> B',
      '  click A href "javascript:alert(1)"',
      '  click B href "java\tscript:alert(1)"',
      '%%@ edge A->B {"link":"JAVASCRIPT:alert(1)"}',
      '%%@ node B {"link":"//evil.example/x"}',
    ].join('\n');
    const { svg } = renderProd(src);
    assertSafe(svg);
    expect(svg).not.toContain('<a ');
    expect(svg).not.toContain('data-link');
    // an allowed link renders as a link and keeps data-link for the editor
    const ok = renderProd('flowchart LR\n  A --> B\n  click A href "https://example.com/?a=1&b=2"').svg;
    expect(ok).toContain('<a href="https://example.com/?a=1&amp;b=2" rel="noopener noreferrer">');
    expect(ok).toContain('data-link="https://example.com/?a=1&amp;b=2"');
  });
});

describe('ids', () => {
  const ids = (svg: string): Set<string> => new Set([...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!));

  it('two renders with different idPrefix share no id, and every url(#…) points at an own id', () => {
    const src = `flowchart LR\n  A --> B\n  A -.-x C\n  B o--o C\n%%@ canvas {"preset":"grid"}`;
    const a = renderProd(src, undefined, { idPrefix: 'one-' }).svg;
    const b = renderProd(src, undefined, { idPrefix: 'two-' }).svg;
    const ia = ids(a), ib = ids(b);
    expect(ia.size).toBeGreaterThan(2);
    for (const id of ia) {
      expect(ib.has(id)).toBe(false);
      expect(id.startsWith('one-')).toBe(true);
    }
    for (const [svg, own] of [[a, ia], [b, ib]] as const)
      for (const m of svg.matchAll(/url\(#([^)]*)\)/g)) expect(own.has(m[1]!), m[1]).toBe(true);
    expect(a).toContain('url(#one-page-grid)');
  });
});
