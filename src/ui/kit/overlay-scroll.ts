// OverlayScroll (§5.2): thin scrollbars over the content of every scrolling area inside a card (a side panel, a
// dialog's gallery) instead of the native ones: the thumb of the area under the pointer shows while the pointer is
// over it, while it scrolls and while the thumb is dragged, and takes no room. The host must be positioned; its
// `thumbs` go into it (the caller places them, so they are kept across the host's own re-renders).
import { h } from './h.js';

export const OVERLAY_SCROLL_CSS = /* css */ `
.mmdx-oscroll, .mmdx-oscroll * { scrollbar-width: none; }
.mmdx-oscroll::-webkit-scrollbar, .mmdx-oscroll *::-webkit-scrollbar { display: none; }
.mmdx-sthumb { position: absolute; left: 0; top: 0; z-index: 40; border-radius: 4px; background: var(--mmdx-faint); opacity: 0; transition: opacity .3s; touch-action: none; }
.mmdx-sthumb.y { width: 6px; }
.mmdx-sthumb.x { height: 6px; }
.mmdx-sthumb.on { opacity: .7; transition-duration: .1s; }
.mmdx-sthumb:hover, .mmdx-sthumb.drag { opacity: 1; }
.mmdx-sthumb[hidden] { display: none; }
`;

export interface OverlayScrollHandle {
  /** The vertical and horizontal thumbs, to put into the host. */
  readonly thumbs: readonly HTMLElement[];
  /** Places the thumbs again (content changed size). */
  update(): void;
  destroy(): void;
}

type Axis = 'y' | 'x';
const MIN = 24;

const scrolls = (el: Element, axis: Axis): boolean => {
  const e = el as HTMLElement;
  if (axis === 'y' ? e.scrollHeight <= e.clientHeight + 1 : e.scrollWidth <= e.clientWidth + 1) return false;
  const o = getComputedStyle(e)[axis === 'y' ? 'overflowY' : 'overflowX'];
  return o === 'auto' || o === 'scroll';
};

export function createOverlayScroll(host: HTMLElement): OverlayScrollHandle {
  host.classList.add('mmdx-oscroll');
  const ac = new AbortController();
  const sig = { signal: ac.signal, passive: true };
  const axes: Axis[] = ['y', 'x'];
  const thumb = { y: h('div', { class: 'mmdx-sthumb y', hidden: true, 'aria-hidden': 'true' }), x: h('div', { class: 'mmdx-sthumb x', hidden: true, 'aria-hidden': 'true' }) };
  /** The area each thumb belongs to. */
  const area: Record<Axis, HTMLElement | null> = { y: null, x: null };
  let hover = false;
  let dragging = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  /** The closest scrolling area of a target, per axis, inside the host. */
  const areaOf = (t: EventTarget | null, axis: Axis): HTMLElement | null => {
    for (let e = t instanceof Element ? t : null; e; e = e.parentElement) {
      if (scrolls(e, axis)) return e as HTMLElement;
      if (e === host) break;
    }
    return null;
  };

  const place = (axis: Axis): void => {
    const sc = area[axis], th = thumb[axis];
    if (!sc || !sc.isConnected || !scrolls(sc, axis)) {
      th.hidden = true;
      return;
    }
    th.hidden = false;
    const r = sc.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const ox = r.left - hr.left - host.clientLeft, oy = r.top - hr.top - host.clientTop;
    if (axis === 'y') {
      const view = sc.clientHeight, full = sc.scrollHeight;
      const len = Math.max(MIN, (view * view) / full);
      const pos = ((view - len) * sc.scrollTop) / Math.max(1, full - view);
      th.style.height = `${Math.round(len - 4)}px`;
      th.style.transform = `translate(${Math.round(ox + sc.clientWidth - 8)}px, ${Math.round(oy + pos + 2)}px)`;
    } else {
      const view = sc.clientWidth, full = sc.scrollWidth;
      const len = Math.max(MIN, (view * view) / full);
      const pos = ((view - len) * sc.scrollLeft) / Math.max(1, full - view);
      th.style.width = `${Math.round(len - 4)}px`;
      th.style.transform = `translate(${Math.round(ox + pos + 2)}px, ${Math.round(oy + sc.clientHeight - 8)}px)`;
    }
  };
  const show = (on: boolean): void => {
    clearTimeout(hideTimer);
    for (const a of axes) thumb[a].classList.toggle('on', on);
  };
  const update = (): void => {
    for (const a of axes) place(a);
  };

  // pointer moves read the layout once per frame (P22: per move, reads and writes interleaved)
  let moveTarget: EventTarget | null = null, frame = 0;
  const onMove = (): void => {
    frame = 0;
    // over a thumb: it keeps its area
    if (!dragging && !(moveTarget instanceof Element && moveTarget.classList.contains('mmdx-sthumb')))
      for (const a of axes) area[a] = areaOf(moveTarget, a);
    update();
    show(true);
  };
  host.addEventListener('pointermove', (ev) => {
    hover = true;
    moveTarget = ev.target;
    if (typeof requestAnimationFrame !== 'function') onMove();
    else frame ||= requestAnimationFrame(onMove);
  }, sig);
  host.addEventListener('pointerleave', () => {
    hover = false;
    if (!dragging) show(false);
  }, sig);
  // scrolling (wheel, keys, a scroll into view): that area's thumbs show for a moment
  host.addEventListener('scroll', (ev) => {
    const t = ev.target instanceof HTMLElement ? ev.target : null;
    if (!t || t === thumb.x || t === thumb.y) return;
    for (const a of axes) if (scrolls(t, a) && (!dragging || area[a] === t)) area[a] = t;
    update();
    show(true);
    if (!hover && !dragging) hideTimer = setTimeout(() => show(false), 900);
  }, { signal: ac.signal, passive: true, capture: true });

  // dragging a thumb scrolls its area
  for (const a of axes) {
    const th = thumb[a];
    th.addEventListener('pointerdown', (ev) => {
      const sc = area[a];
      if (ev.button !== 0 || !sc) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        th.setPointerCapture(ev.pointerId);
      } catch {
        // a synthetic event has no active pointer
      }
      dragging = true;
      th.classList.add('drag');
      const start = a === 'y' ? ev.clientY : ev.clientX;
      const from = a === 'y' ? sc.scrollTop : sc.scrollLeft;
      const view = a === 'y' ? sc.clientHeight : sc.clientWidth, full = a === 'y' ? sc.scrollHeight : sc.scrollWidth;
      const len = Math.max(MIN, (view * view) / full);
      const k = (full - view) / Math.max(1, view - len);
      const move = (e: PointerEvent): void => {
        const d = ((a === 'y' ? e.clientY : e.clientX) - start) * k;
        if (a === 'y') sc.scrollTop = from + d;
        else sc.scrollLeft = from + d;
      };
      const end = (): void => {
        dragging = false;
        th.classList.remove('drag');
        th.removeEventListener('pointermove', move);
        if (!hover) show(false);
      };
      th.addEventListener('pointermove', move);
      th.addEventListener('pointerup', end, { once: true });
      th.addEventListener('pointercancel', end, { once: true });
    }, { signal: ac.signal });
  }

  return {
    thumbs: [thumb.y, thumb.x],
    update,
    destroy() {
      clearTimeout(hideTimer);
      if (frame) cancelAnimationFrame(frame);
      ac.abort();
      thumb.y.remove();
      thumb.x.remove();
      host.classList.remove('mmdx-oscroll');
    },
  };
}
