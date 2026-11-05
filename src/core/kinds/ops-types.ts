// The ops kind (T01): what the editing ops (core/ops) need from a diagram type — code order, positional ids, the
// clipboard, positions and structure. Only the editor loads it (with its view kind); a missing op means the type does
// not offer it.
import type { MetaIds } from '../meta/index.js';
import type { DiagramMeta } from '../meta/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { Direction, SupportedModel } from '../model.js';
import type { CloneInto, CloneResult, CodeResult, LineSpan, SwapResult } from '../ops/types.js';
import type { BoxGeom, EdgeGeom, GeometryIndex } from '../render/types.js';
import type { DrawnItem, Presets } from './types.js';
import type { DiagramType, ItemKind, ItemRef } from '../types.js';

export interface OpsKind<M extends SupportedModel = SupportedModel, G extends GeometryIndex = GeometryIndex> {
  readonly type: M['type'];

  // ---- presets and geometry (the editor, item previews) ----
  /** The theme's presets plus the diagram's own, for each item kind of the type. */
  presets(theme: ResolvedTheme, meta: DiagramMeta): Partial<Record<ItemKind, Presets>>;
  /**
   * The rendered box (centre and size) of an item. `foot`: a participant's box at the bottom; `activations`: also the
   * boxes of activation bars (the editor; the ops leave them out).
   */
  box(geom: G, ref: ItemRef & { foot?: boolean }, activations?: boolean): (BoxGeom & { hidden?: boolean }) | null;
  /** The routed geometry of a connector with bend points and ports (flowchart edges, ER relationships). */
  edge?(geom: G, ref: ItemRef): EdgeGeom | undefined;
  /** Every item a render drew, with its box or its line (the editor's marquee, ⌘A and selection halos). */
  drawn(geom: G): DrawnItem[];

  // ---- styles the code gives, items (the editor's style environment, code filter, ids) ----
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
  /** The diagram has no items yet. */
  isEmpty(model: M): boolean;

  // ---- code order ----
  /** Multi-line blocks of the code: subgraphs, entity bodies, boxes, sequence blocks. */
  blocks(model: M): LineSpan[];
  /** The line range of an item (null: it has no line of its own). */
  unit(model: M, ref: ItemRef): LineSpan | null;
  /** Why code after a move is refused (sequence: a participant deactivated before it is activated), else null. */
  checkMove?(code: string): string | null;
  /** A step of the code order the type takes its own way (sequence participants trade places); undefined: a statement move. */
  orderStep?(code: string, model: M, ref: ItemRef, dir: -1 | 1): SwapResult | undefined;
  /** The id of a positional item after it moved to `line` (ids that survive a move are not asked). */
  relocate?(model: M, ref: ItemRef, line: number | undefined): string | undefined;
  /** Draw order among the items of one kind (null: the kind has none). */
  orderRank?(model: M, ref: ItemRef): number | null;
  /** The order slider's end labels (default: back, front). */
  orderLabels?(ref: ItemRef): [string, string];
  /** Boxes whose hand-placed x positions trade along with an order step (sequence participants). */
  swapBoxes?(geom: G): ReadonlyMap<string, Pick<BoxGeom, 'x'>> | null;
  /** Carries metadata over to new positional ids after a code change (pure). */
  remapMeta?(meta: DiagramMeta, before: M, beforeCode: string, after: M, afterCode: string): DiagramMeta;

  // ---- clipboard ----
  copyable?(model: M, ref: ItemRef): boolean;
  /** The ids whose connectors a copy of `items` keeps, and the items to delete so only the copy is left. */
  copySet?(model: M, items: readonly ItemRef[]): { ends: Set<string>; rest: ItemRef[] };
  remove?(code: string, model: M, items: readonly ItemRef[]): CodeResult;
  clone?(code: string, model: M, items: readonly ItemRef[], into?: CloneInto): CloneResult;
  /** The kind of the item an id names (the metadata collection of a copy). */
  idKind?(model: M, id: string): ItemKind;

  // ---- positions and structure ----
  /** Pins auto-placed items where they are drawn before a manual placement (mutates and returns `meta`). */
  pinAuto?(meta: DiagramMeta, model: M, geom: GeometryIndex | null | undefined): DiagramMeta;
  /** Node and group ids inside a group, any depth; `leaf`: the item kind of `nodes` (default `node`; ER: `entity`). */
  descendants?(model: M, groupId: string): { nodes: string[]; groups: string[]; leaf?: ItemKind };
  /**
   * "Reset positions in this group" (T07): forgets the hand-placed positions inside a group (its descendants' `x` /
   * `y`, nested frames, bend points of the connectors inside), so the compound layout lays the group out again; the
   * group keeps its place (mutates and returns `meta`). Undefined: the type has no groups with positions.
   */
  resetScope?(meta: DiagramMeta, model: M, geom: GeometryIndex | null | undefined, groupId: string): DiagramMeta;
  setDirection?(code: string, model: M, dir: Direction): CodeResult;
}

export type OpsKinds = Partial<Record<DiagramType, OpsKind>>;
