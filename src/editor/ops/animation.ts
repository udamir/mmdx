// A connector's animation, read and written through the diagram type's edit kind (flowchart edges: Mermaid's edge
// data). Shared by the toolbar's line popover and Properties.
import type { EdgeAnimation } from '../../core/ops/flow-edge.js';
import type { ItemRef } from '../../core/types.js';
import type { EditorCore } from '../core.js';
import { withEdit } from '../kinds/registry.js';

/** The item's animation; null when its type has none to set. */
export const animationOf = (core: EditorCore, ref: ItemRef): EdgeAnimation | null =>
  withEdit(core.model, (k, m) => k.animation?.(m, ref) ?? null) ?? null;

/** Sets the item's animation: one undo step, the item stays selected (its id may be new in the code). */
export function setAnimation(core: EditorCore, ref: ItemRef, a: EdgeAnimation): void {
  if (animationOf(core, ref) === a) return;
  const r = withEdit(core.model, (k, m) => k.setAnimation?.(core.code, m, ref, a) ?? null);
  if (!r) return;
  core.applyCode({ code: r.code }, core.i18n.t('history.animation'), { select: [r.select ?? ref] });
}
