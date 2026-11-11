// The sequence diff kind: item changes, the merged picture, highlight shapes and code lines (the diff and History load it).
import { diffSequence, mergeSequence } from '../diff/sequence.js';
import { boxShape } from '../diff/shape.js';
import type { SequenceModel } from '../model.js';
import type { SequenceGeometry } from '../render/types.js';
import type { DiffKind } from '../kind/diff-types.js';

export const DIFF: DiffKind<SequenceModel, SequenceGeometry> = {
  type: 'sequence',
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const add = (n: number | null | undefined): void => {
      if (n !== null && n !== undefined) out.add(n);
    };
    if (kind === 'participant') m.participants.find((p) => p.id === id)?.lines.forEach(add);
    else
      for (const it of m.items) {
        if (it.kind === 'message' && kind === 'message' && it.id === id) add(it.src);
        else if (it.kind === 'note' && kind === 'note' && it.id === id) add(it.src);
        else if (it.kind === 'blockStart' && kind === 'block' && it.id === id) it.lines.forEach(add);
      }
    return out;
  },
  diff: diffSequence,
  merge: mergeSequence,
  shape(geom, { kind, id }) {
    if (kind === 'participant') return boxShape(geom.participants.get(id));
    if (kind === 'note') return boxShape(geom.notes.get(id));
    if (kind === 'block') return boxShape(geom.blocks.get(id));
    if (kind === 'box') return boxShape(geom.boxes.get(id));
    if (kind === 'message') {
      const m = geom.messages.get(id);
      if (!m) return null;
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1);
      return { t: 'rect', r: m.self ? { x: x0 - 6, y: m.y - 26, w: x1 - x0 + 40, h: 62 } : { x: x0, y: m.y - 26, w: x1 - x0, h: 36 } };
    }
    return null;
  },
  positionalIds: true,
};
