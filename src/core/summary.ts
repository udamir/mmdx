// The generated accessible name of a diagram ("Flowchart: 12 nodes, 14 connections", §13).
import type { DiagramModel } from './model.js';

export interface Summary {
  key: 'label.flowchart' | 'label.sequence' | 'label.er' | 'label.empty' | 'label.unsupported';
  params: Record<string, number>;
}

export function summarize(model: DiagramModel): Summary {
  switch (model.type) {
    case 'flowchart':
      return model.nodes.size ? { key: 'label.flowchart', params: { nodes: model.nodes.size, edges: model.edges.length } } : { key: 'label.empty', params: {} };
    case 'sequence': {
      const messages = model.items.filter((i) => i.kind === 'message').length;
      return model.participants.length ? { key: 'label.sequence', params: { participants: model.participants.length, messages } } : { key: 'label.empty', params: {} };
    }
    case 'er':
      return model.entities.size ? { key: 'label.er', params: { entities: model.entities.size, rels: model.rels.length } } : { key: 'label.empty', params: {} };
    default:
      return { key: 'label.unsupported', params: {} };
  }
}

