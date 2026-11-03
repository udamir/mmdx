// @vitest-environment jsdom
// PNG export of remote images (T03.5): fetched with CORS and put inline; an image that cannot be fetched (CORS
// failure, too large, not an image) becomes the placeholder and is counted.
import { describe, expect, it, vi } from 'vitest';
import { inlineImages } from '../../src/dom/export-images.js';

const SVG = (hrefs: string[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">${hrefs.map((h, i) => `<image href="${h}" x="${i * 50}" y="10" width="40" height="30" preserveAspectRatio="xMidYMid meet"/>`).join('')}</svg>`;

const png = (bytes: number[], headers: Record<string, string> = { 'content-type': 'image/png' }): Response => new Response(new Uint8Array(bytes), { status: 200, headers });

describe('inlineImages', () => {
  it('inlines fetched images as data: URLs, one fetch per URL, with CORS and no credentials', async () => {
    const fetch = vi.fn(async () => png([137, 80, 78, 71]));
    const r = await inlineImages(SVG(['https://a.example/x.png', 'https://a.example/x.png', 'data:image/png;base64,AAAA']), { fetch });
    expect(r.failed).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://a.example/x.png', expect.objectContaining({ mode: 'cors', credentials: 'omit' }));
    expect(r.svg.match(/href="data:image\/png;base64,iVBORw=="/g)).toHaveLength(2);
    expect(r.svg).toContain('href="data:image/png;base64,AAAA"');
  });

  it('a CORS failure, an oversize image or a non-image becomes the placeholder and is counted', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('cors')) throw new TypeError('Failed to fetch');
      if (u.includes('big')) return png(new Array(2048).fill(0));
      if (u.includes('html')) return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
      if (u.includes('404')) return new Response('', { status: 404 });
      return png([1, 2, 3]);
    });
    const r = await inlineImages(SVG(['https://x.example/cors.png', 'https://x.example/big.png', 'https://x.example/html', 'https://x.example/404', 'https://x.example/ok.png']), { fetch, maxBytes: 1024 });
    expect(r.failed).toBe(4);
    const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect([...doc.getElementsByTagName('image')].map((i) => i.getAttribute('href'))).toEqual(['data:image/png;base64,AQID']);
    expect(doc.querySelectorAll('g.mmdx-image-blocked')).toHaveLength(4);
    // the placeholder takes the image's box
    expect(doc.querySelector('g.mmdx-image-blocked rect')!.getAttribute('width')).toBe('40');
    expect(r.svg).not.toContain('x.example');
  });

  it('a declared content-length over the cap is not read', async () => {
    const fetch = vi.fn(async () => png([1], { 'content-type': 'image/png', 'content-length': String(10 * 1024 * 1024) }));
    expect((await inlineImages(SVG(['https://x.example/a.png']), { fetch })).failed).toBe(1);
  });

  it('a slow image times out', async () => {
    const fetch = vi.fn((_u: string | URL | Request, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))));
    expect((await inlineImages(SVG(['https://x.example/slow.png']), { fetch, timeoutMs: 20 })).failed).toBe(1);
  });

  it('an SVG without remote images is returned as it is', async () => {
    const svg = SVG(['data:image/png;base64,AAAA']);
    const fetch = vi.fn();
    expect(await inlineImages(svg, { fetch })).toEqual({ svg, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
