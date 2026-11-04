// The host's URL resolver (configure({ resolveUrl })): content images and links go through it before the image and
// link policies check them; the code keeps what was written; a resolver that declines or throws leaves the URL as is.
import { describe, expect, it, vi } from 'vitest';
import { createContext } from '../../../src/core/context.js';
import { checkImageUrl } from '../../../src/core/media/policy.js';
import { renderToSvg } from '../../../src/core/pipeline.js';
import { resolveContentUrl, type UrlResolver } from '../../../src/core/validate.js';

const ATTACH: UrlResolver = (url, kind) => (/^[a-z]+:|^\//i.test(url) ? null : `https://tracker.example/${kind === 'image' ? 'files' : 'docs'}/${url}`);

describe('resolveContentUrl', () => {
  it('the resolver\'s URL, else the URL as written (declined, thrown, none, not a string)', () => {
    expect(resolveContentUrl('logo.png', 'image', ATTACH)).toBe('https://tracker.example/files/logo.png');
    expect(resolveContentUrl(' guide.md ', 'link', ATTACH)).toBe('https://tracker.example/docs/guide.md');
    expect(resolveContentUrl('https://a.example/x.png', 'image', ATTACH)).toBe('https://a.example/x.png');
    expect(resolveContentUrl('x.png', 'image', () => { throw new Error('no'); })).toBe('x.png');
    expect(resolveContentUrl('x.png', 'image', undefined)).toBe('x.png');
    expect(resolveContentUrl('', 'image', ATTACH)).toBe('');
    expect(resolveContentUrl(42, 'link', ATTACH)).toBe(42);
  });

  it('checkImageUrl checks what the resolver returns', () => {
    // a relative URL is refused by default; resolved to https it passes
    expect(checkImageUrl('logo.png')).toEqual({ reason: 'relative' });
    expect(checkImageUrl('logo.png', undefined, ATTACH)).toEqual({ url: 'https://tracker.example/files/logo.png' });
    // the policy still applies to the result
    expect(checkImageUrl('logo.png', undefined, () => 'http://plain.example/logo.png')).toEqual({ reason: 'protocol' });
  });
});

describe('rendering through the resolver', () => {
  const SRC = 'flowchart LR\n  A["Logo"]\n  A@{ img: "logo.png", h: 60, w: 60, pos: "b" }\n  B["Guide"]\n  click B href "guide.md"\n';

  it('image hrefs and link hrefs are the resolved URLs; the resolver sees each with its kind', async () => {
    const resolve = vi.fn(ATTACH);
    const svg = await renderToSvg(SRC, { ctx: createContext({ resolveUrl: resolve }) });
    expect(svg).toContain('href="https://tracker.example/files/logo.png"');
    expect(svg).toContain('href="https://tracker.example/docs/guide.md"');
    expect(resolve).toHaveBeenCalledWith('logo.png', 'image');
    expect(resolve).toHaveBeenCalledWith('guide.md', 'link');
  });

  it('without a resolver the relative image is the placeholder and the relative link stays relative', async () => {
    const svg = await renderToSvg(SRC, { ctx: createContext() });
    expect(svg).not.toContain('logo.png"');
    expect(svg).toContain('href="guide.md"');
  });
});
