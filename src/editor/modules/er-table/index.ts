// ER attribute editing in place (table view). A table has two sections: double-click its title to rename it, its
// attributes to edit them. Attribute editing draws it as a table with an empty last row, everything else fades, and
// its attributes become selectable rows (click, ⌘-click, Shift-click for a range, ⌘A). Selected rows get their own
// floating toolbar (preset, font, size, bold / italic / underline, colour, delete) that styles all of them at once;
// Delete removes them, dragging them (or ⌥↑ / ⌥↓) reorders them. Double-click a row (or Enter) edits its text in
// place (`type name PK (comment)`), clearing the text deletes it; typing into the last row adds an attribute and moves
// on to the next empty row. Esc clears the row selection, then leaves the table (so does a click outside).
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { ErAttribute, ErModel } from '../../../core/model.js';
import { updateEntity } from '../../../core/kinds/er/ops.js';
import { cloneMeta, ensure, tidy } from '../../../core/ops/meta-util.js';
import { effectiveValue } from '../../../core/ops/style-env.js';
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { Rect } from '../../../core/types.js';
import type { StyleToolbarHandle } from '../../../ui/diagram/style-toolbar.js';
import type { Gesture } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { elementAt } from '../../lib/canvas.js';
import { styleEnv } from '../../ops/doc.js';
import { GESTURE, PAINT } from '../../lib/priorities.js';
import { openRowEditor } from './row-editor.js';
import { tableShortcuts } from './keys.js';
import { deleteRows, gapAt, moveRows, renameHighlights, rowAt, rowRange, toggleRow, type TableBox } from './rows.js';
import type { TableContext, TableState } from './state.js';
import { ATTR_SPEC, attrToolbarApi } from './toolbar.js';

export const ER_TABLE_CSS = /* css */ `
.ed.table-edit .canvas .el { transition: opacity .15s; }
.ed.table-edit .canvas .el:not(.table-in-edit) { opacity: .2; }
.overlay .attr-sel { fill: var(--accent); fill-opacity: .12; stroke: var(--accent); pointer-events: none; }
.overlay .attr-drop { stroke: var(--accent); stroke-linecap: round; pointer-events: none; }
.ed.attr-moving, .ed.attr-moving * { cursor: grabbing !important; }
.attr-edit { position: absolute; z-index: 30; box-sizing: border-box; margin: 0; padding: 0 6px; border: 1.5px solid var(--accent); border-radius: 4px;
  background: var(--surface); color: var(--ink); outline: none; font-family: inherit; }
.attr-edit.bad { border-color: var(--danger); }
.attr-pp { display: grid; place-items: center; font-size: 13px; background: var(--surface); }
`;

const NOOP: Gesture = { move: () => undefined };

