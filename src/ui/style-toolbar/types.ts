// The style toolbar's public types: the controls, the button sets per kind, and the host contract (`ToolbarApi`).
import type { Rect } from '../../core/types.js';
import type { I18n } from '../i18n.js';
import type { PaletteColor } from '../toolbar-kit.js';

export type { PaletteColor } from '../toolbar-kit.js';

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
  /** i18n key of the order button's title (default `tb.order`). */
  orderTitle?(): string | undefined;
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

export interface StyleToolbarOptions {
  /** Controls to leave out (the theme editor has no layers, order, links…). */
  exclude?: readonly ToolbarControl[];
  /** Adds a "back to the inherited style" button at the end. */
  reset?: boolean;
  /** Per-kind overrides of the button sets. */
  kinds?: Readonly<Record<string, KindSpec>>;
  i18n?: I18n;
}

export interface StyleToolbarHandle {
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
