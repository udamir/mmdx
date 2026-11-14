// The er diff kind: item changes, the merged picture, highlight shapes and code lines (the diff and History load it).
import { diffEr, mergeEr } from './diff.js';
import { boxShape, pathShape } from '../../diff/shape.js';
import type { ErModel } from '../../model.js';
import type { ErGeometry } from '../../render/types.js';
import type { DiffKind } from '../../kind/diff-types.js';

export const DIFF: DiffKind<ErModel, ErGeometry> = {
  type: 'er',
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const add = (n: number | null | undefined): void => {
      if (n !== null && n !== undefined) out.add(n);
    };
    if (kind === 'entity') {
      const e = m.entities.get(id);
      e?.lines.forEach(add);
      if (e?.defLine != null) for (let i = e.defLine; i <= (e.endLine ?? e.defLine); i++) add(i);
    } else if (kind === 'rel') add(m.rels.find((r) => r.id === id)?.src);
    else if (kind === 'group') {
      const g = m.groups.get(id);
      g?.lines.forEach(add);
      add(g?.line);
      add(g?.endLine);
    }
    return out;
  },
  diff: diffEr,
  merge: mergeEr,
  shape: (g, { kind, id }) => (kind === 'entity' ? boxShape(g.entities.get(id)) : kind === 'group' ? boxShape(g.groups.get(id)) : kind === 'rel' ? pathShape(g.rels.get(id)) : null),
};
