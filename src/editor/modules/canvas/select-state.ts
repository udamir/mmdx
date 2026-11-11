// The state the parts of canvas selection share (5.4): the marquee being dragged and the item being resized, both
// drawn by the selection overlay while their gesture runs.
import type { ModuleScope } from '../../../view/module.js';
import type { EditorCore, Sel } from '../../core.js';

export interface SelectState {
  /** The rubber band, in diagram coordinates, while it is dragged. */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  /** The item being resized: its size is shown under it while the handle is dragged. */
  sizing: Sel | null;
}

export type SelectScope = ModuleScope<EditorCore>;
