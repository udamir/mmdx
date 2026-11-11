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
  /** Sequence blocks show their kind (`loop`, `alt`…) in the frame's corner, as Mermaid does (default); false hides the tags (T11.2). */
  blockTags?: boolean;
  /** Mindmap layout: both sides of the root (default), to the right, or top down. */
  mindLayout?: 'both' | 'right' | 'down';
  /** State diagrams: composites in the theme's one composite style (default), or each in a colour of its own (`state.compositeColors`). */
  composites?: 'single' | 'palette';
}

export interface CanvasMeta extends PageSettings {
  v?: number;
  /** Page preset name (`<type>.pagePresets`). */
  preset?: string;
  /**
   * Auto layout of flowcharts with subgraphs: `legacy` keeps the layout from before the compound engine (T07) for one
   * minor release; absent or `compound`: subgraphs are laid out as nested containers.
   */
  layout?: 'legacy' | 'compound';
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
  // sequence (extra space above); mindmap (a nudge, with dx)
  dy?: number;
  // mindmap nodes
  dx?: number;
  /** A first-level branch's side of the root. */
  side?: 'l' | 'r';
  /** A branch colour: one of the theme's mindmap sections (0–11), for the node and its subtree. */
  section?: number;
  /** The subtree is folded (a +N badge shows how many nodes it holds). */
  collapsed?: boolean;
  // an icon and an image beside the label, in the kinds whose code has no syntax for them (T10 §4.6: mindmap nodes,
  // states, participants, entities; render/decorate.ts)
  /** Where the label's leading icon token is drawn: inline before the text (`l`, default), above it or below it. */
  iconPos?: 'l' | 't' | 'b';
  /** The icon's size in px (default: the font size inline, 1.75 em above or below). */
  iconSize?: number;
  /** The icon's colour (a colour or palette reference; default: the text colour). */
  iconColor?: string;
  /** A picture above the label (URL, checked by the image policy at render; `""`: not chosen yet, the placeholder). */
  img?: string;
  /** The picture's box (one of them: the other follows the picture's aspect). */
  imgW?: number;
  imgH?: number;
  /** How the picture fills its box: `contain` (default), `cover` or `stretch` (flowchart image nodes too). */
  imgFit?: string;
  // an image or icon state: the flowchart image node's keys (`w` / `h`: the picture's or the icon's size)
  /** The icon an icon state shows instead of a picture (`pack:name`). */
  icon?: string;
  /** The icon's frame. */
  form?: 'square' | 'circle' | 'rounded';
  /** The caption's side: above (`t`) or below (`b`, default). */
  pos?: 't' | 'b';
  /** The picture keeps its aspect ratio (`on`). */
  constraint?: 'on' | 'off';
  // entities
  attrs?: Record<string, AttrHighlight>;
  [extra: string]: unknown;
}

export interface LayerMeta {
  name?: string;
  hidden?: boolean;
  [extra: string]: unknown;
}

export type Collection =
  | 'layers' | 'groups' | 'nodes' | 'edges' | 'participants' | 'messages' | 'notes' | 'blocks' | 'boxes'
  | 'activations' | 'entities' | 'rels';

/** Ids that exist in the model, per collection. Collections without a set are left alone. */
export type MetaIds = Partial<Record<Collection, ReadonlySet<string>>>;

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
