// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDisclosure } from '../../../src/ui/blocks/disclosure.js';
import { h } from '../../../src/ui/h.js';
import { signal } from '../../../src/reactive/signal.js';

afterEach(() => document.body.replaceChildren());

describe('Disclosure', () => {
  it('a plain open state: the head toggles the body, which is filled once, on first open', () => {
    const fill = vi.fn((body: HTMLElement) => body.append(h('p', null, 'content')));
    const d = createDisclosure({ title: 'Palette', open: false, fill, badge: '2 changed', headClass: 'te-card-head', headAttrs: { 'data-card': 'palette' } });
    document.body.append(d.el);
    expect(d.head.getAttribute('aria-expanded')).toBe('false');
    expect(d.head.getAttribute('aria-controls')).toBe(d.body.id);
    expect(d.head.dataset['card']).toBe('palette');
    expect(d.head.classList.contains('te-card-head')).toBe(true);
    expect(d.head.querySelector('.mmdx-disclosure-badge')!.textContent).toBe('2 changed');
    expect(d.body.hidden).toBe(true);
    expect(fill).not.toHaveBeenCalled();
    d.head.click();
    expect(d.isOpen()).toBe(true);
    expect(d.body.hidden).toBe(false);
    expect(d.head.getAttribute('aria-expanded')).toBe('true');
    expect(d.body.textContent).toBe('content');
    d.head.click();
    d.head.click();
    expect(fill).toHaveBeenCalledOnce();
  });

  it('a signal open state: the host flips it in onToggle; no badge hides it', () => {
    const open = signal(true);
    const onToggle = vi.fn((v: boolean) => open.set(v));
    const d = createDisclosure({ title: 'Page', open, onToggle, fill: (b) => b.append('x'), id: 'page-body' });
    expect(d.body.id).toBe('page-body');
    expect(d.body.textContent).toBe('x');
    expect(d.head.querySelector<HTMLElement>('.mmdx-disclosure-badge')!.hidden).toBe(true);
    d.head.click();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(d.body.hidden).toBe(true);
    open.set(true);
    expect(d.body.hidden).toBe(false);
    expect(d.head.querySelector('.mmdx-disclosure-caret')!.textContent).toBe('▾');
  });

  it('the fill does not subscribe the block to the signals it reads; destroy stops it', () => {
    const other = signal(0);
    const fill = vi.fn(() => void other());
    const open = signal(true);
    const d = createDisclosure({ title: 'T', open, onToggle: (v) => open.set(v), fill });
    other.set(1);
    expect(fill).toHaveBeenCalledOnce();
    // update() replaces the body: filled again when shown
    d.update({ title: 'U' });
    expect(fill).toHaveBeenCalledTimes(2);
    expect(d.head.textContent).toContain('U');
    const onToggle = vi.fn();
    d.update({ onToggle });
    d.destroy();
    d.head.click();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
