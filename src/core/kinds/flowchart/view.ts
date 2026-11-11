// The flowchart view kind: what drawing a flowchart needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { FlowchartModel } from '../../model.js';
import type { ItemRef } from '../../types.js';
import { emptyFlowchart, parseFlowchart } from './parse.js';
import { renderFlowchart } from './render.js';
import type { ViewKind } from '../../kind/types.js';

export const VIEW: ViewKind<FlowchartModel> = {
  type: 'flowchart',
  parse: parseFlowchart,
  empty: emptyFlowchart,
  render: renderFlowchart,

  items(model) {
    const out: ItemRef[] = [];
    for (const id of model.nodes.keys()) out.push({ kind: 'node', id });
    for (const id of model.groups.keys()) out.push({ kind: 'group', id });
    // an invisible link (`~~~`) is not drawn and not selectable (it is edited in the code)
    for (const e of model.edges) if (e.line !== 'invisible') out.push({ kind: 'edge', id: e.id });
    return out;
  },
  parents(model) {
    const out: [ItemRef, ItemRef][] = [];
    for (const n of model.nodes.values()) if (n.parent) out.push([{ kind: 'node', id: n.id }, { kind: 'group', id: n.parent }]);
    for (const g of model.groups.values()) if (g.parent) out.push([{ kind: 'group', id: g.id }, { kind: 'group', id: g.parent }]);
    return out;
  },
  connectors: (model) =>
    model.edges.filter((e) => e.line !== 'invisible').map((e) => ({ ref: { kind: 'edge', id: e.id }, from: { kind: 'node', id: e.from }, to: { kind: 'node', id: e.to } })),
  frames(model, lit) {
    const out: ItemRef[] = [];
    for (const nid of lit)
      for (let g = model.nodes.get(nid)?.parent ?? null, guard = 0; g && guard < 64; g = model.groups.get(g)?.parent ?? null, guard++) out.push({ kind: 'group', id: g });
    return out;
  },
  summary: (model) =>
    model.nodes.size ? { key: 'label.flowchart', params: { nodes: model.nodes.size, edges: model.edges.filter((e) => e.line !== 'invisible').length } } : { key: 'label.empty', params: {} },
};
