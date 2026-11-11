// The sequence module's overlay: ◀ ▶ swap arrows of the selected participant, the edge handles of the selected note,
// block or process (and its size while dragged), the lifeline hover circle and message end circles, and the link /
// process previews of a drag.
import { el, g, text } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import { maxOf, minOf } from '../../../core/geom.js';
import type { Sel } from '../../core.js';
import { sizeBadge } from '../../lib/canvas.js';
import { PAINT } from '../../lib/priorities.js';
import { llBars, seqGeom, seqModel } from './lib.js';
import { seqBusy, type SeqScope, type SeqState } from './state.js';

export function installSeqPainter(scope: SeqScope, st: SeqState): void {
  const core = scope.core;
  /** ◀ ▶ next to the selected participant: swap it with its neighbour. */
  const participantArrows = (b: { x: number; y: number; w: number }, s: Sel, k: number): SceneNode[] => {
    const M = seqModel(core);
    if (!M || core.selection().length !== 1 || !core.isSelected(s)) return [];
    const r = 11 / k, off = 20 / k;
    const order = M.participants.map((p) => p.id), i = order.indexOf(s.id);
    return ([[-1, b.x - b.w / 2 - off], [1, b.x + b.w / 2 + off]] as const).map(([dir, x]) => {
      const can = i + dir >= 0 && i + dir < order.length;
      const a = 4.2 / k, y = b.y;
      const tri = dir < 0
        ? `M${x + a * 0.6},${y - a} L${x - a * 0.8},${y} L${x + a * 0.6},${y + a} Z`
        : `M${x - a * 0.6},${y - a} L${x + a * 0.8},${y} L${x - a * 0.6},${y + a} Z`;
      return g({ class: can ? 'pmove' : 'pmove off', 'data-handle': 'pmove', 'data-dir': dir }, [
        el('circle', { cx: x, cy: y, r, 'stroke-width': 1.6 / k }),
        el('path', { d: tri }),
      ], { key: `seq:pmove:${dir}` });
    });
  };

  /** Edge handles of the selected note (left / right), block (top / bottom) or process (top / bottom). */
  const edgeHandles = (s: Sel, k: number): SceneNode[] => {
    const b = core.boxOf(s);
    if (!b || b.hidden) return [];
    const out: SceneNode[] = [];
    if (s.kind === 'note') {
      const hw = 9 / k, hh = Math.min(30 / k, b.h * 0.8);
      for (const [edge, x] of [['left', b.x - b.w / 2], ['right', b.x + b.w / 2]] as const)
        out.push(el('rect', { class: 'nedge', 'data-handle': 'nedge', 'data-edge': edge, x: x - hw / 2, y: b.y - hh / 2, width: hw, height: hh, rx: hw / 2, 'stroke-width': 1.5 / k }, `seq:nedge:${edge}`));
    } else if (s.kind === 'block' || s.kind === 'activation') {
      const [hw, hh, handle] = s.kind === 'block' ? [44 / k, 9 / k, 'bedge'] : [22 / k, 8 / k, 'aedge'];
      for (const [edge, y] of [['top', b.y - b.h / 2], ['bottom', b.y + b.h / 2]] as const)
        out.push(el('rect', { class: 'bedge', 'data-handle': handle, 'data-edge': edge, x: b.x - hw / 2, y: y - hh / 2, width: hw, height: hh, rx: hh / 2, 'stroke-width': 1.5 / k }, `seq:${handle}:${edge}`));
    }
    return out;
  };

  /** Hover circle on a lifeline, and the end circles of the hovered / selected message. */
  const seqDots = (k: number): SceneNode[] => {
    const M = seqModel(core), gm = seqGeom(core);
    if (!M || !gm) return [];
    const r = 5.5 / k, out: SceneNode[] = [];
    const L = st.llHover, pg = gm.participants.get(L?.id ?? '');
    if (L && pg) {
      const dot = (cx: number, side: 'l' | 'r' | null): SceneNode =>
        g({ class: 'll-dot', 'data-handle': 'lifeline', 'data-id': L.id, 'data-side': side ?? undefined }, [
          el('circle', { cx, cy: L.y, r: r * 2, fill: 'transparent', stroke: 'none' }),
          el('circle', { class: 'll-dot-c', cx, cy: L.y, r, 'stroke-width': 1.6 / k }),
        ], { key: `seq:ll:${L.id}:${side ?? ''}` });
      // over a process: no circle inside the bar — one on each side that has participants, to draw a message from there
      const bars = llBars(core, L.id, L.y);
      if (bars.length) {
        const order = M.participants.map((p) => p.id), i = order.indexOf(L.id), gap = r * 2.2;
        const pad = 9; // the bars' hover area (act-hit in the renderer): the circles sit just outside it
        const left = minOf(bars.map((a) => a.x - a.w / 2)) - pad, right = maxOf(bars.map((a) => a.x + a.w / 2)) + pad;
        if (i > 0) out.push(dot(left - gap, 'l'));
        if (i < order.length - 1) out.push(dot(right + gap, 'r'));
      } else out.push(dot(pg.x, null));
    }
    const p = core.primary();
    const ids = new Set([st.hoverMsg, p?.kind === 'message' ? p.id : null].filter((x): x is string => !!x));
    for (const id of ids) {
      const it = M.items.find((x) => x.kind === 'message' && x.id === id), mg = gm.messages.get(id);
      if (!it || it.kind !== 'message' || !mg || it.from === it.to) continue;
      for (const [pid, ex] of [[it.from, mg.x0], [it.to, mg.x1]] as const)
        out.push(g({ class: 'act-dot', 'data-handle': 'actend', 'data-msg': id, 'data-pid': pid }, [
          el('circle', { cx: ex, cy: mg.y, r: r * 2, fill: 'transparent', stroke: 'none' }),
          el('circle', { class: 'act-dot-c', cx: ex, cy: mg.y, r, 'stroke-width': 1.6 / k }),
        ], { key: `seq:act:${id}:${pid}` }));
    }
    return out;
  };

  const actPreviewSvg = (k: number): SceneNode[] => {
    const P = st.actPreview!;
    const w = Number((core.result.theme.sequence?.activation as { w?: unknown } | undefined)?.w) || 10;
    const y = Math.min(P.y0, P.y1), h = Math.max(2, Math.abs(P.y1 - P.y0));
    return [
      el('rect', { class: 'act-preview', x: P.x - w / 2, y, width: w, height: h, 'stroke-width': 1.5 / k, 'stroke-dasharray': `${4 / k} ${3 / k}` }),
      ...sizeBadge({ x: P.x, y: y + h / 2, w, h }, k),
    ];
  };

  const linkPreview = (k: number): SceneNode[] => {
    const L = st.linking!;
    if (L.self) {
      // the loop a self-message is drawn as (same proportions as the renderer)
      const x = L.a.x, y = L.a.y;
      return [
        el('path', { class: 'link-preview', d: `M${x},${y} H${x + 40} Q${x + 54},${y} ${x + 54},${y + 12} Q${x + 54},${y + 24} ${x + 40},${y + 24} H${x + 2}`, fill: 'none', 'stroke-width': 2 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }),
        text({ class: 'link-hint', x: x + 62, y: y + 16, 'font-size': 12 / k }, [{ text: 'to itself', x: x + 62, y: y + 16 }]),
      ];
    }
    return [
      el('path', { class: 'link-preview', d: `M${L.a.x},${L.a.y} L${L.b.x},${L.b.y}`, 'stroke-width': 2 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }),
      el('circle', { class: 'link-tip', cx: L.b.x, cy: L.b.y, r: 4 / k }),
    ];
  };

  scope.painter({
    id: 'sequence',
    exclusive: () => !!st.linking || !!st.actPreview,
    order: PAINT.kind,
    paint(k) {
      if (!seqModel(core)) return [];
      if (st.linking) return linkPreview(k);
      if (st.actPreview) return actPreviewSvg(k);
      const out: SceneNode[] = [];
      const s = core.primary();
      if (s) {
        if (s.kind === 'participant') {
          const b = core.boxOf(s);
          if (b && !b.hidden) out.push(...participantArrows(b, s, k));
        } else out.push(...edgeHandles(s, k));
        const b = st.sizing ? core.boxOf(s) : null;
        if (b && !b.hidden) out.push(...sizeBadge(b, k));
      }
      if (!seqBusy(core, st)) out.push(...seqDots(k));
      return out;
    },
  });
}
