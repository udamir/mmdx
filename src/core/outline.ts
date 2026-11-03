// Text alternative (§13): an outline of the diagram for screen readers and copying.
import { withKind } from './kinds/registry.js';
import type { DiagramModel } from './model.js';

export { summarize, type Summary } from './summary.js';

export interface OutlineItem {
  text: string;
  children?: OutlineItem[];
}

/** Nodes with their outgoing connections; messages in order; tables with columns and relationships. */
export function outline(model: DiagramModel): OutlineItem[] {
  return withKind(model, (k, m) => k.outline(m)) ?? [];
}
