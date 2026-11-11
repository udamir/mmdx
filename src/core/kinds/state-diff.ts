// The state diagram diff kind (T09.7): item changes, the merged picture, highlight shapes and code lines (the diff and History load it).
import { diffState, mergeState } from '../diff/state.js';
import { boxShape, pathShape } from '../diff/shape.js';
import type { StateModel } from '../model.js';
import type { StateGeometry } from '../render/types.js';
import type { DiffKind } from '../kind/diff-types.js';

export const DIFF: DiffKind<StateModel, StateGeometry> = {
  type: 'state',
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const span = (from: number, to: number | undefined): void => {
      for (let i = from; i <= (to ?? from); i++) out.add(i);
    };
    if (kind === 'node') m.nodes.get(id)?.lines.forEach((n) => out.add(n));
    else if (kind === 'group') {
      const g = m.groups.get(id);
      g?.lines.forEach((n) => out.add(n));
      for (const b of g?.blocks ?? []) span(b.line, b.endLine);
    } else if (kind === 'edge') {
      const e = m.edges.find((x) => x.id === id);
      if (e) out.add(e.src);
    } else if (kind === 'note') {
      const n = m.notes.find((x) => x.id === id);
      if (n) span(n.line, n.endLine);
    }
    return out;
  },
  diff: diffState,
  merge: mergeState,
  shape: (g, { kind, id }) =>
    kind === 'node' ? boxShape(g.nodes.get(id)) : kind === 'group' ? boxShape(g.groups.get(id)) : kind === 'edge' ? pathShape(g.edges.get(id)) : kind === 'note' ? boxShape(g.notes.get(id)) : null,
  // node, composite and transition ids are the code's own (as the flowchart's); only notes are numbered in code order,
  // and the diff matches them by their state and side, so layout is transplanted by id like the flowchart's
};
