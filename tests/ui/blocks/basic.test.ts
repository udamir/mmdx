// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIconButton } from '../../../src/ui/blocks/button.js';
import { keepFocus } from '../../../src/ui/blocks/focus.js';
import { createMenu, openMenu } from '../../../src/ui/blocks/menu.js';
import { createSegmented } from '../../../src/ui/blocks/segmented.js';
import { createTabs } from '../../../src/ui/blocks/tabs.js';
import { createToolbar } from '../../../src/ui/blocks/toolbar.js';
import { h } from '../../../src/ui/h.js';
import { PopoverManager } from '../../../src/ui/popover.js';
import { signal } from '../../../src/ui/signal.js';

const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

afterEach(() => document.body.replaceChildren());

describe('IconButton', () => {
  it('labels, tooltips with the shortcut, aria-keyshortcuts and click', () => {
    const onClick = vi.fn();
    const b = createIconButton({ icon: 'M0 0h1', label: 'Hand', keys: 'shift+h', onClick, class: 'vt-tool', f: 'hand' });
    expect(b.el.getAttribute('aria-label')).toBe('Hand');
    expect(b.el.title).toBe('Hand (shift+H)');
    expect(b.el.getAttribute('aria-keyshortcuts')).toBe('Shift+h');
    expect(b.el.dataset['f']).toBe('hand');
    expect(b.el.classList.contains('vt-tool')).toBe(true);
    expect(b.el.querySelector('svg')).not.toBeNull();
    b.el.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('follows pressed, disabled and hidden signals; `tip` tooltips use data-tip', () => {
    const pressed = signal(false), disabled = signal(false), hidden = signal(false);
    const b = createIconButton({ icon: null, text: 'Fit', label: 'Fit', tooltip: 'tip', pressed, disabled, hidden });
    expect(b.el.title).toBe('');
    expect(b.el.dataset['tip']).toBe('Fit');
    expect(b.el.textContent).toBe('Fit');
    expect(b.el.getAttribute('aria-pressed')).toBe('false');
    pressed.set(true);
    disabled.set(true);
    hidden.set(true);
    expect(b.el.getAttribute('aria-pressed')).toBe('true');
    expect(b.el.classList.contains('on')).toBe(true);
    expect(b.el.disabled).toBe(true);
    expect(b.el.hidden).toBe(true);
    b.destroy();
    pressed.set(false);
    expect(b.el.getAttribute('aria-pressed')).toBe('true'); // no effect after destroy
  });
});

describe('Toolbar', () => {
  it('renders items and separators, moves focus with arrow keys and keeps focus on re-render', () => {
    const mk = (f: string): HTMLButtonElement => createIconButton({ icon: null, text: f, label: f, f }).el;
    const tb = createToolbar({ label: 'Tools', orientation: 'vertical', items: [mk('a'), 'sep', mk('b'), null, mk('c')], part: 'toolbar' });
    document.body.append(tb.el);
    expect(tb.el.getAttribute('role')).toBe('toolbar');
    expect(tb.el.getAttribute('aria-orientation')).toBe('vertical');
    expect(tb.el.getAttribute('part')).toBe('toolbar');
    expect(tb.el.classList.contains('tip-side')).toBe(true);
    expect(tb.el.querySelectorAll('[role=separator]')).toHaveLength(1);
    const [a, b, c] = [...tb.el.querySelectorAll('button')];
    a!.focus();
    key(a!, 'ArrowDown');
    expect(document.activeElement).toBe(b);
    key(b!, 'End');
    expect(document.activeElement).toBe(c);
    key(c!, 'ArrowDown');
    expect(document.activeElement).toBe(a);
    b!.focus();
    tb.setItems([mk('a'), mk('b')]);
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('b');
    expect(document.activeElement).not.toBe(b);
  });

  it('follows a compact signal', () => {
    const compact = signal(false);
    const tb = createToolbar({ label: 'x', orientation: 'horizontal', items: [], compact });
    expect(tb.el.classList.contains('tip-above')).toBe(true);
    compact.set(true);
    expect(tb.el.classList.contains('compact')).toBe(true);
  });
});

describe('keepFocus', () => {
  it('restores the focus to the control with the same data-f', () => {
    const box = h('div', null, h('button', { 'data-f': 'x' }, 'x'));
    document.body.append(box);
    (box.firstElementChild as HTMLElement).focus();
    keepFocus(box, () => box.replaceChildren(h('button', { 'data-f': 'y' }), h('button', { 'data-f': 'x' }, 'x2')));
    expect(document.activeElement?.textContent).toBe('x2');
  });
});

describe('Menu', () => {
  it('renders sections, separators and radio items; picking runs the item and closes', () => {
    const run = vi.fn();
    const m = createMenu({ label: 'Theme', entries: [{ section: 'Light' }, { label: 'A', checked: true, run }, 'sep', { label: 'B', checked: false, run: () => undefined, disabled: true }] });
    expect(m.el.getAttribute('role')).toBe('menu');
    expect(m.el.querySelector('.mmdx-sect')?.textContent).toBe('Light');
    const items = m.el.querySelectorAll('[role=menuitemradio]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    expect((items[1] as HTMLButtonElement).disabled).toBe(true);
    (items[0] as HTMLElement).click();
    expect(run).toHaveBeenCalledOnce();
  });

  it('openMenu opens through the popover manager and closes on pick', () => {
    const host = h('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const opener = h('button', null, 'Export');
    root.append(opener);
    const pops = new PopoverManager(root);
    const run = vi.fn();
    openMenu({ popovers: pops, opener, label: 'Export', entries: [{ label: 'SVG', run }], within: host });
    expect(pops.isOpen).toBe(true);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    (root.querySelector('[role=menuitem]') as HTMLElement).click();
    expect(run).toHaveBeenCalledOnce();
    expect(pops.isOpen).toBe(false);
  });
});

describe('Tabs and Segmented', () => {
  it('tabs follow the value, arrows move and select', () => {
    const value = signal<'code' | 'meta'>('code');
    const tabs = createTabs({ label: 'Code', tabs: [{ value: 'code', label: 'Code' }, { value: 'meta', label: 'Metadata' }], value, onChange: (v) => value.set(v), end: [h('button', null, '×')] });
    document.body.append(tabs.el);
    const [a, b] = [...tabs.el.querySelectorAll<HTMLElement>('[role=tab]')];
    expect(a!.getAttribute('aria-selected')).toBe('true');
    expect(b!.tabIndex).toBe(-1);
    a!.focus();
    key(a!, 'ArrowRight');
    expect(value.peek()).toBe('meta');
    expect(b!.getAttribute('aria-selected')).toBe('true');
    expect(tabs.el.lastElementChild?.textContent).toBe('×');
  });

  it('segmented buttons and the compact select', () => {
    const value = signal('merged');
    const onChange = vi.fn((v: string) => value.set(v));
    const seg = createSegmented({ label: 'Views', options: [{ value: 'before', label: 'Before' }, { value: 'merged', label: 'Merged', tip: 'Overlay' }], value, onChange, select: true });
    const buttons = seg.el.querySelectorAll('button');
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]!.dataset['tip']).toBe('Overlay');
    buttons[0]!.click();
    expect(onChange).toHaveBeenCalledWith('before');
    expect(buttons[0]!.classList.contains('on')).toBe(true);
    const sel = seg.el.querySelector('select')!;
    expect(sel.value).toBe('before');
    sel.value = 'merged';
    sel.dispatchEvent(new Event('change'));
    expect(value.peek()).toBe('merged');
  });

  it('segmented icon buttons: the icon replaces the label, which becomes the accessible name', () => {
    const value = signal('a');
    const icon = (): SVGElement => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const seg = createSegmented({ label: 'Views', options: [{ value: 'a', label: 'Before', icon, tip: 'Before (1)' }], value, onChange: () => undefined });
    const b = seg.el.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('Before');
    expect(b.textContent).toBe('');
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b.dataset['tip']).toBe('Before (1)');
  });
});
