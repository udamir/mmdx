// What every popover filler of the style toolbar gets, and the colour pickers several of them share.
import { h } from '../../h.js';
import { accentHex, isHex6, isNone, localColors, popLabel, swatches } from '../../toolbar-kit.js';
import type { StyleCtx } from '../controls.js';
import { str } from '../controls.js';
import { svgIcon } from '../icons.js';
import type { KindSpec, ToolbarControl } from '../types.js';

export interface Fill {
  pop: HTMLElement;
  name: ToolbarControl;
  sp: KindSpec;
  x: StyleCtx;
  /** The selected item's kind ('' without one). */
  kind: string;
  /** Re-fills the popover in place (multi-step pickers). */
  again(): void;
  /** Closes the popover after a pick (single-choice pickers) and rebuilds the bar. */
  done(): void;
}

/** Fills the popover of one or more controls. */
export type Filler = (f: Fill) => void;

/**
 * Colours come from the theme palette and are stored as references ("@lime"), so they follow theme switches; in the
 * editor "+" keeps a new colour in the diagram's own palette, in the theme editor a custom colour is stored relative
 * to its nearest palette colour (api.customColor).
 */
export function colors(f: Fill, current: unknown, pick: (c: string) => void, allowNone: boolean): void {
  const { pop, x } = f;
  const { t, api } = x;
  const cur = str(current).toLowerCase();
  pop.append(popLabel(t('tb.themePalette')), swatches({
    label: t('tb.themePalette'), cur, colors: api.palette(), pick,
    ...(allowNone ? { none: { label: t('tb.none'), on: isNone(cur), pick: () => pick('none') } } : {}),
  }));
  const add = api.addLocalColor;
  if (add) {
    // the diagram editor: "+" adds to the diagram's palette
    const remove = api.removeLocalColor;
    pop.append(...localColors({
      t, cur, colors: api.localPalette?.() ?? [], pick, add: (hex) => add(hex), again: () => f.again(), plus: svgIcon('plus'), start: accentHex(x.bar),
      ...(remove ? { remove: (name: string) => remove(name) } : {}),
    }));
    return;
  }
  const custom = api.customColor;
  if (!custom) return;
  // the theme editor (no diagram palette): a free colour, stored relative to the nearest palette colour
  const ci = h('input', { type: 'color', 'aria-label': t('tb.customColor') });
  ci.value = isHex6(cur) ? cur : accentHex(x.bar);
  ci.addEventListener('change', () => pick(custom(ci.value)));
  pop.append(h('label', { class: 'mtb-custom' }, ci, ` ${t('tb.customColor')}`));
}
