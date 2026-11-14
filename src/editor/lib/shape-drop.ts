// Adding an item from the Shapes menu at a diagram point, with the prototype's placement rules
// (prototype app.js `groupAt`, `dropPaletteItem`): the placement is the edit kind's `drop`, with these helpers.
import type { ItemKind, Point } from '../../core/types.js';
import type { EditorCore, Sel } from '../core.js';
import type { PaletteItem } from '../kinds/palette.js';
import { withEdit } from '../kinds/registry.js';

/**
 * Applies the rewrite and then styles the new item in the same history step (positional metadata is remapped by
 * applyCode, so the preset is set on the new id afterwards).
 */
export function applyThenStyle(core: EditorCore, code: string, label: string, sel: Sel | null, patch?: () => void): boolean {
  core.begin();
  const ok = core.applyCode({ code }, label, { select: sel ? [sel] : null });
  if (!ok) {
    core.store.rollback();
    return false;
  }
  if (patch) {
    patch();
    core.store.preview();
  }
  core.commit(label);
  return true;
}

export const setPreset = (core: EditorCore, kind: ItemKind, id: string, preset: string | undefined, extra: Record<string, unknown> = {}): void => {
  if (!preset && !Object.keys(extra).length) return;
  const m = core.ensure(kind, id);
  Object.assign(m, extra);
  if (preset) m.preset = preset;
};

/** Adds a palette item at diagram point `pt` (snapped). Returns false when refused (a toast says why). */
export function dropPaletteItem(core: EditorCore, item: PaletteItem, at: Point): boolean {
  const pt = { x: core.snapV(at.x), y: core.snapV(at.y) };
  return withEdit(core.model, (k, m) => k.drop?.(core, m, item, pt)) ?? false;
}
