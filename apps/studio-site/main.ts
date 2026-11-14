// GitHub Pages app (UC4): the studio with the bundled examples and themes, and a demo image library.
import type { ImageInfo, ImageStore } from '../../src/ports.js';
import { configure } from '../../src/platform/config.js';
import { DEFAULT_IMAGE_POLICY } from '../../src/core/validate.js';

// The demo starts in the system's light / dark on every visit: the toggle's choice lasts for the visit only, so the
// studio's and its editor's remembered choice is dropped before the studio reads it.
try {
  for (const key of ['mmdx.ui', 'mmdx.editor.ui']) localStorage.removeItem(key);
} catch {
  // no localStorage: nothing is remembered
}

// The demo's image library: there is no server, so a picture uploaded in the image tool stays in this browser
// (localStorage) and a diagram references it as `demo:<id>`; the URL resolver gives the stored picture when the diagram
// is drawn. A real host gives the editor its own store (`httpImageStore`, or an ImageStore of its API) instead.
const KEY = 'mmdx.demo.images';
type Saved = ImageInfo & { data: string };
const load = (): Saved[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as Saved[]).filter((x) => x && typeof x.id === 'string' && typeof x.data === 'string') : [];
  } catch {
    return [];
  }
};
const dataUrl = (file: Blob): Promise<string> => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => fail(r.error ?? new Error('The file could not be read'));
  r.readAsDataURL(file);
});
let saved = load();
const read = (): Saved[] => saved;
const info = ({ data: _d, ...rest }: Saved): ImageInfo => rest;
const demoImages: ImageStore = {
  async list({ cursor, query } = {}) {
    const q = query?.trim().toLowerCase();
    const all = read().filter((i) => !q || (i.name ?? '').toLowerCase().includes(q));
    const from = Number(cursor) || 0;
    const page = all.slice(from, from + 24).map(info);
    return from + 24 < all.length ? { images: page, next: String(from + 24) } : { images: page };
  },
  async get(id) {
    const img = read().find((i) => i.id === id);
    if (!img) throw new Error(`Unknown image ${id}`);
    return info(img);
  },
  async put(file, o = {}) {
    const id = Math.random().toString(36).slice(2, 10);
    const img: Saved = { id, url: `demo:${id}`, name: o.name ?? 'image', size: file.size, type: file.type, date: new Date().toISOString(), data: await dataUrl(file) };
    try {
      localStorage.setItem(KEY, JSON.stringify([img, ...saved]));
    } catch {
      throw new Error('this browser has no room for more pictures (the demo keeps them in localStorage)');
    }
    saved = [img, ...saved];
    return info(img);
  },
  async delete(id) {
    saved = saved.filter((i) => i.id !== id);
    localStorage.setItem(KEY, JSON.stringify(saved));
  },
};
configure({
  resolveUrl: (url, kind) => (kind === 'image' && url.startsWith('demo:') ? read().find((i) => i.url === url)?.data : undefined),
  // the demo's pictures are drawn from their data: URLs
  imagePolicy: { ...DEFAULT_IMAGE_POLICY, protocols: ['https:', 'data:'], maxDataBytes: 4 * 1024 * 1024 },
  // stock Mermaid for Plain Mermaid and the fallback renderer: a bundled page names its loader (no run-time resolve)
  mermaid: () => import('mermaid'),
});

void import('../../src/studio.js').then(() => {
  const studio = document.querySelector('mmdx-studio') as (HTMLElement & { images: ImageStore | null }) | null;
  if (studio) studio.images = demoImages;
});
