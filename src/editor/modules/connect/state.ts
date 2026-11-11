// What the connect module's painter, gestures and hover share (5.5): the link preview of a drag, the magnets shown on
// a target, the hovered line, whether a drag runs, and the double presses on handles.
import type { EdgeGeom } from '../../../core/render/types.js';
import type { ItemRef } from '../../../core/types.js';
import { opsKind } from '../../../core/kinds/registry.js';
import type { ModuleScope } from '../../../view/module.js';
import type { EditorCore } from '../../core.js';
import type { DoublePress, Linking, Magnets } from './lib.js';

export interface ConnState {
  linking: Linking | null;
  magnets: Magnets | null;
  hoverEdge: ItemRef | null;
  /** A connect drag runs. */
  active: boolean;
  endPress: DoublePress;
  bendPress: DoublePress;
}

export type ConnScope = ModuleScope<EditorCore>;

/** A drag runs (this module's or any other). */
export const connBusy = (core: EditorCore, st: ConnState): boolean => st.active || core.dragging;

export const edgeGeom = (core: EditorCore, it: ItemRef): EdgeGeom | undefined => {
  const gm = core.geom;
  return gm.type ? opsKind(gm.type)?.edge?.(gm, it) : undefined;
};
