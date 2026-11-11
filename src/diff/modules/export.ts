// diffExport and hostActions (component architecture §8.1, §8.4). diffExport contributes the diff's formats to the
// kernel's `Export` menu: an image of the view (PNG, SVG), the sources (Before / After .mmdx, or the viewed
// version in History mode; Portable Mermaid), the patch and the reports (Markdown, JSON). hostActions shows the
// host's buttons (`DiffAction`, e.g. History's Restore and Back) at the end of the view params, top right. Replace
// `openExport` and `renderActions` of elements/diff.ts.
import { keepFocus } from '../../ui/kit/focus.js';
import { h } from '../../ui/kit/h.js';
import { untracked, type ReadSignal } from '../../reactive/signal.js';
import type { ViewCore } from '../../view/core.js';
import type { ViewModule } from '../../view/module.js';
import type { ExportFormat } from '../../view/types.js';
import type { DiffSession } from '../session.js';
import type { DiffExportKind, DiffExportOptions, DiffPair } from '../../view/history.js';

/** A button the host adds to the diff. */
export interface DiffAction {
  id: string;
  label: string;
  title?: string;
  primary?: boolean;
  /** Enabled for the shown versions (default: always). */
  enabled?: (pair: DiffPair) => boolean;
  run: () => void;
}

export function diffExportModule(session: DiffSession): ViewModule<ViewCore> {
  return {
    id: 'diff-export',
    enabled: (core) => core.feature('export'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const run = (kind: DiffExportKind, o?: DiffExportOptions) => (): Promise<void> => session.exportAs(kind, o);
      const formats = scope.computed((): ExportFormat[] => {
        const version = session.viewOnly();
        return [
          { id: 'png', label: t('diff.export.image'), section: 'image', run: run('png') },
          { id: 'svg', label: t('diff.export.svg'), section: 'image', run: run('svg') },
          ...(version
            ? [{ id: 'mmdx-version', label: t('diff.export.version'), section: 'source', run: run('mmdx', { version: 'viewed' }) }]
            : [
              { id: 'mmdx-before', label: t('diff.export.before'), section: 'source', run: run('mmdx', { version: 'before' }) },
              { id: 'mmdx-after', label: t('diff.export.after'), section: 'source', run: run('mmdx', { version: 'after' }) },
            ]),
          { id: 'mmd', label: t('diff.export.portable'), section: 'source', run: run('mmd') },
          ...(version
            ? []
            : [
              { id: 'patch', label: t('diff.export.patch'), section: 'report', run: run('diff') },
              { id: 'md', label: t('diff.export.markdown'), section: 'report', run: run('md') },
              { id: 'json', label: t('diff.export.json'), section: 'report', run: run('json') },
            ]),
        ];
      });
      // the entries change with History mode: this module's own entries are replaced, the others' stay
      const mine = scope.contributeAll(core.exportFormats);
      scope.effect(() => {
        const list = formats();
        untracked(() => mine.set(list));
      });
    },
  };
}

export const HOST_ACTIONS_CSS = /* css */ `
.host-actions { display: contents; }
.view-params .host-actions button { height: 32px; padding: 0 12px; border-radius: 8px; white-space: nowrap; }
`;

export function hostActionsModule(session: DiffSession, actions: ReadSignal<readonly DiffAction[]>): ViewModule<ViewCore> {
  return {
    id: 'host-actions',
    css: [HOST_ACTIONS_CSS],
    enabled: () => actions.peek().length > 0,
    install(scope) {
      const core = scope.core;
      const box = h('span', { class: 'host-actions', role: 'group' });
      scope.contribute(core.paramItems, { id: 'host-actions', section: 'tools', order: 90, el: box });
      let ac = new AbortController();
      scope.effect(() => {
        const list = actions();
        // enabled for the shown versions
        session.base();
        session.head();
        session.viewing();
        session.viewOnly();
        untracked(() => keepFocus(box, () => {
          ac.abort();
          ac = new AbortController();
          const pair = session.pair;
          box.replaceChildren(h('span', { class: 'vp-sep', 'aria-hidden': 'true' }), ...list.map((a) => {
            const b = h('button', {
              type: 'button', class: a.primary ? 'primary' : '', title: a.title ?? a.label, 'data-f': `act-${a.id}`, 'data-action': a.id,
              disabled: a.enabled ? !a.enabled(pair) : false,
            }, a.label);
            b.addEventListener('click', () => a.run(), { signal: ac.signal });
            return b;
          }));
        }));
      });
      return () => {
        ac.abort();
        box.remove();
      };
    },
  };
}
