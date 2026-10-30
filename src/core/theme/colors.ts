// Theme-aware colours (A.8 row 71).
//
// A colour value in a theme or in item metadata can be:
//   "#d4e63a"          a literal colour — the same in every theme
//   "@lime"            a palette colour — each theme has its own "lime"
//   "@lime~+12,-5,+8"  a custom colour: the palette colour shifted by hue / saturation / lightness — in every
//                      theme the same shift is applied to that theme's "lime" ("=210" instead of a hue shift
//                      when the palette colour is a grey: the hue is then kept as is).
// Anything else ("none", "transparent", rgba(...)) passes through unchanged.
import { COLOR_KEYS } from '../meta/sanitize.js';
import { isColorLiteral } from '../validate.js';
import type { ResolvedTheme } from './types.js';

export type Palette = Readonly<Record<string, string>>;
export type Rgb = [number, number, number];
export type Hsl = [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const REL = /^@([\w-]+)~(=?[+-]?[\d.]+),([+-]?[\d.]+),([+-]?[\d.]+)$/;

export const isColorRef = (v: unknown): v is string => typeof v === 'string' && (v[0] === '@' || REL.test(v));
export const refName = (v: unknown): string | null => (typeof v === 'string' && v[0] === '@' ? v.slice(1).split('~')[0]! : null);

export function hexToRgb(hex: string | null | undefined): Rgb | null {
  if (!hex || !HEX.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl([r, g, b]: Rgb): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
export function hslToRgb([h, s, l]: Hsl): Rgb {
  h = (((h % 360) + 360) % 360) / 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number): number => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
// Callers check HEX first.
const hexToHsl = (hex: string): Hsl => rgbToHsl(hexToRgb(hex)!);
const hslToHex = (hsl: Hsl): string => rgbToHex(...hslToRgb(hsl));

const GREY = 6; // saturation (%) below which a colour counts as grey: its hue means nothing
const r1 = (x: number): number => Math.round(x * 10) / 10;
const sign = (x: number): string => (x >= 0 ? `+${r1(x)}` : `${r1(x)}`);

/**
 * Resolves a colour value against a theme palette (basePalette: fallback for names the theme lacks).
 * Non-references pass through; an unknown name resolves to the bare name (prototype behaviour: `@red` → `red`).
 */
export function resolveColor(v: string, palette?: Palette | null, basePalette?: Palette | null): string;
export function resolveColor(v: unknown, palette?: Palette | null, basePalette?: Palette | null): unknown;
export function resolveColor(v: unknown, palette?: Palette | null, basePalette: Palette | null | undefined = palette): unknown {
  if (typeof v !== 'string' || v[0] !== '@') return v;
  const m = REL.exec(v);
  const name = m ? m[1]! : v.slice(1);
  const c = (palette && Object.hasOwn(palette, name) ? palette[name] : undefined) ?? (basePalette && Object.hasOwn(basePalette, name) ? basePalette[name] : undefined);
  if (!m) return c ?? name;
  if (!c || !HEX.test(c)) return c ?? name;
  const [h, s, l] = hexToHsl(c);
  const hue = m[2]![0] === '=' ? Number(m[2]!.slice(1)) : h + Number(m[2]);
  return hslToHex([hue, s + Number(m[3]), l + Number(m[4])]);
}

/**
 * Encodes a colour picked while `palette` is active so that it follows other themes: the nearest palette colour
 * plus the shift from it. Exact in the theme it was picked in; other themes shift their own version of it.
 */
export function relativeColor(hex: string, palette?: Palette | null): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let best: { name: string; c: string; d: number } | null = null;
  for (const [name, c] of Object.entries(palette ?? {})) {
    const p = hexToRgb(c);
    if (!p) continue;
    const d = (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2;
    if (!best || d < best.d) best = { name, c, d };
  }
  if (!best) return hex;
  if (best.d === 0) return `@${best.name}`;
  const [ph, ps, pl] = hexToHsl(best.c), [th, ts, tl] = hexToHsl(hex);
  const dh = ((th - ph + 540) % 360) - 180;
  const hue = ps < GREY ? `=${r1(th)}` : sign(dh);
  return `@${best.name}~${hue},${sign(ts - ps)},${sign(tl - pl)}`;
}

/** Deep-resolves every colour reference in a (theme) object; `palette` sections are left as they are. */
export function resolveAll<T>(obj: T, palette?: Palette | null, basePalette?: Palette | null): T {
  return resolveDeep(obj, palette, basePalette ?? palette, null) as T;
}

/**
 * Like `resolveAll`, but only for colour keys (COLOR_KEYS), and a colour that does not resolve to a literal is
 * removed rather than passed on — a label that starts with `@` is not touched, and `@missing~+1,+1,+1` cannot
 * reach the SVG.
 */
export function resolveThemeColors<T>(obj: T, palette?: Palette | null, basePalette?: Palette | null): T {
  return resolveDeep(obj, palette, basePalette ?? palette, COLOR_KEYS) as T;
}

const DROP = Symbol('drop');
function resolveDeep(obj: unknown, palette: Palette | null | undefined, base: Palette | null | undefined, only: ReadonlySet<string> | null, key?: string): unknown {
  if (Array.isArray(obj)) return obj.map((x) => resolveDeep(x, palette, base, only, key));
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const r = k === 'palette' ? v : resolveDeep(v, palette, base, only, k);
      if (r !== DROP) out[k] = r;
    }
    return out;
  }
  if (!only) return resolveColor(obj, palette, base);
  if (key === undefined || !only.has(key) || typeof obj !== 'string') return obj;
  const r = resolveColor(obj, palette, base);
  return isColorLiteral(r) ? r : DROP;
}

/**
 * Colour resolver for one rendering: `@name` / `@name~…` against the theme palette, then the diagram's own palette
 * (it overrides baseline names the theme lacks), then the baseline palette (`%%@ style.palette <name> {"color":…}`, row 88). Literals pass through.
 * Returns undefined for anything that does not end up as a valid colour literal.
 */
export function createColorResolver(theme: Pick<ResolvedTheme, 'palette' | 'basePalette'>, diagramPalette?: Readonly<Record<string, string>>): (v: unknown) => string | undefined {
  // Diagram palette entries may themselves be references to the theme palette: resolve them once, up front.
  const own: Record<string, string> = {};
  for (const [name, c] of Object.entries(diagramPalette ?? {})) {
    const r = resolveColor(c, theme.palette, theme.basePalette);
    if (isColorLiteral(r)) own[name] = r;
  }
  // prototype order: the theme's own palette, then the diagram palette, then baseline names the theme lacks
  const merged: Record<string, string> = { ...theme.basePalette, ...own, ...theme.palette };
  return (v) => {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    const r = s[0] === '@' ? resolveColor(s, merged) : s;
    return isColorLiteral(r) ? r.trim() : undefined;
  };
}

/** `meta.styles.palette` → name → colour, keeping only entries with a valid `color`. */
export function diagramPaletteOf(styles: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const pal = styles?.['palette'];
  for (const [name, e] of Object.entries(pal ?? {})) if (typeof e['color'] === 'string') out[name] = e['color'];
  return out;
}
