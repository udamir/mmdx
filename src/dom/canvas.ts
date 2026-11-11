// DiagramCanvas (component architecture §6): one class for every picture of a diagram — the viewer's, the editor's,
// each pane of the diff and the theme editor's live preview. It owns the SVG layers, the viewport (pan / zoom) or a
// static fit through the viewBox, keyed patching, hit testing, the pen's ink layer, linking with a second canvas
// (side by side), and handing the content to a morph between states.
//
//   svg  > defs
//        > g.vp (pan / zoom transform)
//            > g.content > [g.page-layer, g.body-layer, g.dx-runs, g.overlay]
//            > g.ink
import type { Rect } from '../core/types.js';
import { Owner } from '../reactive/owner.js';
import type { SceneNode } from '../core/scene/types.js';
import { patchChildren } from './patch.js';
import type { StrokeStore } from './pen.js';
import { Viewport, type ViewState, type WheelMode } from './viewport.js';
import { signal, type Signal } from '../reactive/signal.js';

const NS = 'http://www.w3.org/2000/svg';
/** A view shown by CSS during a gesture is written for real once the gesture rests this long (a wheel burst is one zoom). */
const ZOOM_SETTLE_MS = 300, PAN_SETTLE_MS = 150;
/** A pan shown by CSS is written on the way once it has moved this part of the canvas size. */
const PAN_COMMIT = 0.25;

/** Styles of the canvas layers every product adopts (ink strokes, the pen cursor). */
export const CANVAS_CSS = /* css */ `
.ink { pointer-events: none; }
.ink path { fill: none; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; opacity: .9; transition: opacity .6s; }
.ink path.fading { opacity: 0; }
svg.pen-on, svg.pen-on * { cursor: crosshair !important; }
@keyframes mmdx-flow { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .mmdx-flow { animation: mmdx-flow .31s linear infinite; }
  .mmdx-flow-slow { animation-duration: .78s; }
  [data-edge-anim="off"] .mmdx-flow { animation: none; }
}
`;

export type Interaction = 'pan-zoom' | 'static';

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CanvasOptions {
  /** `pan-zoom` (a Viewport) or `static` (fit through the viewBox, no viewport; the viewer's interactive="false"). */
  interaction: Interaction;
  wheel?: WheelMode;
  panOnDrag?: boolean;
  minK?: number;
  maxK?: number;
  pad?: number;
  insets?: () => Insets;
  /** Class of the `<svg>` (`canvas` in the editor, `scene` in the viewer). */
  svgClass?: string;
  /** `part` of the `<svg>`. */
  part?: string;
  /** Class of the page layer (default `page-layer`). */
  pageClass?: string;
  /** Called after every pan / zoom (after the transform is applied). */
  onView?: (v: ViewState) => void;
}

/** What `show()` paints: a render's defs, page and body, plus optional runs and overlay layers. */
export interface CanvasPicture {
  defs: readonly SceneNode[];
  page: readonly SceneNode[];
  body: readonly SceneNode[];
  runs?: readonly SceneNode[];
  overlay?: readonly SceneNode[];
}

/** A saved pan / zoom (History enter / exit). */
export interface ViewSnapshot extends ViewState {
  auto: boolean;
}

