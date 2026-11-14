// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSegmented } from '../../../src/ui/blocks/segmented.js';
import { signal } from '../../../src/reactive/signal.js';

afterEach(() => document.body.replaceChildren());

describe('Segmented', () => {
  it('buttons and the compact select follow the value; both call onChange', () => {
    const value = signal('merged');
    const onChange = vi.fn((v: string) => value.set(v));
    const seg = createSegmented({ label: 'Views', options: [{ value: 'before', label: 'Before' }, { value: 'merged', label: 'Merged', tip: 'Overlay' }], value, onChange, select: true });
    expect(seg.el.getAttribute('role')).toBe('group');
    expect(seg.el.getAttribute('aria-label')).toBe('Views');
    const buttons = seg.el.querySelectorAll('button');
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]!.dataset['tip']).toBe('Overlay');
    expect(buttons[0]!.className).toBe('view'); // the diff's classes by default
    buttons[0]!.click();
    expect(onChange).toHaveBeenCalledWith('before');
    expect(buttons[0]!.classList.contains('on')).toBe(true);
    const sel = seg.el.querySelector('select')!;
    expect(sel.className).toBe('mmdx-seg-select views');
    expect(sel.value).toBe('before');
    sel.value = 'merged';
    sel.dispatchEvent(new Event('change'));
    expect(value.peek()).toBe('merged');
  });

  it('icon buttons: the icon replaces the label, which becomes the accessible name', () => {
    const icon = (): SVGElement => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const seg = createSegmented({ label: 'Views', options: [{ value: 'a', label: 'Before', icon, tip: 'Before (1)' }], value: 'a', onChange: () => undefined });
    const b = seg.el.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('Before');
    expect(b.textContent).toBe('');
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b.dataset['tip']).toBe('Before (1)');
  });

  it('update() rebuilds the options (classes, disabled) keeping the focus; destroy stops the listeners', () => {
    const onChange = vi.fn();
    const seg = createSegmented({ label: 'S', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], value: 'x', onChange, buttonClass: 'mode', f: 'm' });
    document.body.append(seg.el);
    seg.el.querySelectorAll('button')[1]!.focus();
    seg.update({ options: [{ value: 'x', label: 'X', disabled: true }, { value: 'y', label: 'Y' }] });
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('m-y');
    expect(seg.el.querySelector('button')!.disabled).toBe(true);
    expect(seg.el.querySelectorAll('button')[1]!.className).toBe('mode');
    const y = seg.el.querySelectorAll('button')[1]!;
    seg.destroy();
    y.click();
    expect(onChange).not.toHaveBeenCalled();
  });
});
