// The selection overlay (A.3 rows 27, 28): a box around each selected item, the resize handle of a single one and its
// size while it is resized, the halo of connectors in a multi-selection, the entered group, the page and the marquee.
import { opsKind } from '../../../core/kinds/registry.js';
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import { LINE_KINDS, selKey, sizeBadge } from '../../lib/canvas.js';
import { PAINT } from '../../lib/priorities.js';
import type { SelectScope, SelectState } from './select-state.js';

export const SELECT_CSS = /* css */ `
.sel-box { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 5 3; pointer-events: none; }
.sel-handle { fill: #fff; stroke: var(--accent); stroke-width: 1.5; cursor: nwse-resize; }
.size-badge { fill: var(--accent); pointer-events: none; }
.size-badge-text { fill: #fff; font-weight: 600; font-variant-numeric: tabular-nums; pointer-events: none; }
.sel-line { fill: none; stroke: var(--accent); stroke-opacity: .35; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.marquee { fill: rgba(79,70,229,.08); stroke: var(--accent); pointer-events: none; }
.marquee.crossing { fill: rgba(16,185,129,.08); stroke: #10b981; }
.entered-box { fill: none; stroke: var(--accent); pointer-events: none; opacity: .8; }
.page-sel { fill: none; stroke: var(--accent); pointer-events: none; }
.canvas .el.selected > :first-child { filter: drop-shadow(0 0 1.5px var(--accent)); }
.mode-view .canvas .el.node, .mode-view .canvas .el.entity, .mode-view .canvas .el.participant { cursor: default; }
/* Alt/Option: dragging copies (flowcharts and ER diagrams) */
.ed.alt-copy.mode-edit .canvas .el.node, .ed.alt-copy.mode-edit .canvas .el.entity, .ed.alt-copy.mode-edit .canvas .el.group > :first-child { cursor: copy; }
.ed.copying, .ed.copying * { cursor: copy !important; }
.mode-view .canvas .el[data-link] { cursor: pointer; }
`;

export function installSelectionOverlay(scope: SelectScope, st: SelectState): void {
  const core = scope.core;
  /** An old version shows (History): its items are selected to copy them, never moved, resized or cloned. */
  const readOnly = (): boolean => !!core.version.peek();
  scope.painter({
    id: 'canvas-select',
    order: PAINT.selection,
    paint(k) {
      const out: SceneNode[] = [];
      const sel = core.selection();
      const entered = core.enteredGroup.peek();
      const g = core.geom;
      if (entered) {
        const eb = core.boxOf({ kind: 'group', id: entered });
        if (eb && !eb.hidden) {
          const p = 6 / k;
          out.push(el('rect', { class: 'entered-box', x: eb.x - eb.w / 2 - p, y: eb.y - eb.h / 2 - p, width: eb.w + 2 * p, height: eb.h + 2 * p, rx: 8 / k, 'stroke-width': 2 / k }, 'entered-box'));
        }
      }
      if (core.pageSelected.peek() && !sel.length) {
        const b = core.result.result.bounds, p = 3 / k;
        out.push(el('rect', { class: 'page-sel', x: b.x - p, y: b.y - p, width: b.w + 2 * p, height: b.h + 2 * p, 'stroke-width': 2 / k }, 'page-sel'));
      }
      const rect = (b: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } =>
        ({ x: b.x - b.w / 2 - 4 / k, y: b.y - b.h / 2 - 4 / k, w: b.w + 8 / k, h: b.h + 8 / k });
      // connectors in a multi-selection: a halo along the line (they have no box)
      if (sel.length > 1) {
        const drawnLines = new Map<string, { d?: string; points?: readonly (readonly [number, number])[] }>();
        if (sel.some((it) => LINE_KINDS.has(it.kind)))
          for (const x of (g.type ? opsKind(g.type)?.drawn(g) : undefined) ?? []) if (!('box' in x)) drawnLines.set(selKey(x.ref), x);
        for (const it of sel) {
          if (!LINE_KINDS.has(it.kind)) continue;
          const line = drawnLines.get(selKey(it));
          const d = line?.d ?? (line?.points?.length ? `M${line.points.map(([x, y]) => `${x},${y}`).join('L')}` : '');
          if (d) out.push(el('path', { class: 'sel-line', d, 'stroke-width': 7 / k }, `sel-line:${selKey(it)}`));
        }
      }
      for (const it of sel) {
        const b = core.boxOf(it);
        if (!b || b.hidden) continue;
        const r = rect(b);
        out.push(el('rect', { class: 'sel-box', x: r.x, y: r.y, width: r.w, height: r.h, 'stroke-width': 1.5 / k, 'stroke-dasharray': `${5 / k} ${3 / k}` }, `sel:${selKey(it)}${it.foot ? ':foot' : ''}`));
      }
      const one = core.primary();
      const b = one && core.boxOf(one);
      if (one && b && !b.hidden && !readOnly() && one.kind !== 'note' && one.kind !== 'block' && one.kind !== 'activation' && one.kind !== 'box') {
        const r = rect(b), hs = 9 / k;
        out.push(el('rect', { class: 'sel-handle', 'data-handle': 'resize', x: r.x + r.w - hs / 2, y: r.y + r.h - hs / 2, width: hs, height: hs, 'stroke-width': 1.5 / k }, 'resize'));
      }
      const sb = st.sizing && core.boxOf(st.sizing);
      // under the item, clear of its bottom connector dot (participants have none)
      if (sb && !sb.hidden) out.push(...sizeBadge(sb, k, st.sizing!.kind === 'participant' ? 12 : 32));
      if (st.marquee) {
        const m = st.marquee;
        // right to left: a crossing selection (dashed), left to right: a window (solid)
        const crossing = m.x1 < m.x0;
        const attrs: Record<string, string | number> = { class: crossing ? 'marquee crossing' : 'marquee', x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0), 'stroke-width': 1 / k };
        if (crossing) attrs['stroke-dasharray'] = `${5 / k} ${3 / k}`;
        out.push(el('rect', attrs, 'marquee'));
      }
      return out;
    },
  });
}