export class DiagramCanvas {
  /** Positioned container of the svg (the ink layer, tooltips and inline editors are placed against it). */
  readonly el: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly defs: SVGDefsElement;
  /** The pan / zoom group. */
  readonly vp: SVGGElement;
  /** Holds the picture's layers (replaced by the morph states while morphing). */
  readonly content: SVGGElement;
  readonly page: SVGGElement;
  readonly body: SVGGElement;
  readonly runs: SVGGElement;
  readonly overlay: SVGGElement;
  readonly ink: SVGGElement;
  /** Pan and zoom (k, tx, ty); constant (k = 1) while static. */
  readonly view: Signal<ViewState> = signal<ViewState>({ k: 1, tx: 0, ty: 0 }, (a, b) => a.k === b.k && a.tx === b.tx && a.ty === b.ty);
  private vpt: Viewport | null = null;
  private o: CanvasOptions;
  private bounds: Rect | null = null;
  private morphing: { dispose(): void } | null = null;
  private readonly links = new Set<DiagramCanvas>();
  /** The linked canvases' offsets during a gesture (offsetTo). */
  private readonly offsets = new Map<DiagramCanvas, { x: number; y: number }>();
  private offsetsIdle: ReturnType<typeof setTimeout> | null = null;
  private linking = false;
  private readonly unlinks = new Set<() => void>();
  /** The onDestroy hooks. */
  private readonly hooks = new Owner('canvas');
  private destroyed = false;
  private penActive = false;
  private insetsOverride: (() => Insets) | null = null;
  /** The view the `vp` transform holds; during a gesture the rest of the way is a CSS transform of the svg. */
  private written: ViewState = { k: 1, tx: 0, ty: 0 };
  /** The svg's box without the CSS transform, while one is shown: what every reader of the box gets meanwhile. */
  private unscaled: DOMRect | null = null;
  private settle: ReturnType<typeof setTimeout> | null = null;
  /** Set while a linked canvas passes its gesture on: this one shows it the same cheap way. */
  private following = false;
  /** `--dx-inv` is on the svg (see syncInv). */
  private inv = false;
  /** The layers holding a diff badge, looked up when each is painted (P22: not the whole svg per overlay paint). */
  private readonly badged = new Set<Element>();

  constructor(container: HTMLElement | null, opts: CanvasOptions) {
    this.o = { ...opts };
    const el = (tag: string, cls?: string): SVGGElement => {
      const g = document.createElementNS(NS, tag) as SVGGElement;
      if (cls) g.setAttribute('class', cls);
      return g;
    };
    this.svg = document.createElementNS(NS, 'svg');
    if (opts.svgClass) this.svg.setAttribute('class', opts.svgClass);
    if (opts.part) this.svg.setAttribute('part', opts.part);
    this.defs = document.createElementNS(NS, 'defs');
    this.vp = el('g', 'vp');
    this.content = el('g', 'content');
    this.page = el('g', opts.pageClass ?? 'page-layer');
    this.body = el('g', 'body-layer');
    this.runs = el('g', 'dx-runs');
    this.overlay = el('g', 'overlay');
    this.ink = el('g', 'ink');
    this.content.append(this.page, this.body, this.runs, this.overlay);
    this.vp.append(this.content, this.ink);
    this.svg.append(this.defs, this.vp);
    this.el = container ?? document.createElement('div');
    this.el.append(this.svg);
    // while a gesture is shown by a CSS transform, the svg's box reads as without it: pointer and placement math (here,
    // in the viewport and in the modules) stays in the coordinates of the view state
    const box = this.svg.getBoundingClientRect.bind(this.svg);
    this.svg.getBoundingClientRect = () => this.unscaled ?? box();
    this.setInteraction(opts.interaction);
  }

  /** The viewport (null while static). */
  get viewport(): Viewport | null {
    return this.vpt;
  }

  get interaction(): Interaction {
    return this.o.interaction;
  }

  /** Switches between pan / zoom and a static fit (the viewer toggles it at runtime). */
  setInteraction(i: Interaction): void {
    if (this.vpt && i === 'pan-zoom') return;
    this.o.interaction = i;
    if (i === 'static') {
      this.vpt?.destroy();
      this.vpt = null;
      this.applyStatic();
      return;
    }
    this.svg.removeAttribute('viewBox');
    this.svg.removeAttribute('preserveAspectRatio');
    const o = this.o;
    this.vpt = new Viewport(this.svg, {
      ...(o.wheel ? { wheel: o.wheel } : {}),
      panOnDrag: (o.panOnDrag ?? true) && !this.penActive,
      ...(o.minK !== undefined ? { minK: o.minK } : {}),
      ...(o.maxK !== undefined ? { maxK: o.maxK } : {}),
      ...(o.pad !== undefined ? { pad: o.pad } : {}),
      insets: () => this.insets(),
      onChange: (v) => this.onChange(v),
    });
    if (this.bounds) this.vpt.setBounds(this.bounds, { fit: true });
  }

  /** What fit() keeps clear of: the scene's insets, else the canvas's own option. */
  private insets(): Insets {
    return (this.insetsOverride ?? this.o.insets)?.() ?? { left: 0, right: 0, top: 0, bottom: 0 };
  }

  /** Insets fit() keeps clear, set by the scene that draws here (null: the canvas's own option again). */
  setInsets(f: (() => Insets) | null): void {
    this.insetsOverride = f;
  }

