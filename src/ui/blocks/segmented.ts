// Segmented (§5.2): exclusive buttons (the diff's views, compare / version, the studio's mode switch) with a
// compact `<select>` form that the host's container queries show instead of the buttons on narrow canvases.
import { h } from '../kit/h.js';
import { defineBlock, read, type BlockHandle, type Value } from './block.js';
import { keepFocus } from '../kit/focus.js';

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
  /** Tooltip (`data-tip`, placed by the surrounding toolbar). */
  tip?: string;
  disabled?: boolean;
  /** Icon-only button: the icon replaces the label, which becomes the accessible name. */
  icon?: () => SVGElement;
}

export interface SegmentedProps<V extends string = string> {
  label: string;
  options: readonly SegmentedOption<V>[];
  value: Value<V>;
  onChange: (value: V) => void;
  /** Also render the compact `<select>` (shown by the host's CSS, e.g. `.mmdx-seg-select { display: block }` in a container query). */
  select?: boolean;
  /** Class of each button (default `view`, the diff's). */
  buttonClass?: string;
  /** Class of the select (default `views`). */
  selectClass?: string;
  /** Focus-key prefix (`data-f`). */
  f?: string;
}

export const SEGMENTED_CSS = /* css */ `
.mmdx-seg { display: contents; }
.mmdx-seg-select { display: none; }
`;

export function createSegmented<V extends string>(props: SegmentedProps<V>): BlockHandle<SegmentedProps<V>> {
  return defineBlock(props, (p, scope) => {
    const el = h('span', { class: 'mmdx-seg', role: 'group' });
    const render = (): void => keepFocus(el, () => {
      const fx = scope.renew();
      el.setAttribute('aria-label', p.label);
      const prefix = p.f ?? 'seg';
      const buttons = p.options.map((o) => {
        const b = h('button', {
          type: 'button', class: p.buttonClass ?? 'view', disabled: !!o.disabled, 'data-f': `${prefix}-${o.value}`, 'data-value': o.value,
          ...(o.tip ? { 'data-tip': o.tip } : {}), ...(o.icon ? { 'aria-label': o.label } : {}),
        }, o.icon ? o.icon() : o.label);
        b.addEventListener('click', () => p.onChange(o.value), { signal: fx.signal });
        return b;
      });
      let select: HTMLSelectElement | null = null;
      if (p.select) {
        select = h('select', { class: `mmdx-seg-select ${p.selectClass ?? 'views'}`, 'aria-label': p.label, 'data-f': `${prefix}-select` },
          ...p.options.map((o) => h('option', { value: o.value, disabled: !!o.disabled }, o.label)));
        const s = select;
        s.addEventListener('change', () => p.onChange(s.value as V), { signal: fx.signal });
      }
      el.replaceChildren(...buttons, ...(select ? [select] : []));
      const value = p.value;
      fx.effect(() => {
        const v = read(value);
        for (const b of buttons) {
          const on = b.dataset['value'] === v;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }
        if (select) select.value = v;
      });
    });
    return { el, render };
  });
}
