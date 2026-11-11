// Shapes menu (A.3 rows 30–31, T05 §4.2): the kind's palette in the ShapePalette block (a lazy chunk, loaded the first
// time the menu opens) — sections with headings and, unless the kind turns it off, a search field; drag an item onto the canvas or click it
// to add it in the middle; Alt-click gives the selected nodes its shape instead; ER: the table presets instead (a 2–5 ×
// 2–5 grid sized to the free space). `S` toggles it.
// Ported from prototype/app.js `buildPalette`, `showTablePresets`, `toggleTablePresets`,
// `setShapesMenu`, `startPaletteDrag`, `groupAt`, `dropPaletteItem`. The dock buttons are built by the panels module,
// which calls `core.run('toggleShapesMenu', button)`.
import { presetsFor } from '../../../core/ops/style-env.js';
import type { ItemKind, Point } from '../../../core/types.js';
import { h } from '../../../ui/kit/h.js';
import { registerMessages } from '../../../i18n.js';
import type { ShapePaletteHandle, ShapePaletteItem } from '../../../ui/blocks/shape-palette.js';
import { drawItemPreview, previewKind, type PreviewKind } from '../../../ui/diagram/item-preview.js';
import { fitPresetGrid } from '../../../ui/diagram/shape-preview.js';
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { SHAPES_CSS } from './css.js';
import { canvasCenter, startMenuDrag } from '../../lib/shape-drag.js';
import { styleWithShapes } from '../../ops/shape.js';
import { dropPaletteItem } from '../../lib/shape-drop.js';
import { editKind } from '../../kinds/registry.js';
import { isItem, type PaletteItem, type PaletteSpec } from '../../kinds/palette.js';
import { paletteItem } from './items.js';

/** The palette of the current diagram type. */
const paletteOf = (core: EditorCore): PaletteSpec | undefined => editKind(core.model.type)?.palette;


/** The block's chunk (with its CSS), loaded the first time a palette shows. */
let paletteChunk: Promise<typeof import('../../../ui/blocks/shape-palette.js')> | null = null;
export const loadShapePalette = (): Promise<typeof import('../../../ui/blocks/shape-palette.js')> =>
  (paletteChunk ??= Promise.all([import('../../../ui/blocks/shape-palette.js'), import('../../messages-media.js')]).then(([m, msg]) => {
    registerMessages(msg.EDITOR_MEDIA_MESSAGES);
    return m;
  }).catch((e: unknown) => {
    paletteChunk = null;
    throw e;
  }));

/** Adds an item of the Shapes menu (`addShape` action): `kind` is a palette key (`rect`, `actor`, `note`, `entity`…). */
export function addShape(core: EditorCore, kind: string, opts: { preset?: string; at?: Point } = {}): boolean {
  const item = paletteItem(core.model.type, kind);
  if (!item) return false;
  const it: PaletteItem = opts.preset ? { ...item, preset: opts.preset } : item;
  return dropPaletteItem(core, it, opts.at ?? canvasCenter(core));
}

