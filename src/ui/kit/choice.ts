// Choice groups (X16): the one wiring of a set of buttons of which one is chosen — Segmented (pressed buttons), Tabs (a tab list) and SchemeToggle (a radio group); the emoji picker's group tabs are Tabs. The block builds its buttons (each carries its value in a `data-*` attribute) and its ARIA roles; the group makes a click choose, keeps the state attribute on the chosen one and, for the tab and radio patterns, the arrow keys and the roving tab stop.
import { read, type Value } from '../blocks/block.js';
import type { Owner } from '../../reactive/owner.js';
import { rovingKeys, type Orientation } from './focus.js';

export interface ChoiceGroupOptions {
  /** The attribute that marks the chosen button (`aria-pressed`, `aria-selected`, `aria-checked`). */
  state: 'aria-pressed' | 'aria-selected' | 'aria-checked';
  /** The `data-*` key (dataset name) holding each button's value. */
  key: string;
  /** The tab and radio patterns: arrow keys move and choose (`rovingKeys` with `select`), the chosen button is the only tab stop. */
  arrows?: { orientation: Orientation; selector: string };
  /** A click on the chosen button calls `onChange` again (Segmented); else only another value does. */
  repeat?: boolean;
  /** The chosen button also gets the `on` class (Segmented). */
  onClass?: boolean;
}

export interface ChoiceGroup<V extends string> {
  /** Wires one render's buttons in `fx` (the render's scope): a click chooses its value, the state follows `value`; `also` runs with each value (a select kept in step). */
  bind(fx: Owner, buttons: readonly HTMLElement[], value: Value<V>, onChange: (v: V) => void, also?: (v: V) => void): void;
}

/** A choice group over `el`; with `arrows`, its key handler lives as long as `scope`. */
export function createChoiceGroup<V extends string>(el: HTMLElement, scope: Owner, o: ChoiceGroupOptions): ChoiceGroup<V> {
  const arrows = o.arrows;
  if (arrows) {
    const keys = rovingKeys(el, { orientation: arrows.orientation, selector: arrows.selector, select: true });
    scope.add(() => keys.destroy());
  }
  return {
    bind(fx, buttons, value, onChange, also) {
      for (const b of buttons) {
        fx.on(b, 'click', () => {
          const v = b.dataset[o.key] as V;
          if (o.repeat || read(value) !== v) onChange(v);
        });
      }
      fx.effect(() => {
        const v = read(value);
        for (const b of buttons) {
          const on = b.dataset[o.key] === v;
          if (o.onClass) b.classList.toggle('on', on);
          b.setAttribute(o.state, String(on));
          if (arrows) b.tabIndex = on ? 0 : -1;
        }
        also?.(v);
      });
    },
  };
}
