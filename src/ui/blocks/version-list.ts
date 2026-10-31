// VersionList (§5.2): the version rows of a history (message, id, "current" tag, author, relative age, change
// counts against the version before as small coloured badges), with Before / After picks in compare mode (or a
// timeline whose range is the pair), the row action and "Load older versions". Arrow keys, Home and End move between the rows (to the same control: the row,
// Before or After); the focus is kept across `update()`. Replaces `historyRows` and `ago` of
// elements/diff/panels.ts (same DOM and classes). The pick colours come from the `--mmdx-diff-*` tokens: the host
// adopts `DIFF_TOKENS` (ui/styles/diff.ts).
import type { DiagramDiff } from '../../core/diff/index.js';
import type { VersionInfo } from '../../core/diff/report.js';
import { h, icon } from '../h.js';
import type { PopoverManager } from '../popover.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_DIFF } from '../messages/blocks-diff.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { focusedIn, keepFocus } from './focus.js';
import { openMenu, type MenuEntry } from './menu.js';

/** The row menu's "⋮" (three vertical dots). */
const I_DOTS = 'M12 5h.01M12 12h.01M12 19h.01';

/** Relative age of an ISO date (`3 days ago`), or '' without a valid date. */
export const ago = (iso: string | undefined, locale: string): string => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return '';
  const s = (Date.now() - ms) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 60) return rtf.format(-Math.round(s / 86400), 'day');
  return rtf.format(-Math.round(s / (86400 * 30)), 'month');
};

export type VersionCounts = DiagramDiff['counts'];

export interface VersionListProps {
  /** Newest first; the first one is tagged "current". */
  versions: readonly VersionInfo[];
  /** Change counts of each version against the one before it (undefined: not computed yet; null: the first). */
  counts: (id: string) => VersionCounts | null | undefined;
  /** `compare`: Before / After picks, the row compares with the previous version; `history`: the row views it. */
  mode: 'compare' | 'history';
  base: string | null;
  head: string | null;
  viewing: string | null;
  locale: string;
  hasMore: boolean;
  onPick: (side: 'before' | 'after', id: string) => void;
  onRow: (id: string) => void;
  onMore: () => void;
  /**
   * A "⋮" menu on each row with the version's actions (Restore, Compare…); `entries` is built when it opens; `modes`:
   * the tabs that show it (default both).
   */
  menu?: { entries: (id: string, index: number) => readonly MenuEntry[]; popovers: PopoverManager; within?: () => Element | undefined; modes?: readonly ('compare' | 'history')[] };
  /**
   * Compare mode as a timeline instead of the Before / After picks: a line down the rows with a dot per version, After
   * and Before as filled dots with their initials (A green, B red) and the line between them drawn as the range. A dot
   * moves the nearer end of the range to its version (`onPick`); After's or Before's own dot swaps them (`onSwap`).
   */
  timeline?: { onSwap: () => void };
  t: Translate;
  part?: string;
}

