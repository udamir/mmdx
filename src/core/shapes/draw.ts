// Drawing helpers of the shape catalogue: the painted outline, detail lines and filled marks, and the entry builder for
// shapes written with the path builder (one geometry function gives the drawn path and the outline).
import { el } from '../scene/build.js';
import { fmt } from '../scene/serialize.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import type { CenterBox, Point, Rect } from '../types.js';
import { Pen } from './pen.js';
import type { ShapeBody } from './types.js';
import { dashAttrs } from '../render/dash.js';

export const P = (x: number, y: number): string => `${fmt(x)},${fmt(y)}`;

/** The outline's paint: fill, border and the item's own extras. */
export function paint(st: StyleProps, extra: SvgAttrs): SvgAttrs {
  return {
    fill: st.fill ?? '#fff',
    stroke: st.stroke ?? '#222',
    'stroke-width': st.strokeWidth ?? 1.5,
    ...dashAttrs(st.dash, st.strokeWidth ?? 1.5),
    'fill-opacity': st.fillOpacity,
    'stroke-opacity': st.strokeOpacity,
    ...extra,
  };
}

/** Inner lines in the border colour (no fill). */
export const line = (st: StyleProps): SvgAttrs => ({ fill: 'none', stroke: st.stroke, 'stroke-width': st.strokeWidth ?? 1.5 });

/** Inner lines of the shapes the catalogue added (the border colour's default too). */
export const detail = (st: StyleProps): SvgAttrs => ({ fill: 'none', stroke: st.stroke ?? '#222', 'stroke-width': st.strokeWidth ?? 1.5, 'stroke-opacity': st.strokeOpacity });

/** Marks filled with the border colour (dots, bars, the filled circles). */
export const ink = (st: StyleProps): SvgAttrs => ({ fill: st.stroke ?? '#222', stroke: 'none', 'fill-opacity': st.strokeOpacity });

/** An invisible box that still takes the pointer (shapes drawn without a border). */
export const hitBox = (b: CenterBox, extra: SvgAttrs): SceneNode =>
  el('rect', { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, fill: 'transparent', stroke: 'none', ...extra });

/** A rectangle's outline, relative to the centre. */
export const rectOutline = (w: number, h: number): Point[] => [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];

/** A box relative to the centre from its edges. */
export const box = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) });

type Geo = (p: Pen, w: number, h: number) => void;

export interface PenShape extends Omit<ShapeBody, 'draw' | 'outline'> {
  /** The outline (its first subpath), painted with the style. */
  body: Geo;
  /** Lines drawn on top in the border colour. */
  lines?: Geo;
  /** Marks filled with the border colour. */
  marks?: Geo;
  /** Drawn before the body (stacked copies), painted like it. */
  behind?: Geo[];
  /** The outline when it is not the body's (stacked copies). */
  hull?: Geo;
  /** No border on the body (a comment's brace, a text block): only its fill, or nothing. */
  open?: 'fill' | 'none';
}

/** A catalogue entry (without its names) from path-builder geometry. */
export function penShape(o: PenShape): ShapeBody {
  const { body, lines, marks, behind, hull, open, ...rest } = o;
  return {
    ...rest,
    draw(b, st, extra) {
      const pen = (g: Geo): string => {
        const p = new Pen(b.x, b.y);
        g(p, b.w, b.h);
        return p.d;
      };
      const out: SceneNode[] = [];
      for (const g of behind ?? []) out.push(el('path', { d: pen(g), 'stroke-linejoin': 'round', ...paint(st, {}), 'stroke-dasharray': undefined, 'stroke-linecap': undefined }));
      const pa = paint(st, extra);
      out.push(el('path', { d: pen(body), 'stroke-linejoin': 'round', ...pa, ...(open ? { stroke: 'none' } : {}), ...(open === 'none' ? { fill: 'transparent' } : {}) }));
      if (lines) out.push(el('path', { d: pen(lines), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...detail(st), ...dashAttrs(st.dash, st.strokeWidth ?? 1.5) }));
      if (marks) out.push(el('path', { d: pen(marks), ...ink(st) }));
      return out;
    },
    outline(w, h) {
      const p = new Pen();
      (hull ?? body)(p, w, h);
      return p.pts;
    },
  };
}
