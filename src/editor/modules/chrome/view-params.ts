// View parameters, top right (A.8 rows 72, 73, 81, 82, 83; index.html `#viewParams`; prototype app `setUi`,
// `syncThemeSelect`, `setDiagramTheme`): the light / dark UI toggle (`ds-ui` event, remembered as `ui`), the diagram
// theme menu 🎨 grouped light / dark with the current one ticked, the Export ▾ menu and a ⋯ menu with Open… and Auto
// layout. The diagram type is shown on the page's own badge; the theme editor and Plain Mermaid live in the host's
// shell (<mmdx-studio> top bar; `DiagramEditor.plainMermaid()`).
import { BASELINE } from '../../../core/theme/registry.js';
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';

export const VIEW_PARAMS_CSS = /* css */ `
.view-params { position: absolute; top: 12px; right: 12px; z-index: 32; display: flex; align-items: center; gap: 4px; padding: 4px;
  background: var(--float); border: 1px solid var(--float-line); border-radius: 12px; box-shadow: 0 4px 16px rgba(20,30,60,.10), 0 1px 3px rgba(20,30,60,.06); }
.vp-mode { display: flex; gap: 2px; background: var(--float-2); border-radius: 9px; padding: 2px; }
.vp-mode button { border: 0; background: none; width: 32px; height: 28px; padding: 0; display: grid; place-items: center; border-radius: 7px; color: var(--muted); }
.vp-mode button[aria-checked=true] { background: var(--float); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.vp-sep { width: 1px; height: 22px; background: var(--float-line); margin: 0 2px; }
.vp-btn { border: 0; background: none; height: 32px; padding: 0 6px 0 8px; display: flex; align-items: center; gap: 3px; border-radius: 8px; color: var(--ink); }
.vp-btn:hover:not(:disabled), .vp-btn[aria-expanded=true] { background: var(--float-2); }
.vp-caret { color: var(--muted); }
.vp-export-btn { height: 32px; padding: 0 12px; border-radius: 8px; }
.vp-menu.ds-pop { min-width: 210px; padding: 6px; background: var(--float); border: 1px solid var(--float-line); border-radius: 12px; box-shadow: 0 10px 30px rgba(20,30,60,.18); }
.vp-menu .ds-sect { padding: 6px 8px 3px; }
.vp-menu [role^=menuitem] { color: var(--ink); border-radius: 7px; padding: 6px 8px; }
.vp-menu [role^=menuitem]:hover:not(:disabled), .vp-menu [role^=menuitem]:focus-visible { background: var(--float-2); }
.vp-menu [aria-checked=true] { color: var(--accent); font-weight: 600; }
.vp-check { width: 14px; display: inline-block; flex: none; }
.vp-menu hr { border: 0; border-top: 1px solid var(--float-line); margin: 5px 2px; }
`;

interface MenuItem {
  label: string;
  title?: string;
  checked?: boolean;
  run: () => void;
}
type MenuEntry = MenuItem | { section: string } | 'sep';

/** Opens a menu (ARIA menu pattern, Esc / outside click closes) under `opener`, right-aligned with it. */
function openMenu(core: EditorCore, opener: HTMLElement, label: string, entries: readonly MenuEntry[]): void {
  const menu = h('div', { class: 'ds-menu vp-menu', role: 'menu', 'aria-label': label });
  const radio = entries.some((e) => typeof e === 'object' && 'checked' in e && e.checked !== undefined);
  for (const e of entries) {
    if (e === 'sep') menu.append(h('hr', { role: 'separator' }));
    else if ('section' in e) menu.append(h('div', { class: 'ds-sect', role: 'presentation' }, e.section));
    else {
      const item = h('button', { type: 'button', role: e.checked !== undefined ? 'menuitemradio' : 'menuitem', title: e.title ?? '', tabindex: '-1' },
        radio ? h('span', { class: 'vp-check', 'aria-hidden': 'true' }, e.checked ? '✓' : '') : null, h('span', null, e.label));
      if (e.checked !== undefined) item.setAttribute('aria-checked', String(e.checked));
      item.addEventListener('click', () => {
        core.popovers.close(true);
        e.run();
      });
      menu.append(item);
    }
  }
  const host = (core.dom.shadow.host as HTMLElement).getBoundingClientRect();
  const r = opener.getBoundingClientRect();
  menu.style.top = `${Math.round(r.bottom - host.top + 6)}px`;
  menu.style.right = `${Math.max(8, Math.round(host.right - r.right))}px`;
  core.popovers.open(menu, opener);
}

