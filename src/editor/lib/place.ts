// Where the editor's floating bars go (the toolbars and the ER table's): the canvas strip they may use and the box of the item they belong to.
import { opsKind } from '../../core/kinds/registry.js';
import type { Rect } from '../../core/types.js';
import type { EditorCore, Sel } from '../core.js';
import { itemEls } from './canvas.js';

/** Horizontal strip of the canvas not covered by the tool dock or the open panel stacks (wrap coords). */
export function freeStrip(core: EditorCore): [number, number] {
  const wrap = core.dom.wrap;
  const wr = wrap.getBoundingClientRect();
  const shown = (e: Element | null): e is HTMLElement => {
    if (!(e instanceof HTMLElement) || e.offsetParent === null) return false;
    const cs = getComputedStyle(e);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const dock = wrap.querySelector('.tool-dock'), stacks = core.stackInsets.peek();
  let lo = shown(dock) ? dock.getBoundingClientRect().right - wr.left : 0;
  if (stacks) lo = Math.max(lo, stacks.left);
  const hi = wr.width - (stacks?.right ?? 0) - 10;
  lo += 10;
  return hi - lo > 200 ? [lo, hi] : [8, wr.width - 8];
}

/** The selected item's box on screen (wrap coords): connectors take their path, label and bend points. */
export function anchorRect(core: EditorCore, s: Sel): Rect | null {
  const wr = core.dom.wrap.getBoundingClientRect();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (l: number, t: number, r: number, b: number): void => {
    x0 = Math.min(x0, l);
    y0 = Math.min(y0, t);
    x1 = Math.max(x1, r);
    y1 = Math.max(y1, b);
  };
  const els = itemEls(core, s);
  if (s.kind === 'edge' || s.kind === 'rel') {
    for (const e of els) {
      const parts = e.getAttribute('data-part') === 'label' ? [e] : Array.from(e.querySelectorAll('.hit'));
      for (const n of parts) {
        const r = n.getBoundingClientRect();
        if (r.width || r.height) add(r.left, r.top, r.right, r.bottom);
      }
    }
    const g = core.geom;
    const eg = g.type ? opsKind(g.type)?.edge?.(g, s) : undefined;
    const pts = (eg as { points?: [number, number][] } | undefined)?.points ?? [];
    const sv = core.dom.svg.getBoundingClientRect();
    for (const [x, y] of pts) {
      const p = core.toScreen({ x, y });
      add(p.x + sv.left, p.y + sv.top, p.x + sv.left, p.y + sv.top);
    }
    if (x0 !== Infinity) {
      const pad = 10;
      return { x: x0 - pad - wr.left, y: y0 - pad - wr.top, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    }
  }
  for (const n of els) {
    if (s.foot !== undefined && n.hasAttribute('data-foot') !== !!s.foot && s.kind === 'participant') continue;
    const r = n.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    add(r.left, r.top, r.right, r.bottom);
  }
  if (x0 === Infinity) {
    // no DOM box (jsdom, hidden item): fall back to the geometry
    const b = core.boxOf(s);
    if (!b) return null;
    const r = core.rectOnScreen({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
    return r;
  }
  return { x: x0 - wr.left, y: y0 - wr.top, w: x1 - x0, h: y1 - y0 };
}
