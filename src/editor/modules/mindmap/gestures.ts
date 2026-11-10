// Mindmap gestures (T08 §3.7): the outline keys — Tab adds a child, Enter a sibling (on the root: a child),
// Shift+Tab / ⌥← moves a node out, ⌥→ under the node above it, ⌥↑ / ⌥↓ trades it with a sibling, the arrows walk the
// tree, F2 edits the text, Space folds or unfolds a branch (metadata `collapsed`), Shift+Delete deletes a node and
// keeps its children; the `+` handle on the node's outer side adds a child and the fold handle beside it folds;
// dragging a node re-parents it (drop on a node) or reorders it (between siblings: an insertion line shows where), a
// first-level branch dropped across the root switches sides (metadata `side`), ⌥-drag drops a copy; ⌘D duplicates a
// branch, ⌘V pastes copied branches (or indented text, a Markdown list, a Mermaid mindmap) under the selected node.
// The mindmap module's lazy part (index.ts loads it the first time a mindmap is shown): its keys answer through the
// shortcuts the module registered when it was installed, so they keep their place before the canvas's own.
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { MindmapModel } from '../../../core/model.js';
import { reparse } from '../../../core/kinds/registry.js';
import { cloneMeta, ensure, tidy } from '../../../core/ops/meta-util.js';
import {
  addMindChild, addMindSibling, blockText, cloneMind, indentMind, liftMind, mindNodeAt, moveMind, outdentMind, pasteMindLines, pasteMindText, remapMindMeta,
  reparentMind,
} from '../../../core/ops/mindmap.js';
import { descendantsOf, parseMindmap } from '../../../core/parse/mindmap.js';
import type { MindmapGeometry } from '../../../core/render/types.js';
import { el, g } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { Point } from '../../../core/types.js';
import type { EditorCore, Gesture, Hit, Sel } from '../../core.js';
import type { ModuleScope } from '../../../view/module.js';
import { mindmapKeys } from './index.js';
import { maxOf } from '../../../core/geom.js';

export { MINDMAP_CSS } from './css.js';

const NOOP: Gesture = { move: () => undefined };

const mindModel = (core: EditorCore): MindmapModel | null => (core.model.type === 'mindmap' ? core.model : null);
const mindGeom = (core: EditorCore): MindmapGeometry | null => (core.geom.type === 'mindmap' ? core.geom : null);

/** Where a dragged node would go: under `parent` at `index` (among its other children), shown on `mark`. */
interface Drop {
  parent: string;
  index: number;
  /** The node it lands on (a child of it), or the sibling the insertion line is drawn against. */
  mark: { id: string; at: 'on' | 'before' | 'after' };
  /** A first-level branch dropped on this side of the root. */
  side?: 'l' | 'r';
}

interface Drag {
  id: string;
  p: Point;
  drop: Drop | null;
  copy: boolean;
}

/** The single selected node, if any. */
function selectedNode(core: EditorCore): string | null {
  const s = core.selection();
  return s.length === 1 && s[0]!.kind === 'node' && mindModel(core)?.nodes.has(s[0]!.id) ? s[0]!.id : null;
}

/** Applies a code rewrite and selects the node on `line` of the result (and edits its text when `edit`). */
function applyAt(core: EditorCore, res: { code: string; line?: number; reason?: string }, label: string, edit = false, meta?: (M: MindmapModel, N: MindmapModel, id: string) => DiagramMeta): boolean {
  if (res.reason) {
    core.toast(res.reason);
    return false;
  }
  const M = mindModel(core);
  const N = reparse(res.code);
  if (!M || N.type !== 'mindmap' || res.code === core.code) return false;
  const n = res.line !== undefined ? mindNodeAt(N, res.line) : undefined;
  const sel: Sel[] = n ? [{ kind: 'node', id: n.id }] : [];
  const ok = core.applyCode(meta && n ? { code: res.code, meta: meta(M, N, n.id) } : { code: res.code }, label, { select: sel });
  if (ok && edit && n) setTimeout(() => {
    if (core.isSelected(sel[0]!) && !core.run('inlineEdit', sel[0]!)) core.run('setPanel', 'properties', true);
  }, 0);
  return ok;
}

/** Folds or unfolds a branch (metadata `collapsed`, one undo step). */
function toggleFold(core: EditorCore, id: string): void {
  const n = mindModel(core)?.nodes.get(id);
  if (!n?.children.length) return;
  const folded = core.getM('node', id).collapsed === true;
  core.change(folded ? 'Unfold' : 'Fold', () => {
    const m = core.ensure('node', id);
    if (folded) delete m.collapsed;
    else m.collapsed = true;
    core.tidy('node', id);
  });
}

