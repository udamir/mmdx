// The diff's side panels (component architecture §8.1), each a SidePanel in a panel stack with its toggle in the tool
// dock (or the diff bar) and its key: `versions` — the version list with the Compare / History tabs (left, V);
// `codeDiff` — the code and metadata diff narrowed to the selected change, or the viewed version's listing in
// History mode (left, C); `changeList` — the changes of the shown pair (right, L; not in History mode). Replace the
// panel half of elements/diff.ts (`renderHistory`, `renderCode`, `renderChanges`, `applyPanels`) and the DOM
// builders of elements/diff/panels.ts.
import { changeKey } from '../../core/diff/merge.js';
import { diffLines } from '../../core/diff/text.js';
import { createChangeList, CHANGE_LIST_CSS } from '../../ui/blocks/change-list.js';
import { createCodeView, CODE_VIEW_CSS, type CodeSelection } from '../../ui/blocks/code-view.js';
import { createSidePanel } from '../../ui/blocks/side-panel.js';
import { createTabs } from '../../ui/blocks/tabs.js';
import { dockButton } from '../../ui/blocks/tool-dock.js';
import type { MenuEntry } from '../../ui/blocks/menu.js';
import { MENU_CSS } from '../../ui/blocks/menu.js';
import { createVersionList, VERSION_LIST_CSS } from '../../ui/blocks/version-list.js';
import { h } from '../../ui/kit/h.js';
import { I_code } from '../../ui/kit/icons.js';
import { signal, untracked, type ReadSignal, type Signal } from '../../reactive/signal.js';
import type { ViewCore } from '../../view/core.js';
import type { ModuleScope, ViewModule } from '../../view/module.js';
import { metaLines, relatedLines } from '../lines.js';
import { sourceLines, type DiffMode, type DiffSession } from '../session.js';
import { I_HISTORY } from '../../view/icons.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_DIFF } from '../../ui/messages/blocks-diff.js';

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
 * What the version panel does in History in place (src/diff/history.ts): the tab is the panel's own (switching it
 * shows nothing new), the rows mark what is shown (nothing until a version is picked), and a row or a pick goes to the
 * host, which decides what to show.
 */
export interface VersionControls {
  tab: Signal<DiffMode>;
  base: ReadSignal<string | null>;
  head: ReadSignal<string | null>;
  viewing: ReadSignal<string | null>;
  /** A row of the History tab (view it) or of the Compare tab (compare it). */
  row(id: string): void;
  /** A Before / After pick of the Compare tab. */
  pick(side: 'before' | 'after', id: string): void;
  swap(): void;
  /** "Compare with the previous version" of a row's menu. */
  comparePrevious(id: string): void;
}

/**
 * `dockButton: false` when the host's History button already stands for the panel (History in place, which passes its
 * `controls`). Each row of both tabs has a "⋮" menu: the host's `rowActions` (History's Restore), then Compare with the
 * previous version.
 */
