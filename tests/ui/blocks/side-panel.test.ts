// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSidePanel } from '../../../src/ui/blocks/side-panel.js';
import { createTabs } from '../../../src/ui/blocks/tabs.js';
import { h } from '../../../src/ui/h.js';
import { signal } from '../../../src/reactive/signal.js';

const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
const pointer = (el: Element, type: string, clientX: number, clientY = 0): void => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  el.dispatchEvent(ev);
};

afterEach(() => document.body.replaceChildren());

describe('SidePanel', () => {
  it('renders a labelled section with a heading, actions, a close button with the shortcut, and the body', () => {
    const onClose = vi.fn();
    const body = h('div', { class: 'content' }, 'rows');
    const action = h('button', { class: 'new' }, '+ New layer');
    const p = createSidePanel({ side: 'right', title: 'Layers', label: 'Layers', closeLabel: 'Close Layers', closeKeys: 'l', onClose, body, actions: [action], part: 'panel', class: 'layers' });
    document.body.append(p.el);
    expect(p.el.tagName).toBe('SECTION');
    expect(p.el.getAttribute('aria-label')).toBe('Layers');
    expect(p.el.getAttribute('part')).toBe('panel');
    expect(p.el.classList.contains('mmdx-panel')).toBe(true);
    expect(p.el.classList.contains('layers')).toBe(true);
    expect(p.el.dataset['side']).toBe('right');
    const heading = p.el.querySelector('[role=heading]')!;
    expect(heading.textContent).toBe('Layers');
    expect(heading.getAttribute('aria-level')).toBe('2');
    expect(p.el.querySelector('.mmdx-panel-head .new')).toBe(action);
    const close = p.el.querySelector<HTMLButtonElement>('.mmdx-panel-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close Layers');
    expect(close.title).toBe('Close Layers (L)');
    expect(close.getAttribute('aria-keyshortcuts')).toBe('l');
    close.click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(p.bodyEl.firstElementChild).toBe(body);
    expect(p.el.querySelector('.mmdx-grip')).toBeNull();
  });

  it('a head element (tabs) replaces the title; no close button without onClose; update() re-renders', () => {
    const tabs = createTabs({ label: 'Code', tabs: [{ value: 'code', label: 'Mermaid' }, { value: 'meta', label: 'Metadata' }], value: 'code', onChange: vi.fn() });
    const p = createSidePanel({ side: 'left', head: tabs.el, label: 'Code', closeLabel: 'Close', body: h('div') });
    expect(p.el.querySelector('[role=tablist]')).toBe(tabs.el);
    expect(p.el.querySelector('[role=heading]')).toBeNull();
    expect(p.el.querySelector('.mmdx-panel-close')).toBeNull();
    p.update({ head: undefined as unknown as HTMLElement, title: 'Mermaid code' });
    expect(p.el.querySelector('[role=heading]')?.textContent).toBe('Mermaid code');
  });

  it('the grip resizes the width signal: drag (clamped), keys, double-click reset; commits', () => {
    const width = signal<number | null>(null);
    const onCommit = vi.fn();
    const p = createSidePanel({ side: 'left', title: 'Code', label: 'Code', closeLabel: 'Close', body: h('div'), resizable: { width, min: 200, max: () => 500, onCommit, title: 'Drag to resize' } });
    document.body.append(p.el);
    const grip = p.el.querySelector<HTMLElement>('.mmdx-grip')!;
    expect(grip.getAttribute('role')).toBe('separator');
    expect(grip.getAttribute('aria-orientation')).toBe('vertical');
    expect(grip.title).toBe('Drag to resize');
    expect(grip.tabIndex).toBe(0);
    p.el.getBoundingClientRect = () => ({ width: 300 }) as DOMRect;
    pointer(grip, 'pointerdown', 100);
    pointer(grip, 'pointermove', 150);
    expect(width.peek()).toBe(350);
    expect(p.el.style.width).toBe('350px');
    pointer(grip, 'pointermove', 1000);
    expect(width.peek()).toBe(500);
    pointer(grip, 'pointerup', 1000);
    expect(onCommit).toHaveBeenCalledOnce();
    pointer(grip, 'pointermove', 0); // released: no effect
    expect(width.peek()).toBe(500);
    key(grip, 'ArrowLeft');
    expect(width.peek()).toBe(484);
    expect(grip.getAttribute('aria-valuenow')).toBe('484');
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(width.peek()).toBeNull();
    expect(p.el.style.width).toBe('');
    expect(onCommit).toHaveBeenCalledTimes(3);
    // the right side grows leftwards
    const w2 = signal<number | null>(300);
    const r = createSidePanel({ side: 'right', label: 'x', closeLabel: 'x', body: h('div'), resizable: { width: w2, min: 100, max: () => 900, title: '' } });
    key(r.el.querySelector('.mmdx-grip')!, 'ArrowLeft');
    expect(w2.peek()).toBe(316);
  });

  it('destroy() releases the listeners and the width effect', () => {
    const width = signal<number | null>(300);
    const onClose = vi.fn();
    const p = createSidePanel({ side: 'left', title: 'x', label: 'x', closeLabel: 'x', onClose, body: h('div'), resizable: { width, min: 100, max: () => 900, title: '' } });
    document.body.append(p.el);
    const grip = p.el.querySelector<HTMLElement>('.mmdx-grip')!;
    const close = p.el.querySelector<HTMLElement>('.mmdx-panel-close')!;
    p.destroy();
    expect(p.el.isConnected).toBe(false);
    width.set(400);
    expect(p.el.style.width).toBe('300px');
    key(grip, 'ArrowRight');
    expect(width.peek()).toBe(400);
    close.click();
    expect(onClose).not.toHaveBeenCalled();
  });
});
