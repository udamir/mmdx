// Shapes menu (A.3 rows 30–31, T05 §4.2): the kind's palette in the ShapePalette block (a lazy chunk, loaded the first
// time the menu opens) — sections with headings and, unless the kind turns it off, a search field; drag an item onto the canvas or click it
// to add it in the middle; Alt-click gives the selected nodes its shape instead; ER: the table presets instead (a 2–5 ×
// 2–5 grid sized to the free space). `S` toggles it.
// Ported from prototype/app.js `buildPalette`, `showTablePresets`, `toggleTablePresets`,
// `setShapesMenu`, `startPaletteDrag`, `groupAt`, `dropPaletteItem`. The dock buttons are built by the panels module,
// which calls `core.run('toggleShapesMenu', button)`. Split (R6): the helpers in lib.ts, the palette in menu.ts, the actions and what closes the menu in wiring.ts; the preset grid stays here.
import { presetsFor } from '../../../core/ops/style-env.js';
import type { ItemKind, Point } from '../../../core/types.js';
import { h } from '../../../ui/kit/h.js';
import { drawItemPreview, previewKind, type PreviewKind } from '../../../ui/diagram/item-preview.js';
import { fitPresetGrid } from '../../../ui/diagram/shape-preview.js';
import type { EditorModule } from '../../module.js';
import { SHAPES_CSS } from './css.js';
import { startMenuDrag } from '../../lib/shape-drag.js';
import { styleWithShapes } from '../../ops/shape.js';
import { dropPaletteItem } from '../../lib/shape-drop.js';
import { editKind } from '../../kinds/registry.js';
import { isItem, type PaletteItem } from '../../kinds/palette.js';
import { dockOf, paletteOf, placeMenu as placeBesideDock } from './lib.js';
import { createPaletteMenu } from './menu.js';
import { installShapesWiring } from './wiring.js';

