// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { nextIdle } from '../../../src/dom/idle.js';
import { createIconButton } from '../../../src/ui/blocks/button.js';
import { createSchemeToggle } from '../../../src/ui/blocks/scheme-toggle.js';
import { createToolbar } from '../../../src/ui/blocks/toolbar.js';
import { createI18n } from '../../../src/i18n.js';
import { signal } from '../../../src/reactive/signal.js';

const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
const mk = (f: string): HTMLButtonElement => createIconButton({ icon: null, text: f, label: f, f }).el;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => document.body.replaceChildren());

describe('Toolbar', () => {
  it('renders items and separators, moves focus with arrow keys and keeps focus on re-render', () => {
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
    // the other orientation's arrows do nothing
    expect(key(b!, 'ArrowRight').defaultPrevented).toBe(false);
    key(b!, 'End');
    expect(document.activeElement).toBe(c);
    key(c!, 'ArrowDown');
    expect(document.activeElement).toBe(a);
    b!.focus();
    tb.setItems([mk('a'), mk('b')]);
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('b');
    expect(document.activeElement).not.toBe(b);
  });

  it('a roving tab stop: one control in the Tab order, following the focus; a hidden stop moves on', async () => {
    const items = [mk('a'), mk('b'), mk('c')];
    const tb = createToolbar({ label: 'Tools', orientation: 'horizontal', items });
    document.body.append(tb.el);
    expect(items.map((x) => x.tabIndex)).toEqual([0, -1, -1]);
    items[0]!.focus();
    key(items[0]!, 'ArrowRight');
    expect(items.map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    items[0]!.focus();
    expect(items.map((x) => x.tabIndex)).toEqual([0, -1, -1]);
    (document.activeElement as HTMLElement).blur();
    items[0]!.hidden = true;
    // the stop follows when the page is idle (checking visibility forces a layout), once for any number of mutations
    await tick();
    await nextIdle();
    expect(items.map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('a nested radio group keeps its own tab stop (the bar\'s stop is among its own controls)', () => {
    const scheme = signal<'light' | 'dark'>('dark');
    const toggle = createSchemeToggle({ scheme, onChange: (v) => scheme.set(v), t: createI18n().t });
    const tb = createToolbar({ label: 'View', orientation: 'horizontal', items: [toggle.el, mk('theme')] });
    document.body.append(tb.el);
    const [light, dark] = [...toggle.el.querySelectorAll<HTMLElement>('[role=radio]')];
    expect([light!.tabIndex, dark!.tabIndex]).toEqual([-1, 0]);
    expect(tb.el.querySelector<HTMLElement>('[data-f=theme]')!.tabIndex).toBe(0);
    // arrows reach the radios too; the bar leaves their tab stops alone
    tb.el.querySelector<HTMLElement>('[data-f=theme]')!.focus();
    tb.el.querySelector<HTMLElement>('[data-f=theme]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(dark);
    expect([light!.tabIndex, dark!.tabIndex]).toEqual([-1, 0]);
  });

  it('follows a compact signal; update() switches the orientation; destroy removes the keys', () => {
    const compact = signal(false);
    const tb = createToolbar({ label: 'x', orientation: 'horizontal', items: [mk('a'), mk('b')], compact });
    document.body.append(tb.el);
    expect(tb.el.classList.contains('tip-above')).toBe(true);
    compact.set(true);
    expect(tb.el.classList.contains('compact')).toBe(true);
    tb.update({ orientation: 'vertical' });
    const [a, b] = [...tb.el.querySelectorAll('button')];
    a!.focus();
    key(a!, 'ArrowDown');
    expect(document.activeElement).toBe(b);
    tb.destroy();
    expect(tb.el.isConnected).toBe(false);
    document.body.append(tb.el);
    b!.focus();
    expect(key(b!, 'ArrowDown').defaultPrevented).toBe(false);
  });
});
