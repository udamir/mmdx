// The edit kind (T01, layer 3): what the editor's modules need from a diagram type — item text, structure edits
// (delete, group), copying, connecting, the Shapes menu, inspectors and toolbars. The editor loads it with the type's
// view and ops kinds; a missing hook means the type does not offer that action.
import type { SupportedModel } from '../../core/model.js';
import type { CodeResult, RefusableResult, SelectResult } from '../../core/ops/types.js';
import type { GeometryIndex } from '../../core/render/types.js';
import type { ItemRef } from '../../core/types.js';
import type { EditorCore, Sel } from '../core.js';

/** An item's text and how to write it back to Mermaid. */
export interface ItemText {
  value: string;
  multi: boolean;
  /** i18n key of the section title. */
  title: string;
  write(code: string, v: string): CodeResult;
}

export interface EditKind<M extends SupportedModel = SupportedModel, G extends GeometryIndex = GeometryIndex> {
  readonly type: M['type'];

  // ---- text ----
  /** Title and sub line of the Properties panel for an item (null: the item is gone). */
  describe(model: M, ref: ItemRef): { title: string; sub: string } | null;
  /** The item's text (null: it has none). */
  text(model: M, ref: ItemRef): ItemText | null;

  // ---- structure ----
  remove(code: string, model: M, refs: readonly ItemRef[]): RefusableResult;
  /** Deletes a single item the type removes its own way (a sequence process); true when it handled it. */
  removeOne?(core: EditorCore, model: M, ref: Sel): boolean;
  /** Can the selection be grouped? `reason` is an i18n key ('' when nothing to say). */
  canGroup(model: M, sel: readonly Sel[]): { ok: boolean; reason: string };
  group?(code: string, model: M, sel: readonly Sel[], title: string): SelectResult;
  /** Removes a container, keeping what is in it (null: the item is not one of the type's containers). */
  ungroup?(code: string, model: M, ref: Sel): { code: string; members: Sel[] } | null;
  renameContainer?(code: string, model: M, ref: Sel, name: string): CodeResult | null;
  /** Plain Mermaid of copied items (the system clipboard's text). */
  fragment?(model: M, code: string, refs: readonly ItemRef[]): string;
  /** The toast when nothing in the selection can be copied (default "Nothing to copy"). */
  noCopy?: string;
  /** Alt-drag copies items. */
  altCopy?: boolean;
  /** Geometry of the type (for typing the hooks that take it). */
  readonly geom?: G;
}

export type EditKinds = Partial<Record<NonNullable<SupportedModel['type']>, EditKind>>;
