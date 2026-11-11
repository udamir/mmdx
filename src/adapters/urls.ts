// URL resolution (configure({ resolveUrl })): what the image and link URLs written in a diagram point at. A host passes
// its own resolver (an attachment's name made its download URL) or this one, which makes relative URLs absolute against
// a base — the folder of the document the diagram comes from.
import type { UrlResolver } from '../core/validate.js';

/**
 * Resolves relative image and link URLs (`img/logo.png`, `../guide.md`, `/files/a.png`) against `base`; absolute URLs
 * (with a scheme), protocol-relative ones (`//host/…`) and fragments (`#part`) stay as written, and so does a URL the
 * base cannot resolve.
 */
export function relativeUrlResolver(base: string | URL): UrlResolver {
  const root = String(base);
  return (url) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#')) return null;
    try {
      return new URL(url, root).href;
    } catch {
      return null;
    }
  };
}
