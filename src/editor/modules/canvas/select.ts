// Canvas selection (A.3 rows 27, 28, 34; A.2 rows 17, 23; §13): click / Shift-click / marquee / ⌘A selection with
// Miro-like groups (a click selects the outermost group, double-click enters it, the "Editing group … Done" bar),
// moving (single, multi, Alt-drag copy, connector labels, locked items), resizing with the corner handle, keyboard
// nudge, the selection overlay, View-mode links and hover highlight, roving keyboard focus and announcements.
// Ported from prototype app.js (`decorateGroupEdit`, pointer handlers, `moveDrag`, `resizeDrag`, `multiMoveDrag`,
// `cloneDrag`, `nudge`, `nudgeMulti`, `updateMarquee`, `finishMarquee`, `selectAll`, `drawOverlay` boxes).
import { cloneItems, cloneMeta, moveItem, moveItems, type MoveOpts } from '../../../core/ops/index.js';
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import { clearHighlight, hoverHighlight } from '../../../dom/highlight.js';
import { h } from '../../../ui/h.js';
import { effect } from '../../../ui/signal.js';
import type { EditorCore, Gesture, Hit, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { connectionCount, elementAt, inArea, itemLabel, LINE_KINDS, markSelection, samePrimary, selectable, selKey, sizeBadge } from './shared.js';

const NOOP: Gesture = { move: () => undefined };

const KIND_NAME: Record<ItemKind, string> = {
  node: 'node', group: 'group', edge: 'connector', participant: 'participant', message: 'message', note: 'note',
  block: 'block', box: 'box', activation: 'process', entity: 'table', rel: 'relationship',
};

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
.group-edit-bar { position: absolute; top: 12px; left: calc(50% + (var(--inset-l, 0px) - var(--inset-r, 0px)) / 2); transform: translateX(-50%);
  z-index: 25; display: flex; align-items: center; gap: 12px; background: var(--float); border: 1px solid var(--float-line);
  border-radius: 10px; padding: 6px 6px 6px 14px; font-size: 13px; color: var(--ink-2); box-shadow: 0 4px 16px rgba(30, 40, 80, .14); white-space: nowrap; }
.group-edit-bar button { padding: 3px 10px; }
.mode-view .canvas .el.node, .mode-view .canvas .el.entity, .mode-view .canvas .el.participant { cursor: default; }
/* Alt/Option: dragging copies (flowcharts and ER diagrams) */
.ed.alt-copy.mode-edit .canvas .el.node, .ed.alt-copy.mode-edit .canvas .el.entity, .ed.alt-copy.mode-edit .canvas .el.group > :first-child { cursor: copy; }
.ed.copying, .ed.copying * { cursor: copy !important; }
.mode-view .canvas .el[data-link] { cursor: pointer; }
`;

export const canvasSelectModule: EditorModule = {
  id: 'canvas-select',
  css: SELECT_CSS,
  install(core) {
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const offs: (() => void)[] = [];
    const svg = core.dom.svg;
    let marquee: { x0: number; y0: number; x1: number; y1: number } | null = null;
    // the item being resized: its size is shown under it while the handle is dragged
    let sizing: Sel | null = null;
    let destroyed = false;

    const isLane = (gid: string): boolean => core.isLane(gid);
    const editing = (): boolean => core.mode.peek() === 'edit';

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
      const M = core.model;
      core.select(M.type === 'flowchart' && M.groups.has(gid) ? [{ kind: 'group', id: gid }] : []);
      core.draw();
      core.fire('panels');
    };

    let bar: HTMLElement | null = null;
    const decorateGroupEdit = (): void => {
      const gid = editing() ? core.enteredGroup.peek() : null;
      for (const n of Array.from(core.dom.body.querySelectorAll('.el.in-edit'))) n.classList.remove('in-edit');
      if (!gid) {
        bar?.remove();
        bar = null;
        return;
      }
      const inside = (kind: string | null, id: string | null): boolean =>
        (kind === 'node' || kind === 'group') && id !== null && core.insideGroup({ kind, id }, gid);
      for (const n of Array.from(core.dom.body.querySelectorAll('.el'))) {
        const kind = n.getAttribute('data-kind'), id = n.getAttribute('data-id');
        const ok = kind === 'edge' ? inside('node', n.getAttribute('data-from')) && inside('node', n.getAttribute('data-to')) : inside(kind, id);
        if (ok) n.classList.add('in-edit');
      }
      const M = core.model;
      const title = (M.type === 'flowchart' ? M.groups.get(gid)?.label?.split('\n')[0] : '') || gid;
      if (!bar) {
        bar = h('div', { class: 'group-edit-bar', role: 'status' });
        bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        core.dom.wrap.append(bar);
      }
      bar.replaceChildren(
        h('span', null, 'Editing group ', h('b', null, title), ' — other items are faded'),
        h('button', { type: 'button', class: 'primary small', title: 'Finish editing the group (Esc)', onclick: () => exitGroup() }, 'Done'),
      );
    };

    // ---- overlay: selection boxes, resize handle, entered group, page, marquee -----------------------------------

    offs.push(core.addOverlay({
      id: 'canvas-select',
      order: 10,
      paint(k) {
        const out: SceneNode[] = [];
        const sel = core.selection();
        const entered = core.enteredGroup.peek();
        const g = core.geom;
        if (entered && g.type === 'flowchart') {
          const eb = g.groups.get(entered);
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
          for (const it of sel) {
            if (!LINE_KINDS.has(it.kind)) continue;
            const eg = g.type === 'flowchart' && it.kind === 'edge' ? g.edges.get(it.id) : g.type === 'er' && it.kind === 'rel' ? g.rels.get(it.id) : undefined;
            const m = g.type === 'sequence' && it.kind === 'message' ? g.messages.get(it.id) : undefined;
            const d = eg?.d ?? (m ? (m.self ? `M${m.x0},${m.y}h30v18h-30` : `M${m.x0},${m.y}H${m.x1}`) : '');
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
        if (one && b && !b.hidden && one.kind !== 'note' && one.kind !== 'block' && one.kind !== 'activation' && one.kind !== 'box') {
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
        if (core.model.type === 'sequence') core.toast('Copying by Alt-drag works in flowcharts and ER diagrams');
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
      const g = metaGesture('Resize', (dx, dy, ev) => {
        sizing = s;
        core.store.meta.set(cloneMeta(meta0));
        const m = core.ensure(kind, id);
        const snap = (v: number): number => core.snapV(v, ev);
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
      // the size badge goes with the gesture
      return {
        move: g.move,
        end(ev) {
          sizing = null;
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

    offs.push(core.addGestureSource({
      id: 'canvas-resize',
      priority: 100,
      down(ev, hit) {
        if (!editing() || hit.handle?.getAttribute('data-handle') !== 'resize') return null;
        return resizeGesture();
      },
    }));

    offs.push(core.addGestureSource({
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
        if (ev.altKey && !part) {
          const items = multi && core.isSelected(sel) ? cur : [sel];
          const d = cloneGesture(items);
          if (d) return d;
        }
        if (multi && core.isSelected(sel)) {
          if (redraw) core.draw();
          return multiMoveGesture();
        }
        if (!samePrimary(core.primary(), sel) || multi) {
          core.select([sel]);
          redraw = true;
        }
        if (redraw) {
          core.draw();
          core.fire('panels');
        }
        return moveGesture(sel, part);
      },
    }));

    offs.push(core.addGestureSource({
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
            const merged: Sel[] = [...base];
            for (const it of hits) if (!merged.some((x) => selKey(x) === selKey(it))) merged.push(it);
            core.select(merged);
          },
          end: finish,
          cancel: finish,
        };
      },
    }));

    // ---- pointer extras: page deselect, double-click, links and hover highlight (View) ---------------------------

    // Alt/Option held over the canvas: the copy cursor on what an Alt-drag would copy
    const altCopy = (on: boolean): void => {
      core.dom.root.classList.toggle('alt-copy', on && editing() && (core.model.type === 'flowchart' || core.model.type === 'er'));
    };
    svg.addEventListener('pointermove', (ev) => altCopy(ev.altKey), sig);
    svg.addEventListener('pointerleave', () => altCopy(false), sig);
    core.dom.root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Alt') altCopy(true);
    }, sig);
    core.dom.root.addEventListener('keyup', (ev) => {
      if (ev.key === 'Alt') altCopy(false);
    }, sig);
    offs.push(() => core.dom.root.classList.remove('alt-copy', 'copying'));

    let down: { x: number; y: number } | null = null;
    svg.addEventListener('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY };
      if (core.pageSelected.peek()) {
        core.pageSelected.set(false);
        core.drawOverlay();
        core.fire('panels');
      }
    }, { capture: true, signal: ac.signal });

    svg.addEventListener('dblclick', (ev) => {
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
    }, sig);

    const fit = (): void => {
      if (core.has('fitView')) core.run('fitView');
      else core.viewport.setBounds(core.result.result.bounds, { fit: true });
    };

    // Links open in View mode on a plain click (not the end of a pan); the host can route or veto (`ds-link`).
    svg.addEventListener('click', (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      const a = t?.closest('a');
      const linked = t?.closest('[data-link]');
      if (a) ev.preventDefault(); // never navigate the host page from the canvas by default
      if (editing() || (!a && !linked)) return;
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 3) return;
      const href = linked?.getAttribute('data-link') ?? a?.getAttribute('href');
      if (!href) return;
      const item = (linked ?? a)?.closest('[data-id]');
      if (!core.emit('ds-link', { href, id: item?.getAttribute('data-id') ?? null }, true)) return;
      const target = core.ctx.linkPolicy.target ?? '_blank';
      if (target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
      else window.location.assign(href);
    }, sig);

    let hoverKey = '';
    svg.addEventListener('pointermove', (ev) => {
      if (editing() || !core.display.peek().hoverHighlight || core.viewport.panning) return;
      hoverKey = hoverHighlight(core.dom.body, ev.target instanceof Element ? ev.target : null, core.model);
    }, sig);
    svg.addEventListener('pointerleave', () => {
      if (!hoverKey) return;
      hoverKey = '';
      clearHighlight(core.dom.body);
    }, sig);

    // ---- keyboard: nudge (one history step per burst of key presses) -------------------------------------------

    let nudgeOpen = false;
    let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
    const flushNudge = (): void => {
      clearTimeout(nudgeTimer);
      if (!nudgeOpen) return;
      nudgeOpen = false;
      core.commit('Nudge');
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
      if (!nudgeOpen) {
        core.begin();
        nudgeOpen = true;
      }
      core.store.meta.set(next);
      core.draw();
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(flushNudge, 450);
      return true;
    };
    const root = core.dom.root;
    root.addEventListener('keyup', (ev) => {
      if (ev.key.startsWith('Arrow')) flushNudge();
    }, sig);
    root.addEventListener('keydown', (ev) => {
      if (nudgeOpen && !ev.key.startsWith('Arrow') && ev.key !== 'Shift') flushNudge();
    }, { capture: true, signal: ac.signal });
    svg.addEventListener('pointerdown', () => flushNudge(), { capture: true, signal: ac.signal });

    // ---- selection helpers -------------------------------------------------------------------------------------

    const selectAll = (): void => {
      core.select(selectable(core).map(({ kind, id }) => ({ kind, id })));
      core.draw();
      core.fire('panels');
    };

    /** Items in model order, for Tab / Shift+Tab (§13 roving focus). */
    const tabOrder = (): Sel[] => {
      const M = core.model;
      if (M.type === 'flowchart')
        return [...[...M.nodes.keys()].map((id): Sel => ({ kind: 'node', id })), ...[...M.groups.keys()].map((id): Sel => ({ kind: 'group', id })), ...M.edges.map((e): Sel => ({ kind: 'edge', id: e.id }))];
      if (M.type === 'er') return [...[...M.entities.keys()].map((id): Sel => ({ kind: 'entity', id })), ...M.rels.map((r): Sel => ({ kind: 'rel', id: r.id }))];
      if (M.type === 'sequence') {
        const out: Sel[] = M.participants.map((p) => ({ kind: 'participant', id: p.id }));
        for (const it of M.items) {
          if (it.kind === 'message' || it.kind === 'note') out.push({ kind: it.kind, id: it.id });
          else if (it.kind === 'blockStart') out.push({ kind: 'block', id: it.id });
        }
        return out;
      }
      return [];
    };
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
      core.draw();
      ensureVisible(next);
      core.fire('panels');
      return true;
    };

    // ---- announcements (§13) -----------------------------------------------------------------------------------

    let lastAnnounced = '';
    const announce = (): void => {
      const live = root.querySelector('.ds-sr[aria-live]');
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

    offs.push(core.on('draw', decorateGroupEdit));
    offs.push(core.on('selection', () => {
      markSelection(core);
      announce();
    }));
    offs.push(core.on('mode', () => {
      clearHighlight(core.dom.body);
      hoverKey = '';
      decorateGroupEdit();
    }));
    offs.push(effect(() => {
      core.enteredGroup();
      decorateGroupEdit();
    }));

    offs.push(core.provide('selectAll', selectAll));
    offs.push(core.provide('enterGroup', enterGroup));
    offs.push(core.provide('exitGroup', exitGroup));

    // ---- shortcuts (A.11) --------------------------------------------------------------------------------------

    const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arrow = (step: number) => (ev: KeyboardEvent): boolean => {
      const d = ARROWS[ev.key];
      return !!d && nudge(d[0], d[1], step);
    };
    core.shortcuts.add(
      { id: 'tool-pointer', keys: ['v'], label: 'Select & edit', group: 'Tools', editOnly: true, run: () => core.setTool('pointer') },
      { id: 'tool-hand', keys: ['h'], label: 'Hand — drag to move around', group: 'Tools', run: () => core.setTool('hand') },
      { id: 'select-all', keys: ['mod+a'], label: 'Select all', group: 'Edit', editOnly: true, run: () => selectAll() },
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
    // after every module installed, so the earlier links of the chain come first in the registry.
    queueMicrotask(() => {
      if (destroyed) return;
      core.shortcuts.add(
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
      ac.abort();
      for (const off of offs) off();
      bar?.remove();
      bar = null;
      for (const n of Array.from(core.dom.body.querySelectorAll('.el.in-edit'))) n.classList.remove('in-edit');
    };
  },
};
