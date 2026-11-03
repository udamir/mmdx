// The kind descriptor (T01): one object per diagram type with everything the generic code needs from that type, so
// nothing outside the type's own files branches on `model.type`. A view kind is what drawing a diagram needs (the
// viewer, the diff, SSR); the editor adds an ops kind (core/kinds/ops-types.ts) and an edit kind (editor/kinds).
import type { MetaIds } from '../meta/index.js';
import type { DiagramMeta } from '../meta/types.js';
import type { SupportedModel } from '../model.js';
import type { OutlineItem } from '../outline.js';
import type { RenderEnv, SubResult } from '../render/common.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { Summary } from '../summary.js';
import type { MergeEnv } from '../diff/merge.js';
import type { ItemShape } from '../diff/shape.js';
import type { FieldChange, ItemChange } from '../diff/types.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { DiagramType, ItemKind, ItemRef } from '../types.js';

/** Style presets by name. */
export type Presets = Record<string, StyleProps>;

/** A connector and the items at its two ends. */
export interface ConnectorEnds {
  ref: ItemRef;
  from: ItemRef;
  to: ItemRef;
}

export interface ViewKind<M extends SupportedModel = SupportedModel, G extends GeometryIndex = GeometryIndex> {
  readonly type: M['type'];
  /** Never throws on any input. */
  parse(code: string): M;
  /** The model of a source over the size limit: the right type, no items. */
  empty(): M;
  render(model: M, env: RenderEnv): SubResult;

  // ---- styles ----
  /** The theme's presets plus the diagram's own, for each item kind of the type. */
  presets(theme: ResolvedTheme, meta: DiagramMeta): Partial<Record<ItemKind, Presets>>;
  /**
   * The preset an item is drawn with when it is derived from its Mermaid code (classes, shape, line style): the
   * item's own preset first, as the renderer does. Undefined for kinds whose preset is only their own.
   */
  codePreset?(model: M, meta: DiagramMeta, theme: ResolvedTheme, ref: ItemRef): string | undefined;
  /** The shape the Mermaid code gives an item (undefined: none, the theme decides). */
  codeShape?(model: M, ref: ItemRef): string | undefined;
  /** The link the Mermaid code gives an item (`click`). */
  codeLink?(model: M, ref: ItemRef): string | undefined;
  /** The arrow heads the Mermaid code gives a connector (null: not a connector with heads). */
  codeEnds?(model: M, ref: ItemRef): { start: string; end: string } | null;

  // ---- items ----
  /** Every item that can be on a layer, in model order (activations and processes cannot). */
  items(model: M): ItemRef[];
  /** The container of each contained item (child, container): groups, boxes, blocks. */
  parents(model: M): [ItemRef, ItemRef][];
  /** The connectors with the items at their ends. */
  connectors(model: M): ConnectorEnds[];
  /** Adds what hidden items hide along (a hidden sequence box hides its participants). */
  hideWith?(model: M, hidden: Partial<Record<ItemKind, Set<string>>>): void;
  /** The item whose id is exactly `id`, any kind (the code filter). */
  find(model: M, id: string): ItemRef | null;
  /** Every item with the texts it is found by (the code filter's search), in model order. */
  search(model: M): { ref: ItemRef; texts: (string | undefined)[] }[];
  exists(model: M, ref: ItemRef): boolean;
  /** Ids that name items in the code (nodes, groups, tables; participants when `participants`). */
  takenIds(model: M, participants: boolean): Iterable<string>;
  /** Item ids per metadata collection (what `pruneMeta` keeps). */
  usedIds(model: M): MetaIds;
  /** 0-based code lines that define or mention an item, sorted (the editor's code filter). */
  lines(model: M, ref: ItemRef): number[];
  /** The stricter lines the diff's code panel narrows to (no connected lines). */
  diffLines(model: M, ref: ItemRef): Set<number>;
  /**
   * The rendered box (centre and size) of an item. `foot`: a participant's box at the bottom; `activations`: also the
   * boxes of activation bars (the editor; the ops leave them out).
   */
  box(geom: G, ref: ItemRef & { foot?: boolean }, activations?: boolean): (BoxGeom & { hidden?: boolean }) | null;
  /** The frames (groups, boxes) around the lit items of a hover highlight. */
  frames?(model: M, lit: ReadonlySet<string>): ItemRef[];
  /** The diagram has no items yet. */
  isEmpty(model: M): boolean;
  /** Text alternative: an outline of the diagram. */
  outline(model: M): OutlineItem[];
  /** The generated accessible name. */
  summary(model: M): Summary;

  // ---- diff ----
  /** Adds the item changes (and diagram-wide field changes) between two versions of this type. */
  diff(a: M, b: M, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void;
  /** The merged picture of a diff: the after version plus the removed items, changed text marked. */
  merge(env: MergeEnv, a: M, b: M): M;
  /** Where a diff highlight of an item goes. */
  shape(geom: G, ref: ItemRef): ItemShape | null;
  /** Item ids are positions (sequence messages…): the diff cannot transplant layout metadata between versions by id. */
  positionalIds?: boolean;
}

/** The diagram types a pipeline can handle (the viewer: the ones it loaded; core: all of them). */
export type Kinds = Partial<Record<DiagramType, ViewKind>>;
