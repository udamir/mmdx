// Shape outlines and preset-submenu sizing, shared by the style toolbar, the Shapes menu and the theme editor. Kept
// apart from the toolbar so the editor can load the toolbar on first selection (§R5).
import { s } from './h.js';

const SHAPE_ICON: Readonly<Record<string, string>> = {
  rect: '<rect x="3" y="7" width="26" height="18" rx="2"/>', rounded: '<rect x="3" y="7" width="26" height="18" rx="6"/>',
  box: '<rect x="3" y="7" width="26" height="18" rx="4"/>', stadium: '<rect x="3" y="8" width="26" height="16" rx="8"/>',
  circle: '<circle cx="16" cy="16" r="10"/>', doublecircle: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="7.5"/>',
  diamond: '<path d="M16 4l12 12-12 12L4 16z"/>', hexagon: '<path d="M9 7h14l6 9-6 9H9l-6-9z"/>',
  parallelogram: '<path d="M8 8h21l-5 16H3z"/>', trapezoid: '<path d="M9 8h14l6 16H3z"/>',
  cylinder: '<path d="M7 9v14c0 2 4 3.5 9 3.5s9-1.5 9-3.5V9"/><ellipse cx="16" cy="9" rx="9" ry="3.5"/>',
  database: '<path d="M7 9v14c0 2 4 3.5 9 3.5s9-1.5 9-3.5V9"/><ellipse cx="16" cy="9" rx="9" ry="3.5"/>',
  hcyl: '<path d="M9 9h14M9 23h14"/><ellipse cx="9" cy="16" rx="3.5" ry="7"/><ellipse cx="23" cy="16" rx="3.5" ry="7"/>',
  document: '<path d="M4 7h24v15c-6-4-10 4-24 0z"/>', card: '<path d="M10 7h18v18H4V13z"/>',
  subroutine: '<rect x="3" y="7" width="26" height="18" rx="1"/><path d="M8 7v18M24 7v18"/>',
  asymmetric: '<path d="M3 7h26v18H3l6-9z"/>',
  actor: '<circle cx="16" cy="8" r="3.5"/><path d="M16 11.5v8M10 15h12M16 19.5l-5 7M16 19.5l5 7"/>',
};

/** An `<svg>` with trusted constant markup inside (SHAPE_ICON bodies only). */
function svgMarkup(attrs: Record<string, string>, markup: string): SVGSVGElement {
  const el = s('svg', { 'aria-hidden': 'true', focusable: 'false', ...attrs }) as SVGSVGElement;
  el.innerHTML = markup; // constant icon bodies only
  return el;
}

/** Outline of a node / participant shape (shape pickers, theme editor shape tabs). */
export function shapePreview(shape: string, size = 30): SVGSVGElement {
  return svgMarkup({ viewBox: '0 0 32 32', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' }, SHAPE_ICON[shape] ?? '');
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
