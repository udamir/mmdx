// diffBar (component architecture §8.1): the diff bar at the bottom centre — the views (Before, Merged, After, Side
// by side) as a Segmented with its compact select, the change filters as icon toggles with their counts, Dim, and at
// the end the Changes toggle with the number of changes. Hidden in History mode (one version as it is). Keys: 1–4
// pick a view, ← → step between Before, Merged and After, J / K step through the changes. Replaces `drawBar` and
// the view keys of elements/diff.ts.
import { createIconButton } from '../../ui/blocks/button.js';
import { createFilterToggles, FILTER_ICONS, FILTER_TOGGLES_CSS } from '../../ui/blocks/filter-toggles.js';
import { keepFocus } from '../../ui/blocks/focus.js';
import { createSegmented, SEGMENTED_CSS, type SegmentedOption } from '../../ui/blocks/segmented.js';
import { createToolbar, TOOLBAR_CSS, type ToolbarItem } from '../../ui/blocks/toolbar.js';
import { h } from '../../ui/h.js';
import { I_list } from '../../ui/icons.js';
import type { Shortcut } from '../../ui/shortcuts.js';
import { untracked } from '../../ui/signal.js';
import type { ViewCore } from '../../view/core.js';
import type { ViewModule } from '../../view/module.js';
import { DIFF_FILTERS, DIFF_VIEWS, type DiffSession, type DiffViewName } from '../session.js';
import { VIEW_ICONS } from '../view-icons.js';

const VIEW_KEYS: Record<DiffViewName, string> = { before: '1', merged: '2', after: '3', side: '4' };

export const DIFF_BAR_CSS = /* css */ `
.dbar { position: absolute; left: calc(var(--inset-l, 0px) + (100% - var(--inset-l, 0px) - var(--inset-r, 0px)) / 2); bottom: 12px; transform: translateX(-50%); z-index: 36;
  white-space: nowrap; max-width: calc(100% - var(--inset-l, 0px) - var(--inset-r, 0px) - 24px); gap: 2px; padding: 3px;
  background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: var(--mmdx-radius); box-shadow: var(--mmdx-shadow); }
/* no panel on the right: the zoom bar sits in the canvas corner, the diff bar keeps clear of it */
.dbar.right-closed { left: calc(var(--inset-l, 0px) + (100% - var(--inset-l, 0px)) / 2 - 90px); max-width: calc(100% - var(--inset-l, 0px) - 220px); }
.dbar button { position: relative; border: 0; background: transparent; padding: 4px 7px; border-radius: 5px; min-width: 36px; min-height: 36px;
  display: inline-flex; align-items: center; justify-content: center; color: var(--mmdx-text); }
.dbar button:hover:not(:disabled) { background: var(--mmdx-float-2); }
.dbar button.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.dbar button.view { padding: 4px 6px; }
.dbar .mmdx-icon { width: 20px; height: 20px; }
.dbar .mmdx-toolbar .mmdx-sep, .dbar .mmdx-sep { height: 24px; }
.dbar .dx-view-icon { width: 24px; height: 24px; }
.dbar .dx-fb { fill: var(--mmdx-diff-del); fill-opacity: .42; }
.dbar .dx-fa { fill: var(--mmdx-diff-add); fill-opacity: .42; }
.dbar button.view:disabled .dx-fb, .dbar button.view:disabled .dx-fa { fill-opacity: .15; }
.dbar select.views { border: 0; background: transparent; padding: 4px 6px; }
.dbar .changes-btn .cnt { position: absolute; right: -3px; bottom: -2px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px;
  background: var(--mmdx-muted); color: var(--mmdx-surface); font-size: 9px; font-weight: 700; line-height: 14px; text-align: center; }
.dbar .changes-btn.on .cnt { background: var(--mmdx-accent); }
/* a narrow canvas (the room between the open panels): the views become a select */
.dbar.narrow button.view { display: none; }
.dbar.narrow .mmdx-seg-select { display: block; }
@media print { .dbar { display: none !important; } }
`;

