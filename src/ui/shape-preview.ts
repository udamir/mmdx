// Shape outlines and preset-submenu sizing, shared by the style toolbar, the Shapes menu and the theme editor. Kept
// apart from the toolbar so the editor can load the toolbar on first selection (§R5).
import { patchChildren } from '../dom/patch.js';
import { knownShape } from '../core/shapes/registry.js';
import { s } from './h.js';

/** Participant shape names that are not catalogue names. */
const PREVIEW_NAME: Readonly<Record<string, string>> = { box: 'rect' };

/** The text block has no outline: its preview is a "T" (32 × 32 stroke path). */
const TEXT_GLYPH = 'M8 10V7h16v3M16 7v18M12 25h8';

/**
 * Outline of a node / participant shape (shape pickers, theme editor shape tabs, the Shapes menu): the catalogue's own
 * drawing at the shape's default size, scaled into the icon with a 1.8 px stroke, so a preview cannot drift from the canvas
 * (the borderless text block: a "T"; an unknown name: an empty icon).
 */
export function shapePreview(shape: string, size = 30): SVGSVGElement {
  if (shape === 'text') {
    return s('svg', { 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 32 32', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor',
      'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s('path', { d: TEXT_GLYPH })) as SVGSVGElement;
  }
  const def = knownShape(PREVIEW_NAME[shape] ?? shape);
  if (!def) return s('svg', { 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 32 32', width: String(size), height: String(size) }) as SVGSVGElement;
  const { w, h } = def.size;
  const side = Math.max(w * 1.15, h * 1.3);
  const el = s('svg', { 'aria-hidden': 'true', focusable: 'false', viewBox: `${-side / 2} ${-side / 2} ${side} ${side}`, width: String(size), height: String(size), 'stroke-linejoin': 'round' }) as SVGSVGElement;
  const k = side / 32;
  patchChildren(el, def.draw({ x: 0, y: 0, w, h }, { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 * k, radius: 0 }, {}));
  return el;
}

// Preset submenus size themselves: 2–5 columns × 2–5 visible rows, as the free space allows, but never larger than
// the presets need (2 presets → one row of 2). More presets than fit → it scrolls.
const PP_TILE = 74, PP_ROW = 64, PP_GAP = 6, PP_PAD_W = 26, PP_PAD_H = 56; // PAD: popover padding + title

/** Sizes a preset submenu (`--cols`, `--rows`) for its `.pp-item` count and the room; returns its size. */
export function fitPresetGrid(sub: HTMLElement, availW: number, availH: number): { w: number; h: number } {
  const n = sub.querySelectorAll('.pp-item').length;
  const clamp = (v: number): number => Math.max(2, Math.min(5, v));
  const maxCols = clamp(Math.floor((availW - PP_PAD_W + PP_GAP) / (PP_TILE + PP_GAP)));
  const maxRows = clamp(Math.floor((availH - PP_PAD_H + PP_GAP) / (PP_ROW + PP_GAP)));
  let cols = Math.min(maxCols, Math.max(2, Math.ceil(Math.sqrt(n))));
  while (Math.ceil(n / cols) > maxRows && cols < maxCols) cols++;
  cols = Math.max(2, Math.min(cols, n)); // at least 2 wide, so the title fits
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(n / cols)));
  sub.style.setProperty('--cols', String(cols));
  sub.style.setProperty('--rows', String(rows));
  return { w: cols * PP_TILE + (cols - 1) * PP_GAP + PP_PAD_W, h: rows * PP_ROW + (rows - 1) * PP_GAP + PP_PAD_H };
}
