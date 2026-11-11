// Sequence gestures (A.5 rows 45–48, 50): a lifeline circle → a new message, a self message or a process; a message
// end circle → a process to another message or the end re-attached to another lifeline; process top / bottom
// handles; block edge handles (pull / push statements); note edge handles (span); participant ◀ ▶ swap arrows.
import type { SeqBlockStart, SeqMessage } from '../../../core/model.js';
import { addActivation, addSeqMessageAt, moveActivationEdge, reattachMessage, resizeBlockStep, setNoteSpan, toggleActivation } from '../../../core/kinds/sequence/ops.js';
import { reparse as parse } from '../../../core/parse/dispatch.js';
import { maxOf, minOf } from '../../../core/geom.js';
import type { EditorCore, Gesture, Hit, Sel } from '../../core.js';
import { elementsAt } from '../../lib/geometry.js';
import { GESTURE } from '../../lib/priorities.js';
import { edgeAnchors, liveCode, seqGeom, seqLineAbove, seqModel } from './lib.js';
import type { SeqScope, SeqState } from './state.js';

const NOOP: Gesture = { move: () => undefined };

/** Selects the new message and opens its text (prototype `focusLabel`). */
function focusLabel(core: EditorCore, it: Sel): void {
  setTimeout(() => {
    if (!core.isSelected(it)) return;
    if (!core.run('inlineEdit', it)) core.run('setPanel', 'properties', true);
  }, 0);
}

/**
 * The participant whose lifeline (or head) is under the pointer, else the one whose lifeline is within ~40 px of
 * x on screen; `except` is never the answer.
 */
function lifelineAt(core: EditorCore, ev: PointerEvent, x: number, except: string): string | null {
  for (const n of elementsAt(core, ev)) {
    const h = n.closest('[data-handle="lifeline"]') ?? n.closest('.el[data-kind="participant"]');
    const id = h?.getAttribute('data-id');
    if (id && id !== except) return id;
  }
  const gm = seqGeom(core);
  let best: { pid: string; d: number } | null = null;
  for (const [pid, q] of gm?.participants ?? []) if (pid !== except && !q.hidden && (!best || Math.abs(q.x - x) < best.d)) best = { pid, d: Math.abs(q.x - x) };
  return best && best.d * core.viewport.state.k < 40 ? best.pid : null;
}

/**
 * Drag from a participant's lifeline (its hover circle): sideways to another participant → a new message at that
 * height; up or down → a process (activation bar) over the messages it spans.
 */
