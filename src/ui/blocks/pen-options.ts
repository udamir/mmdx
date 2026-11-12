// PenOptions (§5.2): the magic pen's colours, thickness, auto erase and Erase all, as a vertical group that sits in
// the tool dock's flyout. One UI for every product: replaces the editor's flyout (`syncPenOpts` in
// `editor/modules/chrome/tool-dock.ts`) and the viewer / diff popup (`penOptions` in `elements/viewer-popups.ts`).
// Re-renders itself after each change, keeping the focus on the same choice. The choices are props (defaults: the
// values of dom/pen.ts's MagicPen, which a test keeps in step), so the block does not import the pen.
import { h, icon } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { I_eraser } from '../kit/icons.js';
import { BLOCK_MESSAGES_CHROME } from '../messages/blocks.js';
import { defineBlock, type BlockHandle, type Translate } from './block.js';
import { keepFocus, rovingKeys } from '../kit/focus.js';

/** What the pen options read and set (the editor's and viewer's MagicPen, the diff's shared ink). */
export interface PenSettings {
  readonly color: string;
  readonly size: number;
  readonly fade: number;
  setColor(c: string): void;
  setSize(s: number): void;
  setFade(ms: number): void;
  clear(): void;
}

/** A pen colour: its CSS value and its name (`pen.colors.<name>` names it for screen readers; else the name itself). */
export interface PenColor {
  value: string;
  name: string;
}

/** The MagicPen's colours (dom/pen.ts `PEN_COLORS`), named. */
export const PEN_COLOR_CHOICES: readonly PenColor[] = [
  { value: '#ff3b30', name: 'red' }, { value: '#ff9500', name: 'orange' }, { value: '#ffcc00', name: 'yellow' }, { value: '#34c759', name: 'green' },
  { value: '#007aff', name: 'blue' }, { value: '#af52de', name: 'purple' }, { value: '#1a1a1a', name: 'black' },
];
/** Stroke widths in px (dom/pen.ts `PEN_SIZES`). */
export const PEN_SIZE_CHOICES: readonly number[] = [2, 4, 7];
/** Auto-erase delays in ms, 0 = keep (dom/pen.ts `PEN_FADES`). */
export const PEN_FADE_CHOICES: readonly number[] = [5000, 10000, 0];

export interface PenOptionsProps {
  pen: PenSettings;
  t: Translate;
  /** Colours offered (default `PEN_COLOR_CHOICES`). */
  colors?: readonly PenColor[];
  /** Thicknesses offered (default `PEN_SIZE_CHOICES`). */
  sizes?: readonly number[];
  /** Auto-erase delays offered (default `PEN_FADE_CHOICES`). */
  fades?: readonly number[];
}

export interface PenOptionsHandle extends BlockHandle<PenOptionsProps> {
  /** Re-renders from the pen's current settings (after a change made elsewhere). */
  refresh(): void;
}

export const PEN_OPTIONS_CSS = /* css */ `
.mmdx-pen-opts { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.mmdx-pen-opts .mmdx-pen-color { width: 20px; height: 20px; border-radius: 50%; border: 0; padding: 0; background: var(--c); box-shadow: inset 0 0 0 1px var(--mmdx-swatch-ring); }
.mmdx-pen-opts .mmdx-pen-color.on { box-shadow: 0 0 0 2px var(--mmdx-surface), 0 0 0 4px var(--c); margin: 3px 0; }
.mmdx-pen-opts .mmdx-pen-sep { width: 22px; height: 1px; background: var(--mmdx-border); margin: 4px 0; flex: none; }
.mmdx-pen-opts .mmdx-pen-size { width: 26px; height: 26px; border: 0; background: none; padding: 0; display: grid; place-items: center; border-radius: 6px; }
.mmdx-pen-opts .mmdx-pen-size i { display: block; border-radius: 50%; }
.mmdx-pen-opts .mmdx-pen-size:hover { background: var(--mmdx-float-2); }
.mmdx-pen-opts .mmdx-pen-size.on { background: var(--mmdx-accent-2); }
.mmdx-pen-opts .mmdx-pen-fade { width: 30px; height: 24px; border: 0; background: none; padding: 0; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--mmdx-text-2); }
.mmdx-pen-opts .mmdx-pen-fade:hover { background: var(--mmdx-float-2); }
.mmdx-pen-opts .mmdx-pen-fade.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.mmdx-pen-opts .mmdx-pen-clean { width: 30px; height: 28px; border: 0; background: none; padding: 0; display: grid; place-items: center; border-radius: 6px; color: var(--mmdx-text-2); }
.mmdx-pen-opts .mmdx-pen-clean:hover { background: var(--mmdx-danger-bg); color: var(--mmdx-danger); }
`;

