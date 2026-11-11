// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIconButton } from '../../../src/ui/blocks/button.js';
import { createToolDock, dockBadge, dockButton } from '../../../src/ui/blocks/tool-dock.js';
import { I_code, I_hand, I_pen, I_pointer, I_redo, I_undo } from '../../../src/ui/icons.js';
import { signal } from '../../../src/ui/signal.js';

const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

afterEach(() => document.body.replaceChildren());

const tools = (): { pointer: HTMLButtonElement; hand: HTMLButtonElement; code: HTMLButtonElement; undo: HTMLButtonElement; redo: HTMLButtonElement } => ({
  pointer: dockButton({ icon: I_pointer, label: 'Select', keys: 'v', f: 'pointer' }).el,
  hand: dockButton({ icon: I_hand, label: 'Hand', keys: 'h', f: 'hand' }).el,
  code: dockButton({ icon: I_code, label: 'Code', keys: 'c', class: 'vt-code', f: 'code' }).el,
  undo: createIconButton({ icon: I_undo, label: 'Undo', iconSize: 19, f: 'undo' }).el,
  redo: createIconButton({ icon: I_redo, label: 'Redo', iconSize: 19, f: 'redo' }).el,
});

describe('dockButton', () => {
  it('is a .vt-tool icon button with a 19 px icon and the shortcut in its title', () => {
    const onClick = vi.fn();
    const b = dockButton({ icon: I_pen, label: 'Pen', keys: 'p', class: 'vt-pen', onClick });
    expect(b.el.classList.contains('vt-tool')).toBe(true);
    expect(b.el.classList.contains('vt-pen')).toBe(true);
    expect(b.el.title).toBe('Pen (P)');
    expect(b.el.getAttribute('aria-label')).toBe('Pen');
    expect(b.el.getAttribute('aria-keyshortcuts')).toBe('p');
    expect(b.el.querySelector('svg')?.getAttribute('width')).toBe('19');
    b.el.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('dockBadge shows the problem count, capped at 99+', () => {
    const b = dockButton({ icon: I_code, label: 'Code', class: 'vt-code' }).el;
    dockBadge(b, 3);
    expect(b.classList.contains('has-issues')).toBe(true);
    expect(b.dataset['issues']).toBe('3');
    dockBadge(b, 120);
    expect(b.dataset['issues']).toBe('99+');
    dockBadge(b, 0);
    expect(b.classList.contains('has-issues')).toBe(false);
  });
});

describe('ToolDock', () => {
  it('renders the tools bar with dividers, the cards and the flyout slot', () => {
    const b = tools();
    const dock = createToolDock({
      label: 'Tools',
      groups: [
        { id: 'tools', items: [b.pointer, b.hand, 'sep', b.code, null] },
        { id: 'undo', label: 'History', items: [b.undo, b.redo], class: 'edit-only' },
      ],
    });
    document.body.append(dock.el);
    expect(dock.el.classList.contains('tool-dock')).toBe(true);
    expect(dock.el.getAttribute('part')).toBe('toolbar');
    const bar = dock.el.querySelector('.view-tools')!;
    expect(bar).toBe(dock.tools);
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect(bar.getAttribute('aria-label')).toBe('Tools');
    expect(bar.getAttribute('aria-orientation')).toBe('vertical');
    expect(bar.querySelectorAll('.vt-tool')).toHaveLength(3);
    expect(bar.querySelectorAll('.vt-divider')).toHaveLength(1);
    expect(bar.querySelector('.vt-divider')?.getAttribute('aria-hidden')).toBe('true');
    const opts = bar.querySelector<HTMLElement>('.vt-opts')!;
    expect(opts.hidden).toBe(true);
    const undo = dock.el.querySelector('.vt-undo')!;
    expect(undo.classList.contains('vt-card')).toBe(true);
    expect(undo.classList.contains('edit-only')).toBe(true);
    expect(undo.getAttribute('role')).toBe('group');
    expect(undo.getAttribute('aria-label')).toBe('History');
    expect(undo.querySelectorAll('button')).toHaveLength(2);
    expect(dock.el.lastElementChild).toBe(undo);
  });

  it('shows the flyout next to the tools and hides it again', () => {
    const b = tools();
    const flyout = document.createElement('div');
    flyout.className = 'my-opts';
    const dock = createToolDock({ label: 'Tools', groups: [{ id: 'tools', items: [b.hand] }], flyout });
    const opts = dock.el.querySelector<HTMLElement>('.view-tools > .vt-opts')!;
    expect(opts.hidden).toBe(false);
    expect(opts.firstElementChild).toBe(flyout);
    dock.setFlyout(null);
    expect(opts.hidden).toBe(true);
    expect(opts.childElementCount).toBe(0);
    dock.update({ flyout });
    expect(opts.hidden).toBe(false);
  });

  it('follows the compact signal', () => {
    const compact = signal(false);
    const dock = createToolDock({ label: 'Tools', groups: [{ id: 'tools', items: [] }], compact });
    expect(dock.el.classList.contains('compact')).toBe(false);
    compact.set(true);
    expect(dock.el.classList.contains('compact')).toBe(true);
  });

  it('moves focus with the arrow keys and keeps it when the groups change', () => {
    const b = tools();
    const dock = createToolDock({ label: 'Tools', groups: [{ id: 'tools', items: [b.pointer, b.hand, 'sep', b.code] }, { id: 'undo', items: [b.undo, b.redo] }] });
    document.body.append(dock.el);
    b.pointer.focus();
    key(b.pointer, 'ArrowDown');
    expect(document.activeElement).toBe(b.hand);
    // new buttons with the same focus keys: the focus follows
    const next = tools();
    dock.update({ groups: [{ id: 'tools', items: [next.pointer, next.hand] }, { id: 'undo', items: [next.undo, next.redo] }] });
    expect(document.activeElement).toBe(next.hand);
    next.redo.focus();
    const again = tools();
    dock.update({ groups: [{ id: 'tools', items: [again.hand] }, { id: 'undo', items: [again.undo, again.redo] }] });
    expect(document.activeElement).toBe(again.redo);
    expect(dock.el.querySelectorAll('.vt-undo')).toHaveLength(1);
  });

  it('keeps pointer events from the canvas behind it', () => {
    const b = tools();
    const dock = createToolDock({ label: 'Tools', groups: [{ id: 'tools', items: [b.hand] }] });
    const canvas = document.createElement('div');
    canvas.append(dock.el);
    document.body.append(canvas);
    const onCanvas = vi.fn();
    canvas.addEventListener('pointerdown', onCanvas);
    b.hand.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onCanvas).not.toHaveBeenCalled();
  });

  it('destroy removes the dock and its listeners', () => {
    const compact = signal(false);
    const b = tools();
    const dock = createToolDock({ label: 'Tools', groups: [{ id: 'tools', items: [b.pointer, b.hand] }], compact });
    const canvas = document.createElement('div');
    canvas.append(dock.el);
    document.body.append(canvas);
    const el = dock.el;
    dock.destroy();
    expect(el.isConnected).toBe(false);
    compact.set(true);
    expect(el.classList.contains('compact')).toBe(false);
    // the tools bar went with it; the pointer guard and the arrow keys are gone
    expect(el.querySelector('.view-tools')).toBeNull();
    canvas.append(el);
    const onCanvas = vi.fn();
    canvas.addEventListener('pointerdown', onCanvas);
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onCanvas).toHaveBeenCalledOnce();
    el.append(b.pointer, b.hand);
    b.pointer.focus();
    expect(key(b.pointer, 'ArrowDown').defaultPrevented).toBe(false);
  });
});
