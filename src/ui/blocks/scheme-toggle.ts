// SchemeToggle (§5.2): the light / dark chrome toggle — a radio group of a sun and a moon. Replaces the `vp-mode`
// toggle of `editor/modules/chrome/view-params.ts`. Only the chrome changes; the host stores the choice. The checked
// radio is the one in the Tab order; arrow keys switch.
import { h, icon } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { I_moon, I_sun } from '../kit/icons.js';
import { BLOCK_MESSAGES_CHROME } from '../messages/blocks.js';
import { defineBlock, read, type BlockHandle, type Translate, type Value } from './block.js';
import { rovingKeys } from '../kit/focus.js';

export type Scheme = 'light' | 'dark';

export interface SchemeToggleProps {
  scheme: Value<Scheme>;
  onChange: (scheme: Scheme) => void;
  t: Translate;
}

export const SCHEME_TOGGLE_CSS = /* css */ `
.vp-mode { display: flex; gap: 2px; background: var(--mmdx-float-2); border-radius: 9px; padding: 2px; }
.vp-mode button { border: 0; background: none; width: 32px; height: 28px; padding: 0; display: grid; place-items: center; border-radius: 7px; color: var(--mmdx-muted); }
.vp-mode button[aria-checked=true] { background: var(--mmdx-float); color: var(--mmdx-text); box-shadow: var(--mmdx-shadow-raised); }
`;

export function createSchemeToggle(props: SchemeToggleProps): BlockHandle<SchemeToggleProps> {
  registerMessages(BLOCK_MESSAGES_CHROME);
  return defineBlock(props, (p, scope) => {
    const radio = (v: Scheme, path: string): HTMLButtonElement => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-ui': v, 'data-f': `scheme-${v}` }, icon(path, 17));
      scope.on(b, 'click', () => {
        if (read(p.scheme) !== v) p.onChange(v);
      });
      return b;
    };
    const light = radio('light', I_sun);
    const dark = radio('dark', I_moon);
    const el = h('div', { class: 'vp-mode', role: 'radiogroup' }, light, dark);

    // arrows pick the other scheme (two radios: every arrow toggles) and move the focus with it
    const keys = rovingKeys(el, { orientation: 'both', selector: '[role=radio]', select: true });
    scope.add(() => keys.destroy());

    const render = (): void => {
      const { t } = p;
      el.setAttribute('aria-label', t('ui.appearance'));
      for (const [b, label] of [[light, t('ui.light')], [dark, t('ui.dark')]] as const) {
        b.title = label;
        b.setAttribute('aria-label', label);
      }
      const fx = scope.renew();
      const scheme = p.scheme;
      fx.effect(() => {
        const v = read(scheme);
        for (const b of [light, dark]) {
          const on = b.dataset['ui'] === v;
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
        }
      });
    };
    return { el, render };
  });
}
