// ER attribute editing in place (table view). A table has two sections: double-click its title to rename it, its
// attributes to edit them. Attribute editing draws it as a table with an empty last row, everything else fades, and
// its attributes become selectable rows (click, ⌘-click, Shift-click for a range, ⌘A). Selected rows get their own
// floating toolbar (preset, font, size, bold / italic / underline, colour, delete) that styles all of them at once;
// Delete removes them, dragging them (or ⌥↑ / ⌥↓) reorders them. Double-click a row (or Enter) edits its text in
// place (`type name PK (comment)`), clearing the text deletes it; typing into the last row adds an attribute and moves
// on to the next empty row. Esc clears the row selection, then leaves the table (so does Done or a click outside).
import type { AttrHighlight, DiagramMeta } from '../../../core/meta/types.js';
import type { ErAttribute, ErModel } from '../../../core/model.js';
import { attrText, updateEntity } from '../../../core/ops/er.js';
import { addLocalColor, removeLocalColor } from '../../../core/ops/meta-ops.js';
import { cloneMeta, ensure, tidy } from '../../../core/ops/meta-util.js';
import { effectiveValue } from '../../../core/ops/style-env.js';
import { parseAttrLine } from '../../../core/parse/er.js';
import { ATTR_PRESETS, attrLook } from '../../../core/render/er.js';
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import { relativeColor } from '../../../core/theme/colors.js';
import type { Rect } from '../../../core/types.js';
import { h } from '../../../ui/h.js';
import type { KindSpec, ToolbarApi, ToolbarHandle } from '../../../ui/style-toolbar.js';
import type { EditorCore, Gesture } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { elementAt } from '../canvas/shared.js';
import { freeStrip } from '../chrome/toolbars.js';
import { applyMeta, styleEnv } from '../panels/util.js';
import { writeAttrLook } from './look.js';

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

/** The attribute toolbar's controls. */
const ATTR_SPEC: KindSpec = {
  groups: [['presets', 'font', 'size', 'bold', 'italic', 'underline'], ['textColor'], ['delete']],
  size: 'fontSize',
  bold: 'fontWeight',
  text: 'color',
};

/** Highlight keys the toolbar writes (`fontWeight` maps to `bold`). */
const LOOK_KEYS = new Set(['color', 'fontFamily', 'fontSize', 'italic', 'underline', 'bold', 'preset']);

const NOOP: Gesture = { move: () => undefined };

type RowHit = { i: number; add: boolean } | 'title' | null;