function lifelineDrag(core: EditorCore, st: SeqState, hit: Hit, srcId: string): Gesture | null {
  const gm = seqGeom(core);
  const pg = gm?.participants.get(srcId);
  if (!gm || !pg) return null;
  const p0 = hit.p, x = pg.x;
  // from a side circle of a process: the arrow starts at the bar's edge, at the circle's height
  const sideC = hit.handle?.hasAttribute('data-side') ? hit.handle.querySelector('circle') : null;
  const a = sideC ? { x: Number(sideC.getAttribute('cx')), y: Number(sideC.getAttribute('cy')) } : { x, y: p0.y };
  st.llHover = null;
  let mode: 'act' | 'msg' | null = null;
  const targetUnder = (ev: PointerEvent): string | null => {
    for (const n of elementsAt(core, ev)) {
      const h = n.closest('[data-handle="lifeline"]') ?? n.closest('.el[data-kind="participant"]');
      const id = h?.getAttribute('data-id');
      if (id && id !== srcId) return id;
    }
    return null;
  };
  const done = (): void => {
    st.active = false;
    st.linking = null;
    st.actPreview = null;
  };
  return {
    move(dx, dy, ev) {
      const k = core.viewport.state.k;
      // the first 8px decide: mostly vertical = a process, otherwise a message
      if (!mode) {
        if (Math.hypot(dx, dy) * k < 8) return;
        mode = Math.abs(dy) > Math.abs(dx) ? 'act' : 'msg';
      }
      if (mode === 'act') {
        st.actPreview = { x, y0: a.y, y1: a.y + dy };
        core.drawOverlay();
        return;
      }
      const b = { x: p0.x + dx, y: p0.y + dy };
      // snap to a lifeline the pointer is near (within ~40px on screen), not only when exactly over it
      let t = targetUnder(ev);
      if (!t) {
        let best: { pid: string; d: number } | null = null;
        for (const [pid, q] of gm.participants)
          if (pid !== srcId && !q.hidden && (!best || Math.abs(q.x - b.x) < best.d)) best = { pid, d: Math.abs(q.x - b.x) };
        if (best && best.d * k < 40) t = best.pid;
      }
      // let go close to the start (no other participant under the pointer): a message back to the same lifeline
      const near = Math.abs(dx) * k < 110 && Math.abs(dy) * k < 80;
      const tx = t ? gm.participants.get(t)?.x : undefined;
      st.linking = t && tx !== undefined ? { a, b: { x: tx, y: a.y }, target: t } : near ? { a, b, target: srcId, self: true } : { a, b, target: null };
      core.drawOverlay();
    },
    end() {
      const P = st.actPreview, L = st.linking;
      done();
      const M = seqModel(core);
      if (!M) return;
      if (mode === 'act') {
        if (!P) return;
        const r = addActivation(core.code, M, srcId, seqLineAbove(core, Math.min(P.y0, P.y1)), seqLineAbove(core, Math.max(P.y0, P.y1)));
        if (r.reason) {
          core.toast(r.reason);
          return;
        }
        core.applyCode(r, core.i18n.t('history.addProcess'), { select: null });
        core.toast(core.i18n.t('seq.processAdded', { p: srcId }));
        return;
      }
      if (!L?.target) return;
      const r = addSeqMessageAt(core.code, M, srcId, L.target, seqLineAbove(core, a.y));
      const N = parse(r.code);
      const msg = N.type === 'sequence' ? N.items.find((x): x is SeqMessage => x.kind === 'message' && x.src === r.line) : undefined;
      const sel: Sel | null = msg ? { kind: 'message', id: msg.id } : null;
      if (core.applyCode(r, core.i18n.t('history.addMessage'), { select: sel ? [sel] : null }) && sel) focusLabel(core, sel);
    },
    cancel: done,
  };
}

/**
 * Drag a message end: up or down to another message → a process on that end's participant between the two;
 * sideways to another lifeline → that end re-attached there (the first 8 px decide, as on a lifeline).
 */
function actEndDrag(core: EditorCore, st: SeqState, msgId: string, pid: string): Gesture | null {
  const gm = seqGeom(core), M = seqModel(core);
  const pg = gm?.participants.get(pid), m0 = gm?.messages.get(msgId);
  const msg = M?.items.find((x): x is SeqMessage => x.kind === 'message' && x.id === msgId);
  if (!gm || !M || !pg || !m0 || !msg) return null;
  const x = pg.x, y0 = m0.y;
  const which: 'from' | 'to' = msg.from === pid ? 'from' : 'to';
  const fixed = { x: which === 'from' ? m0.x1 : m0.x0, y: y0 };
  let mode: 'act' | 'end' | null = null;
  // the message whose arrow is nearest to y (any message — the process may end on a message of another participant)
  const nearest = (y: number): { id: string; y: number } | null => {
    let best: { id: string; y: number } | null = null;
    for (const it of M.items) {
      if (it.kind !== 'message') continue;
      const mg = gm.messages.get(it.id);
      if (mg && it.id !== msgId && (!best || Math.abs(mg.y - y) < Math.abs(best.y - y))) best = { id: it.id, y: mg.y };
    }
    return best;
  };
  return {
    move(dx, dy, ev) {
      if (!mode) {
        if (Math.hypot(dx, dy) * core.viewport.state.k < 8) return;
        mode = Math.abs(dy) >= Math.abs(dx) ? 'act' : 'end';
      }
      if (mode === 'end') {
        const px = (which === 'from' ? m0.x0 : m0.x1) + dx;
        const t = lifelineAt(core, ev, px, pid);
        const tx = t ? gm.participants.get(t)?.x : undefined;
        st.linking = { a: fixed, b: { x: tx ?? px, y: y0 }, target: t };
        core.drawOverlay();
        return;
      }
      const t = nearest(y0 + dy);
      st.actPreview = { x, y0, y1: t ? t.y : y0 + dy, target: t?.id };
      core.drawOverlay();
    },
    end() {
      const t = st.actPreview?.target, L = st.linking;
      st.actPreview = null;
      st.linking = null;
      st.active = false;
      const Mn = seqModel(core);
      if (mode === 'end') {
        if (!L?.target || !Mn) return;
        const r = reattachMessage(core.code, Mn, msgId, which, L.target);
        if (r.reason) core.toast(r.reason);
        else if (r.code !== core.code && core.applyCode(r, core.i18n.t('seq.reattach'), { select: [{ kind: 'message', id: msgId }] }))
          core.toast(core.i18n.t('seq.reattached', { p: L.target }));
        return;
      }
      if (!t || !Mn) return;
      const r = toggleActivation(core.code, Mn, msgId, t, pid);
      if (r.reason) {
        core.toast(r.reason);
        return;
      }
      core.applyCode(r, core.i18n.t(r.removed ? 'history.removeProcess' : 'history.addProcess'), { select: null });
      core.toast(core.i18n.t(r.removed ? 'seq.processRemoved' : 'seq.processAdded', { p: pid }));
    },
    cancel() {
      st.actPreview = null;
      st.linking = null;
      st.active = false;
    },
  };
}

