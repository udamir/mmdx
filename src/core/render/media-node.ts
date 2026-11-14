// Icon and image nodes (T06 §3.1, §3.2): an item that is its asset — an icon, in an optional frame, or a picture — with
// its caption above or below. The flowchart reads them from Mermaid's node data (`@{ icon }`, `@{ img }`); the state
// diagram, whose code has no such syntax, from the state's metadata (the same keys). One sizing, one connector rule and
// one drawing, so the two types look and resize the same.
import { clamp } from '../geom.js';
import { shapeDef } from '../shapes/registry.js';
import { onOutline } from '../shapes/outline.js';
import type { ImageFit } from '../media/image.js';
import type { MediaKit } from '../media/kit.js';
import { el } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import { diag, type CenterBox } from '../types.js';
import { shapeNodes } from './common.js';
import type { MediaSource, Port, RenderEnv } from './types.js';

/** Mermaid's icon size when `h` / `w` are not given, the padding of an icon's frame and the gap before a caption. */
const ICON_SIZE = 48, FRAME_PAD = 8, CAPTION_GAP = 8;
/** An image node's box while its size is not known. */
const IMAGE_SIZE = 96;
const FORMS = new Set(['square', 'circle', 'rounded']);
const FITS = new Set(['contain', 'cover', 'stretch']);
const clampSize = (v: number): number => Math.max(8, Math.min(4000, v));

/** An icon or image node: the asset (with its frame) and the caption beside it, relative to the node's centre. */
export interface MediaBox {
  kind: 'icon' | 'image';
  /** The frame's centre offset (y) and size: the icon plus its padding, or the picture. */
  dy: number;
  fw: number;
  fh: number;
  /** The icon or the picture inside the frame. */
  aw: number;
  ah: number;
  /** An icon's frame (none: a bare icon). */
  form?: 'square' | 'circle' | 'rounded';
  /** The caption above the asset (`pos: t`), else below. */
  top: boolean;
  captionH: number;
  fit: ImageFit;
  /** The colour of a monochrome icon (the code's stroke, else the text colour). */
  color: string | undefined;
}

/**
 * An image node's picture size (§3.2): `w` and `h` as written; with the aspect lock (`constraint: on`) the width
 * follows `h` × the picture's aspect; what is not written comes from the picture's natural size, which the browser
 * knows once it has loaded it (until then, and where it cannot know it, 96 × 96).
 */
export function imageSize(env: RenderEnv, kit: MediaKit | null, url: string, w0: number | undefined, h0: number | undefined, lock: boolean, line: number | null): { w: number; h: number } {
  const { ctx } = env;
  if (w0 && h0 && !lock) return { w: clampSize(w0), h: clampSize(h0) };
  const ok = kit ? kit.checkImageUrl(url, ctx.imagePolicy, ctx.resolveUrl) : null;
  // undefined: the browser is loading it (the component renders again when it arrives); null: it cannot be known
  const nat = !ok || !('url' in ok) ? undefined : ctx.imageSizes ? ctx.imageSizes.get(ok.url) : null;
  if (nat) {
    const k = nat.w / nat.h;
    if (h0) return { w: clampSize(h0 * k), h: clampSize(h0) };
    if (w0) return { w: clampSize(w0), h: clampSize(w0 / k) };
    return { w: clampSize(nat.w), h: clampSize(nat.h) };
  }
  if (w0 || h0) return { w: clampSize(w0 ?? h0!), h: clampSize(h0 ?? w0!) };
  if (nat === null)
    env.diagnostics.push(diag('info', 'image.size-unknown', `The image's size is not known here — it is drawn ${IMAGE_SIZE} × ${IMAGE_SIZE} (give it "w" and "h")`, line ?? undefined, { params: { url: url.length > 80 ? `${url.slice(0, 77)}…` : url } }));
  return { w: IMAGE_SIZE, h: IMAGE_SIZE };
}

/**
 * The asset's frame and the node's box around it and its caption. `resize` is the asset's size while the resize handle
 * is dragged (metadata `w` / `h`, written to the source's keys when the drag ends); `caption(maxW)` lays the caption out
 * at the asset's width or the type's wrapping width, whichever is wider.
 */
