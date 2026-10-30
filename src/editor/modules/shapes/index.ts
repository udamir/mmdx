// Shapes menu (A.3 rows 30–31): drag an item onto the canvas or click it to add it in the middle; preset submenus
// beside it (2–5 × 2–5 grid sized to the free space); ER: the table presets instead. `S` toggles it.
// Ported from prototype/app.js `buildPalette`, `showShapePresets`, `showTablePresets`, `toggleTablePresets`,
// `setShapesMenu`, `startPaletteDrag`, `groupAt`, `dropPaletteItem`. The dock buttons are built by the panels module,
// which calls `core.run('toggleShapesMenu', button)`.
import { presetShape } from '../../../core/render/flowchart.js';
import { presetsFor } from '../../../core/ops/style-env.js';
import type { ItemKind, Point } from '../../../core/types.js';
import { h } from '../../../ui/h.js';
import { drawItemPreview, type PreviewKind } from '../../../ui/item-preview.js';
import { fitPresetGrid } from '../../../ui/shape-preview.js';
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { elementsAt } from '../connect/geometry.js';
import { SHAPES_CSS } from './css.js';
import { dropPaletteItem } from './drop.js';
import { isItem, PALETTE_ITEMS, PALETTE_TITLE, paletteItem, SEQ_PRESET_KIND, SEQ_SHAPE, tableIcon, type PaletteItem } from './items.js';

export { dropPaletteItem, groupAt } from './drop.js';
export { PALETTE_ITEMS, paletteItem } from './items.js';

