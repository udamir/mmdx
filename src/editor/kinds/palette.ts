// Shapes-menu content of the edit kinds: the palette item type and the fixed icons the kinds' palettes use (prototype
// app.js `PALETTE_ITEMS`, `blockIcon`, `NOTE_ICON`, `TABLE_ICON`). Icons are fixed constants built with createElementNS.
import type { StyleProps } from '../../core/style.js';
import type { ItemKind } from '../../core/types.js';
import { s } from '../../ui/h.js';
import { shapePreview } from '../../ui/shape-preview.js';

export interface PaletteItem {
  key: string;
  /** "Name — hint": the menu shows the name, the tooltip both. */
  label: string;
  icon: () => SVGElement;
  /** Preset the item is added in (preset submenus). */
  preset?: string;
}

export type PaletteEntry = PaletteItem | { sep: true };

export const isItem = (e: PaletteEntry): e is PaletteItem => !('sep' in e);

/** What the Shapes dock button offers in a diagram type. */
export interface PaletteSpec {
  /** `menu`: the Shapes menu of `items`; `grid`: the first item's preset grid right away (ER tables). */
  mode: 'menu' | 'grid';
  /** Menu title, or the grid's heading. */
  title: string;
  items: readonly PaletteEntry[];
  /** An item's presets submenu: the item kind whose presets it lists, the shape its previews draw, which presets fit (null: none). */
  presets(item: PaletteItem): { kind: ItemKind; shape?: string; fits?(preset: StyleProps | undefined): boolean } | null;
}

const icon30 = (stroke: string, ...children: SVGElement[]): SVGElement =>
  s('svg', { viewBox: '0 0 32 32', width: '30', height: '30', fill: 'none', stroke: 'currentColor', 'stroke-width': stroke, 'aria-hidden': 'true' }, ...children);

export const blockIcon = (t: string) => (): SVGElement =>
  icon30('1.5',
    s('rect', { x: '3', y: '5', width: '26', height: '22', rx: '2' }),
    s('path', { d: 'M3 11.5h17l-3 -6.5', 'stroke-width': '1.2' }),
    s('text', { x: '16', y: '22', 'text-anchor': 'middle', 'font-size': '8.5', 'font-weight': '700', 'font-family': 'sans-serif', fill: 'currentColor', stroke: 'none' }, t));

export const noteIcon = (): SVGElement => icon30('1.6', s('path', { d: 'M6 6h20v14l-6 6H6z' }), s('path', { d: 'M20 26v-6h6M10 12h12M10 16h8' }));

export const tableIcon = (): SVGElement =>
  icon30('1.6', s('rect', { x: '4', y: '6', width: '24', height: '20', rx: '3' }), s('path', { d: 'M4 12h24M4 17.5h24M4 22h24M13 12v14' }));

export const shapeIcon = (shape: string) => (): SVGElement => shapePreview(shape);
