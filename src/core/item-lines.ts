// The Mermaid lines of a diagram item (pure): which 0-based code lines define or mention it. The editor's code filter
// shows these for an element id (a node's lines include its connectors, a block or a subgraph its whole body). The
// diff's code panel narrows its unified diff with a stricter variant of its own (`diff/lines.ts`: no connected lines,
// no activations or boxes, the block's own lines and the subgraph's ends only).
import { activationsOf } from './ids.js';
import type { DiagramModel } from './model.js';
import type { ItemKind } from './types.js';

/** 0-based code lines that define or mention an item, sorted. */
export function relatedLines(M: DiagramModel, kind: ItemKind, id: string): number[] {
  const set = new Set<number>();
  const add = (x: number | null | undefined): void => {
    if (x != null) set.add(x);
  };
  const range = (a: number | null | undefined, b: number | null | undefined): void => {
    if (a == null) return;
    for (let i = a; i <= (b ?? a); i++) set.add(i);
  };
  if (M.type === 'flowchart') {
    if (kind === 'node') {
      M.nodes.get(id)?.lines.forEach(add);
      for (const e of M.edges) if (e.from === id || e.to === id) add(e.src);
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      g?.lines.forEach(add);
      range(g?.line, g?.endLine); // the whole subgraph block, nested content included
      for (const e of M.edges) if (e.from === id || e.to === id) add(e.src);
    } else if (kind === 'edge') add(M.edges.find((e) => e.id === id)?.src);
  } else if (M.type === 'sequence') {
    if (kind === 'activation') {
      const a = activationsOf(M).find((x) => x.id === id);
      if (a) {
        add(a.start.src);
        add(a.end?.src);
      }
    } else if (kind === 'participant') M.participants.find((p) => p.id === id)?.lines.forEach(add);
    else if (kind === 'message' || kind === 'note') add(M.items.find((i) => i.kind === kind && i.id === id)?.src);
    else if (kind === 'block') {
      const it = M.items.find((i) => i.kind === 'blockStart' && i.id === id);
      if (it?.kind === 'blockStart') range(it.src, it.lines[it.lines.length - 1]);
    } else if (kind === 'box') {
      const b = M.boxes.find((x) => x.id === id);
      range(b?.line, b?.endLine);
    }
  } else if (M.type === 'er') {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      range(e?.defLine, e?.endLine);
      for (const r of M.rels) if (r.from === id || r.to === id) add(r.src);
      if (e?.defLine == null) e?.lines.forEach(add);
    } else if (kind === 'rel') add(M.rels.find((r) => r.id === id)?.src);
  }
  return [...set].sort((a, b) => a - b);
}
