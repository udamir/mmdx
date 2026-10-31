// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachPaneResizer, slidePanel } from '../../src/ui/panes.js';

const pointer = (el: Element, type: string, clientX: number): void => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  el.dispatchEvent(ev);
};
const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const setup = (side: 'left' | 'right' = 'left') => {
  const root = document.createElement('div');
  const pane = document.createElement('div');
  Object.defineProperty(pane, 'getBoundingClientRect', { value: () => ({ width: 300 }) });
  root.append(pane);
  document.body.append(root);
  const onResize = vi.fn(), onCommit = vi.fn();
  const off = attachPaneResizer(pane, side, { root, varName: '--left-w', min: 200, max: () => 500, title: 'Drag to resize', onResize, onCommit });
  const grip = pane.querySelector<HTMLElement>('.pane-resizer')!;
  return { root, pane, grip, off, onResize, onCommit };
};

afterEach(() => document.body.replaceChildren());

describe('attachPaneResizer', () => {
  it('adds a focusable separator grip with its title', () => {
    const { grip } = setup();
    expect(grip.getAttribute('role')).toBe('separator');
    expect(grip.getAttribute('aria-orientation')).toBe('vertical');
    expect(grip.title).toBe('Drag to resize');
    expect(grip.tabIndex).toBe(0);
    expect(grip.getAttribute('aria-valuemin')).toBe('200');
  });

  it('drag sets the clamped width on the root; double-click resets it', () => {
    const { root, grip, onResize, onCommit } = setup();
    pointer(grip, 'pointerdown', 100);
    pointer(grip, 'pointermove', 150);
    expect(root.style.getPropertyValue('--left-w')).toBe('350px');
    pointer(grip, 'pointermove', 400);
    expect(root.style.getPropertyValue('--left-w')).toBe('500px');
    expect(root.classList.contains('resizing-panes')).toBe(true);
    pointer(grip, 'pointerup', 400);
    expect(root.classList.contains('resizing-panes')).toBe(false);
    expect(onResize).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(grip.getAttribute('aria-valuenow')).toBe('500');
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(root.style.getPropertyValue('--left-w')).toBe('');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('arrow keys step the width (a right pane grows to the left)', () => {
    const left = setup('left');
    key(left.grip, 'ArrowRight');
    expect(left.root.style.getPropertyValue('--left-w')).toBe('316px');
    expect(left.grip.getAttribute('aria-valuenow')).toBe('316');
    const right = setup('right');
    key(right.grip, 'ArrowLeft');
    expect(right.root.style.getPropertyValue('--left-w')).toBe('316px');
  });

  it('the cleanup removes the grip and its listeners', () => {
    const { root, grip, off } = setup();
    off();
    expect(grip.isConnected).toBe(false);
    key(grip, 'ArrowRight');
    expect(root.style.getPropertyValue('--left-w')).toBe('');
  });
});

describe('slidePanel', () => {
  it('applies at once without animation support (or without an element)', () => {
    const apply = vi.fn();
    slidePanel(null, 'left', true, apply);
    const el = document.createElement('div');
    slidePanel(el, 'right', false, apply);
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