export const shapesModule: EditorModule = {
  id: 'shapes',
  css: [SHAPES_CSS],
  install(scope) {
    const core = scope.core;
    const ac = new AbortController();
    const root = core.eventRoot;
    const menu = h('div', { class: 'shapes-menu edit-only', hidden: true });
    const sub = h('div', { class: 'mtb-pop mtb-sub shapes-sub edit-only', hidden: true });
    root.append(menu, sub);
    let anchor: HTMLElement | null = null;
    /** The grid palette (ER table presets) is open beside the menu. */
    let gridOpen = false;

    const markAnchor = (on: boolean): void => {
      anchor?.classList.toggle('on', on);
      anchor?.setAttribute('aria-expanded', String(on));
    };

    // ---- the menu ------------------------------------------------------------------------------------------------

    const palette = createPaletteMenu({
      core, menu, signal: ac.signal,
      shown: () => placeMenu(),
      pick: (it, at, alt) => addItem(it, at, alt),
      drag: (it, ev, el) => startDrag(it, ev, el),
    });

    /** Adds an item (or, with Alt and nodes selected, gives them its shape); closes the menu. */
    const addItem = (it: PaletteItem, at: Point, alt: boolean): void => {
      const kind = editKind(core.model.type);
      const nodes = core.selection().filter((x) => x.kind === 'node');
      if (alt && nodes.length && kind?.setShape && !it.preset) {
        styleWithShapes(core, nodes, { shape: it.key }, core.i18n.t('history.style'), (m) => m);
      } else if (!dropPaletteItem(core, it, at)) return;
      setMenu(false);
      hideTablePresets();
      core.setTool('pointer');
    };

    const placeMenu = (): void => placeBesideDock(menu, anchor, root);

    const hideSub = (): void => {
      sub.hidden = true;
      gridOpen = false;
    };

    const setMenu = (open: boolean): void => {
      const type = core.model.type;
      if (open && paletteOf(core)?.mode !== 'menu') open = false;
      if (open && (palette.builtFor !== type || !menu.childElementCount)) palette.build();
      else if (open) palette.reset();
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

    const env = (): Parameters<typeof presetsFor>[0] => core.styleEnv();

    /** The grid palette's one item (ER tables) and its presets. */
    const gridItem = (): { item: PaletteItem; kind: ItemKind } | null => {
      const pal = paletteOf(core);
      const item = pal?.mode === 'grid' ? pal.items.find(isItem) : undefined;
      const spec = item ? pal?.presets?.(item) : null;
      return item && spec ? { item, kind: spec.kind } : null;
    };

    const showTablePresets = (): void => {
      const gi = gridItem();
      if (!gi || (gridOpen && !sub.hidden)) return;
      gridOpen = true;
      sub.hidden = false;
      markAnchor(true);
      sub.replaceChildren(h('div', { class: 'mtb-label' }, paletteOf(core)?.title ?? ''));
      const grid = h('div', { class: 'pp-grid' });
      sub.append(grid);
      const P = presetsFor(env(), gi.kind) ?? {};
      const pics: [HTMLElement, string][] = [];
      for (const name of ['', ...Object.keys(P)]) {
        const { b, pic } = presetTile(gi.item, name, `${name ? `Table preset "${name}"` : 'Default table style'} — click to add, or drag onto the canvas`);
        grid.append(b);
        pics.push([pic, name]);
      }
      // beside the tool bar, level with the Table button; moved up if it would not fit below
      const rr = root.getBoundingClientRect();
      const dock = dockOf(anchor);
      const tr = dock?.getBoundingClientRect() ?? { right: rr.left + 56, left: rr.left };
      const br = anchor?.getBoundingClientRect() ?? { top: rr.top + rr.height / 2 };
      const { w: ww, h: hh } = fitPresetGrid(sub, rr.right - tr.right - 16, rr.height - 16);
      sub.style.left = `${Math.min(tr.right + 8, rr.right - 8 - ww) - rr.left}px`;
      sub.style.top = `${Math.max(rr.top + 8, Math.min(br.top - 12, rr.bottom - 8 - hh)) - rr.top}px`;
      for (const [pic, name] of pics) preview(pic, previewKind(core.model.type, gi.kind), name, 56);
    };

    const hideTablePresets = (): void => {
      if (!gridOpen) return;
      hideSub();
      markAnchor(false);
    };

    const toggle = (a?: HTMLElement): void => {
      if (a && a !== anchor) {
        markAnchor(false);
        anchor = a;
      }
      if (core.mode.peek() !== 'edit') return;
      if (paletteOf(core)?.mode === 'grid') {
        if (!sub.hidden && gridOpen) hideTablePresets();
        else showTablePresets();
      } else {
        palette.focusNext = menu.hidden && !a;
        setMenu(menu.hidden);
      }
    };

    // ---- drag (or click) an item onto the canvas -----------------------------------------------------------------

    function startDrag(item: PaletteItem, ev: PointerEvent, btn: HTMLElement): void {
      startMenuDrag(core, ev, btn, {
        ghost: item.icon,
        inside: [menu, sub],
        signal: ac.signal,
        drop: (at, e, click) => {
          if (click) addItem(item, at, e.altKey);
          else dropPaletteItem(core, item, at);
        },
        done: () => {
          setMenu(false);
          hideTablePresets();
          core.setTool('pointer');
        },
      });
    }

    // ---- wiring --------------------------------------------------------------------------------------------------

    installShapesWiring(scope, {
      menu, sub, anchor: () => anchor, open: () => !menu.hidden, gridOpen: () => gridOpen,
      toggle, setMenu, hideSub, hideTablePresets, markAnchor, rebuild: () => palette.build(),
    });

    return () => {
      ac.abort();
      markAnchor(false);
      palette.destroy();
      root.querySelector('.pal-ghost')?.remove();
      menu.remove();
      sub.remove();
    };
  },
};
