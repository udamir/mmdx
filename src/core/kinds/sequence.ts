// The sequence view kind: what drawing a sequence needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { SequenceModel } from '../model.js';
import { emptySequence, parseSequence } from '../parse/sequence.js';
import { renderSequence, seqPresets } from '../render/sequence.js';
import type { Presets, ViewKind } from './types.js';

export const VIEW: ViewKind<SequenceModel> = {
  type: 'sequence',
  parse: parseSequence,
  empty: emptySequence,
  render: renderSequence,
  presets: (theme, meta) => seqPresets(theme, meta) as unknown as Record<string, Presets>,
  codeShape(model, { kind, id }) {
    const p = kind === 'participant' ? model.participants.find((x) => x.id === id) : undefined;
    return (p?.shape || undefined) ?? (p?.kind === 'actor' ? 'actor' : undefined);
  },
};