export const VERSION_LIST_CSS = /* css */ `
.mmdx-version-list .versions { display: flex; flex-direction: column; padding: 6px; gap: 2px; }
.mmdx-version-list .version { position: relative; display: flex; align-items: center; border-radius: 8px; }
.mmdx-version-list .version:hover { background: var(--mmdx-surface-2); }
.mmdx-version-list .version.viewing { background: var(--mmdx-accent-2); }
.mmdx-version-list .version.after { background: var(--mmdx-diff-add-bg); }
.mmdx-version-list .version.before { background: var(--mmdx-diff-del-bg); }
.mmdx-version-list .version-main { flex: 1; min-width: 0; display: grid; gap: 2px; text-align: left; border: 0; background: none; padding: 7px 8px 7px 12px; border-radius: 8px; color: var(--mmdx-text); }
.mmdx-version-list .version-main:hover:not(:disabled) { background: none; }
.mmdx-version-list .version-main:focus-visible { box-shadow: inset 0 0 0 2px var(--mmdx-accent); }
.mmdx-version-list .vmsg { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mmdx-version-list .vmeta { display: flex; align-items: baseline; gap: 8px; color: var(--mmdx-muted); font-size: 11.5px; white-space: nowrap; min-width: 0; }
.mmdx-version-list .vwho { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mmdx-version-list .vmeta > .vstats, .mmdx-version-list .vmeta > .vcount { margin-left: auto; flex: none; }
.mmdx-version-list .vid { font: 11px var(--mmdx-mono); color: var(--mmdx-text); }
.mmdx-version-list .vstats { display: inline-flex; gap: 3px; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 10.5px; }
.mmdx-version-list .vstats > span { border-radius: 4px; padding: 0 5px; line-height: 16px; }
.mmdx-version-list .vstats .add { color: var(--mmdx-diff-add); background: var(--mmdx-diff-add-bg); }
.mmdx-version-list .vstats .del { color: var(--mmdx-diff-del); background: var(--mmdx-diff-del-bg); }
.mmdx-version-list .vstats .chg { color: var(--mmdx-diff-content); background: var(--mmdx-diff-content-bg); }
.mmdx-version-list .vstats.skeleton { width: 54px; height: 10px; border-radius: 4px; background: var(--mmdx-surface-2); }
.mmdx-version-list .vtag { font-size: 10.5px; font-weight: 600; border-radius: 4px; padding: 0 5px; line-height: 16px; margin-left: 4px; background: var(--mmdx-surface-2); color: var(--mmdx-text); box-shadow: inset 0 0 0 1px var(--mmdx-border); }
.mmdx-version-list .vpick { display: flex; gap: 3px; padding-right: 8px; flex: none; }
.mmdx-version-list .pick { padding: 1px 6px; font-size: 11px; color: var(--mmdx-muted); }
.mmdx-version-list .pick-before.on { background: var(--mmdx-diff-del-bg); border-color: var(--mmdx-diff-del); color: var(--mmdx-diff-del); font-weight: 600; }
.mmdx-version-list .pick-after.on { background: var(--mmdx-diff-add-bg); border-color: var(--mmdx-diff-add); color: var(--mmdx-diff-add); font-weight: 600; }
.mmdx-version-list .more { margin: 6px; }
.mmdx-version-list .versions.timeline { gap: 0; }
.mmdx-version-list .vrail { position: relative; flex: none; align-self: stretch; width: 30px; }
.mmdx-version-list .vrail::before { content: ''; position: absolute; left: 15px; width: 2px; top: 0; bottom: 0; background: var(--mmdx-border-2, var(--mmdx-border)); }
.mmdx-version-list .vrail.first::before { top: 50%; }
.mmdx-version-list .vrail.last::before { bottom: 50%; }
.mmdx-version-list .vrange { position: absolute; left: 14px; width: 4px; top: 0; bottom: 0; background: var(--mmdx-text); }
.mmdx-version-list .vrange.top { top: 50%; }
.mmdx-version-list .vrange.bottom { bottom: 50%; }
.mmdx-version-list .vnode { position: absolute; left: 16px; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; padding: 0; border: 0; border-radius: 50%; background: var(--mmdx-panel, var(--mmdx-surface)); box-shadow: inset 0 0 0 2px var(--mmdx-faint); }
.mmdx-version-list .vnode.in { box-shadow: inset 0 0 0 2px var(--mmdx-text); }
.mmdx-version-list .vnode:hover:not(.on) { transform: translate(-50%, -50%) scale(1.25); box-shadow: inset 0 0 0 2px var(--mmdx-text); }
.mmdx-version-list .vnode.on { width: 20px; height: 20px; color: #fff; font: 700 10px/1 var(--mmdx-font, inherit); display: grid; place-items: center; box-shadow: 0 0 0 3px var(--mmdx-panel, var(--mmdx-surface)); }
.mmdx-version-list .vnode.on:hover { box-shadow: 0 0 0 3px var(--mmdx-panel, var(--mmdx-surface)), 0 0 0 5px var(--mmdx-faint); }
.mmdx-version-list .vnode.before { background: var(--mmdx-diff-del); }
.mmdx-version-list .vnode.after { background: var(--mmdx-diff-add); }
.mmdx-version-list .vnode .ini { display: block; text-box: trim-both cap alphabetic; }
.mmdx-version-list .vnode:focus-visible { outline: 2px solid var(--mmdx-accent); outline-offset: 2px; }
.mmdx-version-list .version.tl .version-main { padding-left: 2px; }
.mmdx-version-list .vmenu { flex: none; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; margin-right: 6px; border: 0; border-radius: 7px; background: transparent; color: var(--mmdx-muted); }
.mmdx-version-list .vmenu:hover:not(:disabled), .mmdx-version-list .vmenu[aria-expanded=true] { background: var(--mmdx-float-2, var(--mmdx-surface-2)); color: var(--mmdx-text); }
.mmdx-version-list .vmenu .mmdx-icon { width: 18px; height: 18px; stroke-width: 3; }
`;

