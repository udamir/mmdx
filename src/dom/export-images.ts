// Remote images in PNG export (T03 §4.5). An SVG drawn through an `<img>` (svgToPng) loads no external resource, so
// the remote `<image href>`s of a diagram would be missing from the PNG. Each is fetched (CORS, no credentials, in
// parallel, 10 s and 5 MB at most) and put inline as a `data:` URL in the SVG text being rasterised; one that cannot
// be fetched (the image host sends no CORS headers, a timeout, too large, not an image) is replaced by the image
// placeholder, and the caller reports how many. Loaded on demand by svgToPng, only for SVG with remote images.
import { placeholderShapes } from '../core/media/placeholder.js';
import { toBase64 } from './base64.js';

const NS = 'http://www.w3.org/2000/svg';

export interface InlineImageOptions {
  /** Per image (default 10 s). */
  timeoutMs?: number;
  /** Largest image in bytes (default 5 MB). */
  maxBytes?: number;
  /** Fetch implementation (tests). */
  fetch?: typeof fetch;
}

export interface InlinedImages {
  svg: string;
  /** Images replaced by the placeholder. */
  failed: number;
}

/** The body of a response, or null once it grows past `max` bytes. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > max ? null : buf;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** A remote image as a `data:` URL, or null when it cannot be included. */
async function dataUrl(url: string, o: Required<Omit<InlineImageOptions, 'fetch'>> & { fetch: typeof fetch }): Promise<string | null> {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), o.timeoutMs);
  try {
    const res = await o.fetch(url, { mode: 'cors', credentials: 'omit', ...(ac ? { signal: ac.signal } : {}) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(type)) return null;
    if (Number(res.headers.get('content-length') ?? 0) > o.maxBytes) return null;
    const bytes = await readCapped(res, o.maxBytes);
    return bytes ? `data:${type};base64,${toBase64(bytes)}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The placeholder in an `<image>`'s place (its box): the shapes the renderer draws for a refused image. */
function placeholder(doc: Document, img: Element): Element {
  const num = (a: string): number => Number(img.getAttribute(a)) || 0;
  const g = doc.createElementNS(NS, 'g');
  g.setAttribute('class', 'mmdx-image-blocked');
  for (const s of placeholderShapes({ x: num('x'), y: num('y'), w: num('width'), h: num('height') }, '#8a9099', false)) {
    const e = doc.createElementNS(NS, s.t);
    for (const [k, v] of Object.entries(s.attrs)) e.setAttribute(k, String(v));
    g.append(e);
  }
  return g;
}

/** Inlines the remote images of a standalone SVG document; images that cannot be fetched become placeholders. */
export async function inlineImages(svg: string, opts: InlineImageOptions = {}): Promise<InlinedImages> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) return { svg, failed: 0 };
  const images = [...doc.getElementsByTagNameNS(NS, 'image')].filter((img) => {
    const href = img.getAttribute('href');
    return !!href && !/^data:/i.test(href);
  });
  if (!images.length) return { svg, failed: 0 };
  const o = { timeoutMs: opts.timeoutMs ?? 10_000, maxBytes: opts.maxBytes ?? 5 * 1024 * 1024, fetch: opts.fetch ?? fetch.bind(globalThis) };
  // one fetch per URL, however many times the diagram shows it
  const byUrl = new Map<string, Promise<string | null>>();
  let failed = 0;
  await Promise.all(
    images.map(async (img) => {
      const url = img.getAttribute('href')!;
      let p = byUrl.get(url);
      if (!p) byUrl.set(url, (p = dataUrl(url, o)));
      const data = await p;
      if (data) img.setAttribute('href', data);
      else {
        failed++;
        img.replaceWith(placeholder(doc, img));
      }
    }),
  );
  return { svg: new XMLSerializer().serializeToString(doc.documentElement), failed };
}
