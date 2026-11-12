// IconButton and ToggleButton (§5.2): an icon (or short text) button with an accessible name, a tooltip that
// mirrors the label with its shortcut, and an optional pressed state. Pressed, disabled and hidden can follow
// signals.
import { h, icon as svgIcon } from '../kit/h.js';
import { ariaKeys, defineBlock, read, tipText, type BlockHandle, type Value } from './block.js';

export interface IconButtonProps {
  /** Icon path (24 × 24 viewBox), or null for a text button. */
  icon: string | null;
  label: string;
  /** Shortcut (registry form, `shift+h`), shown in the tooltip and as `aria-keyshortcuts`. */
  keys?: string;
  /** Formats `keys` for the tooltip (default: the registry's `formatKeys`, `⇧H` / `Shift+H`). */
  formatKeys?: (keys: string) => string;
  /** Visible text (after the icon, or alone). */
  text?: string;
  iconSize?: number;
  /** `title` (native tooltip, default) or `tip` (the CSS tooltip of `data-tip`, placed by the toolbar). */
  tooltip?: 'title' | 'tip' | 'none';
  /** Overrides the tooltip text (default: the label with its shortcut). */
  tip?: string;
  /** ToggleButton: `aria-pressed` and the `on` class follow it. */
  pressed?: Value<boolean>;
  disabled?: Value<boolean>;
  hidden?: Value<boolean>;
  class?: string;
  /** Focus key kept across re-renders (`data-f`). */
  f?: string;
  attrs?: Record<string, string | undefined>;
  onClick?: (ev: MouseEvent) => void;
}

export interface IconButtonHandle extends BlockHandle<IconButtonProps> {
  readonly el: HTMLButtonElement;
}

export function createIconButton(props: IconButtonProps): IconButtonHandle {
  return defineBlock(props, (p, scope) => {
    const el = h('button', { type: 'button' });
    scope.on(el, 'click', (ev: MouseEvent) => p.onClick?.(ev));

    const render = (): void => {
      const effects = scope.renew();
      el.className = ['mmdx-btn', p.class].filter(Boolean).join(' ');
      el.replaceChildren(...[p.icon ? svgIcon(p.icon, p.iconSize ?? 16) : null, p.text ?? null].filter((x): x is SVGElement | string => x !== null));
      el.setAttribute('aria-label', p.label);
      const tip = p.tip ?? tipText(p.label, p.keys, p.formatKeys);
      el.removeAttribute('title');
      el.removeAttribute('data-tip');
      if ((p.tooltip ?? 'title') === 'title') el.title = tip;
      else if (p.tooltip === 'tip') el.setAttribute('data-tip', tip);
      if (p.keys) el.setAttribute('aria-keyshortcuts', ariaKeys(p.keys));
      else el.removeAttribute('aria-keyshortcuts');
      if (p.f) el.setAttribute('data-f', p.f);
      for (const [k, v] of Object.entries(p.attrs ?? {})) {
        if (v === undefined) el.removeAttribute(k);
        else el.setAttribute(k, v);
      }
      const pressed = p.pressed;
      if (pressed !== undefined)
        effects.effect(() => {
          const on = read(pressed);
          el.classList.toggle('on', on);
          el.setAttribute('aria-pressed', String(on));
        });
      const disabled = p.disabled;
      if (disabled !== undefined) effects.effect(() => void (el.disabled = read(disabled)));
      const hidden = p.hidden;
      if (hidden !== undefined) effects.effect(() => void (el.hidden = read(hidden)));
    };
    return { el, render };
  });
}

/** ToggleButton (§5.2): an IconButton whose `pressed` is required (`aria-pressed` and the `on` class follow it). */
export function createToggleButton(props: IconButtonProps & { pressed: Value<boolean> }): IconButtonHandle {
  return createIconButton(props);
}