export function mediaLayout<L extends { lines: readonly string[]; w: number }>(
  env: RenderEnv, kit: MediaKit | null, d: MediaSource, resize: { w?: number | undefined; h?: number | undefined }, fontSize: number, wrapWidth: number,
  color: string | undefined, line: number | null, caption: (maxW: number) => L,
): { box: MediaBox; caption: L; w: number; h: number } {
  const kind = d.img != null ? 'image' : 'icon';
  const mw = resize.w, mh = resize.h;
  let aw: number, ah: number, fw: number, fh: number;
  let form: MediaBox['form'];
  if (kind === 'icon') {
    // Mermaid draws the icon `max(h, w)` square, 48 by default
    const size = clampSize(mw || mh ? Math.max(mw ?? 0, mh ?? 0) : Math.max(d.h ?? ICON_SIZE, d.w ?? ICON_SIZE));
    aw = ah = size;
    if (d.form && FORMS.has(d.form)) form = d.form as MediaBox['form'];
    fw = fh = form ? size + 2 * FRAME_PAD : size;
  } else {
    ({ w: aw, h: ah } = imageSize(env, kit, String(d.img), mw ?? d.w, mh ?? d.h, d.constraint === 'on', line));
    fw = aw;
    fh = ah;
  }
  const cw = Math.max(fw, wrapWidth);
  const L = caption(cw);
  const captionH = L.lines.length * fontSize * 1.3;
  const w = Math.max(fw, L.w), h = fh + (L.lines.length ? CAPTION_GAP : 0) + captionH;
  const top = d.pos === 't';
  const box: MediaBox = {
    kind, dy: top ? h / 2 - fh / 2 : -h / 2 + fh / 2, fw, fh, aw, ah, top, captionH,
    fit: d.fit && FITS.has(d.fit) ? (d.fit as ImageFit) : 'contain', color,
  };
  if (form) box.form = form;
  return { box, caption: L, w, h };
}

/** The asset's centre and size (the resize handle's box; `BoxGeom.asset`). */
export const assetBox = (N: CenterBox, M: MediaBox): { x: number; y: number; w: number; h: number } => ({ x: N.x, y: N.y + M.dy, w: M.aw, h: M.ah });

/**
 * Where a connector ends on an icon or image node (Mermaid's outline of these shapes): on the asset's frame, except on
 * the caption's side, where it ends past the caption.
 */
export function mediaPort(N: CenterBox, M: MediaBox, captioned: boolean, port: Port): Port {
  const f = { x: N.x, y: N.y + M.dy, w: M.fw, h: M.fh };
  const vertical = Math.abs(port.n.y) > Math.abs(port.n.x);
  if (vertical && captioned && (port.n.y < 0) === M.top) return port;
  const p: Port = vertical
    ? { x: clamp(port.x, f.x - f.w / 2, f.x + f.w / 2), y: f.y + (port.n.y < 0 ? -f.h / 2 : f.h / 2), n: port.n }
    : { x: f.x + (port.n.x < 0 ? -f.w / 2 : f.w / 2), y: clamp(port.y, f.y - f.h / 2, f.y + f.h / 2), n: port.n };
  return M.form === 'circle' ? onOutline(shapeDef('circle'), f, p) : p;
}

/**
 * The node's asset: a transparent box (the caption is pickable too), the icon's frame, and the icon or the picture.
 * Without the kit (it is loading), the asset's box stays empty until the render runs again.
 */
export function mediaAssetNodes(env: RenderEnv, kit: MediaKit | null, N: CenterBox, M: MediaBox, d: MediaSource, st: StyleProps, o: { key: string; family: string; line?: number; source?: 'code' | 'meta' }): SceneNode[] {
  const fx = N.x, fy = N.y + M.dy;
  const out: SceneNode[] = [el('rect', { x: N.x - N.w / 2, y: N.y - N.h / 2, width: N.w, height: N.h, fill: 'transparent', stroke: 'none' })];
  if (M.form) out.push(...shapeNodes(M.form === 'circle' ? 'circle' : M.form === 'rounded' ? 'rounded' : 'rect', { x: fx, y: fy, w: M.fw, h: M.fh }, st));
  const box = { x: fx - M.aw / 2, y: fy - M.ah / 2, w: M.aw, h: M.ah };
  const at = o.line !== undefined ? { line: o.line } : {};
  if (kit && M.kind === 'icon') out.push(...kit.drawIcon(env, d.icon ?? '', { box, ...(M.color ? { color: M.color } : {}), ...at }));
  else if (kit) out.push(...kit.drawImage(env, d.img, { box, fit: M.fit, key: o.key, family: st.fontFamily || o.family, ...at, ...(o.source ? { source: o.source } : {}) }));
  return out;
}

/** The caption's centre line (above or below the asset). */
export const captionY = (N: CenterBox, M: MediaBox): number => (M.top ? N.y - N.h / 2 + M.captionH / 2 : N.y + N.h / 2 - M.captionH / 2);
