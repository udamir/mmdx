// The viewer's own modules: its export formats (SVG, PNG, the source as .mmdx) for the view-params Export menu, and
// the History button (`controls="history"`), which shows the diagram's versions over the viewer.
import type { ViewCore } from '../view/core.js';
import type { ViewModule } from '../view/module.js';
import { dockButton } from '../ui/blocks/tool-dock.js';
import { computed, signal } from '../ui/signal.js';
import type { DiagramViewer } from './viewer.js';

const I_HISTORY = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

export function viewerExportModule(viewer: DiagramViewer): ViewModule<ViewCore> {
  return {
    id: 'viewer-export',
    enabled: (core) => core.feature('export'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const download = async (file: string, data: string | Blob, type?: string): Promise<void> => (await import('../dom/export.js')).download(file, data, type);
      const name = (): string => viewer.fileName;
      scope.contribute(core.exportFormats, { id: 'svg', label: t('export.svg'), section: 'image', run: () => download(`${name()}.svg`, viewer.toSvg(), 'image/svg+xml') });
      scope.contribute(core.exportFormats, { id: 'png', label: t('export.png'), section: 'image', run: async () => download(`${name()}.png`, await viewer.toPng()) });
      scope.contribute(core.exportFormats, { id: 'mmdx', label: t('export.mmdx'), section: 'source', run: () => download(`${name()}.mmdx`, viewer.sourceText ?? '') });
    },
  };
}

/** History shows <mmdx-diff>, which the page loads (`mmdx/diff`); the viewer bundle never contains it. */
const hasDiff = (): boolean => typeof customElements !== 'undefined' && !!customElements.get('mmdx-diff');

export function viewerHistoryModule(viewer: DiagramViewer): ViewModule<ViewCore> {
  return {
    id: 'history',
    enabled: (core) => core.feature('history'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const open = signal(false);
      const ready = signal(hasDiff());
      if (!ready.peek() && typeof customElements !== 'undefined') void customElements.whenDefined('mmdx-diff').then(() => ready.set(true));
      let view: { close(): void } | null = null;
      const toggle = (on = !view): void => {
        if (!on) {
          view?.close();
          return;
        }
        const history = viewer.options.history;
        if (view || !history || !hasDiff()) return;
        void import('./history-view.js').then((m) => {
          if (core.isDestroyed || view) return;
          view = m.openHistoryView({
            container: core.root, history, current: viewer.sourceText ?? '', t, ui: core.scheme.peek(), storage: core.storage, grow: true,
            onClose: () => {
              view = null;
              open.set(false);
            },
          });
          open.set(true);
        });
      };
      core.provide('toggleHistory', toggle);
      const btn = dockButton({ icon: I_HISTORY, label: t('history.open'), class: 'vt-history', f: 'history', pressed: open, hidden: computed(() => !ready()), onClick: () => toggle() });
      scope.contribute(core.dockItems, { id: 'history', section: 'panels', order: 40, el: btn.el });
      return () => {
        view?.close();
        btn.destroy();
      };
    },
  };
}
