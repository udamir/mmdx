// Images in the scene (T03): an `<image>` fitted into an item's box, or — when the image policy refuses the URL — a
// placeholder (a dashed frame with a mountain glyph) and the `image.blocked` diagnostic at the item's line. A refused
// URL is never emitted. Renderers call `drawImage`; T06, T08 and T10 decide which items carry images.
import { def, el, g, image, text } from '../scene/build.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import { diag, type Diagnostic, type Rect } from '../types.js';
import type { SafeImageUrl } from '../validate.js';
import { checkImageUrl, type ImageBlockReason } from './policy.js';
import type { RenderContext } from '../render/types.js';
import type { TextMeasurer } from '../text/measure.js';
import { placeholderShapes } from './placeholder.js';

/** How an image fills its box: whole and centred (`contain`), filling it and cropped (`cover`), or distorted (`stretch`). */
export type ImageFit = 'contain' | 'cover' | 'stretch';

const ASPECT: Record<ImageFit, string> = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none' };

/** Why an image is not shown, for the placeholder and the diagnostic (English; `reason` is the i18n key's parameter). */
export const BLOCKED_TEXT: Record<ImageBlockReason, string> = {
  invalid: 'The image URL is not valid',
  protocol: 'Images from this kind of URL are not allowed',
  'data-off': 'Embedded images are disabled',
  'data-type': 'This type of embedded image is not allowed',
  'data-size': 'The embedded image is too large',
  host: 'Images from this host are not allowed',
  relative: 'Relative image URLs are disabled',
};

/**
 * An image fitted into box `b` (top-left and size). `cover` crops to the box through a clip path whose id the caller
 * gives (built from `ctx.idPrefix`, unique on the page); `<image>` clips its viewport already, the clip path keeps
 * rasterisers that do not in line.
 */
export function imageNodes(href: SafeImageUrl, b: Rect, fit: ImageFit = 'contain', clipId?: string, extra: SvgAttrs = {}): SceneNode[] {
  const box = { x: b.x, y: b.y, width: b.w, height: b.h };
  if (fit !== 'cover' || !clipId) return [image(href, { ...box, preserveAspectRatio: ASPECT[fit], ...extra })];
  return [
    def('clipPath', { id: clipId }, [el('rect', box)]),
    image(href, { ...box, preserveAspectRatio: ASPECT.cover, 'clip-path': `url(#${clipId})`, ...extra }),
  ];
}

export interface PlaceholderOptions {
  color?: string;
  /** Why the image is not shown; drawn under the glyph where it fits (measured with `measure`). */
  caption?: string;
  family?: string;
  measure?: TextMeasurer;
}

/** What a refused image draws instead: its box with a dashed frame, a mountain glyph and, where it fits, the reason. */
export function imagePlaceholder(b: Rect, o: PlaceholderOptions = {}): SceneNode {
  const c = o.color ?? '#8a9099';
  const family = o.family ?? 'sans-serif';
  const wide = o.caption ? (o.measure ? o.measure.width(o.caption, { size: 10, family }) : o.caption.length * 5.5) : Infinity;
  const caption = o.caption && wide <= b.w - 8 && b.h >= 64 ? o.caption : '';
  const parts: SceneNode[] = placeholderShapes(b, c, !!caption);
  // under the glyph (placeholderShapes: 0.34 of the box's smaller side, raised by 8)
  const glyph = Math.max(8, Math.min(b.w, b.h) * 0.34);
  if (caption)
    parts.push(
      text({ 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': family, 'font-size': 10, fill: c }, [{ text: caption, x: b.x + b.w / 2, y: b.y + b.h / 2 + glyph / 2 + 4 }]),
    );
  return g({ class: 'mmdx-image-blocked', role: 'img', 'aria-label': `Image not shown: ${o.caption ?? 'blocked'}` }, parts);
}

export interface DrawImage {
  /** Top-left and size of the image's box. */
  box: Rect;
  fit?: ImageFit;
  /** Unique among the diagram's images (the item key): the cover clip path's id is built from it. */
  key: string;
  /** Where the diagnostic points: the item's source line, and whether it is in the code or the metadata. */
  line?: number;
  source?: 'code' | 'meta';
  /** Placeholder colour and caption font (the theme's muted text colour and font). */
  color?: string;
  family?: string;
}

/**
 * An image from diagram content: drawn when the context's image policy accepts its URL, else the placeholder plus an
 * `image.blocked` warning (with the reason) in `diagnostics` — the render's report (`RenderEnv.diagnostics`).
 */
export function drawImage(env: { ctx: RenderContext; diagnostics: Diagnostic[] }, src: unknown, o: DrawImage): SceneNode[] {
  const r = checkImageUrl(src, env.ctx.imagePolicy);
  if ('url' in r) return imageNodes(r.url, o.box, o.fit, `${env.ctx.idPrefix}img-${o.key.replace(/[^a-zA-Z0-9-]/g, (ch) => `_${ch.codePointAt(0)!.toString(16)}`)}`);
  const why = BLOCKED_TEXT[r.reason];
  const url = typeof src === 'string' ? (src.length > 80 ? `${src.slice(0, 77)}…` : src) : '';
  const extra = o.source ? { source: o.source } : {};
  env.diagnostics.push(diag('warning', 'image.blocked', `Image not shown: ${why}`, o.line, { params: { reason: r.reason, url }, ...extra }));
  const p: PlaceholderOptions = { caption: why, measure: env.ctx.measure };
  if (o.color) p.color = o.color;
  if (o.family) p.family = o.family;
  return [imagePlaceholder(o.box, p)];
}