export const viewParamsModule: EditorModule = {
  id: 'view-params',
  css: VIEW_PARAMS_CSS,
  install(core) {
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const cleanups: (() => void)[] = [];
    const host = core.dom.shadow.host as HTMLElement;

    // ---- light / dark UI (the editor's own chrome; diagrams keep their theme)
    const scheme = (): string => host.getAttribute('data-ui') ?? 'light';
    const uiBtn = (v: 'light' | 'dark', path: string, label: string): HTMLButtonElement =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', title: label, 'aria-label': label, dataset: { ui: v } }, icon(path, 17));
    const light = uiBtn('light', ICONS.sun, t('ui.light'));
    const dark = uiBtn('dark', ICONS.moon, t('ui.dark'));
    const uiToggle = h('div', { class: 'vp-mode', role: 'radiogroup', 'aria-label': t('ui.appearance') }, light, dark);
    const syncUi = (): void => {
      for (const b of [light, dark]) b.setAttribute('aria-checked', String(b.dataset['ui'] === scheme()));
    };
    const setUi = (v: 'light' | 'dark', emit = true): void => {
      host.setAttribute('ui', v); // <mmdx-editor> applies it (DiagramEditor.setUi)
      host.setAttribute('data-ui', v); // and any other host
      core.storage.set('ui', v);
      // the diagram follows the UI (hosts that are not <mmdx-editor> do not get the attribute callback)
      if (core.scheme.peek() !== v) {
        core.scheme.set(v);
        core.draw();
        core.fire('theme');
      }
      syncUi();
      if (emit) core.emit('ds-ui', { ui: v });
    };
    for (const b of [light, dark]) b.addEventListener('click', () => setUi(b.dataset['ui'] === 'dark' ? 'dark' : 'light'), sig);
    const stored = core.storage.get<string>('ui');
    if ((stored === 'light' || stored === 'dark') && !host.hasAttribute('ui')) {
      host.setAttribute('data-ui', stored);
      host.setAttribute('ui', stored);
      // the diagram follows the remembered choice too (the host's attribute callback may not run during install)
      core.scheme.set(stored);
    }
    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(syncUi);
      mo.observe(host, { attributes: true, attributeFilter: ['data-ui'] });
      cleanups.push(() => mo.disconnect());
    }
    syncUi();

    // ---- diagram theme
    // the theme the diagram is shown in: its own, or that theme's counterpart for the light / dark UI
    const currentTheme = (): string => core.shownTheme();
    const setTheme = (id: string): void => {
      const ap = core.ctx.themes.get(id).appearance === 'dark' ? 'dark' : 'light';
      if (id !== core.documentTheme())
        core.change(t('history.theme'), () => {
          if (id === BASELINE) delete core.meta.canvas.theme;
          else core.meta.canvas.theme = id;
        });
      // a theme of the other appearance brings the UI along, so the chosen theme is the one shown
      if (ap !== scheme()) setUi(ap);
      core.draw();
      core.fire('theme');
    };
    cleanups.push(core.provide('setTheme', setTheme));
    let themeBtn: HTMLButtonElement | null = null;
    if (f.themePicker) {
      const btn = h('button', { type: 'button', class: 'vp-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon(ICONS.palette, 18), icon(ICONS.chevronDown, 12));
      btn.lastElementChild?.setAttribute('class', 'ds-icon vp-caret');
      themeBtn = btn;
      const syncThemeBtn = (): void => {
        const info = core.ctx.themes.list().find((x) => x.id === currentTheme());
        const label = t('theme.current', { name: info?.name ?? currentTheme() });
        btn.title = label;
        btn.setAttribute('aria-label', label);
      };
      cleanups.push(core.on('draw', syncThemeBtn));
      syncThemeBtn();
      btn.addEventListener('click', () => {
        const cur = currentTheme();
        const entries: MenuEntry[] = [];
        for (const [ap, label] of [['light', t('theme.light')], ['dark', t('theme.dark')]] as const) {
          const list = core.ctx.themes.list().filter((x) => x.appearance === ap);
          if (!list.length) continue;
          entries.push({ section: label });
          for (const th of list) entries.push({ label: th.name, checked: th.id === cur, run: () => setTheme(th.id) });
        }
        openMenu(core, btn, t('theme.menu'), entries);
      }, sig);
      // themes registered or changed later (theme editor, host registerTheme): redraw
      cleanups.push(core.ctx.themes.onChange(() => {
        core.draw();
        core.fire('theme');
        core.fire('panels');
      }));
    }

    // ---- export
    const LABELS: Record<string, [string, string]> = {
      mmdx: ['export.mmdx', 'export.mmdxTip'], mmd: ['export.mmd', 'export.mmdTip'], svg: ['export.svg', ''], png: ['export.png', 'export.pngTip'],
    };
    let exportBtn: HTMLButtonElement | null = null;
    if (f.export && f.exportFormats.length) {
      const btn = h('button', { type: 'button', class: 'primary vp-export-btn', title: t('export.tip'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, `${t('export.title')} ▾`);
      exportBtn = btn;
      btn.addEventListener('click', () => {
        const entries: MenuEntry[] = [];
        const item = (kind: (typeof f.exportFormats)[number]): MenuEntry => {
          const [k, tip] = LABELS[kind]!;
          return { label: t(k), title: tip ? t(tip) : '', run: () => void core.run('exportAs', kind) };
        };
        const text = f.exportFormats.filter((k) => k === 'mmdx' || k === 'mmd'), img = f.exportFormats.filter((k) => k === 'svg' || k === 'png');
        entries.push(...text.map(item));
        if (text.length && img.length) entries.push('sep');
        entries.push(...img.map(item));
        openMenu(core, btn, t('export.title'), entries);
      }, sig);
    }

    // ---- ⋯ more: open, auto layout
    let fileInput: HTMLInputElement | null = null;
    if (f.open) {
      fileInput = h('input', { type: 'file', accept: '.mmdx,.mmd,.md,.txt,.json', multiple: true, hidden: true });
      fileInput.addEventListener('change', () => {
        const files = fileInput?.files;
        if (files?.length) void core.run('openFiles', Array.from(files));
        if (fileInput) fileInput.value = '';
      }, sig);
    }
    const moreBtn = h('button', { type: 'button', class: 'vp-btn', title: t('more.title'), 'aria-label': t('more.title'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon(ICONS.more, 18));
    const moreEntries = (): MenuEntry[] => {
      const out: MenuEntry[] = [];
      const editing = core.mode.peek() === 'edit';
      if (f.open && editing && core.has('openFiles')) out.push({ label: t('more.open'), title: t('more.openTip'), run: () => fileInput?.click() });
      if (f.autoLayout && editing && core.has('autoLayout') && core.model.type) out.push({ label: t('more.autoLayout'), title: t('more.autoLayoutTip'), run: () => core.run('autoLayout') });
      return out;
    };
    moreBtn.addEventListener('click', () => openMenu(core, moreBtn, t('more.title'), moreEntries()), sig);
    const syncMore = (): void => {
      moreBtn.hidden = !moreEntries().length;
    };
    cleanups.push(core.on('mode', syncMore), core.on('model', syncMore), core.on('draw', syncMore));

    const sep = (): HTMLElement => h('span', { class: 'vp-sep', 'aria-hidden': 'true' });
    const bar = h('div', { class: 'view-params', role: 'toolbar', 'aria-label': t('viewParams.title') },
      uiToggle, themeBtn ? sep() : null, themeBtn, exportBtn ? sep() : null, exportBtn, moreBtn, fileInput);
    core.dom.wrap.append(bar);
    queueMicrotask(syncMore);

    return () => {
      ac.abort();
      for (const c of cleanups) c();
      bar.remove();
    };
  },
};
