// zoomBar (component architecture §7.4): the zoom bar bottom right (− % + Fit), the `?` help popup generated from the
// keymap of the active modules, and full screen of the component's host. Provides `fitView` and `toggleHelp`; keys
// + − 0 / F (fit), arrows (pan in View mode), ? and Esc (help).
import { createZoomBar, ZOOM_BAR_CSS } from '../../ui/blocks/zoom-bar.js';
import { signal } from '../../ui/signal.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';

const canFullscreen = (host: HTMLElement): boolean =>
  typeof document !== 'undefined' && !!document.fullscreenEnabled && typeof host.requestFullscreen === 'function';

export const zoomBarModule: ViewModule<ViewCore> = {
  id: 'zoom-bar',
  css: [ZOOM_BAR_CSS],
  enabled: (core) => core.feature('zoom'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const host = core.host;
    const canvas = core.canvas;

    const fit = (): void => {
      const b = core.contentBounds();
      if (b) canvas.fit(b);
      else canvas.fit();
    };
    scope.provide('fitView', fit);

    // ---- help popup (loads on first use)
    const helpOpen = signal(false);
    let gone = false;
    let closeHelp: (() => void) | null = null;
    let opening = false;
    const toggleHelp = (on?: boolean): void => {
      const open = helpOpen.peek();
      if (on === undefined ? open : !on) {
        if (open) core.popovers.close(true);
        return;
      }
      if (open || opening || !bar.helpButton) return;
      opening = true;
      import('../../ui/blocks/help-popup.js').then((m) => {
        opening = false;
        if (gone || !scope.active || helpOpen.peek()) return;
        core.addCss([m.HELP_POPUP_CSS]);
        showHelp(m);
      }, (e: unknown) => {
        opening = false;
        if (!gone) core.toast(e instanceof Error ? e.message : String(e), { error: true });
      });
    };
    const showHelp = ({ createHelpPopup, groupShortcuts }: typeof import('../../ui/blocks/help-popup.js')): void => {
      if (!bar.helpButton) return;
      const popup = createHelpPopup({
        title: t('help.title'),
        groups: groupShortcuts(core.shortcuts.list({ mode: core.mode.peek(), stage: core.stage.peek() })),
        onClose: () => core.popovers.close(true),
        t,
      });
      helpOpen.set(true);
      closeHelp = () => popup.destroy();
      core.popovers.open(popup.el, bar.helpButton, {
        onClose: () => {
          helpOpen.set(false);
          closeHelp = null;
          popup.destroy();
        },
      });
    };
    if (core.feature('help')) scope.provide('toggleHelp', toggleHelp);

    // ---- full screen: the component's host element
    let refit: ReturnType<typeof setTimeout> | undefined;
    const fsActive = signal(typeof document !== 'undefined' && document.fullscreenElement === host);
    const toggleFullscreen = (): void => {
      if (document.fullscreenElement === host) void document.exitFullscreen?.();
      else host.requestFullscreen?.().catch(() => core.toast(t('fullscreen.failed'), { error: true }));
    };
    scope.listen(host, 'fullscreenchange', () => {
      const on = document.fullscreenElement === host;
      fsActive.set(on);
      core.emit('mmdx-fullscreen', { active: on });
      // after the layout settled
      clearTimeout(refit);
      refit = setTimeout(() => {
        if (canvas.viewport?.auto !== false) fit();
        core.fire('view');
      }, 50);
    });

    const bar = createZoomBar({
      view: canvas.view,
      onZoom: (f) => canvas.zoomBy(f),
      onFit: fit,
      help: core.feature('help') ? { onToggle: () => toggleHelp(), open: helpOpen } : null,
      fullscreen: core.feature('fullscreen') ? { active: fsActive, available: canFullscreen(host), onToggle: toggleFullscreen } : null,
      compact: core.compact,
      t,
    });
    scope.slot('bottom-right').append(bar.el);

    // ---- keys (one table for every product, §13)
    const zoom = (f: number): boolean => {
      if (!canvas.viewport) return false;
      canvas.zoomBy(f);
      return true;
    };
    const pan = (dx: number, dy: number): boolean => {
      if (!canvas.viewport) return false;
      canvas.viewport.panBy(dx, dy);
      return true;
    };
    const group = t('help.view');
    scope.shortcut(
      { id: 'zoom-in', keys: ['+', '='], label: t('zoom.in'), group, run: () => zoom(1.2) },
      { id: 'zoom-out', keys: ['-'], label: t('zoom.out'), group, run: () => zoom(1 / 1.2) },
      { id: 'fit', keys: ['f', '0'], label: t('zoom.fit'), group, run: () => void fit() },
      { id: 'pan-left', keys: ['arrowleft'], label: t('help.pan'), group, when: { mode: ['view'] }, hintOnly: false, run: () => pan(40, 0) },
      { id: 'pan-right', keys: ['arrowright'], label: t('help.pan'), group, when: { mode: ['view'] }, run: () => pan(-40, 0) },
      { id: 'pan-up', keys: ['arrowup'], label: t('help.pan'), group, when: { mode: ['view'] }, run: () => pan(0, 40) },
      { id: 'pan-down', keys: ['arrowdown'], label: t('help.pan'), group, when: { mode: ['view'] }, run: () => pan(0, -40) },
    );
    if (core.feature('help'))
      scope.shortcut(
        { id: 'help', keys: ['?'], label: t('help.toggle'), group, run: () => toggleHelp() },
        { id: 'help-close', keys: ['escape'], label: t('help.escClose'), group, run: () => (helpOpen.peek() ? (toggleHelp(false), true) : false) },
      );
    // a double click on the empty canvas fits (the viewer's gesture)
    scope.canvas('dblclick', (ev) => {
      if (core.mode.peek() !== 'view' || (ev.target as Element).closest?.('[data-kind]')) return;
      fit();
    });

    return () => {
      gone = true;
      clearTimeout(refit);
      if (helpOpen.peek()) core.popovers.close();
      closeHelp?.();
      bar.destroy();
    };
  },
};
