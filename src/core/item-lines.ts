// The Mermaid lines of a diagram item (pure): which 0-based code lines define or mention it. The editor's code filter
// shows these for an element id (a node's lines include its connectors, a block or a subgraph its whole body). The
// diff's code panel narrows its unified diff with a stricter variant (`diffLines` of the kind, used by diff/lines.ts:
// no connected lines, no activations or boxes, the block's own lines and the subgraph's ends only).
import { withOps } from './kinds/registry.js';
import type { DiagramModel } from './model.js';
import type { ItemKind } from './types.js';

/** 0-based code lines that define or mention an item, sorted. */
export function relatedLines(M: DiagramModel, kind: ItemKind, id: string): number[] {
  return withOps(M, (k, m) => k.lines(m, { kind, id })) ?? [];
}
