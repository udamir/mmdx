// Zoom bar (A.2 rows 17, 19, 20; index.html `.bottom-bar`): − % + Fit, the ? help popup generated from the shortcut
// registry (edit-only rows hidden in View mode; Esc / outside click closes) and full screen (hidden when the browser
// cannot, toast when it fails). Provides `fitView` and `toggleHelp`; shortcut `?`.
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import { formatKeys, type Shortcut } from '../../../ui/shortcuts.js';
import { helpKeys as keysOf, ZOOM_BAR_CSS } from '../../../ui/zoom-bar.js';
import type { EditorModule } from '../../module.js';

export { ZOOM_BAR_CSS };

export const zoomBarModule: EditorModule = {
  id: 'zoom-bar',
  css: ZOOM_BAR_CSS,
  install(core) {
    const t = core.i18n.t;
    const f = core.features;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const cleanups: (() => void)[] = [];
    const host = core.dom.shadow.host as HTMLElement;

    const fitView = (): void => core.viewport.setBounds(core.result.result.bounds, { fit: true });
    const zoom = (factor: number): void => {
      const s = core.viewport.size;
      core.viewport.zoomAt(factor, s.w / 2, s.h / 2);
    };
    const out = h('button', { type: 'button', title: t('zoom.out'), 'aria-label': t('zoom.out') }, '−');
    const label = h('output', { 'aria-live': 'off', 'aria-label': t('zoom.level') }, '100%');
    const inn = h('button', { type: 'button', title: t('zoom.in'), 'aria-label': t('zoom.in') }, '+');
    const fit = h('button', { type: 'button', title: `${t('zoom.fit')} (${formatKeys('f')})`, 'aria-keyshortcuts': 'f' }, t('zoom.fitShort'));
    const help = f.help ? h('button', { type: 'button', class: 'help-btn', title: `${t('help.button')} (?)`, 'aria-label': t('help.button'), 'aria-keyshortcuts': '?', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, '?') : null;
    const canFs = f.fullscreen && typeof document !== 'undefined' && !!document.fullscreenEnabled && typeof host.requestFullscreen === 'function';
    const fs = f.fullscreen ? h('button', { type: 'button', class: 'fs-btn', hidden: !canFs }) : null;
    const bar = h('div', { class: 'bottom-bar' }, h('div', { class: 'zoom', role: 'toolbar', 'aria-label': t('zoom.bar'), part: 'zoom-bar' }, out, label, inn, fit, help, fs));
    core.dom.wrap.append(bar);
    out.addEventListener('click', () => zoom(1 / 1.2), sig);
    inn.addEventListener('click', () => zoom(1.2), sig);
    fit.addEventListener('click', fitView, sig);
    const syncZoom = (): void => {
      label.textContent = `${Math.round(core.viewport.state.k * 100)}%`;
    };
    cleanups.push(core.on('view', syncZoom), core.on('draw', syncZoom));
    syncZoom();
    cleanups.push(core.provide('fitView', fitView));

    // ---- help popup
    let helpEl: HTMLElement | null = null;
    const renderHelp = (): HTMLElement => {
      const editing = core.mode.peek() === 'edit';
      const groups = new Map<string, Shortcut[]>();
      for (const s of core.shortcuts.list(editing)) (groups.get(s.group) ?? groups.set(s.group, []).get(s.group)!).push(s);
      const close = h('button', { type: 'button', title: t('help.close'), 'aria-label': t('help.close') }, '×');
      close.addEventListener('click', () => core.popovers.close(true));
      const body = h('div', { class: 'help-body' });
      for (const [title, rows] of groups) {
        body.append(h('div', { class: 'help-title', role: 'heading', 'aria-level': '3' }, title));
        for (const s of rows) body.append(h('div', { class: 'help-row' }, keysOf(s), h('span', null, s.label)));
      }
      const titleId = `help-${Math.random().toString(36).slice(2, 8)}`;
      return h('div', { class: 'help-pop', role: 'dialog', 'aria-labelledby': titleId }, h('div', { class: 'help-head' }, h('b', { id: titleId }, t('help.title')), close), body);
    };
    const toggleHelp = (on?: boolean): void => {
      if (!help) return;
      const open = !!helpEl;
      if (on === undefined ? open : !on) {
        if (open) core.popovers.close(true);
        return;
      }
      if (open) return;
      const el = renderHelp();
      helpEl = el;
      core.popovers.open(el, help, { onClose: () => { helpEl = null; } });
    };
    help?.addEventListener('click', () => toggleHelp(), sig);
    cleanups.push(core.provide('toggleHelp', toggleHelp));
    if (help)
      core.shortcuts.add(
        { id: 'help', keys: ['?'], label: t('help.toggle'), group: t('help.view'), run: () => toggleHelp() },
        { id: 'help-close', keys: ['escape'], label: t('help.escClose'), group: t('help.view'), hintOnly: false, run: () => (helpEl ? (toggleHelp(false), true) : false) },
      );

    // ---- full screen: the editor element itself
    const syncFs = (): void => {
      if (!fs) return;
      const on = typeof document !== 'undefined' && document.fullscreenElement === host;
      fs.replaceChildren(icon(on ? ICONS.shrink : ICONS.expand, 16));
      const lbl = on ? t('fullscreen.exit') : t('fullscreen.enter');
      fs.title = lbl;
      fs.setAttribute('aria-label', lbl);
      fs.setAttribute('aria-pressed', String(on));
      fs.classList.toggle('on', on);
    };
    fs?.addEventListener('click', () => {
      if (document.fullscreenElement === host) void document.exitFullscreen?.();
      else
        host.requestFullscreen?.().catch(() => {
          core.toast(t('fullscreen.failed'), { error: true });
        });
    }, sig);
    host.addEventListener('fullscreenchange', () => {
      syncFs();
      setTimeout(() => core.fire('view'), 50);
    }, sig);
    syncFs();

    return () => {
      if (helpEl) core.popovers.close();
      ac.abort();
      for (const c of cleanups) c();
      bar.remove();
    };
  },
};