/** Drag the top / bottom handle of the selected process: it snaps to the nearest message arrow. */
function actEdgeDrag(core: EditorCore, st: SeqState, id: string, edge: 'top' | 'bottom'): Gesture | null {
  const gm = seqGeom(core), M = seqModel(core);
  const b = gm?.activations.get(id);
  if (!gm || !M || !b) return null;
  const fixed = edge === 'top' ? b.y1 : b.y0;
  return {
    move(_dx, dy) {
      const y = (edge === 'top' ? b.y0 : b.y1) + dy;
      let best: { id: string; y: number } | null = null;
      for (const it of M.items) {
        if (it.kind !== 'message') continue;
        const mg = gm.messages.get(it.id);
        if (mg && (edge === 'top' ? mg.y < fixed : mg.y > fixed) && (!best || Math.abs(mg.y - y) < Math.abs(best.y - y))) best = { id: it.id, y: mg.y };
      }
      st.actPreview = { x: b.x, y0: fixed, y1: best ? best.y : y, target: best?.id };
      core.drawOverlay();
    },
    end() {
      const P = st.actPreview;
      st.actPreview = null;
      st.active = false;
      const Mn = seqModel(core);
      if (!P?.target || !Mn) return;
      const r = moveActivationEdge(core.code, Mn, id, edge, P.target);
      if (r.reason) {
        core.toast(r.reason);
        return;
      }
      if (r.code === core.code) return;
      core.applyCode(r, core.i18n.t('history.resizeProcess'), { select: null });
      // keep the process selected: the one on that participant whose moved edge is nearest the target arrow
      const gn = seqGeom(core);
      let pick: { id: string; dist: number } | null = null;
      for (const [aid, ag] of gn?.activations ?? []) {
        if (ag.participant !== r.participant) continue;
        const dist = Math.abs((edge === 'top' ? ag.y0 : ag.y1) - P.y1) + Math.abs((edge === 'top' ? ag.y1 : ag.y0) - fixed);
        if (!pick || dist < pick.dist) pick = { id: aid, dist };
      }
      if (pick) core.select([{ kind: 'activation', id: pick.id }]);
    },
    cancel() {
      st.actPreview = null;
      st.active = false;
    },
  };
}

/**
 * Resize a block by dragging its top / bottom edge. The edge snaps one statement at a time: past the middle of the
 * next statement outside it is pulled in, past the middle of the last statement inside it is pushed out.
 */
function blockEdgeDrag(core: EditorCore, st: SeqState, hit: Hit, startId: string, edge: 'top' | 'bottom'): Gesture {
  let id = startId, began = false, reason: string | undefined;
  const p0 = hit.p;
  return {
    move(_dx, dy) {
      const y = p0.y + dy;
      for (let n = 0; n < 40; n++) {
        const { out, inn } = edgeAnchors(core, id, edge);
        let grow: boolean | null;
        if (edge === 'bottom') grow = out != null && y > out ? true : inn != null && y < inn ? false : null;
        else grow = out != null && y < out ? true : inn != null && y > inn ? false : null;
        if (grow === null) break;
        const M = seqModel(core);
        if (!M) break;
        const r = resizeBlockStep(core.code, M, id, edge, grow);
        if (r.code === core.code) {
          reason = r.reason;
          break;
        }
        if (!began) {
          core.begin();
          began = true;
        }
        reason = undefined;
        liveCode(core, r.code);
        const Mn = seqModel(core);
        const blk = Mn?.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.src === r.start);
        if (!blk) break;
        id = blk.id;
        core.select([{ kind: 'block', id }]);
        core.draw();
      }
    },
    end() {
      st.active = false;
      if (began) core.commit(core.i18n.t('history.resizeBlock'));
      if (reason) core.toast(reason);
    },
    cancel() {
      st.active = false;
      if (began) core.rollback();
    },
  };
}

