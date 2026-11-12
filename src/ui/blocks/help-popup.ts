// HelpPopup (§5.2): the shortcuts and hints dialog, generated from a keymap — a titled head with a close button,
// then the shortcut rows grouped under headings. Replaces the help popups of `editor/modules/chrome/zoom-bar.ts`
// and `elements/diff.ts`, and takes over `helpKeys` from `ui/zoom-bar.ts`. The host opens it through its
// PopoverManager (anchored above the zoom bar's `?` button) and closes it in `onClose`.
import { h } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_CHROME } from '../messages/blocks.js';
import { formatKeys, type Shortcut } from '../kit/keys.js';
import { defineBlock, type BlockHandle, type Translate } from './block.js';
import { createOverlayScroll, OVERLAY_SCROLL_CSS } from '../kit/overlay-scroll.js';

export interface HelpGroup {
  title: string;
  rows: readonly Shortcut[];
}

export interface HelpPopupProps {
  title: string;
  groups: readonly HelpGroup[];
  /** The close button and Esc. */
  onClose: () => void;
  t: Translate;
}

export const HELP_POPUP_CSS = /* css */ `
${OVERLAY_SCROLL_CSS}
.help-pop { position: absolute; right: 12px; bottom: 60px; z-index: var(--mmdx-z-popover, 1000); }
.help-pop, .help-pop.mmdx-pop { width: 380px; max-width: calc(100% - 24px); max-height: min(560px, calc(100% - 120px)); display: flex; flex-direction: column;
  background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 14px; box-shadow: var(--mmdx-shadow-card); color: var(--mmdx-text); font-size: 12.5px; padding: 0; }
.help-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 6px 14px; }
.help-head b { font-size: 13px; }
.help-head button { border: 0; background: none; font-size: 18px; line-height: 1; padding: 2px 8px; border-radius: 6px; color: var(--mmdx-muted); }
.help-head button:hover { background: var(--mmdx-float-2); color: var(--mmdx-text); }
.help-body { overflow: auto; padding: 0 14px 12px; }
.help-title { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--mmdx-muted); margin: 10px 0 4px; }
.help-row { display: grid; grid-template-columns: minmax(0, 160px) minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 4px 0; line-height: 1.45; }
.help-row + .help-row { border-top: 1px solid var(--mmdx-float-line); }
.help-keys { color: var(--mmdx-muted); font-size: 11px; min-width: 0; overflow-wrap: anywhere; }
.help-keys kbd { font: 11px/1 var(--mmdx-mono); color: var(--mmdx-text); background: var(--mmdx-float-2); border: 1px solid var(--mmdx-float-line); border-radius: 5px; padding: 2px 5px; white-space: nowrap; }
.help-gesture { color: var(--mmdx-text-2); font-size: 11.5px; }
.help-row > span:last-child { min-width: 0; overflow-wrap: anywhere; }
`;

/** The keys of one help row: key caps (alternatives joined by ·), gestures as plain text. */
export function helpKeys(s: Shortcut): HTMLElement {
  const k = h('span', { class: 'help-keys' });
  if (s.hintOnly && s.keys.every((x) => x.length > 12 || /\s/.test(x))) {
    k.append(h('span', { class: 'help-gesture' }, s.keys.join(' · ')));
    return k;
  }
  s.keys.forEach((key, i) => {
    if (i) k.append(' · ');
    k.append(/\s/.test(key) && key.length > 12 ? h('span', { class: 'help-gesture' }, key) : h('kbd', null, formatKeys(key)));
  });
  return k;
}

/** Groups shortcuts by `group`, groups in first-seen order. */
export function groupShortcuts(list: readonly Shortcut[]): HelpGroup[] {
  const groups = new Map<string, Shortcut[]>();
  for (const s of list) {
    const rows = groups.get(s.group);
    if (rows) rows.push(s);
    else groups.set(s.group, [s]);
  }
  return [...groups].map(([title, rows]) => ({ title, rows }));
}

let seq = 0;

export function createHelpPopup(props: HelpPopupProps): BlockHandle<HelpPopupProps> {
  registerMessages(BLOCK_MESSAGES_CHROME);
  return defineBlock(props, (p, scope) => {
    const titleId = `mmdx-help-${++seq}`;
    const heading = h('b', { id: titleId });
    const close = h('button', { type: 'button', 'data-f': 'close' }, '×');
    const body = h('div', { class: 'help-body' });
    // the panels' thin scrollbar over the shortcut list (mmdx-oscroll: the native one hidden)
    const el = h('div', { class: 'help-pop mmdx-oscroll', role: 'dialog', 'aria-labelledby': titleId }, h('div', { class: 'help-head' }, heading, close), body);
    const scroll = createOverlayScroll(el);
    scope.add(() => scroll.destroy());
    el.append(...scroll.thumbs);
    scope.on(close, 'click', () => p.onClose());
    scope.on(el, 'keydown', (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      // the component's own Esc shortcuts (back to the default tool…) do not run as well
      ev.preventDefault();
      ev.stopPropagation();
      p.onClose();
    });

    const render = (): void => {
      heading.textContent = p.title;
      close.title = p.t('help.close');
      close.setAttribute('aria-label', p.t('help.close'));
      body.replaceChildren(...p.groups.flatMap((g) => [
        h('div', { class: 'help-title', role: 'heading', 'aria-level': '3' }, g.title),
        ...g.rows.map((s) => h('div', { class: 'help-row' }, helpKeys(s), h('span', null, s.label))),
      ]));
    };
    return { el, render };
  });
}
