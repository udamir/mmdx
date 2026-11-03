// The ops kind (T01): what the editing ops (core/ops) need from a diagram type — code order, positional ids, the
// clipboard, positions and structure. Only the editor loads it (with its view kind); a missing op means the type does
// not offer it.
import type { DiagramMeta } from '../meta/types.js';
import type { Direction, SupportedModel } from '../model.js';
import type { CloneInto, CloneResult, CodeResult, LineSpan, SwapResult } from '../ops/types.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { DiagramType, ItemKind, ItemRef } from '../types.js';

export interface OpsKind<M extends SupportedModel = SupportedModel, G extends GeometryIndex = GeometryIndex> {
  readonly type: M['type'];

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
  /** Node and group ids inside a group, any depth. */
  descendants?(model: M, groupId: string): { nodes: string[]; groups: string[] };
  setDirection?(code: string, model: M, dir: Direction): CodeResult;
}

export type OpsKinds = Partial<Record<DiagramType, OpsKind>>;
