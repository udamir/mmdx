// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThemeButton, openThemeMenu, themeMenuEntries, type ThemeInfo } from '../../../src/ui/blocks/theme-menu.js';
import { h } from '../../../src/ui/h.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { PopoverManager } from '../../../src/ui/popover.js';
import { signal } from '../../../src/ui/signal.js';

const t = createI18n().t;
const THEMES: ThemeInfo[] = [
  { id: 'default-light', name: 'Default Light', appearance: 'light' },
  { id: 'paper', name: 'Paper', appearance: 'light' },
  { id: 'default-dark', name: 'Default Dark', appearance: 'dark' },
];

const shadowHost = (): { host: HTMLElement; root: ShadowRoot; pops: PopoverManager } => {
  const host = h('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  return { host, root, pops: new PopoverManager(root) };
};

afterEach(() => document.body.replaceChildren());

describe('themeMenuEntries', () => {
  it('Follow first (ticked while nothing is picked), then Light / Dark sections, then Edit', () => {
    const onEdit = vi.fn();
    const entries = themeMenuEntries({ themes: THEMES, picked: null, onPick: vi.fn(), onFollow: vi.fn(), onEdit, t });
    const items = entries.filter((e) => typeof e === 'object' && 'label' in e) as { label: string; checked?: boolean }[];
    expect(items[0]).toMatchObject({ label: 'Follow light / dark', checked: true });
    expect(items.slice(1, 4).every((x) => x.checked === false)).toBe(true);
    expect(entries.filter((e) => typeof e === 'object' && 'section' in e)).toEqual([{ section: 'Light themes' }, { section: 'Dark themes' }]);
    expect(items.at(-1)).toMatchObject({ label: 'Edit themes…' });
    expect(items.at(-1)?.checked).toBeUndefined();
  });

  it('picked can be a signal, read when the entries are built', () => {
    const picked = signal<string | null>(null);
    const ticked = (): string[] => (themeMenuEntries({ themes: THEMES, picked, onPick: vi.fn(), onFollow: vi.fn(), t })
      .filter((e) => typeof e === 'object' && 'label' in e && e.checked) as { label: string }[]).map((x) => x.label);
    expect(ticked()).toEqual(['Follow light / dark']);
    picked.set('default-dark');
    expect(ticked()).toEqual(['Default Dark']);
  });

  it('ticks the picked theme only; no Edit entry without onEdit; empty groups are skipped', () => {
    const entries = themeMenuEntries({ themes: THEMES.slice(0, 2), picked: 'paper', onPick: vi.fn(), onFollow: vi.fn(), t });
    const items = entries.filter((e) => typeof e === 'object' && 'label' in e) as { label: string; checked?: boolean }[];
    expect(items.filter((x) => x.checked).map((x) => x.label)).toEqual(['Paper']);
    expect(items.some((x) => x.label === 'Edit themes…')).toBe(false);
    expect(entries.some((e) => typeof e === 'object' && 'section' in e && e.section === 'Dark themes')).toBe(false);
  });
});

describe('openThemeMenu', () => {
  it('opens a menu; picking a theme or Follow calls back and closes', () => {
    const { host, root, pops } = shadowHost();
    const opener = h('button', null, 'theme');
    root.append(opener);
    const onPick = vi.fn(), onFollow = vi.fn();
    openThemeMenu({ popovers: pops, opener, within: host, themes: THEMES, picked: 'paper', onPick, onFollow, t });
    const menu = root.querySelector('[role=menu]')!;
    expect(menu.getAttribute('aria-label')).toBe('Diagram theme');
    const radios = [...menu.querySelectorAll<HTMLElement>('[role=menuitemradio]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
    radios[3]!.click();
    expect(onPick).toHaveBeenCalledWith('default-dark');
    expect(pops.isOpen).toBe(false);
    openThemeMenu({ popovers: pops, opener, within: host, themes: THEMES, picked: 'paper', onPick, onFollow, t });
    root.querySelector<HTMLElement>('[role=menuitemradio]')!.click();
    expect(onFollow).toHaveBeenCalledOnce();
  });
});

describe('createThemeButton', () => {
  it('labels with the shown theme, follows the signal, opens the menu with the current pick', () => {
    const { host, root, pops } = shadowHost();
    const shown = signal('default-light');
    const picked = signal<string | null>(null);
    const onPick = vi.fn((id: string) => {
      picked.set(id);
      shown.set(id);
    });
    const btn = createThemeButton({ themes: THEMES, picked, shown, onPick, onFollow: () => picked.set(null), popovers: pops, within: () => host, t });
    root.append(btn.el);
    expect(btn.el.classList.contains('vp-btn')).toBe(true);
    expect(btn.el.querySelector('.vp-caret')).not.toBeNull();
    expect(btn.el.getAttribute('aria-label')).toBe('Diagram theme: Default Light');
    expect(btn.el.title).toBe('Diagram theme: Default Light');
    expect(btn.el.getAttribute('aria-haspopup')).toBe('menu');
    btn.el.click();
    expect(btn.el.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[role=menuitemradio]')?.getAttribute('aria-checked')).toBe('true'); // Follow
    [...root.querySelectorAll<HTMLElement>('[role=menuitemradio]')][2]!.click();
    expect(onPick).toHaveBeenCalledWith('paper');
    expect(btn.el.getAttribute('aria-label')).toBe('Diagram theme: Paper');
    btn.el.click();
    const checked = [...root.querySelectorAll('[role=menuitemradio][aria-checked=true]')].map((x) => x.textContent);
    expect(checked).toEqual(['✓Paper']);
    pops.close();
  });

  it('destroy() stops following the signal and detaches the menu', () => {
    const { root, pops } = shadowHost();
    const shown = signal('paper');
    const btn = createThemeButton({ themes: THEMES, picked: null, shown, onPick: vi.fn(), onFollow: vi.fn(), popovers: pops, t });
    root.append(btn.el);
    const el = btn.el;
    btn.destroy();
    shown.set('default-dark');
    expect(el.getAttribute('aria-label')).toBe('Diagram theme: Paper');
    expect(el.isConnected).toBe(false);
    el.click();
    expect(pops.isOpen).toBe(false);
  });
});
