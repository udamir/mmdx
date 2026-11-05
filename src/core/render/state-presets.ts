// State diagram presets (T09), apart from the renderer so the ops kind and the editor do not load it: the theme's
// `state` presets with the diagram's own `style.<kind>` presets over them, and the preset an item is drawn with — its
// metadata's, else the first of its classes that names a preset (`:::preset`, `class a preset`), as the flowchart does.
import type { DiagramMeta } from '../meta/types.js';
import type { StateEdge, StateGroup, StateNode, StateNote } from '../model.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import { presetOf, presets } from './common.js';

export interface StatePresets {
  node: Record<string, StyleProps>;
  group: Record<string, StyleProps>;
  edge: Record<string, StyleProps>;
  note: Record<string, StyleProps>;
}

export const statePresets = (T: ResolvedTheme, meta: DiagramMeta): StatePresets => ({
  node: presets(T.state.nodePresets, meta.styles['node']),
  group: presets(T.state.compositePresets, meta.styles['group']),
  edge: presets(T.state.transitionPresets, meta.styles['edge']),
  note: presets(T.state.notePresets, meta.styles['note']),
});

const own = (m: { preset?: unknown } | undefined): string => (typeof m?.preset === 'string' ? m.preset : '');

/** The preset a state is drawn with ('' for none). */
export const stateNodePreset = (n: StateNode, meta: DiagramMeta, P: StatePresets): string => own(meta.nodes?.[n.id]) || (n.classes.find((c) => presetOf(P.node, c)) ?? '');

/** The preset a composite is drawn with ('' for none). */
export const stateGroupPreset = (g: StateGroup, meta: DiagramMeta, P: StatePresets): string => own(meta.groups?.[g.id]) || (g.classes.find((c) => presetOf(P.group, c)) ?? '');

export const stateEdgePreset = (e: StateEdge, meta: DiagramMeta): string => own(meta.edges?.[e.id]);
export const stateNotePreset = (n: StateNote, meta: DiagramMeta): string => own(meta.notes?.[n.id]);
