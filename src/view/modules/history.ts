// history (component architecture §7.4, §8): the History button of the tool dock (⇧H) and `toggleHistory`, shown
// while the host gives the component a history (`core.history`). Opening enters the `history` stage in the host's own
// canvas and panels (src/diff/history.ts, loaded on first use — no `<mmdx-diff>` on the page needed).
import { dockButton } from '../../ui/blocks/tool-dock.js';
import { computed } from '../../ui/signal.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';

const I_HISTORY = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

export const historyModule: ViewModule<ViewCore> = {
  id: 'history',
  enabled: (core) => core.feature('history'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    let ctl: { close(): void } | null = null;
    let opening = false;
    const open = async (): Promise<void> => {
      if (ctl || opening || !core.history.peek()) return;
      opening = true;
      try {
        const m = await import('../../diff/history.js');
        if (core.isDestroyed || !core.history.peek() || ctl) return;
        core.popovers.close();
        ctl = m.openHistory(core, { onClose: () => (ctl = null) });
      } catch (e) {
        core.toast(e instanceof Error ? e.message : String(e), { error: true });
      } finally {
        opening = false;
      }
    };
    core.provide('toggleHistory', (on) => {
      if (on ?? !ctl) void open();
      else ctl?.close();
    });
    const btn = dockButton({
      icon: I_HISTORY, label: t('tools.versions'), keys: 'shift+h', class: 'vt-history', f: 'history', pressed: core.historyOpen,
      hidden: computed(() => !core.history()), onClick: () => core.run('toggleHistory'),
    });
    scope.contribute(core.dockItems, { id: 'history', section: 'panels', order: 40, el: btn.el });
    scope.shortcut({ id: 'history', keys: ['shift+h'], label: t('help.history'), group: t('help.tools'), run: () => (core.history.peek() ? void core.run('toggleHistory') : false) });
    return () => {
      ctl?.close();
      btn.destroy();
    };
  },
};