  setOptions(opts: Partial<Pick<CanvasOptions, 'wheel' | 'panOnDrag'>>): void {
    if (opts.wheel) this.o.wheel = opts.wheel;
    if (opts.panOnDrag !== undefined) this.o.panOnDrag = opts.panOnDrag;
    this.vpt?.setOptions({ ...(opts.wheel ? { wheel: opts.wheel } : {}), panOnDrag: (this.o.panOnDrag ?? true) && !this.penActive });
  }

  // ---- painting ---------------------------------------------------------------------------------------------------

  /** Paints a picture (keyed patch: only changed elements are touched). Ends a morph. */
  show(p: CanvasPicture): void {
    this.endMorph();
    patchChildren(this.defs, p.defs);
    patchChildren(this.page, p.page);
    patchChildren(this.body, p.body);
    patchChildren(this.runs, p.runs ?? []);
    if (p.overlay) patchChildren(this.overlay, p.overlay);
    this.syncInv(this.page, this.body, this.runs, ...(p.overlay ? [this.overlay] : []));
  }

  /** Painters' output (editor handles, diff highlights). */
  setOverlay(nodes: readonly SceneNode[]): void {
    patchChildren(this.overlay, nodes);
    this.syncInv(this.overlay);
  }

  /** Drops the picture and the patch state (a new scene owner repaints in full). */
  clear(): void {
    this.endMorph();
    for (const g of [this.defs, this.page, this.body, this.runs, this.overlay]) g.replaceChildren();
    this.badged.clear();
    this.syncInv();
  }

  /**
   * Diff badges keep their size at any zoom through `--dx-inv`. An inherited property on the root restyles every
   * element when it changes, so it is set only while the picture may have badges (a morph's states, or badges drawn
   * here): zooming a plain picture restyles nothing.
   */
  private syncInv(...painted: Element[]): void {
    for (const l of painted) {
      if (l.querySelector('.dx-badge')) this.badged.add(l);
      else this.badged.delete(l);
    }
    const on = !!this.morphing || this.badged.size > 0;
    if (on === this.inv) return;
    this.inv = on;
    if (on) this.svg.style.setProperty('--dx-inv', String(1 / (this.view.peek().k || 1)));
    else this.svg.style.removeProperty('--dx-inv');
  }

  /**
   * Hands the content group to a morph between states (the diff's before / merged / after: `new Morph(canvas.defs,
   * canvas.content, …)`); `show()` or `clear()` end it and put the standard layers back.
   */
  setMorph(m: { dispose(): void } | null): void {
    if (this.morphing && this.morphing !== m) this.endMorph();
    this.morphing = m;
    this.syncInv();
  }

  private endMorph(): void {
    if (!this.morphing) return;
    this.morphing.dispose();
    this.morphing = null;
    this.content.replaceChildren(this.page, this.body, this.runs, this.overlay);
  }

  /** The item an event target belongs to (`data-kind` / `data-id` / `data-key` of the closest item element). */
  itemAt(target: EventTarget | null): { key: string; kind: string; id: string } | null {
    const t = target instanceof Element ? target : null;
    const el = t?.closest('[data-kind][data-id]');
    if (!el || !this.svg.contains(el)) return null;
    const kind = el.getAttribute('data-kind') ?? '';
    const id = el.getAttribute('data-id') ?? '';
    return { key: el.getAttribute('data-key') ?? `${kind}:${id}`, kind, id };
  }

  // ---- view -------------------------------------------------------------------------------------------------------

  /** Sets the content box; fits when asked, on the first content, or while the view follows the content (`animate`: glides). */
  setBounds(b: Rect, opts: { fit?: boolean; animate?: boolean } = {}): void {
    this.bounds = b;
    if (this.vpt) this.vpt.setBounds(b, opts);
    else this.applyStatic();
  }

  /** Fits the content (or the given box) into view. */
  fit(bounds?: Rect): void {
    if (bounds) this.bounds = bounds;
    if (this.vpt) {
      if (bounds) this.vpt.setBounds(bounds, { fit: true });
      else this.vpt.fit();
    } else this.applyStatic();
  }

  zoomBy(f: number): void {
    const v = this.vpt;
    if (!v) return;
    const s = v.size;
    v.zoomAt(f, s.w / 2, s.h / 2);
  }

