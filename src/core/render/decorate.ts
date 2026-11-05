// An item's icon and image beside its label (T10 §4.5): one helper for every kind whose code has no icon or image node
// of its own — mindmap nodes, states, and next sequence participants and ER entities — so sizes, spacing and
// placeholders look the same everywhere. The flowchart keeps its icon and image nodes (Mermaid's `@{ icon }` and
// `@{ img }`, T06), which have their own sizing rules.
//
// What an item shows comes from its label and its metadata (§4.6):
// - the icon is the label's leading token (`fa:fa-cog Running`, `tabler:user Alice`; the registry decides what is an
//   icon), or the item's own icon where its code has one (mindmap `::icon(…)`). `iconPos` places it: `l` inline before
//   the text at the font's size (the token stays in the text runs, as every label token is drawn), `t` above the text
//   or `b` below it, at 1.75 em; the token is taken out of the text for `t` and `b`, and for `l` when `iconSize` gives
//   it a size of its own (it is then drawn left of the text block, centred on it). `iconColor` colours it (a colour or
//   palette reference; default: the text colour);
// - the image is metadata `img` (a URL; `""` is a picture not chosen yet: the placeholder), always above the text and
//   the icon: `imgW` / `imgH` give its box (one of them keeps the picture's aspect), else its natural size up to 160 px
//   once the browser knows it, else 96 × 72; `imgFit` how it fills the box (contain, cover, stretch).
//
// Two steps, since a kind sizes its items before the layout places them: `decoration()` reads the item (and takes the
// token out of the label the kind then measures), `decoratedSize()` gives the content block around the measured text,
// and `decorate()` draws the assets once the block's place is known and returns the box the text goes in. Everything
// draws through the media kit (a lazy chunk): without it the assets are empty boxes of their size and a miss is
// counted, and the viewer renders again once it has loaded (core/media/kit.ts).
import type { IconForm } from '../icons/types.js';
import type { ImageFit } from '../media/image.js';
import { mediaKit, type MediaKit } from '../media/kit.js';
import { leadingIcon } from '../ops/icon-token.js';
import type { ItemMeta } from '../meta/types.js';
import type { SceneNode } from '../scene/types.js';
import type { CenterBox, Diagnostic, Rect } from '../types.js';
import type { RenderContext } from './types.js';

export type IconPos = 'l' | 't' | 'b';

/** The gap between an asset and the text (and between two assets). */
export const DECO_GAP = 6;
/** An image's box while its natural size is not known, and the largest side a natural size is drawn at. */
export const DECO_IMAGE = { w: 96, h: 72, max: 160 };
/** An icon above or below the text: 1.75 em. */
export const decoIconSize = (fontSize: number): number => Math.round(fontSize * 1.75);

const POS = new Set<string>(['l', 't', 'b']);
const FITS = new Set<string>(['contain', 'cover', 'stretch']);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : undefined;

/** The media kit, asked for once per render (each ask without it counts a miss). */
export function lazyKit(): () => MediaKit | null {
  let asked = false, kit: MediaKit | null = null;
  return () => {
    if (!asked) {
      asked = true;
      kit = mediaKit();
    }
    return kit;
  };
}

/** A label's leading icon token, when the registry draws it (`fa:fa-cog Running` → `fa:fa-cog`, `Running`). */
export function leadingToken(ctx: Pick<RenderContext, 'icons'>, label: string): { token: string; rest: string } | null {
  const lead = label.includes(':') ? leadingIcon(label, (t) => ctx.icons.resolve(t, 'token') !== null) : null;
  return lead ? { token: lead.token, rest: lead.rest } : null;
}

/** An item's icon and image, read from its label and metadata. */
export interface Decoration {
  /** The text the kind lays out: the label without the leading token when the icon is drawn apart. */
  label: string;
  pos: IconPos;
  /** The icon drawn apart from the text (null: none, or the token stays inline in the text). */
  icon: { written: string; form: IconForm; size: number; color: string | undefined } | null;
  /** The colour of the icons inline in the text (`iconColor`; undefined: the text's). */
  inlineColor: string | undefined;
  image: { url: string; w: number; h: number; fit: ImageFit } | null;
}

export interface DecorationInput {
  label: string;
  meta: ItemMeta;
  fontSize: number;
  /** The text colour (the icon's colour without `iconColor`). */
  color: string | undefined;
  /** The item's own icon, written as its code writes it (mindmap `::icon(fa fa-book)`, form `class`). */
  icon?: { written: string; form: IconForm } | null;
  /** Where the icon goes without `iconPos`: `l` for a leading token, `t` for the item's own icon. */
  pos?: IconPos;
}

/** What an item shows beside its text (§4.6 keys); `kit` is the render's lazy media kit (natural image sizes). */
export function decoration(ctx: RenderContext, kit: () => MediaKit | null, d: DecorationInput): Decoration {
  const m = d.meta;
  const own = d.icon ?? null;
  const set = typeof m.iconPos === 'string' && POS.has(m.iconPos) ? (m.iconPos as IconPos) : undefined;
  const pos = set ?? d.pos ?? (own ? 't' : 'l');
  const size = num(m.iconSize, 4, 512);
  const tint = typeof m.iconColor === 'string' && m.iconColor ? ctx.color(m.iconColor) : undefined;
  const color = tint ?? d.color;
  let label = d.label, icon: Decoration['icon'] = null;
  if (own) icon = { written: own.written, form: own.form, size: size ?? decoIconSize(d.fontSize), color };
  else if (pos !== 'l' || size !== undefined) {
    const lead = leadingToken(ctx, d.label);
    if (lead) {
      label = lead.rest;
      icon = { written: lead.token, form: 'token', size: size ?? (pos === 'l' ? d.fontSize : decoIconSize(d.fontSize)), color };
    }
  }
  return { label, pos, icon, inlineColor: tint, image: imageOf(ctx, kit, m) };
}

