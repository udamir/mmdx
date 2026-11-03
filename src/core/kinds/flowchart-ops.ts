// The flowchart ops kind: code order, the clipboard, auto-placed nodes, subgraph contents and the direction.
import { minOf } from '../geom.js';
import type { FlowchartModel } from '../model.js';
import { cloneFlow, deleteFlow, setFlowDirection } from '../ops/flowchart.js';
import { groupDescendants } from '../ops/meta-ops.js';
import { ensure } from '../ops/meta-util.js';
import type { LineSpan } from '../ops/types.js';
import type { FlowGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from './ops-types.js';

const one = (li: number | null | undefined): LineSpan | null => (li == null ? null : { start: li, end: li });
const byLine = (arr: { id: string; key: number | null | undefined }[], id: string): number =>
  arr.slice().sort((a, b) => (a.key ?? 1e9) - (b.key ?? 1e9)).findIndex((x) => x.id === id);

export const OPS: OpsKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  blocks: (model) => [...model.groups.values()].flatMap((g) => (g.endLine != null ? [{ start: g.line, end: g.endLine }] : [])),
  unit(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      return n ? one(n.defLine ?? minOf(n.lines)) : null;
    }
    if (kind === 'group') {
      const g = M.groups.get(id);
      return g ? { start: g.line, end: g.endLine ?? g.line } : null;
    }
    if (kind === 'edge') return one(M.edges.find((e) => e.id === id)?.src);
    return null;
  },
  relocate: (M, sel, line) => (sel.kind === 'edge' ? M.edges.find((e) => e.src === line)?.id : undefined),
  orderRank(M, sel) {
    if (sel.kind === 'node') return byLine([...M.nodes.values()].map((n) => ({ id: n.id, key: n.defLine })), sel.id);
    if (sel.kind === 'edge') return byLine(M.edges.map((e) => ({ id: e.id, key: e.src })), sel.id);
    return null;
  },
  copyable: (_model, it) => it.kind === 'node' || it.kind === 'group',
  copySet(model, items) {
    const nodes = new Set<string>(), groups = new Set<string>();
    for (const it of items) {
      if (it.kind === 'node') nodes.add(it.id);
      if (it.kind === 'group') {
        groups.add(it.id);
        const d = groupDescendants(model, it.id);
        d.nodes.forEach((n) => nodes.add(n));
        d.groups.forEach((g) => groups.add(g));
      }
    }
    const rest: ItemRef[] = [
      ...[...model.nodes.keys()].filter((id) => !nodes.has(id)).map((id) => ({ kind: 'node' as const, id })),
      ...[...model.groups.keys()].filter((id) => !groups.has(id)).map((id) => ({ kind: 'group' as const, id })),
    ];
    return { ends: nodes, rest };
  },
  remove: deleteFlow,
  clone: cloneFlow,
  idKind: (model, id) => (model.groups.has(id) ? 'group' : 'node'),
  pinAuto(meta, _model, geom) {
    // auto-placed nodes are laid out below hand-placed ones: pin them where they are before the first manual placement
    if (geom?.type !== 'flowchart') return meta;
    for (const [id, b] of geom.nodes)
      if (b.auto) {
        const m = ensure(meta, 'node', id);
        if (m.x == null || m.y == null) {
          m.x = Math.round(b.x);
          m.y = Math.round(b.y);
        }
      }
    return meta;
  },
  descendants: groupDescendants,
  setDirection: (code, _model, dir) => setFlowDirection(code, dir),
};
