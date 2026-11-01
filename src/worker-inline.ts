// @mmdx/studio/worker-inline — the render worker as a string, for pages that cannot start it from a URL (sandboxed iframes
// with an opaque origin, where module workers from URLs fail): `useInlineWorker()` starts it from a `blob:` URL, so
// diagrams over 300 lines render off the main thread there too. Import it next to `@mmdx/studio/viewer` or `@mmdx/studio/editor`.
import source from 'virtual:mmdx-render-worker-source';
import { setWorkerUrl } from './dom/worker-client.js';

/** The render worker as one classic script (no imports). */
export const workerSource: string = source;

let url: string | null = null;

/**
 * Starts the render worker from a `blob:` URL of `workerSource` (through `setWorkerUrl`, as a classic worker). Returns
 * false when `Blob` or `URL.createObjectURL` is unavailable; diagrams then render as before (the worker from its file,
 * else the main thread). Calling it again reuses the URL.
 */
export function useInlineWorker(): boolean {
  if (!url) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
    try {
      url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    } catch {
      return false;
    }
  }
  setWorkerUrl(url, { type: 'classic' });
  return true;
}