/** The metadata image's box: `imgW` / `imgH`, else the natural size (up to 160 px) when known, else 96 × 72. */
function imageOf(ctx: RenderContext, kit: () => MediaKit | null, m: ItemMeta): Decoration['image'] {
  if (typeof m.img !== 'string') return null;
  const url = m.img;
  const fit = typeof m.imgFit === 'string' && FITS.has(m.imgFit) ? (m.imgFit as ImageFit) : 'contain';
  const w0 = num(m.imgW, 8, 2000), h0 = num(m.imgH, 8, 2000);
  if (w0 && h0) return { url, w: w0, h: h0, fit };
  const k = url ? kit() : null;
  const ok = k ? k.checkImageUrl(url, ctx.imagePolicy, ctx.resolveUrl) : null;
  const nat = ok && 'url' in ok ? ctx.imageSizes?.get(ok.url) : null;
  const aspect = nat ? nat.w / nat.h : DECO_IMAGE.w / DECO_IMAGE.h;
  if (w0) return { url, w: w0, h: w0 / aspect, fit };
  if (h0) return { url, w: h0 * aspect, h: h0, fit };
  if (!nat) return { url, w: DECO_IMAGE.w, h: DECO_IMAGE.h, fit };
  const r = Math.min(1, DECO_IMAGE.max / Math.max(nat.w, nat.h));
  return { url, w: nat.w * r, h: nat.h * r, fit };
}

/** Whether the item shows an asset apart from its text (the kind lays out a content block, not the text alone). */
export const decorated = (d: Decoration): boolean => !!(d.icon || d.image);

/** The content block around a text of size `text`: the image on top, the icon above, below or left of the text. */
export function decoratedSize(d: Decoration, text: { w: number; h: number }): { w: number; h: number } {
  const { icon, image } = d;
  let w = text.w, h = text.h;
  if (icon && d.pos === 'l') {
    w = icon.size + (text.w > 0 ? DECO_GAP + text.w : 0);
    h = Math.max(icon.size, text.h);
  } else if (icon) {
    w = Math.max(w, icon.size);
    h += icon.size + DECO_GAP;
  }
  if (image) {
    w = Math.max(w, image.w);
    h += image.h + DECO_GAP;
  }
  return { w, h };
}

export interface DecorateOptions {
  /** The image's key, unique among the diagram's images (its cover clip path's id). */
  key: string;
  /** Where diagnostics point (the item's line). */
  line?: number;
  /** The placeholder's colour (the text's) and caption font. */
  color?: string;
  family?: string;
}

/**
 * Draws the assets of a content block whose centre is `x` and top `top` (sized by `decoratedSize` around `text`), and
 * returns the box the text goes in (its centre and size). Without the media kit the assets are left out (their space
 * stays).
 */
export function decorate(
  env: { ctx: RenderContext; diagnostics: Diagnostic[] },
  kit: () => MediaKit | null,
  d: Decoration,
  x: number,
  top: number,
  text: { w: number; h: number },
  o: DecorateOptions,
): { nodes: SceneNode[]; contentBox: CenterBox } {
  const nodes: SceneNode[] = [];
  const k = d.icon || d.image ? kit() : null;
  const at = o.line !== undefined ? { line: o.line } : {};
  const block = decoratedSize(d, text);
  let y = top;
  if (d.image) {
    const b: Rect = { x: x - d.image.w / 2, y, w: d.image.w, h: d.image.h };
    if (k) nodes.push(...k.drawImage(env, d.image.url, { box: b, fit: d.image.fit, key: o.key, source: 'meta', ...at, ...(o.color ? { color: o.color } : {}), ...(o.family ? { family: o.family } : {}) }));
    y += d.image.h + DECO_GAP;
  }
  const icon = (b: Rect): void => {
    if (k && d.icon) nodes.push(...k.drawIcon(env, d.icon.written, { box: b, form: d.icon.form, ...at, ...(d.icon.color ? { color: d.icon.color } : {}) }));
  };
  const s = d.icon?.size ?? 0;
  if (d.icon && d.pos === 'l') {
    // left of the text block, both centred on the row they share
    const h = block.h - (d.image ? d.image.h + DECO_GAP : 0);
    const x0 = x - block.w / 2;
    icon({ x: x0, y: y + (h - s) / 2, w: s, h: s });
    return { nodes, contentBox: { x: x0 + s + DECO_GAP + text.w / 2, y: y + h / 2, w: text.w, h: text.h } };
  }
  if (d.icon && d.pos === 't') {
    icon({ x: x - s / 2, y, w: s, h: s });
    y += s + DECO_GAP;
  }
  const contentBox = { x, y: y + text.h / 2, w: text.w, h: text.h };
  if (d.icon && d.pos === 'b') icon({ x: x - s / 2, y: y + text.h + DECO_GAP, w: s, h: s });
  return { nodes, contentBox };
}
