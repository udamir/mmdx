// The 17 shapes mmdx drew before the catalogue (T02.1): their drawing is the renderer's former switch, unchanged (the
// golden SVGs stay byte-identical); outlines, text boxes and sizing rules join them here.
import { el } from '../scene/build.js';
import { fmt } from '../scene/serialize.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import type { CenterBox, Point } from '../types.js';
import { box, line, P, paint, rectOutline } from './draw.js';
import { Pen } from './pen.js';
import type { ShapeDef } from './types.js';

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  b: CenterBox;
  pa: SvgAttrs;
  r: number;
  line: SvgAttrs;
  rect(rx: number): SceneNode;
}

/** The former `shapeNodes` locals: top-left corner, size, paint, radius, inner-line style. */
function frame(b: CenterBox, st: StyleProps, extra: SvgAttrs): Frame {
  const x = b.x - b.w / 2, y = b.y - b.h / 2, w = b.w, h = b.h;
  const pa = paint(st, extra);
  return { x, y, w, h, b, pa, r: st.radius ?? 8, line: line(st), rect: (rx) => el('rect', { x, y, width: w, height: h, rx, ...pa }) };
}

const poly = (...pts: [number, number][]): Point[] => pts.map(([x, y]) => ({ x, y }));

const sampled = (g: (p: Pen) => void): Point[] => {
  const p = new Pen();
  g(p);
  return p.pts;
};

/** A rounded rectangle's outline (stadiums, rounded steps). */
function roundedOutline(w: number, h: number, r: number): Point[] {
  const hw = w / 2, hh = h / 2;
  r = Math.min(r, hw, hh);
  return sampled((p) =>
    p.M(-hw + r, -hh).L(hw - r, -hh).A(r, r, 0, 1, hw, -hh + r).L(hw, hh - r).A(r, r, 0, 1, hw - r, hh).L(-hw + r, hh).A(r, r, 0, 1, -hw, hh - r).L(-hw, -hh + r).A(r, r, 0, 1, -hw + r, -hh).Z());
}

const cylRy = (h: number): number => Math.min(9, h * 0.16);
const hcylRx = (w: number): number => Math.min(10, w * 0.1);
const lean = (w: number, h: number): number => Math.min(h * 0.4, w / 5);

