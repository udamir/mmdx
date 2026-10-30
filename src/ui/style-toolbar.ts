// Floating, Miro-style context toolbar shown above the selected element (A.7 rows 58–60; prototype toolbar.js).
// The host (editor canvas, theme editor) supplies a `ToolbarApi` that reads effective styles and writes overrides;
// the toolbar never touches the document itself.
//
// Production changes against the prototype: listeners are scoped to the host's root node (shadow root) and removed by
// destroy(); every string goes through the I18n given in the options; buttons carry names and shortcut hints, menus
// follow the ARIA menu pattern, Esc closes the open popover and returns focus to its button. No markup is built from
// data: icons are fixed constants, colours go through setAttribute / CSSOM.
import { fitPresetGrid, shapePreview } from './shape-preview.js';
import { TOOLBAR_MESSAGES } from './messages/toolbar.js';
import type { Rect } from '../core/types.js';
import { h, s } from './h.js';
import { createI18n, registerMessages, type I18n } from './i18n.js';
import { FONTS } from './fonts.js';
import { formatKeys } from './shortcuts.js';

// ---- public types --------------------------------------------------------------------------------------------------

export type ToolbarControl =
  | 'shape' | 'font' | 'size' | 'bold' | 'align' | 'link' | 'textColor' | 'border' | 'fill' | 'line' | 'arrows'
  | 'routing' | 'lock' | 'paint' | 'group' | 'arrange' | 'activate' | 'editGroup' | 'ungroup' | 'delete' | 'order'
  | 'layer' | 'presets' | 'reset' | 'more' | 'selection' | 'italic' | 'underline' | 'tableStyle' | 'wrap';

/** Which controls a kind of item gets, and which style keys they edit. */
export interface KindSpec {
  groups: readonly (readonly ToolbarControl[])[];
  /** Style key edited by the size field (fontSize, labelSize, titleSize, attrSize). */
  size?: string;
  /** Style key toggled by Bold. */
  bold?: string;
  /** Style key of the text colour. */
  text?: string;
  /** Shapes offered by the shape picker (none: stacked style only). */
  shapes?: readonly string[];
  shapeKey?: string;
}

export interface ToolbarSelection {
  kind: string;
  id: string;
}

/** One kind of item in a multi-selection (the selection counter's type filter). */
export interface SelectionType {
  kind: string;
  count: number;
  /** False: the type filter took this kind out of the selection; it can be put back. */
  selected: boolean;
}

export interface PaletteColor {
  name: string;
  value: string;
}

export interface LayerChoice {
  id: string;
  name: string;
  hidden: boolean;
}

export type ArrangeOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist';

/**
 * What the toolbar needs from its host. The same contract as the prototype's `api` object (prototype app.js wires
 * it for the canvas, theme-editor.js for the theme tiles). Optional members switch their controls off.
 */
export interface ToolbarApi {
  /** The item the toolbar edits (null: hidden). */
  selection(): ToolbarSelection | null;
  /** Edit mode with a supported diagram. */
  editable(): boolean;
  /**
   * Size of the selection (> 1 shows the multi-selection button set, or the button set of the selected kind applied
   * to every item when they are all of one kind, see `selectionTypes`).
   */
  multiCount(): number;
  /**
   * Kinds of item in a multi-selection with their counts, including kinds the type filter took out. Non-empty: the
   * bar starts with the selection counter, whose popover lists these kinds with checkboxes.
   */
  selectionTypes?(): SelectionType[] | null;
  /** The counter's type filter: puts a kind back into the selection, or takes it out. */
  setTypeSelected?(kind: string, on: boolean): void;
  /** Effective value of a style key, colour references resolved. */
  eff(key: string): unknown;
  /** Effective value as stored (palette references kept). */
  effRaw?(key: string): unknown;
  /** Writes one key, or several keys at once (`undefined` removes an override). */
  set(key: string | Readonly<Record<string, unknown>>, value?: unknown): void;
  /** End of a continuous edit (slider released): one undo step. */
  commit?(): void;
  /** Theme palette, as stored names → colours. */
  palette(): PaletteColor[];
  /** The diagram's own palette (editor); with addLocalColor the colour pickers get "+". */
  localPalette?(): PaletteColor[];
  /** Adds a colour to the diagram palette and returns its name. */
  addLocalColor?(hex: string): string;
  removeLocalColor?(name: string): void;
  /** A free colour stored relative to the nearest palette colour (theme editor: `relativeColor`). */
  customColor?(hex: string): string;
  themeFont(): string;
  themeFontName(): string;
  /** The Mermaid arrow ends of the selected edge ("Use Mermaid arrows"). */
  edgeEnds?(): { start?: string | undefined; end?: string | undefined };
  /** Selection box in host coordinates; null hides the bar (scrolled away). */
  anchorRect(): Rect | null;
  /** Free horizontal strip of the host [left, right] (not over side panels). */
  hBounds?(): [number, number];
  diagramType?(): string | null | undefined;
  // item actions
  isLocked?(): boolean;
  toggleLock?(): void;
  isPainting?(): boolean;
  togglePaint?(): void;
  canGroup?(): { ok: boolean; reason?: string };
  group?(): void;
  ungroup?(): void;
  arrange?(op: ArrangeOp): void;
  activation?(): { participant: string; removed?: boolean; reason?: string } | null;
  toggleActivation?(): void;
  groupEditing?(): string | null | undefined;
  editGroup?(): void;
  del?(): void;
  order?(): { index: number; count: number; labels: readonly [string, string] | readonly string[] } | null;
  orderPreview?(index: number): void;
  orderCommit?(): void;
  layers?(): LayerChoice[];
  currentLayer?(): string | null;
  setLayer?(id: string): void;
  newLayer?(): void;
  /** Fills the preset picker: preview tiles into `grid`, header buttons into `actions`; `done` closes. */
  renderPresets?(grid: HTMLElement, done: () => void, actions: HTMLElement): void;
  preset?(): string;
  presets?(): string[];
  setPreset?(name: string): void;
  canReset?(): boolean;
  reset?(): void;
  copy?(): void;
  duplicate?(): void;
  canCopy?(): boolean;
  savePreset?(): void;
  canSavePreset?(): boolean;
  /** "All properties…": opens the full property list. */
  inspect?(): void;
  bendCount?(): number;
  hasOwnCurve?(): boolean;
  resetCurve?(): void;
}

export interface ToolbarOptions {
  /** Controls to leave out (the theme editor has no layers, order, links…). */
  exclude?: readonly ToolbarControl[];
  /** Adds a "back to the inherited style" button at the end. */
  reset?: boolean;
  /** Per-kind overrides of the button sets. */
  kinds?: Readonly<Record<string, KindSpec>>;
  i18n?: I18n;
}

export interface ToolbarHandle {
  /** Rebuilds the buttons for the current selection (keeps an open popover open). */
  refresh(): void;
  /** Moves the bar above the selection. */
  place(): void;
  /** Closes the open popover. */
  close(returnFocus?: boolean): void;
  hide(): void;
  /** True while one of its popovers is open (hosts use it for their Esc order). */
  isOpen(): boolean;
  destroy(): void;
  readonly el: HTMLElement;
}

// ---- constants -----------------------------------------------------------------------------------------------------

const SIZES = [8, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 64];
const STACKABLE = new Set(['node', 'group', 'participant', 'entity']);
export const NODE_SHAPES = ['rect', 'rounded', 'stadium', 'circle', 'diamond', 'hexagon', 'parallelogram', 'trapezoid', 'cylinder', 'hcyl', 'document', 'card', 'subroutine', 'doublecircle', 'asymmetric'] as const;
export const PARTICIPANT_SHAPES = ['box', 'rounded', 'stadium', 'database', 'hcyl', 'actor'] as const;
const DASHES: readonly (readonly [string, string])[] = [['none', 'solid'], ['6 4', 'dashed'], ['1.5 4', 'dotted']];
const ARROWS = ['none', 'open', 'filled', 'arrow', 'circle', 'dot', 'cross'] as const;
const ROUTINGS = ['curved', 'orthogonal', 'straight'] as const;

