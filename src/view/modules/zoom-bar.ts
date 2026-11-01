// zoomBar (component architecture §7.4): the zoom bar bottom right (− % + Fit), the `?` help popup generated from the
// keymap of the active modules, and full screen of the component's host — the browser's, else the host page's
// (`core.hostFullscreen`, for sandboxed iframes). Provides `fitView` and `toggleHelp`; keys + − 0 / F (fit), arrows
// (pan in View mode), ? and Esc (help).
import { createZoomBar, ZOOM_BAR_CSS } from '../../ui/blocks/zoom-bar.js';
import { signal, untracked } from '../../ui/signal.js';
import type { ViewCore } from '../core.js';
import type { HostFullscreen } from '../types.js';
import type { ViewModule } from '../module.js';

const canFullscreen = (host: HTMLElement): boolean =>
  typeof document !== 'undefined' && !!document.fullscreenEnabled && typeof host.requestFullscreen === 'function';

/** Asks the host, never throwing (a host handler that throws counts as unavailable). */
const hostAvailable = (f: HostFullscreen | null): f is HostFullscreen => {
  try {
    return !!f?.available();
  } catch {
    return false;
  }
};

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

    // ---- full screen: the component's host element; the host page's when the browser's is unavailable
    let refit: ReturnType<typeof setTimeout> | undefined;
    const fsActive = signal(typeof document !== 'undefined' && document.fullscreenElement === host);
    /** The host page shows the component full screen (through `core.hostFullscreen`). */
    let viaHost = false;
    const changed = (on: boolean): void => {
      fsActive.set(on);
      core.emit('mmdx-fullscreen', { active: on });
      // after the layout settled
      clearTimeout(refit);
      refit = setTimeout(() => {
        if (canvas.viewport?.auto !== false) fit();
        core.fire('view');
      }, 50);
    };
    const setViaHost = (on: boolean): void => {
      if (on === viaHost) return;
      viaHost = on;
      host.toggleAttribute('data-fullscreen', on);
      changed(on);
    };
    // a host that left full screen by itself (its own close button) says so through `active()`
    const syncHost = (): void => {
      const f = core.hostFullscreen.peek();
      if (viaHost && f?.active && !f.active()) setViaHost(false);
    };
    const toggleFullscreen = (): void => {
      syncHost();
      const native = document.fullscreenElement === host;
      if (!core.emit('mmdx-fullscreen-request', { enter: !(native || viaHost) }, true)) return;
      if (native) {
        void document.exitFullscreen?.();
        return;
      }
      const f = core.hostFullscreen.peek();
      const failed = (): void => {
        if (!gone) core.toast(t('fullscreen.failed'), { error: true });
      };
      if (viaHost || (!canFullscreen(host) && hostAvailable(f))) {
        if (!f) return setViaHost(false);
        const enter = !viaHost;
        // called within the click: the host may need the user's activation
        let p: Promise<void>;
        try {
          p = Promise.resolve(enter ? f.enter() : f.exit());
        } catch (e) {
          p = Promise.reject(e);
        }
        p.then(() => {
          if (!gone) setViaHost(enter);
        }, failed);
      } else if (canFullscreen(host)) host.requestFullscreen().catch(failed);
      else failed();
    };
    scope.listen(host, 'fullscreenchange', () => changed(document.fullscreenElement === host));
    if (typeof window !== 'undefined') scope.listen(window, 'resize', syncHost);
    const fullscreenProps = (): NonNullable<Parameters<typeof createZoomBar>[0]['fullscreen']> | null =>
      core.feature('fullscreen') ? { active: fsActive, available: canFullscreen(host) || hostAvailable(core.hostFullscreen.peek()), onToggle: toggleFullscreen } : null;

    const bar = createZoomBar({
      view: canvas.view,
      onZoom: (f) => canvas.zoomBy(f),
      onFit: fit,
      help: core.feature('help') ? { onToggle: () => toggleHelp(), open: helpOpen } : null,
      fullscreen: fullscreenProps(),
      compact: core.compact,
      t,
    });
    scope.slot('bottom-right').append(bar.el);
    // a host handler set or replaced later shows or hides the button
    let fsHandler = core.hostFullscreen.peek();
    scope.effect(() => {
      const f = core.hostFullscreen();
      if (f === fsHandler) return;
      fsHandler = f;
      untracked(() => {
        if (viaHost && !f) setViaHost(false);
        bar.update({ fullscreen: fullscreenProps() });
      });
    });

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
      host.removeAttribute('data-fullscreen');
      if (helpOpen.peek()) core.popovers.close();
      closeHelp?.();
      bar.destroy();
    };
  },
};
