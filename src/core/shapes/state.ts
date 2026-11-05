// The shapes a state diagram draws (T09) beyond the 17: start (`sm-circ`), end (`fr-circ`), fork / join (`fork`),
// choice and note. They are entries of the catalogue's extended set (more.ts lists them in catalogue order); the state
// view kind registers just these five with their names, so a viewer's first state diagram draws its pseudo-states
// without loading the rest of the extended shapes.
import { el } from '../scene/build.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import { ink, paint, penShape, rectOutline } from './draw.js';
import { EXTENDED_NAMES } from './names.js';
import { registerShapeNames, registerShapes } from './registry.js';
import type { ShapeBody, ShapeDef } from './types.js';

const ellipse = (cx: number, cy: number, rx: number, ry: number, attrs: SvgAttrs): SceneNode =>
  el('ellipse', { cx, cy, rx: Math.max(0, rx), ry: Math.max(0, ry), ...attrs });

export const SM_CIRC: ShapeBody = penShape({
  id: 'sm-circ', name: 'Start', title: 'Small circle', category: 'basic',
  size: { w: 18, h: 18 }, below: true,
  body: (p, w, h) => p.M(0, -h / 2).A(w / 2, h / 2, 0, 1, 0, h / 2).A(w / 2, h / 2, 0, 1, 0, -h / 2).Z(),
  marks: (p, w, h) => p.M(0, -h / 2).A(w / 2, h / 2, 0, 1, 0, h / 2).A(w / 2, h / 2, 0, 1, 0, -h / 2).Z(),
  fit: () => ({ w: 18, h: 18 }),
});

export const FR_CIRC: ShapeBody = {
  id: 'fr-circ', name: 'Stop', title: 'Framed circle', category: 'basic',
  size: { w: 18, h: 18 }, below: true,
  draw: (b, st, extra) => [ellipse(b.x, b.y, b.w / 2, b.h / 2, { ...paint(st, extra) }), ellipse(b.x, b.y, (b.w * 5) / 14, (b.h * 5) / 14, { ...ink(st) })],
  outline: () => 'ellipse',
  fit: () => ({ w: 18, h: 18 }),
};

export const FORK: ShapeBody = {
  id: 'fork', name: 'Fork / join', title: 'Filled rectangle', category: 'process', size: { w: 70, h: 10 }, below: true,
  draw: (b, st, extra) => [el('rect', { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: 1, ...paint(st, extra), fill: st.stroke ?? '#222' })],
  outline: rectOutline,
  fit: () => ({ w: 70, h: 10 }),
};

export const CHOICE: ShapeBody = penShape({
  id: 'choice', name: 'Choice', title: 'Small diamond', category: 'annotation', size: { w: 28, h: 28 }, below: true,
  body: (p, w, h) => p.M(0, -h / 2).L(w / 2, 0).L(0, h / 2).L(-w / 2, 0).Z(),
  fit: () => ({ w: 28, h: 28 }),
});

export const NOTE: ShapeBody = ((): ShapeBody => {
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
})();

/** Makes the five drawable, with their names (idempotent). */
export function registerStateShapes(): void {
  // every extended name first, so the catalogue keeps its order whichever kind loads first
  registerShapeNames(EXTENDED_NAMES);
  const names = new Map(EXTENDED_NAMES.map((n) => [n.id, n]));
  const defs: ShapeDef[] = [SM_CIRC, FR_CIRC, FORK, CHOICE, NOTE].map((b) => ({ ...names.get(b.id)!, ...b }));
  registerShapes(defs);
}
