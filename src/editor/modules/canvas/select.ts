// Canvas selection (A.3 rows 27, 28, 34; A.2 rows 17, 23; §13): click / Shift-click / marquee / ⌘A selection with
// Miro-like groups (a click selects the outermost group, double-click enters it; Esc or a click outside leaves it),
// moving (single, multi, Alt-drag copy, connector labels, locked items), resizing with the corner handle, keyboard
// nudge, the selection overlay, View-mode links and hover highlight, roving keyboard focus and announcements.
// Ported from prototype app.js (`decorateGroupEdit`, pointer handlers, `moveDrag`, `resizeDrag`, `multiMoveDrag`,
// `cloneDrag`, `nudge`, `nudgeMulti`, `updateMarquee`, `finishMarquee`, `selectAll`, `drawOverlay` boxes).
import { opsKind, withKind } from '../../../core/kinds/registry.js';
import { withEdit } from '../../kinds/registry.js';
import { cloneItems, cloneMeta, moveItem, moveItems, type MoveOpts } from '../../../core/ops/index.js';
import { ensure as ensureMeta } from '../../../core/ops/meta-util.js';
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import { clearHighlight, hoverHighlight } from '../../../dom/highlight.js';
import type { Gesture, Hit, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { menuLinks, openLinkMenu } from '../../../view/link-menu.js';
import { connectionCount, elementAt, inArea, itemLabel, LINE_KINDS, markSelection, samePrimary, selectable, selKey, sizeBadge } from './shared.js';

const NOOP: Gesture = { move: () => undefined };

const KIND_NAME: Record<ItemKind, string> = {
  node: 'node', group: 'group', edge: 'connector', participant: 'participant', message: 'message', note: 'note',
  block: 'block', box: 'box', activation: 'process', entity: 'table', rel: 'relationship',
};


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

export const canvasSelectModule: EditorModule = {
  id: 'canvas-select',
  css: [SELECT_CSS],
  install(scope) {
    const core = scope.core;
    const svg = core.dom.svg;
    let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
    // the item being resized: its size is shown under it while the handle is dragged
    let sizing: Sel | null = null;
    let destroyed = false;

    const isLane = (gid: string): boolean => core.isLane(gid);
    const editing = (): boolean => core.mode.peek() === 'edit';
    /** An old version shows (History): its items are selected to copy them, never moved, resized or cloned. */
    const readOnly = (): boolean => !!core.version.peek();

    // ---- group editing ------------------------------------------------------------------------------------------

    const enterGroup = (gid: string): void => {
      core.enteredGroup.set(gid);
      core.select([]);
      core.draw();
      core.fire('panels');
    };
    const exitGroup = (): void => {
      const gid = core.enteredGroup.peek();
      if (!gid) return;
      core.enteredGroup.set(null);
      core.select(core.store.exists({ kind: 'group', id: gid }) ? [{ kind: 'group', id: gid }] : []);
      core.draw();
      core.fire('panels');
    };

    /** Marks what is inside the group being edited (the rest fades): that, Esc and a click outside are the whole mode. */
    const decorateGroupEdit = (): void => {
      const gid = editing() ? core.enteredGroup.peek() : null;
      for (const n of Array.from(core.dom.body.querySelectorAll('.el.in-edit'))) n.classList.remove('in-edit');
      if (!gid) return;
      const inside = (kind: string | null, id: string | null): boolean =>
        (kind === 'node' || kind === 'group') && id !== null && core.insideGroup({ kind, id }, gid);
      for (const n of Array.from(core.dom.body.querySelectorAll('.el'))) {
        const kind = n.getAttribute('data-kind'), id = n.getAttribute('data-id');
        const ok = kind === 'edge' ? inside('node', n.getAttribute('data-from')) && inside('node', n.getAttribute('data-to')) : inside(kind, id);
        if (ok) n.classList.add('in-edit');
      }
    };

    // ---- overlay: selection boxes, resize handle, entered group, page, marquee -----------------------------------

    scope.onDispose(core.addOverlay({
      id: 'canvas-select',
      order: 10,
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
        const sb = sizing && core.boxOf(sizing);
        // under the item, clear of its bottom connector dot (participants have none)
        if (sb && !sb.hidden) out.push(...sizeBadge(sb, k, sizing!.kind === 'participant' ? 12 : 32));
        if (marquee) {
          const m = marquee;
          // right to left: a crossing selection (dashed), left to right: a window (solid)
          const crossing = m.x1 < m.x0;
          const attrs: Record<string, string | number> = { class: crossing ? 'marquee crossing' : 'marquee', x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0), 'stroke-width': 1 / k };
          if (crossing) attrs['stroke-dasharray'] = `${5 / k} ${3 / k}`;
          out.push(el('rect', attrs, 'marquee'));
        }
        return out;
      },
    }));

    // ---- gestures ------------------------------------------------------------------------------------------------

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
        core.store.meta.set(moveItem(model, meta, geom, ref, dx, dy, opts).meta);
      });
    };

    const multiMoveGesture = (keepSnapWithAlt = false): Gesture => {
      const model = core.model, meta = core.meta, geom = core.geom, sel = core.selection();
      return metaGesture('Move', (dx, dy, ev) => {
        const snap = ev.altKey && !keepSnapWithAlt ? 0 : core.snap;
        core.store.meta.set(moveItems(model, meta, geom, sel, dx, dy, snap).meta);
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
      core.store.code.set(res.code);
      core.store.meta.set(res.meta);
      core.select(res.selection ?? []);
      core.draw();
      core.dom.root.classList.add('copying');
      const model = core.model, meta = core.meta, geom = core.geom, sel = core.selection();
      return {
        move(dx, dy) {
          core.store.meta.set(moveItems(model, meta, geom, sel, dx, dy, core.snap).meta); // Alt means copy here: keep snapping
          core.draw();
        },
        end() {
          core.dom.root.classList.remove('copying');
          core.commit('Copy');
        },
        cancel() {
          core.dom.root.classList.remove('copying');
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
        sizing = s;
        core.store.meta.set(cloneMeta(meta0));
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
        core.store.code.set(res.code);
        core.store.meta.set(meta);
      };
      // the size badge goes with the gesture
      return {
        move(dx, dy, ev) {
          moved = true;
          g.move(dx, dy, ev);
        },
        end(ev) {
          sizing = null;
          toCode();
          g.end?.(ev);
          core.drawOverlay();
        },
        cancel() {
          sizing = null;
          g.cancel?.();
          core.drawOverlay();
        },
      };
    };

    scope.onDispose(core.addGestureSource({
      id: 'canvas-resize',
      priority: 100,
      down(_ev, hit) {
        if (!editing() || readOnly() || hit.handle?.getAttribute('data-handle') !== 'resize') return null;
        return resizeGesture();
      },
    }));

    scope.onDispose(core.addGestureSource({
      id: 'canvas-items',
      priority: 50,
      down(ev: PointerEvent, hit: Hit) {
        if (!editing() || ev.button !== 0 || !hit.item || hit.handle) return null;
        let sel: Sel = hit.item;
        const part = hit.part;
        let redraw = false;
        // Clicking outside the group being edited leaves it.
        const entered = core.enteredGroup.peek();
        if (entered && !core.insideGroup(sel, entered)) {
          core.enteredGroup.set(null);
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
    }));

    scope.onDispose(core.addGestureSource({
      id: 'canvas-marquee',
      priority: 10,
      down(ev, hit) {
        if (!editing() || ev.button !== 0 || hit.item || hit.handle) return null;
        let redraw = false;
        if (core.enteredGroup.peek()) {
          core.enteredGroup.set(null);
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
          marquee = null;
          core.drawOverlay();
          core.fire('panels');
        };
        return {
          move(dx, dy) {
            const x1 = p0.x + dx, y1 = p0.y + dy;
            marquee = { x0: p0.x, y0: p0.y, x1, y1 };
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
    }));

    // ---- pointer extras: page deselect, double-click, links and hover highlight (View) ---------------------------

    // Alt/Option held over the canvas: the copy cursor on what an Alt-drag would copy
    const altCopy = (on: boolean): void => {
      core.dom.root.classList.toggle('alt-copy', on && editing() && !!withEdit(core.model, (k) => k.altCopy));
    };
    scope.listen(svg, 'pointermove', (ev) => altCopy(ev.altKey));
    scope.listen(svg, 'pointerleave', () => altCopy(false));
    scope.listen(core.dom.root, 'keydown', (ev) => {
      if (ev.key === 'Alt') altCopy(true);
    });
    scope.listen(core.dom.root, 'keyup', (ev) => {
      if (ev.key === 'Alt') altCopy(false);
    });
    scope.onDispose(() => core.dom.root.classList.remove('alt-copy', 'copying'));

    let down: { x: number; y: number } | null = null;
    scope.listen(svg, 'pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY };
      if (core.pageSelected.peek()) {
        core.pageSelected.set(false);
        core.drawOverlay();
        core.fire('panels');
      }
    }, { capture: true });

    scope.listen(svg, 'dblclick', (ev) => {
      if (core.tool.peek() === 'hand' && editing()) return;
      const t = ev.target instanceof Element ? ev.target : null;
      if (t?.closest('[data-handle]')) return; // handles (connector ends, bend points) handle their own double-click
      // The first click may have re-rendered the item (selecting it): look up what is under the pointer as well.
      const at = elementAt(core, ev.clientX, ev.clientY);
      if (at?.closest('[data-handle]')) return;
      const itemEl = t?.closest('.el[data-kind]') ?? (at && core.dom.body.contains(at) ? at.closest('.el[data-kind]') : null);
      if (itemEl && editing()) {
        const item: ItemRef = { kind: itemEl.getAttribute('data-kind') as ItemKind, id: itemEl.getAttribute('data-id') ?? '' };
        const part = itemEl.getAttribute('data-part');
        // Double-click enters the group (its items become individually editable); inside, it edits text.
        const g = !part ? core.groupTarget(item, isLane) : null;
        const enterSelf = item.kind === 'group' && !g && core.enteredGroup.peek() !== item.id && !isLane(item.id);
        if (g || enterSelf) {
          core.enteredGroup.set(g ?? item.id);
          const inner = core.groupTarget(item, isLane);
          core.select(enterSelf ? [] : inner ? [{ kind: 'group', id: inner }] : [item]);
          core.draw();
          core.fire('panels');
          return;
        }
        if (item.kind === 'activation') return;
        const p = core.primary();
        const target: Sel = p && selKey(p) === selKey(item) ? p : item;
        if (!core.run('inlineEdit', target)) core.run('setPanel', 'properties', true);
        return;
      }
      if (!itemEl) fit();
    });

    const fit = (): void => {
      if (core.has('fitView')) core.run('fitView');
      else core.viewport.setBounds(core.result.result.bounds, { fit: true });
    };

    // Links open in View mode on a plain click (not the end of a pan); the host can route or veto (`mmdx-link`).
    scope.listen(svg, 'click', (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      const a = t?.closest('a');
      const linked = t?.closest('[data-link]');
      if (a) ev.preventDefault(); // never navigate the host page from the canvas by default
      if (editing() || (!a && !linked)) return;
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 3) return;
      const href = linked?.getAttribute('data-link') ?? a?.getAttribute('href');
      if (!href) return;
      const item = (linked ?? a)?.closest('[data-id]');
      const follow = (url: string): void => {
        if (!core.emit('mmdx-link', { href: url, id: item?.getAttribute('data-id') ?? null }, true)) return;
        const target = core.ctx.linkPolicy.target ?? '_blank';
        if (target === '_blank') window.open(url, '_blank', 'noopener,noreferrer');
        else window.location.assign(url);
      };
      // several links (a sequence participant's `links`): a menu of them at the pointer
      const links = menuLinks(linked ?? a ?? null);
      if (links) openLinkMenu({ popovers: core.popovers, within: core.area, at: ev, label: core.i18n.t('view.links'), links, follow });
      else follow(href);
    });

    let hoverKey = '';
    scope.listen(svg, 'pointermove', (ev) => {
      if (editing() || !core.display.peek().hoverHighlight || core.viewport.panning) return;
      hoverKey = hoverHighlight(core.dom.body, ev.target instanceof Element ? ev.target : null, core.model);
    });
    scope.listen(svg, 'pointerleave', () => {
      if (!hoverKey) return;
      hoverKey = '';
      clearHighlight(core.dom.body);
    });

    // ---- keyboard: nudge (one history step per burst of key presses) -------------------------------------------

    let nudgeOpen = false;
    // the transaction the nudges run in (a cancel — undo, a load, a stage switch — may have ended it)
    let nudgeTx = 0;
    let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
    const flushNudge = (): void => {
      clearTimeout(nudgeTimer);
      if (!nudgeOpen) return;
      nudgeOpen = false;
      if (core.store.txId === nudgeTx) core.commit('Nudge');
    };
    const nudge = (ux: number, uy: number, step: number): boolean => {
      const sel = core.selection();
      if (!sel.length) return false;
      const model = core.model, meta = core.meta, geom = core.geom;
      let next = meta;
      if (sel.length > 1) next = moveItems(model, meta, geom, sel, ux * step, uy * step, 0).meta;
      else {
        const { kind, id } = sel[0]!;
        if (kind === 'activation') return true; // processes follow their messages
        const vertOnly = kind === 'message' || kind === 'note' || kind === 'block';
        if (vertOnly && !uy) return true;
        if (kind === 'participant' && !ux) return true;
        const part = kind === 'edge' || kind === 'rel' ? 'label' : undefined;
        if (core.getM(kind, id).locked && !part) return true;
        next = moveItem(model, meta, geom, { kind, id }, ux * step, uy * step, part ? { part, snap: 0 } : { snap: 0 }).meta; // no snapping
      }
      if (!nudgeOpen || core.store.txId !== nudgeTx) {
        core.begin();
        nudgeOpen = true;
        nudgeTx = core.store.txId;
      }
      core.store.meta.set(next);
      core.draw();
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(flushNudge, 450);
      return true;
    };
    const root = core.dom.root;
    scope.listen(root, 'keyup', (ev) => {
      if (ev.key.startsWith('Arrow')) flushNudge();
    });
    scope.listen(root, 'keydown', (ev) => {
      if (nudgeOpen && !ev.key.startsWith('Arrow') && ev.key !== 'Shift') flushNudge();
    }, { capture: true });
    scope.listen(svg, 'pointerdown', () => flushNudge(), { capture: true });

    // ---- selection helpers -------------------------------------------------------------------------------------

    const selectAll = (): void => {
      core.select(selectable(core).map(({ kind, id }) => ({ kind, id })));
      core.fire('panels');
    };

    /** Items in model order, for Tab / Shift+Tab (§13 roving focus). */
    const tabOrder = (): Sel[] => (withKind(core.model, (k, m) => k.items(m)) ?? []).filter((r) => r.kind !== 'box');

    const ensureVisible = (it: Sel): void => {
      const b = core.boxOf(it);
      if (!b) return;
      const r = core.rectOnScreen({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
      const { w, h: hh } = core.viewport.size;
      if (!w || !hh) return;
      const m = 40;
      let dx = 0, dy = 0;
      if (r.x < m) dx = m - r.x;
      else if (r.x + r.w > w - m) dx = w - m - (r.x + r.w);
      if (r.y < m) dy = m - r.y;
      else if (r.y + r.h > hh - m) dy = hh - m - (r.y + r.h);
      if (dx || dy) core.viewport.panBy(dx, dy);
    };
    const onCanvasRoot = (ev: KeyboardEvent): boolean => (ev.composedPath()[0] ?? ev.target) === root;
    const tab = (ev: KeyboardEvent, dir: 1 | -1): boolean => {
      if (!onCanvasRoot(ev)) return false;
      const list = tabOrder();
      if (!list.length) return false;
      const p = core.primary();
      const i = p ? list.findIndex((x) => selKey(x) === selKey(p)) : -1;
      const j = i < 0 ? (dir > 0 ? 0 : list.length - 1) : i + dir;
      const next = list[j];
      if (!next) return false; // past the ends: focus leaves the canvas
      core.select([next]);
      ensureVisible(next);
      core.fire('panels');
      return true;
    };

    // ---- announcements (§13) -----------------------------------------------------------------------------------

    let lastAnnounced = '';
    const announce = (): void => {
      const live = root.querySelector('.mmdx-sr[aria-live]');
      if (!live) return;
      const sel = core.selection();
      let msg = '';
      if (sel.length === 1) {
        const it = sel[0]!;
        const n = connectionCount(core, it);
        msg = `Selected ${KIND_NAME[it.kind]} ${itemLabel(core, it)}${n >= 0 ? `, ${n} connection${n === 1 ? '' : 's'}` : ''}`;
      } else if (sel.length > 1) msg = `Selected ${sel.length} items`;
      else if (lastAnnounced) msg = 'Selection cleared';
      if (msg === lastAnnounced || (!msg && !lastAnnounced)) return;
      lastAnnounced = sel.length ? msg : '';
      live.textContent = msg;
    };

    // ---- events ------------------------------------------------------------------------------------------------

    scope.onDispose(core.on('draw', decorateGroupEdit));
    scope.onDispose(core.on('selection', () => {
      markSelection(core);
      announce();
    }));
    scope.onDispose(core.on('mode', () => {
      clearHighlight(core.dom.body);
      hoverKey = '';
      decorateGroupEdit();
    }));
    scope.effect(() => {
      core.enteredGroup();
      decorateGroupEdit();
    });

    scope.onDispose(core.provide('selectAll', selectAll));
    scope.onDispose(core.provide('enterGroup', enterGroup));
    scope.onDispose(core.provide('exitGroup', exitGroup));

    // ---- shortcuts (A.11) --------------------------------------------------------------------------------------

    const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arrow = (step: number) => (ev: KeyboardEvent): boolean => {
      const d = ARROWS[ev.key];
      return !!d && nudge(d[0], d[1], step);
    };
    core.shortcuts.add(
      { id: 'tool-pointer', keys: ['v'], label: 'Select & edit', group: 'Tools', editOnly: true, readOnly: true, run: () => core.setTool('pointer') },
      { id: 'tool-hand', keys: ['h'], label: 'Hand — drag to move around', group: 'Tools', run: () => core.setTool('hand') },
      { id: 'select-all', keys: ['mod+a'], label: 'Select all', group: 'Edit', editOnly: true, readOnly: true, run: () => selectAll() },
      { id: 'nudge', keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: 'Move the selection 1 px', group: 'Edit', editOnly: true, run: arrow(1) },
      { id: 'nudge10', keys: ['shift+arrowleft', 'shift+arrowright', 'shift+arrowup', 'shift+arrowdown'], label: 'Move the selection 10 px', group: 'Edit', editOnly: true, run: arrow(10) },
      { id: 'focus-next', keys: ['tab'], label: 'Select the next item', group: 'Edit', editOnly: true, run: (ev) => tab(ev, 1) },
      { id: 'focus-prev', keys: ['shift+tab'], label: 'Select the previous item', group: 'Edit', editOnly: true, run: (ev) => tab(ev, -1) },
      {
        id: 'edit-text', keys: ['enter'], label: 'Edit the selected item’s text', group: 'Edit', editOnly: true,
        run: (ev) => {
          const p = core.primary();
          if (!onCanvasRoot(ev) || !p) return false;
          if (!core.run('inlineEdit', p)) core.run('setPanel', 'properties', true);
          return true;
        },
      },
      { id: 'shift-click', keys: ['shift'], label: 'Shift-click / Shift-drag: add to the selection', group: 'Edit', editOnly: true, hintOnly: true },
      { id: 'alt-drag', keys: ['alt'], label: 'Alt-drag: drag a copy · Alt while dragging: no snapping', group: 'Edit', editOnly: true, hintOnly: true },
    );
    // The end of the Esc chain (A.11: help → paint → shapes menu → tool → group → selection / page) is registered
    // after every module installed, so the earlier links of the chain come first in the registry. Through the scope:
    // muted while the module is suspended (History) and removed when it is uninstalled.
    queueMicrotask(() => {
      if (destroyed) return;
      scope.shortcut(
        {
          id: 'exit-group', keys: ['escape'], label: 'Leave the group being edited', group: 'Edit', editOnly: true,
          run: () => {
            if (!core.enteredGroup.peek()) return false;
            exitGroup();
            return true;
          },
        },
        {
          id: 'deselect', keys: ['escape'], label: 'Clear the selection', group: 'Edit',
          run: () => {
            if (!core.selection().length && !core.pageSelected.peek()) return false;
            core.pageSelected.set(false);
            core.select([]);
            core.draw();
            core.fire('panels');
            return true;
          },
        },
      );
    });

    return () => {
      destroyed = true;
      flushNudge();
      for (const n of Array.from(core.dom.body.querySelectorAll('.el.in-edit'))) n.classList.remove('in-edit');
    };
  },
};
