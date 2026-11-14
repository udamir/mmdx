// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h } from '../../src/ui/kit/h.js';
import { choiceRow, createPopHost, slider, swatches } from '../../src/ui/kit/toolbar-kit.js';

afterEach(() => document.body.replaceChildren());

describe('toolbar kit', () => {
  it('the popover host: one popover at a time, toggled by its button, closed by Esc (focus back) and outside clicks', () => {
    const host = h('div');
    document.body.append(host);
    const btn = h('button', { class: 'mtb-btn', 'data-c': 'a', 'aria-label': 'A' });
    const bar = h('div', null, h('div', { class: 'mtb-seg' }, btn));
    host.append(bar);
    const pops = createPopHost({ host, bar });
    const fill = vi.fn((pop: HTMLElement) => pop.append(h('button', { role: 'menuitem' }, 'one'), h('button', { role: 'menuitem' }, 'two')));
    pops.toggle('a', btn, fill, { focusIn: false });
    expect(pops.open).toBe('a');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const pop = pops.pop()!;
    expect(pop.getAttribute('aria-label')).toBe('A');
    const [one, two] = [...pop.querySelectorAll<HTMLElement>('[role=menuitem]')];
    one!.focus();
    one!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(two);
    two!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true }));
    expect(pops.open).toBeNull();
    expect(document.activeElement).toBe(btn);
    pops.toggle('a', btn, fill, { focusIn: false });
    pops.toggle('a', btn, fill, { focusIn: false });
    expect(pops.pop()).toBeNull();
    pops.toggle('a', btn, fill, { focusIn: false });
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(pops.open).toBeNull();
    pops.destroy();
  });

  it('slider reports live and on release, with a value text; choiceRow and swatches press the current value', () => {
    const onInput = vi.fn(), onChange = vi.fn();
    const el = slider({ label: 'Opacity', value: 0.5, min: 0, max: 1, step: 0.1, fmt: (v) => `${v * 100}%`, onInput, onChange });
    const r = el.querySelector('input')!;
    expect(r.getAttribute('aria-valuetext')).toBe('50%');
    r.value = '0.2';
    r.dispatchEvent(new Event('input'));
    r.dispatchEvent(new Event('change'));
    expect(onInput).toHaveBeenCalledWith(0.2);
    expect(onChange).toHaveBeenCalledWith(0.2);
    expect(el.querySelector('.mtb-val')!.textContent).toBe('20%');

    const pick = vi.fn();
    const row = choiceRow(['a', 'b'], 'b', pick, () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'), (v) => `Name ${v}`);
    const bs = row.querySelectorAll('button');
    expect([...bs].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(bs[0]!.getAttribute('aria-label')).toBe('Name a');
    bs[0]!.click();
    expect(pick).toHaveBeenCalledWith('a');

    const g = swatches({ label: 'Palette', cur: '@sky', colors: [{ name: 'lime', value: '#d4e63a' }, { name: 'sky', value: '#bfe0ff' }], pick, none: { label: 'None', on: false, pick: () => pick('none') } });
    expect([...g.querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    g.querySelectorAll('button')[1]!.click();
    expect(pick).toHaveBeenLastCalledWith('@lime');
  });
});
