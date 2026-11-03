// The generated accessible name of a diagram ("Flowchart: 12 nodes, 14 connections", §13).
import { withKind } from './kinds/registry.js';
import type { DiagramModel } from './model.js';
import type { DiagramType } from './types.js';

export interface Summary {
  key: `label.${DiagramType}` | 'label.empty' | 'label.unsupported';
  params: Record<string, number>;
}

export function summarize(model: DiagramModel): Summary {
  return withKind(model, (k, m) => k.summary(m)) ?? { key: 'label.unsupported', params: {} };
}
