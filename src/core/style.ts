// Style properties shared by theme blocks, presets and per-item metadata (A.10).
// Values are validated where they enter (core/validate); colour fields may hold palette references (`@sky`)
// until the theme resolves them.

export type ArrowType = 'none' | 'open' | 'filled' | 'arrow' | 'circle' | 'dot' | 'cross' | 'default';
export type Routing = 'curved' | 'orthogonal' | 'straight';
export type Side = 't' | 'b' | 'l' | 'r';
export type TextAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface StyleProps {
  // box-like items
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  radius?: number;
  /** false / true (one copy) / 2 / 3 copies behind the shape. */
  stack?: boolean | number;
  dash?: string;
  shape?: string;
  // text
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  align?: TextAlign;
  valign?: VAlign;
  /** Word wrap: text breaks into lines that fit the shape's width (it grows taller to fit). */
  wrap?: boolean;
  // sizing (theme-only for most kinds)
  padX?: number;
  padY?: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  w?: number;
  h?: number;
  // groups
  titleSize?: number;
  titleColor?: string;
  titleAlign?: TextAlign;
  titleWeight?: number | string;
  pad?: number;
  padTop?: number;
  // lines (edges, relationships, messages, lifelines)
  color?: string;
  width?: number;
  arrow?: ArrowType | string;
  startArrow?: ArrowType | string;
  endArrow?: ArrowType | string;
  labelColor?: string | null;
  labelSize?: number;
  curve?: number;
  routing?: Routing;
  labelAt?: number;
  replyDash?: string;
  labelOnLine?: boolean;
  // sequence blocks
  showTag?: boolean;
  // ER
  attrSize?: number;
  attrColor?: string;
  mode?: 'compact' | 'table';
  showTypes?: boolean;
  showComments?: boolean;
  pkUnderline?: boolean;
  // preset bookkeeping
  /** The shape a node / participant preset belongs to (when it sets no `shape`). */
  for?: string;
  /** Display name of a page preset. */
  label?: string;
}

export type StyleKey = keyof StyleProps;

/** Merges style layers left → right; `undefined` / `null` / `''` do not override (prototype `mergeStyle`). */
export function mergeLayers<T extends object>(...layers: (Partial<T> | null | undefined)[]): T {
  const out: Record<string, unknown> = {};
  for (const l of layers) {
    if (!l) continue;
    for (const [k, v] of Object.entries(l)) {
      if (v === undefined || v === null || v === '') continue;
      out[k] = v;
    }
  }
  return out as T;
}
