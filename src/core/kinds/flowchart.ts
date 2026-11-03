// The flowchart view kind: what drawing a flowchart needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { FlowchartModel } from '../model.js';
import type { FlowGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import { emptyFlowchart, parseFlowchart } from '../parse/flowchart.js';
import { edgePreset, flowPresets, groupPreset, nodePreset, renderFlowchart } from '../render/flowchart.js';
import type { Presets, ViewKind } from './types.js';

export const VIEW: ViewKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  parse: parseFlowchart,
  empty: emptyFlowchart,
  render: renderFlowchart,

  items(model) {
    const out: ItemRef[] = [];
    for (const id of model.nodes.keys()) out.push({ kind: 'node', id });
    for (const id of model.groups.keys()) out.push({ kind: 'group', id });
    for (const e of model.edges) out.push({ kind: 'edge', id: e.id });
    return out;
  },
  parents(model) {
    const out: [ItemRef, ItemRef][] = [];
    for (const n of model.nodes.values()) if (n.parent) out.push([{ kind: 'node', id: n.id }, { kind: 'group', id: n.parent }]);
    for (const g of model.groups.values()) if (g.parent) out.push([{ kind: 'group', id: g.id }, { kind: 'group', id: g.parent }]);
    return out;
  },
  connectors: (model) => model.edges.map((e) => ({ ref: { kind: 'edge', id: e.id }, from: { kind: 'node', id: e.from }, to: { kind: 'node', id: e.to } })),
  frames(model, lit) {
    const out: ItemRef[] = [];
    for (const nid of lit)
      for (let g = model.nodes.get(nid)?.parent ?? null, guard = 0; g && guard < 64; g = model.groups.get(g)?.parent ?? null, guard++) out.push({ kind: 'group', id: g });
    return out;
  },
  summary: (model) => (model.nodes.size ? { key: 'label.flowchart', params: { nodes: model.nodes.size, edges: model.edges.length } } : { key: 'label.empty', params: {} }),
};
