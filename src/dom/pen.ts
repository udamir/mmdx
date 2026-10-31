// Magic pen (A.2 row 26): freehand strokes over the diagram that fade a few seconds after they are drawn.
// Strokes live in their own SVG layer (never in the diagram or its metadata), in diagram coordinates, so they stay
// on the right spot while panning or zooming.
import type { StorageAdapter } from '../adapters/storage.js';
import type { ViewState } from './viewport.js';

export const PEN_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#1a1a1a'] as const;
export const PEN_SIZES = [2, 4, 7] as const;
/** Auto erase after the stroke is finished; 0 = keep until cleared. */
export const PEN_FADES = [5000, 10000, 0] as const;
const FADE_TIME = 600;
const NS = 'http://www.w3.org/2000/svg';

interface PenPrefs {
  color?: string;
  size?: number;
  fade?: number;
}

export interface MagicPen {
  readonly layer: SVGSVGElement;
  readonly active: boolean;
  readonly color: string;
  readonly size: number;
  readonly fade: number;
  setActive(on: boolean): void;
  toggle(): void;
  setColor(c: string): void;
  setSize(s: number): void;
  setFade(ms: number): void;
  hasStrokes(): boolean;
  /** Re-applies the view transform (call on every pan / zoom). */
  sync(): void;
  clear(): void;
  destroy(): void;
}

const pick = <T>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);

export function createMagicPen(opts: {
  container: Element;
  getView: () => ViewState;
  /** Wheel events over the pen layer are forwarded here, so zooming still works while drawing. */
  wheelTarget: Element;
  storage: StorageAdapter;
  reducedMotion?: () => boolean;
  onChange?: () => void;
}): MagicPen {
  const layer = document.createElementNS(NS, 'svg');
  layer.setAttribute('class', 'pen-layer');
  layer.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(NS, 'g');
  layer.append(g);
  opts.container.append(layer);

  const saved = opts.storage.get<PenPrefs>('pen') ?? {};
  const st = {
    active: false,
    color: pick<string>(PEN_COLORS, saved.color, PEN_COLORS[0]),
    size: pick<number>(PEN_SIZES, saved.size, PEN_SIZES[1]),
    fade: pick<number>(PEN_FADES, saved.fade, PEN_FADES[0]),
  };
  let cur: { path: SVGPathElement; pts: { x: number; y: number }[] } | null = null;
  const kept = new Set<SVGPathElement>(); // finished strokes waiting to be cleared by hand (auto erase off)
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  const later = (f: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      f();
    }, ms);
    timers.add(t);
  };
  const toDiagram = (ev: PointerEvent): { x: number; y: number } => {
    const r = layer.getBoundingClientRect(), v = opts.getView();
    return { x: (ev.clientX - r.left - v.tx) / v.k, y: (ev.clientY - r.top - v.ty) / v.k };
  };
  // smooth the polyline with quadratic curves through the midpoints
  const pathOf = (pts: { x: number; y: number }[]): string => {
    const f = pts[0]!;
    if (pts.length === 1) return `M${f.x} ${f.y}l0.01 0`;
    let d = `M${f.x} ${f.y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!, q = pts[i + 1]!;
      d += `Q${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`;
    }
    const l = pts[pts.length - 1]!;
    return `${d}L${l.x} ${l.y}`;
  };

  layer.addEventListener('pointerdown', (ev) => {
    if (!st.active || ev.button !== 0) return;
    ev.preventDefault();
    try {
      layer.setPointerCapture(ev.pointerId);
    } catch {
      // ignore: capture is a nicety
    }
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('stroke', st.color);
    path.setAttribute('stroke-width', String(st.size));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    g.append(path);
    cur = { path, pts: [toDiagram(ev)] };
    path.setAttribute('d', pathOf(cur.pts));
  }, sig);
  layer.addEventListener('pointermove', (ev) => {
    if (!cur) return;
    const p = toDiagram(ev), l = cur.pts[cur.pts.length - 1]!, k = opts.getView().k;
    if (Math.hypot(p.x - l.x, p.y - l.y) * k < 1.5) return;
    cur.pts.push(p);
    cur.path.setAttribute('d', pathOf(cur.pts));
  }, sig);
  const fadeOut = (path: SVGPathElement): void => {
    if (opts.reducedMotion?.()) {
      path.remove();
      return;
    }
    path.style.transition = `opacity ${FADE_TIME}ms ease`;
    path.style.opacity = '0';
    later(() => path.remove(), FADE_TIME + 50);
  };
  const schedule = (path: SVGPathElement): void => {
    if (st.fade) later(() => fadeOut(path), st.fade);
    else kept.add(path);
  };
  const finish = (): void => {
    if (!cur) return;
    const { path } = cur;
    cur = null;
    schedule(path);
  };
  layer.addEventListener('pointerup', finish, sig);
  layer.addEventListener('pointercancel', finish, sig);
  layer.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    opts.wheelTarget.dispatchEvent(new WheelEvent('wheel', ev));
  }, { passive: false, signal: ac.signal });

  const persist = (): void => opts.storage.set('pen', { color: st.color, size: st.size, fade: st.fade });
  const api: MagicPen = {
    layer,
    get active() { return st.active; },
    get color() { return st.color; },
    get size() { return st.size; },
    get fade() { return st.fade; },
    setActive(on) {
      st.active = on;
      layer.classList.toggle('on', on);
      if (!on) finish();
      opts.onChange?.();
    },
    toggle() { api.setActive(!st.active); },
    setColor(c) { st.color = pick<string>(PEN_COLORS, c, st.color); persist(); opts.onChange?.(); },
    setSize(s) { st.size = pick<number>(PEN_SIZES, s, st.size); persist(); opts.onChange?.(); },
    // switching auto erase back on also starts the countdown for strokes that were being kept
    setFade(ms) {
      st.fade = pick<number>(PEN_FADES, ms, st.fade);
      persist();
      if (st.fade) {
        for (const p of kept) schedule(p);
        kept.clear();
      }
      opts.onChange?.();
    },
    hasStrokes() { return g.childElementCount > 0; },
    sync() {
      const v = opts.getView();
      g.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`);
    },
    clear() {
      cur = null;
      kept.clear();
      g.replaceChildren();
    },
    destroy() {
      ac.abort();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      layer.remove();
    },
  };
  api.sync();
  return api;
}

