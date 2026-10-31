// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHelpPopup, groupShortcuts, helpKeys } from '../../../src/ui/blocks/help-popup.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { PopoverManager } from '../../../src/ui/popover.js';
import type { Shortcut } from '../../../src/ui/shortcuts.js';

const { t } = createI18n();

const KEYMAP: Shortcut[] = [
  { id: 'hand', keys: ['h'], label: 'Hand', group: 'Tools' },
  { id: 'fit', keys: ['f'], label: 'Fit', group: 'View' },
  { id: 'pen', keys: ['p'], label: 'Pen', group: 'Tools' },
  { id: 'zoom', keys: ['+', '-'], label: 'Zoom', group: 'View', hintOnly: true },
  { id: 'pan', keys: ['Space + drag'], label: 'Pan', group: 'View', hintOnly: true },
];

afterEach(() => document.body.replaceChildren());

describe('groupShortcuts and helpKeys', () => {
  it('groups by group in first-seen order', () => {
    const groups = groupShortcuts(KEYMAP);
    expect(groups.map((g) => g.title)).toEqual(['Tools', 'View']);
    expect(groups[0]!.rows.map((s) => s.id)).toEqual(['hand', 'pen']);
    expect(groups[1]!.rows.map((s) => s.id)).toEqual(['fit', 'zoom', 'pan']);
  });

  it('renders key caps joined by · and gestures as text', () => {
    const caps = helpKeys(KEYMAP[3]!);
    expect([...caps.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['+', '-']);
    expect(caps.textContent).toBe('+ · -');
    const gesture = helpKeys(KEYMAP[4]!);
    expect(gesture.querySelector('kbd')).toBeNull();
    expect(gesture.querySelector('.help-gesture')?.textContent).toBe('Space + drag');
  });
});

describe('HelpPopup', () => {
  it('renders a labelled dialog with headings and rows', () => {
    const pop = createHelpPopup({ title: 'Shortcuts', groups: groupShortcuts(KEYMAP), onClose: () => undefined, t });
    const el = pop.el;
    expect(el.classList.contains('help-pop')).toBe(true);
    expect(el.getAttribute('role')).toBe('dialog');
    const title = el.querySelector('.help-head b')!;
    expect(title.textContent).toBe('Shortcuts');
    expect(el.getAttribute('aria-labelledby')).toBe(title.id);
    const headings = el.querySelectorAll('.help-title');
    expect([...headings].map((x) => x.textContent)).toEqual(['Tools', 'View']);
    expect(headings[0]!.getAttribute('role')).toBe('heading');
    expect(headings[0]!.getAttribute('aria-level')).toBe('3');
    const rows = el.querySelectorAll('.help-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]!.querySelector('kbd')?.textContent).toBe('H');
    expect(rows[0]!.lastElementChild?.textContent).toBe('Hand');
    const close = el.querySelector('.help-head button')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    // two popups never share an id
    expect(createHelpPopup({ title: 'x', groups: [], onClose: () => undefined, t }).el.getAttribute('aria-labelledby')).not.toBe(title.id);
  });

  it('closes from the button and Esc', () => {
    const onClose = vi.fn();
    const pop = createHelpPopup({ title: 'Shortcuts', groups: [], onClose, t });
    document.body.append(pop.el);
    (pop.el.querySelector('.help-head button') as HTMLElement).click();
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    pop.el.querySelector('.help-head button')!.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(ev.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', outer);
  });

  it('update replaces the rows', () => {
    const pop = createHelpPopup({ title: 'Shortcuts', groups: groupShortcuts(KEYMAP), onClose: () => undefined, t });
    pop.update({ title: 'Help', groups: groupShortcuts(KEYMAP.slice(0, 1)) });
    expect(pop.el.querySelector('.help-head b')?.textContent).toBe('Help');
    expect(pop.el.querySelectorAll('.help-row')).toHaveLength(1);
  });

  it('opens through a PopoverManager and closes on Esc', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const opener = document.createElement('button');
    root.append(opener);
    const pops = new PopoverManager(root);
    const pop = createHelpPopup({ title: 'Shortcuts', groups: groupShortcuts(KEYMAP), onClose: () => pops.close(true), t });
    pops.open(pop.el, opener, { onClose: () => pop.destroy() });
    expect(root.querySelector('.help-pop.mmdx-pop')).toBe(pop.el);
    pop.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(pops.isOpen).toBe(false);
    expect(pop.el.isConnected).toBe(false);
  });

  it('destroy removes the popup and its listeners', () => {
    const onClose = vi.fn();
    const pop = createHelpPopup({ title: 'Shortcuts', groups: [], onClose, t });
    document.body.append(pop.el);
    const el = pop.el;
    pop.destroy();
    expect(el.isConnected).toBe(false);
    (el.querySelector('.help-head button') as HTMLElement).click();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
