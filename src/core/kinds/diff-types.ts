// The diff kind (T01): what diffing two versions of a diagram type needs — item changes, the merged picture, highlight
// shapes, code lines. The diff and History load it with the type's view kind; the viewer and the editor do not.
import type { MergeEnv } from '../diff/merge.js';
import type { ItemShape } from '../diff/shape.js';
import type { FieldChange, ItemChange } from '../diff/types.js';
import type { DiagramMeta } from '../meta/types.js';
import type { SupportedModel } from '../model.js';
import type { GeometryIndex } from '../render/types.js';
import type { DiagramType, ItemRef } from '../types.js';

export interface DiffKind<M extends SupportedModel = SupportedModel, G extends GeometryIndex = GeometryIndex> {
  readonly type: M['type'];
  /** Adds the item changes (and diagram-wide field changes) between two versions of this type. */
  diff(a: M, b: M, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void;
  /** The merged picture of a diff: the after version plus the removed items, changed text marked. */
  merge(env: MergeEnv, a: M, b: M): M;
  /** Where a diff highlight of an item goes. */
  shape(geom: G, ref: ItemRef): ItemShape | null;
  /** The code lines the diff's code panel narrows to for an item (no connected lines). */
  diffLines(model: M, ref: ItemRef): Set<number>;
  /** Item ids are positions (sequence messages…): layout metadata cannot be transplanted between versions by id. */
  positionalIds?: boolean;
}

export type DiffKinds = Partial<Record<DiagramType, DiffKind>>;
