// The code lines of a diagram item (diff design §9.4): which Mermaid lines define or mention it, and which `%%@`
// metadata lines carry it. The code diff panel narrows the unified diff to these lines for the selected change.
// Moved here from elements/diff/panels.ts (the DOM builders there are replaced by the CodeView block).
import { encodeId } from '../core/meta/index.js';
import type { DiagramModel } from '../core/model.js';
import type { ItemKind } from '../core/types.js';

/** 0-based code lines that define or mention an item (a node's lines include its edges). */
export function relatedLines(m: DiagramModel, kind: ItemKind, id: string): Set<number> {
  const out = new Set<number>();
  const add = (n: number | null | undefined): void => {
    if (n !== null && n !== undefined) out.add(n);
  };
  if (m.type === 'flowchart') {
    if (kind === 'node') m.nodes.get(id)?.lines.forEach(add);
    else if (kind === 'group') {
      const g = m.groups.get(id);
      g?.lines.forEach(add);
      add(g?.line);
      add(g?.endLine);
    } else if (kind === 'edge') add(m.edges.find((e) => e.id === id)?.src);
  } else if (m.type === 'er') {
    if (kind === 'entity') {
      const e = m.entities.get(id);
      e?.lines.forEach(add);
      if (e?.defLine != null) for (let i = e.defLine; i <= (e.endLine ?? e.defLine); i++) add(i);
    } else if (kind === 'rel') add(m.rels.find((r) => r.id === id)?.src);
  } else if (m.type === 'sequence') {
    if (kind === 'participant') m.participants.find((p) => p.id === id)?.lines.forEach(add);
    else
      for (const it of m.items) {
        if (it.kind === 'message' && kind === 'message' && it.id === id) add(it.src);
        else if (it.kind === 'note' && kind === 'note' && it.id === id) add(it.src);
        else if (it.kind === 'blockStart' && kind === 'block' && it.id === id) it.lines.forEach(add);
      }
  }
  return out;
}

/** The `%%@` lines of an item. */
export function metaLines(lines: readonly string[], kind: string, id: string | null): Set<number> {
  const prefix = id === null ? null : `%%@ ${kind} ${encodeId(id)} `;
  return new Set(prefix ? lines.flatMap((l, i) => (l.startsWith(prefix) ? [i] : [])) : []);
}
