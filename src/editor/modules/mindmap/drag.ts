// Dragging a mindmap node (T08 §3.7): re-parent it (drop on a node) or reorder it (between siblings, an insertion
// line shows where), a first-level branch across the root switches sides, ⌥-drag drops a copy; and the overlay: the
// + handle and the fold handle of the selected node, the drop preview.
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { MindmapModel } from '../../../core/model.js';
import { cloneMeta, ensure, tidy } from '../../../core/ops/meta-util.js';
import { addMindChild, remapMindMeta, reparentMind } from '../../../core/ops/mindmap.js';
import { descendantsOf } from '../../../core/parse/mindmap.js';
import type { MindmapGeometry } from '../../../core/render/types.js';
import { el, g } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { Point } from '../../../core/types.js';
import type { EditorCore, Gesture, Hit } from '../../core.js';
import type { ModuleScope } from '../../../view/module.js';
import { GESTURE, PAINT } from '../../lib/priorities.js';
import { applyAt, mindGeom, mindModel, NOOP, selectedNode, toggleFold, type Drag, type Drop } from './lib.js';

export interface MindDragState {
  drag: Drag | null;
}

export function installMindmapDrag(scope: ModuleScope<EditorCore>, st: MindDragState): void {
  const core = scope.core;
  const editing = (): boolean => core.mode.peek() === 'edit' && !core.version.peek();
  // ---- the + handle, the fold handle, the drop preview ---------------------------------------------------------

  /** The point just outside a node on its outer side (`gap` screen px). */
  const outer = (b: { x: number; y: number; w: number; h: number; side?: 'l' | 'r' | 'd' }, gap: number): Point => {
    const s = b.side ?? 'r';
    return s === 'd' ? { x: b.x, y: b.y + b.h / 2 + gap } : { x: b.x + (s === 'l' ? -1 : 1) * (b.w / 2 + gap), y: b.y };
  };

  scope.painter({
    id: 'mindmap',
    exclusive: () => !!st.drag,
    order: PAINT.kind,
    paint(k) {
      const gm = mindGeom(core), M = mindModel(core);
      if (!gm || !M) return [];
      const out: SceneNode[] = [];
      if (st.drag) {
        const b = gm.nodes.get(st.drag.id);
        const d = st.drag.drop;
        if (d) {
          const t = gm.nodes.get(d.mark.id);
          if (t) {
            if (d.mark.at === 'on') out.push(el('rect', { class: 'mm-drop-on', x: t.x - t.w / 2 - 4 / k, y: t.y - t.h / 2 - 4 / k, width: t.w + 8 / k, height: t.h + 8 / k, rx: 8 / k, 'stroke-width': 2 / k }));
            else {
              const vertical = t.side === 'd';
              const pos = d.mark.at === 'before' ? -1 : 1;
              out.push(vertical
                ? el('path', { class: 'mm-drop-line', d: `M${t.x + pos * (t.w / 2 + 6 / k)},${t.y - t.h / 2} v${t.h}`, 'stroke-width': 3 / k })
                : el('path', { class: 'mm-drop-line', d: `M${t.x - t.w / 2},${t.y + pos * (t.h / 2 + 6 / k)} h${t.w}`, 'stroke-width': 3 / k }));
            }
          }
        }
        if (b) out.push(el('rect', { class: 'mm-ghost', x: st.drag.p.x - b.w / 2, y: st.drag.p.y - b.h / 2, width: b.w, height: b.h, rx: 8 / k, 'stroke-width': 1.5 / k }));
        return out;
      }
      const id = editing() ? selectedNode(core) : null;
      const b = id ? gm.nodes.get(id) : undefined;
      if (!id || !b || b.hidden || core.inlineEditing) return out;
      const r = 9 / k;
      // past the +N badge of a folded branch
      const p = outer(b, 18 / k + (core.getM('node', id).collapsed === true ? 40 : 0));
      out.push(g({ class: 'mm-add', 'data-handle': 'mm-add', 'data-id': id }, [
        el('circle', { cx: p.x, cy: p.y, r, 'stroke-width': 1.5 / k }),
        el('path', { d: `M${p.x - r / 2},${p.y} h${r} M${p.x},${p.y - r / 2} v${r}`, 'stroke-width': 1.8 / k }),
      ], { key: 'mm:add' }));
      const n = M.nodes.get(id);
      if (n?.children.length) {
        const folded = core.getM('node', id).collapsed === true;
        const q = b.side === 'd' ? { x: p.x + 24 / k, y: p.y } : { x: p.x, y: p.y - 24 / k };
        const a = r / 2.2;
        // a chevron pointing at the node folds; pointing away unfolds
        const s = (b.side === 'l' ? -1 : 1) * (folded ? 1 : -1);
        const chev = b.side === 'd' ? `M${q.x - a},${q.y - s * a / 2} L${q.x},${q.y + s * a / 2} L${q.x + a},${q.y - s * a / 2}` : `M${q.x - s * a / 2},${q.y - a} L${q.x + s * a / 2},${q.y} L${q.x - s * a / 2},${q.y + a}`;
        out.push(g({ class: 'mm-fold-h', 'data-handle': 'mm-fold', 'data-id': id }, [
          el('circle', { cx: q.x, cy: q.y, r: r * 0.85, 'stroke-width': 1.5 / k }),
          el('path', { d: chev, fill: 'none', 'stroke-width': 1.6 / k }),
        ], { key: 'mm:fold' }));
      }
      return out;
    },
  });

  // ---- drag to re-parent or reorder ------------------------------------------------------------------------------

  /** Where a node dragged to `p` would land (null: nowhere it can go). */
  const dropAt = (M: MindmapModel, gm: MindmapGeometry, id: string, p: Point): Drop | null => {
    const banned = new Set([id, ...descendantsOf(M, id)]);
    let best: { id: string; d: number } | null = null;
    for (const [nid, b] of gm.nodes) {
      if (banned.has(nid) || b.hidden) continue;
      const inside = Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2;
      if (inside) return { parent: nid, index: M.nodes.get(nid)!.children.filter((c) => c !== id).length, mark: { id: nid, at: 'on' }, ...sideOf(M, gm, nid, p) };
      const dx = Math.max(0, Math.abs(p.x - b.x) - b.w / 2), dy = Math.max(0, Math.abs(p.y - b.y) - b.h / 2);
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { id: nid, d };
    }
    if (!best) return null;
    const t = M.nodes.get(best.id)!, tb = gm.nodes.get(best.id)!;
    // between siblings: before or after the nearest node (not the root, which has none)
    if (!t.parent) return { parent: t.id, index: t.children.filter((c) => c !== id).length, mark: { id: t.id, at: 'on' }, ...sideOf(M, gm, t.id, p) };
    const sibs = M.nodes.get(t.parent)!.children.filter((c) => c !== id);
    const before = tb.side === 'd' ? p.x < tb.x : p.y < tb.y;
    const index = sibs.indexOf(t.id) + (before ? 0 : 1);
    return { parent: t.parent, index, mark: { id: t.id, at: before ? 'before' : 'after' }, ...sideOf(M, gm, t.parent, p) };
  };
  /** A branch dropped under the root goes to the side of the root the pointer is on (both-sides layout). */
  const sideOf = (M: MindmapModel, gm: MindmapGeometry, parent: string, p: Point): { side?: 'l' | 'r' } => {
    const rb = M.root ? gm.nodes.get(M.root) : undefined;
    if (parent !== M.root || !rb || core.meta.canvas.mindLayout === 'right' || core.meta.canvas.mindLayout === 'down') return {};
    return { side: p.x < rb.x ? 'l' : 'r' };
  };

  const dragGesture = (id: string, p0: Point, copy: boolean): Gesture => ({
    move(dx, dy) {
      const M = mindModel(core), gm = mindGeom(core);
      if (!M || !gm) return;
      const p = { x: p0.x + dx, y: p0.y + dy };
      st.drag = { id, p, copy, drop: dropAt(M, gm, id, p) };
      core.drawOverlay();
    },
    end() {
      const d = st.drag;
      st.drag = null;
      const M = mindModel(core), gm = mindGeom(core);
      core.drawOverlay();
      if (!d?.drop || !M || !gm) return;
      const { parent, index, side } = d.drop;
      const n = M.nodes.get(id)!;
      const curSide = gm.nodes.get(id)?.side;
      const sameSpot = !d.copy && n.parent === parent && M.nodes.get(parent)!.children.indexOf(id) === index;
      const switchSide = side && side !== curSide;
      if (sameSpot && !switchSide) return;
      const res = sameSpot ? { code: core.code, line: n.line } : reparentMind(core.code, M, id, parent, index, d.copy);
      if (res.reason) {
        core.toast(res.reason);
        return;
      }
      // the moved node's side of the root, when it is (or becomes) a first-level branch
      const withSide = (from: MindmapModel, to: MindmapModel, nid: string): DiagramMeta => {
        const meta = cloneMeta(remapMindMeta(core.meta, from, to));
        if (side && parent === to.root) {
          ensure(meta, 'node', nid).side = side;
        } else if (meta.nodes?.[nid]) {
          delete meta.nodes[nid]!.side;
          tidy(meta, 'node', nid);
        }
        return meta;
      };
      if (sameSpot) {
        const meta = withSide(M, M, id);
        core.setMeta(core.i18n.t('history.switchSide'), meta);
        return;
      }
      applyAt(core, res, core.i18n.t(d.copy ? 'history.copyNode' : 'history.moveNode'), false, withSide);
    },
    cancel() {
      st.drag = null;
      core.drawOverlay();
    },
  });

  scope.gesture({
    id: 'mindmap',
    priority: GESTURE.kind,
    down(ev, hit: Hit) {
      const M = mindModel(core);
      if (!M || !editing() || core.tool.peek() === 'hand' || core.spaceDown || ev.button !== 0) return null;
      const h = hit.handle;
      const type = h?.getAttribute('data-handle');
      if (type === 'mm-add' || type === 'mm-fold') {
        const id = h!.getAttribute('data-id') ?? '';
        return {
          move: () => undefined,
          click: () => {
            if (type === 'mm-fold') toggleFold(core, id);
            else applyAt(core, addMindChild(core.code, M, id), core.i18n.t('history.addNode'), true);
          },
        };
      }
      if (h || !hit.item || hit.item.kind !== 'node' || !M.nodes.has(hit.item.id) || ev.shiftKey) return null;
      const id = hit.item.id;
      // the +N badge of a folded branch unfolds it
      if (ev.target instanceof Element && ev.target.closest('.mm-fold')) {
        return { move: () => undefined, click: () => toggleFold(core, id) };
      }
      const multi = core.selection().length > 1 && core.isSelected(hit.item);
      if (!multi && !(core.selection().length === 1 && core.isSelected(hit.item))) {
        core.select([hit.item]);
        core.draw();
        core.fire('panels');
      }
      if (multi || id === M.root || core.getM('node', id).locked) return NOOP;
      return dragGesture(id, hit.p, ev.altKey);
    },
  });
}
