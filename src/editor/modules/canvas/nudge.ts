// Keyboard nudge (A.3 row 34): arrow keys move the selection by 1 px, Shift by 10, one history step per burst of key
// presses (ended by the key-up, another key, a press on the canvas, or a pause).
import { moveItem, moveItems } from '../../../core/ops/index.js';
import type { SelectScope } from './select-state.js';

export interface Nudge {
  /** Moves the selection by (ux, uy) × step; false when nothing is selected. */
  nudge(ux: number, uy: number, step: number): boolean;
  /** Ends the burst: commits its step. */
  flush(): void;
}

export function installNudge(scope: SelectScope): Nudge {
  const core = scope.core;
  let nudgeOpen = false;
  // the transaction the nudges run in (a cancel — undo, a load, a stage switch — may have ended it)
  let nudgeTx = 0;
  let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  const flushNudge = (): void => {
    clearTimeout(nudgeTimer);
    if (!nudgeOpen) return;
    nudgeOpen = false;
    if (core.store.txId === nudgeTx) core.commit('Nudge');
  };
  const nudge = (ux: number, uy: number, step: number): boolean => {
    const sel = core.selection();
    if (!sel.length) return false;
    const model = core.model, meta = core.meta, geom = core.geom;
    let next = meta;
    if (sel.length > 1) next = moveItems(model, meta, geom, sel, ux * step, uy * step, 0).meta;
    else {
      const { kind, id } = sel[0]!;
      if (kind === 'activation') return true; // processes follow their messages
      const vertOnly = kind === 'message' || kind === 'note' || kind === 'block';
      if (vertOnly && !uy) return true;
      if (kind === 'participant' && !ux) return true;
      const part = kind === 'edge' || kind === 'rel' ? 'label' : undefined;
      if (core.getM(kind, id).locked && !part) return true;
      next = moveItem(model, meta, geom, { kind, id }, ux * step, uy * step, part ? { part, snap: 0 } : { snap: 0 }).meta; // no snapping
    }
    if (!nudgeOpen || core.store.txId !== nudgeTx) {
      core.begin();
      nudgeOpen = true;
      nudgeTx = core.store.txId;
    }
    core.write({ meta: next });
    core.draw();
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(flushNudge, 450);
    return true;
  };
  const root = core.dom.root;
  scope.listen(root, 'keyup', (ev) => {
    if (ev.key.startsWith('Arrow')) flushNudge();
  });
  scope.listen(root, 'keydown', (ev) => {
    if (nudgeOpen && !ev.key.startsWith('Arrow') && ev.key !== 'Shift') flushNudge();
  }, { capture: true });
  scope.canvas('pointerdown', () => flushNudge(), { capture: true });
  return { nudge, flush: flushNudge };
}
