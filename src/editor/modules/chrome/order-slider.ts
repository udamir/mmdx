// The Order slider (A.7 row 63) and ⌘[ / ⌘]: every position the selected item can reach in the code, previewed live
// (one transaction) and committed once; the keys move it one position, one step each.
import { opsKind } from '../../../core/kinds/registry.js';
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { DiagramModel } from '../../../core/model.js';
import { applyOrderState, moveOrder, orderPositions, type OrderPositions } from '../../../core/ops/order.js';
import type { EditorCore } from '../../core.js';
import { applyDoc } from '../../ops/doc.js';

export type OrderInfo = OrderPositions & { key: string; base: { code: string; meta: DiagramMeta; model: DiagramModel; participants: ReadonlyMap<string, { x: number }> | null }; shown: number | null };

export interface OrderSlider {
  /** The selected item's positions (null: not one item). */
  info(): OrderInfo | null;
  /** Shows position `i` (opens the transaction on the first preview). */
  preview(i: number): void;
  /** Commits the shown position as one step (rolls back when it is where it started). */
  commit(): void;
  /** A preview is open. */
  readonly active: boolean;
  /** ⌘[ / ⌘]: moves the selected item one position. */
  move(dir: -1 | 1): void;
}

/** `committed`: the bar shows the new position. */
export function createOrderSlider(core: EditorCore, t: EditorCore['i18n']['t'], committed: () => void): OrderSlider {
  let ord: OrderInfo | null = null;
  let ordering = false;
  let orderTx = 0;
  const orderInfo = (): OrderInfo | null => {
    const sel = core.selection();
    if (sel.length !== 1) return null;
    const s = sel[0]!;
    const key = `${core.code}\u0000${s.kind}:${s.id}`;
    if (ord?.key === key) return ord;
    const g = core.geom;
    ord = { ...orderPositions(core.code, core.model, s), key, base: { code: core.code, meta: JSON.parse(JSON.stringify(core.meta)) as DiagramMeta, model: core.model, participants: g.type ? opsKind(g.type)?.swapBoxes?.(g) ?? null : null }, shown: null };
    return ord;
  };
  const orderPreview = (i: number): void => {
    const o = ord;
    const st = o?.states[i];
    if (!o || !st) return;
    if (!ordering || core.store.txId !== orderTx) {
      core.begin();
      ordering = true;
      orderTx = core.store.txId;
    }
    const doc = applyOrderState(o.base, st);
    core.write({ meta: doc.meta });
    core.write({ code: doc.code });
    core.select([st.sel]);
    core.draw();
    o.shown = i;
  };
  const orderCommit = (): void => {
    const o = ord;
    if (!ordering) return;
    ordering = false;
    if (core.store.txId !== orderTx) {
      // cancelled meanwhile (undo, a load, a stage switch): the base is stale
      ord = null;
      return;
    }
    if (!o || o.shown == null || core.code === o.base.code) {
      core.rollback();
      return;
    }
    core.commit(t('history.order'));
    // the reached position becomes the new base, keeping the slider where it is
    ord = null;
    committed();
  };
  const moveSelection = (dir: -1 | 1): void => {
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
  };
  return { info: orderInfo, preview: orderPreview, commit: orderCommit, get active() { return ordering; }, move: moveSelection };
}
