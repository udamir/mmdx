// Canvas selection (A.3 rows 27, 28, 34; A.2 rows 17, 23; §13): click / Shift-click / marquee / ⌘A selection with
// Miro-like groups (a click selects the outermost group, double-click enters it; Esc or a click outside leaves it),
// moving (single, multi, Alt-drag copy, connector labels, locked items), resizing with the corner handle, keyboard
// nudge, the selection overlay, View-mode links and hover highlight, roving keyboard focus and announcements.
// Ported from prototype app.js (`decorateGroupEdit`, pointer handlers, `moveDrag`, `resizeDrag`, `multiMoveDrag`,
// `cloneDrag`, `nudge`, `nudgeMulti`, `updateMarquee`, `finishMarquee`, `selectAll`, `drawOverlay` boxes).
import { withKind } from '../../../core/kinds/registry.js';
import type { ItemKind } from '../../../core/types.js';
import type { Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { connectionCount, itemLabel, selectable, selKey } from '../../lib/canvas.js';
import { installNudge } from './nudge.js';
import { installSelectGestures } from './select-gestures.js';
import { installSelectionOverlay, SELECT_CSS } from './select-overlay.js';
import { installSelectPointer } from './select-pointer.js';
import type { SelectState } from './select-state.js';

export { SELECT_CSS };

const KIND_NAME: Record<ItemKind, string> = {
  node: 'node', group: 'group', edge: 'connector', participant: 'participant', message: 'message', note: 'note',
  block: 'block', box: 'box', activation: 'process', entity: 'table', rel: 'relationship',
};

export const canvasSelectModule: EditorModule = {
  id: 'canvas-select',
  css: [SELECT_CSS],
  install(scope) {
    const core = scope.core;
    const st: SelectState = { marquee: null, sizing: null };
    let destroyed = false;

    const editing = (): boolean => core.mode.peek() === 'edit';

    // ---- group editing ------------------------------------------------------------------------------------------

    const enterGroup = (gid: string): void => {
      core.enterGroup(gid);
      core.select([]);
      core.draw();
      core.fire('panels');
    };
    const exitGroup = (): void => {
      const gid = core.enteredGroup.peek();
      if (!gid) return;
      core.enterGroup(null);
      core.select(core.store.exists({ kind: 'group', id: gid }) ? [{ kind: 'group', id: gid }] : []);
      core.draw();
      core.fire('panels');
    };

    /** Every drawn item element (main elements and parts). */
    const drawnElements = (): Element[] => [...core.drawnItems().values()].flat();
    const clearGroupEdit = (): void => {
      for (const n of drawnElements()) n.classList.remove('in-edit');
    };
    /** Marks what is inside the group being edited (the rest fades): that, Esc and a click outside are the whole mode. */
    const decorateGroupEdit = (): void => {
      const gid = editing() ? core.enteredGroup.peek() : null;
      clearGroupEdit();
      if (!gid) return;
      const inside = (kind: string | null, id: string | null): boolean =>
        (kind === 'node' || kind === 'group') && id !== null && core.insideGroup({ kind, id }, gid);
      for (const n of drawnElements()) {
        const kind = n.getAttribute('data-kind'), id = n.getAttribute('data-id');
        const ok = kind === 'edge' ? inside('node', n.getAttribute('data-from')) && inside('node', n.getAttribute('data-to')) : inside(kind, id);
        if (ok) n.classList.add('in-edit');
      }
    };

    // ---- the overlay, the gestures, the pointer extras and the nudge (one file each) ---------------------------

    installSelectionOverlay(scope, st);
    installSelectGestures(scope, st);
    installSelectPointer(scope);
    const { nudge, flush: flushNudge } = installNudge(scope);

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
    const tab = (ev: KeyboardEvent, dir: 1 | -1): boolean => {
      if (!core.atRoot(ev)) return false;
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
      const live = core.live;
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

    scope.on('draw', decorateGroupEdit);
    // the marks of a version's selection too (the document's are marked as it changes, SelectionService.watch)
    scope.on('selection', () => {
      core.decorateSelection();
      announce();
    });
    scope.on('mode', decorateGroupEdit);
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
          if (!core.atRoot(ev) || !p) return false;
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
            core.selectPage(false);
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
      clearGroupEdit();
    };
  },
};
