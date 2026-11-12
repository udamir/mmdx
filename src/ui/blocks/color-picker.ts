// ColorPicker (§5.2): a small dialog with the palette's swatches (a value `@name`), a custom colour (a literal `#hex`)
// and None — opened from a colour chip through the host's PopoverManager (Esc / outside click closes, the focus
// returns to the chip) and placed beside its opener inside the viewport (below it, above when there is no room).
// Arrow keys move through the swatches with one tab stop.
import { h } from '../kit/h.js';
import type { PopoverManager } from '../kit/popover.js';
import { defineBlock, type BlockHandle } from './block.js';
import { rovingKeys } from '../kit/focus.js';

export interface ColorPickerProps {
  /** Accessible name of the dialog ("Choose a colour for Fill"). */
  label: string;
  /** The swatches; picking one gives `@name`. */
  colors: readonly { name: string; value: string }[];
  /** The current value: `@name` presses that swatch. */
  value?: unknown;
  /** The custom colour input's value (#rrggbb; default #888888). */
  custom?: string;
  /** `done`: the picker should close (a swatch or None); the custom input keeps it open. */
  onPick: (value: string, done: boolean) => void;
  paletteLabel: string;
  customLabel: string;
  noneLabel: string;
  class?: string;
}

export const COLOR_PICKER_CSS = /* css */ `
.mmdx-color-picker { position: fixed; z-index: calc(var(--mmdx-z-popover) + 5); width: 240px; box-sizing: border-box; padding: 10px; background: var(--mmdx-float); color: var(--mmdx-text);
  border: 1px solid var(--mmdx-float-line); border-radius: 12px; box-shadow: var(--mmdx-shadow-card); }
.mmdx-cp-title { font-size: 11px; color: var(--mmdx-muted); margin-bottom: 6px; }
.mmdx-cp-grid { display: grid; grid-template-columns: repeat(8, 22px); gap: 5px; }
.mmdx-cp-sw { width: 22px; height: 22px; border-radius: 50%; border: 0; padding: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.mmdx-cp-sw[aria-pressed=true] { box-shadow: 0 0 0 2px var(--mmdx-float), 0 0 0 4px var(--mmdx-accent); }
.mmdx-cp-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; }
.mmdx-cp-row input[type=color] { width: 30px; height: 24px; border: 0; padding: 0; background: none; }
.mmdx-cp-none { margin-left: auto; padding: 2px 8px; font-size: 12px; }
`;

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function createColorPicker(props: ColorPickerProps): BlockHandle<ColorPickerProps> {
  return defineBlock(props, (p, scope) => {
    const el = h('div', { role: 'dialog' });
    const grid = h('div', { class: 'mmdx-cp-grid', role: 'group' });
    const keys = rovingKeys(grid, { orientation: 'both', selector: '.mmdx-cp-sw', roving: true, current: (l) => l.find((b) => b.getAttribute('aria-pressed') === 'true') });
    scope.add(() => keys.destroy());
    const render = (): void => {
      const fx = scope.renew();
      el.className = ['mmdx-color-picker', p.class].filter(Boolean).join(' ');
      el.setAttribute('aria-label', p.label);
      grid.setAttribute('aria-label', p.paletteLabel);
      grid.replaceChildren(...p.colors.map(({ name, value }) => {
        const b = h('button', { type: 'button', class: 'mmdx-cp-sw', title: name, 'aria-label': name, 'aria-pressed': String(p.value === `@${name}`) });
        b.style.background = value;
        fx.on(b, 'click', () => p.onPick(`@${name}`, true));
        return b;
      }));
      const custom = h('input', { type: 'color', 'aria-label': p.customLabel });
      custom.value = isHex(p.custom) ? p.custom : '#888888';
      fx.on(custom, 'change', () => p.onPick(custom.value, false));
      const none = h('button', { type: 'button', class: 'mmdx-cp-none', 'aria-pressed': String(p.value === 'none') }, p.noneLabel);
      fx.on(none, 'click', () => p.onPick('none', true));
      el.replaceChildren(h('div', { class: 'mmdx-cp-title', 'aria-hidden': 'true' }, p.paletteLabel), grid, h('div', { class: 'mmdx-cp-row' }, custom, h('span', { 'aria-hidden': 'true' }, p.customLabel), none));
      keys.sync();
    };
    return { el, render };
  });
}

/** Places a fixed popover below `anchor` (above it when there is no room below), inside the viewport. */
export function placeFixed(el: HTMLElement, anchor: DOMRect, gap = 4, margin = 8): void {
  const vw = typeof innerWidth === 'number' ? innerWidth : 1024, vh = typeof innerHeight === 'number' ? innerHeight : 768;
  const w = el.offsetWidth || 240, ht = el.offsetHeight;
  const below = anchor.bottom + gap;
  const top = below + ht + margin <= vh || anchor.top - gap - ht < margin ? below : anchor.top - gap - ht;
  el.style.left = `${Math.round(Math.max(margin, Math.min(anchor.left, vw - w - margin)))}px`;
  el.style.top = `${Math.round(Math.max(margin, Math.min(top, vh - ht - margin)))}px`;
}

export interface OpenColorPickerOptions extends ColorPickerProps {
  popovers: PopoverManager;
  opener: HTMLElement;
}

/**
 * Opens a ColorPicker beside `opener` (`aria-haspopup=dialog` is the opener's); a swatch or None closes it and the
 * focus returns to the opener. Opening it again from the same opener closes it.
 */
export function openColorPicker(o: OpenColorPickerOptions): void {
  if (o.popovers.isOpenFor(o.opener)) {
    o.popovers.close();
    return;
  }
  const { popovers, opener, ...props } = o;
  const picker = createColorPicker({
    ...props,
    onPick: (v, done) => {
      props.onPick(v, done);
      if (done) popovers.close(true);
    },
  });
  popovers.open(picker.el, opener, { onClose: () => picker.destroy() });
  placeFixed(picker.el, opener.getBoundingClientRect());
}
