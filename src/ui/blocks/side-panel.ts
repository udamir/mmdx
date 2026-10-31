// SidePanel (§5.2, §7.1): a floating card with a header (a title, or a `Tabs` element), optional header actions, a
// close button (×, its tooltip with the shortcut), a body, and an optional resize grip on the inner edge (drag sets
// the width signal, double-click resets it, arrow keys step it). The look is the editor's right panel cards. Replaces
// the card shells of editor/modules/panels/right-panels.ts (`.rpanel`, `.rp-head`), the editor's code panel and the
// diff's panels (`.lpanel`, `.pane-side`, `.collapse-btn`); the grip replaces `attachPaneResizer` of ui/panes.ts.
import { h } from '../h.js';
import type { Signal } from '../signal.js';
import { Scope, type BlockHandle } from './block.js';
import { createIconButton, type IconButtonHandle } from './button.js';

export interface SidePanelResize {
  /** The panel's width in px; null means the CSS default. */
  width: Signal<number | null>;
  min: number;
  /** The upper clamp (may depend on the room left for the canvas). */
  max: () => number;
  /** After a drag, a reset or a key step (remember the width). */
  onCommit?: () => void;
  /** Tooltip of the grip (`Drag to resize · double-click to reset`). */
  title: string;
}

export interface SidePanelProps {
  side: 'left' | 'right';
  /** Heading text (ignored when `head` is given). */
  title?: string;
  /** Replaces the title, e.g. a Tabs block's element. */
  head?: HTMLElement;
  /** Small controls between the title and the close button (e.g. `+ New layer`). */
  actions?: readonly HTMLElement[];
  closeLabel: string;
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
}

export interface SidePanelHandle extends BlockHandle<SidePanelProps> {
  /** The body wrapper (scrolls). */
  readonly bodyEl: HTMLElement;
}

export const SIDE_PANEL_CSS = /* css */ `
.mmdx-panel { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--mmdx-panel); border: 1px solid var(--mmdx-border);
  border-radius: 14px; box-shadow: 0 10px 30px rgba(20,30,60,.16), 0 1px 3px rgba(20,30,60,.08); overflow: hidden; color: var(--mmdx-text); }
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

export interface GripOptions {
  side: 'left' | 'right';
  /** The element whose width is measured when a drag starts. */
  measure: HTMLElement;
  get: () => number | null;
  set: (px: number | null) => void;
  min: number;
  max: () => number;
  title: string;
  onCommit?: () => void;
  /** Class put on this element while dragging (cursor over the whole host). */
  dragRoot?: () => HTMLElement | null;
}

/**
 * A width grip on a card's inner edge: drag resizes (clamped), double-click resets, ArrowLeft / ArrowRight step by
 * 16 px. Shared with PanelStack. Listeners are released with `scope`.
 */
export function createGrip(o: GripOptions, scope: Scope): HTMLElement {
  const grip = h('div', { class: 'mmdx-grip', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', title: o.title, 'aria-label': o.title });
  const clamp = (w: number): number => Math.round(Math.max(o.min, Math.min(Math.max(o.min, o.max()), w)));
  const sync = (): void => {
    const w = o.get();
    if (w === null) grip.removeAttribute('aria-valuenow');
    else grip.setAttribute('aria-valuenow', String(w));
    grip.setAttribute('aria-valuemin', String(o.min));
  };
  let drag: AbortController | null = null;
  scope.add(() => drag?.abort());
  scope.on(grip, 'pointerdown', (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch {
      // capture is best-effort
    }
    const x0 = ev.clientX, w0 = o.measure.getBoundingClientRect().width || (o.get() ?? o.min);
    const root = o.dragRoot?.() ?? null;
    grip.classList.add('dragging');
    root?.classList.add('resizing-panes');
    drag?.abort();
    const ac = (drag = new AbortController());
    const move = (e: PointerEvent): void => {
      o.set(clamp(o.side === 'left' ? w0 + (e.clientX - x0) : w0 - (e.clientX - x0)));
      sync();
    };
    const up = (): void => {
      ac.abort();
      grip.classList.remove('dragging');
      root?.classList.remove('resizing-panes');
      o.onCommit?.();
    };
    for (const [type, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]] as const)
      grip.addEventListener(type, f as EventListener, { signal: ac.signal });
  });
  scope.on(grip, 'dblclick', () => {
    o.set(null);
    sync();
    o.onCommit?.();
  });
  scope.on(grip, 'keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    ev.stopPropagation();
    const grow = (ev.key === 'ArrowRight') === (o.side === 'left');
    const w0 = o.get() ?? (o.measure.getBoundingClientRect().width || o.min);
    o.set(clamp(w0 + (grow ? 16 : -16)));
    sync();
    o.onCommit?.();
  });
  sync();
  return grip;
}

export function createSidePanel(props: SidePanelProps): SidePanelHandle {
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  let close: IconButtonHandle | null = null;
  const el = h('section', null);
  const head = h('div', { class: 'mmdx-panel-head' });
  const bodyEl = h('div', { class: 'mmdx-panel-body' });

  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    close?.destroy();
    close = null;
    el.className = ['mmdx-panel', p.class].filter(Boolean).join(' ');
    el.dataset['side'] = p.side;
    el.setAttribute('aria-label', p.label);
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    const onClose = p.onClose;
    if (onClose) close = createIconButton({ icon: null, text: '×', label: p.closeLabel, class: 'mmdx-panel-close collapse-btn', f: 'panel-close', ...(p.closeKeys ? { keys: p.closeKeys } : {}), onClick: () => onClose() });
    head.replaceChildren(
      p.head ?? h('b', { class: 'mmdx-panel-title', role: 'heading', 'aria-level': '2' }, p.title ?? ''),
      ...(p.actions ?? []),
      ...(close ? [close.el] : []),
    );
    bodyEl.replaceChildren(p.body);
    const children: HTMLElement[] = [head, bodyEl];
    const r = p.resizable;
    if (r) {
      children.push(createGrip({
        side: p.side, measure: el, get: () => r.width.peek(), set: (w) => r.width.set(w), min: r.min, max: r.max, title: r.title,
        ...(r.onCommit ? { onCommit: r.onCommit } : {}), dragRoot: () => el.parentElement,
      }, fx));
      fx.effect(() => {
        const w = r.width();
        if (w === null) el.style.removeProperty('width');
        else el.style.width = `${w}px`;
      });
    } else el.style.removeProperty('width');
    el.replaceChildren(...children);
  };
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
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
