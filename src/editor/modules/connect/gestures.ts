// Connect gestures (A.4 rows 41–43): drag a connection dot to another item (a new connector), an end handle (move it
// on its box or re-attach it; a double press resets it), a bend point (move it, pull one out of a segment; a double
// press removes it).
import type { Side } from '../../../core/style.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import type { EditorCore, Gesture, Hit } from '../../core.js';
import { deepInside, endpointBox, endpointId, geomBoxOf, portOn, projectToBox, targetAt } from '../../lib/geometry.js';
import { GESTURE } from '../../lib/priorities.js';
import { gestureTx, metaGesture } from '../../ops/gesture.js';
import { createConnection, isLine, NOOP, reconnect, type LineKind } from './lib.js';
import type { ConnScope, ConnState } from './state.js';

/** Drag from a connection dot to another item (prototype `newDrag`). */
function newDrag(core: EditorCore, st: ConnState, hit: Hit, side: Side, src: ItemRef): Gesture | null {
  const srcBox = geomBoxOf(core, src.kind, src.id);
  if (!srcBox) return null;
  const a = portOn(srcBox, side, 0.5);
  const p0 = hit.p;
  st.linking = { a, b: a, target: null };
  return {
    move(dx, dy, ev) {
      const cur = { x: p0.x + dx, y: p0.y + dy };
      const t = targetAt(core, ev, src);
      const box = t && geomBoxOf(core, t.kind, t.id);
      if (t && box) {
        const auto = src.kind === 'participant' || deepInside(box, cur, core.viewport.state.k);
        const pr = auto ? null : projectToBox(box, cur, ev.altKey);
        const tip = pr ? portOn(box, pr.side, pr.at) : { x: box.x, y: box.y };
        st.linking = { a, b: tip, target: t };
        if (pr) {
          st.linking.side = pr.side;
          st.linking.at = pr.at;
        }
        st.magnets = auto ? null : { box, side: pr?.side, at: pr?.at };
      } else {
        st.linking = { a, b: cur, target: null };
        st.magnets = null;
      }
      core.drawOverlay();
    },
    end() {
      const L = st.linking;
      st.linking = null;
      st.magnets = null;
      st.active = false;
      if (L?.target) createConnection(core, src, side, L.target, L.side, L.at);
    },
    cancel() {
      st.linking = null;
      st.magnets = null;
      st.active = false;
    },
  };
}

/** Drag an end handle around its box (magnets; Alt = free) or onto another item (prototype `portDrag`). */
function portDrag(core: EditorCore, st: ConnState, hit: Hit, which: 'a' | 'b', kind: LineKind, id: string): Gesture | null {
  const box = endpointBox(core, kind, id, which);
  const sk = which === 'a' ? 'fromSide' : 'toSide', ak = which === 'a' ? 'fromAt' : 'toAt';
  const m0 = core.getM(kind, id);
  const orig = { side: m0[sk], at: m0[ak] };
  const current = endpointId(core, kind, id, which);
  const p0 = hit.p;
  const tx = gestureTx(core);
  let target: { t: ItemRef; side?: Side; at?: number } | null = null;
  if (box) st.magnets = { box, side: orig.side, at: orig.at };
  return {
    move(dx, dy, ev) {
      tx.begin();
      const m = core.ensure(kind, id);
      const cur = { x: p0.x + dx, y: p0.y + dy };
      const t = targetAt(core, ev);
      const tb = t && t.id !== current ? geomBoxOf(core, t.kind, t.id) : null;
      if (t && tb) {
        // hovering another item: preview the re-attachment, keep the current end untouched
        const pr = deepInside(tb, cur, core.viewport.state.k) ? null : projectToBox(tb, cur, ev.altKey);
        target = { t };
        if (pr) Object.assign(target, pr);
        if (orig.side === undefined) {
          delete m[sk];
          delete m[ak];
        } else {
          m[sk] = orig.side;
          if (orig.at === undefined) delete m[ak];
          else m[ak] = orig.at;
        }
        st.magnets = { box: tb, side: pr?.side, at: pr?.at };
        core.draw();
        return;
      }
      target = null;
      if (!box) return;
      const pr = projectToBox(box, cur, ev.altKey);
      m[sk] = pr.side;
      m[ak] = pr.at;
      st.magnets = { box, side: pr.side, at: pr.at };
      core.draw();
    },
    end() {
      st.magnets = null;
      st.active = false;
      if (target) {
        core.store.rollback();
        if (!reconnect(core, kind, id, which, target.t, target.side, target.at)) core.afterChange();
      } else tx.commit('Move connector end');
    },
    cancel() {
      st.magnets = null;
      st.active = false;
      tx.rollback();
    },
  };
}

