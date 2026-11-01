// SidePanel (§5.2, §7.1): a floating card with a header (a title, or a `Tabs` element), optional header actions, a
// close button (×, its tooltip with the shortcut), a body, and an optional resize grip on the inner edge (drag sets
// the width signal, double-click resets it, arrow keys step it). The look is the editor's right panel cards. Replaces
// the card shells of editor/modules/panels/right-panels.ts (`.rpanel`, `.rp-head`), the editor's code panel and the
// diff's panels (`.lpanel`, `.pane-side`, `.collapse-btn`); the grip replaces `attachPaneResizer` of ui/panes.ts.
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_PANELS } from '../messages/blocks-panels.js';
import type { Signal } from '../signal.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { createIconButton, type IconButtonHandle } from './button.js';
import { keepFocus } from './focus.js';
import { createGrip } from './grip.js';
import { createOverlayScroll, OVERLAY_SCROLL_CSS } from './overlay-scroll.js';

export { createGrip, type GripOptions } from './grip.js';

export interface SidePanelResize {
  /** The panel's width in px; null means the CSS default. */
  width: Signal<number | null>;
  min: number;
  /** The upper clamp (may depend on the room left for the canvas). */
  max: () => number;
  /** After a drag, a reset or a key step (remember the width). */
  onCommit?: () => void;
  /** Tooltip of the grip (default: `panes.resize`, `Drag to resize · double-click to reset`). */
  title?: string;
}

export interface SidePanelProps {
  side: 'left' | 'right';
  /** Heading text (ignored when `head` is given). */
  title?: string;
  /** Replaces the title, e.g. a Tabs block's element. */
  head?: HTMLElement;
  /** Small controls between the title and the close button (e.g. `+ New layer`). */
  actions?: readonly HTMLElement[];
  /** Accessible name of the close button (default: `panel.close`, "Close"). */
  closeLabel?: string;
  /** The panel's toggle shortcut (registry form), shown in the close tooltip. */
  closeKeys?: string;
  /** No close button without it. */
  onClose?: () => void;
  body: HTMLElement;
  class?: string;
  part?: string;
  /** Accessible name of the `section`. */
  label: string;
  resizable?: SidePanelResize;
  /** The block's own strings (close label and grip title defaults); English without it. */
  t?: Translate;
}

export interface SidePanelHandle extends BlockHandle<SidePanelProps> {
  /** The body wrapper (scrolls). */
  readonly bodyEl: HTMLElement;
}

export const SIDE_PANEL_CSS = /* css */ `
${OVERLAY_SCROLL_CSS}
.mmdx-panel { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--mmdx-panel); border: 1px solid var(--mmdx-border);
  border-radius: 14px; box-shadow: var(--mmdx-shadow-card); overflow: hidden; color: var(--mmdx-text); }
.mmdx-panel-head { display: flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 6px 0 0; border-bottom: 1px solid var(--mmdx-border); flex: none; }
.mmdx-panel-title { flex: 1; min-width: 0; padding: 8px 0 8px 14px; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mmdx-panel-head > .mmdx-tabs { flex: 1; align-self: stretch; }
.mmdx-panel-head .mmdx-tabs [role=tab] { border: 0; border-radius: 0; padding: 9px 12px; color: var(--mmdx-muted); border-bottom: 2px solid transparent; background: none; }
.mmdx-panel-head .mmdx-tabs [role=tab][aria-selected=true] { color: var(--mmdx-text); border-bottom-color: var(--mmdx-accent); font-weight: 600; }
.mmdx-panel-close { flex: none; border: 0; background: none; font-size: 18px; line-height: 1; padding: 2px 8px; color: var(--mmdx-muted); border-radius: 6px; }
.mmdx-panel-close:hover:not(:disabled) { color: var(--mmdx-text); background: var(--mmdx-surface-2); }
.mmdx-panel-body { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.mmdx-grip { position: absolute; top: 14px; bottom: 14px; width: 7px; z-index: 31; cursor: col-resize; touch-action: none; }
.mmdx-grip::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background .12s; }
.mmdx-grip:hover::after, .mmdx-grip.dragging::after, .mmdx-grip:focus-visible::after { background: var(--mmdx-accent); width: 2px; left: 2px; }
.mmdx-grip:focus-visible { box-shadow: none; }
.mmdx-panel[data-side=left] > .mmdx-grip { right: 0; }
.mmdx-panel[data-side=right] > .mmdx-grip { left: 0; }
`;

/** English fallback for blocks created without a translation function. */
const english = (key: string): string => BLOCK_MESSAGES_PANELS[key] ?? key;

/** Replaces `box`'s children only when they differ (moving a focused node out and back would drop the focus). */
const setChildren = (box: HTMLElement, kids: readonly Node[]): void => {
  const cur = box.childNodes;
  if (cur.length === kids.length && kids.every((k, i) => cur[i] === k)) return;
  box.replaceChildren(...kids);
};

export function createSidePanel(props: SidePanelProps): SidePanelHandle {
  registerMessages(BLOCK_MESSAGES_PANELS);
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  let close: IconButtonHandle | null = null;
  const el = h('section', null);
  const head = h('div', { class: 'mmdx-panel-head' });
  const bodyEl = h('div', { class: 'mmdx-panel-body' });
  // thin scrollbars over the content of whatever scrolls inside (the body, a list, a code editor)
  const scroll = createOverlayScroll(el);

  // the close button and the grip are rebuilt (their focus is kept); the head and the body stay in place
  const render = (): void => keepFocus(el, () => {
    fx.dispose();
    fx = new Scope();
    close?.destroy();
    close = null;
    const t = p.t ?? english;
    // mmdx-oscroll: the native scrollbars inside are hidden for the overlay ones
    el.className = ['mmdx-panel', 'mmdx-oscroll', p.class].filter(Boolean).join(' ');
    el.dataset['side'] = p.side;
    el.setAttribute('aria-label', p.label);
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    const onClose = p.onClose;
    if (onClose) close = createIconButton({ icon: null, text: '×', label: p.closeLabel ?? t('panel.close'), class: 'mmdx-panel-close collapse-btn', f: 'panel-close', ...(p.closeKeys ? { keys: p.closeKeys } : {}), onClick: () => onClose() });
    const title = p.head ?? (head.firstElementChild?.classList.contains('mmdx-panel-title') ? head.firstElementChild as HTMLElement : h('b', { class: 'mmdx-panel-title', role: 'heading', 'aria-level': '2' }));
    if (!p.head) title.textContent = p.title ?? '';
    setChildren(head, [title, ...(p.actions ?? []), ...(close ? [close.el] : [])]);
    setChildren(bodyEl, [p.body]);
    const children: HTMLElement[] = [head, bodyEl, ...scroll.thumbs];
    const r = p.resizable;
    if (r) {
      children.push(createGrip({
        side: p.side, measure: el, get: () => r.width.peek(), set: (w) => r.width.set(w), min: r.min, max: r.max, title: r.title ?? t('panes.resize'),
        ...(r.onCommit ? { onCommit: r.onCommit } : {}), dragRoot: () => el.parentElement,
      }, fx));
      fx.effect(() => {
        const w = r.width();
        if (w === null) el.style.removeProperty('width');
        else el.style.width = `${w}px`;
      });
    } else el.style.removeProperty('width');
    setChildren(el, children);
  });
  render();

  return {
    el,
    bodyEl,
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      close?.destroy();
      scroll.destroy();
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
