// History (diff design §15): when the host gives the editor a `history` (a HistoryAdapter or a list of versions), the
// tool dock shows a History button (shown while the host gives a history and <mmdx-diff> is defined). It covers the editor with <mmdx-diff> over the document's versions and the
// working copy; Restore opens a version in the editor as an undoable change (Edit mode), Back or Esc closes it.
// <mmdx-diff> comes from the page (`mmdx/diff`); the small view module loads on first use.
import type { EditorModule } from '../../module.js';
import type { HistoryView } from '../../../elements/history-view.js';
import { dockButton } from '../../../ui/blocks/tool-dock.js';
import { computed, signal } from '../../../ui/signal.js';

const I_HISTORY = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

export const historyModule: EditorModule = {
  id: 'history',
  enabled: ({ features: f }) => f.history,
  install(scope) {
    const core = scope.core;
    let view: HistoryView | null = null;
    let opening = false;
    const close = (): void => view?.close();
    const open = async (): Promise<void> => {
      const history = core.history.peek();
      if (!history || view || opening || typeof customElements === 'undefined' || !customElements.get('mmdx-diff')) return;
      opening = true;
      try {
        const { openHistoryView } = await import('../../../elements/history-view.js');
        core.popovers.close();
        view = openHistoryView({
          container: core.dom.root,
          history,
          current: core.store.source(),
          t: core.i18n.t,
          name: core.fileName,
          ui: core.scheme.peek(),
          storage: core.storage,
          ...(core.mode.peek() === 'edit'
            ? {
                onRestore: (source: string, v: { id: string }) => {
                  core.store.load(source, { history: 'push', reason: 'remote', markSaved: false });
                  core.draw();
                  core.viewport.setBounds(core.result.result.bounds, { fit: true });
                  core.fire('model');
                  core.fire('panels');
                  core.toast(core.i18n.t('history.restored', { id: v.id }));
                },
              }
            : {}),
          onClose: () => {
            view = null;
            core.historyOpen.set(false);
          },
        });
        core.historyOpen.set(true);
      } catch (e) {
        core.toast(e instanceof Error ? e.message : String(e), { error: true });
      } finally {
        opening = false;
      }
    };
    const offAction = core.provide('toggleHistory', (on) => {
      if (on ?? !view) void open();
      else close();
    });
    // History shows <mmdx-diff>, which the page loads (`mmdx/diff`); the editor bundle never contains it
    const diffReady = signal(typeof customElements !== 'undefined' && !!customElements.get('mmdx-diff'));
    if (!diffReady.peek() && typeof customElements !== 'undefined') void customElements.whenDefined('mmdx-diff').then(() => diffReady.set(true));
    const t = core.i18n.t;
    const btn = dockButton({
      icon: I_HISTORY, label: t('tools.versions'), class: 'vt-history', f: 'history', pressed: core.historyOpen,
      hidden: computed(() => !core.history() || !diffReady()), onClick: () => core.run('toggleHistory'),
    });
    scope.contribute(core.dockItems, { id: 'history', section: 'panels', order: 40, el: btn.el });
    core.shortcuts.add({ id: 'history', keys: ['shift+h'], label: t('help.history'), group: t('help.tools'), run: () => (core.history.peek() && !btn.el.hidden ? core.run('toggleHistory') : false) });
    // the history went away or a new document was loaded under it
    const offModel = core.on('model', () => {
      if (view && !core.history.peek()) close();
    });
    return () => {
      offAction();
      offModel();
      close();
      btn.destroy();
    };
  },
};
