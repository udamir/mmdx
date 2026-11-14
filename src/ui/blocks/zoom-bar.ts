// ZoomBar (§5.2): the zoom bar in the bottom right corner — − % + Fit, the `?` help button and full screen — with
// the percentage bound to a view signal. Replaces `ui/zoom-bar.ts` (ZOOM_BAR_CSS) and the DOM of
// `editor/modules/chrome/zoom-bar.ts`; the host opens the help popup (`HelpPopup`) and does the zooming. Compact:
// smaller, and Fit becomes an icon. The bar is a toolbar with one tab stop (arrow keys move). `el` is the positioning
// wrapper (`.bottom-bar`, kept: product CSS places and hides it); `part` stays on the visible bar (`.zoom`), the public
// `::part(zoom-bar)` hook.
import { h, icon } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_CHROME } from '../messages/blocks.js';
import type { ReadSignal } from '../../reactive/signal.js';
import { ariaKeys, defineBlock, read, tipText, type BlockHandle, type Translate, type Value } from './block.js';
import { keepFocus, rovingKeys } from '../kit/focus.js';

export interface ZoomBarProps {
  /** The view; the percentage follows `k`. */
  view: ReadSignal<{ k: number }>;
  /** Zooms about the centre by `factor` (− is 1 / 1.2, + is 1.2). */
  onZoom: (factor: number) => void;
  onFit: () => void;
  /** The `?` button (opener of the help popup); `open` drives `aria-expanded`. */
  help?: { onToggle(): void; open: Value<boolean> } | null;
  /** Full screen; the button is hidden when the browser cannot. */
  fullscreen?: { active: Value<boolean>; available: boolean; onToggle(): void } | null;
  compact?: Value<boolean>;
  t: Translate;
  /** Formats shortcuts in tooltips (default: the registry's `formatKeys`). */
  formatKeys?: (keys: string) => string;
  /** `part` of the bar (default `zoom-bar`). */
  part?: string;
}

export interface ZoomBarHandle extends BlockHandle<ZoomBarProps> {
  /** The `?` button (the help popup's opener), or null without help. */
  readonly helpButton: HTMLButtonElement | null;
}

/**
 * Full screen in / out: copies of `I_expand` / `I_shrink` (ui/icons.ts). Inlined on purpose: ui/icons.ts is shared by
 * lazy chunks, so importing from it here would put a shared icons chunk on the viewer's eager path.
 */
const I_EXPAND = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
const I_SHRINK = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';
/** Fit to view: the four corners around a dot (the expand arrows are full screen's). */
const I_FIT = 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z';

export const ZOOM_BAR_CSS = /* css */ `
.bottom-bar { position: absolute; right: 12px; bottom: 12px; z-index: 38; display: flex; align-items: center; gap: 8px; pointer-events: none; }
.bottom-bar > * { pointer-events: auto; }
.zoom { display: flex; gap: 4px; align-items: center; background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 8px; padding: 4px; box-shadow: var(--mmdx-shadow); }
.zoom output { min-width: 44px; text-align: center; color: var(--mmdx-muted); font-variant-numeric: tabular-nums; }
.zoom button { padding: 2px 8px; background: transparent; border-color: transparent; }
.zoom button:hover:not(:disabled) { background: var(--mmdx-float-2); border-color: transparent; }
.zoom .help-btn { font-weight: 600; min-width: 26px; }
.zoom .help-btn[aria-expanded=true], .zoom .fs-btn.on { color: var(--mmdx-accent); }
.zoom .fs-btn, .bottom-bar.compact .zoom .fit-btn { display: grid; place-items: center; padding: 3px 6px; }
.zoom .fs-btn[hidden] { display: none; }
.bottom-bar.compact .zoom { gap: 2px; padding: 2px; }
.bottom-bar.compact .zoom button { padding: 2px 6px; }
.bottom-bar.compact .zoom .fs-btn, .bottom-bar.compact .zoom .fit-btn { padding: 3px 5px; }
.bottom-bar.compact .zoom .help-btn { min-width: 22px; }
.bottom-bar.compact .zoom output { min-width: 36px; font-size: 12px; }
`;

export function createZoomBar(props: ZoomBarProps): ZoomBarHandle {
  registerMessages(BLOCK_MESSAGES_CHROME);
  return defineBlock(props, (p, scope) => {
    const el = h('div', { class: 'bottom-bar' });
    let helpButton: HTMLButtonElement | null = null;
    const keys = rovingKeys(el, { orientation: 'horizontal', selector: '.zoom > button', roving: true });
    scope.add(() => keys.destroy());

    const render = (): void => keepFocus(el, () => {
      const fx = scope.renew();
      const { t } = p;
      const tip = (label: string, k: string): string => tipText(label, k, p.formatKeys);
      const btn = (f: string, label: string, text: string, run: () => void, extra: Record<string, unknown> = {}): HTMLButtonElement => {
        const b = h('button', { type: 'button', title: label, 'aria-label': label, 'data-f': f, ...extra }, text);
        fx.on(b, 'click', run);
        return b;
      };
      const out = btn('zoom-out', t('zoom.out'), '−', () => p.onZoom(1 / 1.2));
      const level = h('output', { 'aria-live': 'off', 'aria-label': t('zoom.level') });
      const inn = btn('zoom-in', t('zoom.in'), '+', () => p.onZoom(1.2));
      const fit = btn('fit', t('zoom.fit'), '', () => p.onFit(), { class: 'fit-btn', title: tip(t('zoom.fit'), 'f'), 'aria-keyshortcuts': ariaKeys('f') });
      const help = p.help;
      helpButton = help ? btn('help', t('help.button'), '?', () => help.onToggle(), { class: 'help-btn', title: tip(t('help.button'), '?'), 'aria-keyshortcuts': ariaKeys('?'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }) : null;
      const full = p.fullscreen;
      const fs = full ? btn('fullscreen', t('fullscreen.enter'), '', () => full.onToggle(), { class: 'fs-btn', hidden: !full.available }) : null;
      const bar = h('div', { class: 'zoom', role: 'toolbar', 'aria-label': t('zoom.bar'), part: p.part ?? 'zoom-bar' }, out, level, inn, fit, helpButton, fs);
      el.replaceChildren(bar);

      const view = p.view;
      fx.effect(() => void (level.textContent = `${Math.round(view().k * 100)}%`));
      const compact = p.compact;
      fx.effect(() => {
        const on = compact !== undefined && read(compact);
        el.classList.toggle('compact', on);
        fit.replaceChildren(on ? icon(I_FIT, 16) : t('zoom.fitShort'));
      });
      if (help && helpButton) {
        const b = helpButton;
        fx.effect(() => b.setAttribute('aria-expanded', String(read(help.open))));
      }
      // the label says what the button does (the state is announced once, not as a label and a pressed state too)
      if (full && fs)
        fx.effect(() => {
          const on = read(full.active);
          const label = on ? t('fullscreen.exit') : t('fullscreen.enter');
          fs.replaceChildren(icon(on ? I_SHRINK : I_EXPAND, 16));
          fs.title = label;
          fs.setAttribute('aria-label', label);
          fs.classList.toggle('on', on);
        });
    });
    return {
      el,
      get helpButton() {
        return helpButton;
      },
      render: () => {
        render();
        keys.sync();
      },
    };
  });
}
