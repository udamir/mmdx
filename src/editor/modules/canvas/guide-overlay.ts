// The smart guides' overlay (task 005): while an item is moved or resized, dashed lines where its edges or centre line
// up with the items around it, and markers on the gaps or parent margins that are equal, for the item where it was
// drawn. Constant on-screen size at any zoom (n / k), the accent colour of both themes.
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import { guidesFor, type Axis } from '../../lib/align-guides.js';
import { PAINT } from '../../lib/priorities.js';
import { unionOf } from './guide-session.js';
import type { SelectScope, SelectState } from './select-state.js';

export const GUIDE_CSS = /* css */ `
.guide-line { fill: none; stroke: var(--accent); pointer-events: none; }
.guide-gap, .guide-margin { fill: none; stroke: var(--accent); pointer-events: none; }
`;

/** A distance marker `|—|` from a to b along `axis`, at `cross` across it; ticks `t` long each way. */
function marker(axis: Axis, s: { a: number; b: number; cross: number }, t: number): string {
  const { a, b, cross: c } = s;
  return axis === 'x'
    ? `M${a},${c - t}V${c + t}M${a},${c}H${b}M${b},${c - t}V${c + t}`
    : `M${c - t},${a}H${c + t}M${c},${a}V${b}M${c - t},${b}H${c + t}`;
}

export function installGuideOverlay(scope: SelectScope, st: SelectState): void {
  const core = scope.core;
  scope.painter({
    id: 'canvas-guides',
    order: PAINT.guides,
    paint(k) {
      const f = st.guides;
      const box = f && unionOf(core, f.refs);
      if (!f || !box) return [];
      const out: SceneNode[] = [];
      const sw = 1 / k, over = 8 / k, tick = 4 / k;
      guidesFor({ ...f, box }).forEach((g, i) => {
        if (g.type === 'line') {
          const [x1, y1, x2, y2] = g.axis === 'x' ? [g.at, g.from - over, g.at, g.to + over] : [g.from - over, g.at, g.to + over, g.at];
          out.push(el('line', { class: 'guide-line', x1, y1, x2, y2, 'stroke-width': sw, 'stroke-dasharray': `${4 / k} ${3 / k}` }, `guide:${g.axis}:${g.at}`));
        } else if (g.type === 'gap') {
          g.segs.forEach((s, j) => out.push(el('path', { class: 'guide-gap', d: marker(g.axis, s, tick), 'stroke-width': sw }, `gap:${g.axis}:${i}.${j}`)));
        } else {
          for (const s of g.segs) out.push(el('path', { class: 'guide-margin', d: marker(s.axis, s, tick), 'stroke-width': sw }, `margin:${s.axis}:${s.a}`));
        }
      });
      return out;
    },
  });
}
