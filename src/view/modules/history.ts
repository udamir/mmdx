// history (component architecture §7.4, §8): the History button of the tool dock (⇧H) and `toggleHistory`, shown
// while the host gives the component a history (`core.history`). Opening shows the version panel in the host's own
// panels (what it shows changes only when a version is picked); the History code (src/diff/history.ts) is loaded on
// first use through the kernel's
// `loadHistory`, which the product passes (the kernel never imports the diff) — no `<mmdx-diff>` on the page needed.
import { dockButton } from '../../ui/blocks/tool-dock.js';
import type { ViewCore } from '../core.js';
import { I_HISTORY } from '../icons.js';
import type { ViewModule } from '../module.js';
import { HISTORY_STUB } from '../module-stubs.js';

export const historyModule: ViewModule<ViewCore> = {
  ...HISTORY_STUB,
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const load = core.loadHistory!;
    let ctl: { close(): void; compareNewest(): void } | null = null;
    /** The open in progress (the History chunk loading); replaced or cleared to cancel it. */
    let pending: { compare: boolean } | null = null;
    let disposed = false;
    const open = async (compare: boolean): Promise<void> => {
      if (ctl) {
        if (compare) ctl.compareNewest();
        return;
      }
      if (pending) {
        pending.compare ||= compare;
        return;
      }
      if (!core.history.peek()) return;
      const ticket = (pending = { compare });
      try {
        const m = await load();
        if (pending !== ticket || disposed || core.isDestroyed || !core.history.peek() || ctl) return;
        core.popovers.close();
        ctl = m.openHistory(core, { onClose: () => (ctl = null), compare: ticket.compare });
      } catch (e) {
        if (pending === ticket && !disposed) core.toast(e instanceof Error ? e.message : String(e), { error: true });
      } finally {
        if (pending === ticket) pending = null;
      }
    };
    scope.provide('toggleHistory', (on, opts) => {
      // while History shows a version or a comparison the toggle is the panel's: it hides and shows the panel, what is
      // shown stays (Back / Esc leave it); with nothing shown it closes History
      if (on === undefined && ctl && core.stage.peek() !== 'document') return void core.run('setPanel', 'history', !core.panels.peek()['history']);
      if (on === undefined && ctl && !core.panels.peek()['history']) return void core.run('setPanel', 'history', true);
      if (on ?? !(ctl || pending)) void open(!!opts?.compare);
      else {
        // closing while it still loads cancels the open
        pending = null;
        ctl?.close();
      }
    });
    const btn = dockButton({
      icon: I_HISTORY, label: t('tools.versions'), keys: 'shift+h', class: 'vt-history', f: 'history', pressed: scope.computed(() => core.historyOpen() && !!core.panels()['history']),
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
