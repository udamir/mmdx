// The mindmap diff kind: item changes, the merged picture, highlight shapes and code lines (the diff and History load it).
import { diffMindmap, mergeMindmap } from './diff.js';
import { boxShape } from '../../diff/shape.js';
import type { MindmapModel } from '../../model.js';
import type { MindmapGeometry } from '../../render/types.js';
import type { DiffKind } from '../../kind/diff-types.js';

export const DIFF: DiffKind<MindmapModel, MindmapGeometry> = {
  type: 'mindmap',
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const n = kind === 'node' ? m.nodes.get(id) : undefined;
    if (n) for (let i = n.line; i <= n.endLine; i++) out.add(i);
    return out;
  },
  diff: diffMindmap,
  merge: mergeMindmap,
  shape: (g, { kind, id }) => (kind === 'node' ? boxShape(g.nodes.get(id)) : null),
  // nodes without a written id are numbered in code order: positions are not carried across versions by id
  positionalIds: true,
};
