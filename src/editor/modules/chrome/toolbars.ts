// Floating style toolbar and page toolbar wiring (A.7 rows 39, 58–60, 63, 64, 88; prototype app ~1390–1795 and
// ~3529–3637): the toolbar API over the editor (effective values, overrides as one history step per run, presets,
// layers, the diagram palette "+", lock, paint, group / arrange / activation actions), the Order slider with a live
// preview committed once (`orderInfo` / `orderPreview` / `orderCommit`), ⌘[ / ⌘] (`moveSelection`), the page badge
// above the page's top-left corner and the page's own action bar.
import type { Rect } from '../../../core/types.js';
import type { PageToolbarApi, PageToolbarHandle } from '../../../ui/diagram/page-toolbar.js';
import type { ToolbarApi, StyleToolbarHandle, StyleToolbarOptions } from '../../../ui/diagram/style-toolbar.js';
import { STYLE_TOOLBAR_CSS } from '../../../ui/diagram/toolbar-styles.js';
import { h } from '../../../ui/kit/h.js';
import type { Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { withEdit } from '../../kinds/registry.js';
import { LiveEdit } from '../../ops/live.js';
import { selectionKey as selKey, type BarContext } from './bar-context.js';
import { createOrderSlider } from './order-slider.js';
import { pageToolbarApi } from './page-api.js';
import { paletteApi } from './palette-api.js';
import { styleToolbarApi } from './style-api.js';

export const TOOLBARS_CSS = /* css */ `
${STYLE_TOOLBAR_CSS}
.page-badge { position: absolute; left: 0; top: 0; z-index: 5; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--muted);
  font-size: 11px; font-weight: 600; letter-spacing: .02em; padding: 2px 8px; line-height: 16px; cursor: pointer; white-space: nowrap; }
.page-badge[hidden] { display: none; }
.page-badge:hover { color: var(--ink); border-color: var(--accent); }
.page-badge[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: #fff; }
.ed.dragging .page-badge { opacity: .5; }
`;

export const toolbarsModule: EditorModule = {
  id: 'toolbars',
  css: [TOOLBARS_CSS],
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const live = new LiveEdit(core);
    const wrap = core.overlayHost;

    // the item whose text is being edited keeps its toolbar: the text format menu acts on the selected words
    const primary = (): Sel | null => (core.mode.peek() !== 'edit' ? null : core.inlineEditing ? { ...core.inlineEditing } : core.selection()[0] ?? null);
    const multi = (): boolean => core.selection().length > 1;
    const bar: BarContext = { core, t, live, primary, multi };
    const pal = paletteApi(bar, () => {
      style?.refresh();
      page?.refresh();
    });
    const order = createOrderSlider(core, t, () => style?.refresh());
    scope.provide('moveSelection', order.move);

    // ---- the style toolbar
    let destroyed = false;
    let style: StyleToolbarHandle | null = null;
    let styleArgs: [ToolbarApi, StyleToolbarOptions] | null = null;
    let styleLoading: Promise<void> | null = null;
    // the style toolbar code loads with the first selection (prefetched when the browser is idle)
    const ensureStyleBar = (): Promise<void> => (styleLoading ??= import('../../../ui/diagram/style-toolbar.js').then(({ createStyleToolbar, SHAPE_PALETTE_CSS }) => {
      if (!styleArgs || style || destroyed) return;
      core.addCss([SHAPE_PALETTE_CSS]);
      style = createStyleToolbar(wrap, ...styleArgs);
      scope.onDispose(() => style?.destroy());
      if (!scope.active) style.el.remove();
      else sync(true);
    }));
    if (f.styleToolbar) {
      styleArgs = [styleToolbarApi(bar, pal, order), {
        i18n: core.i18n,
        // a process on the canvas: its look, or delete (resized by its edges)
        kinds: { activation: { groups: [['presets'], ['border', 'fill'], ['paint', 'delete']] } },
      }];
      const w = globalThis as typeof globalThis & { requestIdleCallback?: (f: () => void) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(() => void ensureStyleBar());
    }

    // ---- the page's own action bar and its badge
    // the page is the render's bounds (render/page.ts): placed from the view, never measured (reading the page's box
    // forced a layout of the whole picture on every pan and zoom step)
    const pageRect = (): Rect | null => {
      const b = core.result.result.bounds;
      return b.w ? core.rectOnScreen(b) : null;
    };
    let page: PageToolbarHandle | null = null;
    let pageLoading: Promise<void> | null = null;
    // the page toolbar code loads the first time the page is selected (its badge): most sessions never open it
    const ensurePageBar = (): Promise<void> => (pageLoading ??= import('../../../ui/diagram/page-toolbar.js').then(({ createPageToolbar }) => {
      if (!pageApi || page) return;
      page = createPageToolbar(wrap, pageApi, { i18n: core.i18n });
      scope.onDispose(() => page?.destroy());
      if (!scope.active) page.el.remove();
      else page.refresh();
    }));
    let pageApi: PageToolbarApi | null = null;
    if (f.pageToolbar) pageApi = pageToolbarApi(bar, pal, () => page?.refresh(), pageRect);

    const badge = h('button', { type: 'button', class: 'page-badge edit-only', hidden: true, 'aria-pressed': 'false' });
    if (f.pageToolbar) wrap.append(badge);
    badge.addEventListener('click', () => {
      core.select([]);
      core.selectPage(true);
      core.drawOverlay();
      core.fire('panels');
      sync(true);
      void ensurePageBar();
    }, sig);
    badge.addEventListener('pointerdown', (ev) => ev.stopPropagation(), sig);
    let badgeH = 0;
    const placeBadge = (): void => {
      const type = core.model.type;
      const r = pageRect();
      badge.hidden = !type || !r?.w || core.mode.peek() !== 'edit';
      if (badge.hidden || !r || !type) return;
      const label = t(`type.${type}`);
      badge.textContent = label;
      badge.title = t('page.badgeTip', { type: label });
      const on = core.pageSelected.peek() && !core.selection().length;
      badge.setAttribute('aria-pressed', String(on));
      badgeH ||= badge.offsetHeight; // measured once: its height does not change
      badge.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y - (badgeH || 22) - 6)}px)`;
    };

    // ---- keep both bars in step: rebuilt when what they show changes, else only re-placed
    let tbKey = '';
    let pageKey = '';
    /** A sync skipped while an item was dragged: done when the gesture ends (its overlay is drawn then). */
    let afterDrag = false;
    const sync = (force = false): void => {
      placeBadge();
      // the bars are hidden while an item is dragged (`.ed.dragging`): placing them on every move only forces layouts
      if (core.dragging && !force) {
        afterDrag = true;
        return;
      }
      afterDrag = false;
      if (page) {
        const { gap: _g, rowH: _r, ...shown } = core.meta.canvas; // slider values change while dragging: leave them out
        const key = `${core.pageSelected.peek()}|${core.mode.peek()}|${core.selection().length}|${core.model.type}|${withEdit(core.model, (k, m) => k.direction?.(m)) ?? ''}|${withEdit(core.model, (k, m) => k.numbered?.(m)) ?? ''}|${JSON.stringify(shown)}`;
        if (force || key !== pageKey) {
          pageKey = key;
          page.refresh();
        } else page.place();
      }
      if (!style) {
        if (styleArgs && core.selection().length) void ensureStyleBar();
        return;
      }
      const te = core.textEdit;
      const text = core.inlineEditing ? `|text:${te ? `${te.partial()}${JSON.stringify(te.formats())}` : ''}` : '';
      const key = core.mode.peek() === 'edit' ? selKey(core.inlineEditing ? [core.inlineEditing] : core.selection()) + `|${core.tool.peek()}${text}` : '';
      if (order.active) {
        style.place();
        return;
      }
      if (force || key !== tbKey) {
        tbKey = key;
        style.refresh();
      } else style.place();
    };
    // after a committed change the values shown may differ: rebuild unless a popover (slider) is in use
    // the toolbars are created after install (on first use): detached while the module is suspended (History, where
    // their popovers would edit the document), back and placed again when it resumes
    scope.register({
      set: (on) => {
        for (const bar of [style, page]) {
          if (!bar) continue;
          if (on) {
            if (!bar.el.parentNode) wrap.append(bar.el);
          } else {
            bar.close();
            bar.el.remove();
          }
        }
        if (on) sync(true);
      },
      dispose: () => undefined,
    });
    const afterCommit = (): void => {
      if (order.active) return;
      if (style && !style.isOpen()) {
        tbKey = '';
      }
      if (page && !page.isOpen()) pageKey = '';
      sync();
    };
    scope.on('draw', () => sync());
    scope.on('selection', () => sync());
    scope.on('mode', () => sync(true));
    scope.on('tool', () => sync());
    scope.on('panels', afterCommit);
    scope.on('overlay', () => {
      if (afterDrag && !core.dragging) sync();
    });
    scope.on('view', () => {
      placeBadge();
      style?.place();
      page?.place();
    });
    scope.provide('refreshToolbar', () => sync(true));
    sync(true);

    return () => {
      destroyed = true;
      live.flush();
      ac.abort();
      badge.remove();
    };
  },
};
