// The er view kind: what drawing a er needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { ErModel } from '../model.js';
import { emptyEr, parseER } from '../parse/er.js';
import { renderER } from '../render/er.js';
import type { ViewKind } from './types.js';

export const VIEW: ViewKind<ErModel> = {
  type: 'er',
  parse: parseER,
  empty: emptyEr,
  render: renderER,
};
