// Floating side panels shared by the editor and the diff (A.2 row 21): slide in / out honouring reduced motion, and
// resize by dragging a panel's inner edge (double-click resets, arrow keys step). Hosts keep the widths in CSS custom
// properties.
import { Scope } from './blocks/block.js';
import { createGrip } from './blocks/grip.js';

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Slides a floating panel out past its screen edge (close) or back in (open). `apply` switches the state; on close
 * it runs once the panel has left the screen.
 */
export function slidePanel(el: HTMLElement | null, side: 'left' | 'right', open: boolean, apply: () => void): void {
  if (!el || el.dataset['sliding']) {
    if (!el) apply();
    return;
  }
  const canAnimate = typeof el.animate === 'function';
  const away = `translateX(calc(${side === 'left' ? '-' : ''}100% ${side === 'left' ? '-' : '+'} 24px))`;
  const hidden = !el.offsetParent; // not rendered (e.g. another mode hides it): no animation to show
  if (!canAnimate || reducedMotion() || document.hidden || (!open && hidden)) {
    apply();
    return;
  }
  el.getAnimations?.().forEach((x) => x.cancel());
  if (open) {
    apply();
    if (!el.offsetParent) return;
    el.animate([{ transform: away, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return;
  }
  el.dataset['sliding'] = '1';
  const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: away, opacity: 0.4 }], { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    delete el.dataset['sliding'];
    apply();
    a.cancel();
  };
  a.finished.then(finish, finish);
  setTimeout(finish, 400); // animations can stall (e.g. a background page): close anyway
}

export interface ResizerOptions {
  /** The element whose custom property holds the width. */
  root: HTMLElement;
  /** e.g. `--left-w`. */
  varName: string | (() => string);
  /** Clamp of the width; `max` may depend on the room left for the canvas. */
  min: number;
  max: number | (() => number);
  title: string;
  /** During a drag and after a reset. */
  onResize?: () => void;
  /** After a drag or a reset (remember the width). */
  onCommit?: () => void;
}

/**
 * Adds the drag-to-resize grip on a panel's inner edge (SidePanel's `createGrip`: drag, double-click to reset,
 * ArrowLeft / ArrowRight to step, `aria-valuenow`). The width lives in `o.root`'s custom property. Returns a cleanup.
 */
export function attachPaneResizer(pane: HTMLElement, side: 'left' | 'right', o: ResizerOptions): () => void {
  const scope = new Scope();
  const name = (): string => (typeof o.varName === 'function' ? o.varName() : o.varName);
  const grip = createGrip({
    side, measure: pane, min: o.min, max: () => (typeof o.max === 'function' ? o.max() : o.max), title: o.title, dragRoot: () => o.root,
    get: () => {
      const px = parseFloat(o.root.style.getPropertyValue(name()));
      return Number.isFinite(px) ? px : null;
    },
    set: (px) => {
      if (px === null) o.root.style.removeProperty(name());
      else o.root.style.setProperty(name(), `${px}px`);
      o.onResize?.();
    },
    ...(o.onCommit ? { onCommit: o.onCommit } : {}),
  }, scope);
  // the editor's stylesheet places `.pane-resizer`; `.mmdx-grip` brings the focus ring
  grip.classList.add('pane-resizer');
  pane.append(grip);
  return () => {
    scope.dispose();
    grip.remove();
  };
}
