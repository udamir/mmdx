// Flowchart presets (prototype render/flowchart.js): the theme's and the diagram's node, group and edge presets, which
// preset an item uses, and an edge's metadata (under its own id, or the `from->to` it had before). Apart from the
// renderer, so the portable export and the editor's base chunk read them without loading it (T06).
import type { DiagramMeta, ItemMeta } from '../../meta/types.js';
import type { FlowEdge, FlowGroup, FlowNode } from '../../model.js';
import type { StyleProps } from '../../style.js';
import type { ResolvedTheme } from '../../theme/types.js';
import { presetOf, presets } from '../../render/common.js';

export interface FlowPresets {
  node: Record<string, StyleProps>;
  group: Record<string, StyleProps>;
  edge: Record<string, StyleProps>;
}

export function flowPresets(T: ResolvedTheme, meta: DiagramMeta): FlowPresets {
  return {
    node: presets(T.flowchart.nodePresets, meta.styles['node']),
    group: presets(T.flowchart.groupPresets, meta.styles['group']),
    edge: presets(T.flowchart.edgePresets, meta.styles['edge']),
  };
}

/** Which shape a node preset belongs to (theme editor / preset pickers): its "shape", else "for", else rectangle. */
export { presetShape } from '../../render/common.js';

export function nodePreset(n: FlowNode, meta: DiagramMeta, P: FlowPresets): string {
  const m = meta.nodes?.[n.id];
  if (typeof m?.preset === 'string' && m.preset) return m.preset;
  const c = n.classes.find((c) => presetOf(P.node, c));
  if (c) return c;
  if (n.shape === 'cylinder' && presetOf(P.node, 'db')) return 'db';
  if (n.shape === 'diamond' && presetOf(P.node, 'decision')) return 'decision';
  return '';
}

/**
 * An edge's metadata: under its id; an edge given its own id in the code (`e1@-->`) still reads what was written under
 * `from->to` before (T06: the remap is one-way, the ops kind moves it on the next code change).
 */
export const edgeMeta = (e: FlowEdge, meta: DiagramMeta): ItemMeta | undefined => meta.edges?.[e.id] ?? (e.key !== undefined ? meta.edges?.[e.key] : undefined);

export function edgePreset(e: FlowEdge, meta: DiagramMeta, P: FlowPresets): string {
  const m = edgeMeta(e, meta);
  if (typeof m?.preset === 'string' && m.preset) return m.preset;
  if (e.line === 'dotted' && presetOf(P.edge, 'sync')) return 'sync';
  if (e.line === 'thick' && presetOf(P.edge, 'strong')) return 'strong';
  return '';
}

export function groupPreset(g: FlowGroup, meta: DiagramMeta, P: FlowPresets): string {
  const m = meta.groups?.[g.id];
  if (typeof m?.preset === 'string' && m.preset) return m.preset;
  const c = (g.classes ?? []).find((c) => presetOf(P.group, c));
  if (c) return c;
  return 'box';
}