/** Centre of the canvas in diagram coordinates (click on a palette item). */
function canvasCenter(core: EditorCore): Point {
  const r = core.dom.svg.getBoundingClientRect();
  return core.toDiagram({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
}

/** Adds an item of the Shapes menu (`addShape` action): `kind` is a palette key (`rect`, `actor`, `note`, `entity`…). */
export function addShape(core: EditorCore, kind: string, opts: { preset?: string; at?: Point } = {}): boolean {
  const item = paletteItem(core.model.type, kind);
  if (!item) return false;
  const it: PaletteItem = opts.preset ? { ...item, preset: opts.preset } : item;
  return dropPaletteItem(core, it, opts.at ?? canvasCenter(core));
}

export const shapesModule: EditorModule = {
  id: 'shapes',
  css: SHAPES_CSS,
  install(core) {
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const offs: (() => void)[] = [];
    const root = core.dom.root;
    const menu = h('div', { class: 'shapes-menu edit-only', hidden: true });
    const sub = h('div', { class: 'mtb-pop mtb-sub shapes-sub edit-only', hidden: true });
    root.append(menu, sub);
    let anchor: HTMLElement | null = null;
    let builtFor: string | null = null;
    let subShape: string | null = null;
    let ghost: HTMLElement | null = null;

    const markAnchor = (on: boolean): void => {
      anchor?.classList.toggle('on', on);
      anchor?.setAttribute('aria-expanded', String(on));
    };

    // ---- the menu ------------------------------------------------------------------------------------------------

    const build = (): void => {
      const type = core.model.type;
      builtFor = type;
      menu.replaceChildren();
      if (type !== 'flowchart' && type !== 'sequence') return;
      menu.append(h('div', { class: 'pal-title' }, PALETTE_TITLE[type] ?? ''));
      for (const it of PALETTE_ITEMS[type]) {
        if (!isItem(it)) {
          menu.append(h('div', { class: 'pal-sep' }));
          continue;
        }
        const b = h('button', { type: 'button', class: 'pal-item', title: `${it.label} — drag onto the canvas (or click)` }, it.icon(), h('span', null, it.label.split(' — ')[0]!));
        b.addEventListener('pointerdown', (ev) => startDrag(it, ev, b));
        // flowchart shapes and sequence items: a presets submenu beside the menu
        if (type === 'flowchart' || SEQ_PRESET_KIND[it.key]) b.addEventListener('pointerenter', () => showShapePresets(it, b));
        menu.append(b);
      }
    };

    const placeMenu = (): void => {
      const dock = anchor?.closest<HTMLElement>('.view-tools, .tool-dock') ?? anchor;
      if (!dock) {
        menu.style.removeProperty('left');
        menu.style.removeProperty('top');
        return;
      }
      const dr = dock.getBoundingClientRect(), rr = root.getBoundingClientRect();
      if (!dr.width && !dr.height) return;
      menu.style.left = `${dr.right - rr.left + 8}px`;
      menu.style.top = `${dr.top + dr.height / 2 - rr.top}px`;
    };

    const hideSub = (): void => {
      sub.hidden = true;
      subShape = null;
    };

    const setMenu = (open: boolean): void => {
      const type = core.model.type;
      if (open && (type !== 'flowchart' && type !== 'sequence')) open = false;
      if (open && builtFor !== type) build();
      if (open && !menu.childElementCount) build();
      menu.hidden = !open;
      if (!open) hideSub();
      markAnchor(open);
      if (open) placeMenu();
    };

    // ---- preset submenus -----------------------------------------------------------------------------------------

    const presetTile = (item: PaletteItem, name: string, title: string): { b: HTMLElement; pic: HTMLElement } => {
      const pic = h('div', { class: 'pp-pic' });
      const b = h('button', { type: 'button', class: 'pp-item', title }, pic, h('span', { class: 'pp-name' }, name || 'default'));
      const it: PaletteItem = name ? { ...item, preset: name } : item;
      b.addEventListener('pointerdown', (ev) => startDrag(it, ev, b));
      return { b, pic };
    };

    const preview = (pic: HTMLElement, kind: PreviewKind, name: string, h: number, shape?: string): void =>
      drawItemPreview(pic, kind, name, core.result.theme, { fit: { h }, styles: core.meta.styles, ctx: core.ctx, ...(shape ? { shape } : {}) });

    const env = (): Parameters<typeof presetsFor>[0] => ({ model: core.model, meta: core.meta, theme: core.result.theme, color: core.result.rctx.color });

    function showShapePresets(item: PaletteItem, btn: HTMLElement): void {
      if (subShape === item.key && !sub.hidden) return;
      subShape = item.key;
      sub.hidden = false;
      sub.replaceChildren(h('div', { class: 'mtb-label' }, `Presets — ${item.label.split(' /')[0]!.split(' — ')[0]!}`));
      const grid = h('div', { class: 'pp-grid' });
      sub.append(grid);
      const seq = core.model.type === 'sequence';
      const kind: ItemKind = seq ? SEQ_PRESET_KIND[item.key] ?? 'participant' : 'node';
      const P = presetsFor(env(), kind) ?? {};
      const names = ['', ...Object.keys(P).filter((p) => p !== '_base' && (seq || presetShape(P[p]) === item.key))];
      const pics: [HTMLElement, string][] = [];
      for (const name of names) {
        const { b, pic } = presetTile(item, name, `${name ? `Preset "${name}"` : 'Default style'} — click to add, or drag onto the canvas`);
        grid.append(b);
        pics.push([pic, name]);
      }
      // beside the Shapes menu, level with the hovered item, sized to the free canvas and the number of presets;
      // moved up only as far as needed to stay inside the canvas
      const rr = root.getBoundingClientRect(), mr = menu.getBoundingClientRect(), ar = btn.getBoundingClientRect();
      const { w: ww, h: hh } = fitPresetGrid(sub, rr.right - mr.right - 16, rr.height - 16);
      // narrow canvas: slide left (over the menu) rather than be cut off by the canvas edge
      sub.style.left = `${Math.min(mr.right + 8, rr.right - 8 - ww) - rr.left}px`;
      sub.style.top = `${Math.max(rr.top + 8, Math.min(ar.top - 12, rr.bottom - 8 - hh)) - rr.top}px`;
      const shape = seq ? SEQ_SHAPE[item.key] : item.key;
      for (const [pic, name] of pics) preview(pic, kind as PreviewKind, name, 40, shape);
    }

    const tableItem = (): PaletteItem => paletteItem('er', 'entity') ?? { key: 'entity', label: 'Entity (table)', icon: tableIcon };

    const showTablePresets = (): void => {
      if (subShape === 'entity' && !sub.hidden) return;
      subShape = 'entity';
      sub.hidden = false;
      markAnchor(true);
      sub.replaceChildren(h('div', { class: 'mtb-label' }, 'Table presets — click to add, or drag onto the canvas'));
      const grid = h('div', { class: 'pp-grid' });
      sub.append(grid);
      const P = presetsFor(env(), 'entity') ?? {};
      const pics: [HTMLElement, string][] = [];
      for (const name of ['', ...Object.keys(P).filter((p) => p !== '_base')]) {
        const { b, pic } = presetTile(tableItem(), name, `${name ? `Table preset "${name}"` : 'Default table style'} — click to add, or drag onto the canvas`);
        grid.append(b);
        pics.push([pic, name]);
      }
      // beside the tool bar, level with the Table button; moved up if it would not fit below
      const rr = root.getBoundingClientRect();
      const dock = anchor?.closest<HTMLElement>('.view-tools, .tool-dock') ?? anchor;
      const tr = dock?.getBoundingClientRect() ?? { right: rr.left + 56, left: rr.left };
      const br = anchor?.getBoundingClientRect() ?? { top: rr.top + rr.height / 2 };
      const { w: ww, h: hh } = fitPresetGrid(sub, rr.right - tr.right - 16, rr.height - 16);
      sub.style.left = `${Math.min(tr.right + 8, rr.right - 8 - ww) - rr.left}px`;
      sub.style.top = `${Math.max(rr.top + 8, Math.min(br.top - 12, rr.bottom - 8 - hh)) - rr.top}px`;
      for (const [pic, name] of pics) preview(pic, 'entity', name, 56);
    };

    const hideTablePresets = (): void => {
      if (subShape !== 'entity') return;
      hideSub();
      markAnchor(false);
    };

    const toggle = (a?: HTMLElement): void => {
      if (a && a !== anchor) {
        markAnchor(false);
        anchor = a;
      }
      if (core.mode.peek() !== 'edit') return;
      if (core.model.type === 'er') {
        if (!sub.hidden && subShape === 'entity') hideTablePresets();
        else showTablePresets();
      } else setMenu(menu.hidden);
    };

    // ---- drag (or click) an item onto the canvas -----------------------------------------------------------------

    function startDrag(item: PaletteItem, ev: PointerEvent, btn: HTMLElement): void {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ghost?.remove();
      const gh = h('div', { class: 'pal-ghost' }, item.icon());
      ghost = gh;
      const rr = root.getBoundingClientRect();
      const place = (e: { clientX: number; clientY: number }): void => {
        gh.style.left = `${e.clientX - rr.left}px`;
        gh.style.top = `${e.clientY - rr.top}px`;
      };
      place(ev);
      root.append(gh);
      try {
        btn.setPointerCapture(ev.pointerId);
      } catch {
        // capture is best-effort
      }
      const start = { x: ev.clientX, y: ev.clientY };
      let moved = false;
      const drag = new AbortController();
      const finish = (e: PointerEvent, cancelled: boolean): void => {
        drag.abort();
        gh.remove();
        if (ghost === gh) ghost = null;
        if (cancelled) return;
        const r = core.dom.svg.getBoundingClientRect();
        const at = elementsAt(core, e)[0] ?? null;
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
          && !(at && (btn.contains(at) || menu.contains(at) || sub.contains(at)));
        if (moved && inside) dropPaletteItem(core, item, core.toDiagram(e));
        else if (!moved) dropPaletteItem(core, item, canvasCenter(core));
        if (!moved || inside) {
          setMenu(false);
          hideTablePresets();
          core.setTool('pointer');
        }
      };
      btn.addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) moved = true;
        place(e);
      }, { signal: drag.signal });
      btn.addEventListener('pointerup', (e) => finish(e, false), { signal: drag.signal });
      btn.addEventListener('pointercancel', (e) => finish(e, true), { signal: drag.signal });
      ac.signal.addEventListener('abort', () => drag.abort());
    }

    // ---- wiring --------------------------------------------------------------------------------------------------

    offs.push(core.provide('toggleShapesMenu', (a?: HTMLElement) => toggle(a)));
    offs.push(core.provide('addShape', (kind: string, opts?: { preset?: string; at?: Point }) => {
      addShape(core, kind, opts ?? {});
    }));
    core.shortcuts.add({
      id: 'shapes-menu', keys: ['s'], label: 'Shapes menu', group: 'Tools', editOnly: true,
      run: () => {
        if (!core.has('toggleShapesMenu')) return false;
        core.run('toggleShapesMenu');
      },
    });

    // close on a press anywhere else in the editor (the dock button toggles it itself)
    root.addEventListener('pointerdown', (ev) => {
      const path = ev.composedPath();
      const keep = path.includes(menu) || path.includes(sub) || (!!anchor && path.includes(anchor));
      if (keep) return;
      if (!menu.hidden) setMenu(false);
      else if (subShape === 'entity') hideTablePresets();
    }, { capture: true, ...sig });
    // Esc closes the menu first (before it clears the selection or changes the tool)
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || (menu.hidden && sub.hidden)) return;
      setMenu(false);
      hideTablePresets();
      hideSub();
      ev.stopPropagation();
      ev.preventDefault();
    }, { capture: true, ...sig });
    offs.push(core.on('mode', () => {
      if (core.mode.peek() !== 'edit') {
        setMenu(false);
        hideSub();
        markAnchor(false);
      }
    }));
    // the diagram type changed (code panel, new diagram): the menu follows it
    let typeSeen = core.model.type;
    offs.push(core.on('draw', () => {
      const type = core.model.type;
      if (type === typeSeen) return;
      typeSeen = type;
      if (!menu.hidden) {
        if (type === 'flowchart' || type === 'sequence') build();
        else setMenu(false);
      }
      if (subShape) {
        hideSub();
        markAnchor(!menu.hidden);
      }
    }));

    return () => {
      ac.abort();
      for (const off of offs) off();
      markAnchor(false);
      ghost?.remove();
      menu.remove();
      sub.remove();
    };
  },
};