export function diffBarModule(session: DiffSession): ViewModule<ViewCore> {
  return {
    id: 'diff-bar',
    css: [TOOLBAR_CSS, SEGMENTED_CSS, FILTER_TOGGLES_CSS, DIFF_BAR_CSS],
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const parts: { destroy(): void }[] = [];

      // ---- views
      const noMerged = scope.computed(() => {
        const D = session.rendered();
        return !!D && !D.merged;
      });
      // icon buttons; the name and the help are in the tooltip, the name is the accessible name
      const viewOptions = (): SegmentedOption<DiffViewName>[] =>
        DIFF_VIEWS.map((v) => ({
          value: v, label: t(`diff.view.${v}`), icon: VIEW_ICONS[v], disabled: v === 'merged' && noMerged.peek(),
          tip: `${t(`diff.view.${v}`)} (${VIEW_KEYS[v]}) — ${t(`diff.view.${v}Help`)}`,
        }));
      const views = core.feature('views')
        ? createSegmented<DiffViewName>({ label: t('diff.views'), options: viewOptions(), value: session.view, onChange: (v) => session.setView(v), select: true, buttonClass: 'view', selectClass: 'views', f: 'view' })
        : null;
      if (views) {
        parts.push(views);
        scope.effect(() => {
          noMerged();
          untracked(() => keepFocus(views.el, () => views.update({ options: viewOptions() })));
        });
      }

      // ---- filters and dim
      /** No filters shown: the separator next to the empty group goes too. */
      const syncFilterSep = (): void => {
        if (!filters) return;
        const next = filters.el.nextElementSibling, prev = filters.el.previousElementSibling;
        const sep = next?.classList.contains('mmdx-sep') ? next : prev?.classList.contains('mmdx-sep') ? prev : null;
        if (sep instanceof HTMLElement) sep.hidden = !filters.el.childElementCount;
      };
      const filters = core.feature('filters')
        ? createFilterToggles({ filters: [], dim: null, onToggle: (id) => session.toggleFilter(id as (typeof DIFF_FILTERS)[number]), onDim: () => session.setDim(!session.dim.peek()), t })
        : null;
      if (filters) {
        parts.push(filters);
        scope.effect(() => {
          const raw = session.rendered()?.raw.counts;
          const hide = session.hide(), ignore = session.ignore(), dim = session.dim();
          // only the kinds of change this comparison has (counts of the unfiltered diff: a filter turned off stays);
          // Dim only when something changed
          const shown = DIFF_FILTERS.filter((f) => (raw?.[f] ?? 0) > 0);
          untracked(() => {
            filters.update({
              filters: shown.map((f) => ({ id: f, label: t(`diff.filter.${f}`), icon: FILTER_ICONS[f], on: f === 'added' || f === 'removed' ? !hide[f] : !ignore[f], count: raw?.[f] ?? 0 })),
              dim: shown.length ? { on: dim, label: t('diff.filter.dim'), icon: FILTER_ICONS.dim } : null,
            });
            syncFilterSep();
          });
        });
      }

      // ---- the change list toggle, at the right end of the bar
      const toggleChanges = (): void => void core.run('setPanel', 'changes', !core.panels.peek()['changes']);
      const changes = core.feature('changes')
        ? createIconButton({ icon: I_list, label: t('diff.tool.changes'), keys: 'l', tooltip: 'tip', class: 'changes-btn', f: 'changes', pressed: scope.computed(() => !!core.panels()['changes']), onClick: toggleChanges })
        : null;
      if (changes) {
        parts.push(changes);
        const cnt = h('span', { class: 'cnt', 'aria-hidden': 'true' });
        changes.el.append(cnt);
        scope.effect(() => {
          const D = session.rendered();
          cnt.textContent = D ? String(D.changes.length) : '';
          cnt.hidden = !D;
        });
      }

      const items: ToolbarItem[] = [];
      for (const el of [views?.el, filters?.el, changes?.el]) if (el) items.push(...(items.length ? ['sep' as const] : []), el);
      const bar = createToolbar({ label: t('diff.views'), orientation: 'horizontal', items, tooltip: 'above', class: 'dbar', part: 'diff-bar' });
      scope.slot('bottom-center').append(bar.el);
      syncFilterSep();
      scope.effect(() => {
        bar.el.hidden = !items.length || session.viewOnly();
        const p = core.panels();
        bar.el.classList.toggle('right-closed', !Object.entries(p).some(([id, on]) => on && core.panelItems.peek().some((x) => x.id === id && x.side === 'right')));
      });
      // the views fold into a select when the canvas between the open panels is narrow
      const NEEDS = 440;
      const syncNarrow = (): void => {
        const st = getComputedStyle(core.root);
        const free = core.area.clientWidth - (parseFloat(st.getPropertyValue('--inset-l')) || 0) - (parseFloat(st.getPropertyValue('--inset-r')) || 0);
        // with no panel on the right the bar also keeps clear of the zoom bar's corner
        const room = free - (bar.el.classList.contains('right-closed') ? 220 : 24);
        bar.el.classList.toggle('narrow', !!core.area.clientWidth && room < NEEDS);
      };
      // the free width does not depend on pan / zoom; the ResizeObserver covers resizes. Through the scope, so a closed
      // History leaves nothing on the core behind (B9)
      scope.on('panels', syncNarrow);
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(syncNarrow);
        ro.observe(core.area);
        scope.onDispose(() => ro.disconnect());
      }
      syncNarrow();

      // ---- keys
      const g = t('diff.help.views');
      const keys: Shortcut[] = [
        ...DIFF_VIEWS.map((v): Shortcut => ({ id: `view-${v}`, keys: [VIEW_KEYS[v]], label: `${t(`diff.view.${v}`)}: ${t(`diff.view.${v}Help`)}`, group: g, run: () => (core.feature('views') ? session.setView(v) : false) })),
        { id: 'step', keys: ['arrowleft', 'arrowright'], label: t('diff.view.step'), group: g, run: (ev) => session.stepView(ev.key === 'ArrowLeft' ? -1 : 1) },
        { id: 'next', keys: ['j', 'k'], label: t('diff.help.step'), group: t('diff.help.panels'), run: (ev) => (ev.key.toLowerCase() === 'k' ? session.prev() : session.next()) },
      ];
      if (filters)
        keys.push({ id: 'filters', keys: ['Added · Removed · Content · Layout · Style'], label: `${t('diff.filter.addedHelp')}; ${t('diff.filter.removedHelp')}; ${t('diff.filter.contentHelp')}; ${t('diff.filter.layoutHelp')}; ${t('diff.filter.styleHelp')}`, group: t('diff.help.filters'), hintOnly: true });
      scope.shortcut(...keys);

      return () => {
        for (const p of parts) p.destroy();
        bar.destroy();
      };
    },
  };
}
