// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PEN_COLORS, PEN_FADES, PEN_SIZES } from '../../../src/dom/pen.js';
import { createPenOptions, PEN_COLOR_CHOICES, PEN_FADE_CHOICES, PEN_SIZE_CHOICES, type PenSettings } from '../../../src/ui/blocks/pen-options.js';
import { createI18n } from '../../../src/i18n.js';

const { t } = createI18n();

const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

/** A pen whose settings change like the MagicPen's. */
const mockPen = (): PenSettings & { clear: ReturnType<typeof vi.fn> } => {
  const pen = {
    color: PEN_COLORS[0] as string,
    size: PEN_SIZES[1] as number,
    fade: PEN_FADES[0] as number,
    setColor: (c: string) => void (pen.color = c),
    setSize: (s: number) => void (pen.size = s),
    setFade: (ms: number) => void (pen.fade = ms),
    clear: vi.fn(),
  };
  return pen;
};

afterEach(() => document.body.replaceChildren());

describe('PenOptions', () => {
  it('renders colours, sizes, fades and Erase all with names and pressed states', () => {
    const opts = createPenOptions({ pen: mockPen(), t });
    const el = opts.el;
    // a group inside the tool dock's toolbar (no nested toolbar), with one tab stop: the picked colour
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBe('Pen options');
    const colors = el.querySelectorAll<HTMLButtonElement>('.mmdx-pen-color');
    expect(colors).toHaveLength(PEN_COLORS.length);
    expect(colors[0]!.getAttribute('aria-label')).toBe('Pen colour: red');
    expect(colors[0]!.title).toBe('Pen colour: red');
    expect(colors[4]!.getAttribute('aria-label')).toBe('Pen colour: blue');
    expect([...el.querySelectorAll('button')].filter((b) => b.tabIndex === 0)).toEqual([colors[0]]);
    expect(colors[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(colors[0]!.classList.contains('on')).toBe(true);
    expect(colors[0]!.style.getPropertyValue('--c')).toBe(PEN_COLORS[0]);
    const sizes = el.querySelectorAll('.mmdx-pen-size');
    expect(sizes).toHaveLength(PEN_SIZES.length);
    expect(sizes[1]!.getAttribute('aria-label')).toBe(`Thickness ${PEN_SIZES[1]}px`);
    expect(sizes[1]!.getAttribute('aria-pressed')).toBe('true');
    const fades = el.querySelectorAll('.mmdx-pen-fade');
    expect(fades).toHaveLength(PEN_FADES.length);
    expect(fades[0]!.getAttribute('aria-label')).toBe('Auto erase strokes 5 seconds after drawing');
    expect(fades[0]!.textContent).toBe('5s');
    expect(fades[2]!.getAttribute('aria-label')).toBe('Keep');
    expect(fades[2]!.textContent).toBe('∞');
    expect(el.querySelectorAll('.mmdx-pen-sep')).toHaveLength(3);
    expect(el.querySelector('.mmdx-pen-clean')?.getAttribute('aria-label')).toBe('Erase all strokes');
  });

  it('sets the pen and re-renders, keeping the focus on the chosen control', () => {
    const pen = mockPen();
    const opts = createPenOptions({ pen, t });
    document.body.append(opts.el);
    const blue = opts.el.querySelectorAll<HTMLButtonElement>('.mmdx-pen-color')[4]!;
    blue.focus();
    blue.click();
    expect(pen.color).toBe(PEN_COLORS[4]);
    const now = opts.el.querySelectorAll<HTMLButtonElement>('.mmdx-pen-color')[4]!;
    expect(now).not.toBe(blue);
    expect(now.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(now);
    // the size dots take the colour
    expect((opts.el.querySelector('.mmdx-pen-size i') as HTMLElement).style.background).not.toBe('');
    const big = opts.el.querySelectorAll<HTMLButtonElement>('.mmdx-pen-size')[2]!;
    big.click();
    expect(pen.size).toBe(PEN_SIZES[2]);
    const keep = opts.el.querySelectorAll<HTMLButtonElement>('.mmdx-pen-fade')[2]!;
    keep.focus();
    keep.click();
    expect(pen.fade).toBe(0);
    expect(document.activeElement?.getAttribute('data-f')).toBe('fade-0');
    expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');
    (opts.el.querySelector('.mmdx-pen-clean') as HTMLElement).click();
    expect(pen.clear).toHaveBeenCalledOnce();
  });

  it('the default choices are those of the MagicPen (dom/pen.ts)', () => {
    expect(PEN_COLOR_CHOICES.map((c) => c.value)).toEqual([...PEN_COLORS]);
    expect(PEN_SIZE_CHOICES).toEqual([...PEN_SIZES]);
    expect(PEN_FADE_CHOICES).toEqual([...PEN_FADES]);
  });

  it('colours, sizes and fades are props; an unknown colour name is its own name', () => {
    const pen = mockPen();
    const opts = createPenOptions({ pen, t, colors: [{ value: '#123456', name: 'teal' }, { value: PEN_COLORS[0], name: 'red' }], sizes: [3], fades: [0] });
    const colors = opts.el.querySelectorAll('.mmdx-pen-color');
    expect([...colors].map((c) => c.getAttribute('aria-label'))).toEqual(['Pen colour: teal', 'Pen colour: red']);
    expect(opts.el.querySelectorAll('.mmdx-pen-size')).toHaveLength(1);
    expect(opts.el.querySelectorAll('.mmdx-pen-fade')).toHaveLength(1);
  });

  it('refresh() follows changes made elsewhere', () => {
    const pen = mockPen();
    const opts = createPenOptions({ pen, t });
    pen.setSize(PEN_SIZES[0]);
    opts.refresh();
    expect(opts.el.querySelectorAll('.mmdx-pen-size')[0]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('arrow keys move through the choices and stop there', () => {
    const opts = createPenOptions({ pen: mockPen(), t });
    const outer = document.createElement('div');
    const onOuter = vi.fn();
    outer.addEventListener('keydown', onOuter);
    outer.append(opts.el);
    document.body.append(outer);
    const buttons = [...opts.el.querySelectorAll<HTMLButtonElement>('button')];
    buttons[0]!.focus();
    expect(key(buttons[0]!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    key(buttons[1]!, 'End');
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    key(buttons[buttons.length - 1]!, 'ArrowDown');
    expect(document.activeElement).toBe(buttons[0]);
    key(buttons[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    expect(onOuter).not.toHaveBeenCalled();
  });

  it('destroy removes the element and its listeners', () => {
    const pen = mockPen();
    const opts = createPenOptions({ pen, t });
    document.body.append(opts.el);
    const el = opts.el;
    const red = el.querySelectorAll<HTMLButtonElement>('.mmdx-pen-color')[1]!;
    opts.destroy();
    expect(el.isConnected).toBe(false);
    red.click();
    expect(pen.color).toBe(PEN_COLORS[0]);
    document.body.append(el);
    red.focus();
    expect(key(red, 'ArrowDown').defaultPrevented).toBe(false);
  });
});