  zoomTo(k: number): void {
    this.vpt?.zoomTo(k);
  }

  /** Brings a diagram-space box into view when it is not fully visible (keeps the zoom when it fits). */
  focus(box: Rect, margins: Insets = { left: 8, right: 8, top: 8, bottom: 8 }): void {
    const vp = this.vpt;
    if (!vp) return;
    const { w, h } = vp.size, v = vp.state;
    const x0 = box.x * v.k + v.tx, y0 = box.y * v.k + v.ty, x1 = x0 + box.w * v.k, y1 = y0 + box.h * v.k;
    if (x0 >= margins.left && y0 >= margins.top && x1 <= w - margins.right && y1 <= h - margins.bottom) return;
    const k = Math.max(Math.min(v.k, 1), Math.min(1, w / (box.w * 3), h / (box.h * 3)));
    vp.auto = false;
    vp.set({ k, tx: w / 2 - (box.x + box.w / 2) * k, ty: h / 2 - (box.y + box.h / 2) * k });
  }

  saveView(): ViewSnapshot {
    const v = this.vpt;
    return v ? { ...v.state, auto: v.auto } : { k: 1, tx: 0, ty: 0, auto: true };
  }

  restoreView(s: ViewSnapshot): void {
    const v = this.vpt;
    if (!v) return;
    if (s.auto) {
      v.fit();
      return;
    }
    v.auto = false;
    v.set({ k: s.k, tx: s.tx, ty: s.ty });
  }

  /** Client point → diagram coordinates. */
  toDiagram(clientX: number, clientY: number): { x: number; y: number } {
    if (this.vpt) return this.vpt.toDiagram(clientX, clientY);
    const r = this.svg.getBoundingClientRect(), b = this.bounds;
    if (!b || !r.width || !r.height) return { x: clientX - r.left, y: clientY - r.top };
    const k = Math.min(r.width / b.w, r.height / b.h);
    return { x: b.x + (clientX - r.left - (r.width - b.w * k) / 2) / k, y: b.y + (clientY - r.top - (r.height - b.h * k) / 2) / k };
  }

  /** Diagram point → canvas-local px. */
  toScreen(p: { x: number; y: number }): { x: number; y: number } {
    const v = this.view.peek();
    return { x: p.x * v.k + v.tx, y: p.y * v.k + v.ty };
  }

  /**
   * Shares pan and zoom with another canvas (side by side), measured from where each one's free area starts (its left
   * and top insets). Returns an unlink; destroying either canvas unlinks too.
   */
  link(other: DiagramCanvas): () => void {
    this.links.add(other);
    other.links.add(this);
    const off = (): void => {
      this.links.delete(other);
      other.links.delete(this);
      this.offsets.delete(other);
      other.offsets.delete(this);
      this.unlinks.delete(off);
      other.unlinks.delete(off);
    };
    this.unlinks.add(off);
    other.unlinks.add(off);
    return off;
  }

  /** Runs `f` when the canvas is destroyed (whoever destroys it). */
  onDestroy(f: () => void): void {
    this.hooks.add(f);
  }

