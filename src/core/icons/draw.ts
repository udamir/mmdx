// Icons in the scene (T04 §4.4): a registry lookup → an image. A ready icon becomes a `data:` SVG image built by mmdx
// (svgImageUrl) with the item's colour baked in — monochrome icons draw `currentColor` in it, multicolour ones keep
// their own — cached per icon, colour and size; a loading one an empty box of the same size (nothing moves when it
// arrives); a missing one the "?" placeholder and an `icon.unknown` warning, a Font Awesome name drawn with a built-in
// look-alike an `icon.fa-fallback` note. Renderers use `drawIcon` (icon nodes, mindmap icons) and `iconResolver`
// (label tokens through core/text/rich.ts `parseInline`).
import { svgImageUrl } from '../media/svg-url.js';
import { image } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import type { IconRef, IconResolver } from '../text/rich.js';
import { diag, type Diagnostic, type Rect } from '../types.js';
import { isColorLiteral, type SafeImageUrl } from '../validate.js';
import { splitIconName } from './names.js';
import type { IconData, IconForm, IconLookup, IconMissing } from './types.js';

const NS = 'http://www.w3.org/2000/svg';
/** The placeholder's colour when the renderer gives none (the image placeholder's grey). */
export const ICON_PLACEHOLDER_COLOR = '#8a9099';

const colorOf = (c: string | undefined): string | undefined => (c && c.toLowerCase() !== 'currentcolor' && isColorLiteral(c) ? c.trim() : undefined);
const num = (n: number): string => String(Math.round(n * 1e4) / 1e4);

/** An icon as an SVG document: its box, its body, `currentColor` replaced by `color` (a validated colour literal). */
export function iconSvg(icon: IconData, color?: string, size?: number): string {
  const c = colorOf(color);
  const body = c && icon.mono ? icon.body.replace(/currentColor/gi, c) : icon.body;
  const wh = size && size > 0 ? ` width="${num(size)}" height="${num(size)}"` : '';
  return `<svg xmlns="${NS}" viewBox="${num(icon.left)} ${num(icon.top)} ${num(icon.width)} ${num(icon.height)}"${wh}>${body}</svg>`;
}

const urls = new WeakMap<IconData, Map<string, SafeImageUrl>>();

/** The icon's image URL in a colour and size (cached per icon, colour and size). */
export function iconUrl(icon: IconData, color?: string, size?: number): SafeImageUrl {
  const key = `${icon.mono ? colorOf(color) ?? '' : ''}|${size ?? ''}`;
  let m = urls.get(icon);
  if (!m) urls.set(icon, (m = new Map()));
  let u = m.get(key);
  if (!u) {
    u = svgImageUrl(iconSvg(icon, color, size));
    if (m.size > 32) m.delete(m.keys().next().value!);
    m.set(key, u);
  }
  return u;
}

