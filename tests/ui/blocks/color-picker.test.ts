// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createColorPicker, openColorPicker, placeFixed } from '../../../src/ui/blocks/color-picker.js';
import { PopoverManager } from '../../../src/ui/kit/popover.js';

const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));
const COLORS = [{ name: 'red', value: '#ff0000' }, { name: 'green', value: '#00ff00' }, { name: 'blue', value: '#0000ff' }];
const labels = { paletteLabel: 'Palette', customLabel: 'custom', noneLabel: 'None' };
const rect = (x: number, y: number, w: number, hh: number): DOMRect => ({ left: x, top: y, right: x + w, bottom: y + hh, width: w, height: hh, x, y, toJSON: () => ({}) });

afterEach(() => document.body.replaceChildren());

describe('ColorPicker', () => {
  it('a dialog of swatches (the current one pressed), a custom colour and None', () => {
    const onPick = vi.fn();
    const p = createColorPicker({ label: 'Choose a colour for Fill', colors: COLORS, value: '@green', custom: '#123456', onPick, ...labels });
    document.body.append(p.el);
    expect(p.el.getAttribute('role')).toBe('dialog');
    expect(p.el.getAttribute('aria-label')).toBe('Choose a colour for Fill');
    const sw = [...p.el.querySelectorAll<HTMLButtonElement>('.mmdx-cp-sw')];
    expect(sw.map((b) => b.getAttribute('aria-label'))).toEqual(['red', 'green', 'blue']);
    expect(sw.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(p.el.querySelector('[role=group]')!.getAttribute('aria-label')).toBe('Palette');
    sw[0]!.click();
    expect(onPick).toHaveBeenLastCalledWith('@red', true);
    const custom = p.el.querySelector<HTMLInputElement>('input[type=color]')!;
    expect(custom.value).toBe('#123456');
    custom.value = '#abcdef';
    custom.dispatchEvent(new Event('change'));
    expect(onPick).toHaveBeenLastCalledWith('#abcdef', false);
    p.el.querySelector<HTMLButtonElement>('.mmdx-cp-none')!.click();
    expect(onPick).toHaveBeenLastCalledWith('none', true);
  });

  it('arrow keys move through the swatches with one tab stop (the current colour)', () => {
    const p = createColorPicker({ label: 'C', colors: COLORS, value: '@blue', onPick: () => undefined, ...labels });
    document.body.append(p.el);
    const sw = [...p.el.querySelectorAll<HTMLButtonElement>('.mmdx-cp-sw')];
    expect(sw.map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
    sw[2]!.focus();
    key(sw[2]!, 'ArrowRight');
    expect(document.activeElement).toBe(sw[0]);
    key(sw[0]!, 'End');
    expect(document.activeElement).toBe(sw[2]);
  });

  it('openColorPicker opens through the PopoverManager; a swatch closes it and the focus returns to the opener', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const opener = document.createElement('button');
    root.append(opener);
    const pops = new PopoverManager(root);
    const onPick = vi.fn();
    openColorPicker({ popovers: pops, opener, label: 'C', colors: COLORS, onPick, ...labels });
    const el = root.querySelector<HTMLElement>('.mmdx-color-picker')!;
    expect(el).not.toBeNull();
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect(el.style.top).not.toBe('');
    el.querySelector<HTMLButtonElement>('.mmdx-cp-sw')!.click();
    expect(onPick).toHaveBeenCalledWith('@red', true);
    expect(root.querySelector('.mmdx-color-picker')).toBeNull();
    expect(root.activeElement).toBe(opener);
    // the same opener toggles it
    openColorPicker({ popovers: pops, opener, label: 'C', colors: COLORS, onPick, ...labels });
    openColorPicker({ popovers: pops, opener, label: 'C', colors: COLORS, onPick, ...labels });
    expect(root.querySelector('.mmdx-color-picker')).toBeNull();
  });

  it('placeFixed: below the anchor, above it when there is no room, inside the viewport', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 240 });
    Object.defineProperty(el, 'offsetHeight', { value: 200 });
    placeFixed(el, rect(100, 100, 26, 22));
    expect([el.style.left, el.style.top]).toEqual(['100px', '126px']);
    placeFixed(el, rect(innerWidth - 20, innerHeight - 40, 26, 22));
    expect(el.style.left).toBe(`${innerWidth - 248}px`);
    expect(el.style.top).toBe(`${innerHeight - 40 - 4 - 200}px`);
  });
});
