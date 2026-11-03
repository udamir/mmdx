// Path builder of the shape catalogue (T02): a shape's geometry function writes its path once, in coordinates relative to
// the shape's centre; the same calls give the SVG path (moved to where the shape is drawn) and the polygon that follows
// it for edge clipping, hit testing and highlight frames (curves sampled, arcs at 24 segments a full turn).
import { fmt } from '../scene/serialize.js';
import type { Point } from '../types.js';

const TURN = Math.PI * 2;
const CURVE_STEPS = 10;

export class Pen {
  private readonly parts: string[] = [];
  /** The sampled outline of the first subpath (relative to the centre). */
  readonly pts: Point[] = [];
  private cx = 0;
  private cy = 0;
  private sub = 0;

  /** `ox`, `oy`: where the centre is drawn. */
  constructor(private readonly ox = 0, private readonly oy = 0) {}

  private at(x: number, y: number): string {
    return `${fmt(this.ox + x)},${fmt(this.oy + y)}`;
  }

  private to(x: number, y: number): void {
    if (this.sub === 1) this.pts.push({ x, y });
    this.cx = x;
    this.cy = y;
  }

  M(x: number, y: number): this {
    this.sub++;
    this.parts.push(`M${this.at(x, y)}`);
    this.to(x, y);
    return this;
  }

  L(x: number, y: number): this {
    this.parts.push(`L${this.at(x, y)}`);
    this.to(x, y);
    return this;
  }

  Q(qx: number, qy: number, x: number, y: number): this {
    this.parts.push(`Q${this.at(qx, qy)} ${this.at(x, y)}`);
    const x0 = this.cx, y0 = this.cy;
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS, u = 1 - t;
      this.to(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y);
    }
    return this;
  }

  C(ax: number, ay: number, bx: number, by: number, x: number, y: number): this {
    this.parts.push(`C${this.at(ax, ay)} ${this.at(bx, by)} ${this.at(x, y)}`);
    const x0 = this.cx, y0 = this.cy;
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS, u = 1 - t;
      this.to(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
    }
    return this;
  }

  /** An elliptic arc (no rotation), as SVG's `A rx,ry 0 large sweep x,y`. */
  A(rx: number, ry: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number): this {
    this.parts.push(`A${fmt(rx)},${fmt(ry)} 0 ${large} ${sweep} ${this.at(x, y)}`);
    const x1 = this.cx, y1 = this.cy;
    if (!rx || !ry || (x1 === x && y1 === y)) {
      this.to(x, y);
      return this;
    }
    // endpoint → centre parameterisation (SVG 1.1 F.6.5, no rotation)
    const hx = (x1 - x) / 2, hy = (y1 - y) / 2;
    const lam = (hx * hx) / (rx * rx) + (hy * hy) / (ry * ry);
    if (lam > 1) {
      rx *= Math.sqrt(lam);
      ry *= Math.sqrt(lam);
    }
    const num = rx * rx * ry * ry - rx * rx * hy * hy - ry * ry * hx * hx;
    const den = rx * rx * hy * hy + ry * ry * hx * hx;
    const k = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / (den || 1)));
    const ccx = (k * rx * hy) / ry + (x1 + x) / 2, ccy = (-k * ry * hx) / rx + (y1 + y) / 2;
    const a0 = Math.atan2((y1 - ccy) / ry, (x1 - ccx) / rx);
    let da = Math.atan2((y - ccy) / ry, (x - ccx) / rx) - a0;
    if (sweep && da < 0) da += TURN;
    if (!sweep && da > 0) da -= TURN;
    const n = Math.max(1, Math.ceil((Math.abs(da) / TURN) * 24));
    for (let i = 1; i < n; i++) this.to(ccx + rx * Math.cos(a0 + (da * i) / n), ccy + ry * Math.sin(a0 + (da * i) / n));
    this.to(x, y);
    return this;
  }

  Z(): this {
    this.parts.push('Z');
    return this;
  }

  get d(): string {
    return this.parts.join(' ');
  }
}
