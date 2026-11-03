// Natural sizes of content images in the browser (T06): an image node without `w` / `h` is drawn at its picture's own
// size, which is known only once the picture loads. The first lookup of a URL starts loading it (an `Image`, no
// credentials) and answers "not yet"; when it arrives, the size is cached for the page and every component renders
// again once (`onImageSize`). A picture that fails to load answers null (the renderer keeps its 96 × 96 box).
import type { ImageSizes } from '../core/render/types.js';

const sizes = new Map<string, { w: number; h: number } | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
let pending = false;

/** Tells the listeners once per batch of arrivals (several pictures loading together re-render once). */
function changed(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    for (const f of [...listeners]) f();
  });
}

function load(url: string): void {
  if (loading.has(url) || typeof Image === 'undefined') return;
  loading.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    loading.delete(url);
    sizes.set(url, img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    changed();
  };
  img.onerror = () => {
    loading.delete(url);
    sizes.set(url, null);
    changed();
  };
  img.src = url;
}

/** The page's lookup: the renderer only asks for URLs the image policy accepted. */
export const domImageSizes: ImageSizes = {
  get(url) {
    const s = sizes.get(url);
    if (s !== undefined) return s;
    if (sizes.size > 512) sizes.clear();
    load(url);
    return typeof Image === 'undefined' ? null : undefined;
  },
};

/** Calls `f` when sizes arrive; returns the unsubscribe function. */
export function onImageSize(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}
