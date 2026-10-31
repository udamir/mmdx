// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ariaKeys, tipText } from '../../../src/ui/blocks/block.js';
import { createIconButton, createToggleButton } from '../../../src/ui/blocks/button.js';
import { signal } from '../../../src/ui/signal.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('IconButton', () => {
  it('labels, tooltips with the shortcut, aria-keyshortcuts and click', () => {
    const onClick = vi.fn();
    const b = createIconButton({ icon: 'M0 0h1', label: 'Hand', keys: 'shift+h', onClick, class: 'vt-tool', f: 'hand' });
    expect(b.el.getAttribute('aria-label')).toBe('Hand');
    expect(b.el.title).toBe('Hand (Shift+H)'); // the registry's formatKeys by default
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

  it('update() replaces the label, icon, shortcut and attributes; a custom format and tip win', () => {
    const b = createIconButton({ icon: 'M0 0h1', label: 'Undo', keys: 'mod+z', attrs: { 'data-x': '1' } });
    expect(b.el.title).toBe('Undo (Ctrl+Z)');
    b.update({ label: 'Redo', keys: 'mod+shift+z', attrs: { 'data-x': undefined }, icon: null, text: 'R' });
    expect(b.el.getAttribute('aria-label')).toBe('Redo');
    expect(b.el.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+z');
    expect(b.el.hasAttribute('data-x')).toBe(false);
    expect(b.el.querySelector('svg')).toBeNull();
    b.update({ keys: 'r', formatKeys: (k) => `<${k}>` });
    expect(b.el.title).toBe('Redo (<r>)');
    b.update({ tip: 'Custom', tooltip: 'none' });
    expect(b.el.title).toBe('');
    expect(b.el.hasAttribute('data-tip')).toBe(false);
  });
});

describe('ToggleButton', () => {
  it('is an IconButton whose pressed state follows its signal', () => {
    const pressed = signal(true);
    const b = createToggleButton({ icon: 'M0 0h1', label: 'Pen', pressed, onClick: () => pressed.set(!pressed.peek()) });
    expect(b.el.getAttribute('aria-pressed')).toBe('true');
    b.el.click();
    expect(b.el.getAttribute('aria-pressed')).toBe('false');
    expect(b.el.classList.contains('on')).toBe(false);
  });
});

describe('ariaKeys and tipText', () => {
  it('mod is Control elsewhere and Meta on Apple platforms; named keys use their key names; alternatives are spaced', () => {
    expect(ariaKeys('mod+shift+z')).toBe('Control+Shift+z');
    expect(ariaKeys('escape')).toBe('Escape');
    expect(ariaKeys('arrowup')).toBe('ArrowUp');
    expect(ariaKeys(['delete', 'mod+x'])).toBe('Delete Control+x');
    expect(tipText('Undo', 'mod+z')).toBe('Undo (Ctrl+Z)');
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
    expect(ariaKeys('mod+z')).toBe('Meta+z');
    expect(tipText('Undo', 'mod+z')).toBe('Undo (⌘Z)');
  });
});
