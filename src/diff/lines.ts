// The code lines of a diagram item (diff design §9.4): which Mermaid lines define or mention it, and which `%%@`
// metadata lines carry it. The code diff panel narrows the unified diff to these lines for the selected change.
// Moved here from elements/diff/panels.ts (the DOM builders there are replaced by the CodeView block).
import { withKind } from '../core/kinds/registry.js';
import { encodeId } from '../core/meta/index.js';
import type { DiagramModel } from '../core/model.js';
import type { ItemKind } from '../core/types.js';

/** 0-based code lines that define or mention an item (a node's lines include its edges). */
export function relatedLines(m: DiagramModel, kind: ItemKind, id: string): Set<number> {
  return withKind(m, (k, mm) => k.diffLines(mm, { kind, id })) ?? new Set();
}

/** The `%%@` lines of an item. */
export function metaLines(lines: readonly string[], kind: string, id: string | null): Set<number> {
  const prefix = id === null ? null : `%%@ ${kind} ${encodeId(id)} `;
  return new Set(prefix ? lines.flatMap((l, i) => (l.startsWith(prefix) ? [i] : [])) : []);
}
