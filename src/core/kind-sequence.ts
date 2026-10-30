// The sequence kind on its own (parser + renderer), for bundles that load diagram types on demand.
import { parseSequence, emptySequence } from './parse/sequence.js';
import { renderSequence } from './render/sequence.js';
import type { Kinds } from './pipeline-core.js';

export const KIND: Kinds = { parsers: { sequence: { parse: parseSequence, empty: emptySequence } }, renderers: { sequence: renderSequence } };
