// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../../src/adapters/storage.js';
import { createPanelStack } from '../../../src/ui/blocks/panel-stack.js';
import { createSidePanel } from '../../../src/ui/blocks/side-panel.js';
import { h } from '../../../src/ui/kit/h.js';
import { createI18n } from '../../../src/i18n.js';
import { signal } from '../../../src/reactive/signal.js';

const t = createI18n().t;
const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const pointer = (el: Element, type: string, clientX: number, clientY: number): void => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  el.dispatchEvent(ev);
};
const panel = (name: string): HTMLElement => createSidePanel({ side: 'left', title: name, label: name, closeLabel: `Close ${name}`, body: h('div') }).el;

const setup = (opts: { saved?: Record<string, unknown>; drawerBelow?: number; container?: HTMLElement } = {}) => {
  const history = signal(true), code = signal(false), meta = signal(false);
  const storage = memoryStorage(opts.saved ?? {});
  const onChange = vi.fn();
  const [a, b, c] = [panel('History'), panel('Code'), panel('Meta')];
  const stack = createPanelStack({
    side: 'left', storage, storageKey: 'diff.left', t, onChange, label: 'Panels', part: 'panel',
    panels: [{ id: 'history', panel: a, open: history }, { id: 'code', panel: b, open: code }, { id: 'meta', panel: c, open: meta }],
    width: { initial: 360, min: 220, max: () => 700 },
    ...(opts.drawerBelow !== undefined ? { drawerBelow: opts.drawerBelow } : {}), ...(opts.container ? { container: opts.container } : {}),
  });
  document.body.append(stack.el);
  const splits = [...stack.el.querySelectorAll<HTMLElement>('.mmdx-split')];
  return { stack, storage, onChange, history, code, meta, a, b, c, splits };
};

afterEach(() => document.body.replaceChildren());

