// Mermaid code -> DiagramModel with every supported diagram type (see dispatch.ts for the type detection).
import type { DiagramModel } from '../model.js';
import { parseWith, type ParserSet } from './dispatch.js';
import { emptyEr, parseER } from './er.js';
import { emptyFlowchart, parseFlowchart } from './flowchart.js';
import { emptySequence, parseSequence } from './sequence.js';

export { cleanLabel, encodeLabel, isMarkdownString } from './label.js';
export { parseStyleList } from './style.js';
export { parseFlowchart, renameClashingSubgraph } from './flowchart.js';
export { parseSequence } from './sequence.js';
export { parseER } from './er.js';
export { MAX_ITEMS, MAX_SOURCE_LENGTH } from './limits.js';
export { detectType, parseWith, type ParserSet, type TypeParser } from './dispatch.js';

export const ALL_PARSERS: ParserSet = {
  flowchart: { parse: parseFlowchart, empty: emptyFlowchart },
  sequence: { parse: parseSequence, empty: emptySequence },
  er: { parse: parseER, empty: emptyEr },
};

/** Never throws on any input. */
export function parse(code: string): DiagramModel {
  return parseWith(code, ALL_PARSERS);
}
