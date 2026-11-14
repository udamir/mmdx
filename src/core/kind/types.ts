// The kind descriptor (T01): one object per diagram type with everything the generic code needs from that type, so
// nothing outside the type's own files branches on `model.type`. A view kind is what drawing a diagram needs (the
// viewer, the diff, SSR); the editor adds an ops kind (core/kind/ops-types.ts) and an edit kind (editor/kinds).
import type { SupportedModel } from '../model.js';
import type { RenderEnv, SubResult, BoxGeom } from '../render/types.js';
import type { StyleProps } from '../style.js';
import type { DiagramType, ItemKind, ItemRef } from '../types.js';

/** Style presets by name. */
export type Presets = Record<string, StyleProps>;

/** A drawn item of a render: a box, or a connector's path (`d`, or its points) and label. */
export type DrawnItem =
  | { ref: ItemRef; box: BoxGeom & { hidden?: boolean } }
  | { ref: ItemRef; d?: string; points?: readonly (readonly [number, number])[]; label?: BoxGeom | null };

/** A connector and the items at its two ends. */
export interface ConnectorEnds {
  ref: ItemRef;
  from: ItemRef;
  to: ItemRef;
}

export interface ViewKind<M extends SupportedModel = SupportedModel> {
  readonly type: M['type'];
  /** Never throws on any input. */
  parse(code: string): M;
  /** The model of a source over the size limit: the right type, no items. */
  empty(): M;
  render(model: M, env: RenderEnv): SubResult;

  // ---- styles ----

  // ---- items ----
  /** Every item that can be on a layer, in model order (activations and processes cannot). */
  items(model: M): ItemRef[];
  /** The container of each contained item (child, container): groups, boxes, blocks. */
  parents(model: M): [ItemRef, ItemRef][];
  /** The connectors with the items at their ends. */
  connectors(model: M): ConnectorEnds[];
  /** Adds what hidden items hide along (a hidden sequence box hides its participants). */
  hideWith?(model: M, hidden: Partial<Record<ItemKind, Set<string>>>): void;
  /** The frames (groups, boxes) around the lit items of a hover highlight. */
  frames?(model: M, lit: ReadonlySet<string>): ItemRef[];
  /** The generated accessible name. */
  summary(model: M): Summary;
}

/** The diagram types a pipeline can handle (the viewer: the ones it loaded; core: all of them). */
export type Kinds = Partial<Record<DiagramType, ViewKind>>;

/** A diagram's generated accessible name: a message key and its counts (§13). */
export interface Summary {
  key: `label.${DiagramType}` | 'label.empty' | 'label.unsupported';
  params: Record<string, number>;
}

/** One line of a diagram's text outline (core's `outline()`), with the lines under it. */
export interface OutlineItem {
  text: string;
  children?: OutlineItem[];
}