describe('PanelStack', () => {
  it('shows the open panels, with splitters only between visible ones; collapses when empty', () => {
    const { stack, onChange, history, code, meta, a, b, c, splits } = setup();
    expect(stack.el.tagName).toBe('ASIDE');
    expect(stack.el.getAttribute('aria-label')).toBe('Panels');
    expect(stack.el.getAttribute('part')).toBe('panel');
    expect(splits).toHaveLength(2);
    expect(splits[0]!.getAttribute('role')).toBe('separator');
    expect(splits[0]!.getAttribute('aria-orientation')).toBe('horizontal');
    expect(splits[0]!.title).toBe('Drag to resize · double-click to reset');
    expect([a.hidden, b.hidden, c.hidden]).toEqual([false, true, true]);
    expect(splits.map((s) => s.hidden)).toEqual([true, true]);
    expect(stack.el.classList.contains('open')).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    meta.set(true);
    expect(splits.map((s) => s.hidden)).toEqual([true, false]); // the splitter above Meta, under History
    code.set(true);
    expect(splits.map((s) => s.hidden)).toEqual([false, false]);
    history.set(false);
    code.set(false);
    expect(splits.map((s) => s.hidden)).toEqual([true, true]);
    meta.set(false);
    expect(stack.el.classList.contains('open')).toBe(false);
    expect(stack.width()).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it('a splitter drag sets the lower panel height (clamped, remembered); double-click resets; keys step', () => {
    const { stack, storage, code, b, splits } = setup();
    code.set(true);
    const split = splits[0]!;
    stack.el.getBoundingClientRect = () => ({ height: 600, width: 360 }) as DOMRect;
    b.getBoundingClientRect = () => ({ height: 200 }) as DOMRect;
    pointer(split, 'pointerdown', 0, 300);
    pointer(split, 'pointermove', 0, 250);
    expect(b.style.flex).toBe('0 0 250px');
    pointer(split, 'pointermove', 0, -1000);
    expect(b.style.flex).toBe('0 0 460px'); // leaves 140 px above
    pointer(split, 'pointerup', 0, -1000);
    expect(storage.get('diff.left.h')).toEqual({ code: 460 });
    expect(split.getAttribute('aria-valuenow')).toBe('460');
    key(split, 'ArrowDown');
    expect(b.style.flex).toBe('0 0 444px');
    expect(storage.get('diff.left.h')).toEqual({ code: 444 });
    split.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(b.style.flex).toBe('');
    expect(storage.get('diff.left.h')).toBeUndefined();
  });

  it('restores remembered heights (only under a visible splitter) and width', () => {
    const { stack, code, history, b } = setup({ saved: { 'diff.left.h': { code: 222 }, 'diff.left.w': 480 } });
    expect(stack.el.style.getPropertyValue('--mmdx-stack-w')).toBe('480px');
    expect(b.style.flex).toBe('');
    code.set(true);
    expect(b.style.flex).toBe('0 0 222px');
    history.set(false); // Code alone fills the column
    expect(b.style.flex).toBe('');
    expect(stack.width()).toBe(480);
  });

  it('the inner-edge grip resizes the shared width (remembered)', () => {
    const { stack, storage, onChange } = setup();
    expect(stack.el.style.getPropertyValue('--mmdx-stack-w')).toBe('360px');
    const grip = stack.el.querySelector<HTMLElement>(':scope > .mmdx-grip')!;
    expect(grip.title).toBe('Drag to resize · double-click to reset');
    key(grip, 'ArrowRight');
    expect(stack.el.style.getPropertyValue('--mmdx-stack-w')).toBe('376px');
    expect(storage.get('diff.left.w')).toBe(376);
    expect(onChange).toHaveBeenCalled();
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(storage.get('diff.left.w')).toBeUndefined();
    expect(stack.el.style.getPropertyValue('--mmdx-stack-w')).toBe('360px');
  });

  it('drawer form: one panel at a time (the one opened last), no inset', () => {
    const { stack, code, meta, a, b, c, splits } = setup();
    code.set(true);
    stack.setDrawer(true);
    expect(stack.drawer).toBe(true);
    expect(stack.el.classList.contains('drawer')).toBe(true);
    expect([a.hidden, b.hidden, c.hidden]).toEqual([true, false, true]);
    expect(splits.every((s) => s.hidden)).toBe(true);
    expect(stack.width()).toBe(0);
    meta.set(true);
    expect([a.hidden, b.hidden, c.hidden]).toEqual([true, true, false]);
    meta.set(false);
    expect([a.hidden, b.hidden, c.hidden]).toEqual([true, false, true]);
    stack.setDrawer(false);
    expect([a.hidden, b.hidden, c.hidden]).toEqual([false, false, true]);
  });

  it('the drawer follows the container width (ResizeObserver); destroy() disconnects', () => {
    let cb: ResizeObserverCallback | null = null;
    const disconnect = vi.fn();
    const RO = vi.fn(function (this: unknown, f: ResizeObserverCallback) {
      cb = f;
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect };
    });
    vi.stubGlobal('ResizeObserver', RO);
    try {
      const container = h('div');
      container.getBoundingClientRect = () => ({ width: 500 }) as DOMRect;
      const { stack, history } = setup({ drawerBelow: 720, container });
      expect(stack.drawer).toBe(true);
      cb!([{ contentRect: { width: 1000 } } as ResizeObserverEntry], {} as ResizeObserver);
      expect(stack.drawer).toBe(false);
      stack.destroy();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(stack.el.isConnected).toBe(false);
      history.set(false);
      expect(stack.el.classList.contains('open')).toBe(true); // effects released
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('works without ResizeObserver (jsdom) and update() replaces the panels', () => {
    const { stack, a } = setup({ drawerBelow: 720, container: h('div') });
    expect(stack.drawer).toBe(false);
    const x = panel('Only');
    stack.update({ panels: [{ id: 'only', panel: x, open: true }] });
    expect(a.isConnected).toBe(false);
    expect(x.isConnected).toBe(true);
    expect(stack.el.querySelectorAll('.mmdx-split')).toHaveLength(0);
  });
});
