// @vitest-environment jsdom
// XSS and id-collision regression tests (§12, §3): the serialized SVG must never carry markup, event handlers or
// script URLs from the input, and two diagrams on one page must not share any `id`.
import { describe, expect, it } from 'vitest';
import { emptyMeta, type DiagramMeta } from '../../../src/core/meta/types.js';
import { parse } from '../../../src/core/parse/index.js';
import { render, renderSvgString } from '../../../src/core/render/index.js';
import { ALLOWED_ATTRS, DATA_ATTRS, serializeNodes } from '../../../src/core/scene/serialize.js';
import { el, g, image, link, text } from '../../../src/core/scene/build.js';
import type { SceneNode } from '../../../src/core/scene/types.js';
import { drawImage } from '../../../src/core/media/image.js';
import type { Diagnostic } from '../../../src/core/types.js';
import { DEFAULT_IMAGE_POLICY, safeUrl, type ImagePolicy } from '../../../src/core/validate.js';
import { checkImageUrl, safeImageUrl } from '../../../src/core/media/policy.js';
import { makeCtx, registry, renderProd } from './helpers.js';

const XSS = '<img src=x onerror=alert(1)>';
const ELEMENTS = new Set(['svg', 'defs', 'g', 'path', 'rect', 'ellipse', 'circle', 'line', 'polygon', 'polyline', 'text', 'tspan', 'a', 'image', 'marker', 'pattern', 'clipPath']);

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
      const ok = ALLOWED_ATTRS.has(a.name) || DATA_ATTRS.has(a.name) || (el.tagName === 'a' && (a.name === 'href' || a.name === 'rel')) || (el.tagName === 'image' && a.name === 'href') || (el.tagName === 'svg' && (a.name === 'xmlns' || a.name === 'width' || a.name === 'height' || a.name === 'viewBox'));
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

describe('images (T03)', () => {
  const WITH_DATA: ImagePolicy = { ...DEFAULT_IMAGE_POLICY, protocols: ['https:', 'data:'], maxDataBytes: 64 };

  it('refused: script and unknown schemes, data: and http: by default, protocol-relative, whitespace and controls', () => {
    const refused = [
      'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'vbscript:x', 'file:///etc/passwd', 'blob:https://x/1',
      'data:image/png;base64,AAAA', 'data:image/svg+xml;base64,PHN2Zy8+', 'http://example.com/a.png', '//evil.example/a.png',
      'java\tscript:alert(1)', ' https://example.com/a b.png', 'https://example.com/\u0000.png', 'https:\\\\evil.example', './a.png', '',
    ];
    for (const u of refused) expect(safeImageUrl(u), u).toBeNull();
    // data: enabled: only base64 of an image type, within the cap
    for (const u of ['data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml,<svg onload=alert(1)>', 'data:image/png;base64,****', `data:image/png;base64,${'A'.repeat(200)}`, 'data:image/png;base64,AAA'])
      expect(safeImageUrl(u, WITH_DATA), u).toBeNull();
    expect(safeImageUrl('data:image/png;base64,AAAA', WITH_DATA)).not.toBeNull();
  });

  it('the attribute allow-list is unchanged: no href, src, style or event handler', () => {
    expect([...ALLOWED_ATTRS].sort()).toMatchSnapshot();
    for (const n of ['href', 'xlink:href', 'src', 'style', 'onload', 'onerror', 'srcset', 'crossorigin']) expect(ALLOWED_ATTRS.has(n) || DATA_ATTRS.has(n), n).toBe(false);
  });

  it('href only on <a> and <image>, from their branded fields', () => {
    const bad = { href: 'javascript:alert(1)', 'xlink:href': 'javascript:alert(2)', src: 'x', style: 'background:url(https://evil)', onload: 'alert(3)' };
    const nodes: SceneNode[] = [
      g({ ...bad }, [el('rect', { ...bad }), text({ ...bad }, [{ text: 'x', x: 0, y: 0 }])]),
      link(safeUrl('https://example.com')!, [el('circle', { ...bad })]),
      image(safeImageUrl('https://example.com/a.png')!, { ...bad, x: 0, y: 0, width: 10, height: 10 }),
    ];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">${serializeNodes(nodes)}</svg>`;
    assertSafe(svg);
    expect([...svg.matchAll(/<(\w+)[^>]*\shref="/g)].map((m) => m[1])).toEqual(['a', 'image']);
    expect(svg).not.toContain('xlink:href');
  });

  it('fuzz: no content string reaches an attribute name or an image href without the policy', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const PARTS = ['javascript:', 'data:', 'image/png;base64,', 'https://', 'http://', '//', 'evil.example', '/a.png', '"', "'", '<', '>', ' ', '\t', '\n', '\\', 'onload=', 'href', '=', 'url(', ')', '#', '\u0000', 'AAAA', 'svg+xml', ';', ','];
    const str = (): string => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => PARTS[Math.floor(rnd() * PARTS.length)]!).join('');
    const ctx = makeCtx(registry.get('default-light'), emptyMeta());
    let drawn = 0;
    for (let i = 0; i < 1000; i++) {
      const src = str();
      const diagnostics: Diagnostic[] = [];
      const attrs: Record<string, string> = { [str()]: str(), href: str(), 'xlink:href': str() };
      const nodes = [g(attrs, drawImage({ ctx: { ...ctx, imagePolicy: rnd() < 0.5 ? DEFAULT_IMAGE_POLICY : { ...DEFAULT_IMAGE_POLICY, protocols: ['https:', 'http:', 'data:'] } }, diagnostics }, src, { box: { x: 0, y: 0, w: 40, h: 30 }, key: str() }))];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg">${serializeNodes(nodes)}</svg>`;
      assertSafe(svg);
      const hrefs = [...svg.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      if (hrefs.length) {
        drawn++;
        expect(hrefs).toEqual([src.trim()]);
        expect('url' in checkImageUrl(src, { ...DEFAULT_IMAGE_POLICY, protocols: ['https:', 'http:', 'data:'] })).toBe(true);
        expect(diagnostics).toEqual([]);
      } else expect(diagnostics.map((d) => d.code)).toEqual(['image.blocked']);
    }
    // both ways were taken
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(1000);
  });
});
