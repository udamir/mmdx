// `%%@` metadata model (§5.4, A.10).
import type { Routing, Side, StyleProps } from '../style.js';

export const META_VERSION = 1;

export interface PageSettings {
  background?: string;
  border?: string;
  grid?: string;
  pad?: number;
  routing?: Routing;
  ratio?: string;
  // sequence layout
  gap?: number;
  rowH?: number;
  mirror?: boolean;
  blockSpan?: 'full' | 'touched';
  margin?: number;
}

export interface CanvasMeta extends PageSettings {
  v?: number;
  theme?: string;
  /** Page preset name (`<type>.pagePresets`). */
  preset?: string;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  [extra: string]: unknown;
}

export interface AttrHighlight {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontFamily?: string;
  fontSize?: number;
  /** A built-in attribute look (`ATTR_PRESETS`); the keys above override it. */
  preset?: string;
}

/** Keys any item may carry, plus kind-specific geometry. Unknown keys are kept on round-trip. */
export interface ItemMeta extends StyleProps {
  preset?: string;
  layer?: string;
  locked?: boolean;
  link?: string;
  x?: number;
  y?: number;
  // edges / relationships
  fromSide?: Side;
  toSide?: Side;
  fromAt?: number;
  toAt?: number;
  labelDx?: number;
  labelDy?: number;
  points?: [number, number][];
  // sequence
  dy?: number;
  // entities
  attrs?: Record<string, AttrHighlight>;
  [extra: string]: unknown;
}

export interface LayerMeta {
  name?: string;
  hidden?: boolean;
  [extra: string]: unknown;
}

export interface PaletteEntry {
  color: string;
  [extra: string]: unknown;
}

export type Collection =
  | 'layers' | 'groups' | 'nodes' | 'edges' | 'participants' | 'messages' | 'notes' | 'blocks' | 'boxes'
  | 'activations' | 'entities' | 'rels';

export const COLLECTIONS: readonly Collection[] = [
  'layers', 'groups', 'nodes', 'edges', 'participants', 'messages', 'notes', 'blocks', 'boxes', 'activations',
  'entities', 'rels',
];

export const KIND_TO_COLL = {
  layer: 'layers', group: 'groups', node: 'nodes', edge: 'edges', participant: 'participants', message: 'messages',
  note: 'notes', block: 'blocks', box: 'boxes', activation: 'activations', entity: 'entities', rel: 'rels',
} as const satisfies Record<string, Collection>;

export type MetaKind = keyof typeof KIND_TO_COLL;

export interface DiagramMeta {
  canvas: CanvasMeta;
  /** `style.<kind> <name>`: local presets per item kind (`_base` = diagram-wide base), and `style.palette`. */
  styles: Record<string, Record<string, StyleProps & Record<string, unknown>>>;
  layers?: Record<string, LayerMeta>;
  groups?: Record<string, ItemMeta>;
  nodes?: Record<string, ItemMeta>;
  edges?: Record<string, ItemMeta>;
  participants?: Record<string, ItemMeta>;
  messages?: Record<string, ItemMeta>;
  notes?: Record<string, ItemMeta>;
  blocks?: Record<string, ItemMeta>;
  boxes?: Record<string, ItemMeta>;
  activations?: Record<string, ItemMeta>;
  entities?: Record<string, ItemMeta>;
  rels?: Record<string, ItemMeta>;
  /**
   * `%%@` lines this version does not understand (unknown kinds, invalid JSON, bad id encoding), kept verbatim so
   * a newer writer's data survives a round-trip through an older component.
   */
  unknown?: string[];
}

export const emptyMeta = (): DiagramMeta => ({ canvas: {}, styles: {} });
