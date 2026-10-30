// Pan and zoom (A.2 rows 17–18), shared by the viewer and the editor canvas. Instance-scoped; destroy() removes
// every listener and observer.
import type { Rect } from '../core/types.js';

export interface ViewState {
  k: number;
  tx: number;
  ty: number;
}

export type WheelMode = 'ctrl' | 'always' | 'never';

export interface ViewportOptions {
  minK?: number;
  maxK?: number;
  /** Margin kept around the content by fit(), in screen px. */
  pad?: number;
  /**
   * `ctrl`: only ⌘/Ctrl+wheel (and trackpad pinch) zooms; plain scrolling is left to the page, so a docs page never
   * traps the scroll. `always`: plain wheel pans and ⌘/Ctrl+wheel zooms (editor). `never`: wheel is ignored.
   */
  wheel?: WheelMode;
  /** Primary-button drag on the element pans (viewer, Hand tool). */
  panOnDrag?: boolean;
  /** Extra insets (open side panels) that fit() keeps clear, in screen px. */
  insets?: () => { left: number; right: number; top: number; bottom: number };
  onChange?: (v: ViewState) => void;
  reducedMotion?: boolean;
}

export class Viewport {
  readonly state: ViewState = { k: 1, tx: 0, ty: 0 };
  /** Keep fitting the content (e.g. on resize) until the user pans or zooms. */
  auto = true;
  private bounds: Rect | null = null;
  private drag: { x: number; y: number; tx: number; ty: number; id: number } | null = null;
  private gestureScale = 1;
  private readonly ro: ResizeObserver | null;
  private readonly ac = new AbortController();
  private readonly o: Required<Omit<ViewportOptions, 'insets' | 'onChange'>> & {
    insets: ViewportOptions['insets'] | undefined;
    onChange: ViewportOptions['onChange'] | undefined;
  };

  constructor(private readonly el: Element, opts: ViewportOptions = {}) {
    this.o = {
      minK: opts.minK ?? 0.1,
      maxK: opts.maxK ?? 4,
      pad: opts.pad ?? 20,
      wheel: opts.wheel ?? 'ctrl',
      panOnDrag: opts.panOnDrag ?? true,
      reducedMotion: opts.reducedMotion ?? false,
      insets: opts.insets,
      onChange: opts.onChange,
    };
    const sig = { signal: this.ac.signal };
    el.addEventListener('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false, signal: this.ac.signal });
    el.addEventListener('pointerdown', (e) => this.onDown(e as PointerEvent), sig);
    el.addEventListener('pointermove', (e) => this.onMove(e as PointerEvent), sig);
    el.addEventListener('pointerup', () => this.endDrag(), sig);
    el.addEventListener('pointercancel', () => this.endDrag(), sig);
    // Safari trackpad pinch
    el.addEventListener('gesturestart', (e) => { e.preventDefault(); this.gestureScale = 1; }, sig);
    el.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const p = this.local(g);
      this.zoomAt(g.scale / this.gestureScale, p.x, p.y);
      this.gestureScale = g.scale;
    }, sig);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (this.auto) this.fit(); }) : null;
    this.ro?.observe(el);
  }

  setOptions(opts: Partial<Pick<ViewportOptions, 'wheel' | 'panOnDrag'>>): void {
    if (opts.wheel) this.o.wheel = opts.wheel;
    if (opts.panOnDrag !== undefined) this.o.panOnDrag = opts.panOnDrag;
  }

  get size(): { w: number; h: number } {
    const r = this.el.getBoundingClientRect();
    return { w: r.width || (this.el as HTMLElement).clientWidth || 0, h: r.height || (this.el as HTMLElement).clientHeight || 0 };
  }

  /** Sets the content box; fits when it is the first content, when `fit` is asked, or while in auto mode. */
  setBounds(b: Rect, opts: { fit?: boolean } = {}): void {
    const first = !this.bounds;
    this.bounds = b;
    if (first || opts.fit || this.auto) this.fit();
  }

  fit(): void {
    const b = this.bounds;
    if (!b || !b.w || !b.h) return;
    const { w, h } = this.size;
    if (!w || !h) return;
    const ins = this.o.insets?.() ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const aw = Math.max(40, w - ins.left - ins.right - 2 * this.o.pad);
    const ah = Math.max(40, h - ins.top - ins.bottom - 2 * this.o.pad);
    const k = clampK(Math.min(aw / b.w, ah / b.h), this.o.minK, this.o.maxK);
    this.auto = true;
    this.set({
      k,
      tx: ins.left + this.o.pad + (aw - b.w * k) / 2 - b.x * k,
      ty: ins.top + this.o.pad + (ah - b.h * k) / 2 - b.y * k,
    });
  }

  zoomAt(f: number, x: number, y: number): void {
    const v = this.state;
    const k = clampK(v.k * f, this.o.minK, this.o.maxK);
    this.auto = false;
    this.set({ k, tx: x - (x - v.tx) * (k / v.k), ty: y - (y - v.ty) * (k / v.k) });
  }

  zoomTo(k: number): void {
    const { w, h } = this.size;
    this.zoomAt(k / this.state.k, w / 2, h / 2);
  }

  panBy(dx: number, dy: number): void {
    this.auto = false;
    this.set({ k: this.state.k, tx: this.state.tx + dx, ty: this.state.ty + dy });
  }

  set(v: ViewState): void {
    this.state.k = v.k;
    this.state.tx = v.tx;
    this.state.ty = v.ty;
    this.o.onChange?.(this.state);
  }

  /** Screen (client) point → diagram coordinates. */
  toDiagram(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.el.getBoundingClientRect(), v = this.state;
    return { x: (clientX - r.left - v.tx) / v.k, y: (clientY - r.top - v.ty) / v.k };
  }

  /** Starts a pan drag from a pointer event (Hand tool, Space+drag, middle button, empty canvas). */
  startPan(ev: PointerEvent): void {
    try {
      (this.el as Element & { setPointerCapture(id: number): void }).setPointerCapture(ev.pointerId);
    } catch {
      // the pointer may already be released
    }
    this.drag = { x: ev.clientX, y: ev.clientY, tx: this.state.tx, ty: this.state.ty, id: ev.pointerId };
    this.el.classList.add('panning');
  }

  get panning(): boolean {
    return this.drag !== null;
  }

  destroy(): void {
    this.ac.abort();
    this.ro?.disconnect();
  }

  private local(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  private onWheel(ev: WheelEvent): void {
    const zoom = ev.ctrlKey || ev.metaKey;
    if (this.o.wheel === 'never' || (this.o.wheel === 'ctrl' && !zoom)) return;
    ev.preventDefault();
    const p = this.local(ev);
    // trackpad pinch arrives as Ctrl+wheel with small steps: zoom faster per step
    if (zoom) this.zoomAt(Math.exp(-ev.deltaY * (Math.abs(ev.deltaY) < 40 ? 0.012 : 0.0022)), p.x, p.y);
    else this.panBy(-ev.deltaX, -ev.deltaY);
  }

  private onDown(ev: PointerEvent): void {
    const middle = ev.button === 1;
    if (!middle && (ev.button !== 0 || !this.o.panOnDrag)) return;
    ev.preventDefault(); // no text selection while panning
    this.startPan(ev);
  }

  private onMove(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== ev.pointerId) return;
    this.auto = false;
    this.set({ k: this.state.k, tx: d.tx + ev.clientX - d.x, ty: d.ty + ev.clientY - d.y });
  }

  private endDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.el.classList.remove('panning');
  }
}

const clampK = (k: number, min: number, max: number): number => Math.min(max, Math.max(min, k));
