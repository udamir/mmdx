// The flowchart shapes Mermaid 11.17 has and mmdx did not draw before the catalogue (T02.2), 11.15–11.17's additions
// included. Proportions follow Mermaid's `rendering-elements/shapes/*.ts` (MIT); sizes are mmdx's: each shape grows
// around its label box (`fit`) and says where the label goes (`textBox`). Shapes Mermaid draws without a label (bolts,
// junctions, bars) keep their own size, and mmdx puts a label under them. Their names are in names.ts (the parser reads
// them without this geometry, which the viewer loads on demand, T02.9).
import { el, text } from '../scene/build.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import { box, detail, ink, P, paint, penShape, rectOutline } from './draw.js';
import { Pen } from './pen.js';
import type { ShapeBody } from './types.js';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The sampled outline of a path-builder geometry (shapes drawn as SVG elements, whose outline is a path). */
function sample(g: (p: Pen) => void): readonly { x: number; y: number }[] {
  const p = new Pen();
  g(p);
  return p.pts;
}

/** A rectangle path (corners at ±w/2, ±h/2 from (cx, cy)). */
const rectPath = (p: Pen, cx: number, cy: number, w: number, h: number): Pen =>
  p.M(cx - w / 2, cy - h / 2).L(cx + w / 2, cy - h / 2).L(cx + w / 2, cy + h / 2).L(cx - w / 2, cy + h / 2).Z();

/** A rounded rectangle path. */
function roundPath(p: Pen, x0: number, y0: number, x1: number, y1: number, r: number): Pen {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return p.M(x0 + r, y0).L(x1 - r, y0).A(r, r, 0, 1, x1, y0 + r).L(x1, y1 - r).A(r, r, 0, 1, x1 - r, y1).L(x0 + r, y1).A(r, r, 0, 1, x0, y1 - r).L(x0, y0 + r).A(r, r, 0, 1, x0 + r, y0).Z();
}

/** The document outline (a wavy bottom) in the box x0…x1 × y0…y1, as the `document` shape draws it. */
function docPath(p: Pen, x0: number, y0: number, x1: number, y1: number): Pen {
  const w = x1 - x0, k = (y1 - y0) * 0.12;
  return p.M(x0, y0).L(x1, y0).L(x1, y1 - k).Q(x0 + w * 0.75, y1 - 3 * k, x0 + w / 2, y1 - k).Q(x0 + w / 4, y1 + k, x0, y1 - k).Z();
}

const STACK = 6;
const DOCK = (h: number): number => (h - 2 * STACK) * 0.12;

/** The left curly brace of a comment (x: where its tips are, facing right; dir -1 mirrors it). */
function brace(p: Pen, x: number, h: number, r: number, dir: 1 | -1): void {
  const hh = h / 2, s = dir;
  p.M(x + s * 2 * r, -hh).Q(x + s * r, -hh, x + s * r, -hh + r).L(x + s * r, -r).Q(x + s * r, 0, x, 0).Q(x + s * r, 0, x + s * r, r).L(x + s * r, hh - r).Q(x + s * r, hh, x + s * 2 * r, hh);
}
const braceR = (h: number, w: number): number => clamp(h * 0.1, 5, Math.max(5, Math.min(w / 6, h / 4)));

/** Spikes (bang) or bumps (cloud) around an ellipse: n arcs between points on it, bulging in (0) or out (1). */
function around(p: Pen, rx: number, ry: number, n: number, bulge: 0 | 1, k: number): void {
  const pt = (i: number): [number, number] => [rx * Math.cos((i / n) * Math.PI * 2 - Math.PI / 2), ry * Math.sin((i / n) * Math.PI * 2 - Math.PI / 2)];
  const [x0, y0] = pt(0);
  p.M(x0, y0);
  for (let i = 1; i <= n; i++) {
    const [ax, ay] = pt(i - 1), [x, y] = pt(i);
    const r = Math.hypot(x - ax, y - ay) * k;
    p.A(r, r, 0, bulge, x, y);
  }
  p.Z();
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, attrs: SvgAttrs): SceneNode =>
  el('ellipse', { cx, cy, rx: Math.max(0, rx), ry: Math.max(0, ry), ...attrs });

