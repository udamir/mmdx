// Review ink of <mmdx-diff> (§3.1, §9.1): the viewer's magic pen, with one shared set of strokes in diagram
// coordinates painted into every canvas (both side-by-side panes and every morph state), so a circle drawn in one
// view marks the same spot in all of them and stays put while panning and zooming. Strokes never touch the diagram.
import type { StorageAdapter } from '../../adapters/storage.js';
import { PEN_COLORS, PEN_FADES, PEN_SIZES } from '../../dom/pen.js';

const NS = 'http://www.w3.org/2000/svg';
const FADE_TIME = 600;

interface Stroke {
  id: number;
  color: string;
  size: number;
  pts: { x: number; y: number }[];
}

interface Canvas {
  svg: SVGSVGElement;
  layer: SVGGElement;
  toDiagram: (clientX: number, clientY: number) => { x: number; y: number };
  scale: () => number;
}

const pick = <T>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);

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

export class DiffInk {
  active = false;
  color: string;
  size: number;
  fade: number;
  private readonly strokes: Stroke[] = [];
  private canvases: Canvas[] = [];
  private nextId = 1;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly storage: StorageAdapter, private readonly onChange: () => void, private readonly reducedMotion: () => boolean) {
    const saved = storage.get<{ color?: string; size?: number; fade?: number }>('pen') ?? {};
    this.color = pick<string>(PEN_COLORS, saved.color, PEN_COLORS[0]);
    this.size = pick<number>(PEN_SIZES, saved.size, PEN_SIZES[1]);
    this.fade = pick<number>(PEN_FADES, saved.fade, PEN_FADES[0]);
  }

  /** Paints the strokes into a canvas and lets the user draw on it while the pen is active. Returns a detach. */
  attach(c: Canvas): () => void {
    this.canvases.push(c);
    this.paint(c);
    const ac = new AbortController();
    let cur: { stroke: Stroke; path: SVGPathElement } | null = null;
    c.svg.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
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
      this.onChange();
      if (this.fade) this.later(() => this.expire(stroke), this.fade);
    };
    c.svg.addEventListener('pointerup', end, { signal: ac.signal });
    c.svg.addEventListener('pointercancel', end, { signal: ac.signal });
    return () => {
      ac.abort();
      this.canvases = this.canvases.filter((x) => x !== c);
    };
  }

  setActive(on: boolean): void {
    this.active = on;
    this.onChange();
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

  undo(): boolean {
    if (!this.strokes.pop()) return false;
    this.paintAll();
    this.onChange();
    return true;
  }

  clear(): void {
    this.strokes.length = 0;
    this.paintAll();
    this.onChange();
  }

  /** Re-paints every canvas (after a morph step replaced a canvas' content). */
  paintAll(): void {
    for (const c of this.canvases) this.paint(c);
  }

  destroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.canvases = [];
  }

  private persist(): void {
    this.storage.set('pen', { color: this.color, size: this.size, fade: this.fade });
    this.onChange();
  }

  private paint(c: Canvas): void {
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

  /** Auto erase: the stroke fades out in every canvas, then goes. */
  private expire(stroke: Stroke): void {
    if (!this.strokes.includes(stroke)) return;
    const remove = (): void => {
      const i = this.strokes.indexOf(stroke);
      if (i < 0) return;
      this.strokes.splice(i, 1);
      this.paintAll();
      this.onChange();
    };
    if (this.reducedMotion()) return remove();
    for (const c of this.canvases) for (const p of c.layer.querySelectorAll(`[data-sid="${stroke.id}"]`)) p.classList.add('fading');
    this.later(remove, FADE_TIME);
  }
}
