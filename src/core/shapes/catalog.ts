// The shape catalogue (T02): every shape any diagram type draws, in one table — the 17 shapes mmdx drew before, the
// rest of Mermaid 11.17's flowchart shapes, and the figures, state and media shapes of the other kinds. Parsing reads
// the names alone (core/shapes/registry.ts); drawing, edge clipping, the editor's palette, toolbar and Properties panel
// and the theme editor read the entries. Importing it registers the geometry of every entry (core/shapes/extended.ts),
// so the viewer, which loads that geometry on demand, does not import it; the media kit comes with core/extras.ts.
import { BASE } from './base.js';
import { EXTENDED } from './extended.js';
import { registerShapes } from './registry.js';
import type { ShapeCategory, ShapeDef } from './types.js';

export type { ShapeCategory, ShapeDef, ShapeId, Size } from './types.js';

/** Every catalogue entry, in palette order within each category. */
export const SHAPES: readonly ShapeDef[] = [...BASE, ...EXTENDED];

/** The categories a flowchart offers in its shape pickers, in order. */
export const PICKER_CATEGORIES: readonly ShapeCategory[] = ['basic', 'process', 'technical', 'annotation'];

registerShapes(EXTENDED);

export { byShapeId, knownShape, resolveShape, shapeById, shapeDef, shapeIdOf } from './registry.js';

/** The entries of a category, in order. */
export const shapesIn = (cat: ShapeCategory): ShapeDef[] => SHAPES.filter((s) => s.category === cat);

/** What a flowchart's shape pickers list (the toolbar, Properties, the theme editor's shape tabs): the palette categories, in order. */
export const pickerShapes = (): ShapeDef[] => PICKER_CATEGORIES.flatMap(shapesIn);

/** The editor's Shapes menu of common shapes, in its order, with its labels. */
export const menuShapes = (): { def: ShapeDef; label: string }[] =>
  SHAPES.filter((s) => s.menu).sort((a, b) => a.menu![0] - b.menu![0]).map((def) => ({ def, label: def.menu![1] }));

/**
 * The shapes a sequence participant takes (their own names): Mermaid's 8 types first (`box` is `participant`, the
 * rectangle; `database` the cylinder; `queue` the horizontal cylinder; actor, boundary, control and entity the
 * figures), written to the code as Mermaid writes them (T10.2), then the looks only mmdx draws (metadata `shape`).
 * `hcyl`, the queue's look from before the types, is still read (the code's `queue` when the shape is chosen again).
 */
export const PARTICIPANT_SHAPES: readonly (readonly [name: string, label: string])[] = [
  ['box', 'Participant'], ['actor', 'Actor'], ['boundary', 'Boundary'], ['control', 'Control'], ['entity', 'Entity'], ['database', 'Database'],
  ['collections', 'Collections'], ['queue', 'Queue'], ['rounded', 'Rounded'], ['stadium', 'Stadium'],
];
