// Text alternative (§13): an outline of the diagram for screen readers and copying.
import { outlineEr } from './kinds/er-outline.js';
import { outlineFlowchart } from './kinds/flowchart-outline.js';
import { outlineMindmap } from './kinds/mindmap-outline.js';
import { outlineSequence } from './kinds/sequence-outline.js';
import type { DiagramModel, SupportedModel } from './model.js';
import type { DiagramType } from './types.js';

export { summarize, type Summary } from './summary.js';

export interface OutlineItem {
  text: string;
  children?: OutlineItem[];
}

/** Nodes with their outgoing connections; messages in order; tables with columns and relationships; a mindmap's tree. */
export function outline(model: DiagramModel): OutlineItem[] {
  return model.type ? (OUTLINES[model.type] as (m: SupportedModel) => OutlineItem[])(model) : [];
}

/** Each type's outline (core only: the components never draw one). */
const OUTLINES: { readonly [T in DiagramType]: (model: Extract<SupportedModel, { type: T }>) => OutlineItem[] } = {
  flowchart: outlineFlowchart,
  sequence: outlineSequence,
  er: outlineEr,
  mindmap: outlineMindmap,
};
