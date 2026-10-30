// The er kind on its own (parser + renderer), for bundles that load diagram types on demand.
import { parseER, emptyEr } from './parse/er.js';
import { renderER } from './render/er.js';
import type { Kinds } from './pipeline-core.js';

export const KIND: Kinds = { parsers: { er: { parse: parseER, empty: emptyEr } }, renderers: { er: renderER } };
