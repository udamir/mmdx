// The Shapes menu's palette (R6): the kind's palette in the ShapePalette block (its lazy chunk), its sections (a list split at its separators, under the title, unless the kind gives sections) and items by key.
import type { ShapePaletteHandle, ShapePaletteItem } from '../../../ui/blocks/shape-palette.js';
import type { EditorCore } from '../../core.js';
import { isItem, type PaletteItem } from '../../kinds/palette.js';
import { canvasCenter } from '../../lib/shape-drag.js';
import { loadShapePalette, paletteOf } from './lib.js';

export interface PaletteMenu {
  /** The diagram type the palette was built for (null: none yet). */
  readonly builtFor: string | null;
  /** The next palette built takes the focus (its search field) once it shows. */
  focusNext: boolean;
  /** (Re)builds the palette of the current type into the menu. */
  build(): void;
  /** Clears the search. */
  reset(): void;
  destroy(): void;
}

export interface PaletteMenuOptions {
  core: EditorCore;
  menu: HTMLElement;
  signal: AbortSignal;
  /** The palette shows (place the menu). */
  shown(): void;
  /** An item was clicked: add it at the canvas's centre (`alt`: give the selected nodes its shape). */
  pick(it: PaletteItem, at: { x: number; y: number }, alt: boolean): void;
  /** A press on an item: drag it onto the canvas. */
  drag(it: PaletteItem, ev: PointerEvent, el: HTMLElement): void;
}

export function createPaletteMenu(o: PaletteMenuOptions): PaletteMenu {
  const { core, menu } = o;
  let palette: ShapePaletteHandle | null = null;
  /** Palette items by key (the block's items are the kind's). */
  let byKey = new Map<string, PaletteItem>();
  let builtFor: string | null = null;
  const build = (): void => {
    const type = core.model.type;
    const pal = paletteOf(core);
    if (pal?.mode !== 'menu') return;
    void loadShapePalette().then((m) => {
      if (o.signal.aborted || core.model.type !== type) return;
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
          if (it) o.drag(it, ev, el);
        },
        onPick: (bi, ev) => {
          const it = byKey.get(bi.key);
          if (it) o.pick(it, canvasCenter(core), ev.altKey);
        },
      });
      menu.replaceChildren(palette.el);
      menu.classList.toggle('grid', pal.layout === 'grid');
      o.shown();
      if (api.focusNext) palette.focus();
      api.focusNext = false;
    }, (e: unknown) => core.toast(core.i18n.t('shapes.loadFailed', { e: e instanceof Error ? e.message : String(e) }), { error: true }));
  };
  const api: PaletteMenu = {
    get builtFor() {
      return builtFor;
    },
    focusNext: false,
    build,
    reset: () => palette?.setQuery(''),
    destroy: () => palette?.destroy(),
  };
  return api;
}
