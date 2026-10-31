// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openMenu } from '../../src/ui/blocks/menu.js';
import { PopoverManager, Toaster } from '../../src/ui/popover.js';

const setup = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const opener = document.createElement('button');
  root.append(opener);
  return { host, root, opener, pops: new PopoverManager(root) };
};
const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('PopoverManager', () => {
  it('opening again from the same opener closes it and runs the new popover\'s onClose (nothing is left behind)', () => {
    const { root, opener, pops } = setup();
    const first = vi.fn(), second = vi.fn();
    pops.open(document.createElement('div'), opener, { onClose: first });
    expect(pops.isOpenFor(opener)).toBe(true);
    const el = document.createElement('div');
    pops.open(el, opener, { onClose: second });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(el.isConnected).toBe(false);
    expect(pops.isOpen).toBe(false);
    expect(root.querySelector('.mmdx-pop')).toBeNull();
  });

  it('openMenu toggles: a second click on the opener closes the menu without building another', () => {
    const { root, opener, pops, host } = setup();
    const entries = [{ label: 'A', run: () => undefined }];
    openMenu({ popovers: pops, opener, label: 'M', entries, within: host });
    expect(root.querySelectorAll('[role=menu]')).toHaveLength(1);
    openMenu({ popovers: pops, opener, label: 'M', entries, within: host });
    expect(root.querySelectorAll('[role=menu]')).toHaveLength(0);
    expect(pops.isOpen).toBe(false);
  });

  it('arrow keys, Home and End move through the menu items; Esc closes and returns the focus', () => {
    const { root, opener, pops, host } = setup();
    openMenu({ popovers: pops, opener, label: 'M', entries: [{ label: 'A', run: () => undefined }, { label: 'B', run: () => undefined, disabled: true }, { label: 'C', run: () => undefined }], within: host });
    const items = [...root.querySelectorAll<HTMLElement>('[role=menuitem]')];
    items[0]!.focus();
    key(items[0]!, 'ArrowDown');
    expect(root.activeElement).toBe(items[2]);
    key(items[2]!, 'ArrowDown');
    expect(root.activeElement).toBe(items[0]);
    key(items[0]!, 'End');
    expect(root.activeElement).toBe(items[2]);
    key(items[2]!, 'Escape');
    expect(pops.isOpen).toBe(false);
    expect(root.activeElement).toBe(opener);
  });
});

describe('Toaster', () => {
  it('shows at most three toasts, removes them after their time, and clears its timers on destroy', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.append(host);
    const toaster = new Toaster(host);
    for (const s of ['a', 'b', 'c', 'd']) toaster.show(s);
    const box = host.querySelector('.mmdx-toast-host')!;
    expect([...box.children].map((c) => c.textContent)).toEqual(['b', 'c', 'd']);
    toaster.show('e', { error: true, ms: 100 });
    expect(box.lastElementChild!.className).toBe('mmdx-toast error');
    vi.advanceTimersByTime(150);
    expect([...box.children].map((c) => c.textContent)).not.toContain('e');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    toaster.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(box.isConnected).toBe(false);
  });
});
