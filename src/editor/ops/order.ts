// The code order of the selected item (X17): ⌘[ / ⌘] and the sequence's ◀ ▶ arrows move it one position, one history step each (the Order slider previews every position, chrome/order-slider.ts).
import { moveOrder } from '../../core/ops/order.js';
import type { EditorCore } from '../core.js';
import { applyDoc } from './doc.js';

/** Moves the one selected item a position back (-1) or forward (1) in the code; a toast says why not. */
export function moveSelection(core: EditorCore, dir: -1 | 1): void {
  const t = core.i18n.t;
  const sel = core.selection();
  if (sel.length !== 1) {
    core.toast(t('order.selectOne'));
    return;
  }
  const res = moveOrder(core.code, core.meta, core.model, core.geom, sel[0]!, dir);
  if (res.reason) {
    core.toast(res.reason);
    return;
  }
  // the op already carried sequence metadata over to the new positional ids: no second remap
  applyDoc(core, t('history.order'), res, res.selection ?? sel);
}
