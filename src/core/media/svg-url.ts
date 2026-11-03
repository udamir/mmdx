// Icon image URLs (T03, T04): the one producer of `SafeImageUrl` besides the content policy (`checkImageUrl`). Icons
// are not content: the icon registry (T04) validates an icon's body and builds the SVG document around it, and this
// turns that document into a `data:image/svg+xml` URI for an `<image>`. An SVG loaded as an image runs no script and
// loads nothing external, so the URI needs no policy; it is never put into the DOM as markup.
import type { SafeImageUrl } from '../validate.js';

/**
 * The `data:` URI of an SVG document mmdx built (an icon), percent-encoded. Only for SVG that mmdx assembled itself:
 * never pass content through it (content URLs go through `checkImageUrl`). Throws on anything but one `<svg>` root.
 */
export function svgImageUrl(svg: string): SafeImageUrl {
  const s = svg.trim();
  if (!/^<svg[\s>]/.test(s) || !s.endsWith('</svg>')) throw new Error('svgImageUrl: not an SVG document');
  return `data:image/svg+xml,${encodeURIComponent(s)}` as SafeImageUrl;
}
