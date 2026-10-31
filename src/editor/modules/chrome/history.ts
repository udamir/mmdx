// History (diff design §15): when the host gives the editor a `history` (a HistoryAdapter or a list of versions), the
// tool dock shows a History button. It covers the editor with <mmdx-diff> over the document's versions and the
// working copy; Restore opens a version in the editor as an undoable change (Edit mode), Back or Esc closes it.
// <mmdx-diff> comes from the page (`mmdx/diff`); the small view module loads on first use.
import type { EditorModule } from '../../module.js';
import type { HistoryView } from '../../../elements/history-view.js';

export const historyModule: EditorModule = {
  id: 'history',
  enabled: (f) => f.history,
  install(core) {
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
    // the history went away or a new document was loaded under it
    const offModel = core.on('model', () => {
      if (view && !core.history.peek()) close();
    });
    return () => {
      offAction();
      offModel();
      close();
    };
  },
};
