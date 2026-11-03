// The sequence view kind: what drawing a sequence needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { SequenceModel } from '../model.js';
import { emptySequence, parseSequence } from '../parse/sequence.js';
import { renderSequence } from '../render/sequence.js';
import type { ViewKind } from './types.js';

export const VIEW: ViewKind<SequenceModel> = {
  type: 'sequence',
  parse: parseSequence,
  empty: emptySequence,
  render: renderSequence,
};
