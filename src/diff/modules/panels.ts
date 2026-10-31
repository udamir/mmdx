// The diff's side panels (component architecture §8.1), each a SidePanel in a panel stack with its toggle in the tool
// dock (or the diff bar) and its key: `versions` — the version list with the Compare / History tabs (left, V);
// `codeDiff` — the code and metadata diff narrowed to the selected change, or the viewed version's listing in
// History mode (left, C); `changeList` — the changes of the shown pair (right, L; not in History mode). Replace the
// panel half of elements/diff.ts (`renderHistory`, `renderCode`, `renderChanges`, `applyPanels`) and the DOM
// builders of elements/diff/panels.ts.
import type { DiagramDiff as DiffResult } from '../../core/diff/index.js';
import { createChangeList, CHANGE_LIST_CSS } from '../../ui/blocks/change-list.js';
import { createCodeView, CODE_VIEW_CSS, type CodeSelection } from '../../ui/blocks/code-view.js';
import { createSidePanel } from '../../ui/blocks/side-panel.js';
import { createTabs } from '../../ui/blocks/tabs.js';
import { dockButton } from '../../ui/blocks/tool-dock.js';
import type { MenuEntry } from '../../ui/blocks/menu.js';
import { MENU_CSS } from '../../ui/blocks/menu.js';
import { createVersionList, VERSION_LIST_CSS } from '../../ui/blocks/version-list.js';
import { h } from '../../ui/h.js';
import { I_code } from '../../ui/icons.js';
import { computed, signal, untracked } from '../../ui/signal.js';
import type { ViewCore } from '../../view/core.js';
import type { ModuleScope, ViewModule } from '../../view/module.js';
import { metaLines, relatedLines } from '../lines.js';
import { sourceLines, type DiffMode, type DiffSession } from '../session.js';

export const I_HISTORY = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

export const DIFF_PANELS_CSS = /* css */ `
.code-diff { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
`;


/** The open state of a panel, its toggle (`setPanel`) and its key. */
function toggleOf(scope: ModuleScope<ViewCore>, id: string): { open: () => boolean; toggle: () => void } {
  const core = scope.core;
  return {
    open: () => !!core.panels()[id],
    toggle: () => void core.run('setPanel', id, !core.panels.peek()[id]),
  };
}

/**
 * `dockButton: false` when the host's History button already stands for the panel (History in place). Each row has a
 * "⋯" menu: the host's `rowActions` (History's Restore), then Compare with the previous version.
 */
export function versionsModule(session: DiffSession, o: { dockButton?: boolean; rowActions?: (id: string) => readonly MenuEntry[] } = {}): ViewModule<ViewCore> {
  return {
    id: 'versions',
    after: ['panel-stacks'],
    css: [VERSION_LIST_CSS, MENU_CSS, DIFF_PANELS_CSS],
    enabled: (core) => core.feature('history'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const { open, toggle } = toggleOf(scope, 'history');
      const tabs = createTabs<DiffMode>({
        label: t('diff.panel.history'),
        tabs: [{ value: 'history', label: t('diff.panel.history') }, { value: 'compare', label: t('diff.panel.compare') }],
        value: session.mode, onChange: (m) => session.setMode(m),
      });
      const loadMore = (): void => {
        session.loadMore().catch((e: unknown) => core.toast(`${t('diff.history.failed')}: ${e instanceof Error ? e.message : String(e)}`, { error: true }));
      };
      const list = createVersionList({
        versions: [], counts: (id) => session.counts(id), mode: session.mode.peek(), base: null, head: null, viewing: null, locale: core.i18n.locale, hasMore: false,
        onPick: (side, id) => session.setPair(side === 'before' ? id : session.base.peek(), side === 'after' ? id : session.head.peek()),
        onRow: (id) => (session.mode.peek() === 'compare' ? session.compareWithPrevious(id) : session.viewVersion(id)),
        onMore: loadMore, t,
        menu: {
          popovers: core.popovers, within: () => core.root,
          entries: (id, i) => [
            ...(o.rowActions?.(id) ?? []),
            {
              label: t('diff.history.comparePrev'), disabled: i === session.versions.peek().length - 1 && !session.hasMore.peek(),
              run: () => {
                session.setMode('compare');
                session.compareWithPrevious(id);
              },
            },
          ],
        },
      });
      const panel = createSidePanel({
        side: 'left', head: tabs.el, label: t('diff.panel.history'), class: 'history', part: 'panel history',
        closeLabel: t('diff.panel.hide'), closeKeys: 'v', onClose: () => void core.run('setPanel', 'history', false), body: list.el,
      });
      scope.contribute(core.panelItems, { id: 'history', side: 'left', order: 10, el: panel.el, visible: () => session.hasHistory() });
      if (o.dockButton !== false) {
        const btn = dockButton({
          icon: I_HISTORY, label: t('diff.tool.history'), keys: 'v', class: 'vt-panel vt-history', f: 'panel-history',
          pressed: computed(open), hidden: computed(() => !session.hasHistory()), onClick: toggle,
        });
        scope.contribute(core.dockItems, { id: 'versions', section: 'panels', order: 10, el: btn.el });
        scope.onDispose(() => btn.destroy());
      }
      scope.shortcut({ id: 'history', keys: ['v'], label: t('diff.help.history'), group: t('diff.help.panels'), run: () => (session.hasHistory.peek() ? toggle() : false) });
      // the rows follow the versions, the pair, the tab and the counts while the panel shows
      scope.effect(() => {
        if (!open() || !session.hasHistory()) return;
        session.countsRev();
        const props = {
          versions: session.versions(), mode: session.mode(), base: session.base(), head: session.head(), viewing: session.viewing(), hasMore: session.hasMore(),
        };
        untracked(() => list.update(props));
      });
      return () => {
        list.destroy();
        tabs.destroy();
        panel.destroy();
      };
    },
  };
}

