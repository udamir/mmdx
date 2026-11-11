// What the sequence module's painter, gestures and hover share (5.5): the link and process previews of a drag, the
// hovered lifeline and message, whether a drag runs, and whether an edge handle is sizing its item.
import type { Point } from '../../../core/types.js';
import type { ModuleScope } from '../../../view/module.js';
import type { EditorCore } from '../../core.js';

export interface SeqLinking {
  a: Point;
  b: Point;
  target: string | null;
  self?: boolean;
}

export interface ActPreview {
  x: number;
  y0: number;
  y1: number;
  target?: string | undefined;
}

export interface SeqState {
  linking: SeqLinking | null;
  actPreview: ActPreview | null;
  llHover: { id: string; y: number } | null;
  hoverMsg: string | null;
  /** A sequence drag runs. */
  active: boolean;
  /** An edge handle of a note / block / process is being dragged: its size shows under it. */
  sizing: boolean;
}

export type SeqScope = ModuleScope<EditorCore>;

/** A drag runs (this module's or any other). */
export const seqBusy = (core: EditorCore, st: SeqState): boolean => st.active || core.dragging;
