// PenOptions (§5.2): the magic pen's colours, thickness, auto erase and Erase all, as a vertical column that sits in
// the tool dock's flyout. One UI for every product: replaces the editor's flyout (`syncPenOpts` in
// `editor/modules/chrome/tool-dock.ts`) and the viewer / diff popup (`penOptions` in `elements/viewer-popups.ts`).
// Re-renders itself after each change, keeping the focus on the same choice.
import { PEN_COLORS, PEN_FADES, PEN_SIZES } from '../../dom/pen.js';
import { h, icon } from '../h.js';
import { registerMessages } from '../i18n.js';
import { ICONS } from '../icons.js';
import { BLOCK_MESSAGES_CHROME } from '../messages/blocks.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { keepFocus } from './focus.js';

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

export interface PenOptionsProps {
  pen: PenSettings;
  t: Translate;
}

export interface PenOptionsHandle extends BlockHandle<PenOptionsProps> {
  /** Re-renders from the pen's current settings (after a change made elsewhere). */
  refresh(): void;
}

export const PEN_OPTIONS_CSS = /* css */ `
.mmdx-pen-opts { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.mmdx-pen-opts .vt-color { width: 20px; height: 20px; border-radius: 50%; border: 0; padding: 0; background: var(--c); box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.mmdx-pen-opts .vt-color.on { box-shadow: 0 0 0 2px var(--mmdx-surface), 0 0 0 4px var(--c); margin: 3px 0; }
.mmdx-pen-opts .vt-sep { width: 22px; height: 1px; background: var(--mmdx-border); margin: 4px 0; flex: none; }
.mmdx-pen-opts .vt-size { width: 26px; height: 26px; border: 0; background: none; padding: 0; display: grid; place-items: center; border-radius: 6px; }
.mmdx-pen-opts .vt-size i { display: block; border-radius: 50%; }
.mmdx-pen-opts .vt-size:hover { background: var(--mmdx-float-2); }
.mmdx-pen-opts .vt-size.on { background: var(--mmdx-accent-2); }
.mmdx-pen-opts .vt-fade { width: 30px; height: 24px; border: 0; background: none; padding: 0; border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--mmdx-text-2); }
.mmdx-pen-opts .vt-fade:hover { background: var(--mmdx-float-2); }
.mmdx-pen-opts .vt-fade.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.mmdx-pen-opts .vt-clean { width: 30px; height: 28px; border: 0; background: none; padding: 0; display: grid; place-items: center; border-radius: 6px; color: var(--mmdx-text-2); }
.mmdx-pen-opts .vt-clean:hover { background: var(--mmdx-danger-bg); color: var(--mmdx-danger); }
`;

export function createPenOptions(props: PenOptionsProps): PenOptionsHandle {
  registerMessages(BLOCK_MESSAGES_CHROME);
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const el = h('div', { class: 'mmdx-pen-opts', role: 'toolbar', 'aria-orientation': 'vertical' });

  // up / down move through the choices; the keys stop here, so a surrounding toolbar does not move as well
  scope.on(el, 'keydown', (ev: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key) || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    const list = [...el.querySelectorAll<HTMLElement>('button')];
    const i = list.indexOf(ev.target as HTMLElement);
    if (i < 0) return;
    const next = ev.key === 'Home' ? list[0] : ev.key === 'End' ? list[list.length - 1] : list[(i + (ev.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    ev.preventDefault();
    ev.stopPropagation();
    next?.focus();
  });

  const render = (): void => keepFocus(el, () => {
    fx.dispose();
    fx = new Scope();
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
    const sep = (): HTMLElement => h('span', { class: 'vt-sep', 'aria-hidden': 'true' });
    const kids: HTMLElement[] = [];
    for (const c of PEN_COLORS) {
      const b = choice('vt-color', c === pen.color, `${t('pen.color')} ${c}`, `color-${c}`, () => pen.setColor(c));
      b.title = t('pen.color');
      b.style.setProperty('--c', c);
      kids.push(b);
    }
    kids.push(sep());
    for (const sz of PEN_SIZES) {
      const dot = h('i');
      dot.style.width = dot.style.height = `${sz + 3}px`;
      dot.style.background = pen.color;
      kids.push(choice('vt-size', sz === pen.size, t('pen.size', { n: sz }), `size-${sz}`, () => pen.setSize(sz), dot));
    }
    kids.push(sep());
    for (const ms of PEN_FADES)
      kids.push(choice('vt-fade', ms === pen.fade, ms ? t('pen.fadeAfter', { s: ms / 1000 }) : t('pen.keep'), `fade-${ms}`, () => pen.setFade(ms), ms ? `${ms / 1000}s` : '∞'));
    kids.push(sep());
    const clean = h('button', { type: 'button', class: 'vt-clean', title: t('pen.erase'), 'aria-label': t('pen.erase'), 'data-f': 'erase' }, icon(ICONS.eraser, 18));
    fx.on(clean, 'click', () => pen.clear());
    kids.push(clean);
    el.replaceChildren(...kids);
  });
  render();

  return {
    el,
    refresh: render,
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
