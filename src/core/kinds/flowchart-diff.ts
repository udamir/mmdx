// The flowchart diff kind: item changes, the merged picture, highlight shapes and code lines (the diff and History load it).
import { diffFlowchart, mergeFlowchart } from '../diff/flowchart.js';
import { boxShape, pathShape } from '../diff/shape.js';
import type { FlowchartModel } from '../model.js';
import type { FlowGeometry } from '../render/types.js';
import type { DiffKind } from './diff-types.js';

export const DIFF: DiffKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const add = (n: number | null | undefined): void => {
      if (n !== null && n !== undefined) out.add(n);
    };
    if (kind === 'node') m.nodes.get(id)?.lines.forEach(add);
    else if (kind === 'group') {
      const g = m.groups.get(id);
      g?.lines.forEach(add);
      add(g?.line);
      add(g?.endLine);
    } else if (kind === 'edge') add(m.edges.find((e) => e.id === id)?.src);
    return out;
  },
  diff: diffFlowchart,
  merge: mergeFlowchart,
  shape: (g, { kind, id }) => (kind === 'node' ? boxShape(g.nodes.get(id)) : kind === 'group' ? boxShape(g.groups.get(id)) : kind === 'edge' ? pathShape(g.edges.get(id)) : null),
};
