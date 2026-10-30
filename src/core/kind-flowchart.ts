// The flowchart kind on its own (parser + renderer), for bundles that load diagram types on demand.
import { parseFlowchart, emptyFlowchart } from './parse/flowchart.js';
import { renderFlowchart } from './render/flowchart.js';
import type { Kinds } from './pipeline-core.js';

export const KIND: Kinds = { parsers: { flowchart: { parse: parseFlowchart, empty: emptyFlowchart } }, renderers: { flowchart: renderFlowchart } };
