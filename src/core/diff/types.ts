// The result types of a diagram diff, apart from the diff engine (core/diff/index.ts), so the merged model, the annotations, the renderer and the reports import them without importing the engine.
import type { DiagramType, ItemKind } from '../types.js';

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
}

export interface DiffIgnore {
  content?: boolean;
  layout?: boolean;
  style?: boolean;
}