/** Stretch a note over several participants (left / right edge handles). */
function noteEdgeDrag(core: EditorCore, st: SeqState, hit: Hit, id: string, edge: 'left' | 'right'): Gesture {
  let began = false;
  const p0 = hit.p;
  return {
    move(dx) {
      const M = seqModel(core), gm = seqGeom(core);
      const note = M?.items.find((x) => x.kind === 'note' && x.id === id);
      if (!M || !gm || !note || note.kind !== 'note') return;
      const order = M.participants.filter((p) => gm.participants.has(p.id)).map((p) => ({ id: p.id, x: gm.participants.get(p.id)!.x }));
      if (!order.length) return;
      const idx = (pid: string): number => order.findIndex((o) => o.id === pid);
      const span = note.targets.map(idx).filter((i) => i >= 0);
      if (!span.length) return;
      let lo = minOf(span), hi = maxOf(span);
      const x = p0.x + dx;
      const nearest = order.reduce((best, o, i) => (Math.abs(o.x - x) < Math.abs(order[best]!.x - x) ? i : best), 0);
      if (edge === 'left') lo = Math.min(nearest, hi);
      else hi = Math.max(nearest, lo);
      const r = setNoteSpan(core.code, M, id, order[lo]!.id, order[hi]!.id);
      if (r.code === core.code) return;
      if (!began) {
        core.begin();
        began = true;
      }
      liveCode(core, r.code);
      core.draw();
    },
    end() {
      st.active = false;
      if (began) core.commit(core.i18n.t('history.stretchNote'));
    },
    cancel() {
      st.active = false;
      if (began) core.rollback();
    },
  };
}

export function installSeqGestures(scope: SeqScope, st: SeqState): void {
  const core = scope.core;
  scope.gesture({
    id: 'sequence',
    priority: GESTURE.kind,
    down(ev, hit) {
      if (core.mode.peek() !== 'edit' || core.tool.peek() === 'hand' || core.spaceDown || ev.button !== 0 || !hit.handle || !seqModel(core)) return null;
      const h = hit.handle;
      const type = h.getAttribute('data-handle');
      const s = core.primary();
      let gst: Gesture | null = null;
      if (type === 'pmove') {
        core.run('moveSelection', Number(h.getAttribute('data-dir')) < 0 ? -1 : 1);
        return NOOP;
      }
      if (type === 'lifeline') gst = lifelineDrag(core, st, hit, h.getAttribute('data-id') ?? '');
      else if (type === 'actend') gst = actEndDrag(core, st, h.getAttribute('data-msg') ?? '', h.getAttribute('data-pid') ?? '');
      else if (type === 'aedge' && s?.kind === 'activation') gst = actEdgeDrag(core, st, s.id, h.getAttribute('data-edge') === 'bottom' ? 'bottom' : 'top');
      else if (type === 'bedge' && s?.kind === 'block') gst = blockEdgeDrag(core, st, hit, s.id, h.getAttribute('data-edge') === 'bottom' ? 'bottom' : 'top');
      else if (type === 'nedge' && s?.kind === 'note') gst = noteEdgeDrag(core, st, hit, s.id, h.getAttribute('data-edge') === 'right' ? 'right' : 'left');
      if (gst && (type === 'bedge' || type === 'nedge')) {
        const inner = gst;
        const done = (): void => {
          st.sizing = false;
          core.drawOverlay();
        };
        gst = {
          move(dx, dy, ev) {
            st.sizing = true;
            inner.move(dx, dy, ev);
            core.drawOverlay();
          },
          end(ev) {
            inner.end?.(ev);
            done();
          },
          cancel() {
            inner.cancel?.();
            done();
          },
        };
      }
      if (gst) {
        st.active = true;
        core.drawOverlay();
      }
      return gst;
    },
  });
}