export const BASE: readonly ShapeDef[] = [
  {
    id: 'rect', mermaid: 'rect', aliases: ['proc', 'process', 'rectangle', 'composite'], legacy: ['squareRect'], bracket: ['[', ']'],
    name: 'Process', title: 'Rectangle', category: 'basic', size: { w: 120, h: 56 },
    menu: [0, 'Process'],
    draw: (b, st, extra) => {
      const f = frame(b, st, extra);
      return [f.rect(f.r)];
    },
    outline: rectOutline,
  },
  {
    id: 'rounded', mermaid: 'rounded', aliases: ['event', 'state'], legacy: ['roundedRect'], bracket: ['(', ')'],
    name: 'Event', title: 'Rounded rectangle', category: 'basic', size: { w: 120, h: 56 },
    menu: [1, 'Step'],
    draw: (b, st, extra) => {
      const f = frame(b, st, extra);
      return [f.rect(Math.max(f.r, 14))];
    },
    outline: (w, h) => roundedOutline(w, h, 14),
  },
  {
    id: 'stadium', mermaid: 'stadium', aliases: ['terminal', 'pill'], bracket: ['([', '])'],
    name: 'Terminal point', title: 'Stadium', category: 'basic', size: { w: 120, h: 56 },
    menu: [2, 'Start / End'],
    draw: (b, st, extra) => [frame(b, st, extra).rect(b.h / 2)],
    outline: (w, h) => roundedOutline(w, h, h / 2),
  },
  {
    id: 'subroutine', mermaid: 'fr-rect', aliases: ['subprocess', 'subproc', 'framed-rectangle', 'subroutine'], bracket: ['[[', ']]'],
    name: 'Subprocess', title: 'Framed rectangle', category: 'process', size: { w: 120, h: 56 },
    menu: [8, 'Subprocess'],
    draw: (b, st, extra) => {
      const { x, y, w, h, r, rect } = frame(b, st, extra);
      return [
        rect(Math.min(r, 4)),
        el('path', { d: `M${P(x + 9, y)} V${fmt(y + h)} M${P(x + w - 9, y)} V${fmt(y + h)}`, stroke: st.stroke, 'stroke-width': st.strokeWidth ?? 1.5 }),
      ];
    },
    outline: rectOutline,
  },
  {
    id: 'cylinder', mermaid: 'cyl', aliases: ['db', 'database', 'cylinder'], bracket: ['[(', ')]'],
    name: 'Database', title: 'Cylinder', category: 'technical', size: { w: 120, h: 70 },
    menu: [5, 'Database'],
    draw: (b, st, extra) => {
      const { x, y, w, h, pa, line } = frame(b, st, extra);
      const ry = cylRy(h);
      return [
        el('path', {
          d: `M${P(x, y + ry)} A${fmt(w / 2)},${fmt(ry)} 0 0 1 ${P(x + w, y + ry)} V${fmt(y + h - ry)} A${fmt(w / 2)},${fmt(ry)} 0 0 1 ${P(x, y + h - ry)} Z`,
          ...pa,
        }),
        el('path', { d: `M${P(x, y + ry)} A${fmt(w / 2)},${fmt(ry)} 0 0 0 ${P(x + w, y + ry)}`, ...line }),
      ];
    },
    outline: (w, h) => {
      const hw = w / 2, hh = h / 2, ry = cylRy(h);
      return sampled((p) => p.M(-hw, -hh + ry).A(hw, ry, 0, 1, hw, -hh + ry).L(hw, hh - ry).A(hw, ry, 0, 1, -hw, hh - ry).Z());
    },
    textBox: (w, h) => box(-w / 2, -h / 2 + 10, w / 2, h / 2 - 2),
  },
  {
    id: 'circle', mermaid: 'circle', aliases: ['circ'], bracket: ['((', '))'],
    name: 'Start', title: 'Circle', category: 'basic', size: { w: 70, h: 70 },
    menu: [9, 'Event'],
    draw: (b, st, extra) => [el('ellipse', { cx: b.x, cy: b.y, rx: b.w / 2, ry: b.h / 2, ...paint(st, extra) })],
    outline: () => 'ellipse',
    fit: (w, h) => ({ w: Math.max(w, h), h: Math.max(w, h) }),
    textBox: (w, h) => box(-w * 0.375, -h / 2, w * 0.375, h / 2),
  },
  {
    id: 'doublecircle', mermaid: 'dbl-circ', aliases: ['double-circle', 'doublecircle'], bracket: ['(((', ')))'],
    name: 'Stop', title: 'Double circle', category: 'basic', size: { w: 70, h: 70 },
    draw: (b, st, extra) => {
      const pa = paint(st, extra);
      return [
        el('ellipse', { cx: b.x, cy: b.y, rx: b.w / 2, ry: b.h / 2, ...pa }),
        el('ellipse', { cx: b.x, cy: b.y, rx: b.w / 2 - 5, ry: b.h / 2 - 5, ...line(st) }),
      ];
    },
    outline: () => 'ellipse',
    fit: (w, h) => ({ w: Math.max(w, h), h: Math.max(w, h) }),
    textBox: (w, h) => box(-w * 0.375, -h / 2, w * 0.375, h / 2),
  },
  {
    id: 'diamond', mermaid: 'diam', aliases: ['decision', 'diamond', 'question'], bracket: ['{', '}'],
    name: 'Decision', title: 'Diamond', category: 'basic', size: { w: 140, h: 80 },
    menu: [3, 'Decision'],
    draw: (b, st, extra) => {
      const { x, y, w, h, pa } = frame(b, st, extra);
      return [el('path', { d: `M${P(b.x, y)} L${P(x + w, b.y)} L${P(b.x, y + h)} L${P(x, b.y)} Z`, 'stroke-linejoin': 'round', ...pa })];
    },
    outline: (w, h) => poly([0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]),
    fit: (w, h) => ({ w: Math.max(w * 1.3, h * 1.6), h: Math.max(h * 1.4, 70) }),
    textBox: (w, h) => box(-w / 2.6, -h / 2, w / 2.6, h / 2),
  },
  {
    id: 'hexagon', mermaid: 'hex', aliases: ['hexagon', 'prepare'], bracket: ['{{', '}}'],
    name: 'Prepare conditional', title: 'Hexagon', category: 'basic', size: { w: 140, h: 56 },
    menu: [10, 'Preparation'],
    draw: (b, st, extra) => {
      const { x, y, w, h, pa } = frame(b, st, extra);
      const k = Math.min(h / 2, w / 4);
      return [
        el('path', {
          d: `M${P(x + k, y)} L${P(x + w - k, y)} L${P(x + w, b.y)} L${P(x + w - k, y + h)} L${P(x + k, y + h)} L${P(x, b.y)} Z`,
          'stroke-linejoin': 'round',
          ...pa,
        }),
      ];
    },
    outline: (w, h) => {
      const k = Math.min(h / 2, w / 4);
      return poly([-w / 2 + k, -h / 2], [w / 2 - k, -h / 2], [w / 2, 0], [w / 2 - k, h / 2], [-w / 2 + k, h / 2], [-w / 2, 0]);
    },
    fit: (w, h) => ({ w: w + 30, h }),
    textBox: (w, h) => box(-w / 2 + 15, -h / 2, w / 2 - 15, h / 2),
  },
  ...(['parallelogram', 'parallelogram-alt'] as const).map((id): ShapeDef => {
    const s = id === 'parallelogram';
    return {
      id, mermaid: s ? 'lean-r' : 'lean-l', aliases: s ? ['lean-right', 'in-out'] : ['lean-left', 'out-in'],
      legacy: s ? ['lean_right', 'lean_r'] : ['lean_left', 'lean_l'], bracket: s ? ['[/', '/]'] : ['[\\', '\\]'],
      name: s ? 'Data input / output' : 'Data output / input', title: s ? 'Lean right' : 'Lean left', category: 'basic', size: { w: 130, h: 56 },
      ...(s ? { menu: [4, 'Input / Output'] as const } : {}),
      draw: (b, st, extra) => {
        const { x, y, w, h, pa } = frame(b, st, extra);
        const k = lean(w, h);
        return [el('path', { d: `M${P(x + (s ? k : 0), y)} L${P(x + w - (s ? 0 : k), y)} L${P(x + w - (s ? k : 0), y + h)} L${P(x + (s ? 0 : k), y + h)} Z`, ...pa })];
      },
      outline: (w, h) => {
        const k = lean(w, h), hw = w / 2, hh = h / 2;
        return s ? poly([-hw + k, -hh], [hw, -hh], [hw - k, hh], [-hw, hh]) : poly([-hw, -hh], [hw - k, -hh], [hw, hh], [-hw + k, hh]);
      },
    };
  }),
  ...(['trapezoid', 'trapezoid-alt'] as const).map((id): ShapeDef => {
    const up = id === 'trapezoid';
    return {
      id, mermaid: up ? 'trap-b' : 'trap-t', aliases: up ? ['priority', 'trapezoid-bottom', 'trapezoid'] : ['manual', 'trapezoid-top', 'inv-trapezoid'],
      legacy: up ? ['trap_b'] : ['inv_trapezoid', 'trap_t'], bracket: up ? ['[/', '\\]'] : ['[\\', '/]'],
      name: up ? 'Priority action' : 'Manual operation', title: up ? 'Trapezoid base bottom' : 'Trapezoid base top', category: 'basic', size: { w: 130, h: 56 },
      draw: (b, st, extra) => {
        const { x, y, w, h, pa } = frame(b, st, extra);
        const k = lean(w, h);
        return [el('path', { d: `M${P(x + (up ? k : 0), y)} L${P(x + w - (up ? k : 0), y)} L${P(x + w - (up ? 0 : k), y + h)} L${P(x + (up ? 0 : k), y + h)} Z`, ...pa })];
      },
      outline: (w, h) => {
        const k = lean(w, h), hw = w / 2, hh = h / 2;
        return up ? poly([-hw + k, -hh], [hw - k, -hh], [hw, hh], [-hw, hh]) : poly([-hw, -hh], [hw, -hh], [hw - k, hh], [-hw + k, hh]);
      },
    };
  }),
  {
    id: 'asymmetric', mermaid: 'odd', aliases: [], legacy: ['rect_left_inv_arrow'], bracket: ['>', ']'],
    name: 'Odd', title: 'Flag', category: 'basic', size: { w: 130, h: 56 },
    draw: (b, st, extra) => {
      const { x, y, w, h, pa } = frame(b, st, extra);
      const k = h / 3;
      return [el('path', { d: `M${P(x, y)} L${P(x + w, y)} L${P(x + w, y + h)} L${P(x, y + h)} L${P(x + k, b.y)} Z`, ...pa })];
    },
    outline: (w, h) => poly([-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2 + h / 3, 0]),
  },
  {
    id: 'hcyl', mermaid: 'h-cyl', aliases: ['das', 'horizontal-cylinder'], legacy: ['queue'],
    name: 'Direct access storage', title: 'Horizontal cylinder', category: 'technical', size: { w: 140, h: 56 },
    menu: [6, 'Queue'],
    draw: (b, st, extra) => {
      const { x, y, w, h, pa, line } = frame(b, st, extra);
      const rx = hcylRx(w);
      return [
        el('path', {
          d: `M${P(x + rx, y)} H${fmt(x + w - rx)} A${fmt(rx)},${fmt(h / 2)} 0 0 1 ${P(x + w - rx, y + h)} H${fmt(x + rx)} A${fmt(rx)},${fmt(h / 2)} 0 0 1 ${P(x + rx, y)} Z`,
          ...pa,
        }),
        el('path', { d: `M${P(x + w - rx, y)} A${fmt(rx)},${fmt(h / 2)} 0 0 0 ${P(x + w - rx, y + h)}`, ...line }),
      ];
    },
    outline: (w, h) => {
      const hw = w / 2, hh = h / 2, rx = hcylRx(w);
      return sampled((p) => p.M(-hw + rx, -hh).L(hw - rx, -hh).A(rx, hh, 0, 1, hw - rx, hh).L(-hw + rx, hh).A(rx, hh, 0, 1, -hw + rx, -hh).Z());
    },
    textBox: (w, h) => box(-w / 2, -h / 2, w / 2 - 8, h / 2),
  },
  {
    id: 'document', mermaid: 'doc', aliases: ['doc', 'document'],
    name: 'Document', category: 'process', size: { w: 120, h: 64 },
    menu: [7, 'Document'],
    draw: (b, st, extra) => {
      const { x, y, w, h, pa } = frame(b, st, extra);
      const k = h * 0.12;
      return [el('path', { d: `M${P(x, y)} H${fmt(x + w)} V${fmt(y + h - k)} Q${P(x + w * 0.75, y + h - 3 * k)} ${P(b.x, y + h - k)} T${P(x, y + h - k)} Z`, ...pa })];
    },
    outline: (w, h) => {
      const hw = w / 2, hh = h / 2, k = h * 0.12;
      return sampled((p) => p.M(-hw, -hh).L(hw, -hh).L(hw, hh - k).Q(w / 4, hh - 3 * k, 0, hh - k).Q(-w / 4, hh + k, -hw, hh - k).Z());
    },
  },
  {
    id: 'card', mermaid: 'notch-rect', aliases: ['card', 'notched-rectangle'], legacy: ['notch_rect'],
    name: 'Card', title: 'Notched rectangle', category: 'process', size: { w: 120, h: 56 },
    draw: (b, st, extra) => {
      const { x, y, w, h, pa } = frame(b, st, extra);
      const k = 12;
      return [el('path', { d: `M${P(x + k, y)} H${fmt(x + w)} V${fmt(y + h)} H${fmt(x)} V${fmt(y + k)} Z`, ...pa })];
    },
    outline: (w, h) => poly([-w / 2 + 12, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2 + 12]),
  },
];
