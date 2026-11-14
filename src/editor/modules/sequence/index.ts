// Sequence gestures (A.5 rows 45–48, 50): lifeline circle → new message / self message / process, message end
// circles → process to another message (dragged up or down) or the end re-attached to another lifeline (dragged
// sideways, T11.3), process top / bottom handles, block edge handles (pull / push statements), note edge handles
// (span), participant ◀ ▶ swap arrows, two messages → Show as process.
// Ported from prototype/app.js `participantArrows`, `lifelineDrag`, `actEndDrag`, `actEdgeDrag`, `hoverSeq`,
// `seqDots`, `llBars`, `actPreviewSvg`, `seqLineAbove`, `seqAnchor`, `edgeAnchors`, `blockEdgeDrag`,
// `activationInfo`, `applyActivation`, `noteEdgeDrag`.
import type { EditorModule } from '../../module.js';
import { SEQUENCE_CSS } from './css.js';
import { installSeqGestures } from './gestures.js';
import { installSeqHover } from './hover.js';
import { activationInfo, applyActivation } from './lib.js';
import { installSeqPainter } from './painters.js';
import type { SeqState } from './state.js';

export { activationInfo, applyActivation, edgeAnchors, llBars, seqLineAbove } from './lib.js';

export const sequenceModule: EditorModule = {
  id: 'sequence',
  css: [SEQUENCE_CSS],
  install(scope) {
    const core = scope.core;
    const st: SeqState = { linking: null, actPreview: null, llHover: null, hoverMsg: null, active: false, sizing: false };
    scope.provide('applyActivation', () => applyActivation(core));
    scope.provide('activationInfo', () => activationInfo(core));
    installSeqPainter(scope, st);
    installSeqGestures(scope, st);
    installSeqHover(scope, st);
    return () => {
      st.linking = null;
      st.actPreview = null;
    };
  },
};
