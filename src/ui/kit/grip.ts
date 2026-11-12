// The resize grip (§5.2): SidePanel's and PanelStack's width grip on a card's inner edge and PanelStack's row splitter. A module of its own, so a host that needs only the grip does not load the panel block.
import { h } from './h.js';
import type { Scope } from '../blocks/block.js';

export interface GripOptions {
  /** `x` (default): a width grip on a card's inner edge (`side` is the card's). `y`: a splitter on the top edge of the panel it sizes (dragging up grows it); its press bubbles, and its host keeps its `aria-valuenow` (PanelStack's rows). */
  axis?: 'x' | 'y';
  /** The width grip's card side (a left card grows to the right). */
  side?: 'left' | 'right';
  /** The element measured when a drag or key starts; none (a function returning nothing): the press or key is ignored. */
  measure: HTMLElement | (() => HTMLElement | undefined);
  get: () => number | null;
  /** `live`: during a drag (the commit follows on release). */
  set: (px: number | null, live: boolean) => void;
  min: number;
  max: () => number;
  title: string;
  /** After a release, a double-click (reset) or a key; `dragged`: after a drag that moved. */
  onCommit?: (dragged: boolean) => void;
  /** Class put on this element while dragging (cursor over the whole host). */
  dragRoot?: () => HTMLElement | null;
  /** That class (default `resizing-panes`). */
  dragClass?: string;
}

/**
 * A resize grip (X16, one for both axes): drag resizes (clamped), double-click resets, the arrow keys of its axis step by 16 px. SidePanel's and PanelStack's width grip (`x`) and PanelStack's row splitter (`y`). Listeners are released with `scope`.
 */
export function createGrip(o: GripOptions, scope: Scope): HTMLElement {
  const y = o.axis === 'y';
  const grip = h('div', { class: y ? 'mmdx-split' : 'mmdx-grip', role: 'separator', 'aria-orientation': y ? 'horizontal' : 'vertical', tabindex: '0', title: o.title, 'aria-label': o.title });
  const clamp = (w: number): number => Math.round(Math.max(o.min, Math.min(Math.max(o.min, o.max()), w)));
  const measured = (): HTMLElement | undefined => (typeof o.measure === 'function' ? o.measure() : o.measure);
  const size = (m: HTMLElement): number => (y ? m.getBoundingClientRect().height : m.getBoundingClientRect().width);
  // how far a pointer at (x, y) is past the press, as growth of the sized element
  const growth = (dx: number, dy: number): number => (y ? -dy : o.side === 'left' ? dx : -dx);
  const sync = (): void => {
    if (y) return;
    const w = o.get();
    if (w === null) grip.removeAttribute('aria-valuenow');
    else grip.setAttribute('aria-valuenow', String(w));
    grip.setAttribute('aria-valuemin', String(o.min));
  };
  let drag: AbortController | null = null;
  scope.add(() => drag?.abort());
  scope.on(grip, 'pointerdown', (ev: PointerEvent) => {
    const m = measured();
    if (ev.button !== 0 || !m) return;
    ev.preventDefault();
    if (!y) ev.stopPropagation();
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch {
      // capture is best-effort
    }
    const x0 = ev.clientX, y0 = ev.clientY, w0 = size(m) || (o.get() ?? o.min);
    const root = o.dragRoot?.() ?? null;
    const cls = o.dragClass ?? 'resizing-panes';
    grip.classList.add('dragging');
    root?.classList.add(cls);
    drag?.abort();
    const ac = (drag = new AbortController());
    let moved = false;
    const move = (e: PointerEvent): void => {
      moved = true;
      o.set(clamp(w0 + growth(e.clientX - x0, e.clientY - y0)), true);
      sync();
    };
    const up = (): void => {
      ac.abort();
      grip.classList.remove('dragging');
      root?.classList.remove(cls);
      o.onCommit?.(moved);
    };
    for (const [type, f] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]] as const)
      grip.addEventListener(type, f as EventListener, { signal: ac.signal });
  });
  scope.on(grip, 'dblclick', () => {
    o.set(null, false);
    sync();
    o.onCommit?.(false);
  });
  scope.on(grip, 'keydown', (ev: KeyboardEvent) => {
    const [less, more] = y ? ['ArrowDown', 'ArrowUp'] : o.side === 'left' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
    const m = measured();
    if ((ev.key !== less && ev.key !== more) || !m) return;
    ev.preventDefault();
    ev.stopPropagation();
    const w0 = o.get() ?? (size(m) || o.min);
    o.set(clamp(w0 + (ev.key === more ? 16 : -16)), false);
    sync();
    o.onCommit?.(false);
  });
  sync();
  return grip;
}
