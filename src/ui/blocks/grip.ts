// The width grip on a card's inner edge (§5.2): SidePanel's and PanelStack's resize handle, and the editor's pane
// resizer (ui/panes.ts). A module of its own, so a host that needs only the grip does not load the panel block.
import { h } from '../h.js';
import type { Scope } from './block.js';

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
