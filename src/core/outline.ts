// Text alternative (§13): an outline of the diagram for screen readers and copying, from the type's extras kind (core
// registers every type's: core/kinds/all-extras.ts).
import { KINDS } from './kinds/registry.js';
import type { DiagramModel } from './model.js';
import type { OutlineItem } from './kind/types.js';

export { summarize } from './summary.js';
export type { OutlineItem, Summary } from './kind/types.js';

/** Nodes with their outgoing connections; messages in order; tables with columns and relationships; a mindmap's tree. Fails closed (KindNotLoaded) for a type whose extras are not registered. */
export function outline(model: DiagramModel): OutlineItem[] {
  return model.type ? KINDS.require('extras', model.type).outline(model) : [];
}