/** Activates the mindmap gestures in the module's scope (its keys through `mindmapKeys`). */
export function activateMindmap(scope: ModuleScope<EditorCore>): () => void {
  const core = scope.core;
  const offs: (() => void)[] = [];
  let drag: Drag | null = null;
  const root = core.dom.root;
  const onRoot = (ev: KeyboardEvent): boolean => (ev.composedPath()[0] ?? ev.target) === root;
  const editing = (): boolean => core.mode.peek() === 'edit' && !core.version.peek();
  /** A key for the selected node of a mindmap, with the canvas focused. */
  const target = (ev: KeyboardEvent): { M: MindmapModel; id: string } | null => {
    const M = mindModel(core);
    const id = M && onRoot(ev) && editing() ? selectedNode(core) : null;
    return M && id ? { M, id } : null;
  };
  const keyOp = (f: (M: MindmapModel, id: string) => { code: string; line?: number; reason?: string }, label: string, edit = false) => (ev: KeyboardEvent): boolean => {
    const t = target(ev);
    if (!t) return false;
    applyAt(core, f(t.M, t.id), label, edit);
    return true;
  };

  /** Arrow keys walk the tree: up / down to a sibling, toward the root or into the first child (by side). */
  const walk = (ev: KeyboardEvent): boolean => {
    const t = target(ev);
    const gm = mindGeom(core);
    if (!t || !gm) return false;
    const n = t.M.nodes.get(t.id)!;
    const b = gm.nodes.get(t.id);
    const side = b?.side ?? 'r';
    const parent = n.parent, kids = n.children.filter((c) => gm.nodes.has(c));
    const sibs = parent ? t.M.nodes.get(parent)!.children.filter((c) => gm.nodes.get(c)?.side === side) : [];
    const i = sibs.indexOf(t.id);
    const down = side === 'd';
    const key = ev.key;
    const along = down ? (key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0) : key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
    const outward = down ? key === 'ArrowDown' : (key === 'ArrowRight') === (side !== 'l');
    let next: string | undefined;
    if (along) next = sibs[i + along];
    else if (outward) next = kids.find((c) => !n.parent || gm.nodes.get(c)?.side === side) ?? kids[0];
    else next = parent ?? undefined;
    // the root: right and left go to the first branch on that side
    if (!n.parent && !along) next = kids.find((c) => gm.nodes.get(c)?.side === (key === 'ArrowLeft' ? 'l' : key === 'ArrowUp' ? 'l' : 'r')) ?? kids[0];
    if (next) {
      core.select([{ kind: 'node', id: next }]);
      core.draw();
      core.fire('panels');
    }
    return true;
  };

  const duplicate = (ev: KeyboardEvent): boolean => {
    const M = mindModel(core);
    if (!M || !onRoot(ev) || !editing()) return false;
    const refs = core.selection().filter((r) => r.kind === 'node' && r.id !== M.root);
    if (!refs.length) return false;
    const res = cloneMind(core.code, M, refs);
    const N = reparse(res.code);
    if (N.type !== 'mindmap' || !res.map) return true;
    // the copies take the originals' looks (positions and folds are their own)
    const meta = cloneMeta(remapMindMeta(core.meta, M, N));
    for (const [from, to] of Object.entries(res.map)) {
      const look = core.meta.nodes?.[from];
      if (!look) continue;
      const { dx: _x, dy: _y, side: _s, collapsed: _c, locked: _l, ...rest } = look;
      if (Object.keys(rest).length) Object.assign(ensure(meta, 'node', to), structuredClone(rest));
    }
    const tops = refs.filter((r) => !refs.some((o) => o.id !== r.id && descendantsOf(M, o.id).includes(r.id))).map((r) => res.map![r.id]).filter((x): x is string => !!x);
    core.applyCode({ code: res.code, meta }, 'Duplicate', { select: tops.map((id) => ({ kind: 'node', id })) });
    return true;
  };

  /** ⌘V: copied branches (this map's, or another's from their content) under the selected node, else the root. */
  const paste = (ev: KeyboardEvent): boolean => {
    const M = mindModel(core);
    const data = core.clipboard;
    if (!M || !onRoot(ev) || !editing() || data?.type !== 'mindmap' || !M.root) return false;
    const here = data.items.every((r) => M.nodes.has(r.id));
    const src = here ? M : data.content ? parseMindmap(data.content.code) : null;
    const code = here ? core.code : data.content?.code ?? '';
    if (!src) return false;
    const ids = data.items.map((r) => r.id).filter((id) => src.nodes.has(id));
    const tops = ids.filter((id) => !ids.some((o) => o !== id && descendantsOf(src, o).includes(id)));
    const lines = tops.flatMap((id) => blockText(src, code, id));
    const parent = selectedNode(core) ?? M.root;
    const res = pasteMindLines(core.code, M, parent, lines);
    if (res.line < 0) return true;
    const N = reparse(res.code);
    const sel: Sel[] = [];
    if (N.type === 'mindmap') {
      let at = res.line;
      for (let k = 0; k < tops.length; k++) {
        const n = mindNodeAt(N, at);
        if (!n) break;
        sel.push({ kind: 'node', id: n.id });
        at = Math.max(n.endLine, maxOf(descendantsOf(N, n.id).map((d) => N.nodes.get(d)!.endLine))) + 1;
      }
    }
    core.applyCode({ code: res.code }, 'Paste', { select: sel });
    return true;
  };

  const lift = (ev: KeyboardEvent): boolean => {
    const t = target(ev);
    if (!t) return false;
    const r = liftMind(core.code, t.M, t.id);
    if (r.reason) core.toast(r.reason);
    else {
      const meta = cloneMeta(core.meta);
      delete meta.nodes?.[t.id];
      const N = reparse(r.code);
      core.applyCode({ code: r.code, meta: N.type === 'mindmap' ? remapMindMeta(meta, t.M, N) : meta }, 'Delete', { select: [] });
    }
    return true;
  };

  // Space folds on release, so Space+drag still pans
  let spacePan = false;
  scope.listen(root, 'pointerdown', () => {
    if (core.spaceDown) spacePan = true;
  });
  scope.listen(root, 'keyup', (ev) => {
    if (ev.key !== ' ') return;
    const pan = spacePan;
    spacePan = false;
    const t = target(ev);
    if (!pan && t) toggleFold(core, t.id);
  });

  const keys = mindmapKeys(core);
  Object.assign(keys, {
    child: keyOp((M, id) => addMindChild(core.code, M, id), 'Add node', true),
    sibling: keyOp((M, id) => addMindSibling(core.code, M, id), 'Add node', true),
    outdent: keyOp((M, id) => outdentMind(core.code, M, id), 'Move node'),
    indent: keyOp((M, id) => indentMind(core.code, M, id), 'Move node'),
    up: keyOp((M, id) => moveMind(core.code, M, id, -1), 'Move node'),
    down: keyOp((M, id) => moveMind(core.code, M, id, 1), 'Move node'),
    walk,
    edit: (ev: KeyboardEvent): boolean => {
      const t = target(ev);
      if (!t) return false;
      if (!core.run('inlineEdit', { kind: 'node', id: t.id })) core.run('setPanel', 'properties', true);
      return true;
    },
    lift,
    duplicate,
    paste,
  });
  offs.push(() => {
    for (const k of Object.keys(keys)) delete keys[k];
  });

  // indented text or a Markdown list pasted on a node becomes its subtree
  scope.listen(root, 'paste', (ev) => {
    const M = mindModel(core);
    const e = ev as ClipboardEvent;
    if (!M || !editing() || core.inlineEditing || (e.composedPath()[0] ?? e.target) !== root) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.trim() || e.clipboardData?.files.length) return;
    const parent = selectedNode(core) ?? M.root;
    if (!parent) return;
    e.preventDefault();
    applyAt(core, pasteMindText(core.code, M, parent, text), 'Paste');
  });

  // ---- the + handle, the fold handle, the drop preview ---------------------------------------------------------

  /** The point just outside a node on its outer side (`gap` screen px). */
  const outer = (b: { x: number; y: number; w: number; h: number; side?: 'l' | 'r' | 'd' }, gap: number): Point => {
    const s = b.side ?? 'r';
    return s === 'd' ? { x: b.x, y: b.y + b.h / 2 + gap } : { x: b.x + (s === 'l' ? -1 : 1) * (b.w / 2 + gap), y: b.y };
  };

  offs.push(core.addOverlay({
    id: 'mindmap',
    exclusive: () => !!drag,
    order: 80,
    paint(k) {
      const gm = mindGeom(core), M = mindModel(core);
      if (!gm || !M) return [];
      const out: SceneNode[] = [];
      if (drag) {
        const b = gm.nodes.get(drag.id);
        const d = drag.drop;
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
        if (b) out.push(el('rect', { class: 'mm-ghost', x: drag.p.x - b.w / 2, y: drag.p.y - b.h / 2, width: b.w, height: b.h, rx: 8 / k, 'stroke-width': 1.5 / k }));
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
  }));

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
      drag = { id, p, copy, drop: dropAt(M, gm, id, p) };
      core.dragging = true;
      core.drawOverlay();
    },
    end() {
      const d = drag;
      drag = null;
      core.dragging = false;
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
        core.change('Switch side', () => core.store.meta.set(meta));
        return;
      }
      applyAt(core, res, d.copy ? 'Copy node' : 'Move node', false, withSide);
    },
    cancel() {
      drag = null;
      core.dragging = false;
      core.drawOverlay();
    },
  });

  offs.push(core.addGestureSource({
    id: 'mindmap',
    priority: 90,
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
            else applyAt(core, addMindChild(core.code, M, id), 'Add node', true);
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
  }));
  offs.push(core.on('model', () => {
    drag = null;
  }));

  return () => {
    for (const off of offs) off();
    drag = null;
  };
}
