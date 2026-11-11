// Magic pen (A.2 row 26): freehand strokes over the diagram that fade a few seconds after they are drawn.
// Strokes live in the canvases' ink layer (never in the diagram or its metadata), in diagram coordinates, so they stay
// on the right spot while panning or zooming.
import type { StorageAdapter } from '../adapters/storage.js';

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

const pick = <T>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);

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
  private readonly fadeTimers = new Map<Stroke, ReturnType<typeof setTimeout>>();
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
      this.countDown(stroke);
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
    // every stroke counts down anew from the new time, or stops counting with auto erase off (B21)
    for (const s of this.strokes) this.countDown(s);
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
    this.fadeTimers.clear();
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

  /** A stroke's auto-erase countdown, one per stroke: (re)started with the current time, or cancelled when it is off. */
  private countDown(stroke: Stroke): void {
    const t = this.fadeTimers.get(stroke);
    if (t !== undefined) {
      clearTimeout(t);
      this.timers.delete(t);
      this.fadeTimers.delete(stroke);
    }
    if (!this.fade) return;
    const next = setTimeout(() => {
      this.timers.delete(next);
      this.fadeTimers.delete(stroke);
      this.expire(stroke);
    }, this.fade);
    this.timers.add(next);
    this.fadeTimers.set(stroke, next);
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

