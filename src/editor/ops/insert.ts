// Adding an item (X17): an op's rewrite applied as one step with the new item's metadata, the item selected and its text opened for typing (prototype `focusLabel`), shared by the edit kinds and the kind modules.
import type { DiagramMeta } from '../../core/meta/types.js';
import { cloneMeta, ensure as ensureIn } from '../../core/ops/meta-util.js';
import type { ItemRef } from '../../core/types.js';
import type { EditorCore, Sel } from '../core.js';

/** Opens an item's text now: the inline editor, else the Properties panel. */
export function editText(core: EditorCore, it: ItemRef): void {
  if (!core.run('inlineEdit', it)) core.run('setPanel', 'properties', true);
}

/** Opens a new item's text once its change is drawn (prototype `focusLabel`): while it is still the one selected item. */
export function focusLabel(core: EditorCore, it: Sel | null): void {
  if (!it) return;
  setTimeout(() => {
    if (!core.isSelected(it) || core.selection().length !== 1) return;
    editText(core, it);
  }, 0);
}

/**
 * Applies an op that adds `sel` as one history step and selects it: `doc.meta` is the op's metadata (already over the new ids; omitted: the core remaps the current one), `patch` goes into the new item's own metadata (a position, a preset), and `edit` (default) opens its text. False when nothing changed or the host vetoed it.
 */
export function placeNew(core: EditorCore, doc: { code: string; meta?: DiagramMeta }, sel: Sel, label: string, o: { patch?: Record<string, unknown>; edit?: boolean } = {}): boolean {
  let meta = doc.meta;
  if (o.patch && Object.keys(o.patch).length) {
    meta = cloneMeta(meta ?? core.meta);
    Object.assign(ensureIn(meta, sel.kind, sel.id), o.patch);
  }
  const ok = core.applyCode(meta ? { code: doc.code, meta } : { code: doc.code }, label, { select: [sel] });
  if (ok && o.edit !== false) focusLabel(core, sel);
  return ok;
}
