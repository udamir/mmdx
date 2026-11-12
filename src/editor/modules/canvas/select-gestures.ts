// Selection gestures (A.3 rows 27, 28, 34; A.2 row 17): pressing an item selects it (an item in a group selects the
// outermost group, Miro-like; Shift toggles) and drags it — one item, the multi-selection, or a copy with Alt — the
// corner handle resizes, and a press on the empty canvas drags the marquee.
import { withEdit } from '../../kinds/registry.js';
import { cloneItems, cloneMeta, moveItem, moveItems, type MoveOpts } from '../../../core/ops/index.js';
import { ensure as ensureMeta } from '../../../core/ops/meta-util.js';
import type { ItemRef } from '../../../core/types.js';
import type { Gesture, Hit, Sel } from '../../core.js';
import { inArea, samePrimary, selectable, selKey } from '../../lib/canvas.js';
import { GESTURE } from '../../lib/priorities.js';
import type { SelectScope, SelectState } from './select-state.js';

const NOOP: Gesture = { move: () => undefined };

/** `base` plus the items of `add` it does not have yet, in order (a Set of keys: linear for a big marquee, P5). */
function withAdded(base: readonly Sel[], add: readonly Sel[]): Sel[] {
  const out = [...base], have = new Set(base.map(selKey));
  for (const it of add) {
    const k = selKey(it);
    if (have.has(k)) continue;
    have.add(k);
    out.push(it);
  }
  return out;
}