  /** Paints a stroke store into this canvas's ink layer and draws on it while the pen is active. Returns a detach. */
  attachInk(store: StrokeStore): () => void {
    const detach = store.attach({
      svg: this.svg,
      layer: this.ink,
      toDiagram: (x, y) => this.toDiagram(x, y),
      scale: () => this.view.peek().k,
    });
    // while the pen draws, a drag draws instead of panning
    const sync = (): void => {
      if (this.penActive === store.active) return;
      this.penActive = store.active;
      this.svg.classList.toggle('pen-on', store.active);
      this.setOptions({});
    };
    const off = store.subscribe(sync);
    sync();
    return () => {
      off();
      detach();
      this.penActive = false;
      this.svg.classList.remove('pen-on');
      this.setOptions({});
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.endMorph();
    for (const off of [...this.unlinks]) off();
    if (this.offsetsIdle) clearTimeout(this.offsetsIdle);
    this.offsets.clear();
    this.vpt?.destroy();
    this.vpt = null;
    this.dropCss();
    this.svg.remove();
    this.hooks.dispose();
  }

  /**
   * How far a linked canvas's free area starts from this one's. Insets read the layout (the panels beside a pane), so
   * a gesture reads them once and keeps them while it runs (P9: every wheel or pan event read both); a single change
   * reads them fresh, and a gesture's pause of a quarter second forgets them (a panel may open between two bursts).
   */
  private offsetTo(o: DiagramCanvas, gesture: boolean): { x: number; y: number } {
    let d = gesture ? this.offsets.get(o) : undefined;
    if (!d) {
      const a = this.insets(), b = o.insets();
      d = { x: b.left - a.left, y: b.top - a.top };
    }
    if (this.offsetsIdle) clearTimeout(this.offsetsIdle);
    this.offsetsIdle = null;
    if (!gesture) {
      this.offsets.clear();
      return d;
    }
    this.offsets.set(o, d);
    this.offsetsIdle = setTimeout(() => {
      this.offsetsIdle = null;
      this.offsets.clear();
    }, 250);
    return d;
  }

  /** A wheel or pinch burst, or a pan drag, is running (here or on the linked canvas that passes it on). */
  private get gesture(): boolean {
    return this.following || !!this.vpt?.wheeling || !!this.vpt?.panning;
  }

  /**
   * A new scale makes the engine lay out every text of the scene again (SVG text is sized for the screen scale), and a
   * new translate repaints every item: on a large diagram either takes most of a frame. So a gesture shows the view as
   * a CSS transform of the svg (its own composited layer: no layout, no repaint) and writes the real transform once
   * it rests. A pan that goes far is written on the way, so the strip that was off screen does not stay blank for
   * long. A single change (a button, a fit, a key) is written at once.
   */
  private showView(v: ViewState): void {
    if (!this.gesture) {
      this.writeView(v);
      return;
    }
    const w = this.written, sc = v.k / w.k;
    const dx = v.tx - sc * w.tx, dy = v.ty - sc * w.ty;
    const box = this.unscaled ?? this.svg.getBoundingClientRect();
    if (sc === 1 && (Math.abs(dx) > box.width * PAN_COMMIT || Math.abs(dy) > box.height * PAN_COMMIT)) {
      this.writeView(v);
      return;
    }
    if (!this.unscaled) {
      this.unscaled = box;
      this.svg.style.willChange = 'transform';
      this.svg.style.transformOrigin = '0 0';
    }
    this.svg.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
    if (this.settle) clearTimeout(this.settle);
    this.settle = setTimeout(() => {
      this.settle = null;
      if (this.vpt) this.writeView(this.view.peek());
    }, sc === 1 ? PAN_SETTLE_MS : ZOOM_SETTLE_MS);
  }

  private writeView(v: ViewState): void {
    this.dropCss();
    this.written = { k: v.k, tx: v.tx, ty: v.ty };
    this.vp.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`);
  }

  /** Ends a view shown by CSS (without writing it). */
  private dropCss(): void {
    if (this.settle) clearTimeout(this.settle);
    this.settle = null;
    if (!this.unscaled) return;
    this.unscaled = null;
    for (const p of ['transform', 'transform-origin', 'will-change']) this.svg.style.removeProperty(p);
  }

  private onChange(v: ViewState): void {
    this.showView(v);
    if (this.inv) this.svg.style.setProperty('--dx-inv', String(1 / v.k));
    this.view.set({ k: v.k, tx: v.tx, ty: v.ty });
    this.o.onView?.(v);
    if (this.linking) return;
    this.linking = true;
    const gesture = this.gesture;
    try {
      for (const o of this.links) {
        if (!o.vpt || !this.vpt) continue;
        o.linking = true;
        o.following = gesture;
        try {
          o.vpt.auto = this.vpt.auto;
          // the same view, from where each canvas's free area starts (panes of different widths, side by side)
          const d = this.offsetTo(o, gesture);
          o.vpt.set({ k: v.k, tx: v.tx + d.x, ty: v.ty + d.y });
        } finally {
          o.linking = false;
          o.following = false;
        }
      }
    } finally {
      this.linking = false;
    }
  }

  /** Non-interactive canvases: the whole page fills the element through the viewBox. */
  private applyStatic(): void {
    if (this.o.interaction !== 'static') return;
    this.dropCss();
    this.written = { k: 1, tx: 0, ty: 0 };
    this.vp.removeAttribute('transform');
    this.view.set({ k: 1, tx: 0, ty: 0 });
    const b = this.bounds;
    if (!b) return;
    this.svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
}