export function codeDiffModule(session: DiffSession): ViewModule<ViewCore> {
  return {
    id: 'code-diff',
    after: ['panel-stacks'],
    css: [CODE_VIEW_CSS, DIFF_PANELS_CSS],
    enabled: (core) => core.feature('code'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const { open, toggle } = toggleOf(scope, 'code');
      const tab = signal<'code' | 'meta'>('code');
      /** "Show all": the whole file although a change is selected (until the next selection). */
      const all = signal(false);
      const tabs = createTabs<'code' | 'meta'>({
        label: t('diff.tool.code'),
        tabs: [{ value: 'code', label: t('diff.panel.code') }, { value: 'meta', label: t('diff.panel.meta') }],
        value: tab, onChange: (v) => tab.set(v),
      });
      const view = createCodeView({ mode: 'plain', lines: [], language: 'mermaid', label: t('diff.tool.code'), t, part: 'code' });
      const body = h('div', { class: 'code-diff' }, view.el);
      const panel = createSidePanel({
        side: 'left', head: tabs.el, label: t('diff.tool.code'), class: 'code', part: 'panel',
        closeLabel: t('diff.panel.hide'), closeKeys: 'c', onClose: () => void core.run('setPanel', 'code', false), body,
      });
      scope.contribute(core.panelItems, { id: 'code', side: 'left', order: 20, el: panel.el });
      const btn = dockButton({ icon: I_code, label: t('diff.tool.code'), keys: 'c', class: 'vt-panel vt-code', f: 'panel-code', pressed: computed(open), onClick: toggle });
      scope.contribute(core.dockItems, { id: 'code', section: 'panels', order: 20, el: btn.el });
      scope.shortcut({ id: 'code', keys: ['c'], label: t('diff.help.code'), group: t('diff.help.panels'), run: () => toggle() });

      scope.effect(() => {
        session.selected();
        all.set(false);
      });
      let seq = 0;
      scope.effect(() => {
        if (!open()) return;
        const which = tab(), language = which === 'code' ? 'mermaid' : 'meta';
        const n = ++seq;
        if (session.viewOnly()) {
          // History mode: the viewed version as it is
          const id = session.viewing();
          void session.sourceOf(id).then((src) => {
            if (n === seq) view.update({ mode: 'plain', lines: sourceLines(src, which), language });
          }, () => undefined);
          return;
        }
        const D = session.rendered();
        const key = session.selected(), whole = all(), ignore = session.ignore();
        untracked(() => {
          if (!D) {
            view.update({ mode: 'plain', lines: [], language });
            return;
          }
          const a = sourceLines(D.sources.before, which), b = sourceLines(D.sources.after, which);
          const ch = key && !whole ? session.change(key) : null;
          let sel: CodeSelection | null = null;
          if (ch) {
            const beforeId = ch.status === 'added' ? null : ch.beforeId ?? ch.id;
            const afterId = ch.status === 'removed' ? null : ch.id;
            sel = which === 'code'
              ? { a: beforeId === null ? new Set() : relatedLines(D.before.model, ch.kind, beforeId), b: afterId === null ? new Set() : relatedLines(D.after.model, ch.kind, afterId), label: ch.label }
              : { a: metaLines(a, ch.kind, beforeId), b: metaLines(b, ch.kind, afterId), label: ch.label };
          }
          const notes: string[] = [];
          if (ignore.style) notes.push(t('diff.panel.styleRemoved'));
          if (D.layoutAligned) notes.push(t('diff.panel.layoutReplaced'));
          view.update({ mode: 'diff', a, b, sel, notes, language, onShowAll: () => all.set(true) });
        });
      });
      return () => {
        btn.destroy();
        view.destroy();
        tabs.destroy();
        panel.destroy();
      };
    },
  };
}

const NO_DIFF: DiffResult = { type: null, typeChanged: false, items: [], doc: [], counts: { added: 0, removed: 0, changed: 0, content: 0, layout: 0, style: 0 } };

export function changeListModule(session: DiffSession): ViewModule<ViewCore> {
  return {
    id: 'changes',
    after: ['panel-stacks'],
    css: [CHANGE_LIST_CSS],
    enabled: (core) => core.feature('changes'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const { open, toggle } = toggleOf(scope, 'changes');
      const list = createChangeList({ diff: NO_DIFF, changes: [], selected: null, colorBefore: () => undefined, colorAfter: () => undefined, onSelect: (key) => session.select(key), t, part: 'change-list' });
      const panel = createSidePanel({
        side: 'right', title: t('diff.panel.changes'), label: t('diff.panel.changes'), class: 'changes', part: 'panel',
        closeLabel: t('diff.panel.hide'), closeKeys: 'l', onClose: () => void core.run('setPanel', 'changes', false), body: list.el,
      });
      scope.contribute(core.panelItems, { id: 'changes', side: 'right', order: 5, el: panel.el, visible: () => !session.viewOnly() });
      scope.shortcut({ id: 'changes', keys: ['l'], label: t('diff.help.changes'), group: t('diff.help.panels'), run: () => toggle() });
      // the rows follow the shown diff while the panel shows; the selection moves in place (the focus stays)
      scope.effect(() => {
        const D = session.rendered();
        list.el.hidden = !D;
        if (!D || !open()) return;
        untracked(() => list.update({ diff: D.diff, changes: D.changes, selected: session.selected.peek(), colorBefore: (v) => D.before.rctx.color(v), colorAfter: (v) => D.after.rctx.color(v) }));
      });
      scope.effect(() => {
        const key = session.selected();
        untracked(() => list.select(key));
      });
      return () => {
        list.destroy();
        panel.destroy();
      };
    },
  };
}
