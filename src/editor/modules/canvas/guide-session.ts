// Smart guides of a move or a resize (task 005): at the press, the boxes the moving items can line up with (the
// kind's guide items that are drawn and on screen, not the moving items, their contents or the groups around them)
// and their parent's hand-sized frame are frozen; each pointer move asks the engine where to snap, and leaves in the
// selection state what the guide overlay draws.
import { opsKind } from '../../../core/kinds/registry.js';
import type { EditorCore, Sel } from '../../core.js';
import { withEdit } from '../../kinds/registry.js';
import { snapBox, type Anchor, type GuideInput, type Rect } from '../../lib/align-guides.js';
import { selKey } from '../../lib/canvas.js';
import type { GuideFrame, SelectState } from './select-state.js';

/** The snap distance, in screen px. */
const TOL_PX = 6;
/** Around the visible canvas, what is this much bigger still pulls the shape (what the user cannot see does not). */
const VIEW_GROW = 0.25;
const ALL: readonly Anchor[] = ['lo', 'mid', 'hi'];
/** The lines that snap: all of a moved box, the right and bottom edges of a resized one (its top-left stays). */
const ANCHORS: Record<'move' | 'resize', GuideInput['anchors']> = { move: { x: ALL, y: ALL }, resize: { x: ['hi'], y: ['hi'] } };

export interface GuideSession {
  /** The delta to apply and the grid per axis: 0 on an axis a guide snapped (Alt: the raw delta, no grid, no guides). */
  adjust(dx: number, dy: number, ev: { altKey?: boolean } | null): { dx: number; dy: number; snap: { x: number; y: number } };
  /** Clears the guides (release and cancel). */
  done(): void;
}

const toRect = (b: { x: number; y: number; w: number; h: number }): Rect => ({ x0: b.x - b.w / 2, y0: b.y - b.h / 2, x1: b.x + b.w / 2, y1: b.y + b.h / 2 });

/** The union of the items' drawn boxes (they move as one block); null when none is drawn. */
export function unionOf(core: EditorCore, refs: readonly Sel[]): Rect | null {
  let u: Rect | null = null;
  for (const it of refs) {
    const b = core.boxOf(it);
    if (!b || b.hidden) continue;
    const r = toRect(b);
    u = u ? { x0: Math.min(u.x0, r.x0), y0: Math.min(u.y0, r.y0), x1: Math.max(u.x1, r.x1), y1: Math.max(u.y1, r.y1) } : r;
  }
  return u;
}

/** The visible canvas in diagram units, grown by `VIEW_GROW` (null: the canvas has no size yet). */
function visibleArea(core: EditorCore): Rect | null {
  const { w, h } = core.viewport.size;
  if (!w || !h) return null;
  const { k, tx, ty } = core.viewport.state, gx = (w * VIEW_GROW) / 2, gy = (h * VIEW_GROW) / 2;
  return { x0: (-gx - tx) / k, y0: (-gy - ty) / k, x1: (w + gx - tx) / k, y1: (h + gy - ty) / k };
}

/** Keys of what moves with the items (their contents) and what is around them (the groups they are in). */
function excluded(core: EditorCore, refs: readonly Sel[]): Set<string> {
  const out = new Set(refs.map(selKey));
  for (const r of refs) {
    if (r.kind === 'group') {
      const d = core.groupDescendants(r.id);
      for (const n of d.nodes) out.add(selKey({ kind: d.leaf ?? 'node', id: n }));
      for (const g of d.groups) out.add(selKey({ kind: 'group', id: g }));
    }
    for (let p = core.parentOf(r), n = 0; p && n < 64; p = core.parentOf({ kind: 'group', id: p }), n++) out.add(selKey({ kind: 'group', id: p }));
  }
  return out;
}

/** Null when the kind has no guides for these items or nothing can be aligned to. */
export function guideSession(core: EditorCore, st: SelectState, refs: readonly Sel[], mode: 'move' | 'resize'): GuideSession | null {
  const kinds = withEdit(core.model, (k) => k.guides);
  const g = core.geom;
  if (!kinds || !g.type) return null;
  // what moves: drawn boxes that are not locked (a locked item stays where it is)
  const moving = refs.filter((r) => !core.getM(r.kind, r.id).locked && unionOf(core, [r]));
  const box0 = unionOf(core, moving);
  if (!box0 || moving.some((r) => !kinds.includes(r.kind))) return null;
  const skip = excluded(core, moving), view = visibleArea(core);
  const others: Rect[] = [];
  for (const x of opsKind(g.type)?.drawn(g) ?? []) {
    if (!('box' in x) || x.box.hidden || !kinds.includes(x.ref.kind) || skip.has(selKey(x.ref))) continue;
    const r = toRect(x.box);
    if (!view || (r.x0 < view.x1 && r.x1 > view.x0 && r.y0 < view.y1 && r.y1 > view.y0)) others.push(r);
  }
  // the parent's frame counts when the items share it and it is sized by hand (an auto frame follows its contents)
  const pids = new Set(moving.map((r) => core.parentOf(r)));
  const pid = pids.size === 1 ? [...pids][0] : null;
  const parent = pid && core.getM('group', pid).w ? unionOf(core, [{ kind: 'group', id: pid }]) : null;
  if (!others.length && !parent) return null;
  const frame: GuideFrame = { refs: moving, others, parent, anchors: ANCHORS[mode] };
  const tol = TOL_PX / core.viewport.state.k;
  return {
    adjust(dx, dy, ev) {
      if (ev?.altKey) {
        st.guides = null;
        return { dx, dy, snap: { x: 0, y: 0 } };
      }
      st.guides = frame;
      const box = mode === 'move'
        ? { x0: box0.x0 + dx, y0: box0.y0 + dy, x1: box0.x1 + dx, y1: box0.y1 + dy }
        : { ...box0, x1: box0.x1 + dx, y1: box0.y1 + dy };
      const s = snapBox({ ...frame, box, tol });
      return { dx: dx + (s.dx ?? 0), dy: dy + (s.dy ?? 0), snap: { x: s.dx === null ? core.snap : 0, y: s.dy === null ? core.snap : 0 } };
    },
    done() {
      st.guides = null;
    },
  };
}