export function versionsModule(session: DiffSession, o: { dockButton?: boolean; rowActions?: (id: string) => readonly MenuEntry[]; controls?: VersionControls } = {}): ViewModule<ViewCore> {
  return {
    id: 'versions',
    after: ['panel-stacks'],
    css: [VERSION_LIST_CSS, MENU_CSS, DIFF_PANELS_CSS],
    enabled: (core) => core.feature('history'),
    install(scope) {
      registerMessages(BLOCK_MESSAGES_DIFF); // the panels' names are the blocks' (one table)
      const core = scope.core;
      const t = core.i18n.t;
      const { open, toggle } = toggleOf(scope, 'history');
      const c = o.controls;
      const tabs = createTabs<DiffMode>({
        label: t('diff.panel.history'),
        tabs: [{ value: 'history', label: t('diff.panel.history') }, { value: 'compare', label: t('diff.panel.compare') }],
        value: c ? c.tab : session.mode, onChange: (m) => (c ? c.tab.set(m) : session.setMode(m)),
      });
      const loadMore = (): void => {
        session.loadMore().catch((e: unknown) => core.toast(`${t('diff.history.failed')}: ${e instanceof Error ? e.message : String(e)}`, { error: true }));
      };
      const list = createVersionList({
        versions: [], counts: (id) => session.counts(id), mode: c?.tab ?? session.mode, base: c?.base ?? session.base, head: c?.head ?? session.head, viewing: c?.viewing ?? session.viewing,
        locale: core.i18n.locale, hasMore: false,
        onPick: (side, id) => (c ? c.pick(side, id) : session.setPair(side === 'before' ? id : session.base.peek(), side === 'after' ? id : session.head.peek())),
        onRow: (id) => (c ? c.row(id) : session.mode.peek() === 'compare' ? session.compareWithPrevious(id) : session.viewVersion(id)),
        onMore: loadMore, t,
        // Compare as a timeline: the pair is a range on it; After's or Before's own dot swaps them
        timeline: { onSwap: () => (c ? c.swap() : session.setPair(session.head.peek(), session.base.peek())) },
        // on both tabs' rows: in Compare, next to the Before / After picks
        menu: {
          popovers: core.popovers, within: () => core.root,
          entries: (id, i) => [
            ...(o.rowActions?.(id) ?? []),
            {
              label: t('diff.history.comparePrev'), disabled: i === session.versions.peek().length - 1 && !session.hasMore.peek(),
              run: () => {
                if (c) return c.comparePrevious(id);
                session.setMode('compare');
                void session.compareWithPrevious(id);
              },
            },
          ],
        },
      });
      const panel = createSidePanel({
        side: 'left', head: tabs.el, label: t('diff.panel.history'), class: 'history', part: 'panel history',
        closeLabel: t('diff.panel.hide'), closeKeys: 'v', onClose: () => void core.run('setPanel', 'history', false), body: list.el,
      });
      // under the code panels, in every product and stage
      scope.contribute(core.panelItems, { id: 'history', side: 'left', order: 30, el: panel.el, visible: () => session.hasHistory() });
      if (o.dockButton !== false) {
        const btn = dockButton({
          icon: I_HISTORY, label: t('diff.tool.history'), keys: 'v', class: 'vt-panel vt-history', f: 'panel-history',
          pressed: scope.computed(open), hidden: scope.computed(() => !session.hasHistory()), onClick: toggle,
        });
        scope.contribute(core.dockItems, { id: 'versions', section: 'panels', order: 10, el: btn.el });
        scope.onDispose(() => btn.destroy());
      }
      // in place, V is the host's (the editor's pointer tool) except over a comparison
      scope.shortcut({ id: 'history', keys: ['v'], label: t('diff.help.history'), group: t('diff.help.panels'), ...(c ? { when: { stage: ['history'] } } : {}), run: () => (session.hasHistory.peek() ? toggle() : false) });
      // the rows follow the versions while the panel shows (the pair, the tab and the viewed version are signals the
      // list follows itself); a count that arrives patches only its row's badges
      scope.effect(() => {
        if (!open() || !session.hasHistory()) return;
        const props = { versions: session.versions(), hasMore: session.hasMore() };
        untracked(() => list.update(props));
      });
      scope.effect(() => {
        session.countsRev();
        if (open()) untracked(() => list.refreshCounts());
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
      registerMessages(BLOCK_MESSAGES_DIFF); // the panels' names are the blocks' (one table)
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
      scope.contribute(core.panelItems, { id: 'code', side: 'left', order: 10, el: panel.el });
      const btn = dockButton({ icon: I_code, label: t('diff.tool.code'), keys: 'c', class: 'vt-panel vt-code', f: 'panel-code', pressed: scope.computed(open), onClick: toggle });
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
          view.update({ mode: 'diff', a, b, ops: diffLines(a, b), sel, notes, language, onShowAll: () => all.set(true) });
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

export function changeListModule(session: DiffSession): ViewModule<ViewCore> {
  return {
    id: 'changes',
    after: ['panel-stacks'],
    css: [CHANGE_LIST_CSS],
    enabled: (core) => core.feature('changes'),
    install(scope) {
      registerMessages(BLOCK_MESSAGES_DIFF); // the panels' names are the blocks' (one table)
      const core = scope.core;
      const t = core.i18n.t;
      const { open, toggle } = toggleOf(scope, 'changes');
      const list = createChangeList({ doc: [], changes: [], keyOf: changeKey, selected: session.selected, colorBefore: () => undefined, colorAfter: () => undefined, onSelect: (key) => session.select(key), t, part: 'change-list' });
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
        untracked(() => list.update({ doc: D.diff.doc, changes: D.changes, colorBefore: (v) => D.before.rctx.color(v), colorAfter: (v) => D.after.rctx.color(v) }));
      });
      return () => {
        list.destroy();
        panel.destroy();
      };
    },
  };
}
