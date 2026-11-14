// Images in the scene (T03): the image policy, `<image>` nodes and their fit modes, the placeholder and the
// `image.blocked` diagnostic, the icon URI producer, and the render's diagnostics reaching the pipeline.
import { describe, expect, it } from 'vitest';
import { drawImage, imageNodes, imagePlaceholder } from '../../../src/core/media/image.js';
import { svgImageUrl } from '../../../src/core/media/svg-url.js';
import { createContext } from '../../../src/core/context.js';
import { ALL_KINDS, renderSource, type Kinds } from '../../../src/core/pipeline.js';
import { renderSourceWith } from '../../../src/core/pipeline-core.js';
import { serializeNodes } from '../../../src/core/scene/serialize.js';
import type { Diagnostic } from '../../../src/core/types.js';
import { DEFAULT_IMAGE_POLICY, DEFAULT_LINK_POLICY, type ImagePolicy, type SafeImageUrl } from '../../../src/core/validate.js';
import { checkImageUrl, safeImageUrl } from '../../../src/core/media/policy.js';
import type { RenderContext } from '../../../src/core/render/types.js';
import { createStaticMeasurer } from '../../../src/core/text/measure.js';
import { NO_ICONS } from '../../../src/core/icons/names.js';

const BOX = { x: 10, y: 20, w: 160, h: 90 };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WITH_DATA: ImagePolicy = { ...DEFAULT_IMAGE_POLICY, protocols: ['https:', 'data:'] };

const rctx = (imagePolicy: ImagePolicy = DEFAULT_IMAGE_POLICY): RenderContext => ({
  measure: createStaticMeasurer(), idPrefix: 't-', linkPolicy: DEFAULT_LINK_POLICY, imagePolicy, icons: NO_ICONS, color: (v) => (typeof v === 'string' ? v : undefined),
});

