// The sequence ops kind: code order (participants trade places, items move within their blocks), positional ids and
// the metadata that follows them.
import type { SequenceModel } from '../model.js';
import { activationsBalanced } from '../ops/activations.js';
import { remapSequenceMeta } from '../ops/remap.js';
import { swapParticipant } from '../ops/sequence.js';
import type { LineSpan } from '../ops/types.js';
import type { SequenceGeometry } from '../render/types.js';
import type { OpsKind } from './ops-types.js';

const one = (li: number | null | undefined): LineSpan | null => (li == null ? null : { start: li, end: li });

export const OPS: OpsKind<SequenceModel, SequenceGeometry> = {
  type: 'sequence',
  blocks(model) {
    const out: LineSpan[] = [];
    for (const b of model.boxes) if (b.endLine != null) out.push({ start: b.line, end: b.endLine });
    for (const it of model.items) if (it.kind === 'blockStart') out.push({ start: it.src, end: it.lines[it.lines.length - 1] ?? it.src });
    return out;
  },
  unit(M, sel) {
    switch (sel.kind) {
      case 'participant': {
        const p = M.participants.find((x) => x.id === sel.id);
        return p ? one(p.defLine) : null;
      }
      case 'box': {
        const b = M.boxes.find((x) => x.id === sel.id);
        return b ? { start: b.line, end: b.endLine ?? b.line } : null;
      }
      case 'block': {
        const it = M.items.find((x) => x.kind === 'blockStart' && x.id === sel.id);
        return it && it.kind === 'blockStart' ? { start: it.src, end: it.lines[it.lines.length - 1] ?? it.src } : null;
      }
      case 'message':
      case 'note':
        return one(M.items.find((x) => x.kind === sel.kind && x.id === sel.id)?.src);
      default:
        return null;
    }
  },
  checkMove: (code) => (activationsBalanced(code) ? null : 'Moving it there would deactivate a participant before it is activated (+/− markers)'),
  orderStep: (code, model, sel, dir) => (sel.kind === 'participant' ? swapParticipant(code, model, sel.id, dir) : undefined),
  relocate(M, sel, line) {
    if (sel.kind === 'box') return M.boxes.find((b) => b.line === line)?.id;
    const want = sel.kind === 'block' ? 'blockStart' : sel.kind;
    const it = M.items.find((x) => x.src === line && x.kind === want);
    return it && 'id' in it ? it.id : undefined;
  },
  orderLabels: (sel) => (sel.kind === 'participant' ? ['left', 'right'] : ['earlier', 'later']),
  swapBoxes: (geom) => geom.participants,
  remapMeta: remapSequenceMeta,
};
