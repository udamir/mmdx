// The flowchart ops kind: code order, the clipboard, auto-placed nodes, subgraph contents and the direction.
import type { Presets } from './types.js';
import { edgePreset, flowPresets, groupPreset, nodePreset } from '../render/flowchart.js';
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
  codePreset(model, meta, theme, { kind, id }) {
    if (kind !== 'node' && kind !== 'edge' && kind !== 'group') return undefined;
    const P = flowPresets(theme, meta);
    if (kind === 'node') {
      const n = model.nodes.get(id);
      return n ? nodePreset(n, meta, P) : '';
    }
    if (kind === 'edge') {
      const e = model.edges.find((x) => x.id === id);
      return e ? edgePreset(e, meta, P) : '';
    }
    const g = model.groups.get(id);
    return g ? groupPreset(g, meta, P) : '';
  },
  codeShape(model, { kind, id }) {
    const n = kind === 'node' ? model.nodes.get(id) : undefined;
    return n && n.shape !== 'rect' ? n.shape : undefined;
  },
  codeLink: (model, { kind, id }) => (kind === 'node' ? model.nodes.get(id)?.link : undefined),
  codeEnds(model, { kind, id }) {
    const e = kind === 'edge' ? model.edges.find((x) => x.id === id) : undefined;
    return e ? { start: e.start, end: e.end } : null;
  },
  find(model, id) {
    if (model.nodes.has(id)) return { kind: 'node', id };
    if (model.groups.has(id)) return { kind: 'group', id };
    if (model.edges.some((e) => e.id === id)) return { kind: 'edge', id };
    return null;
  },
  search: (model) => [
    ...[...model.nodes.values()].map((n) => ({ ref: { kind: 'node' as const, id: n.id }, texts: [n.id, n.label, ...n.classes] })),
    ...[...model.groups.values()].map((g) => ({ ref: { kind: 'group' as const, id: g.id }, texts: [g.id, g.label, ...(g.classes ?? [])] })),
    ...model.edges.map((e) => ({ ref: { kind: 'edge' as const, id: e.id }, texts: [e.label] })),
  ],
  exists: (model, { kind, id }) =>
    kind === 'node' ? model.nodes.has(id) : kind === 'group' ? model.groups.has(id) : kind === 'edge' ? model.edges.some((e) => e.id === id) : false,
  takenIds: (model) => [...model.nodes.keys(), ...model.groups.keys()],
  usedIds: (model) => ({ nodes: new Set(model.nodes.keys()), groups: new Set(model.groups.keys()), edges: new Set(model.edges.map((e) => e.id)) }),
  lines(M, { kind, id }) {
    const set = new Set<number>();
    const add = (x: number | null | undefined): void => {
      if (x != null) set.add(x);
    };
    if (kind === 'node') {
      M.nodes.get(id)?.lines.forEach(add);
      for (const e of M.edges) if (e.from === id || e.to === id) add(e.src);
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      g?.lines.forEach(add);
      if (g) for (let i = g.line; i <= (g.endLine ?? g.line); i++) set.add(i); // the whole subgraph block, nested content included
      for (const e of M.edges) if (e.from === id || e.to === id) add(e.src);
    } else if (kind === 'edge') add(M.edges.find((e) => e.id === id)?.src);
    return [...set].sort((a, b) => a - b);
  },
  isEmpty: (model) => !model.nodes.size,
  presets: (theme, meta) => flowPresets(theme, meta) as unknown as Record<string, Presets>,
  drawn: (g) => [
    ...[...g.nodes].map(([id, box]) => ({ ref: { kind: 'node' as const, id }, box })),
    ...[...g.groups].map(([id, box]) => ({ ref: { kind: 'group' as const, id }, box })),
    ...[...g.edges].map(([id, e]) => ({ ref: { kind: 'edge' as const, id }, d: e.d, label: e.label })),
  ],
  edge: (g, { kind, id }) => (kind === 'edge' ? g.edges.get(id) : undefined),
  box: (g, it) => (it.kind === 'node' ? g.nodes.get(it.id) : it.kind === 'group' ? g.groups.get(it.id) : undefined) ?? null,
};
