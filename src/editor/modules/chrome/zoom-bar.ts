// Zoom bar (A.2 rows 17, 19, 20; index.html `.bottom-bar`): − % + Fit, the ? help popup generated from the shortcut
// registry (edit-only rows hidden in View mode; Esc / outside click closes) and full screen (hidden when the browser
// cannot, toast when it fails). Provides `fitView` and `toggleHelp`; shortcut `?`.
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import { formatKeys, type Shortcut } from '../../../ui/shortcuts.js';
import type { EditorModule } from '../../module.js';

export const ZOOM_BAR_CSS = /* css */ `
.bottom-bar { position: absolute; right: 12px; bottom: 12px; z-index: 38; display: flex; align-items: center; gap: 8px; pointer-events: none; }
.bottom-bar > * { pointer-events: auto; }
.zoom { display: flex; gap: 4px; align-items: center; background: var(--float); border: 1px solid var(--float-line); border-radius: 8px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.zoom output { min-width: 44px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.zoom button { padding: 2px 8px; background: transparent; border-color: transparent; }
.zoom button:hover:not(:disabled) { background: var(--float-2); border-color: transparent; }
.zoom .help-btn { font-weight: 600; min-width: 26px; }
.zoom .help-btn[aria-expanded=true], .zoom .fs-btn.on { color: var(--accent); }
.zoom .fs-btn { display: grid; place-items: center; padding: 3px 6px; }
.zoom .fs-btn[hidden] { display: none; }
.help-pop.ds-pop { right: 12px; bottom: 60px; width: 380px; max-width: calc(100% - 24px); max-height: min(560px, calc(100% - 120px)); display: flex; flex-direction: column;
  background: var(--float); border: 1px solid var(--float-line); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.18); color: var(--ink); font-size: 12.5px; padding: 0; }
.help-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 6px 14px; }
.help-head b { font-size: 13px; }
.help-head button { border: 0; background: none; font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 6px; color: var(--muted); }
.help-head button:hover { background: var(--float-2); color: var(--ink); }
.help-body { overflow: auto; padding: 0 14px 12px; }
.help-title { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 10px 0 4px; }
.help-row { display: grid; grid-template-columns: minmax(0, 160px) minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 4px 0; line-height: 1.45; }
.help-row + .help-row { border-top: 1px solid var(--float-line); }
.help-keys { color: var(--muted); font-size: 11px; min-width: 0; overflow-wrap: anywhere; }
.help-keys kbd { font: 11px/1 var(--ds-mono); color: var(--ink); background: var(--float-2); border: 1px solid var(--float-line); border-radius: 5px; padding: 2px 5px; white-space: nowrap; }
.help-gesture { color: var(--ink-2); font-size: 11.5px; }
.help-row > span:last-child { min-width: 0; overflow-wrap: anywhere; }
`;

/** One row of the help: keys as key caps (alternatives joined by ·), gestures as plain text. */
function keysOf(s: Shortcut): HTMLElement {
  const k = h('span', { class: 'help-keys' });
  if (s.hintOnly && s.keys.every((x) => x.length > 12 || /\s/.test(x))) {
    k.append(h('span', { class: 'help-gesture' }, s.keys.join(' · ')));
    return k;
  }
  s.keys.forEach((key, i) => {
    if (i) k.append(' · ');
    k.append(/\s/.test(key) && key.length > 12 ? h('span', { class: 'help-gesture' }, key) : h('kbd', null, formatKeys(key)));
  });
  return k;
}

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
