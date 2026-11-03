// The flowchart view kind: what drawing a flowchart needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { FlowchartModel } from '../model.js';
import { emptyFlowchart, parseFlowchart } from '../parse/flowchart.js';
import { renderFlowchart } from '../render/flowchart.js';
import type { ViewKind } from './types.js';

export const VIEW: ViewKind<FlowchartModel> = {
  type: 'flowchart',
  parse: parseFlowchart,
  empty: emptyFlowchart,
  render: renderFlowchart,
};
