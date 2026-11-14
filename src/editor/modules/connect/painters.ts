// The connect module's overlay: the connection dots of the hovered or selected item, the magnets of a drag's target,
// the end handles of the selected connector, the bend points of the hovered / selected line, and the link preview.
import { outerBox } from '../../../core/render/common.js';
import { el, g } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { Side } from '../../../core/style.js';
import type { CenterBox, ItemRef, Point } from '../../../core/types.js';
import type { Sel } from '../../core.js';
import { canConnect, MAGNETS, portOn } from '../../lib/geometry.js';
import { PAINT } from '../../lib/priorities.js';
import { isLine } from './lib.js';
import { connBusy, edgeGeom, type ConnScope, type ConnState } from './state.js';

export function installConnectPainter(scope: ConnScope, st: ConnState): void {
  const core = scope.core;
  const connectDots = (b: CenterBox & { stack?: unknown; shape?: string }, s: Sel, k: number): SceneNode[] => {
    if (s.kind === 'participant') return []; // messages start from lifelines instead (sequence module: ◀ ▶)
    if (!canConnect(core, s.kind, s.id) || core.getM(s.kind, s.id).locked) return [];
    const box: CenterBox & { shape?: string } = { ...outerBox(b, b.stack), ...(b.shape ? { shape: b.shape } : {}) };
    const off = 16 / k, r = 6 / k;
    return (['t', 'r', 'b', 'l'] as Side[]).map((side) => {
      const p = portOn(box, side, 0.5);
      const x = p.x + p.n.x * off, y = p.y + p.n.y * off;
      return g({ class: 'conn-dot', 'data-handle': 'new', 'data-side': side, 'data-kind': s.kind, 'data-id': s.id }, [
        el('circle', { cx: x, cy: y, r: r * 1.9, fill: 'transparent', stroke: 'none' }),
        el('circle', { class: 'conn-dot-c', cx: x, cy: y, r, 'stroke-width': 1.6 / k }),
        el('path', { d: `M${x - r * 0.5},${y}h${r}M${x},${y - r * 0.5}v${r}`, 'stroke-width': 1.6 / k }),
      ]);
    });
  };

  const magnetDots = (k: number): SceneNode[] => {
    const mg = st.magnets;
    if (!mg) return [];
    const r = 3.6 / k, out: SceneNode[] = [];
    for (const side of ['t', 'r', 'b', 'l'] as Side[])
      for (const at of MAGNETS) {
        const p = portOn(mg.box, side, at);
        const on = side === mg.side && Math.abs(at - (mg.at ?? -1)) < 0.001;
        out.push(el('circle', { class: on ? 'magnet on' : 'magnet', cx: p.x, cy: p.y, r: on ? r * 1.6 : r, 'stroke-width': 1.4 / k }));
      }
    return out;
  };

  const endHandles = (s: Sel, k: number): SceneNode[] => {
    if (!isLine(s.kind)) return [];
    const gm = edgeGeom(core, s);
    if (!gm) return [];
    const r = 6.5 / k, m = core.getM(s.kind, s.id);
    const dot = (p: Point, which: 'a' | 'b', fixed: boolean): SceneNode =>
      el('circle', { class: fixed ? 'end-handle fixed' : 'end-handle', 'data-handle': 'end', 'data-end': which, cx: p.x, cy: p.y, r, 'stroke-width': 2 / k });
    return [dot(gm.a, 'a', !!m.fromSide), dot(gm.b, 'b', !!m.toSide)];
  };

  const bendHandles = (it: ItemRef | null, k: number): SceneNode[] => {
    if (!it || !isLine(it.kind)) return [];
    const gm = edgeGeom(core, it);
    if (!gm) return [];
    const out: SceneNode[] = [];
    gm.mids.forEach((p, i) =>
      out.push(el('circle', { class: 'bend-new', 'data-handle': 'bendNew', 'data-kind': it.kind, 'data-id': it.id, 'data-i': i, cx: p.x, cy: p.y, r: 4.5 / k, 'stroke-width': 1.5 / k })));
    (gm.points ?? []).forEach(([x, y], j) =>
      out.push(el('circle', { class: 'bend-pt', 'data-handle': 'bend', 'data-kind': it.kind, 'data-id': it.id, 'data-j': j, cx: x, cy: y, r: 5 / k, 'stroke-width': 1.5 / k })));
    return out;
  };

  const linkPreview = (k: number): SceneNode[] => {
    const L = st.linking!;
    return [
      ...magnetDots(k),
      el('path', { class: 'link-preview', d: `M${L.a.x},${L.a.y} L${L.b.x},${L.b.y}`, 'stroke-width': 2 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }),
      el('circle', { class: 'link-tip', cx: L.b.x, cy: L.b.y, r: 4 / k }),
    ];
  };

  scope.painter({
    id: 'connect',
    exclusive: () => !!st.linking,
    order: PAINT.connect,
    paint(k) {
      const sel = core.selection();
      const single = sel.length === 1 ? sel[0]! : null;
      if (single && isLine(single.kind)) {
        const ends = endHandles(single, k);
        // bend points on top: placed by hand
        if (ends.length) return [...magnetDots(k), ...ends, ...bendHandles(single, k)];
      }
      if (st.linking) return linkPreview(k);
      const out: SceneNode[] = [];
      const b = single ? core.boxOf(single) : null;
      if (single && b && !b.hidden) out.push(...connectDots(b, single, k));
      const hov = core.hover;
      if (hov && !core.isSelected(hov) && !connBusy(core, st)) {
        const hb = core.boxOf(hov);
        if (hb && !hb.hidden) out.push(...connectDots(hb, hov, k));
      }
      if (st.hoverEdge && !connBusy(core, st)) out.push(...bendHandles(st.hoverEdge, k));
      return out;
    },
  });

}
