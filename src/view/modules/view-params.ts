// viewParams (component architecture §7.4, §7.5): the bar top right — the light / dark chrome toggle, the theme
// menu (Follow light / dark, then the themes grouped light / dark), the labelled `Export ▾` menu with the formats the
// modules contribute (`core.exportFormats`), then the controls other modules add (`core.paramItems`, e.g. the
// editor's ⋯ menu). The theme is the component's state: a pick never touches the document or the chrome scheme.
import { createExportMenu, EXPORT_MENU_CSS } from '../../ui/blocks/export-menu.js';
import { MENU_CSS } from '../../ui/blocks/menu.js';
import { createSchemeToggle, SCHEME_TOGGLE_CSS } from '../../ui/blocks/scheme-toggle.js';
import { createThemeButton, THEME_MENU_CSS } from '../../ui/blocks/theme-menu.js';
import { createToolbar, TOOLBAR_CSS } from '../../ui/blocks/toolbar.js';
import { h } from '../../ui/h.js';
import { computed, signal } from '../../ui/signal.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';

export const VIEW_PARAMS_CSS = /* css */ `
.mmdx-toolbar.view-params { position: absolute; top: 12px; right: 12px; z-index: 32; display: flex; align-items: center; gap: 4px; padding: 4px;
  background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 12px; box-shadow: 0 4px 16px rgba(20,30,60,.10), 0 1px 3px rgba(20,30,60,.06); }
.view-params .vp-sep { width: 1px; height: 22px; background: var(--mmdx-float-line); margin: 0 2px; }
.compact .view-params { top: 8px; right: 8px; padding: 3px; gap: 2px; }
.compact .view-params .vp-btn, .compact .view-params .vp-export-btn { height: 28px; }
`;

export const viewParamsModule: ViewModule<ViewCore> = {
  id: 'view-params',
  css: [TOOLBAR_CSS, VIEW_PARAMS_CSS, SCHEME_TOGGLE_CSS, THEME_MENU_CSS, EXPORT_MENU_CSS, MENU_CSS],
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const within = (): Element => core.root;
    const parts: { el: HTMLElement; destroy(): void }[] = [];

    const scheme = core.feature('scheme') ? createSchemeToggle({ scheme: core.scheme, onChange: (v) => core.chooseScheme(v), t }) : null;
    if (scheme) parts.push(scheme);

    // the theme menu lists the registered themes; the picks re-render through the kernel
    const themesRev = signal(0);
    scope.onDispose(core.ctx.themes.onChange(() => themesRev.update((n) => n + 1)));
    const theme = core.feature('theme')
      ? createThemeButton({
        themes: core.ctx.themes.list().map((x) => ({ id: x.id, name: x.name, appearance: x.appearance === 'dark' ? 'dark' : 'light' })),
        picked: computed(() => {
          themesRev();
          const p = core.themes.pick();
          return p ? p.id : null;
        }),
        shown: core.themes.current,
        onPick: (id) => core.themes.choose(id),
        onFollow: () => core.themes.follow(),
        popovers: core.popovers,
        within,
        t,
      })
      : null;
    if (theme) {
      parts.push(theme);
      scope.effect(() => {
        themesRev();
        theme.update({ themes: core.ctx.themes.list().map((x) => ({ id: x.id, name: x.name, appearance: x.appearance === 'dark' ? 'dark' : 'light' })) });
      });
    }

    const exp = core.feature('export')
      ? createExportMenu({
        entries: [],
        popovers: core.popovers,
        within,
        compact: core.compact,
        onError: (e) => core.toast(e instanceof Error ? e.message : String(e), { error: true }),
        t,
      })
      : null;
    if (exp) parts.push(exp);

    const more = h('span', { class: 'vp-more', style: 'display:contents' });
    const sep = (): HTMLElement => h('span', { class: 'vp-sep', 'aria-hidden': 'true' });
    const toolbar = createToolbar({ label: t('viewParams.title'), orientation: 'horizontal', items: [], class: 'view-params' });
    const bar = toolbar.el;
    scope.slot('top-right').append(bar);
    scope.effect(() => {
      const formats = core.exportFormats();
      const extra = [...core.paramItems()].sort((a, b) => a.order - b.order).map((i) => i.el);
      exp?.update({ entries: formats.map((f) => ({ id: f.id, label: f.label, ...(f.title ? { title: f.title } : {}), ...(f.section ? { section: f.section } : {}), run: f.run })) });
      more.replaceChildren(...extra);
      const items: HTMLElement[] = [];
      if (scheme) items.push(scheme.el);
      if (theme) items.push(...(items.length ? [sep()] : []), theme.el);
      if (exp && formats.length) items.push(...(items.length ? [sep()] : []), exp.el);
      if (extra.length) items.push(more);
      toolbar.setItems(items);
      bar.hidden = !items.length;
    });

    return () => {
      for (const p of parts) p.destroy();
      toolbar.destroy();
    };
  },
};