export const erTableModule: EditorModule = {
  id: 'er-table',
  css: ER_TABLE_CSS,
  install(core) {
    const t = core.i18n.t;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const offs: (() => void)[] = [];
    const wrap = core.dom.wrap;
    let destroyed = false;
    /** The table being edited and its selected rows (attribute indices). */
    let table: string | null = null;
    let sel: number[] = [];
    let editor: { close(apply: boolean): void } | null = null;

    const er = (): ErModel | null => (core.model.type === 'er' ? core.model : null);
    const attrs = (): ErAttribute[] => (table ? er()?.entities.get(table)?.attrs ?? [] : []);
    const box = (): ({ x: number; y: number; w: number; h: number; hidden?: boolean; rows?: { name: string; y: number; h: number; add?: boolean }[] }) | null => {
      const g = core.geom;
      return g.type === 'er' && table ? g.entities.get(table) ?? null : null;
    };
    const editing = (): boolean => core.mode.peek() === 'edit';

    /** What is at diagram point p of the table: an attribute row, its empty last row, its title, or nothing. */
    const rowAt = (p: { x: number; y: number }): RowHit => {
      const b = box();
      if (!b || p.x < b.x - b.w / 2 || p.x > b.x + b.w / 2 || p.y < b.y - b.h / 2 || p.y > b.y + b.h / 2) return null;
      const rows = b.rows ?? [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        if (p.y >= r.y && p.y < r.y + r.h) return r.add ? { i: -1, add: true } : { i, add: false };
      }
      const first = rows[0];
      if (!first || p.y < first.y) return 'title';
      return { i: -1, add: true }; // below the rows (a table taller than its rows): the new attribute
    };

    // ---- entering and leaving ---------------------------------------------------------------------------------

    let bar: HTMLElement | null = null;
    const placeBar = (): void => {
      if (!table) {
        bar?.remove();
        bar = null;
        return;
      }
      const name = er()?.entities.get(table)?.label || table;
      if (!bar) {
        bar = h('div', { class: 'group-edit-bar table-edit-bar', role: 'status' });
        bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        wrap.append(bar);
      }
      bar.replaceChildren(
        h('span', null, t('table.editing'), ' ', h('b', null, name), ` — ${t('table.hint')}`),
        h('button', { type: 'button', class: 'primary small', title: t('table.doneTip'), onclick: () => exit() }, t('table.done')),
      );
    };
    const mark = (): void => {
      for (const n of Array.from(core.dom.body.querySelectorAll('.el.table-in-edit'))) n.classList.remove('table-in-edit');
      if (!table) return;
      for (const n of Array.from(core.dom.body.querySelectorAll('.el[data-kind="entity"]'))) if (n.getAttribute('data-id') === table) n.classList.add('table-in-edit');
    };

    const enter = (id: string): void => {
      if (!editing() || !er()?.entities.has(id)) return;
      closeEditor(true);
      table = id;
      sel = [];
      core.tableView = id;
      core.dom.root.classList.add('table-edit');
      core.enteredGroup.set(null);
      core.select([]);
      core.draw();
      core.fire('panels');
      placeBar();
      refresh();
    };
    /** Leaves the table; `select`: the table stays selected (Esc, Done), else the click outside decides. */
    const exit = (select = true): void => {
      if (!table) return;
      closeEditor(true);
      const id = table;
      table = null;
      sel = [];
      core.tableView = null;
      core.dom.root.classList.remove('table-edit');
      placeBar();
      if (select && er()?.entities.has(id)) core.select([{ kind: 'entity', id }]);
      core.draw();
      core.fire('panels');
      refresh();
    };

    // ---- changes ----------------------------------------------------------------------------------------------

    /** Rewrites the table's attributes (one history step); `meta` carries highlight renames / removals along. */
    const setAttrs = (next: readonly ErAttribute[], label: string, meta?: DiagramMeta): boolean => {
      const M = er();
      if (!M || !table) return false;
      const res = updateEntity(core.code, M, table, { attrs: next });
      return core.applyCode(meta ? { code: res.code, meta } : res, label, { select: [] });
    };
    /** The metadata with the table's highlights keyed by the new names (`names[i]`: old attribute i → new name or null). */
    const remapHighlights = (names: readonly (string | null)[]): DiagramMeta | undefined => {
      const id = table!;
      const hl = core.getM('entity', id).attrs;
      if (!hl || !Object.keys(hl).length) return undefined;
      const old = attrs();
      const meta = cloneMeta(core.meta);
      const m = ensure(meta, 'entity', id);
      const next: Record<string, AttrHighlight> = {};
      if (hl['__title']) next['__title'] = hl['__title'];
      old.forEach((a, i) => {
        const n = names[i];
        if (n && hl[a.name] && !next[n]) next[n] = hl[a.name]!;
      });
      if (Object.keys(next).length) m.attrs = next;
      else delete m.attrs;
      tidy(meta, 'entity', id);
      return meta;
    };

    const deleteRows = (rows: readonly number[]): void => {
      if (!table || !rows.length) return;
      const drop = new Set(rows);
      const old = attrs();
      const next = old.filter((_, i) => !drop.has(i));
      // a highlight stays while another attribute still has that name
      const names = old.map((a, i) => (drop.has(i) ? (next.some((x) => x.name === a.name) ? a.name : null) : a.name));
      sel = [];
      if (setAttrs(next, t('history.attrDelete'), remapHighlights(names))) core.toast(t('table.deleted', { n: rows.length }));
      refresh();
    };

    /**
     * Moves rows to the gap before attribute `gap` (attrs().length: after the last), keeping their order; they stay
     * selected. Highlights are keyed by name, so they move along.
     */
    const moveRows = (rows: readonly number[], gap: number): void => {
      if (!table || !rows.length) return;
      const old = attrs();
      const moving = new Set(rows);
      const rest = old.filter((_, i) => !moving.has(i));
      const at = old.slice(0, gap).filter((_, i) => !moving.has(i)).length;
      const moved = old.filter((_, i) => moving.has(i));
      const next = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
      if (next.every((a, i) => a === old[i])) return;
      sel = moved.map((_, k) => at + k);
      setAttrs(next, t('history.attrMove'));
      refresh();
    };

    /** Writes look keys into the highlights of the selected rows; a boolean equal to the row's preset is not stored. */
    const setLook = (patch: Readonly<Record<string, unknown>>): void => {
      if (!table || !sel.length) return;
      const list = attrs();
      writeAttrLook(core, table, sel.flatMap((i) => (list[i] ? [list[i]!.name] : [])), patch);
    };

    // ---- the attribute toolbar --------------------------------------------------------------------------------

    const first = (): ErAttribute | undefined => attrs()[sel[0] ?? -1];
    const look = (): AttrHighlight => {
      const a = first();
      return a && table ? attrLook(core.getM('entity', table).attrs, a.name) : {};
    };
    const tableValue = (k: string): unknown => (table ? effectiveValue(styleEnv(core), { kind: 'entity', id: table }, k) : undefined);
    const effRaw = (k: string): unknown => {
      const a = first();
      if (!a) return undefined;
      const l = look();
      switch (k) {
        case 'color': return l.color ?? tableValue('attrColor');
        case 'fontFamily': return l.fontFamily ?? '';
        case 'fontSize': return l.fontSize ?? tableValue('attrSize') ?? 14;
        case 'fontWeight': return l.bold ? 700 : 400;
        case 'italic': return l.italic === true;
        case 'underline': return l.underline === true;
        case 'preset': return l.preset ?? '';
        default: return undefined;
      }
    };
    const set = (k: string | Readonly<Record<string, unknown>>, v?: unknown): void => {
      const patch: Record<string, unknown> = typeof k === 'object' && k ? { ...k } : { [k as string]: v };
      const lookPatch: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(patch)) {
        if (key === 'fontWeight') lookPatch['bold'] = Number(val) >= 600;
        else if (key === 'preset') Object.assign(lookPatch, { preset: val || undefined, color: undefined, bold: undefined, italic: undefined, underline: undefined });
        else if (LOOK_KEYS.has(key)) lookPatch[key] = val;
      }
      if (Object.keys(lookPatch).length) setLook(lookPatch);
    };

    const rowRect = (i: number): Rect | null => {
      const b = box();
      const r = b?.rows?.[i];
      return b && r ? core.rectOnScreen({ x: b.x - b.w / 2, y: r.y, w: b.w, h: r.h }) : null;
    };
    const palette = (): { name: string; value: string }[] => Object.entries(core.result.theme.palette ?? {}).map(([name, value]) => ({ name, value }));
    const api: ToolbarApi = {
      selection: () => (table && sel.length && editing() && !editor ? { kind: 'attr', id: `${table}#${sel[0]}` } : null),
      editable: () => editing(),
      multiCount: () => sel.length,
      selectionTypes: () => (sel.length > 1 ? [{ kind: 'attr', count: sel.length, selected: true }] : null),
      setTypeSelected: () => undefined,
      eff: (k) => {
        const v = effRaw(k);
        return typeof v === 'string' && v.startsWith('@') ? core.result.rctx.color(v) ?? v : v;
      },
      effRaw,
      set,
      palette,
      localPalette: () => Object.entries(core.meta.styles['palette'] ?? {}).flatMap(([name, v]) => (typeof v['color'] === 'string' ? [{ name, value: v['color'] }] : [])),
      addLocalColor: (hex) => {
        const res = addLocalColor(core.meta, hex);
        applyMeta(core, t('history.paletteAdd'), res);
        return res.name;
      },
      removeLocalColor: (name) => void applyMeta(core, t('history.paletteRemove'), removeLocalColor(core.meta, name)),
      customColor: (hex) => relativeColor(hex, core.result.theme.palette),
      themeFont: () => core.result.theme.font,
      themeFontName: () => (core.result.theme.font.split(',')[0] ?? '').replace(/['"]/g, '').trim(),
      anchorRect: () => {
        let r: Rect | null = null;
        for (const i of sel) {
          const q = rowRect(i);
          if (!q) continue;
          r = r ? { x: Math.min(r.x, q.x), y: Math.min(r.y, q.y), w: Math.max(r.x + r.w, q.x + q.w) - Math.min(r.x, q.x), h: Math.max(r.y + r.h, q.y + q.h) - Math.min(r.y, q.y) } : q;
        }
        return r;
      },
      hBounds: () => freeStrip(core),
      diagramType: () => core.model.type,
      del: () => deleteRows(sel),
      preset: () => String(effRaw('preset') ?? ''),
      renderPresets: (grid, done) => {
        grid.style.setProperty('--pp-cols', '3');
        const cur = String(effRaw('preset') ?? '');
        const sample = first()?.name ?? 'attribute';
        for (const name of ['', ...Object.keys(ATTR_PRESETS)]) {
          const p: AttrHighlight = name ? ATTR_PRESETS[name]! : {};
          const text = h('span', {
            style: {
              color: core.result.rctx.color(p.color) ?? '', fontWeight: p.bold ? '700' : '400', fontStyle: p.italic ? 'italic' : 'normal',
              textDecoration: p.underline ? 'underline' : 'none', fontFamily: core.result.theme.font,
            },
          }, sample);
          const on = name === cur;
          const b = h('button', { type: 'button', class: 'pp-item' + (on ? ' on' : ''), 'aria-pressed': String(on), title: t(`attrPreset.${name || 'none'}`) },
            h('div', { class: 'pp-pic attr-pp', 'aria-hidden': 'true' }, text), h('span', { class: 'pp-name' }, t(`attrPreset.${name || 'none'}`)));
          b.addEventListener('click', () => {
            set('preset', name);
            done();
          });
          grid.append(b);
        }
      },
    };
    let tb: ToolbarHandle | null = null;
    let tbLoading: Promise<void> | null = null;
    const ensureToolbar = (): Promise<void> => (tbLoading ??= import('../../../ui/style-toolbar.js').then(({ createToolbar }) => {
      if (destroyed || tb) return;
      tb = createToolbar(wrap, api, { i18n: core.i18n, kinds: { attr: ATTR_SPEC } });
      tb.refresh();
    }));
    /** Repaints the row selection and rebuilds the attribute toolbar. */
    const refresh = (): void => {
      core.drawOverlay();
      if (sel.length && table && !tb) void ensureToolbar();
      tb?.refresh();
    };

    // ---- selection overlay ------------------------------------------------------------------------------------

    offs.push(core.addOverlay({
      id: 'er-table',
      order: 11,
      paint(k) {
        const b = box();
        if (!table || !b || b.hidden) return [];
        const out: SceneNode[] = [];
        const p = 6 / k;
        out.push(el('rect', { class: 'entered-box', x: b.x - b.w / 2 - p, y: b.y - b.h / 2 - p, width: b.w + 2 * p, height: b.h + 2 * p, rx: 8 / k, 'stroke-width': 2 / k }, 'table-box'));
        for (const i of sel) {
          const r = b.rows?.[i];
          if (r && !r.add) out.push(el('rect', { class: 'attr-sel', x: b.x - b.w / 2 + 1, y: r.y, width: b.w - 2, height: r.h, rx: 3 / k, 'stroke-width': 1.2 / k }, `attr-sel:${i}`));
        }
        // where dragged rows will land
        const rows = (b.rows ?? []).filter((r) => !r.add);
        if (dropGap !== null && rows.length) {
          const y = dropGap < rows.length ? rows[dropGap]!.y : rows[rows.length - 1]!.y + rows[rows.length - 1]!.h;
          out.push(el('line', { class: 'attr-drop', x1: b.x - b.w / 2 + 4, y1: y, x2: b.x + b.w / 2 - 4, y2: y, 'stroke-width': 2.5 / k }, 'attr-drop'));
        }
        return out;
      },
    }));

    // ---- pointer: rows are selected like items and dragged to reorder ----------------------------------------

    /** The gap a dragged row would drop into at diagram y (before attribute g; the count: after the last). */
    const gapAt = (y: number): number => {
      const rows = (box()?.rows ?? []).filter((r) => !r.add);
      const g = rows.findIndex((r) => y < r.y + r.h / 2);
      return g < 0 ? rows.length : g;
    };
    let dropGap: number | null = null;
    /** The row a Shift-click extends the selection from. */
    let anchor = 0;
    const range = (a: number, b: number): number[] => {
      const out: number[] = [];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
      return out;
    };
    offs.push(core.addGestureSource({
      id: 'er-table',
      priority: 95,
      down(ev, hit) {
        if (!table || !editing() || ev.button !== 0 || core.tool.peek() === 'hand' || core.spaceDown) return null;
        const at = rowAt(hit.p);
        if (!at) {
          // a press outside the table leaves it; the press then does what it does on the canvas
          exit(false);
          return null;
        }
        if (at === 'title') {
          sel = [];
          refresh();
          return NOOP;
        }
        if (at.add) {
          sel = [];
          refresh();
          return { move: () => undefined, click: () => editRow(-1) };
        }
        const i = at.i;
        // ⌘ / Ctrl-click: add or remove the row; Shift-click: the range from the last clicked row
        if (ev.metaKey || ev.ctrlKey) {
          sel = sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b);
          anchor = i;
          refresh();
          return NOOP;
        }
        if (ev.shiftKey) {
          sel = range(sel.length ? anchor : i, i);
          refresh();
          return NOOP;
        }
        // pressing a selected row keeps the selection (to drag all of it); a click without moving selects the row alone
        if (!sel.includes(i)) sel = [i];
        anchor = i;
        refresh();
        const moving = [...sel];
        const stop = (): void => {
          dropGap = null;
          core.dom.root.classList.remove('attr-moving');
          core.drawOverlay();
        };
        return {
          threshold: 4,
          move: (_dx, dy) => {
            core.dom.root.classList.add('attr-moving');
            dropGap = gapAt(hit.p.y + dy);
            core.drawOverlay();
          },
          end: () => {
            const gap = dropGap;
            stop();
            if (gap !== null) moveRows(moving, gap);
          },
          cancel: stop,
          click: () => {
            sel = [i];
            refresh();
          },
        };
      },
    }));

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
    core.dom.svg.addEventListener('dblclick', (ev) => {
      if (!editing() || core.model.type !== 'er' || core.tool.peek() === 'hand') return;
      if (table) {
        const at = rowAt(core.toDiagram(ev));
        if (!at) return;
        ev.stopPropagation();
        ev.preventDefault();
        if (at === 'title') core.run('inlineEdit', { kind: 'entity', id: table });
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
    }, { capture: true, signal: ac.signal });

    // ---- editing a row in place -------------------------------------------------------------------------------

    const closeEditor = (apply: boolean): void => editor?.close(apply);
    /** Opens the text box over row i (-1: the empty last row, a new attribute). */
    const editRow = (i: number): void => {
      closeEditor(true);
      if (!table) return;
      const b = box();
      const rows = b?.rows ?? [];
      const ri = i < 0 ? rows.findIndex((r) => r.add) : i;
      const rect = rowRect(ri);
      const a = i >= 0 ? attrs()[i] : undefined;
      if (!b || !rect || (i >= 0 && !a)) return;
      sel = i >= 0 ? [i] : [];
      const inp = h('input', { type: 'text', class: 'attr-edit', spellcheck: 'false', placeholder: t('table.placeholder'), 'aria-label': i < 0 ? t('table.newAttr') : t('table.editAttr') });
      inp.value = a ? attrText(a) : '';
      const k = core.viewport.state.k;
      const size = Number(tableValue('attrSize')) || 14;
      Object.assign(inp.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${Math.max(rect.w, 160)}px`, height: `${rect.h}px`, fontSize: `${size * k}px` });
      wrap.append(inp);
      tb?.refresh();
      core.drawOverlay();
      let closed = false;
      const finish = (apply: boolean, next = false): boolean => {
        if (closed) return true;
        const v = inp.value.trim();
        let ok = true;
        if (apply) {
          const list = attrs();
          if (i < 0) {
            if (v) {
              const na = parseAttrLine(v);
              if (!na) ok = false;
              else setAttrs([...list, na], t('history.attrAdd'));
            }
          } else if (!v) {
            // an emptied row is deleted
            closed = true;
            editor = null;
            inp.remove();
            deleteRows([i]);
            return true;
          } else if (v !== attrText(list[i]!)) {
            const na = parseAttrLine(v);
            if (!na) ok = false;
            else {
              const names = list.map((x, j) => (j === i ? na.name : x.name));
              setAttrs(list.map((x, j) => (j === i ? na : x)), t('history.attrEdit'), remapHighlights(names));
            }
          }
        }
        if (!ok) {
          core.toast(t('table.badAttr'));
          inp.classList.add('bad');
          if (next) return false; // Enter: stay and fix it
        }
        closed = true;
        editor = null;
        inp.remove();
        core.drawOverlay();
        refresh();
        // typing into the last row: straight on to the next new attribute
        if (next && i < 0 && v && ok) editRow(-1);
        else core.dom.root.focus({ preventScroll: true });
        return true;
      };
      editor = { close: (apply) => void finish(apply) };
      inp.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(false);
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          finish(true, true);
        }
      });
      inp.addEventListener('input', () => inp.classList.remove('bad'));
      inp.addEventListener('blur', () => void finish(true));
      inp.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      inp.focus();
      inp.select();
    };
    // pressing on the canvas applies the open row editor first
    core.dom.svg.addEventListener('pointerdown', () => closeEditor(true), { capture: true, signal: ac.signal });

    // ---- keys ------------------------------------------------------------------------------------------------

    core.shortcuts.add(
      {
        id: 'table-escape', keys: ['escape'], label: 'Clear the attribute selection, then leave the table', group: 'Edit', editOnly: true,
        run: () => {
          if (!table) return false;
          if (tb?.isOpen()) tb.close(true);
          else if (sel.length) {
            sel = [];
            refresh();
          } else exit();
          return true;
        },
      },
      { id: 'table-delete', keys: ['delete'], label: 'Delete the selected attributes', group: 'Edit', editOnly: true, run: () => (table && sel.length ? deleteRows(sel) : false) },
      {
        id: 'table-select-all', keys: ['mod+a'], label: 'Select every attribute of the table', group: 'Edit', editOnly: true,
        run: () => {
          if (!table) return false;
          sel = attrs().map((_, i) => i);
          refresh();
          return true;
        },
      },
      {
        id: 'table-edit-row', keys: ['enter'], label: 'Edit the selected attribute (the empty row: a new one)', group: 'Edit', editOnly: true,
        run: () => {
          if (!table) return false;
          editRow(sel[0] ?? -1);
          return true;
        },
      },
      {
        id: 'table-move-rows', keys: ['alt+arrowup', 'alt+arrowdown'], label: 'Move the selected attributes up / down', group: 'Edit', editOnly: true,
        run: (ev) => {
          if (!table) return false;
          if (sel.length) moveRows(sel, ev.key === 'ArrowUp' ? Math.max(0, sel[0]! - 1) : Math.min(attrs().length, sel[sel.length - 1]! + 2));
          return true;
        },
      },
      {
        id: 'table-rows', keys: ['arrowup', 'arrowdown', 'shift+arrowup', 'shift+arrowdown'], label: 'Select the previous / next attribute', group: 'Edit', editOnly: true,
        run: (ev) => {
          if (!table) return false;
          const n = attrs().length;
          if (!n) return true;
          const dir = ev.key === 'ArrowUp' ? -1 : 1;
          const cur = dir < 0 ? sel[0] ?? n : sel[sel.length - 1] ?? -1;
          const next = Math.max(0, Math.min(n - 1, cur + dir));
          sel = ev.shiftKey ? [...new Set([...sel, next])].sort((a, b) => a - b) : [next];
          refresh();
          return true;
        },
      },
    );

    // ---- keeping in step with the editor ----------------------------------------------------------------------

    offs.push(
      core.on('draw', () => {
        if (!table) return;
        // the table went away (undo, code edit, another diagram type) or the editor left Edit mode
        if (!editing() || !er()?.entities.has(table)) {
          exit(false);
          return;
        }
        const n = attrs().length;
        sel = sel.filter((i) => i < n);
        mark();
        placeBar();
        tb?.refresh();
      }),
      core.on('selection', () => {
        if (!table || !core.selection().length) return;
        const s = core.selection();
        // renaming the table selects it: it stays in table editing; any other selection leaves
        if (s.length === 1 && s[0]!.kind === 'entity' && s[0]!.id === table) core.select([]);
        else exit(false);
      }),
      core.on('mode', () => exit(false)),
      core.on('view', () => tb?.place()),
      core.provide('editTable', (id: string | null) => (id ? enter(id) : exit())),
    );

    return () => {
      destroyed = true;
      closeEditor(false);
      ac.abort();
      for (const off of offs) off();
      tb?.destroy();
      bar?.remove();
      core.tableView = null;
      core.dom.root.classList.remove('table-edit');
    };
  },
};
