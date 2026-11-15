// The state the parts of canvas selection share (5.4): the marquee being dragged, the item being resized and the
// smart guides of a move or resize (task 005), all drawn by the selection overlays while their gesture runs.
import type { ModuleScope } from '../../../view/module.js';
import type { EditorCore, Sel } from '../../core.js';
import type { GuideInput, Rect } from '../../lib/align-guides.js';

/** What a move or resize aligns to, frozen at the press: the overlay draws what holds for the items where they land. */
export interface GuideFrame {
  /** The items that move (one block). */
  refs: readonly Sel[];
  others: readonly Rect[];
  parent: Rect | null;
  anchors: GuideInput['anchors'];
}

export interface SelectState {
  /** The rubber band, in diagram coordinates, while it is dragged. */
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  /** The item being resized: its size is shown under it while the handle is dragged. */
  sizing: Sel | null;
  /** The smart guides of the running move or resize (null: none, or Alt is held). */
  guides: GuideFrame | null;
}

export type SelectScope = ModuleScope<EditorCore>;
