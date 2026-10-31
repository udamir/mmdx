// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../../src/adapters/storage.js';
import { rovingKeys } from '../../../src/ui/blocks/focus.js';
import { createPanelStack } from '../../../src/ui/blocks/panel-stack.js';
import { createSegmented } from '../../../src/ui/blocks/segmented.js';
import { createSidePanel } from '../../../src/ui/blocks/side-panel.js';
import { createTabs } from '../../../src/ui/blocks/tabs.js';
import { h } from '../../../src/ui/h.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { signal } from '../../../src/ui/signal.js';

const t = createI18n().t;
const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
const active = (): HTMLElement => document.activeElement as HTMLElement;

afterEach(() => document.body.replaceChildren());

describe('rovingKeys', () => {
  const setup = (o: Partial<Parameters<typeof rovingKeys>[1]> = {}) => {
    const box = h('div', null, h('button', null, 'a'), h('button', { disabled: true }, 'x'), h('button', null, 'b'), h('button', null, 'c'));
    document.body.append(box);
    const keys = rovingKeys(box, { orientation: 'horizontal', selector: 'button', ...o });
    const [a, , b, c] = [...box.querySelectorAll('button')];
    return { box, keys, a: a!, b: b!, c: c! };
  };

  it('moves along the enabled items, wraps, Home / End; other orientations and modifiers are ignored', () => {
    const { a, b, c } = setup();
    a.focus();
    expect(key(a, 'ArrowRight').defaultPrevented).toBe(true);
    expect(active()).toBe(b); // the disabled one is skipped
    key(b, 'End');
    expect(active()).toBe(c);
    key(c, 'ArrowRight');
    expect(active()).toBe(a);
    key(a, 'ArrowLeft');
    expect(active()).toBe(c);
    expect(key(c, 'ArrowDown').defaultPrevented).toBe(false);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true }));
    expect(active()).toBe(c);
  });

  it('stops at the ends without wrap; select clicks the item moved to', () => {
    const { a, b, c } = setup({ wrap: false, select: true });
    const clicks: string[] = [];
    for (const x of [a, b, c]) x.addEventListener('click', () => clicks.push(x.textContent!));
    c.focus();
    key(c, 'ArrowRight');
    expect(active()).toBe(c);
    key(c, 'ArrowLeft');
    expect(active()).toBe(b);
    expect(clicks).toEqual(['b']);
  });

  it('roving: one tab stop, following the focus; `current` picks it otherwise; destroy removes the keys', () => {
    const { box, keys, a, b, c } = setup({ roving: true, current: (items) => items[1] });
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    c.focus();
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([-1, -1, 0]);
    key(c, 'ArrowLeft');
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    expect(box.hasAttribute('data-roving')).toBe(true);
    keys.destroy();
    key(b, 'ArrowLeft');
    expect(active()).toBe(b);
    expect(box.hasAttribute('data-roving')).toBe(false);
  });

  it('roving: a hidden tab stop moves to the next usable item; nested groups keep their own stops', async () => {
    const inner = h('span', null, h('button', null, 'r1'), h('button', null, 'r2'));
    const box = h('div', null, h('button', null, 'a'), inner);
    document.body.append(box);
    const own = rovingKeys(inner, { orientation: 'horizontal', selector: 'button' });
    const [r1, r2] = [...inner.querySelectorAll('button')];
    r1!.tabIndex = 0;
    r2!.tabIndex = -1;
    const keys = rovingKeys(box, { orientation: 'horizontal', selector: 'button', roving: true });
    const a = box.querySelector('button')!;
    expect(a.tabIndex).toBe(0);
    expect([r1!.tabIndex, r2!.tabIndex]).toEqual([0, -1]);
    a.hidden = true;
    keys.sync();
    expect(keys.items()).toEqual([r1, r2]);
    own.destroy();
  });
});

describe('focus kept across update()', () => {
  it('Tabs keep the focused tab when the tabs are rebuilt', () => {
    const value = signal<'a' | 'b'>('a');
    const tabs = createTabs({ label: 'T', tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value, onChange: (v) => value.set(v) });
    document.body.append(tabs.el);
    tabs.el.querySelectorAll<HTMLElement>('[role=tab]')[1]!.focus();
    tabs.update({ tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B2' }] });
    expect(active().textContent).toBe('B2');
    key(active(), 'Home');
    expect(value.peek()).toBe('a');
  });

  it('Segmented keeps the focused option when the options change', () => {
    const value = signal('x');
    const seg = createSegmented({ label: 'S', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], value, onChange: (v) => value.set(v) });
    const box = h('div', null, seg.el);
    document.body.append(box);
    seg.el.querySelectorAll('button')[1]!.focus();
    seg.update({ options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y', disabled: false, tip: 'new' }] });
    expect(active().dataset['value']).toBe('y');
    expect(active().dataset['tip']).toBe('new');
  });

  it('SidePanel keeps the close button and the head in place', () => {
    const tabsEl = h('div', null, h('button', { 'data-f': 'tab' }, 'Tab'));
    const panel = createSidePanel({ side: 'left', head: tabsEl, label: 'P', onClose: () => undefined, body: h('div') });
    document.body.append(panel.el);
    // the default close label comes from the block's own strings
    const close = panel.el.querySelector<HTMLButtonElement>('.mmdx-panel-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    close.focus();
    panel.update({ label: 'P2' });
    expect(active().classList.contains('mmdx-panel-close')).toBe(true);
    tabsEl.querySelector('button')!.focus();
    panel.update({ closeLabel: 'Hide' });
    expect(active().textContent).toBe('Tab');
    expect(panel.el.querySelector('.mmdx-panel-close')!.getAttribute('aria-label')).toBe('Hide');
  });

  it('PanelStack keeps a focused control inside a panel; reloads sizes on a new storageKey; re-observes on new drawerBelow', () => {
    const storage = memoryStorage({ 'a.w': 300, 'b.w': 420 });
    const body = h('div', null, h('input', { 'data-f': 'q' }));
    const p1 = createSidePanel({ side: 'left', title: 'One', label: 'One', body }).el;
    const container = h('div');
    Object.defineProperty(container, 'getBoundingClientRect', { value: () => ({ width: 500 }) });
    const onChange = vi.fn();
    const stack = createPanelStack({ side: 'left', storage, storageKey: 'a', t, onChange, panels: [{ id: 'one', panel: p1, open: true }], width: { initial: 360, min: 200, max: () => 800 }, container });
    document.body.append(stack.el);
    expect(stack.el.style.getPropertyValue('--mmdx-stack-w')).toBe('300px');
    body.querySelector('input')!.focus();
    stack.update({ label: 'Panels' });
    expect(active().dataset['f']).toBe('q');
    expect(active()).toBe(body.querySelector('input'));
    stack.update({ storageKey: 'b' });
    expect(stack.el.style.getPropertyValue('--mmdx-stack-w')).toBe('420px');
    expect(stack.drawer).toBe(false);
    stack.update({ drawerBelow: 600 });
    expect(stack.drawer).toBe(true);
    stack.update({ drawerBelow: 400 });
    expect(stack.drawer).toBe(false);
  });
});
