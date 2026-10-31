// history (component architecture §7.4, §8): the History button of the tool dock (⇧H) and `toggleHistory`, shown
// while the host gives the component a history (`core.history`). Opening enters the `history` stage in the host's own
// canvas and panels; the History code (src/diff/history.ts) is loaded on first use through the kernel's
// `loadHistory`, which the product passes (the kernel never imports the diff) — no `<mmdx-diff>` on the page needed.
import { dockButton } from '../../ui/blocks/tool-dock.js';
import type { ViewCore } from '../core.js';
import type { HistoryLoader } from '../history.js';
import type { ViewModule } from '../module.js';

const I_HISTORY = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

// TODO(editor): drop once EditorCore passes `loadHistory` (the viewer does); until then this keeps the view layer
// importing the diff for the editor's History.
const fallback: HistoryLoader = () => import('../../diff/history.js');

export const historyModule: ViewModule<ViewCore> = {
  id: 'history',
  enabled: (core) => core.feature('history'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const load = core.loadHistory ?? fallback;
    let ctl: { close(): void } | null = null;
    /** The open in progress (the History chunk loading); replaced or cleared to cancel it. */
    let pending: object | null = null;
    let disposed = false;
    const open = async (): Promise<void> => {
      if (ctl || pending || !core.history.peek()) return;
      const ticket = (pending = {});
      try {
        const m = await load();
        if (pending !== ticket || disposed || core.isDestroyed || !core.history.peek() || ctl) return;
        core.popovers.close();
        ctl = m.openHistory(core, { onClose: () => (ctl = null) });
      } catch (e) {
        if (pending === ticket && !disposed) core.toast(e instanceof Error ? e.message : String(e), { error: true });
      } finally {
        if (pending === ticket) pending = null;
      }
    };
    scope.provide('toggleHistory', (on) => {
      if (on ?? !(ctl || pending)) void open();
      else {
        // closing while it still loads cancels the open
        pending = null;
        ctl?.close();
      }
    });
    const btn = dockButton({
      icon: I_HISTORY, label: t('tools.versions'), keys: 'shift+h', class: 'vt-history', f: 'history', pressed: core.historyOpen,
      hidden: scope.computed(() => !core.history()), onClick: () => core.run('toggleHistory'),
    });
    scope.contribute(core.dockItems, { id: 'history', section: 'panels', order: 40, el: btn.el });
    scope.shortcut({ id: 'history', keys: ['shift+h'], label: t('help.history'), group: t('help.tools'), run: () => (core.history.peek() ? void core.run('toggleHistory') : false) });
    return () => {
      disposed = true;
      pending = null;
      ctl?.close();
      btn.destroy();
    };
  },
};
