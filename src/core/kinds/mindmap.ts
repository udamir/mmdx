// The mindmap view kind: what drawing a mindmap needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { MindmapModel } from '../model.js';
import type { MindmapGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import { descendantsOf, emptyMindmap, parseMindmap } from '../parse/mindmap.js';
import { renderMindmap } from '../render/mindmap.js';
import type { ViewKind } from './types.js';

export const VIEW: ViewKind<MindmapModel, MindmapGeometry> = {
  type: 'mindmap',
  parse: parseMindmap,
  empty: emptyMindmap,
  render: renderMindmap,

  items: (model) => [...model.nodes.keys()].map((id): ItemRef => ({ kind: 'node', id })),
  // a tree, not containers: no item holds another
  parents: () => [],
  // branches belong to their child node: no connectors
  connectors: () => [],
  hideWith(model, sets) {
    // a hidden node hides its subtree
    const hidden = sets.node;
    if (!hidden) return;
    for (const id of [...hidden]) for (const d of descendantsOf(model, id)) hidden.add(d);
  },
  summary: (model) => (model.nodes.size ? { key: 'label.mindmap', params: { nodes: model.nodes.size } } : { key: 'label.empty', params: {} }),
};