export function createPenOptions(props: PenOptionsProps): PenOptionsHandle {
  registerMessages(BLOCK_MESSAGES_CHROME);
  return defineBlock(props, (p, scope) => {
    // a group (not a toolbar: it sits inside the tool dock's toolbar) with its own tab stop, the picked colour
    const el = h('div', { class: 'mmdx-pen-opts', role: 'group' });
    // up / down move through the choices; the keys stop here, so the surrounding toolbar does not move as well
    const keys = rovingKeys(el, { orientation: 'vertical', selector: 'button', roving: true, current: (items) => items.find((b) => b.classList.contains('on')) });
    scope.add(() => keys.destroy());

    const render = (): void => {
      keepFocus(el, renderNow);
      keys.sync();
    };
    const renderNow = (): void => {
      const fx = scope.renew();
      const { pen, t } = p;
      el.setAttribute('aria-label', t('pen.options'));
      const choice = (cls: string, on: boolean, label: string, f: string, run: () => void, ...kids: (Node | string)[]): HTMLButtonElement => {
        const b = h('button', { type: 'button', class: cls + (on ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': String(on), 'data-f': f }, ...kids);
        fx.on(b, 'click', () => {
          run();
          render();
        });
        return b;
      };
      const sep = (): HTMLElement => h('span', { class: 'mmdx-pen-sep', 'aria-hidden': 'true' });
      const kids: HTMLElement[] = [];
      for (const c of p.colors ?? PEN_COLOR_CHOICES) {
        const key = `pen.colors.${c.name}`, named = t(key);
        const b = choice('mmdx-pen-color', c.value === pen.color, t('pen.colorNamed', { name: named === key ? c.name : named }), `color-${c.value}`, () => pen.setColor(c.value));
        b.style.setProperty('--c', c.value);
        kids.push(b);
      }
      kids.push(sep());
      for (const sz of p.sizes ?? PEN_SIZE_CHOICES) {
        const dot = h('i');
        dot.style.width = dot.style.height = `${sz + 3}px`;
        dot.style.background = pen.color;
        kids.push(choice('mmdx-pen-size', sz === pen.size, t('pen.size', { n: sz }), `size-${sz}`, () => pen.setSize(sz), dot));
      }
      kids.push(sep());
      for (const ms of p.fades ?? PEN_FADE_CHOICES)
        kids.push(choice('mmdx-pen-fade', ms === pen.fade, ms ? t('pen.fadeAfter', { s: ms / 1000 }) : t('pen.keep'), `fade-${ms}`, () => pen.setFade(ms), ms ? `${ms / 1000}s` : '∞'));
      kids.push(sep());
      const clean = h('button', { type: 'button', class: 'mmdx-pen-clean', title: t('pen.erase'), 'aria-label': t('pen.erase'), 'data-f': 'erase' }, icon(I_eraser, 18));
      fx.on(clean, 'click', () => pen.clear());
      kids.push(clean);
      el.replaceChildren(...kids);
    };
    return {
      el,
      refresh: render,
      render,
    };
  });
}
