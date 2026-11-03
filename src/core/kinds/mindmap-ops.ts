// The mindmap ops kind: code order (subtrees trade places), the clipboard (subtrees), positional ids and presets.
import type { MindmapModel } from '../model.js';
import { descendantsOf } from '../parse/mindmap.js';
import { cloneMind, deleteMind, mindNodeAt, moveMind, remapMindMeta, subtreeEnd } from '../ops/mindmap.js';
import { mindPresets } from '../render/mind-presets.js';
import type { MindmapGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from './ops-types.js';
import type { Presets } from './types.js';

export const OPS: OpsKind<MindmapModel, MindmapGeometry> = {
  type: 'mindmap',
  presets: (theme, meta) => mindPresets(theme, meta) as unknown as Record<string, Presets>,
  box: (g, it) => (it.kind === 'node' ? g.nodes.get(it.id) : undefined) ?? null,
  drawn: (g) => [...g.nodes].map(([id, box]) => ({ ref: { kind: 'node' as const, id }, box })),
  codeShape(model, ref) {
    const n = ref.kind === 'node' ? model.nodes.get(ref.id) : undefined;
    return n && n.shape !== 'mm-default' ? n.shape : undefined;
  },
  find: (model, id) => (model.nodes.has(id) ? { kind: 'node', id } : null),
  search: (model) => [...model.nodes.values()].map((n) => ({ ref: { kind: 'node' as const, id: n.id }, texts: [n.written ?? undefined, n.label, ...n.classes] })),
  exists: (model, { kind, id }) => kind === 'node' && model.nodes.has(id),
  takenIds: (model) => [...model.nodes.values()].flatMap((n) => (n.written ? [n.written] : [])),
  usedIds: (model) => ({ nodes: new Set(model.nodes.keys()) }),
  lines(model, { kind, id }) {
    const n = kind === 'node' ? model.nodes.get(id) : undefined;
    if (!n) return [];
    const out: number[] = [];
    for (let i = n.line; i <= n.endLine; i++) out.push(i);
    return out;
  },
  isEmpty: (model) => !model.nodes.size,
  // a subtree is a block of the code
  blocks: (model) => [...model.nodes.values()].filter((n) => n.children.length).map((n) => ({ start: n.line, end: subtreeEnd(model, n.id) })),
  unit(model, { kind, id }) {
    const n = kind === 'node' ? model.nodes.get(id) : undefined;
    return n ? { start: n.line, end: subtreeEnd(model, id) } : null;
  },
  orderStep(code, model, ref, dir) {
    const r = moveMind(code, model, ref.id, dir);
    return r.reason ? { code, reason: r.reason } : { code: r.code, ...(r.line !== undefined ? { line: r.line } : {}) };
  },
  relocate: (model, ref, line) => (ref.kind === 'node' && line !== undefined ? mindNodeAt(model, line)?.id : undefined),
  orderRank(model, ref) {
    const n = model.nodes.get(ref.id);
    const p = n?.parent ? model.nodes.get(n.parent) : undefined;
    return p ? p.children.indexOf(ref.id) : null;
  },
  orderLabels: () => ['first', 'last'],
  remapMeta: (meta, before, _bc, after) => remapMindMeta(meta, before, after),
  copyable: (model, it) => it.kind === 'node' && model.nodes.has(it.id) && it.id !== model.root,
  copySet(model, items) {
    // the copied subtrees and their root's ancestors (the frame they hang from); the rest is deleted
    const keep = new Set<string>();
    for (const it of items) for (const id of [it.id, ...descendantsOf(model, it.id)]) keep.add(id);
    // a node above a copied one stays (its subtree is pruned to the copies)
    const above = new Set<string>();
    for (const it of items) {
      let p = model.nodes.get(it.id)?.parent ?? null;
      while (p && !above.has(p)) {
        above.add(p);
        p = model.nodes.get(p)?.parent ?? null;
      }
    }
    const rest: ItemRef[] = [...model.nodes.keys()].filter((id) => !keep.has(id) && !above.has(id)).map((id) => ({ kind: 'node' as const, id }));
    return { ends: keep, rest };
  },
  remove: deleteMind,
  clone: cloneMind,
  idKind: () => 'node',
};