type MutableSpec = { groups: ToolbarControl[][] } & Omit<KindSpec, 'groups'>;

/** Controls that only make sense for one item: left out when the same kind's bar edits several items at once. */
const SINGLE_ONLY: ReadonlySet<ToolbarControl> = new Set(['order', 'editGroup', 'ungroup']);

/** Connector kinds: no box to align or group (two messages can still become a process). */
const LINE_KINDS: ReadonlySet<string> = new Set(['edge', 'rel', 'message']);

/**
 * A kind's button set for several items of that kind (bulk edit): its own controls minus the single-item ones,
 * plus the multi-selection actions just before its last segment (align & distribute and group for boxes, process).
 */
export function bulkSpec(kind: string, sp: KindSpec): KindSpec {
  const groups = sp.groups.map((g) => g.filter((c) => !SINGLE_ONLY.has(c))).filter((g) => g.length);
  groups.splice(Math.max(0, groups.length - 1), 0, LINE_KINDS.has(kind) ? ['activate'] : ['arrange', 'group', 'activate']);
  return { ...sp, groups };
}

/** Button sets per kind (prototype KIND plus the order / layer / presets rearrangement done at load). */
function buildKinds(): Readonly<Record<string, KindSpec>> {
  const K: Record<string, MutableSpec> = {
    node: { groups: [['shape', 'font', 'size', 'bold', 'align', 'link'], ['textColor'], ['border', 'fill'], ['paint', 'lock', 'delete', 'more']], size: 'fontSize', bold: 'fontWeight', text: 'text', shapes: NODE_SHAPES },
    group: { groups: [['shape', 'font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['editGroup', 'ungroup', 'paint', 'lock', 'delete', 'more']], size: 'titleSize', bold: 'titleWeight', text: 'titleColor' },
    edge: { groups: [['line', 'arrows', 'routing'], ['font', 'size', 'bold', 'textColor'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    rel: { groups: [['line', 'routing'], ['font', 'size', 'bold', 'textColor'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    participant: { groups: [['shape', 'font', 'size', 'bold', 'wrap'], ['textColor'], ['border', 'fill'], ['paint', 'lock', 'delete', 'more']], size: 'fontSize', bold: 'fontWeight', text: 'text', shapes: PARTICIPANT_SHAPES, shapeKey: 'shape' },
    message: { groups: [['line', 'arrows'], ['font', 'size', 'bold', 'textColor'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    note: { groups: [['font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['paint', 'delete', 'more']], size: 'fontSize', bold: 'fontWeight', text: 'text' },
    block: { groups: [['font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['paint', 'delete', 'more']], size: 'labelSize', bold: 'fontWeight', text: 'labelColor' },
    box: { groups: [['textColor'], ['border', 'fill'], ['ungroup', 'delete']], text: 'text' },
    multi: { groups: [['font', 'size', 'bold'], ['textColor'], ['border', 'fill'], ['arrange', 'group', 'activate'], ['delete']], size: 'fontSize', bold: 'fontWeight', text: 'text' },
    entity: { groups: [['shape', 'tableStyle', 'font', 'size', 'bold', 'link'], ['textColor'], ['border', 'fill'], ['paint', 'lock', 'delete', 'more']], size: 'attrSize', bold: 'titleWeight', text: 'text' },
    // only styled in the theme editor
    lifeline: { groups: [['line']] },
    activation: { groups: [['border', 'fill']] },
  };
  const WITH_PRESETS = new Set(['node', 'group', 'edge', 'rel', 'participant', 'message', 'block', 'box', 'note', 'entity']);
  for (const [k, spec] of Object.entries(K)) {
    if (k === 'multi') continue;
    // every single-item toolbar gets z-order and layer just before its last segment
    spec.groups.splice(spec.groups.length - 1, 0, ['order', 'layer']);
    // presets right after Shape (or first, for items without a shape)
    if (WITH_PRESETS.has(k)) {
      const g = spec.groups[0]!;
      const i = g.indexOf('shape');
      g.splice(i >= 0 ? i + 1 : 0, 0, 'presets');
    }
    // delete lives in the ⋮ menu when there is one
    for (const g of spec.groups) {
      const d = g.indexOf('delete');
      if (d >= 0 && g.includes('more')) g.splice(d, 1);
    }
  }
  K['multi']!.groups.splice(K['multi']!.groups.length - 1, 0, ['layer']);
  return K;
}

/** Default button sets per item kind (and `multi`). */
export const TOOLBAR_KINDS: Readonly<Record<string, KindSpec>> = buildKinds();

// Icon bodies: a fixed, trusted set of SVG markup (never built from data).
const ICON: Readonly<Record<string, string>> = {
  shape: '<rect x="4.5" y="4.5" width="15" height="15" rx="4"/>',
  bold: '<path d="M8 5h5a3.2 3.2 0 0 1 0 6.4H8zM8 11.4h6a3.3 3.3 0 0 1 0 6.6H8z" stroke-width="2.2"/><path d="M5 21.5h14" stroke-width="1.6"/>',
  center: '<path d="M5 6h14M8 10h8M5 14h14M8 18h8"/>',
  wrap: '<path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4"/><path d="M15 16l-2 2 2 2M4 18h5"/>',
  left: '<path d="M5 6h14M5 10h9M5 14h14M5 18h9"/>',
  right: '<path d="M5 6h14M10 10h9M5 14h14M10 18h9"/>',
  paint: '<path d="M5 4h11a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M17 6.5h2.5v5H11v3"/><rect x="9.5" y="14.5" width="3" height="6" rx="1"/>',
  group: '<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.4"/><rect x="7" y="7" width="5" height="4.5" rx="1"/><rect x="12" y="12.5" width="5" height="4.5" rx="1"/>',
  ungroup: '<rect x="3.5" y="5" width="7" height="6" rx="1.5"/><rect x="13.5" y="13" width="7" height="6" rx="1.5"/><path d="M14 5h6.5v5M3.5 14v5.5H10" stroke-dasharray="2.5 2"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6"/>',
  process: '<rect x="10" y="5" width="4" height="14" rx="1"/><path d="M3 7h6M7 5l2 2-2 2M21 17h-6M17 15l-2 2 2 2"/>',
  layers: '<path d="M12 4l8.5 4.2L12 12.4 3.5 8.2z"/><path d="M3.5 12.2L12 16.4l8.5-4.2"/><path d="M3.5 16L12 20.2l8.5-4.2"/>',
  zorder: '<rect x="3" y="3" width="10" height="10" rx="2" stroke-dasharray="2.4 2"/><rect x="11" y="11" width="10" height="10" rx="2"/><path d="M3 18h5M6 16l2 2-2 2"/>',
  alignLeft: '<path d="M5 4v16"/><path d="M9 8h9M9 15.5h5.5" stroke-width="3"/>',
  alignHCenter: '<path d="M12 4v16"/><path d="M7 8h10M9 15.5h6" stroke-width="3"/>',
  alignRight: '<path d="M19 4v16"/><path d="M6 8h9M9.5 15.5h5.5" stroke-width="3"/>',
  alignTop: '<path d="M4 5h16"/><path d="M8 9v9M15.5 9v5.5" stroke-width="3"/>',
  alignVCenter: '<path d="M4 12h16"/><path d="M8 7v10M15.5 9v6" stroke-width="3"/>',
  alignBottom: '<path d="M4 19h16"/><path d="M8 6v9M15.5 9.5v5.5" stroke-width="3"/>',
  distH: '<path d="M4.5 5v14M19.5 5v14"/><path d="M12 8v8" stroke-width="4"/>',
  distV: '<path d="M5 4.5h14M5 19.5h14"/><path d="M8 12h8" stroke-width="4"/>',
  editGroup: '<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.2"/><path d="M9 15l1-3 5.5-5.5a1.4 1.4 0 0 1 2 2L12 14z"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4.5h4.5"/>',
  presets: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  duplicate: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5M14 11.5v5M11.5 14h5"/>',
  savePreset: '<path d="M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 19z"/><path d="M8.5 4.5v4h6v-4M12 12.5v5M9.5 15h5"/>',
  vtop: '<path d="M5 4.5h14M12 20V9M8 12.5l4-4 4 4"/>',
  vmiddle: '<path d="M5 12h14M12 3v6M9 6.5l3 3 3-3M12 21v-6M9 17.5l3-3 3 3"/>',
  vbottom: '<path d="M5 19.5h14M12 4v11M8 11.5l4 4 4-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/><path d="M4 4l16 16"/>',
  text: '<path d="M7 17l5-12 5 12M8.8 13h6.4"/>',
  arrows: '<path d="M4 12h15M14 7l5 5-5 5"/>',
  routing: '<path d="M4 18c6 0 4-12 10-12h6"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="6" r="1.6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.7-1.5"/>',
  more: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor"/>',
  up: '<path d="M7 14l5-5 5 5"/>',
  down: '<path d="M7 10l5 5 5-5"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
  italic: '<path d="M10 5h8M6 19h8M14.5 5l-5 14"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  underline: '<path d="M7 4.5v6a5 5 0 0 0 10 0v-6M5.5 20h13"/>',
  selection: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9 12.5l2 2 4-4.5"/>',
};

const ARROW_HEAD: Readonly<Record<string, string>> = {
  none: '', open: '<path d="M30 6l7 6-7 6" fill="none"/>', filled: '<path d="M29 6l9 6-9 6 2.5-6z" fill="currentColor"/>',
  arrow: '<path d="M29 6.5l9 5.5-9 5.5z" fill="currentColor"/>', circle: '<circle cx="34" cy="12" r="3.6" fill="#fff"/>',
  dot: '<circle cx="34" cy="12" r="3.2" fill="currentColor"/>', cross: '<path d="M31 9l6 6M37 9l-6 6"/>',
};
const ROUTING_PATH: Readonly<Record<string, string>> = { curved: 'M4 20C16 20 14 4 26 4h12', orthogonal: 'M4 20h16V4h18', straight: 'M4 20L38 4' };

export { fitPresetGrid, shapePreview } from './shape-preview.js';

// ---- small helpers -------------------------------------------------------------------------------------------------

/** An `<svg>` with trusted constant markup inside. */
function svgMarkup(attrs: Record<string, string>, markup: string): SVGSVGElement {
  const el = s('svg', { 'aria-hidden': 'true', focusable: 'false', ...attrs }) as SVGSVGElement;
  el.innerHTML = markup; // constant icon bodies only (ICON, SHAPE_ICON, ARROW_HEAD)
  return el;
}

function svgIcon(name: string, extra: readonly SVGElement[] = []): SVGSVGElement {
  const el = svgMarkup({ viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ICON[name] ?? '');
  el.append(...extra);
  return el;
}

const isNone = (c: unknown): boolean => !c || c === 'none' || c === 'transparent';
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const isHex6 = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);
const stackLevel = (v: unknown): number => (v === true ? 1 : Number(v) || 0);

function stackPreview(lv: number, size: number): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 26 26', width: String(size), height: String(size), fill: '#fff', stroke: 'currentColor', 'stroke-width': '1.7', 'aria-hidden': 'true' }) as SVGSVGElement;
  for (let k = lv; k >= 1; k--) el.append(s('rect', { x: String(4 + 3 * k), y: String(9 - 3 * k), width: '15', height: '12', rx: '3', fill: '#fff' }));
  el.append(s('rect', { x: '4', y: '9', width: '15', height: '12', rx: '3' }));
  return el;
}

function arrowPreview(a: string, start = false): SVGSVGElement {
  const attrs: Record<string, string> = { viewBox: '0 0 42 24', width: '42', height: '24', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' };
  if (start) attrs['transform'] = 'scale(-1,1)';
  return svgMarkup(attrs, `<path d="M4 12h${a === 'none' ? 34 : 30}"/>${ARROW_HEAD[a] ?? ''}`);
}

function routingPreview(r: string): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 42 24', width: '42', height: '24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }) as SVGSVGElement;
  el.append(s('path', { d: ROUTING_PATH[r] ?? '' }));
  return el;
}

function dashPreview(d: string): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 44 12', width: '44', height: '12', 'aria-hidden': 'true' }) as SVGSVGElement;
  const p = s('path', { d: 'M3 6h38', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round' });
  if (d && d !== 'none') p.setAttribute('stroke-dasharray', d.split(' ').map((n) => Number(n) * 1.6).join(' '));
  el.append(p);
  return el;
}

/** Moves focus with the arrow keys through `items` (ARIA toolbar / menu patterns). */
function arrowNav(ev: KeyboardEvent, items: HTMLElement[], keys: readonly [string, string]): boolean {
  if (ev.key !== keys[0] && ev.key !== keys[1] && ev.key !== 'Home' && ev.key !== 'End') return false;
  if (!items.length) return false;
  const active = ev.composedPath()[0] as HTMLElement;
  const i = items.indexOf(active);
  const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? items.length - 1
    : (i + (ev.key === keys[1] ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
  ev.preventDefault();
  return true;
}

// ---- the toolbar ---------------------------------------------------------------------------------------------------

/** `host` must already be in its final root (document or shadow root): outside clicks and Esc are listened for there. */
export function createToolbar(host: HTMLElement, api: ToolbarApi, opts: ToolbarOptions = {}): ToolbarHandle {
  registerMessages(TOOLBAR_MESSAGES);
  const t = (opts.i18n ?? createI18n()).t;
  const exclude = new Set<string>(opts.exclude ?? []);
  const bar = h('div', { class: 'mtb', role: 'toolbar', 'aria-label': t('tb.label'), part: 'toolbar' });
  bar.hidden = true;
  host.append(bar);
  let open: ToolbarControl | null = null;
  let sel: ToolbarSelection | null = null;
  let spec: KindSpec | null = null;
  // several items of one kind: that kind's controls, applied to every one of them
  let bulk = false;
  // the selection counter (a multi-selection, or one the type filter narrowed down)
  let counter = false;
  const bulkSpecs = new Map<KindSpec, KindSpec>();
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const root = host.getRootNode() as Document | ShadowRoot;

  const close = (returnFocus = false): void => {
    const was = open;
    open = null;
    bar.querySelectorAll('.mtb-pop').forEach((p) => p.remove());
    bar.querySelectorAll('.mtb-btn.on').forEach((b) => {
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    });
    if (returnFocus && was) bar.querySelector<HTMLElement>(`[data-c="${was}"]`)?.focus();
  };
  // outside clicks and Esc, scoped to the host's root node (its shadow root), never the document
  root.addEventListener('pointerdown', (ev) => {
    if (open && !ev.composedPath().includes(bar)) close();
  }, sig);
  root.addEventListener('keydown', (ev) => {
    const k = ev as KeyboardEvent;
    if (k.key === 'Escape' && open) {
      k.preventDefault();
      k.stopPropagation();
      close(k.composedPath().includes(bar));
    }
  }, sig);
  bar.addEventListener('keydown', (ev) => {
    const target = ev.composedPath()[0] as HTMLElement;
    if (target.closest('.mtb-pop')) {
      const menu = target.closest<HTMLElement>('[role=menu]');
      if (menu) arrowNav(ev, Array.from(menu.querySelectorAll<HTMLElement>('[role^=menuitem]:not(:disabled)')), ['ArrowUp', 'ArrowDown']);
      return;
    }
    if (target.tagName === 'INPUT') return;
    arrowNav(ev, Array.from(bar.querySelectorAll<HTMLElement>('.mtb-seg button:not(:disabled), .mtb-seg input')), ['ArrowLeft', 'ArrowRight']);
  }, sig);

  function groupsOf(sp: KindSpec): ToolbarControl[][] {
    const gs = sp.groups.map((g) => g.filter((c) => !exclude.has(c))).filter((g) => g.length);
    if (counter && !exclude.has('selection')) gs.unshift(['selection']);
    if (opts.reset) gs.push(['reset']);
    return gs;
  }

  function refresh(): void {
    sel = api.selection();
    const n = api.multiCount();
    const types = sel ? api.selectionTypes?.() ?? null : null;
    const kinds = types?.filter((x) => x.selected) ?? [];
    const own = sel ? opts.kinds?.[sel.kind] ?? TOOLBAR_KINDS[sel.kind] ?? null : null;
    bulk = n > 1 && !!own && kinds.length === 1 && kinds[0]!.kind === sel?.kind;
    counter = !!types?.length && (n > 1 || types.some((x) => !x.selected));
    if (bulk && own && sel && !bulkSpecs.has(own)) bulkSpecs.set(own, bulkSpec(sel.kind, own));
    spec = !sel ? null : bulk && own ? bulkSpecs.get(own)! : n > 1 ? TOOLBAR_KINDS['multi']! : own;
    if (!spec || !api.editable()) {
      bar.hidden = true;
      close();
      return;
    }
    const keep = open;
    // keep keyboard focus on the same control across the rebuild
    const cur = host.getRootNode();
    const focused = cur instanceof ShadowRoot || cur instanceof Document ? cur.activeElement : null;
    const focusedC = focused && bar.contains(focused) && !focused.closest('.mtb-pop') ? focused.closest<HTMLElement>('[data-c]')?.dataset['c'] : undefined;
    bar.replaceChildren(...segments(spec));
    open = null;
    bar.hidden = false;
    if (keep) {
      const b = bar.querySelector<HTMLElement>(`[data-c="${keep}"]`);
      if (b) toggle(keep, b, spec, false);
    }
    if (focusedC) bar.querySelector<HTMLElement>(`[data-c="${focusedC}"]`)?.focus();
    place();
  }

  /** The bar's segments; a segment whose controls all stay off (no api for them) is left out. */
  function segments(sp: KindSpec): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const group of groupsOf(sp)) {
      const seg = h('div', { class: 'mtb-seg', role: 'group' });
      for (const c of group) seg.append(control(c, sp));
      if (seg.querySelector('[data-c]')) out.push(seg);
    }
    return out;
  }

  // ---- buttons

  function button(name: ToolbarControl, content: Node, title: string, sp: KindSpec, menu = false): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, 'aria-haspopup': menu ? 'menu' : 'dialog', 'aria-expanded': 'false', dataset: { c: name } }, content);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggle(name, b, sp, ev.detail === 0);
    });
    return b;
  }

  function action(name: ToolbarControl, content: Node, title: string, run: () => void, o: { active?: boolean; disabled?: boolean; danger?: boolean; pressed?: boolean } = {}): HTMLButtonElement {
    const b = h('button', {
      type: 'button',
      class: 'mtb-btn' + (o.active ? ' active' : '') + (o.danger ? ' danger' : ''),
      title,
      'aria-label': title,
      dataset: { c: name },
    }, content);
    if (o.pressed !== undefined) b.setAttribute('aria-pressed', String(o.pressed));
    b.disabled = !!o.disabled;
    b.addEventListener('click', run);
    return b;
  }

  function control(c: ToolbarControl, sp: KindSpec): HTMLElement {
    const e = (k: string): unknown => api.eff(k);
    switch (c) {
      case 'shape': {
        const label = sp.shapes ? t('tb.shapeStack') : t('tb.stack');
        return button('shape', sp.shapes ? svgIcon('shape') : stackPreview(Math.max(1, stackLevel(e('stack'))), 24), label, sp);
      }
      case 'font': {
        const fam = str(e('fontFamily'));
        const label = FONTS.find((f) => f[0] === fam)?.[1] ?? (fam ? fam.split(',')[0]!.replace(/'/g, '') : api.themeFontName());
        const b = button('font', h('span', { class: 'mtb-font' }, label), t('tb.font'), sp);
        b.setAttribute('aria-label', `${t('tb.font')}: ${label}`);
        b.classList.add('wide');
        return b;
      }
      case 'size': {
        const key = sp.size ?? 'fontSize';
        const val = Math.round(num(e(key)) ?? 14);
        const wrap = h('div', { class: 'mtb-size', dataset: { c: 'size' } });
        const input = h('input', { class: 'mtb-num', type: 'text', inputMode: 'numeric', title: t('tb.fontSize'), 'aria-label': t('tb.fontSize') });
        input.value = String(val);
        input.addEventListener('change', () => setSize(sp, Math.max(6, Math.min(120, Number(input.value) || val))));
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') input.blur();
          else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
            ev.preventDefault();
            step(ev.key === 'ArrowUp' ? 1 : -1);
          }
          if (ev.key !== 'Escape') ev.stopPropagation();
        });
        const step = (dir: number): void => {
          const cur = Math.round(num(api.eff(key)) ?? 14);
          const next = dir > 0 ? SIZES.find((x) => x > cur) ?? cur + 4 : [...SIZES].reverse().find((x) => x < cur) ?? Math.max(6, cur - 2);
          setSize(sp, next);
          input.value = String(next);
        };
        const up = h('button', { type: 'button', title: t('tb.larger'), 'aria-label': t('tb.larger'), tabindex: '-1', onclick: () => step(1) }, svgIcon('up'));
        const dn = h('button', { type: 'button', title: t('tb.smaller'), 'aria-label': t('tb.smaller'), tabindex: '-1', onclick: () => step(-1) }, svgIcon('down'));
        wrap.append(input, h('div', { class: 'mtb-steps' }, up, dn));
        return wrap;
      }
      case 'bold': {
        const key = sp.bold ?? 'fontWeight';
        const on = (num(e(key)) ?? (e(key) === 'bold' ? 700 : 400)) >= 600;
        return action('bold', svgIcon('bold'), t('tb.bold'), () => {
          api.set(key, on ? 400 : 700);
          refresh();
        }, { active: on, pressed: on });
      }
      case 'align': {
        const cur = str(e('align')) || 'center';
        return button('align', svgIcon(ICON[cur] ? cur : 'center'), t('tb.textPos'), sp);
      }
      case 'link': {
        const b = button('link', svgIcon('link'), t('tb.link'), sp);
        if (e('link')) b.classList.add('active');
        return b;
      }
      case 'textColor': {
        const col = str(e(sp.text ?? 'text')) || '#1f1f1f';
        const halo = s('rect', { x: '4.5', y: '19', width: '15', height: '4', rx: '1.4', fill: 'none', 'stroke-width': '1.6', style: 'stroke:var(--halo)' });
        const bar1 = s('rect', { x: '5', y: '19.5', width: '14', height: '3', rx: '1', 'stroke-width': '0.6' });
        bar1.setAttribute('fill', col);
        bar1.setAttribute('stroke', col);
        return button('textColor', svgIcon('text', [halo, bar1]), t('tb.textColor'), sp);
      }
      case 'border': {
        const col = e('stroke');
        const w = Math.min(5, Math.max(1.5, (num(e('strokeWidth')) ?? 0) * 1.4 || 2));
        const dash = str(e('dash'));
        const el = s('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true' });
        const a = s('circle', { cx: '12', cy: '12', r: '8', fill: 'none', 'stroke-width': String(w + 3), style: 'stroke:var(--halo)' });
        const b = s('circle', { cx: '12', cy: '12', r: '8', fill: 'none', 'stroke-width': String(w + 1) });
        b.setAttribute('stroke', isNone(col) ? 'var(--faint)' : str(col));
        if (dash && dash !== 'none') {
          const da = dash.split(' ').map((n) => Number(n) * 1.2).join(' ');
          a.setAttribute('stroke-dasharray', da);
          b.setAttribute('stroke-dasharray', da);
        }
        el.append(a, b);
        return button('border', el, t('tb.border'), sp);
      }
      case 'fill': {
        const col = e('fill');
        const sw = isNone(col) ? h('span', { class: 'mtb-dot checker' }) : h('span', { class: 'mtb-dot', style: { background: str(col), opacity: String(num(e('fillOpacity')) ?? 1) } });
        return button('fill', sw, t('tb.fill'), sp);
      }
      case 'line': {
        const col = str(e('color'));
        const lw = Math.min(5, (num(e('width')) ?? 1.5) + 1);
        const dash = str(e('dash'));
        const el = s('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true' });
        const a = s('path', { d: 'M4 20L20 4', 'stroke-width': String(lw + 2), 'stroke-linecap': 'round', style: 'stroke:var(--halo)' });
        const b = s('path', { d: 'M4 20L20 4', 'stroke-width': String(lw), 'stroke-linecap': 'round' });
        b.setAttribute('stroke', col || 'currentColor');
        if (dash && dash !== 'none') {
          a.setAttribute('stroke-dasharray', dash);
          b.setAttribute('stroke-dasharray', dash);
        }
        el.append(a, b);
        return button('line', el, t('tb.line'), sp);
      }
      case 'arrows':
        return button('arrows', svgIcon('arrows'), t('tb.arrows'), sp);
      case 'routing':
        return button('routing', svgIcon('routing'), t('tb.routing'), sp);
      case 'lock': {
        if (!api.isLocked || !api.toggleLock) return h('span');
        const locked = api.isLocked();
        return action('lock', svgIcon(locked ? 'lock' : 'unlock'), locked ? t('tb.unlock') : t('tb.lock'), () => {
          api.toggleLock?.();
          refresh();
        }, { active: locked, pressed: locked });
      }
      case 'paint': {
        if (!api.togglePaint) return h('span');
        const on = !!api.isPainting?.();
        return action('paint', svgIcon('paint'), t('tb.paint'), () => {
          close();
          api.togglePaint?.();
          refresh();
        }, { active: on, pressed: on });
      }
      case 'group': {
        if (!api.group) return h('span');
        const g = api.canGroup?.() ?? { ok: true };
        return action('group', svgIcon('group'), g.ok ? t('tb.group', { keys: formatKeys('mod+g') }) : g.reason ?? t('tb.group', { keys: formatKeys('mod+g') }), () => api.group?.(), { disabled: !g.ok });
      }
      case 'arrange':
        return api.arrange ? button('arrange', svgIcon('alignLeft'), t('tb.arrange'), sp) : h('span');
      case 'activate': {
        const a = api.activation?.();
        if (!a) return h('span');
        const title = a.reason ?? (a.removed ? t('tb.activationRemove', { p: a.participant }) : t('tb.activationAdd', { p: a.participant }));
        return action('activate', svgIcon('process'), title, () => api.toggleActivation?.(), { active: !!a.removed, disabled: !!a.reason });
      }
      case 'editGroup': {
        if (!api.editGroup || !sel) return h('span');
        const on = api.groupEditing?.() === sel.id;
        return action('editGroup', svgIcon('editGroup'), on ? t('tb.editGroupDone') : t('tb.editGroup'), () => api.editGroup?.(), { active: on, pressed: on });
      }
      case 'ungroup':
        return api.ungroup ? action('ungroup', svgIcon('ungroup'), t('tb.ungroup', { keys: formatKeys('mod+shift+g') }), () => api.ungroup?.()) : h('span');
      case 'delete':
        return api.del ? action('delete', svgIcon('trash'), t('tb.delete', { keys: formatKeys('delete') }), () => api.del?.(), { danger: true }) : h('span');
      case 'order': {
        if (!api.order) return h('span');
        const keys = `${formatKeys('mod+[')} ${formatKeys('mod+]')}`;
        return button('order', svgIcon('zorder'), api.diagramType?.() === 'sequence' ? t('tb.orderSeq', { keys }) : t('tb.order', { keys }), sp);
      }
      case 'layer':
        return api.layers && api.setLayer ? button('layer', svgIcon('layers'), t('tb.layer'), sp, true) : h('span');
      case 'presets':
        return api.renderPresets ? button('presets', svgIcon('presets'), t('tb.presets'), sp) : h('span');
      case 'reset': {
        const can = !!api.canReset?.();
        return action('reset', svgIcon('reset'), can ? t('tb.reset') : t('tb.resetNone'), () => {
          close();
          api.reset?.();
          refresh();
        }, { disabled: !can });
      }
      case 'more':
        return button('more', svgIcon('more'), t('tb.more'), sp, true);
      case 'tableStyle':
        return button('tableStyle', svgIcon('table'), t('tb.tableStyle'), sp);
      case 'italic':
      case 'underline': {
        const on = e(c) === true;
        return action(c, svgIcon(c), t(`tb.${c}`), () => {
          api.set(c, !on);
          refresh();
        }, { active: on, pressed: on });
      }
      case 'wrap': {
        // word wrap as a switch (participants: their text has no alignment to pick)
        const on = e('wrap') === true;
        return action('wrap', svgIcon('wrap'), t('tb.wrapTip'), () => {
          api.set('wrap', on ? undefined : true);
          refresh();
        }, { active: on, pressed: on });
      }
      case 'selection': {
        const n = api.multiCount();
        const title = t('tb.selection', { n });
        const b = button('selection', h('span', { class: 'mtb-count' }, svgIcon('selection'), h('b', null, String(n))), title, sp);
        b.classList.add('wide');
        return b;
      }
    }
  }

  function setSize(sp: KindSpec, v: number): void {
    if (sel?.kind === 'entity' && (api.multiCount() < 2 || bulk)) api.set({ attrSize: v, titleSize: v + 1 });
    else api.set(sp.size ?? 'fontSize', v);
  }

  // ---- popovers

  function toggle(name: ToolbarControl, btn: HTMLElement, sp: KindSpec, focusIn = true): void {
    if (open === name) {
      close(true);
      return;
    }
    close();
    open = name;
    btn.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    const pop = h('div', { class: 'mtb-pop', role: 'dialog', 'aria-label': btn.getAttribute('aria-label') ?? name });
    pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    bar.append(pop);
    fillPop(pop, name, sp);
    const bl = btn.offsetLeft + (btn.parentElement?.offsetLeft ?? 0);
    pop.style.left = `${Math.max(0, Math.min(bl - 20, bar.clientWidth - pop.offsetWidth))}px`;
    fitPop(pop);
    if (focusIn) queueMicrotask(() => pop.querySelector<HTMLElement>('[role^=menuitem]:not(:disabled), .on, button:not(:disabled), input')?.focus());
  }

  // Keep the popover inside the host: open below the toolbar, or above it, scrolling if needed.
  function fitPop(pop: HTMLElement): void {
    const barLeft = bar.getBoundingClientRect().left - host.getBoundingClientRect().left;
    const [lo, hi] = api.hBounds?.() ?? [8, host.clientWidth - 8];
    const maxLeft = hi - barLeft - pop.offsetWidth;
    const minLeft = lo - barLeft;
    pop.style.left = `${Math.max(minLeft, Math.min(parseFloat(pop.style.left) || 0, maxLeft))}px`;
    const H = host.clientHeight;
    const barTop = bar.getBoundingClientRect().top - host.getBoundingClientRect().top;
    const below = H - (barTop + bar.offsetHeight + 8) - 8;
    const above = barTop - 16;
    const need = pop.scrollHeight;
    if (need <= below || below >= above) {
      pop.style.top = `${bar.offsetHeight + 8}px`;
      pop.style.maxHeight = `${Math.max(160, below)}px`;
    } else {
      const hh = Math.min(need, above);
      pop.style.maxHeight = `${hh}px`;
      pop.style.top = `${-hh - 8}px`;
    }
  }

  // re-fill the open popover and the indicator icons without closing it
  function rerenderPop(name: ToolbarControl, sp: KindSpec): void {
    const pop = bar.querySelector<HTMLElement>('.mtb-pop');
    if (!pop) return;
    pop.replaceChildren();
    fillPop(pop, name, sp);
    bar.querySelectorAll('.mtb-seg').forEach((sg) => sg.remove());
    pop.before(...segments(sp));
    const b = bar.querySelector(`[data-c="${name}"]`);
    b?.classList.add('on');
    b?.setAttribute('aria-expanded', 'true');
  }

  const label = (text: string): HTMLElement => h('div', { class: 'mtb-label' }, text);

  function fillPop(pop: HTMLElement, name: ToolbarControl, sp: KindSpec): void {
    const again = (): void => rerenderPop(name, sp);
    const done = (): void => {
      close(true);
      refresh();
    }; // single-choice pickers close after a pick
    const kind = sel?.kind ?? '';
    switch (name) {
      case 'shape': {
        const key = sp.shapeKey ?? 'shape';
        if (sp.shapes) {
          pop.append(label(t('tb.shape')));
          const grid = h('div', { class: 'mtb-shapes', role: 'group', 'aria-label': t('tb.shape') });
          const cur = str(api.eff(key));
          for (const shape of sp.shapes) {
            const b = h('button', { type: 'button', class: 'mtb-shape' + (shape === cur ? ' on' : ''), title: shape, 'aria-label': shape, 'aria-pressed': String(shape === cur) }, shapePreview(shape));
            b.addEventListener('click', () => {
              api.set(key, shape);
              done();
            });
            grid.append(b);
          }
          pop.append(grid);
        }
        if (!STACKABLE.has(kind)) return;
        pop.append(label(t('tb.stack')));
        const cur = stackLevel(api.eff('stack'));
        const row = h('div', { class: 'mtb-stacks' });
        for (const [lv, text] of [[0, t('tb.single')], [1, t('tb.stacked')], [2, t('tb.double')]] as const) {
          const b = h('button', { type: 'button', class: 'mtb-stack' + (lv === cur ? ' on' : ''), 'aria-pressed': String(lv === cur) }, stackPreview(lv, 34), h('span', null, text));
          b.addEventListener('click', () => {
            api.set('stack', lv === 0 ? false : lv === 1 ? true : 2);
            done();
          });
          row.append(b);
        }
        pop.append(row);
        const inh = h('button', { type: 'button', class: 'link' }, t('tb.usePreset'));
        inh.addEventListener('click', () => {
          api.set('stack', undefined);
          done();
        });
        pop.append(inh);
        return;
      }
      case 'align': {
        const row = (key: string, values: readonly string[], def: string): HTMLElement => {
          const r = h('div', { class: 'mtb-align', role: 'group' });
          const cur = str(api.eff(key)) || def;
          for (const v of values) {
            const title = key === 'align' ? t('tb.alignH', { v: t(`tb.pos.${v}`) }) : t('tb.alignV', { v: t(`tb.pos.${v}`) });
            const b = h('button', { type: 'button', class: 'mtb-choice' + (v === cur ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': String(v === cur) },
              svgIcon(v === 'middle' ? 'vmiddle' : v === 'top' ? 'vtop' : v === 'bottom' ? 'vbottom' : v));
            b.addEventListener('click', () => {
              api.set(key, v === def ? undefined : v);
              done();
            });
            r.append(b);
          }
          return r;
        };
        pop.classList.add('narrow');
        // word wrap: the text breaks into lines that fit the shape's width
        const wrapOn = api.eff('wrap') === true;
        const wrapBtn = h('button', { type: 'button', class: 'mtb-choice mtb-wrap' + (wrapOn ? ' on' : ''), role: 'switch', 'aria-checked': String(wrapOn), title: t('tb.wrapTip') },
          svgIcon('wrap'), h('span', null, t('tb.wrap')));
        wrapBtn.addEventListener('click', () => {
          api.set('wrap', wrapOn ? undefined : true);
          done();
        });
        pop.append(row('align', ['left', 'center', 'right'], 'center'), h('hr', { class: 'mtb-hr' }), row('valign', ['top', 'middle', 'bottom'], 'middle'),
          h('hr', { class: 'mtb-hr' }), wrapBtn);
        return;
      }
      case 'order': {
        const o = api.order?.();
        const lab = label(t('tb.zindex'));
        pop.append(lab);
        if (!o || o.count < 2) {
          pop.append(h('div', { class: 'mtb-note' }, t('tb.orderNone')));
          return;
        }
        const show = (i: number): void => {
          lab.textContent = t('tb.zindexN', { n: i + 1 });
        };
        const range = h('input', { class: 'mtb-range', type: 'range', min: '0', max: String(o.count - 1), step: '1', 'aria-label': t('tb.zindex') });
        range.value = String(o.index);
        range.title = `${o.labels[0] ?? ''} ← → ${o.labels[1] ?? ''}`;
        range.addEventListener('input', () => {
          api.orderPreview?.(Number(range.value));
          show(Number(range.value));
        });
        range.addEventListener('change', () => api.orderCommit?.());
        range.addEventListener('keydown', (ev) => {
          if (ev.key !== 'Escape') ev.stopPropagation();
        });
        show(o.index);
        pop.append(range);
        return;
      }
      case 'arrange': {
        pop.classList.add('narrow');
        const n = api.multiCount();
        const grid = h('div', { class: 'mtb-arrange-grid', role: 'group' });
        const OPS: readonly (readonly [ArrangeOp, string])[] = [
          ['left', 'alignLeft'], ['hcenter', 'alignHCenter'], ['right', 'alignRight'],
          ['top', 'alignTop'], ['vcenter', 'alignVCenter'], ['bottom', 'alignBottom'],
        ];
        for (const [op, ic] of OPS) {
          const title = t(`tb.arrange.${op}`);
          grid.append(h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, onclick: () => api.arrange?.(op) }, svgIcon(ic)));
        }
        const dist = h('div', { class: 'mtb-arrange-dist', role: 'group' });
        for (const [op, ic] of [['hdist', 'distH'], ['vdist', 'distV']] as const) {
          const base = t(`tb.arrange.${op}`);
          const title = n < 3 ? t('tb.arrange.need3', { title: base }) : base;
          const b = h('button', { type: 'button', class: 'mtb-btn', title, 'aria-label': title, onclick: () => api.arrange?.(op) }, svgIcon(ic));
          b.disabled = n < 3;
          dist.append(b);
        }
        pop.append(h('div', { class: 'mtb-arrange' }, grid, dist));
        return;
      }
      case 'layer': {
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', t('tb.moveLayer'));
        pop.append(label(t('tb.moveLayer')));
        const list = h('div', { class: 'mtb-list', role: 'none' });
        const cur = api.currentLayer?.() ?? null;
        for (const l of api.layers?.() ?? []) {
          const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(l.id === cur), class: 'mtb-item mtb-layer' + (l.id === cur ? ' on' : '') },
            h('span', { class: 'dot' + (l.hidden ? ' off' : '') }), h('span', null, l.name), l.hidden ? h('em', null, t('tb.hidden')) : null);
          b.addEventListener('click', () => {
            api.setLayer?.(l.id);
            done();
          });
          list.append(b);
        }
        pop.append(list);
        if (api.newLayer) {
          const nb = h('button', { type: 'button', role: 'menuitem', class: 'link' }, t('tb.newLayer'));
          nb.addEventListener('click', () => {
            api.newLayer?.();
            done();
          });
          pop.append(nb);
        }
        return;
      }
      case 'font': {
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', t('tb.font'));
        const list = h('div', { class: 'mtb-list', role: 'none' });
        const cur = str(api.eff('fontFamily'));
        for (const [v, name0] of FONTS) {
          const text = v === '' ? t('tb.themeFontNamed', { name: api.themeFontName() }) : name0;
          const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(v === cur), class: 'mtb-item' + (v === cur ? ' on' : '') },
            h('span', { style: { fontFamily: v || api.themeFont() } }, text));
          b.addEventListener('click', () => {
            api.set('fontFamily', v || undefined);
            done();
          });
          list.append(b);
        }
        pop.append(list);
        return;
      }
      case 'link': {
        const cur = str(api.eff('link'));
        const inp = h('input', { class: 'mtb-input', type: 'url', placeholder: 'https://…', 'aria-label': t('tb.link') });
        inp.value = cur;
        const save = h('button', { type: 'button', class: 'mtb-btn mtb-ok', title: t('tb.saveLink'), 'aria-label': t('tb.saveLink') }, svgIcon('check'));
        const rm = h('button', { type: 'button', class: 'mtb-btn danger', title: t('tb.removeLink'), 'aria-label': t('tb.removeLink') }, svgIcon('unlink'));
        rm.hidden = !cur;
        save.addEventListener('click', () => {
          api.set('link', inp.value.trim() || undefined);
          close(true);
          refresh();
        });
        rm.addEventListener('click', () => {
          api.set('link', undefined);
          close(true);
          refresh();
        });
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape') return;
          ev.stopPropagation();
          if (ev.key === 'Enter') save.click();
        });
        pop.append(label(t('tb.linkLabel')), h('div', { class: 'mtb-row' }, inp, save, rm));
        queueMicrotask(() => inp.focus());
        return;
      }
      case 'textColor':
        colors(pop, api.eff(sp.text ?? 'text'), (c) => {
          api.set(sp.text ?? 'text', c);
          done();
        }, false);
        return;
      case 'fill':
        slider(pop, t('tb.opacity'), num(api.eff('fillOpacity')) ?? 1, 0, 1, 0.05, (v) => api.set('fillOpacity', v >= 1 ? undefined : v), (v) => `${Math.round(v * 100)}%`);
        colors(pop, api.eff('fill'), (c) => {
          api.set('fill', c);
          done();
        }, true);
        return;
      case 'border':
      case 'line': {
        const isLine = name === 'line';
        dashes(pop, str(api.eff('dash')) || 'none', (d) => {
          api.set('dash', d);
          again();
        });
        const wKey = isLine ? 'width' : 'strokeWidth';
        slider(pop, t('tb.thickness'), num(api.eff(wKey)) ?? 1.5, 0.5, 8, 0.5, (v) => api.set(wKey, v), (v) => `${v}px`);
        slider(pop, t('tb.opacity'), num(api.eff('strokeOpacity')) ?? 1, 0, 1, 0.05, (v) => api.set('strokeOpacity', v >= 1 ? undefined : v), (v) => `${Math.round(v * 100)}%`);
        if (!isLine && kind !== 'block') slider(pop, t('tb.corners'), num(api.eff('radius')) ?? 0, 0, 40, 1, (v) => api.set('radius', v), (v) => `${v}`);
        const cKey = isLine ? 'color' : 'stroke';
        colors(pop, api.eff(cKey), (c) => {
          api.set(cKey, c);
          done();
        }, !isLine);
        return;
      }
      case 'arrows': {
        if (kind === 'message') {
          pop.append(label(t('tb.arrowHead')));
          pop.append(choiceRow(['filled', 'open', 'arrow'], str(api.eff('arrow')), (v) => {
            api.set('arrow', v);
            done();
          }, (a) => arrowPreview(a), (a) => t(`tb.arrow.${a}`)));
          return;
        }
        const ends = api.edgeEnds?.() ?? {};
        pop.append(label(t('tb.start')));
        pop.append(choiceRow(ARROWS, str(api.eff('startArrow')) || str(ends.start), (v) => {
          api.set('startArrow', v);
          again();
        }, (a) => arrowPreview(a, true), (a) => t(`tb.arrow.${a}`)));
        pop.append(label(t('tb.end')));
        pop.append(choiceRow(ARROWS, str(api.eff('endArrow')) || str(ends.end), (v) => {
          api.set('endArrow', v);
          again();
        }, (a) => arrowPreview(a), (a) => t(`tb.arrow.${a}`)));
        const r = h('button', { type: 'button', class: 'link' }, t('tb.mermaidArrows'));
        r.addEventListener('click', () => {
          api.set({ startArrow: undefined, endArrow: undefined });
          again();
        });
        pop.append(r);
        return;
      }
      case 'routing': {
        pop.append(label(t('tb.routing')));
        pop.append(choiceRow(ROUTINGS, str(api.eff('routing')), (v) => {
          api.set('routing', v);
          again();
        }, routingPreview, (r) => t(`tb.routing.${r}`)));
        slider(pop, t('tb.curvature'), num(api.eff('curve')) ?? 1, 0, 2, 0.05, (v) => api.set('curve', v), (v) => v.toFixed(2));
        // back to the automatic line: no bend points, default curvature
        if (api.resetCurve) {
          const n = api.bendCount?.() ?? 0;
          const changed = n > 0 || !!api.hasOwnCurve?.();
          const b = h('button', { type: 'button', class: 'mtb-item mtb-reset-curve' }, t('tb.resetCurve'));
          b.disabled = !changed;
          b.title = !changed ? t('tb.resetCurveNone') : n === 1 ? t('tb.resetCurveOne') : n > 1 ? t('tb.resetCurveMany', { n }) : t('tb.resetCurveCurve');
          b.addEventListener('click', () => {
            api.resetCurve?.();
            again();
          });
          pop.append(b);
        }
        return;
      }
      case 'presets': {
        // previews of the item in each preset (drawn by the host with the theme); save / update actions top right
        const acts = h('div', { class: 'pp-acts' });
        pop.append(h('div', { class: 'pp-head' }, label(t('tb.presets')), acts));
        pop.classList.add('mtb-sub');
        const grid = h('div', { class: 'pp-grid' });
        pop.append(grid);
        api.renderPresets?.(grid, done, acts);
        const hr = host.getBoundingClientRect(), br = bar.getBoundingClientRect();
        const below = hr.bottom - br.bottom - 16, above = br.top - hr.top - 16;
        fitPresetGrid(pop, host.clientWidth - 16, Math.max(below, above));
        return;
      }
      case 'tableStyle': {
        // an ER table: compact card or table, and which parts of its attributes show
        pop.classList.add('narrow');
        pop.append(label(t('tb.layout')));
        const mode = str(api.eff('mode')) || 'compact';
        const layouts = h('div', { class: 'mtb-align', role: 'group', 'aria-label': t('tb.layout') });
        for (const v of ['compact', 'table'] as const) {
          const b = h('button', { type: 'button', class: 'mtb-choice mtb-layout' + (v === mode ? ' on' : ''), 'aria-pressed': String(v === mode), title: t(`tb.layout.${v}`) },
            svgIcon(v === 'table' ? 'table' : 'left'), h('span', null, t(`tb.layout.${v}`)));
          b.addEventListener('click', () => {
            api.set('mode', v);
            again();
          });
          layouts.append(b);
        }
        pop.append(layouts, h('hr', { class: 'mtb-hr' }));
        for (const k of ['showTypes', 'showComments', 'pkUnderline'] as const) {
          const on = api.eff(k) === true;
          const b = h('button', { type: 'button', class: 'mtb-choice mtb-wrap' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) },
            h('span', { class: 'mtb-check', 'aria-hidden': 'true' }, on ? '✓' : ''), h('span', null, t(`tb.${k}`)));
          b.addEventListener('click', () => {
            api.set(k, !on);
            again();
          });
          pop.append(b);
        }
        return;
      }
      case 'selection': {
        // the kinds in the selection; unticking one takes its items out, ticking puts them back
        const types = api.selectionTypes?.() ?? [];
        const on = types.filter((x) => x.selected).length;
        pop.append(label(t('tb.selTypes')));
        const list = h('div', { class: 'mtb-list mtb-types', role: 'group', 'aria-label': t('tb.selTypes') });
        for (const ty of types) {
          const box = h('input', { type: 'checkbox', dataset: { kind: ty.kind } });
          box.checked = ty.selected;
          // the last kind left stays: an empty selection would close the bar
          box.disabled = ty.selected && on < 2;
          if (box.disabled) box.title = t('tb.selLast');
          box.addEventListener('change', () => {
            api.setTypeSelected?.(ty.kind, box.checked);
            // the host re-selects and the bar rebuilds this popover: keep the focus on the same box
            const again = bar.querySelector<HTMLInputElement>(`.mtb-pop input[data-kind="${ty.kind}"]`);
            if (again && again !== box) again.focus();
          });
          const name = t(`tb.kind.${ty.kind}`);
          list.append(h('label', { class: 'mtb-item mtb-type' + (ty.selected ? '' : ' off') }, box,
            h('span', null, name.startsWith('tb.kind.') ? ty.kind : name), h('em', null, String(ty.count))));
        }
        pop.append(list);
        return;
      }
      case 'more': {
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', t('tb.more'));
        const list = h('div', { class: 'mtb-list mtb-actions', role: 'none' });
        const act = (ic: string, text: string, keys: string, fn: () => void, enabled = true, cls = ''): void => {
          const b = h('button', { type: 'button', role: 'menuitem', class: `mtb-item ${cls}`, 'aria-keyshortcuts': keys ? keys.replace(/⌘/g, 'Meta+') : undefined },
            svgIcon(ic), h('span', null, text), h('kbd', null, keys));
          b.disabled = !enabled;
          b.addEventListener('click', () => {
            close(true);
            fn();
            refresh();
          });
          list.append(b);
        };
        act('copy', t('tb.copy'), formatKeys('mod+c'), () => api.copy?.(), !!api.canCopy?.());
        act('duplicate', t('tb.duplicate'), formatKeys('mod+d'), () => api.duplicate?.(), !!api.canCopy?.());
        act('trash', t('tb.deleteItem'), formatKeys('delete'), () => api.del?.(), !!api.del, 'danger');
        act('savePreset', t('tb.savePreset'), '', () => api.savePreset?.(), !!api.canSavePreset?.());
        list.append(h('div', { class: 'mtb-sep', role: 'separator' }));
        act('reset', t('tb.resetStyle'), '', () => api.reset?.(), !!api.reset);
        act('more', t('tb.allProps'), '', () => api.inspect?.(), !!api.inspect);
        pop.append(list);
        return;
      }
      default:
        return;
    }
  }

  // Colours come from the theme palette and are stored as references ("@lime"), so they follow theme switches; in the
  // editor "+" keeps a new colour in the diagram's own palette, in the theme editor a custom colour is stored relative
  // to its nearest palette colour (api.customColor).
  function colors(pop: HTMLElement, current: unknown, pick: (c: string) => void, allowNone: boolean): void {
    const cur = str(current).toLowerCase();
    pop.append(label(t('tb.themePalette')));
    const g = h('div', { class: 'mtb-colors', role: 'group', 'aria-label': t('tb.themePalette') });
    if (allowNone) {
      const on = isNone(cur);
      g.append(h('button', { type: 'button', class: 'mtb-sw none' + (on ? ' on' : ''), title: t('tb.none'), 'aria-label': t('tb.none'), 'aria-pressed': String(on), onclick: () => pick('none') }));
    }
    for (const { name, value } of api.palette()) {
      const on = value.toLowerCase() === cur;
      const b = h('button', { type: 'button', class: 'mtb-sw' + (on ? ' on' : ''), title: name, 'aria-label': name, 'aria-pressed': String(on), onclick: () => pick(`@${name}`) });
      b.style.background = value;
      g.append(b);
    }
    pop.append(g);
    if (api.addLocalColor) {
      localColors(pop, cur, pick); // the diagram editor: "+" adds to the diagram's palette
      return;
    }
    if (!api.customColor) return;
    // the theme editor (no diagram palette): a free colour, stored relative to the nearest palette colour
    const ci = h('input', { type: 'color', 'aria-label': t('tb.customColor') });
    ci.value = isHex6(cur) ? cur : '#4f46e5';
    ci.addEventListener('change', () => pick(api.customColor ? api.customColor(ci.value) : ci.value));
    pop.append(h('label', { class: 'mtb-custom' }, ci, ` ${t('tb.customColor')}`));
  }

  // the diagram's own colours (not the theme's) + "+" to add one: saved in the diagram, then applied
  function localColors(pop: HTMLElement, cur: string, pick: (c: string) => void): void {
    pop.append(label(t('tb.thisDiagram')));
    const g = h('div', { class: 'mtb-colors', role: 'group', 'aria-label': t('tb.thisDiagram') });
    for (const { name, value } of api.localPalette?.() ?? []) {
      const on = cur === `@${name}`.toLowerCase() || value.toLowerCase() === cur;
      const title = t('tb.localColor', { value });
      const b = h('button', { type: 'button', class: 'mtb-sw' + (on ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': String(on) });
      b.style.background = value;
      b.addEventListener('click', (ev) => {
        if (ev.altKey) {
          api.removeLocalColor?.(name);
          again();
          return;
        }
        pick(`@${name}`);
      });
      // keyboard: Delete removes the colour (the Alt-click of the pointer)
      b.addEventListener('keydown', (ev) => {
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && api.removeLocalColor) {
          ev.preventDefault();
          ev.stopPropagation();
          api.removeLocalColor(name);
          again();
        }
      });
      g.append(b);
    }
    const ci = h('input', { type: 'color', 'aria-label': t('tb.addColor') });
    ci.value = isHex6(cur) ? cur : '#4f46e5';
    ci.addEventListener('change', () => {
      const n = api.addLocalColor?.(ci.value);
      if (n) pick(`@${n}`);
    });
    g.append(h('label', { class: 'mtb-sw mtb-add', title: t('tb.addColor') }, svgIcon('plus'), ci));
    pop.append(g);
    function again(): void {
      if (open) rerenderPop(open, spec ?? TOOLBAR_KINDS['node']!);
    }
  }

  function slider(pop: HTMLElement, text: string, value: number, min: number, max: number, step: number, onInput: (v: number) => void, fmt: (v: number) => string): void {
    const out = h('span', { class: 'mtb-val' }, fmt(value));
    const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': text });
    r.value = String(value);
    r.setAttribute('aria-valuetext', fmt(value));
    r.addEventListener('input', () => {
      out.textContent = fmt(Number(r.value));
      r.setAttribute('aria-valuetext', fmt(Number(r.value)));
      onInput(Number(r.value));
    });
    r.addEventListener('change', () => api.commit?.());
    pop.append(h('div', { class: 'mtb-slider' }, r, h('div', { class: 'mtb-slabel' }, h('span', null, text), out)));
  }

  function dashes(pop: HTMLElement, cur: string, pick: (d: string) => void): void {
    pop.append(choiceRow(DASHES.map((d) => d[0]), cur, pick, dashPreview, (d) => t(`tb.dash.${DASHES.find((x) => x[0] === d)?.[1] ?? 'solid'}`)));
  }

  function choiceRow(values: readonly string[], cur: string, pick: (v: string) => void, render: (v: string) => SVGElement, name: (v: string) => string): HTMLElement {
    const row = h('div', { class: 'mtb-choices', role: 'group' });
    for (const v of values) {
      const on = v === cur;
      const b = h('button', { type: 'button', class: 'mtb-choice' + (on ? ' on' : ''), title: name(v), 'aria-label': name(v), 'aria-pressed': String(on), onclick: () => pick(v) }, render(v));
      row.append(b);
    }
    return row;
  }

  // ---- placement above the selection
  function place(): void {
    if (bar.hidden) return;
    const r = api.anchorRect();
    if (!r) {
      bar.style.visibility = 'hidden';
      return;
    }
    bar.style.visibility = '';
    const W = host.clientWidth, bw = bar.offsetWidth, bh = bar.offsetHeight;
    const [lo, hi] = api.hBounds?.() ?? [8, W - 8];
    const x = Math.max(lo, Math.min(hi - bw, r.x + r.w / 2 - bw / 2));
    const H = host.clientHeight;
    let y = r.y - bh - 16;
    if (y < 8) {
      const below = r.y + r.h + 16;
      y = below + bh <= H - 8 ? below : 8; // element taller than the view: pin to the top
    }
    if (r.y + r.h < 0 || (H && r.y > H)) {
      bar.style.visibility = 'hidden';
      return;
    }
    bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  return {
    refresh,
    place,
    close,
    hide: () => {
      bar.hidden = true;
      close();
    },
    isOpen: () => open !== null,
    destroy: () => {
      ac.abort();
      close();
      bar.remove();
    },
    el: bar,
  };
}