// ---- stroke store (component architecture §6) ------------------------------------------------------------------------

export interface Stroke {
  id: number;
  color: string;
  size: number;
  pts: { x: number; y: number }[];
}

/** A canvas the strokes are painted into and drawn on (DiagramCanvas.attachInk). */
export interface InkSurface {
  /** Receives the pointer events while the pen is active. */
  svg: SVGSVGElement;
  /** The layer (inside the viewport group, in diagram coordinates) the strokes are painted into. */
  layer: SVGGElement;
  toDiagram(clientX: number, clientY: number): { x: number; y: number };
  scale(): number;
}

/**
 * The magic pen's strokes and settings: strokes in diagram coordinates, painted into every attached canvas (both
 * side-by-side panes, every morph state, the main canvas), so a mark stays on its spot while panning and zooming in
 * all of them. Colour, size and auto erase are remembered (`pen` in storage). Strokes are never saved.
 */
export class StrokeStore {
  active = false;
  color: string;
  size: number;
  fade: number;
  private readonly strokes: Stroke[] = [];
  private surfaces: InkSurface[] = [];
  private nextId = 1;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: StorageAdapter, private readonly reducedMotion: () => boolean = () => false) {
    const saved = storage.get<PenPrefs>('pen') ?? {};
    this.color = pick<string>(PEN_COLORS, saved.color, PEN_COLORS[0]);
    this.size = pick<number>(PEN_SIZES, saved.size, PEN_SIZES[1]);
    this.fade = pick<number>(PEN_FADES, saved.fade, PEN_FADES[0]);
  }

  /** Calls `f` after every change (strokes, settings, active). Returns an unsubscribe. */
  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Paints the strokes into a surface and lets the user draw on it while the pen is active. Returns a detach. */
  attach(c: InkSurface): () => void {
    this.surfaces.push(c);
    this.paint(c);
    const ac = new AbortController();
    let cur: { stroke: Stroke; path: SVGPathElement } | null = null;
    // capture phase on the canvas itself: drawing wins over panning, selecting and gestures
    c.svg.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        c.svg.setPointerCapture(e.pointerId);
      } catch {
        // capture is best-effort
      }
      const stroke: Stroke = { id: this.nextId++, color: this.color, size: this.size, pts: [c.toDiagram(e.clientX, e.clientY)] };
      const path = this.pathEl(stroke);
      c.layer.append(path);
      cur = { stroke, path };
    }, { capture: true, signal: ac.signal });
    c.svg.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const p = c.toDiagram(e.clientX, e.clientY), l = cur.stroke.pts[cur.stroke.pts.length - 1]!;
      if (Math.hypot(p.x - l.x, p.y - l.y) * c.scale() < 1.5) return;
      cur.stroke.pts.push(p);
      cur.path.setAttribute('d', pathOf(cur.stroke.pts));
    }, { signal: ac.signal });
    const end = (): void => {
      if (!cur) return;
      const { stroke } = cur;
      cur = null;
      this.strokes.push(stroke);
      this.paintAll();
      this.changed();
      if (this.fade) this.later(() => this.expire(stroke), this.fade);
    };
    c.svg.addEventListener('pointerup', end, { signal: ac.signal });
    c.svg.addEventListener('pointercancel', end, { signal: ac.signal });
    return () => {
      ac.abort();
      this.surfaces = this.surfaces.filter((x) => x !== c);
      c.layer.replaceChildren();
    };
  }

  setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    this.changed();
  }

  toggle(): void {
    this.setActive(!this.active);
  }

  setColor(c: string): void {
    this.color = pick<string>(PEN_COLORS, c, this.color);
    this.persist();
  }

  setSize(s: number): void {
    this.size = pick<number>(PEN_SIZES, s, this.size);
    this.persist();
  }

  /** Switching auto erase back on starts the countdown for the strokes that were kept. */
  setFade(ms: number): void {
    this.fade = pick<number>(PEN_FADES, ms, this.fade);
    this.persist();
    if (this.fade) for (const s of this.strokes) this.later(() => this.expire(s), this.fade);
  }

  hasStrokes(): boolean {
    return this.strokes.length > 0;
  }

  /** Removes the last stroke; false when there is none. */
  undo(): boolean {
    if (!this.strokes.pop()) return false;
    this.paintAll();
    this.changed();
    return true;
  }

  clear(): void {
    if (!this.strokes.length) return;
    this.strokes.length = 0;
    this.paintAll();
    this.changed();
  }

  /** Re-paints every surface (after a morph step replaced a canvas' content). */
  paintAll(): void {
    for (const c of this.surfaces) this.paint(c);
  }

  destroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.surfaces = [];
    this.listeners.clear();
  }

  private changed(): void {
    for (const f of [...this.listeners]) f();
  }

  private persist(): void {
    this.storage.set('pen', { color: this.color, size: this.size, fade: this.fade });
    this.changed();
  }

  private paint(c: InkSurface): void {
    c.layer.replaceChildren(...this.strokes.map((s) => this.pathEl(s)));
  }

  private pathEl(s: Stroke): SVGPathElement {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', pathOf(s.pts));
    p.setAttribute('stroke', s.color);
    p.setAttribute('stroke-width', String(s.size));
    p.setAttribute('data-sid', String(s.id));
    return p;
  }

  private later(f: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      f();
    }, ms);
    this.timers.add(t);
  }

  /** Auto erase: the stroke fades out in every surface, then goes. */
  private expire(stroke: Stroke): void {
    if (!this.strokes.includes(stroke)) return;
    const remove = (): void => {
      const i = this.strokes.indexOf(stroke);
      if (i < 0) return;
      this.strokes.splice(i, 1);
      this.paintAll();
      this.changed();
    };
    if (this.reducedMotion()) return remove();
    for (const c of this.surfaces) for (const p of c.layer.querySelectorAll(`[data-sid="${stroke.id}"]`)) p.classList.add('fading');
    this.later(remove, FADE_TIME);
  }
}

/** Smooth path through the points (quadratic curves through the midpoints). */
function pathOf(pts: readonly { x: number; y: number }[]): string {
  const f = pts[0]!;
  if (pts.length === 1) return `M${f.x} ${f.y}l0.01 0`;
  let d = `M${f.x} ${f.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!, q = pts[i + 1]!;
    d += `Q${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`;
  }
  const l = pts[pts.length - 1]!;
  return `${d}L${l.x} ${l.y}`;
}

/** What the pen options read and set. */
export type PenSettings = Pick<StrokeStore, 'color' | 'size' | 'fade' | 'setColor' | 'setSize' | 'setFade' | 'clear'>;
