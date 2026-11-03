// Shapes of the other diagram types (T02.8, geometry only: their kinds draw them by name in T08–T11): the sequence
// participant figures (Mermaid draws `database` and `queue` participants as the cylinder and the horizontal cylinder,
// which are catalogue entries already), the mindmap's default node, and the frames of icon and image nodes (T06).
// None has a Mermaid flowchart name but `icon`, so a flowchart keeps them in metadata.
import { el, g } from '../scene/build.js';
import { fmt } from '../scene/serialize.js';
import { box, detail, hitBox, P, penShape, rectOutline } from './draw.js';
import type { ShapeDef } from './types.js';

/** Figures stroked in the border colour on an invisible hit box (their label goes under them). */
const figure = (o: Omit<ShapeDef, 'draw' | 'outline' | 'aliases' | 'category'> & { d(x: number, y: number, w: number, h: number): string }): ShapeDef => {
  const { d, ...rest } = o;
  return {
    ...rest, aliases: [], category: 'figure', below: true,
    draw: (b, st, extra) => [hitBox(b, extra), g({ ...detail(st), 'stroke-width': Math.max(1.5, st.strokeWidth ?? 1.5) }, [el('path', { d: d(b.x, b.y, b.w, b.h) })])],
    outline: rectOutline,
    fit: () => o.size,
  };
};

/** A circle path (two arcs) of radius r around (cx, cy). */
const circle = (cx: number, cy: number, r: number): string => `M${P(cx, cy - r)} A${fmt(r)},${fmt(r)} 0 1 1 ${P(cx, cy + r)} A${fmt(r)},${fmt(r)} 0 1 1 ${P(cx, cy - r)} Z`;

export const FIGURES: readonly ShapeDef[] = [
  figure({
    id: 'actor', name: 'Actor', title: 'Stick figure', size: { w: 30, h: 52 },
    d: (x, y, w, h) => {
      const top = y - h / 2, r = w * 0.27, neck = top + 2 * r, hip = top + h * 0.66;
      return `${circle(x, top + r, r)} M${P(x, neck)} L${P(x, hip)} M${P(x - w / 2, top + h * 0.45)} L${P(x + w / 2, top + h * 0.45)} M${P(x, hip)} L${P(x - w * 0.42, y + h / 2)} M${P(x, hip)} L${P(x + w * 0.42, y + h / 2)}`;
    },
  }),
  figure({
    id: 'boundary', name: 'Boundary', size: { w: 44, h: 30 },
    d: (x, y, w, h) => {
      const r = h / 2, cx = x + w / 2 - r;
      return `${circle(cx, y, r)} M${P(x - w / 2, y - h / 2)} L${P(x - w / 2, y + h / 2)} M${P(x - w / 2, y)} L${P(cx - r, y)}`;
    },
  }),
  figure({
    id: 'control', name: 'Control', size: { w: 30, h: 32 },
    d: (x, y, w, h) => {
      const r = Math.min(w, h - 2) / 2, cy = y + 1;
      return `${circle(x, cy, r)} M${P(x + 4, cy - r - 4)} L${P(x - 2, cy - r)} L${P(x + 4, cy - r + 4)}`;
    },
  }),
  figure({
    id: 'entity', name: 'Entity', size: { w: 30, h: 34 },
    d: (x, y, w, h) => {
      const r = Math.min(w / 2, (h - 4) / 2);
      return `${circle(x, y - h / 2 + r, r)} M${P(x - w / 2, y + h / 2)} L${P(x + w / 2, y + h / 2)}`;
    },
  }),
  penShape({
    id: 'collections', aliases: [], name: 'Collections', title: 'Stacked boxes', category: 'figure', size: { w: 124, h: 60 },
    behind: [(p, w, h) => p.M(-w / 2 + 4, -h / 2).L(w / 2, -h / 2).L(w / 2, h / 2 - 4).L(-w / 2 + 4, h / 2 - 4).Z()],
    body: (p, w, h) => p.M(-w / 2, -h / 2 + 4).L(w / 2 - 4, -h / 2 + 4).L(w / 2 - 4, h / 2).L(-w / 2, h / 2).Z(),
    hull: (p, w, h) => p.M(-w / 2, -h / 2 + 4).L(-w / 2 + 4, -h / 2 + 4).L(-w / 2 + 4, -h / 2).L(w / 2, -h / 2).L(w / 2, h / 2 - 4).L(w / 2 - 4, h / 2 - 4).L(w / 2 - 4, h / 2).L(-w / 2, h / 2).Z(),
    fit: (w, h) => ({ w: w + 4, h: h + 4 }),
    textBox: (w, h) => box(-w / 2, -h / 2 + 4, w / 2 - 4, h / 2),
  }),
  // the mindmap's default node: no border, a line under the label
  penShape({
    id: 'mm-default', aliases: [], legacy: ['defaultMindmapNode'], name: 'Mindmap node', title: 'Underlined text', category: 'figure', size: { w: 110, h: 44 },
    body: (p, w, h) => p.M(-w / 2, -h / 2).L(w / 2, -h / 2).L(w / 2, h / 2).L(-w / 2, h / 2).Z(), open: 'fill',
    lines: (p, w, h) => p.M(-w / 2, h / 2).L(w / 2, h / 2),
  }),
  // media frames (T06 draws the icon or the image inside; the label goes under them, Mermaid's `pos: b`)
  penShape({
    id: 'icon', mermaid: 'icon', aliases: [], name: 'Icon', category: 'media', size: { w: 48, h: 48 }, below: true,
    body: (p, w, h) => p.M(-w / 2, -h / 2).L(w / 2, -h / 2).L(w / 2, h / 2).L(-w / 2, h / 2).Z(), open: 'none',
    fit: () => ({ w: 48, h: 48 }),
  }),
  penShape({
    id: 'image', aliases: [], legacy: ['imageSquare'], name: 'Image', category: 'media', size: { w: 96, h: 72 }, below: true,
    body: (p, w, h) => p.M(-w / 2, -h / 2).L(w / 2, -h / 2).L(w / 2, h / 2).L(-w / 2, h / 2).Z(), open: 'none',
    fit: () => ({ w: 96, h: 72 }),
  }),
];
