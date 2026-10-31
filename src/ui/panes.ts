// Floating side panels shared by the editor and the diff (A.2 row 21): slide in / out honouring reduced motion, and
// resize by dragging a panel's inner edge (double-click resets). Hosts keep the widths in CSS custom properties.

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

/** Adds the drag-to-resize grip on a panel's inner edge. Returns a cleanup. */
export function attachPaneResizer(pane: HTMLElement, side: 'left' | 'right', o: ResizerOptions): () => void {
  const grip = document.createElement('div');
  grip.className = 'pane-resizer';
  grip.title = o.title;
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  pane.append(grip);
  const name = (): string => (typeof o.varName === 'function' ? o.varName() : o.varName);
  const ac = new AbortController();
  grip.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch {
      // capture is best-effort
    }
    const v = name(), x0 = ev.clientX, w0 = pane.getBoundingClientRect().width;
    grip.classList.add('dragging');
    o.root.classList.add('resizing-panes');
    const move = (e: PointerEvent): void => {
      const max = typeof o.max === 'function' ? o.max() : o.max;
      const w = side === 'left' ? w0 + (e.clientX - x0) : w0 - (e.clientX - x0);
      o.root.style.setProperty(v, `${Math.round(Math.max(o.min, Math.min(Math.max(o.min, max), w)))}px`);
      o.onResize?.();
    };
    const up = (): void => {
      grip.classList.remove('dragging');
      o.root.classList.remove('resizing-panes');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      o.onCommit?.();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }, { signal: ac.signal });
  grip.addEventListener('dblclick', () => {
    o.root.style.removeProperty(name());
    o.onResize?.();
    o.onCommit?.();
  }, { signal: ac.signal });
  return () => {
    ac.abort();
    grip.remove();
  };
}
