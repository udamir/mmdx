// The result types of a diagram diff, apart from the diff engine (core/diff/index.ts), so the merged model, the annotations, the renderer and the reports import them without importing the engine.
import type { DiagramMeta } from '../meta/types.js';
import type { Diagnostic, DiagramType, ItemKind, Rect } from '../types.js';

export type ChangeFacet = 'content' | 'layout' | 'style';
export type ChangeStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface FieldChange {
  facet: ChangeFacet;
  /** Human-readable field name (`label`, `position`, `fill`, `attribute email`…). */
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface ItemChange {
  kind: ItemKind;
  /** Id in the after version (the before id for removed items). */
  id: string;
  /** Id in the before version, when it differs (renamed node, shifted sequence message). */
  beforeId?: string;
  /** Short human-readable name of the item. */
  label: string;
  status: ChangeStatus;
  /** Facets with at least one change (empty for added / removed / unchanged). */
  facets: ChangeFacet[];
  fields: FieldChange[];
}

export interface DiagramDiff {
  type: DiagramType | null;
  /** The two versions are different diagram types (the item lists are then added / removed wholesale). */
  typeChanged: boolean;
  items: ItemChange[];
  /** Diagram-wide changes: theme, page settings, local presets, `classDef`, direction. */
  doc: FieldChange[];
  counts: Record<Exclude<ChangeStatus, 'unchanged'>, number> & Record<ChangeFacet, number>;
  /** Why the diff is incomplete: `kind.not-loaded` when the type's diff kind is not registered (B40). */
  diagnostics?: Diagnostic[];
}

export interface DiffIgnore {
  content?: boolean;
  layout?: boolean;
  style?: boolean;
}

/** What a type's merge (the view kind's `merge`) works with: the diff, the merged metadata and change lookups. */
export interface MergeEnv {
  diff: DiagramDiff;
  /** The merged metadata (removed items' metadata is carried into it). */
  meta: DiagramMeta;
  /** The before version's metadata. */
  before: DiagramMeta;
  /** Changes of kept and added items by `kind:id` in the after version. */
  byAfter: Map<string, ItemChange>;
  /** The removed items. */
  removed: ItemChange[];
  /** Records how the item with this id in the merged diagram changed. */
  mark(c: ItemChange, id: string): void;
}

/** A box (with its shape's outline grown by the frame's padding, when not a rectangle), or a connector's path. */
export type ItemShape = { t: 'rect'; r: Rect; d?: string } | { t: 'path'; d: string; label: Rect | null; mid: { x: number; y: number } };