const placeholders = new Map<string, SafeImageUrl>();
/** The "?" drawn for an icon that is not available: a dashed rounded square with a question mark. */
export function iconPlaceholderUrl(color?: string): SafeImageUrl {
  const c = colorOf(color) ?? ICON_PLACEHOLDER_COLOR;
  let u = placeholders.get(c);
  if (!u) {
    u = svgImageUrl(
      `<svg xmlns="${NS}" viewBox="0 0 24 24"><rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 2"/>` +
        `<path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    );
    if (placeholders.size > 16) placeholders.clear();
    placeholders.set(c, u);
  }
  return u;
}

/** What a loading icon draws: nothing, in the icon's box (the layout does not move when it arrives). */
export const ICON_LOADING_URL: SafeImageUrl = svgImageUrl(`<svg xmlns="${NS}" viewBox="0 0 24 24"></svg>`);

const MISSING_TEXT: Record<IconMissing, (name: string, pack: string) => string> = {
  pack: (_n, p) => `Icons from "${p}" are not available`,
  icon: (n) => `Icon "${n}" not found`,
  invalid: (n) => `Icon "${n}" was not drawn: its SVG is not allowed`,
  failed: (_n, p) => `Icon pack "${p}" failed to load`,
};

/** Where an icon's diagnostics go: the render's report, each missing pack or icon once. */
export interface IconReport {
  diagnostics: Diagnostic[];
  line?: number;
  source?: 'code' | 'meta';
}

const reported = new WeakMap<Diagnostic[], Set<string>>();
function report(to: IconReport | undefined, key: string, d: () => Diagnostic): void {
  if (!to) return;
  let seen = reported.get(to.diagnostics);
  if (!seen) reported.set(to.diagnostics, (seen = new Set()));
  if (seen.has(key)) return;
  seen.add(key);
  to.diagnostics.push(d());
}

export interface IconImage extends IconRef {
  status: 'ready' | 'loading' | 'missing';
}

/**
 * The image a canonical icon name draws (`tabler:car`): the icon in `color`, an empty box while it loads, the "?"
 * placeholder when it is missing (with `icon.unknown` in the report; a Font Awesome look-alike adds `icon.fa-fallback`).
 */
export function iconImage(icons: IconLookup, name: string, o: { color?: string; size?: number; report?: IconReport } = {}): IconImage {
  const [pack, icon] = splitIconName(name);
  const r = icons.get(name);
  const extra = (): Partial<Pick<Diagnostic, 'source'>> => (o.report?.source ? { source: o.report.source } : {});
  if (r.status === 'ready') {
    if (r.fallback)
      report(o.report, `fa:${name}`, () => diag('info', 'icon.fa-fallback', `"${name}" is drawn with the built-in look-alike "${r.fallback}" (no Font Awesome icon pack is registered)`, o.report?.line, { params: { name, fallback: r.fallback! }, ...extra() }));
    return { status: 'ready', href: iconUrl(r.icon, o.color, o.size), name: icon };
  }
  if (r.status === 'loading') return { status: 'loading', href: ICON_LOADING_URL, name: icon };
  report(o.report, r.reason === 'pack' || r.reason === 'failed' ? `pack:${pack}` : `icon:${name}`, () =>
    diag('warning', 'icon.unknown', MISSING_TEXT[r.reason](name, pack), o.report?.line, { params: { name, pack, reason: r.reason }, ...extra() }));
  return { status: 'missing', href: iconPlaceholderUrl(), name: icon };
}

/**
 * The resolver `parseInline` takes (core/text/rich.ts): label tokens of registered packs and Font Awesome become icon
 * runs in `color`, other tokens stay text. `ctx` is the render context (its `icons`).
 */
export function iconResolver(ctx: { icons: IconLookup }, color?: string, size?: number, to?: IconReport): IconResolver {
  return (token) => {
    const name = ctx.icons.resolve(token, 'token');
    if (!name) return null;
    const o: { color?: string; size?: number; report?: IconReport } = {};
    if (color !== undefined) o.color = color;
    if (size !== undefined) o.size = size;
    if (to) o.report = to;
    const { href, name: n } = iconImage(ctx.icons, name, o);
    return { href, name: n };
  };
}

export interface DrawIcon {
  /** Top-left and size of the icon's box (the icon is fitted into it, centred). */
  box: Rect;
  /** How the reference is written (default `node`: `pack:name`, `fa:fa-car`). */
  form?: IconForm;
  /** The item's colour (monochrome icons take it). */
  color?: string;
  /** Where diagnostics point. */
  line?: number;
  source?: 'code' | 'meta';
}

/**
 * An icon reference drawn into a box (icon nodes, mindmap icons): the icon, the loading box or the placeholder; the
 * diagnostics go into the render's report (`RenderEnv.diagnostics`).
 */
export function drawIcon(env: { ctx: { icons: IconLookup }; diagnostics: Diagnostic[] }, written: string, o: DrawIcon): SceneNode[] {
  const to: IconReport = { diagnostics: env.diagnostics };
  if (o.line !== undefined) to.line = o.line;
  if (o.source) to.source = o.source;
  const name = env.ctx.icons.resolve(written, o.form ?? 'node');
  const size = Math.min(o.box.w, o.box.h);
  let img: IconImage;
  if (name) {
    const io: { color?: string; size?: number; report?: IconReport } = { size, report: to };
    if (o.color !== undefined) io.color = o.color;
    img = iconImage(env.ctx.icons, name, io);
  } else {
    const shown = written.length > 60 ? `${written.slice(0, 57)}…` : written;
    report(to, `icon:${written}`, () => diag('warning', 'icon.unknown', `"${shown}" is not an icon name`, o.line, { params: { name: shown, pack: '', reason: 'icon' }, ...(o.source ? { source: o.source } : {}) }));
    img = { status: 'missing', href: iconPlaceholderUrl(), name: shown };
  }
  const attrs = { x: o.box.x, y: o.box.y, width: o.box.w, height: o.box.h, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': img.name };
  return [image(img.href, { ...attrs, class: `mmdx-icon${img.status === 'ready' ? '' : ` mmdx-icon-${img.status}`}` })];
}
