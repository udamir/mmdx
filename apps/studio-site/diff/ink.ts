// Review ink: freehand strokes drawn over the diagram, in diagram coordinates. One list of strokes is painted into
// every visible canvas (both side-by-side panes, overlay, swipe layers, every morph state), so a circle drawn in
// one view marks the same spot in all of them and stays put while panning and zooming.
import { svgEl } from './canvas.js';

export interface Stroke {
  color: string;
  size: number;
  pts: { x: number; y: number }[];
}

export const INK_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#8e4ec6', '#1d2330'] as const;
export const INK_SIZES = [2, 4, 8] as const;

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

const strokePath = (s: Stroke) => svgEl('path', { d: pathOf(s.pts), stroke: s.color, 'stroke-width': s.size, class: 'ink-stroke' });

export class Ink {
  private svgs = new Set<SVGSVGElement>();

  constructor(
    readonly strokes: Stroke[],
    private readonly opts: { active: () => boolean; color: () => string; size: () => number; onChange: () => void },
  ) {}

  /** Paints the strokes into `svg` and lets the user draw on it while the pen is active. */
  attach(svg: SVGSVGElement): void {
    this.svgs.add(svg);
    this.paint(svg);
    let cur: { stroke: Stroke; path: SVGPathElement } | null = null;
    const at = (e: PointerEvent) => {
      const m = svg.getScreenCTM()?.inverse();
      const p = new DOMPoint(e.clientX, e.clientY);
      return m ? p.matrixTransform(m) : p;
    };
    svg.addEventListener('pointerdown', (e) => {
      if (!this.opts.active() || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      svg.setPointerCapture(e.pointerId);
      const p = at(e);
      const stroke: Stroke = { color: this.opts.color(), size: this.opts.size(), pts: [{ x: p.x, y: p.y }] };
      const path = strokePath(stroke);
      this.layer(svg).append(path);
      cur = { stroke, path };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const p = at(e), l = cur.stroke.pts[cur.stroke.pts.length - 1]!;
      const k = svg.getScreenCTM()?.a ?? 1;
      if (Math.hypot(p.x - l.x, p.y - l.y) * k < 1.5) return;
      cur.stroke.pts.push({ x: p.x, y: p.y });
      cur.path.setAttribute('d', pathOf(cur.stroke.pts));
    });
    const end = () => {
      if (!cur) return;
      this.strokes.push(cur.stroke);
      cur = null;
      this.paintAll();
      this.opts.onChange();
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  private layer(svg: SVGSVGElement): SVGGElement {
    let g = svg.querySelector<SVGGElement>(':scope > g.ink');
    if (!g) {
      g = svgEl('g', { class: 'ink' });
      svg.append(g);
    }
    return g;
  }

  /** Re-paints one canvas (after its content was replaced, e.g. a morph step). */
  paint(svg: SVGSVGElement): void {
    svg.querySelector(':scope > g.ink')?.remove();
    const g = this.layer(svg);
    for (const s of this.strokes) g.append(strokePath(s));
  }

  paintAll(): void {
    for (const svg of this.svgs) if (svg.isConnected) this.paint(svg);
      else this.svgs.delete(svg);
  }

  undo(): void {
    this.strokes.pop();
    this.paintAll();
    this.opts.onChange();
  }

  clear(): void {
    this.strokes.length = 0;
    this.paintAll();
    this.opts.onChange();
  }

  reset(): void {
    this.svgs.clear();
  }
}
