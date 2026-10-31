// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VersionInfo } from '../../../src/core/diff/report.js';
import { ago, createVersionList, type VersionCounts, type VersionListProps } from '../../../src/ui/blocks/version-list.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { PopoverManager } from '../../../src/ui/popover.js';

const t = createI18n().t;
const daysAgo = (n: number): string => new Date(Date.now() - n * 86400_000).toISOString();
const versions: VersionInfo[] = [
  { id: 'c3', message: 'Add cache', author: 'ana', date: daysAgo(1) },
  { id: 'c2', message: 'Rename API', author: 'bo', date: daysAgo(3) },
  { id: 'c1', author: 'ana' },
];
const counts = (c: Partial<VersionCounts>): VersionCounts => ({ added: 0, removed: 0, changed: 0, content: 0, layout: 0, style: 0, ...c });
const COUNTS: Record<string, VersionCounts | null | undefined> = { c3: counts({ added: 2, removed: 1, changed: 3 }), c2: undefined, c1: null };
const props = (over: Partial<VersionListProps> = {}): VersionListProps => ({
  versions, counts: (id) => COUNTS[id], mode: 'compare', base: 'c2', head: 'c3', viewing: null, locale: 'en', hasMore: false,
  onPick: () => undefined, onRow: () => undefined, onMore: () => undefined, t, ...over,
});
const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => document.body.replaceChildren());

