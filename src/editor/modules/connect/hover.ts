// Connect hover (prototype hoverConnect): the item whose dots show (kept while the pointer is near it), the line whose
// bend points show (kept near its handles), and the browser's dblclick after a double press on a handle swallowed.
import type { ItemKind, ItemRef } from '../../../core/types.js';
import type { Sel } from '../../core.js';
import { canConnect } from '../../lib/geometry.js';
import { sameRef } from '../../lib/refs.js';
import { isLine } from './lib.js';
import { connBusy, edgeGeom, type ConnScope, type ConnState } from './state.js';

export function installConnectHover(scope: ConnScope, st: ConnState): void {
  const core = scope.core;
  const hoverConnect = (ev: PointerEvent, t: Element): void => {
    if (core.tool.peek() === 'hand' || core.tool.peek() === 'paint') return;
    if (t.closest('.conn-dot')) return;
    let it: Sel | null = null;
    const e = t.closest('.el');
    const kind = e?.getAttribute('data-kind') as ItemKind | null, id = e?.getAttribute('data-id') ?? '';
    if (e && kind && !e.hasAttribute('data-part') && canConnect(core, kind, id)) it = { kind, id };
    else if (core.hover) {
      const b = core.boxOf(core.hover), p = core.toDiagram(ev), m = 30 / core.viewport.state.k;
      if (b && Math.abs(p.x - b.x) <= b.w / 2 + m && Math.abs(p.y - b.y) <= b.h / 2 + m) it = core.hover;
    }
    if (!sameRef(it, core.hover)) {
      core.uiState.hover.set(it);
      core.drawOverlay();
    }
  };
  const hoverBend = (ev: PointerEvent, t: Element): void => {
    if (t.closest('[data-handle="bend"], [data-handle="bendNew"]')) return;
    const e = t.closest('.el.edge, .el.rel, .el.elabel');
    const kind = e?.getAttribute('data-kind');
    let it: ItemRef | null = e && isLine(kind) ? { kind, id: e.getAttribute('data-id') ?? '' } : null;
    // off the line but still close to one of its handles (a point can sit beside a right-angled line): keep them
    if (!it && st.hoverEdge) {
      const gm = edgeGeom(core, st.hoverEdge);
      const p = core.toDiagram(ev), near = 12 / core.viewport.state.k;
      if (gm && [...gm.mids, ...(gm.points ?? []).map(([x, y]) => ({ x, y }))].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < near)) return;
      it = null;
    }
    if (sameRef(it, st.hoverEdge)) return;
    st.hoverEdge = it;
    core.drawOverlay();
  };
  scope.canvas('pointermove', (ev) => {
    if (ev.buttons || connBusy(core, st) || core.mode.peek() !== 'edit' || !(ev.target instanceof Element)) return;
    hoverConnect(ev, ev.target);
    hoverBend(ev, ev.target);
  });
  // a double press on a bend point / end handle is handled on pointerdown: the browser's own dblclick that follows
  // must not reach the text editor (it would edit the line's label)
  scope.canvas('dblclick', (ev) => {
    const onHandle = ev.target instanceof Element && ev.target.closest('[data-handle="bend"], [data-handle="bendNew"], [data-handle="end"]');
    if (onHandle || ev.timeStamp - Math.max(st.bendPress.at, st.endPress.at) < 800) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }
  }, { capture: true });
  scope.on('model', () => {
    st.hoverEdge = null;
  });

}
