// The flowchart view kind: what drawing a flowchart needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { FlowchartModel } from '../model.js';
import { emptyFlowchart, parseFlowchart } from '../parse/flowchart.js';
import { edgePreset, flowPresets, groupPreset, nodePreset, renderFlowchart } from '../render/flowchart.js';
import type { Presets, ViewKind } from './types.js';

export const VIEW: ViewKind<FlowchartModel> = {
  type: 'flowchart',
  parse: parseFlowchart,
  empty: emptyFlowchart,
  render: renderFlowchart,
  presets: (theme, meta) => flowPresets(theme, meta) as unknown as Record<string, Presets>,
  codePreset(model, meta, theme, { kind, id }) {
    if (kind !== 'node' && kind !== 'edge' && kind !== 'group') return undefined;
    const P = flowPresets(theme, meta);
    if (kind === 'node') {
      const n = model.nodes.get(id);
      return n ? nodePreset(n, meta, P) : '';
    }
    if (kind === 'edge') {
      const e = model.edges.find((x) => x.id === id);
      return e ? edgePreset(e, meta, P) : '';
    }
    const g = model.groups.get(id);
    return g ? groupPreset(g, meta, P) : '';
  },
  codeShape(model, { kind, id }) {
    const n = kind === 'node' ? model.nodes.get(id) : undefined;
    return n && n.shape !== 'rect' ? n.shape : undefined;
  },
  codeLink: (model, { kind, id }) => (kind === 'node' ? model.nodes.get(id)?.link : undefined),
  codeEnds(model, { kind, id }) {
    const e = kind === 'edge' ? model.edges.find((x) => x.id === id) : undefined;
    return e ? { start: e.start, end: e.end } : null;
  },
};