export const erTableModule: EditorModule = {
  id: 'er-table',
  css: [ER_TABLE_CSS],
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const { wrap, root, body } = core.dom;
    let destroyed = false;
    const st: TableState = { table: null, sel: [], editor: null, dropGap: null };

    const er = (): ErModel | null => (core.model.type === 'er' ? core.model : null);
    const attrs = (): ErAttribute[] => (st.table ? er()?.entities.get(st.table)?.attrs ?? [] : []);
    const box = (): TableBox | null => {
      const g = core.geom;
      return g.type === 'er' && st.table ? g.entities.get(st.table) ?? null : null;
    };
    const editing = (): boolean => core.mode.peek() === 'edit';

    // ---- entering and leaving ---------------------------------------------------------------------------------

    const mark = (): void => {
      for (const n of Array.from(body.querySelectorAll('.el.table-in-edit'))) n.classList.remove('table-in-edit');
      if (!st.table) return;
      for (const n of Array.from(body.querySelectorAll('.el[data-kind="entity"]'))) if (n.getAttribute('data-id') === st.table) n.classList.add('table-in-edit');
    };

    const enter = (id: string): void => {
      if (!editing() || !er()?.entities.has(id)) return;
      closeEditor(true);
      st.table = id;
      st.sel = [];
      core.uiState.tableView.set(id);
      root.classList.add('table-edit');
      core.enterGroup(null);
      core.select([]);
      core.draw();
      core.fire('panels');
      refresh();
    };
    /** Leaves the table; `select`: the table stays selected (Esc, Done), else the click outside decides. */
    const exit = (select = true): void => {
      if (!st.table) return;
      closeEditor(true);
      const id = st.table;
      st.table = null;
      st.sel = [];
      core.uiState.tableView.set(null);
      root.classList.remove('table-edit');
      if (select && er()?.entities.has(id)) core.select([{ kind: 'entity', id }]);
      core.draw();
      core.fire('panels');
      refresh();
    };

    // ---- changes ----------------------------------------------------------------------------------------------

    const setAttrs = (next: readonly ErAttribute[], label: string, meta?: DiagramMeta): boolean => {
      const M = er();
      if (!M || !st.table) return false;
      const res = updateEntity(core.code, M, st.table, { attrs: next });
      return core.applyCode(meta ? { code: res.code, meta } : res, label, { select: [] });
    };
    const remapHighlights = (names: readonly (string | null)[]): DiagramMeta | undefined => {
      const id = st.table!;
      const hl = core.getM('entity', id).attrs;
      if (!hl || !Object.keys(hl).length) return undefined;
      const meta = cloneMeta(core.meta);
      const m = ensure(meta, 'entity', id);
      const next = renameHighlights(hl, attrs(), names);
      if (Object.keys(next).length) m.attrs = next;
      else delete m.attrs;
      tidy(meta, 'entity', id);
      return meta;
    };
    const removeRows = (rows: readonly number[]): void => {
      if (!st.table || !rows.length) return;
      const { next, names } = deleteRows(attrs(), rows);
      st.sel = [];
      if (setAttrs(next, t('history.attrDelete'), remapHighlights(names))) core.toast(t('table.deleted', { n: rows.length }));
      refresh();
    };
    /** Moves rows to the gap before attribute `gap`, keeping their order; they stay selected (highlights go along). */
    const reorder = (rows: readonly number[], gap: number): void => {
      if (!st.table || !rows.length) return;
      const r = moveRows(attrs(), rows, gap);
      if (!r) return;
      st.sel = r.sel;
      setAttrs(r.next, t('history.attrMove'));
      refresh();
    };

    // ---- the attribute toolbar --------------------------------------------------------------------------------

    const tableValue = (k: string): unknown => (st.table ? effectiveValue(styleEnv(core), { kind: 'entity', id: st.table }, k) : undefined);
    const rowRect = (i: number): Rect | null => {
      const b = box();
      const r = b?.rows?.[i];
      return b && r ? core.rectOnScreen({ x: b.x - b.w / 2, y: r.y, w: b.w, h: r.h }) : null;
    };
    const ctx: TableContext = { core, t, st, attrs, box, rowRect, tableValue, setAttrs, remapHighlights, deleteRows: removeRows, refresh: () => refresh() };
    const api = attrToolbarApi(ctx);
    let tb: StyleToolbarHandle | null = null;
    let tbLoading: Promise<void> | null = null;
    const ensureToolbar = (): Promise<void> => (tbLoading ??= import('../../../ui/diagram/style-toolbar.js').then(({ createStyleToolbar }) => {
      if (destroyed || tb) return;
      tb = createStyleToolbar(wrap, api, { i18n: core.i18n, kinds: { attr: ATTR_SPEC } });
      tb.refresh();
    }));
    /** Repaints the row selection and rebuilds the attribute toolbar. */
    const refresh = (): void => {
      core.drawOverlay();
      if (st.sel.length && st.table && !tb) void ensureToolbar();
      tb?.refresh();
    };

    // ---- selection overlay ------------------------------------------------------------------------------------

    scope.painter({
      id: 'er-table',
      order: PAINT.table,
      paint(k) {
        const b = box();
        if (!st.table || !b || b.hidden) return [];
        const out: SceneNode[] = [];
        const p = 6 / k;
        out.push(el('rect', { class: 'entered-box', x: b.x - b.w / 2 - p, y: b.y - b.h / 2 - p, width: b.w + 2 * p, height: b.h + 2 * p, rx: 8 / k, 'stroke-width': 2 / k }, 'table-box'));
        for (const i of st.sel) {
          const r = b.rows?.[i];
          if (r && !r.add) out.push(el('rect', { class: 'attr-sel', x: b.x - b.w / 2 + 1, y: r.y, width: b.w - 2, height: r.h, rx: 3 / k, 'stroke-width': 1.2 / k }, `attr-sel:${i}`));
        }
        // where dragged rows will land
        const rows = (b.rows ?? []).filter((r) => !r.add);
        if (st.dropGap !== null && rows.length) {
          const y = st.dropGap < rows.length ? rows[st.dropGap]!.y : rows[rows.length - 1]!.y + rows[rows.length - 1]!.h;
          out.push(el('line', { class: 'attr-drop', x1: b.x - b.w / 2 + 4, y1: y, x2: b.x + b.w / 2 - 4, y2: y, 'stroke-width': 2.5 / k }, 'attr-drop'));
        }
        return out;
      },
    });

    // ---- pointer: rows are selected like items and dragged to reorder ----------------------------------------

    /** The row a Shift-click extends the selection from. */
    let anchor = 0;
    scope.gesture({
      id: 'er-table',
      priority: GESTURE.table,
      down(ev, hit) {
        if (!st.table || !editing() || ev.button !== 0 || core.tool.peek() === 'hand' || core.spaceDown) return null;
        const at = rowAt(box(), hit.p);
        if (!at) {
          // a press outside the table leaves it; the press then does what it does on the canvas
          exit(false);
          return null;
        }
        if (at === 'title') {
          st.sel = [];
          refresh();
          return NOOP;
        }
        if (at.add) {
          st.sel = [];
          refresh();
          return { move: () => undefined, click: () => editRow(-1) };
        }
        const i = at.i;
        // ⌘ / Ctrl-click: add or remove the row; Shift-click: the range from the last clicked row
        if (ev.metaKey || ev.ctrlKey) {
          st.sel = toggleRow(st.sel, i);
          anchor = i;
          refresh();
          return NOOP;
        }
        if (ev.shiftKey) {
          st.sel = rowRange(st.sel.length ? anchor : i, i);
          refresh();
          return NOOP;
        }
        // pressing a selected row keeps the selection (to drag all of it); a click without moving selects the row alone
        if (!st.sel.includes(i)) st.sel = [i];
        anchor = i;
        refresh();
        const moving = [...st.sel];
        const stop = (): void => {
          st.dropGap = null;
          root.classList.remove('attr-moving');
          core.drawOverlay();
        };
        return {
          threshold: 4,
          move: (_dx, dy) => {
            root.classList.add('attr-moving');
            st.dropGap = gapAt(box(), hit.p.y + dy);
            core.drawOverlay();
          },
          end: () => {
            const gap = st.dropGap;
            stop();
            if (gap !== null) reorder(moving, gap);
          },
          cancel: stop,
          click: () => {
            st.sel = [i];
            refresh();
          },
        };
      },
    });

    /** The table at the pointer: the event's target, else what is drawn there, else the topmost box that contains it. */
    const tableAt = (ev: MouseEvent): string | null => {
      const of = (n: Element | null | undefined): string | null => {
        const e = n?.closest('.el[data-kind="entity"]');
        return e && !e.hasAttribute('data-part') ? e.getAttribute('data-id') : null;
      };
      const id = of(ev.target instanceof Element ? ev.target : null) ?? of(elementAt(core, ev.clientX, ev.clientY));
      if (id) return id;
      const g = core.geom;
      if (g.type !== 'er') return null;
      const p = core.toDiagram(ev);
      let hit: string | null = null;
      g.entities.forEach((b, eid) => {
        if (!b.hidden && Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2) hit = eid;
      });
      return hit;
    };
    // double-click: a table has two sections, its title (renames it in place) and its attributes (attribute editing;
    // inside it, the row is edited in place)
    scope.canvas('dblclick', (ev) => {
      if (!editing() || core.model.type !== 'er' || core.tool.peek() === 'hand') return;
      if (st.table) {
        const at = rowAt(box(), core.toDiagram(ev));
        if (!at) return;
        ev.stopPropagation();
        ev.preventDefault();
        if (at === 'title') core.run('inlineEdit', { kind: 'entity', id: st.table });
        else editRow(at.add ? -1 : at.i);
        return;
      }
      // the table under the pointer (a pressed pointer is captured: the event's target is then the canvas itself)
      const id = tableAt(ev);
      if (!id) return;
      // the title section: the canvas renames the table in place
      const g = core.geom;
      const b = g.type === 'er' ? g.entities.get(id) : undefined;
      if (!b || core.toDiagram(ev).y < b.y - b.h / 2 + (b.head ?? 0)) return;
      ev.stopPropagation();
      ev.preventDefault();
      enter(id);
    }, { capture: true });

    // ---- editing a row in place -------------------------------------------------------------------------------

    const closeEditor = (apply: boolean): void => st.editor?.close(apply);
    // suspended (History opens): the row's text box is cancelled — the document is not written in History (§8.2)
    scope.register({ set: (on) => void (on || closeEditor(false)), dispose: () => undefined });
    const editRow = (i: number): void => openRowEditor({ ...ctx, wrap, toolbarRefresh: () => tb?.refresh(), editRow }, i);
    // pressing on the canvas applies the open row editor first
    scope.canvas('pointerdown', () => closeEditor(true), { capture: true });

    // ---- keys ------------------------------------------------------------------------------------------------

    core.shortcuts.add(...tableShortcuts({ ...ctx, popoverOpen: () => !!tb?.isOpen(), closePopover: () => tb?.close(true), exit: () => exit(), editRow, reorder }));

    // ---- keeping in step with the editor ----------------------------------------------------------------------

    scope.on('draw', () => {
      if (!st.table) return;
      // the table went away (undo, code edit, another diagram type) or the editor left Edit mode
      if (!editing() || !er()?.entities.has(st.table)) {
        exit(false);
        return;
      }
      const n = attrs().length;
      st.sel = st.sel.filter((i) => i < n);
      mark();
      tb?.refresh();
    });
    scope.on('selection', () => {
      if (!st.table || !core.selection().length) return;
      const s = core.selection();
      // renaming the table selects it: it stays in table editing; any other selection leaves
      if (s.length === 1 && s[0]!.kind === 'entity' && s[0]!.id === st.table) core.select([]);
      else exit(false);
    });
    scope.on('mode', () => exit(false));
    scope.on('view', () => tb?.place());

    return () => {
      destroyed = true;
      closeEditor(false);
      tb?.destroy();
      core.uiState.tableView.set(null);
      root.classList.remove('table-edit');
    };
  },
};