export const MORE: readonly ShapeBody[] = [
  // ---- basic
  penShape({
    id: 'text', name: 'Text block', category: 'basic', size: { w: 120, h: 40 },
    body: (p, w, h) => rectPath(p, 0, 0, w, h), open: 'none',
  }),
  penShape({
    id: 'tri', name: 'Extract', title: 'Triangle', category: 'basic', size: { w: 120, h: 90 },
    body: (p, w, h) => p.M(0, -h / 2).L(w / 2, h / 2).L(-w / 2, h / 2).Z(),
    fit: (w, h) => ({ w: w * 2, h: h * 2 }),
    textBox: (w, h) => box(-w / 4, 0, w / 4, h / 2),
  }),
  penShape({
    id: 'flip-tri', name: 'Manual file', title: 'Flipped triangle', category: 'basic', size: { w: 120, h: 90 },
    body: (p, w, h) => p.M(-w / 2, -h / 2).L(w / 2, -h / 2).L(0, h / 2).Z(),
    fit: (w, h) => ({ w: w * 2, h: h * 2 }),
    textBox: (w, h) => box(-w / 4, -h / 2, w / 4, 0),
  }),
  penShape({
    id: 'notch-pent', name: 'Loop limit', title: 'Trapezoidal pentagon', category: 'basic', size: { w: 120, h: 64 },
    body: (p, w, h) => p.M(-w * 0.4, -h / 2).L(w * 0.4, -h / 2).L(w / 2, -h * 0.3).L(w / 2, h / 2).L(-w / 2, h / 2).L(-w / 2, -h * 0.3).Z(),
    fit: (w, h) => ({ w, h: h * 1.25 }),
    textBox: (w, h) => box(-w / 2, -h * 0.3, w / 2, h / 2),
  }),
  penShape({
    id: 'bolt', name: 'Communication link', title: 'Lightning bolt', category: 'basic', size: { w: 35, h: 70 }, below: true,
    body: (p, w, h) => {
      const g = Math.min(7, w / 5), hw = w / 2, hh = h / 2;
      p.M(hw, -hh).L(-hw, g / 2).L(hw - 2 * g, g / 2).L(-hw, hh).L(hw, -g / 2).L(-hw + 2 * g, -g / 2).Z();
    },
    fit: () => ({ w: 35, h: 70 }),
  }),
  penShape({
    id: 'sm-circ', name: 'Start', title: 'Small circle', category: 'basic',
    size: { w: 18, h: 18 }, below: true,
    body: (p, w, h) => p.M(0, -h / 2).A(w / 2, h / 2, 0, 1, 0, h / 2).A(w / 2, h / 2, 0, 1, 0, -h / 2).Z(),
    marks: (p, w, h) => p.M(0, -h / 2).A(w / 2, h / 2, 0, 1, 0, h / 2).A(w / 2, h / 2, 0, 1, 0, -h / 2).Z(),
    fit: () => ({ w: 18, h: 18 }),
  }),
  {
    id: 'fr-circ', name: 'Stop', title: 'Framed circle', category: 'basic',
    size: { w: 18, h: 18 }, below: true,
    draw: (b, st, extra) => [ellipse(b.x, b.y, b.w / 2, b.h / 2, { ...paint(st, extra) }), ellipse(b.x, b.y, (b.w * 5) / 14, (b.h * 5) / 14, { ...ink(st) })],
    outline: () => 'ellipse',
    fit: () => ({ w: 18, h: 18 }),
  },
  {
    id: 'f-circ', name: 'Junction', title: 'Filled circle', category: 'basic', size: { w: 14, h: 14 }, below: true,
    draw: (b, st, extra) => [ellipse(b.x, b.y, b.w / 2, b.h / 2, { ...paint(st, extra), fill: st.stroke ?? '#222' })],
    outline: () => 'ellipse',
    fit: () => ({ w: 14, h: 14 }),
  },
  // ---- process
  penShape({
    id: 'lin-rect', name: 'Lined / shaded process', title: 'Lined rectangle',
    category: 'process', size: { w: 128, h: 56 },
    body: (p, w, h) => rectPath(p, 0, 0, w, h),
    lines: (p, w, h) => p.M(-w / 2 + 8, -h / 2).L(-w / 2 + 8, h / 2),
    fit: (w, h) => ({ w: w + 8, h }),
    textBox: (w, h) => box(-w / 2 + 8, -h / 2, w / 2, h / 2),
  }),
  penShape({
    id: 'div-rect', name: 'Divided process', title: 'Divided rectangle',
    category: 'process', size: { w: 120, h: 66 },
    body: (p, w, h) => rectPath(p, 0, 0, w, h),
    lines: (p, w, h) => p.M(-w / 2, -h / 2 + h / 6).L(w / 2, -h / 2 + h / 6),
    fit: (w, h) => ({ w, h: h * 1.2 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + h / 6, w / 2, h / 2),
  }),
  penShape({
    id: 'win-pane', name: 'Internal storage', title: 'Window pane', category: 'process', size: { w: 130, h: 66 },
    body: (p, w, h) => rectPath(p, 0, 0, w, h),
    lines: (p, w, h) => p.M(-w / 2, -h / 2 + 10).L(w / 2, -h / 2 + 10).M(-w / 2 + 10, -h / 2).L(-w / 2 + 10, h / 2),
    fit: (w, h) => ({ w: w + 10, h: h + 10 }),
    textBox: (w, h) => box(-w / 2 + 10, -h / 2 + 10, w / 2, h / 2),
  }),
  penShape({
    id: 'delay', name: 'Delay', title: 'Half-rounded rectangle', category: 'process', size: { w: 130, h: 56 },
    body: (p, w, h) => {
      const r = Math.min(h / 2, w / 2);
      p.M(-w / 2, -h / 2).L(w / 2 - r, -h / 2).A(r, h / 2, 0, 1, w / 2 - r, h / 2).L(-w / 2, h / 2).Z();
    },
    fit: (w, h) => ({ w: w + h / 4, h }),
    textBox: (w, h) => box(-w / 2, -h / 2, w / 2 - Math.min(h / 2, w / 2) / 2, h / 2),
  }),
  penShape({
    id: 'curv-trap', name: 'Display', title: 'Curved trapezoid', category: 'process', size: { w: 150, h: 56 },
    body: (p, w, h) => {
      const r = Math.min(h / 2, w / 3), t = Math.min(h / 4, w / 4);
      p.M(-w / 2, 0).L(-w / 2 + t, -h / 2).L(w / 2 - r, -h / 2).A(r, h / 2, 0, 1, w / 2 - r, h / 2).L(-w / 2 + t, h / 2).Z();
    },
    fit: (w, h) => ({ w: w + h * 0.75, h }),
    textBox: (w, h) => box(-w / 2 + Math.min(h / 4, w / 4), -h / 2, w / 2 - Math.min(h / 2, w / 3) / 2, h / 2),
  }),
  penShape({
    id: 'sl-rect', name: 'Manual input', title: 'Sloped rectangle', category: 'process', size: { w: 120, h: 72 },
    body: (p, w, h) => p.M(-w / 2, -h / 2 + h / 3).L(w / 2, -h / 2).L(w / 2, h / 2).L(-w / 2, h / 2).Z(),
    fit: (w, h) => ({ w, h: h * 1.5 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + h / 3, w / 2, h / 2),
  }),
  ((): ShapeBody => {
    // Mermaid: ry = h / 2, rx = ry / (2.5 + h / 50)
    const rxOf = (w: number, h: number): number => Math.min(h / 2 / (2.5 + h / 50), w / 6);
    return penShape({
      id: 'bow-rect', name: 'Stored data', title: 'Bow tie rectangle', category: 'process', size: { w: 130, h: 56 },
      body: (p, w, h) => {
        const rx = rxOf(w, h), hw = w / 2, hh = h / 2;
        p.M(hw, -hh).L(-hw + rx, -hh).A(rx, hh, 0, 0, -hw + rx, hh).L(hw, hh).A(rx, hh, 0, 1, hw, -hh).Z();
      },
      fit: (w, h) => ({ w: w + 2 * Math.min(h / 2 / (2.5 + h / 50), w / 4), h }),
      textBox: (w, h) => box(-w / 2 + rxOf(w, h), -h / 2, w / 2 - rxOf(w, h), h / 2),
    });
  })(),
  penShape({
    id: 'docs', name: 'Multi-document', title: 'Stacked document', category: 'process', size: { w: 132, h: 76 },
    behind: [
      (p, w, h) => docPath(p, -w / 2 + 2 * STACK, -h / 2, w / 2, h / 2 - 2 * STACK),
      (p, w, h) => docPath(p, -w / 2 + STACK, -h / 2 + STACK, w / 2 - STACK, h / 2 - STACK),
    ],
    body: (p, w, h) => docPath(p, -w / 2, -h / 2 + 2 * STACK, w / 2 - 2 * STACK, h / 2),
    hull: (p, w, h) => {
      const hw = w / 2, hh = h / 2, s = STACK, k = DOCK(h), fw = w - 2 * s;
      p.M(-hw, -hh + 2 * s).L(-hw + s, -hh + 2 * s).L(-hw + s, -hh + s).L(-hw + 2 * s, -hh + s).L(-hw + 2 * s, -hh).L(hw, -hh).L(hw, hh - 2 * s - k)
        .L(hw - s, hh - 2 * s - k).L(hw - s, hh - s - k).L(hw - 2 * s, hh - s - k).L(hw - 2 * s, hh - k)
        .Q(-hw + fw * 0.75, hh - 3 * k, -hw + fw / 2, hh - k).Q(-hw + fw / 4, hh + k, -hw, hh - k).Z();
    },
    fit: (w, h) => ({ w: w + 2 * STACK, h: h + 2 * STACK + h * 0.12 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + 2 * STACK, w / 2 - 2 * STACK, h / 2 - DOCK(h)),
  }),
  penShape({
    id: 'st-rect', name: 'Multi-process', title: 'Stacked rectangle', category: 'process', size: { w: 130, h: 66 },
    behind: [
      (p, w, h) => rectPath(p, 5, -5, w - 10, h - 10),
      (p, w, h) => rectPath(p, 0, 0, w - 10, h - 10),
    ],
    body: (p, w, h) => rectPath(p, -5, 5, w - 10, h - 10),
    hull: (p, w, h) => {
      const hw = w / 2, hh = h / 2;
      p.M(-hw, -hh + 10).L(-hw + 5, -hh + 10).L(-hw + 5, -hh + 5).L(-hw + 10, -hh + 5).L(-hw + 10, -hh).L(hw, -hh).L(hw, hh - 10).L(hw - 5, hh - 10).L(hw - 5, hh - 5).L(hw - 10, hh - 5).L(hw - 10, hh).L(-hw, hh).Z();
    },
    fit: (w, h) => ({ w: w + 10, h: h + 10 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + 10, w / 2 - 10, h / 2),
  }),
  penShape({
    id: 'tag-doc', name: 'Tagged document', category: 'process', size: { w: 120, h: 64 },
    body: (p, w, h) => docPath(p, -w / 2, -h / 2, w / 2, h / 2),
    lines: (p, w, h) => {
      const t = Math.min(w, h) * 0.22, k = h * 0.12;
      p.M(w / 2 - t, h / 2 - k).L(w / 2, h / 2 - k - t);
    },
    fit: (w, h) => ({ w, h: h * 1.14 }),
    textBox: (w, h) => box(-w / 2, -h / 2, w / 2, h / 2 - h * 0.12),
  }),
  penShape({
    id: 'tag-rect', name: 'Tagged process', title: 'Tagged rectangle', category: 'process', size: { w: 120, h: 56 },
    body: (p, w, h) => rectPath(p, 0, 0, w, h),
    lines: (p, w, h) => {
      const t = Math.min(w, h) * 0.22;
      p.M(w / 2 - t, h / 2).L(w / 2, h / 2 - t);
    },
  }),
  penShape({
    id: 'lin-doc', name: 'Lined document', category: 'process', size: { w: 128, h: 64 },
    body: (p, w, h) => docPath(p, -w / 2, -h / 2, w / 2, h / 2),
    lines: (p, w, h) => p.M(-w / 2 + 8, -h / 2).L(-w / 2 + 8, h / 2 - h * 0.12),
    fit: (w, h) => ({ w: w + 8, h: h * 1.14 }),
    textBox: (w, h) => box(-w / 2 + 8, -h / 2, w / 2, h / 2 - h * 0.12),
  }),
  penShape({
    id: 'flag', name: 'Paper tape', title: 'Flag', category: 'process', size: { w: 120, h: 70 },
    body: (p, w, h) => {
      const a = h / 14, hw = w / 2, hh = h / 2;
      p.M(-hw, -hh + a).Q(-hw + w / 4, -hh - a, 0, -hh + a).Q(hw - w / 4, -hh + 3 * a, hw, -hh + a).L(hw, hh - a)
        .Q(hw - w / 4, hh - 3 * a, 0, hh - a).Q(-hw + w / 4, hh + a, -hw, hh - a).Z();
    },
    fit: (w, h) => ({ w, h: h * 1.4 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + h / 7, w / 2, h / 2 - h / 7),
  }),
  ...([['brace', 'Comment', 1, 0], ['brace-r', 'Comment right', 0, 1], ['braces', 'Comment with braces on both sides', 1, 1]] as const).map(
    ([id, name, l, r]): ShapeBody => penShape({
      id, name, title: 'Curly brace', category: 'process', size: { w: 120, h: 56 },
      body: (p, w, h) => rectPath(p, 0, 0, w, h), open: 'none',
      lines: (p, w, h) => {
        const k = braceR(h, w);
        if (l) brace(p, -w / 2, h, k, 1);
        if (r) brace(p, w / 2, h, k, -1);
      },
      fit: (w, h) => ({ w: w + (l + r) * 2 * braceR(h, w), h }),
      textBox: (w, h) => box(-w / 2 + l * 2 * braceR(h, w), -h / 2, w / 2 - r * 2 * braceR(h, w), h / 2),
    }),
  ),
  {
    id: 'cross-circ', name: 'Summary', title: 'Crossed circle', category: 'process', size: { w: 60, h: 60 }, below: true,
    draw: (b, st, extra) => {
      const dx = (b.w / 2) * Math.SQRT1_2, dy = (b.h / 2) * Math.SQRT1_2;
      const d = `M${P(b.x - dx, b.y - dy)} L${P(b.x + dx, b.y + dy)} M${P(b.x + dx, b.y - dy)} L${P(b.x - dx, b.y + dy)}`;
      return [ellipse(b.x, b.y, b.w / 2, b.h / 2, { ...paint(st, extra) }), el('path', { d, ...detail(st) })];
    },
    outline: () => 'ellipse',
    fit: () => ({ w: 60, h: 60 }),
  },
  {
    id: 'fork', name: 'Fork / join', title: 'Filled rectangle', category: 'process', size: { w: 70, h: 10 }, below: true,
    draw: (b, st, extra) => [el('rect', { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: 1, ...paint(st, extra), fill: st.stroke ?? '#222' })],
    outline: rectOutline,
    fit: () => ({ w: 70, h: 10 }),
  },
  penShape({
    id: 'hourglass', name: 'Collate', title: 'Hourglass', category: 'process', size: { w: 30, h: 30 }, below: true,
    body: (p, w, h) => p.M(-w / 2, -h / 2).L(w / 2, -h / 2).L(-w / 2, h / 2).L(w / 2, h / 2).Z(),
    fit: () => ({ w: 30, h: 30 }),
  }),
  // ---- technical
  ((): ShapeBody => {
    const ryOf = (h: number): number => Math.min(9, h * 0.16);
    return penShape({
      id: 'lin-cyl', name: 'Disk storage', title: 'Lined cylinder', category: 'technical', size: { w: 120, h: 76 },
      body: (p, w, h) => {
        const ry = ryOf(h), hw = w / 2, hh = h / 2;
        p.M(-hw, -hh + ry).A(hw, ry, 0, 1, hw, -hh + ry).L(hw, hh - ry).A(hw, ry, 0, 1, -hw, hh - ry).Z();
      },
      lines: (p, w, h) => {
        const ry = ryOf(h), hw = w / 2, hh = h / 2;
        p.M(-hw, -hh + ry).A(hw, ry, 0, 0, hw, -hh + ry).M(-hw, -hh + 2.2 * ry).A(hw, ry, 0, 0, hw, -hh + 2.2 * ry);
      },
      fit: (w, h) => ({ w, h: h + 6 }),
      textBox: (w, h) => box(-w / 2, -h / 2 + 3.2 * Math.min(9, h * 0.16), w / 2, h / 2 - 2),
    });
  })(),
  penShape({
    id: 'datastore', name: 'Data store', category: 'technical', size: { w: 120, h: 56 },
    body: (p, w, h) => rectPath(p, 0, 0, w, h), open: 'fill',
    lines: (p, w, h) => p.M(-w / 2, -h / 2).L(w / 2, -h / 2).M(-w / 2, h / 2).L(w / 2, h / 2),
  }),
  ((): ShapeBody => {
    const tab = (h: number): number => clamp(h * 0.14, 8, 14);
    return penShape({
      id: 'folder', name: 'Folder', category: 'technical', size: { w: 120, h: 66 },
      body: (p, w, h) => {
        const t = tab(h), tw = Math.min(w / 2, Math.max(w * 0.38, 28)), hw = w / 2, hh = h / 2;
        p.M(-hw, -hh).L(-hw + tw, -hh).L(-hw + tw, -hh + t).L(hw, -hh + t).L(hw, hh).L(-hw, hh).Z();
      },
      fit: (w, h) => ({ w, h: h + 12 }),
      textBox: (w, h) => box(-w / 2, -h / 2 + tab(h), w / 2, h / 2),
    });
  })(),
  ((): ShapeBody => {
    const rim = (w: number): number => clamp(w * 0.08, 5, 12);
    return penShape({
      id: 'bucket', name: 'Bucket', category: 'technical', size: { w: 120, h: 76 },
      body: (p, w, h) => {
        const r = rim(w), hw = w / 2, hh = h / 2, bw = w * 0.36;
        p.M(-hw, -hh + r).L(-bw, hh - r).A(bw, r, 0, 0, bw, hh - r).L(hw, -hh + r).A(hw, r, 0, 0, -hw, -hh + r).Z();
      },
      lines: (p, w, h) => {
        const r = rim(w), hw = w / 2, hh = h / 2;
        p.M(-hw, -hh + r).A(hw, r, 0, 0, hw, -hh + r);
      },
      fit: (w, h) => ({ w: w / 0.86, h: h + 2 * rim(w / 0.86) }),
      textBox: (w, h) => box(-w * 0.4, -h / 2 + 2 * rim(w), w * 0.4, h / 2 - rim(w)),
    });
  })(),
  {
    id: 'console', name: 'Console', title: 'Terminal window', category: 'technical', size: { w: 130, h: 76 },
    draw: (b, st, extra) => {
      const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
      return [
        el('rect', { x: x0, y: y0, width: b.w, height: b.h, rx: Math.min(12, b.w / 2, b.h / 2), ...paint(st, extra) }),
        text({ x: x0 + 12, y: y0 + 16, fill: st.stroke ?? '#222', 'font-family': 'monospace', 'font-weight': 700, 'font-size': 14, 'fill-opacity': st.strokeOpacity }, [{ text: '>_', x: x0 + 12, y: y0 + 16 }]),
      ];
    },
    outline: (w, h) => sample((p) => roundPath(p, -w / 2, -h / 2, w / 2, h / 2, Math.min(12, w / 2, h / 2))),
    fit: (w, h) => ({ w: Math.max(w, 60), h: h + 20 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + 20, w / 2, h / 2),
  },
  {
    id: 'browser', name: 'Browser', title: 'Browser window', category: 'technical', size: { w: 140, h: 76 },
    draw: (b, st, extra) => {
      const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2, bar = 18;
      const out: SceneNode[] = [
        el('rect', { x: x0, y: y0, width: b.w, height: b.h, rx: Math.min(12, b.w / 2, b.h / 2), ...paint(st, extra) }),
        el('path', { d: `M${x0},${y0 + bar} L${x0 + b.w},${y0 + bar}`, ...detail(st), 'stroke-width': 1 }),
      ];
      for (let i = 0; i < 3; i++) out.push(el('circle', { cx: x0 + 12 + i * 9, cy: y0 + bar / 2, r: 2.5, ...ink(st) }));
      out.push(el('rect', { x: x0 + 44, y: y0 + 4, width: Math.max(b.w - 56, 10), height: bar - 8, rx: 3, ...detail(st), 'stroke-width': 1, opacity: 0.6 }));
      return out;
    },
    outline: (w, h) => sample((p) => roundPath(p, -w / 2, -h / 2, w / 2, h / 2, Math.min(12, w / 2, h / 2))),
    fit: (w, h) => ({ w: Math.max(w, 90), h: h + 18 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + 18, w / 2, h / 2),
  },
  ((): ShapeBody => {
    // Mermaid: head radius 23 % of the width (16…56), overlapping the body by 27 % of it; body corners 17.7 % of the width
    const head = (w: number, h: number): { r: number; ov: number; top: number; br: number } => {
      const r = clamp(w * 0.23, 16, 56), ov = r * 0.27;
      return { r, ov, top: -h / 2 + 2 * r - ov, br: Math.min(w * 0.177, (h / 2 + h / 2 - (2 * r - ov)) * 0.45) };
    };
    const hull = (p: Pen, w: number, h: number): void => {
      const { r, top, br } = head(w, h), hw = w / 2, hh = h / 2, hc = -hh + r;
      const xh = Math.sqrt(Math.max(0, r * r - (top - hc) * (top - hc)));
      p.M(-hw, top + br).A(br, br, 0, 1, -hw + br, top).L(-xh, top).A(r, r, 1, 1, xh, top).L(hw - br, top).A(br, br, 0, 1, hw, top + br)
        .L(hw, hh - br).A(br, br, 0, 1, hw - br, hh).L(-hw + br, hh).A(br, br, 0, 1, -hw, hh - br).Z();
    };
    return {
      id: 'person', name: 'Person', category: 'technical', size: { w: 100, h: 110 },
      draw: (b, st, extra) => {
        const { r, top, br } = head(b.w, b.h), pa = paint(st, extra);
        return [
          el('rect', { x: b.x - b.w / 2, y: b.y + top, width: b.w, height: Math.max(0, b.h / 2 - top), rx: br, ...pa }),
          el('circle', { cx: b.x, cy: b.y - b.h / 2 + r, r, ...pa }),
        ];
      },
      outline: (w, h) => sample((p) => hull(p, w, h)),
      fit: (w, h) => {
        const r = clamp(w * 0.23, 16, 56);
        return { w, h: h + 2 * r - r * 0.27 };
      },
      textBox: (w, h) => box(-w / 2, head(w, h).top, w / 2, h / 2),
    };
  })(),
  penShape({
    id: 'cloud', name: 'Cloud', category: 'technical', size: { w: 150, h: 90 },
    body: (p, w, h) => around(p, w * 0.41, h * 0.37, 9, 1, 0.6),
    fit: (w, h) => ({ w: w * 1.45, h: h * 1.7 }),
    textBox: (w, h) => box(-w * 0.34, -h * 0.29, w * 0.34, h * 0.29),
  }),
  penShape({
    id: 'bang', name: 'Bang', category: 'technical', size: { w: 150, h: 100 },
    body: (p, w, h) => around(p, w / 2, h / 2, 14, 0, 0.75),
    fit: (w, h) => ({ w: w * 1.5, h: h * 1.9 }),
    textBox: (w, h) => box(-w * 0.33, -h * 0.26, w * 0.33, h * 0.26),
  }),
  // ---- annotations (also the state diagram's choice and notes)
  penShape({
    id: 'choice', name: 'Choice', title: 'Small diamond', category: 'annotation', size: { w: 28, h: 28 }, below: true,
    body: (p, w, h) => p.M(0, -h / 2).L(w / 2, 0).L(0, h / 2).L(-w / 2, 0).Z(),
    fit: () => ({ w: 28, h: 28 }),
  }),
  ((): ShapeBody => {
    const fold = (w: number, h: number): number => Math.min(12, w / 4, h / 3);
    return penShape({
      id: 'note', name: 'Note', title: 'Folded corner', category: 'annotation', size: { w: 120, h: 56 },
      body: (p, w, h) => {
        const f = fold(w, h);
        p.M(-w / 2, -h / 2).L(w / 2 - f, -h / 2).L(w / 2, -h / 2 + f).L(w / 2, h / 2).L(-w / 2, h / 2).Z();
      },
      lines: (p, w, h) => {
        const f = fold(w, h);
        p.M(w / 2 - f, -h / 2).L(w / 2 - f, -h / 2 + f).L(w / 2, -h / 2 + f);
      },
    });
  })(),
];
