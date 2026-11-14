// Sequence hover (prototype hoverSeq): the hovered lifeline (its circle, or the side circles of a process) and the
// hovered message (its end circles), cleared when the pointer leaves or the model changes.
import { seqGeom } from './lib.js';
import { seqBusy, type SeqScope, type SeqState } from './state.js';

export function installSeqHover(scope: SeqScope, st: SeqState): void {
  const core = scope.core;
  const clear = (): void => {
    if (st.llHover || st.hoverMsg) {
      st.llHover = null;
      st.hoverMsg = null;
      core.drawOverlay();
    }
  };
  scope.canvas('pointermove', (ev) => {
    if (ev.buttons || seqBusy(core, st)) return;
    const gm = seqGeom(core);
    if (!gm || core.mode.peek() !== 'edit' || core.tool.peek() !== 'pointer' || !(ev.target instanceof Element)) {
      clear();
      return;
    }
    const t = ev.target;
    let ll: { id: string; y: number } | null = null, msg: string | null = null;
    const dot = t.closest('[data-handle="actend"]');
    if (dot) msg = dot.getAttribute('data-msg');
    else {
      const m = t.closest('.el.message');
      if (m) msg = m.getAttribute('data-id');
      const h = !m ? t.closest('[data-handle="lifeline"]') : null;
      const bar = !m && !h ? t.closest('.el.activation') : null;
      const y = core.toDiagram(ev).y;
      if (h) ll = { id: h.getAttribute('data-id') ?? '', y: h.hasAttribute('data-side') ? st.llHover?.y ?? y : y };
      else if (bar) ll = { id: gm.activations.get(bar.getAttribute('data-id') ?? '')?.participant ?? '', y };
      if (ll && !ll.id) ll = null;
    }
    const same = st.llHover?.id === ll?.id && Math.abs((st.llHover?.y ?? 0) - (ll?.y ?? 0)) < 0.5 && st.hoverMsg === msg;
    if (same) return;
    st.llHover = ll;
    st.hoverMsg = msg;
    core.drawOverlay();
  });
  scope.canvas('pointerleave', () => {
    if (!seqBusy(core, st)) clear();
  });
  scope.on('model', () => {
    st.llHover = null;
    st.hoverMsg = null;
  });
}
