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
import type { SceneNode } from '../core/scene/types.js';
import { patchChildren } from './patch.js';
import type { StrokeStore } from './pen.js';
import { Viewport, type ViewState, type WheelMode } from './viewport.js';
import { signal, type Signal } from '../ui/signal.js';

const NS = 'http://www.w3.org/2000/svg';

/** Styles of the canvas layers every product adopts (ink strokes, the pen cursor). */
export const CANVAS_CSS = /* css */ `
.ink { pointer-events: none; }
.ink path { fill: none; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; opacity: .9; transition: opacity .6s; }
.ink path.fading { opacity: 0; }
svg.pen-on, svg.pen-on * { cursor: crosshair !important; }
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
  /** @deprecated Unused (pan and zoom never animate); kept so callers that pass it compile. */
  reducedMotion?: () => boolean;
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
  private linking = false;
  private readonly unlinks = new Set<() => void>();
  private readonly destroyHooks: (() => void)[] = [];
  private destroyed = false;
  private penActive = false;
  private insetsOverride: (() => Insets) | null = null;

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
      insets: () => (this.insetsOverride ?? o.insets)?.() ?? { left: 0, right: 0, top: 0, bottom: 0 },
      onChange: (v) => this.onChange(v),
    });
    if (this.bounds) this.vpt.setBounds(this.bounds, { fit: true });
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
  }

  /** Painters' output (editor handles, diff highlights). */
  setOverlay(nodes: readonly SceneNode[]): void {
    patchChildren(this.overlay, nodes);
  }

  /** Drops the picture and the patch state (a new scene owner repaints in full). */
  clear(): void {
    this.endMorph();
    for (const g of [this.defs, this.page, this.body, this.runs, this.overlay]) g.replaceChildren();
  }

  /**
   * Hands the content group to a morph between states (the diff's before / merged / after: `new Morph(canvas.defs,
   * canvas.content, …)`); `show()` or `clear()` end it and put the standard layers back.
   */
  setMorph(m: { dispose(): void } | null): void {
    if (this.morphing && this.morphing !== m) this.endMorph();
    this.morphing = m;
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

  /** Sets the content box; fits when asked, on the first content, or while the view follows the content. */
  setBounds(b: Rect, opts: { fit?: boolean } = {}): void {
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

  /** Shares pan and zoom with another canvas (side by side). Returns an unlink; destroying either canvas unlinks too. */
  link(other: DiagramCanvas): () => void {
    this.links.add(other);
    other.links.add(this);
    const off = (): void => {
      this.links.delete(other);
      other.links.delete(this);
      this.unlinks.delete(off);
      other.unlinks.delete(off);
    };
    this.unlinks.add(off);
    other.unlinks.add(off);
    return off;
  }

  /** Runs `f` when the canvas is destroyed (whoever destroys it). */
  onDestroy(f: () => void): void {
    if (this.destroyed) f();
    else this.destroyHooks.push(f);
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
    this.vpt?.destroy();
    this.vpt = null;
    this.svg.remove();
    for (const f of this.destroyHooks.splice(0)) f();
  }

  private onChange(v: ViewState): void {
    this.vp.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`);
    this.svg.style.setProperty('--dx-inv', String(1 / v.k));
    this.view.set({ k: v.k, tx: v.tx, ty: v.ty });
    this.o.onView?.(v);
    if (this.linking) return;
    this.linking = true;
    try {
      for (const o of this.links) {
        if (!o.vpt || !this.vpt) continue;
        o.linking = true;
        try {
          o.vpt.auto = this.vpt.auto;
          o.vpt.set({ ...v });
        } finally {
          o.linking = false;
        }
      }
    } finally {
      this.linking = false;
    }
  }

  /** Non-interactive canvases: the whole page fills the element through the viewBox. */
  private applyStatic(): void {
    if (this.o.interaction !== 'static') return;
    this.vp.removeAttribute('transform');
    this.view.set({ k: 1, tx: 0, ty: 0 });
    const b = this.bounds;
    if (!b) return;
    this.svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
}