export function installSelectGestures(scope: SelectScope, st: SelectState): void {
  const core = scope.core;
  const editing = (): boolean => core.mode.peek() === 'edit';
  /** An old version shows (History): its items are selected to copy them, never moved, resized or cloned. */
  const readOnly = (): boolean => !!core.version.peek();
  const isLane = (gid: string): boolean => core.isLane(gid);

  /** A gesture that previews metadata computed from the state at its start; one history step at the end. */
  const metaGesture = (label: string, apply: (dx: number, dy: number, ev: PointerEvent) => void): Gesture => {
    let began = false;
    return {
      move(dx, dy, ev) {
        if (!began) {
          core.begin();
          began = true;
        }
        apply(dx, dy, ev);
        core.draw();
      },
      end() {
        if (began) core.commit(label);
        began = false;
      },
      cancel() {
        if (began) core.rollback();
        began = false;
      },
    };
  };

  const moveGesture = (ref: ItemRef, part: string | null): Gesture => {
    const model = core.model, meta = core.meta, geom = core.geom;
    if (ref.kind === 'activation') return NOOP; // resized by its top / bottom handles
    return metaGesture('Move', (dx, dy, ev) => {
      const opts: MoveOpts = { snap: ev.altKey ? 0 : core.snap };
      if (part === 'label') opts.part = 'label';
      core.write({ meta: moveItem(model, meta, geom, ref, dx, dy, opts).meta });
    });
  };

  const multiMoveGesture = (keepSnapWithAlt = false): Gesture => {
    const model = core.model, meta = core.meta, geom = core.geom, sel = core.selection();
    return metaGesture('Move', (dx, dy, ev) => {
      const snap = ev.altKey && !keepSnapWithAlt ? 0 : core.snap;
      core.write({ meta: moveItems(model, meta, geom, sel, dx, dy, snap).meta });
    });
  };

  /** Alt/Option-drag: drag a copy, the originals stay. A click without moving copies nothing. */
  const cloneGesture = (items: readonly ItemRef[]): Gesture | null => {
    const res = cloneItems(core.code, core.meta, core.model, core.geom, items);
    if (!res) {
      if (core.model.type && !withEdit(core.model, (k) => k.altCopy)) core.toast('Copying by Alt-drag works in flowcharts and ER diagrams');
      return null;
    }
    core.begin();
    core.write({ code: res.code });
    core.write({ meta: res.meta });
    core.select(res.selection ?? []);
    core.draw();
    const root = core.dom.root;
    root.classList.add('copying');
    const model = core.model, meta = core.meta, geom = core.geom, sel = core.selection();
    return {
      move(dx, dy) {
        core.write({ meta: moveItems(model, meta, geom, sel, dx, dy, core.snap).meta }); // Alt means copy here: keep snapping
        core.draw();
      },
      end() {
        root.classList.remove('copying');
        core.commit('Copy');
      },
      cancel() {
        root.classList.remove('copying');
        core.rollback();
      },
    };
  };

  const resizeGesture = (): Gesture | null => {
    const s = core.primary();
    const b = s && core.boxOf(s);
    if (!s || !b) return null;
    const { kind, id } = s;
    if (core.getM(kind, id).locked) return NOOP;
    const meta0 = core.meta;
    // an icon or image node (T06): the handle sizes its asset — an icon stays square, a locked image keeps its aspect —
    // and the size goes to the code (`h` / `w` in its node data) when the drag ends, so stock Mermaid draws it the same
    const media = b.asset ? withEdit(core.model, (k, m) => k.media?.(m, s, core)) : null;
    const asset = media?.node ? b.asset : undefined;
    const g = metaGesture('Resize', (dx, dy, ev) => {
      st.sizing = s;
      core.write({ meta: cloneMeta(meta0) });
      const m = core.ensure(kind, id);
      const snap = (v: number): number => core.snapV(v, ev);
      if (asset && media) {
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        let w = Math.max(16, snap(asset.w + dx)), hh = Math.max(16, snap(asset.h + dy));
        if (media.node === 'icon') w = hh = Math.max(16, snap(asset.w + d));
        else if (media.constraint === 'on') {
          const k = asset.w / asset.h;
          if (Math.abs(dx) > Math.abs(dy)) hh = Math.max(16, Math.round(w / k));
          else w = Math.max(16, Math.round(hh * k));
        }
        m.w = w;
        m.h = hh;
        m.x = Math.round(b.x + (w - asset.w) / 2);
        m.y = Math.round(b.y + (hh - asset.h) / 2);
        return;
      }
      if (kind === 'participant') {
        // width grows around the centre (neighbours make room), height downwards; positions stay as they are
        m.w = Math.max(40, snap(b.w + 2 * dx));
        m.h = Math.max(24, snap(b.h + dy));
        return;
      }
      const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
      if (kind === 'group') {
        m.x = Math.round(x0);
        m.y = Math.round(y0);
        m.w = Math.max(40, snap(b.w + dx));
        m.h = Math.max(30, snap(b.h + dy));
      } else {
        // keep the top-left corner fixed while resizing (positions are centres)
        const w = Math.max(30, snap(b.w + dx)), hh = Math.max(20, snap(b.h + dy));
        m.w = w;
        m.h = hh;
        m.x = Math.round(x0 + w / 2);
        m.y = Math.round(y0 + hh / 2);
      }
    });
    /** The asset's new size moves from the gesture's metadata into the code (`setMedia`), in the same step. */
    let moved = false;
    const toCode = (): void => {
      if (!asset || !media || !moved) return;
      const m = core.getM(kind, id);
      const w = typeof m.w === 'number' ? m.w : undefined, hh = typeof m.h === 'number' ? m.h : undefined;
      if (w === undefined || hh === undefined) return;
      // Mermaid draws an icon max(h, w) square, `w` 48 when not written: below that, both are written
      const patch = media.node === 'icon' ? { h: hh, ...(media.w !== undefined || hh < 48 ? { w } : {}) } : { w, h: hh };
      const res = withEdit(core.model, (k, M) => k.setMedia?.(core.code, M, s, patch, core));
      if (!res) return;
      const meta = cloneMeta(core.meta);
      const own = ensureMeta(meta, kind, id);
      delete own.w;
      delete own.h;
      core.write({ code: res.code });
      core.write({ meta: meta });
    };
    // the size badge goes with the gesture
    return {
      move(dx, dy, ev) {
        moved = true;
        g.move(dx, dy, ev);
      },
      end(ev) {
        st.sizing = null;
        toCode();
        g.end?.(ev);
        core.drawOverlay();
      },
      cancel() {
        st.sizing = null;
        g.cancel?.();
        core.drawOverlay();
      },
    };
  };

  scope.gesture({
    id: 'canvas-resize',
    priority: GESTURE.handle,
    down(_ev, hit) {
      if (!editing() || readOnly() || hit.handle?.getAttribute('data-handle') !== 'resize') return null;
      return resizeGesture();
    },
  });

  scope.gesture({
    id: 'canvas-items',
    priority: GESTURE.item,
    down(ev: PointerEvent, hit: Hit) {
      if (!editing() || ev.button !== 0 || !hit.item || hit.handle) return null;
      let sel: Sel = hit.item;
      const part = hit.part;
      let redraw = false;
      // Clicking outside the group being edited leaves it.
      const entered = core.enteredGroup.peek();
      if (entered && !core.insideGroup(sel, entered)) {
        core.enterGroup(null);
        redraw = true;
      }
      // An item inside a group selects (and drags) the whole group, like in Miro.
      const gsel = !part ? core.groupTarget(sel, isLane) : null;
      if (gsel) sel = { kind: 'group', id: gsel };
      if (ev.shiftKey && !part) {
        core.toggleSelected(sel);
        core.draw();
        core.fire('panels');
        return NOOP;
      }
      const cur = core.selection();
      const multi = cur.length > 1;
      if (ev.altKey && !part && !readOnly()) {
        const items = multi && core.isSelected(sel) ? cur : [sel];
        const d = cloneGesture(items);
        if (d) return d;
      }
      if (multi && core.isSelected(sel)) {
        if (redraw) core.draw();
        return readOnly() ? NOOP : multiMoveGesture();
      }
      if (!samePrimary(core.primary(), sel) || multi) {
        core.select([sel]);
        redraw = true;
      }
      if (redraw) {
        core.draw();
        core.fire('panels');
      }
      return readOnly() ? NOOP : moveGesture(sel, part);
    },
  });

  scope.gesture({
    id: 'canvas-marquee',
    priority: GESTURE.background,
    down(ev, hit) {
      if (!editing() || ev.button !== 0 || hit.item || hit.handle) return null;
      let redraw = false;
      if (core.enteredGroup.peek()) {
        core.enterGroup(null);
        redraw = true;
      }
      // Rubber-band selection (Shift adds to the current selection). Dragged left to right it takes the items fully
      // inside (window); right to left, every item it touches (crossing).
      const base = ev.shiftKey ? core.selection() : [];
      if (!ev.shiftKey && core.selection().length) {
        core.select([]);
        redraw = true;
      }
      if (redraw) {
        core.draw();
        core.fire('panels');
      }
      const p0 = hit.p;
      // every kind of item counts
      const all = selectable(core);
      const finish = (): void => {
        st.marquee = null;
        core.drawOverlay();
        core.fire('panels');
      };
      return {
        move(dx, dy) {
          const x1 = p0.x + dx, y1 = p0.y + dy;
          st.marquee = { x0: p0.x, y0: p0.y, x1, y1 };
          const area = { x0: Math.min(p0.x, x1), x1: Math.max(p0.x, x1), y0: Math.min(p0.y, y1), y1: Math.max(p0.y, y1) };
          const crossing = x1 < p0.x;
          const hits = all.filter((it) => inArea(it, area, crossing)).map(({ kind, id }) => ({ kind, id }));
          // an unchanged selection fires nothing (core.select, P5); the band itself is drawn on every move
          core.select(withAdded(base, hits));
          core.drawOverlay();
        },
        end: finish,
        cancel: finish,
      };
    },
  });
}