type Col = 'main' | 'before' | 'after' | 'node' | 'menu';

export function createVersionList(props: VersionListProps): BlockHandle<VersionListProps> {
  registerMessages(BLOCK_MESSAGES_DIFF);
  let p = { ...props };
  let fx = new Scope();
  const scope = new Scope();
  const el = h('div', { class: 'mmdx-version-list' });

  // up / down: the same control (row, Before, After) in the next row, else the row itself
  scope.on(el, 'keydown', (ev: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key) || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    const target = ev.target as HTMLElement;
    const rows = [...el.querySelectorAll<HTMLElement>('.version')];
    const i = rows.findIndex((r) => r.contains(target));
    if (i < 0) return;
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)));
    const col = (target.dataset['col'] ?? 'main') as Col;
    const row = rows[n]!;
    const same = row.querySelector<HTMLButtonElement>(`[data-col=${col}]`);
    ev.preventDefault();
    ev.stopPropagation();
    (same && !same.disabled ? same : row.querySelector<HTMLElement>('[data-col=main]'))?.focus();
  });

  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    const t = p.t;
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    const compare = p.mode === 'compare';
    const tl = compare ? p.timeline : undefined;
    // the timeline's range: the rows from the newer of the pair down to the older one
    const bi = p.versions.findIndex((v) => v.id === p.base), hi = p.versions.findIndex((v) => v.id === p.head);
    const top = Math.min(bi, hi), bottom = Math.max(bi, hi);
    const ranged = bi >= 0 && hi >= 0;
    const rail = (v: VersionInfo, i: number, isBefore: boolean, isAfter: boolean): HTMLElement => {
      const on = isBefore || isAfter;
      const inRange = ranged && i >= top && i <= bottom;
      // the end that a dot moves: the nearer one (above the range: the top one, below: the bottom one)
      const topSide: 'before' | 'after' = bi === top ? 'before' : 'after';
      const bottomSide: 'before' | 'after' = topSide === 'before' ? 'after' : 'before';
      const side: 'before' | 'after' = !ranged ? (bi < 0 ? 'before' : 'after') : i < top ? topSide : i > bottom ? bottomSide : i - top <= bottom - i ? topSide : bottomSide;
      const sideLabel = isBefore ? t('diff.history.before') : t('diff.history.after');
      const label = on ? t('diff.history.swapSides', { id: v.id, side: sideLabel.toLowerCase() })
        : t('diff.history.useAs', { id: v.id, side: (side === 'before' ? t('diff.history.before') : t('diff.history.after')).toLowerCase() });
      const node = h('button', {
        type: 'button', class: `vnode${on ? ` on ${isBefore ? 'before' : 'after'}` : inRange ? ' in' : ''}`, 'data-f': `node:${v.id}`, 'data-col': 'node',
        title: label, 'aria-label': label, ...(on ? { 'aria-pressed': 'true' } : {}),
      }, on ? h('span', { class: 'ini', 'aria-hidden': 'true' }, sideLabel.charAt(0)) : null);
      fx.on(node, 'click', () => (on ? tl!.onSwap() : p.onPick(side, v.id)));
      const last = i === p.versions.length - 1 && !p.hasMore;
      return h('span', { class: `vrail${i === 0 ? ' first' : ''}${last ? ' last' : ''}`},
        inRange && top !== bottom ? h('span', { class: `vrange${i === top ? ' top' : ''}${i === bottom ? ' bottom' : ''}` }) : null,
        node);
    };
    const rows = p.versions.map((v, i) => {
      const c = p.counts(v.id);
      const n = c ? c.added + c.removed + c.changed : 0;
      const isAfter = compare && v.id === p.head, isBefore = compare && v.id === p.base;
      const pick = (side: 'before' | 'after'): HTMLElement => {
        const on = side === 'after' ? isAfter : isBefore;
        // one version cannot be both sides
        const taken = side === 'after' ? isBefore : isAfter;
        const other = side === 'after' ? t('diff.history.before') : t('diff.history.after');
        const label = side === 'after' ? t('diff.history.after') : t('diff.history.before');
        const b = h('button', {
          type: 'button', class: `pick pick-${side}${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: taken, 'data-f': `${side}:${v.id}`, 'data-col': side,
          title: taken ? t('diff.history.sameVersion', { id: v.id, side: other.toLowerCase() }) : t('diff.history.useAs', { id: v.id, side: label.toLowerCase() }),
        }, label);
        fx.on(b, 'click', () => p.onPick(side, v.id));
        return b;
      };
      const stats = c === undefined
        ? h('span', { class: 'vstats skeleton', 'aria-hidden': 'true' })
        : c === null
          ? h('span', { class: 'vcount' }, t('diff.history.initial'))
          : h('span', { class: 'vstats' },
            c.added ? h('span', { class: 'add' }, `+${c.added}`) : null,
            c.removed ? h('span', { class: 'del' }, `−${c.removed}`) : null,
            c.changed ? h('span', { class: 'chg' }, `~${c.changed}`) : null,
            n ? null : h('span', null, t('diff.history.noChanges')));
      const who = [v.author, ago(v.date, p.locale)].filter(Boolean).join(' ');
      const viewing = !compare && v.id === p.viewing;
      const main = h('button', { type: 'button', class: 'version-main', 'data-f': `v:${v.id}`, 'data-col': 'main', title: compare ? t('diff.history.compareWith', { id: v.id }) : t('diff.history.view', { id: v.id }) },
        h('span', { class: 'vmsg' }, v.message || v.id),
        h('span', { class: 'vmeta' },
          h('span', { class: 'vwho' }, h('code', { class: 'vid' }, v.id), i === 0 ? h('span', { class: 'vtag' }, t('diff.history.current')) : null, who ? ` ${who}` : ''),
          stats));
      fx.on(main, 'click', () => p.onRow(v.id));
      let dots: HTMLButtonElement | null = null;
      const m = p.menu;
      if (m && (!m.modes || m.modes.includes(p.mode))) {
        const label = t('diff.history.actions', { id: v.id });
        const b = h('button', { type: 'button', class: 'vmenu', title: label, 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-f': `menu:${v.id}`, 'data-col': 'menu' }, icon(I_DOTS, 18));
        fx.on(b, 'click', () => {
          const within = m.within?.();
          openMenu({ popovers: m.popovers, opener: b, label, entries: m.entries(v.id, i), ...(within ? { within } : {}) });
        });
        dots = b;
      }
      return h('div', { class: `version${viewing ? ' viewing' : ''}${isAfter ? ' after' : ''}${isBefore ? ' before' : ''}${tl ? ' tl' : ''}`, role: compare ? 'listitem' : 'option', 'aria-selected': compare ? undefined : String(viewing), 'data-id': v.id },
        tl ? rail(v, i, isBefore, isAfter) : null,
        main,
        compare && !tl ? h('span', { class: 'vpick' }, pick('before'), pick('after')) : null,
        dots);
    });
    let more: HTMLElement | null = null;
    if (p.hasMore) {
      more = h('button', { type: 'button', class: 'more', 'data-f': 'more' }, t('diff.history.more'));
      fx.on(more, 'click', () => p.onMore());
    }
    el.replaceChildren(
      h('div', { class: `versions${tl ? ' timeline' : ''}`, role: compare ? 'list' : 'listbox', 'aria-label': compare ? t('diff.panel.compare') : t('diff.panel.history') }, ...rows),
      ...(more ? [more] : []));
  };
  render();

  return {
    el,
    update(next) {
      p = { ...p, ...next };
      const wasMore = focusedIn(el)?.dataset['f'] === 'more';
      keepFocus(el, render);
      // "Load more" went away with the last page: the focus goes to the oldest row instead of leaving the list
      if (wasMore && !focusedIn(el)) [...el.querySelectorAll<HTMLElement>('.version-main')].pop()?.focus({ preventScroll: true });
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