describe('VersionList', () => {
  it('renders compare rows: message, id, current tag, author and age, counts, Before / After picks', () => {
    const vl = createVersionList(props({ part: 'history' }));
    expect(vl.el.getAttribute('part')).toBe('history');
    const list = vl.el.querySelector('.versions')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('aria-label')).toBe('Compare');
    const rows = [...vl.el.querySelectorAll<HTMLElement>('.version')];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute('role')).toBe('listitem');
    expect(rows[0]!.classList.contains('after')).toBe(true);
    expect(rows[1]!.classList.contains('before')).toBe(true);
    expect(rows[0]!.querySelector('.vmsg')!.textContent).toBe('Add cache');
    expect(rows[2]!.querySelector('.vmsg')!.textContent).toBe('c1'); // no message: the id
    expect(rows[0]!.querySelector('.vid')!.textContent).toBe('c3');
    expect(rows[0]!.querySelector('.vtag')!.textContent).toBe('current');
    expect(rows[1]!.querySelector('.vtag')).toBeNull();
    expect(rows[0]!.querySelector('.vwho')!.textContent).toBe('c3current ana yesterday');
    expect(rows[0]!.querySelector('.vstats')!.textContent).toBe('+2−1~3');
    expect([...rows[0]!.querySelectorAll('.vstats > span')].map((s) => s.className)).toEqual(['add', 'del', 'chg']);
    expect(rows[1]!.querySelector('.vstats.skeleton')!.getAttribute('aria-hidden')).toBe('true');
    expect(rows[2]!.querySelector('.vcount')!.textContent).toBe('initial');
    const after = rows[0]!.querySelector<HTMLButtonElement>('.pick-after')!;
    expect(after.getAttribute('aria-pressed')).toBe('true');
    expect(after.classList.contains('on')).toBe(true);
    // one version cannot be both sides
    const sameBefore = rows[0]!.querySelector<HTMLButtonElement>('.pick-before')!;
    expect(sameBefore.disabled).toBe(true);
    expect(sameBefore.title).toBe('c3 is already the after version');
    expect(rows[2]!.querySelector<HTMLButtonElement>('.pick-before')!.title).toBe('Use c1 as before');
    expect(rows[0]!.querySelector<HTMLButtonElement>('.version-main')!.title).toBe('Compare c3 with the version before it');
    expect(vl.el.querySelector('.more')).toBeNull();
  });

  it('history mode: a listbox of options, the viewed one selected, no picks; "no changes" counts', () => {
    const vl = createVersionList(props({ mode: 'history', viewing: 'c2', counts: () => counts({}) }));
    const list = vl.el.querySelector('.versions')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBe('History');
    const rows = [...vl.el.querySelectorAll<HTMLElement>('.version')];
    expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(rows[1]!.classList.contains('viewing')).toBe(true);
    expect(rows[0]!.classList.contains('after')).toBe(false);
    expect(vl.el.querySelector('.pick')).toBeNull();
    expect(rows[0]!.querySelector('.vstats')!.textContent).toBe('no changes');
    expect(rows[1]!.querySelector<HTMLButtonElement>('.version-main')!.title).toBe('View c2');
  });

  it('calls onRow, onPick and onMore', () => {
    const onRow = vi.fn(), onPick = vi.fn(), onMore = vi.fn();
    const vl = createVersionList(props({ onRow, onPick, onMore, hasMore: true }));
    vl.el.querySelectorAll<HTMLButtonElement>('.version-main')[1]!.click();
    expect(onRow).toHaveBeenCalledWith('c2');
    vl.el.querySelectorAll<HTMLButtonElement>('.pick-before')[2]!.click();
    expect(onPick).toHaveBeenCalledWith('before', 'c1');
    vl.el.querySelectorAll<HTMLButtonElement>('.pick-after')[2]!.click();
    expect(onPick).toHaveBeenLastCalledWith('after', 'c1');
    // c2 is Before: its After pick is disabled
    vl.el.querySelectorAll<HTMLButtonElement>('.pick-after')[1]!.click();
    expect(onPick).toHaveBeenCalledTimes(2);
    const more = vl.el.querySelector<HTMLButtonElement>('.more')!;
    expect(more.textContent).toBe('Load older versions');
    more.click();
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('arrow keys move to the same control of the next row (the row when that one is disabled)', () => {
    const vl = createVersionList(props());
    document.body.append(vl.el);
    const mains = [...vl.el.querySelectorAll<HTMLElement>('.version-main')];
    mains[0]!.focus();
    key(mains[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(mains[1]);
    key(mains[1]!, 'End');
    expect(document.activeElement).toBe(mains[2]);
    const before2 = vl.el.querySelectorAll<HTMLElement>('.pick-before')[2]!;
    before2.focus();
    key(before2, 'ArrowUp');
    expect(document.activeElement).toBe(vl.el.querySelectorAll('.pick-before')[1]);
    key(document.activeElement!, 'ArrowUp');
    // row 0's Before is disabled (it is the After version): the row itself
    expect(document.activeElement).toBe(mains[0]);
  });

  it('keeps the focus across update(); "Load more" gone sends it to the oldest row', () => {
    const vl = createVersionList(props({ hasMore: true }));
    document.body.append(vl.el);
    vl.el.querySelectorAll<HTMLElement>('.pick-before')[2]!.focus();
    vl.update({ base: 'c1' });
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('before:c1');
    expect((document.activeElement as HTMLElement).getAttribute('aria-pressed')).toBe('true');
    vl.el.querySelector<HTMLElement>('.more')!.focus();
    vl.update({ versions: [...versions, { id: 'c0' }], hasMore: false });
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('v:c0');
  });

  it('a ⋮ menu on each row opens the entries for that version through the popover manager', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const popovers = new PopoverManager(root);
    const run = vi.fn();
    const entries = vi.fn((id: string, i: number) => [{ label: `Restore ${id} #${i}`, run }]);
    const vl = createVersionList(props({ mode: 'history', viewing: 'c3', menu: { entries, popovers, within: () => host, modes: ['history'] } }));
    root.append(vl.el);
    const dots = vl.el.querySelectorAll<HTMLButtonElement>('.vmenu');
    expect(dots).toHaveLength(3);
    expect(dots[1]!.getAttribute('aria-label')).toBe('Actions for c2');
    expect(dots[1]!.getAttribute('aria-haspopup')).toBe('menu');
    dots[1]!.click();
    expect(entries).toHaveBeenCalledWith('c2', 1);
    expect(dots[1]!.getAttribute('aria-expanded')).toBe('true');
    root.querySelector<HTMLButtonElement>('[role=menu] [role=menuitem]')!.click();
    expect(run).toHaveBeenCalledOnce();
    expect(popovers.isOpen).toBe(false);
    expect(createVersionList(props()).el.querySelector('.vmenu')).toBeNull();
    // not in the tabs it is not for
    expect(createVersionList(props({ menu: { entries, popovers, modes: ['history'] } })).el.querySelector('.vmenu')).toBeNull();
  });

  it('icon picks: the icon replaces the text, the label stays the accessible name', () => {
    const svg = (): SVGElement => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const vl = createVersionList(props({ pickIcons: { before: svg, after: svg } }));
    const picks = [...vl.el.querySelectorAll<HTMLButtonElement>('.version')[0]!.querySelectorAll<HTMLButtonElement>('.pick')];
    expect(picks.map((b) => b.getAttribute('aria-label'))).toEqual(['Before', 'After']);
    expect(picks.every((b) => b.classList.contains('icon') && b.querySelector('svg') && !b.textContent)).toBe(true);
    expect(picks[1]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('destroy() removes the element and its listeners', () => {
    const onRow = vi.fn();
    const vl = createVersionList(props({ onRow }));
    document.body.append(vl.el);
    const main = vl.el.querySelector<HTMLButtonElement>('.version-main')!;
    vl.destroy();
    expect(vl.el.isConnected).toBe(false);
    main.click();
    expect(onRow).not.toHaveBeenCalled();
  });
});

describe('ago', () => {
  it('formats a relative age, empty without a valid date', () => {
    expect(ago(undefined, 'en')).toBe('');
    expect(ago('not a date', 'en')).toBe('');
    expect(ago(new Date(Date.now() - 5 * 60_000).toISOString(), 'en')).toBe('5 minutes ago');
    expect(ago(new Date(Date.now() - 3 * 3600_000).toISOString(), 'en')).toBe('3 hours ago');
    expect(ago(daysAgo(120), 'en')).toBe('4 months ago');
  });
});
