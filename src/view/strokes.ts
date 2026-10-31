// The pen's stroke store of each component (component architecture §6): set by the pen module, read by scenes that
// add canvases (the diff's side-by-side pane) so the strokes show there too. Kept apart from the pen module, so a
// reader does not load the pen. Superseded by the kernel's `core.strokes` signal (set by the pen module too); kept
// until the diff's scene and stage module read that instead.
import type { StrokeStore } from '../dom/pen.js';

/** The component's stroke store (created by the pen module). */
export const strokesOf = new WeakMap<object, StrokeStore>();
