// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabs } from '../../../src/ui/blocks/tabs.js';
import { h } from '../../../src/ui/h.js';
import { signal } from '../../../src/ui/signal.js';

const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => document.body.replaceChildren());

describe('Tabs', () => {
  it('tabs follow the value, arrows move and select; extra elements end the list', () => {
    const value = signal<'code' | 'meta'>('code');
    const tabs = createTabs({ label: 'Code', tabs: [{ value: 'code', label: 'Code' }, { value: 'meta', label: 'Metadata', title: 'The %%@ lines' }], value, onChange: (v) => value.set(v), end: [h('button', null, '×')] });
    document.body.append(tabs.el);
    expect(tabs.el.getAttribute('role')).toBe('tablist');
    expect(tabs.el.getAttribute('aria-label')).toBe('Code');
    const [a, b] = [...tabs.el.querySelectorAll<HTMLElement>('[role=tab]')];
    expect(a!.getAttribute('aria-selected')).toBe('true');
    expect([a!.tabIndex, b!.tabIndex]).toEqual([0, -1]);
    expect(b!.title).toBe('The %%@ lines');
    a!.focus();
    key(a!, 'ArrowRight');
    expect(value.peek()).toBe('meta');
    expect(document.activeElement).toBe(b);
    expect(b!.getAttribute('aria-selected')).toBe('true');
    expect([a!.tabIndex, b!.tabIndex]).toEqual([-1, 0]);
    key(b!, 'Home');
    expect(value.peek()).toBe('code');
    key(a!, 'ArrowLeft');
    expect(value.peek()).toBe('meta'); // wraps
    expect(tabs.el.lastElementChild?.textContent).toBe('×');
  });

  it('a click on the selected tab does not call onChange; a plain value works; destroy stops it', () => {
    const onChange = vi.fn();
    const tabs = createTabs({ label: 'T', tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'a', onChange });
    const [a, b] = [...tabs.el.querySelectorAll<HTMLElement>('[role=tab]')];
    a!.click();
    expect(onChange).not.toHaveBeenCalled();
    b!.click();
    expect(onChange).toHaveBeenCalledWith('b');
    tabs.destroy();
    b!.click();
    expect(onChange).toHaveBeenCalledOnce();
  });
});
