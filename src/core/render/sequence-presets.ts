// Sequence presets, apart from the renderer so the ops kind (and with it the editor's base chunk) does not load it
// (P15): the theme's presets of each sequence item with the diagram's own over them.
import type { DiagramMeta } from '../meta/types.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import { presets } from './common.js';

export interface SeqPresets {
  participant: Record<string, StyleProps>;
  message: Record<string, StyleProps>;
  block: Record<string, StyleProps>;
  activation: Record<string, StyleProps>;
  box: Record<string, StyleProps>;
  note: Record<string, StyleProps>;
}

export function seqPresets(T: ResolvedTheme, meta: DiagramMeta): SeqPresets {
  const S = T.sequence;
  return {
    participant: presets(S.participantPresets, meta.styles['participant']),
    message: presets(S.messagePresets, meta.styles['message']),
    block: presets(S.blockPresets, meta.styles['block']),
    activation: presets(S.activationPresets, meta.styles['activation']),
    box: presets(S.boxPresets, meta.styles['box']),
    note: presets(S.notePresets, meta.styles['note']),
  };
}