/** Drag a bend point, or pull a new one out of the middle of a part (added on the first move). */
function bendDrag(core: EditorCore, st: ConnState, hit: Hit, handle: Element, kind: LineKind, id: string): Gesture {
  const isNew = handle.getAttribute('data-handle') === 'bendNew';
  const j = Number(handle.getAttribute(isNew ? 'data-i' : 'data-j'));
  let added = !isNew;
  const p0 = hit.p;
  // select the line (the overlay is redrawn; the pointer is captured by the canvas)
  const p = core.primary();
  if (!p || p.kind !== kind || p.id !== id) {
    st.hoverEdge = null;
    core.select([{ kind, id }]);
  }
  return metaGesture(core, 'Bend line', (dx, dy, ev) => {
    const m = core.ensure(kind, id);
    const pt: [number, number] = [core.snapV(p0.x + dx, ev), core.snapV(p0.y + dy, ev)];
    const pts = (m.points ?? []).map((q): [number, number] => [q[0], q[1]]);
    if (!added) {
      pts.splice(j, 0, pt);
      added = true;
    } else pts[j] = pt;
    m.points = pts;
  }, () => (st.active = false));
}

function removeBendPoint(core: EditorCore, kind: LineKind, id: string, j: number): void {
  core.change('Remove bend point', () => {
    const m = core.ensure(kind, id);
    m.points = (m.points ?? []).filter((_, i) => i !== j);
    if (!m.points.length) delete m.points;
    core.tidy(kind, id);
  });
}

function resetEnd(core: EditorCore, kind: LineKind, id: string, which: 'a' | 'b'): void {
  core.change('Reset connector end', () => {
    const m = core.ensure(kind, id);
    if (which === 'a') {
      delete m.fromSide;
      delete m.fromAt;
    } else {
      delete m.toSide;
      delete m.toAt;
    }
    core.tidy(kind, id);
  });
}

export function installConnectGestures(scope: ConnScope, st: ConnState): void {
  const core = scope.core;
  scope.gesture({
    id: 'connect',
    priority: GESTURE.handle,
    down(ev, hit) {
      if (core.mode.peek() !== 'edit' || core.tool.peek() === 'hand' || core.spaceDown || ev.button !== 0 || !hit.handle) return null;
      const h = hit.handle;
      const type = h.getAttribute('data-handle');
      let gst: Gesture | null = null;
      if (type === 'bend' || type === 'bendNew') {
        const kind = h.getAttribute('data-kind'), id = h.getAttribute('data-id') ?? '';
        if (!isLine(kind)) return null;
        if (st.bendPress.hit(`${kind}|${id}|${h.getAttribute('data-j')}`, ev, type === 'bend')) {
          removeBendPoint(core, kind, id, Number(h.getAttribute('data-j')));
          return NOOP;
        }
        gst = bendDrag(core, st, hit, h, kind, id);
      } else if (type === 'new') {
        const side = h.getAttribute('data-side') as Side | null;
        const kind = h.getAttribute('data-kind') as ItemKind | null;
        if (!side || !kind) return null;
        gst = newDrag(core, st, hit, side, { kind, id: h.getAttribute('data-id') ?? '' });
      } else if (type === 'end') {
        const s = core.primary();
        const which = h.getAttribute('data-end') === 'b' ? 'b' : 'a';
        if (!s || !isLine(s.kind)) return null;
        if (st.endPress.hit(`${s.kind}|${s.id}|${which}`, ev)) {
          resetEnd(core, s.kind, s.id, which);
          return NOOP;
        }
        gst = portDrag(core, st, hit, which, s.kind, s.id);
      }
      if (gst) {
        st.active = true;
        core.drawOverlay();
      }
      return gst;
    },
  });
}