describe('image policy', () => {
  it('accepts https: by default and refuses http:, data: and relative URLs', () => {
    expect(safeImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(checkImageUrl('http://example.com/a.png')).toEqual({ reason: 'protocol' });
    expect(checkImageUrl(PNG)).toEqual({ reason: 'data-off' });
    expect(checkImageUrl('./img/logo.png')).toEqual({ reason: 'relative' });
    expect(checkImageUrl('./img/logo.png', { ...DEFAULT_IMAGE_POLICY, relative: true })).toEqual({ url: './img/logo.png' });
    expect(checkImageUrl('https://example.com/a.png', { ...DEFAULT_IMAGE_POLICY, protocols: [] })).toEqual({ reason: 'protocol' });
  });

  it('host allow-list: exact names and *.example.com subdomains; no user info', () => {
    const p: ImagePolicy = { ...DEFAULT_IMAGE_POLICY, hosts: ['cdn.example.com', '*.images.example.org'] };
    expect(safeImageUrl('https://cdn.example.com/a.png', p)).not.toBeNull();
    expect(safeImageUrl('https://CDN.example.com:8443/a.png', p)).not.toBeNull();
    expect(safeImageUrl('https://a.images.example.org/a.png', p)).not.toBeNull();
    expect(checkImageUrl('https://images.example.org/a.png', p)).toEqual({ reason: 'host' });
    expect(checkImageUrl('https://evil.example.net/a.png', p)).toEqual({ reason: 'host' });
    expect(checkImageUrl('https://cdn.example.com@evil.example.net/a.png', p)).toEqual({ reason: 'invalid' });
  });

  it('data: when enabled: base64 of an allowed type within the size cap', () => {
    expect(safeImageUrl(PNG, WITH_DATA)).toBe(PNG);
    expect(checkImageUrl('data:image/png,abc', WITH_DATA)).toEqual({ reason: 'invalid' });
    expect(checkImageUrl('data:image/png;base64,ab$c', WITH_DATA)).toEqual({ reason: 'invalid' });
    expect(checkImageUrl('data:text/html;base64,PHNjcmlwdD4=', WITH_DATA)).toEqual({ reason: 'data-type' });
    const big = `data:image/png;base64,${'A'.repeat(4 * 1024)}`;
    expect(checkImageUrl(big, { ...WITH_DATA, maxDataBytes: 1024 })).toEqual({ reason: 'data-size' });
    expect(checkImageUrl(big, { ...WITH_DATA, maxDataBytes: 3 * 1024 })).toEqual({ url: big });
  });
});

describe('<image>', () => {
  const url = safeImageUrl('https://example.com/a.png?x=1&y="2"')!;
  it('fit modes (golden)', () => {
    const out = (['contain', 'cover', 'stretch'] as const).map((fit) => serializeNodes(imageNodes(url, BOX, fit, `t-img-${fit}`)));
    expect(out).toMatchSnapshot();
    expect(out[1]).toContain('<clipPath id="t-img-cover"><rect x="10" y="20" width="160" height="90"/></clipPath>');
    expect(out[0]).toContain('href="https://example.com/a.png?x=1&amp;y=&quot;2&quot;"');
  });

  it('an allowed image draws, with no diagnostic', () => {
    const diagnostics: Diagnostic[] = [];
    const nodes = drawImage({ ctx: rctx(), diagnostics }, 'https://example.com/a.png', { box: BOX, key: 'node:A', fit: 'cover' });
    expect(diagnostics).toEqual([]);
    expect(serializeNodes(nodes)).toContain('<clipPath id="t-img-node_3aA">');
  });

  it('a blocked image draws the placeholder and reports image.blocked at its line (golden)', () => {
    const diagnostics: Diagnostic[] = [];
    const nodes = drawImage({ ctx: rctx(), diagnostics }, PNG, { box: BOX, key: 'node:A', line: 3 });
    const svg = serializeNodes(nodes);
    expect(svg).toMatchSnapshot();
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('data:');
    expect(svg).toContain('Embedded images are disabled');
    expect(diagnostics).toEqual([{ severity: 'warning', code: 'image.blocked', message: 'Image not shown: Embedded images are disabled', range: { line: 3 }, params: { reason: 'data-off', url: `${PNG.slice(0, 77)}…` } }]);
  });

  it('the caption only where it fits', () => {
    expect(serializeNodes([imagePlaceholder({ x: 0, y: 0, w: 48, h: 48 }, { caption: 'x' })])).not.toContain('<text');
    expect(serializeNodes([imagePlaceholder({ x: 0, y: 0, w: 100, h: 80 }, { caption: 'Embedded images are disabled', measure: createStaticMeasurer() })])).not.toContain('<text');
  });
});

describe('svgImageUrl (the icon producer)', () => {
  it('percent-encodes one SVG document; anything else throws', () => {
    const u = svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24"/></svg>');
    expect(u.startsWith('data:image/svg+xml,%3Csvg%20xmlns')).toBe(true);
    expect(u).not.toMatch(/[<>"\s]/);
    expect(() => svgImageUrl('<script>alert(1)</script>')).toThrow();
    expect(() => svgImageUrl('<svg/><script/>')).toThrow();
  });

  it('is drawn as an <image> only, never as markup', () => {
    const u = svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>');
    const svg = serializeNodes(imageNodes(u as SafeImageUrl, BOX));
    expect(svg).toMatch(/^<image href="data:image\/svg\+xml,[^"<>]*"/);
    expect(svg.match(/<svg|<circle/g)).toBeNull();
  });
});

describe('render diagnostics', () => {
  // a flowchart kind that draws an image beside its nodes (T06 draws image nodes this way)
  const withImage = (src: unknown): Kinds => ({
    flowchart: {
      ...ALL_KINDS.flowchart!,
      render(model, env) {
        const r = ALL_KINDS.flowchart!.render(model, env);
        return { ...r, body: [...r.body, ...drawImage(env, src, { box: BOX, key: 'node:a', line: 1 })] };
      },
    },
  });

  it('the pipeline merges what a render reports', () => {
    const plain = renderSource('flowchart LR\n  a --> b', createContext());
    expect(plain.result.diagnostics).toBeUndefined();
    const ok = renderSourceWith(withImage('https://example.com/a.png'), 'flowchart LR\n  a --> b', createContext());
    expect(ok.diagnostics.filter((d) => d.code === 'image.blocked')).toEqual([]);
    const blocked = renderSourceWith(withImage('http://example.com/a.png'), 'flowchart LR\n  a --> b', createContext());
    expect(blocked.diagnostics.filter((d) => d.code === 'image.blocked').map((d) => [d.range?.line, d.params?.['reason']])).toEqual([[1, 'protocol']]);
    // the instance's policy decides
    const allowed = renderSourceWith(withImage('http://example.com/a.png'), 'flowchart LR\n  a --> b', createContext({ imagePolicy: { ...DEFAULT_IMAGE_POLICY, protocols: ['https:', 'http:'] } }));
    expect(allowed.diagnostics.filter((d) => d.code === 'image.blocked')).toEqual([]);
    expect(serializeNodes(allowed.result.body)).toContain('<image href="http://example.com/a.png"');
  });
});