export const shapesModule: EditorModule = {
  id: 'shapes',
  css: [SHAPES_CSS],
  install(scope) {
    const core = scope.core;
    const ac = new AbortController();
    const root = core.dom.root;
    const menu = h('div', { class: 'shapes-menu edit-only', hidden: true });
    const sub = h('div', { class: 'mtb-pop mtb-sub shapes-sub edit-only', hidden: true });
    root.append(menu, sub);
    let anchor: HTMLElement | null = null;
    let builtFor: string | null = null;
    /** The grid palette (ER table presets) is open beside the menu. */
    let gridOpen = false;

    const markAnchor = (on: boolean): void => {
      anchor?.classList.toggle('on', on);
      anchor?.setAttribute('aria-expanded', String(on));
    };

    // ---- the menu ------------------------------------------------------------------------------------------------

    let palette: ShapePaletteHandle | null = null;
    /** Palette items by key (the block's items are the kind's). */
    let byKey = new Map<string, PaletteItem>();

    const build = (): void => {
      const type = core.model.type;
      const pal = paletteOf(core);
      if (pal?.mode !== 'menu') return;
      void loadShapePalette().then((m) => {
        if (ac.signal.aborted || core.model.type !== type) return;
        core.addCss([m.SHAPE_PALETTE_CSS]);
        builtFor = type;
        const t = core.i18n.t;
        let sec = pal.sections;
        if (!sec) {
          // a list split at its separators, under the title
          const parts: PaletteItem[][] = [[]];
          for (const it of pal.items) if (isItem(it)) parts[parts.length - 1]!.push(it); else parts.push([]);
          sec = parts.filter((x) => x.length).map((items, i) => ({ title: i ? '' : pal.title, items }));
        }
        byKey = new Map(sec.flatMap((x) => x.items.map((it) => [it.key, it] as const)));
        const asBlock = (it: PaletteItem): ShapePaletteItem => ({ key: it.key, label: it.label, tip: it.tip ?? `${it.label} — ${t('shapes.dragTip')}`, ...(it.terms ? { terms: it.terms } : {}), icon: it.icon });
        palette?.destroy();
        palette = m.createShapePalette({
          // the grid (Mermaid Chart's) has no heading above its sections
          t, ...(pal.layout === 'grid' ? {} : { title: pal.title }), layout: pal.layout ?? 'list',
          sections: sec.map((x) => ({ title: x.title ? t(x.title) : '', items: x.items.map(asBlock) })),
          search: pal.search !== false,
          onPointerDown: (bi, ev, el) => {
            const it = byKey.get(bi.key);
            if (it) startDrag(it, ev, el);
          },
          onPick: (bi, ev) => {
            const it = byKey.get(bi.key);
            if (it) addItem(it, canvasCenter(core), ev.altKey);
          },
        });
        menu.replaceChildren(palette.el);
        menu.classList.toggle('grid', pal.layout === 'grid');
        placeMenu();
        if (focusOnOpen) palette.focus();
        focusOnOpen = false;
      }, (e: unknown) => core.toast(`Could not load the shapes: ${e instanceof Error ? e.message : String(e)}`, { error: true }));
    };
    let focusOnOpen = false;

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

    const placeMenu = (): void => {
      const dock = anchor?.closest<HTMLElement>('.view-tools, .tool-dock') ?? anchor;
      if (!dock) {
        menu.style.removeProperty('left');
        menu.style.removeProperty('top');
        return;
      }
      const dr = dock.getBoundingClientRect(), rr = root.getBoundingClientRect();
      if (!dr.width && !dr.height) return;
      // centred on the dock, moved up or down only as far as needed to stay inside the editor
      const mh = menu.getBoundingClientRect().height;
      const top = Math.max(8, Math.min(dr.top + dr.height / 2 - rr.top - mh / 2, rr.height - 8 - mh));
      menu.style.left = `${dr.right - rr.left + 8}px`;
      menu.style.top = `${top + mh / 2}px`;
    };

    const hideSub = (): void => {
      sub.hidden = true;
      gridOpen = false;
    };

    const setMenu = (open: boolean): void => {
      const type = core.model.type;
      if (open && paletteOf(core)?.mode !== 'menu') open = false;
      if (open && (builtFor !== type || !menu.childElementCount)) build();
      else if (open) palette?.setQuery('');
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
      for (const name of ['', ...Object.keys(P).filter((p) => p !== '_base')]) {
        const { b, pic } = presetTile(gi.item, name, `${name ? `Table preset "${name}"` : 'Default table style'} — click to add, or drag onto the canvas`);
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
        focusOnOpen = menu.hidden && !a;
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

    scope.onDispose(core.provide('toggleShapesMenu', (a?: HTMLElement) => toggle(a)));
    scope.onDispose(core.provide('addShape', (kind: string, opts?: { preset?: string; at?: Point }) => {
      addShape(core, kind, opts ?? {});
    }));
    core.shortcuts.add({
      id: 'shapes-menu', keys: ['s'], label: 'Shapes menu', group: 'Tools', editOnly: true,
      run: () => {
        if (!core.has('toggleShapesMenu')) return false;
        core.run('toggleShapesMenu');
        return true;
      },
    });

    // close on a press anywhere else in the editor (the dock button toggles it itself)
    scope.listen(root, 'pointerdown', (ev) => {
      const path = ev.composedPath();
      const keep = path.includes(menu) || path.includes(sub) || (!!anchor && path.includes(anchor));
      if (keep) return;
      if (!menu.hidden) setMenu(false);
      else if (gridOpen) hideTablePresets();
    }, { capture: true });
    // Esc closes the menu first (before it clears the selection or changes the tool)
    scope.listen(root, 'keydown', (ev) => {
      if (ev.key !== 'Escape' || (menu.hidden && sub.hidden)) return;
      setMenu(false);
      hideTablePresets();
      hideSub();
      ev.stopPropagation();
      ev.preventDefault();
    }, { capture: true });
    scope.onDispose(core.on('mode', () => {
      if (core.mode.peek() !== 'edit') {
        setMenu(false);
        hideSub();
        markAnchor(false);
      }
    }));
    // the diagram type changed (code panel, new diagram): the menu follows it
    let typeSeen = core.model.type;
    scope.onDispose(core.on('draw', () => {
      const type = core.model.type;
      if (type === typeSeen) return;
      typeSeen = type;
      if (!menu.hidden) {
        if (paletteOf(core)?.mode === 'menu') build();
        else setMenu(false);
      }
      if (gridOpen) {
        hideSub();
        markAnchor(!menu.hidden);
      }
    }));

    return () => {
      ac.abort();
      markAnchor(false);
      palette?.destroy();
      root.querySelector('.pal-ghost')?.remove();
      menu.remove();
      sub.remove();
    };
  },
};
