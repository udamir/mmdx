// The flowchart ops kind: code order, the clipboard, auto-placed nodes, subgraph contents and the direction.
import type { Presets } from '../kind/types.js';
import { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset } from '../render/flow-presets.js';
import { minOf } from '../geom.js';
import type { FlowchartModel } from '../model.js';
import { cloneFlow, deleteFlow, setFlowDirection } from '../ops/flowchart.js';
import { groupDescendants } from '../ops/meta-ops.js';
import { ensure, getM, tidy } from '../ops/meta-util.js';
import type { LineSpan } from '../ops/types.js';
import type { FlowGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from '../kind/ops-types.js';

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
  // an edge given its own id in the code (`e1@-->`) takes the metadata written under `from->to`, and gives it back when
  // the id is removed (T06)
  remapMeta(meta, before, _bc, after) {
    const E = meta.edges;
    if (!E) return meta;
    let out: typeof E | null = null;
    const move = (from: string, to: string): void => {
      if (!(out ?? E)[from] || (out ?? E)[to]) return;
      out ??= { ...E };
      out[to] = out[from]!;
      delete out[from];
    };
    for (const e of after.edges) if (e.uid && e.key) move(e.key, e.uid);
    const had = new Map(before.edges.filter((e) => e.uid && e.key).map((e) => [e.key!, e.uid!]));
    for (const e of after.edges) if (!e.uid && had.has(e.id) && !after.edges.some((x) => x.id === had.get(e.id))) move(had.get(e.id)!, e.id);
    return out ? { ...meta, edges: out } : meta;
  },
  pinAuto(meta, _model, geom) {
    // auto-placed nodes are laid out below hand-placed ones: pin them where they are before the first manual placement
    if (geom?.type !== 'flowchart') return meta;
    let pinned = false;
    for (const [id, b] of geom.nodes)
      if (b.auto && Number.isFinite(b.x) && Number.isFinite(b.y)) {
        const m = ensure(meta, 'node', id);
        if (m.x == null || m.y == null) {
          m.x = Math.round(b.x);
          m.y = Math.round(b.y);
          pinned = true;
        }
      }
    // a group's place after "Reset positions in this group" (x / y without a size) is its contents' place now
    if (pinned)
      for (const [id, m] of Object.entries(meta.groups ?? {}))
        if (m.w == null && m.h == null && (m.x != null || m.y != null)) {
          delete m.x;
          delete m.y;
          tidy(meta, 'group', id);
        }
    return meta;
  },
  descendants: groupDescendants,
  resetScope(meta, model, geom, gid) {
    const g = model.groups.get(gid);
    if (!g) return meta;
    const inside = groupDescendants(model, gid);
    const nodes = new Set(inside.nodes), groups = new Set(inside.groups);
    for (const id of nodes) {
      const m = getM(meta, 'node', id);
      delete m.x;
      delete m.y;
      tidy(meta, 'node', id);
    }
    for (const id of groups) {
      const m = getM(meta, 'group', id);
      delete m.x;
      delete m.y;
      delete m.w;
      delete m.h;
      tidy(meta, 'group', id);
    }
    const within = (id: string): boolean => id === gid || nodes.has(id) || groups.has(id);
    for (const e of model.edges)
      if (within(e.from) && within(e.to)) {
        const m = edgeMeta(e, meta);
        if (!m?.points) continue;
        delete m.points;
        for (const k of [e.id, e.key]) if (k !== undefined && meta.edges?.[k] === m) tidy(meta, 'edge', k);
      }
    // the group keeps its place when something outside it is placed by hand (a fixed frame stays as it is): its
    // top-left, without a size, which the layout keeps while it lays the contents out (core/layout/compound.ts)
    const gm = getM(meta, 'group', gid);
    const framed = gm.x != null && gm.y != null && gm.w != null && gm.h != null;
    const placed = (coll: 'nodes' | 'groups', skip: ReadonlySet<string>): boolean =>
      Object.entries(meta[coll] ?? {}).some(([id, m]) => id !== gid && !skip.has(id) && typeof m.x === 'number' && typeof m.y === 'number');
    const box = geom?.type === 'flowchart' ? geom.groups.get(gid) : undefined;
    if (!framed) {
      delete gm.x;
      delete gm.y;
      delete gm.w;
      delete gm.h;
      if (box && (placed('nodes', nodes) || placed('groups', groups))) {
        const m = ensure(meta, 'group', gid);
        m.x = Math.round(box.x - box.w / 2);
        m.y = Math.round(box.y - box.h / 2);
      }
      tidy(meta, 'group', gid);
    }
    return meta;
  },
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
  theme: { slots: { node: 'flowchart.node', group: 'flowchart.group', edge: 'flowchart.edge' } },
  presets: (theme, meta) => flowPresets(theme, meta) as unknown as Record<string, Presets>,
  drawn: (g) => [
    ...[...g.nodes].map(([id, box]) => ({ ref: { kind: 'node' as const, id }, box })),
    ...[...g.groups].map(([id, box]) => ({ ref: { kind: 'group' as const, id }, box })),
    ...[...g.edges].map(([id, e]) => ({ ref: { kind: 'edge' as const, id }, d: e.d, label: e.label })),
  ],
  edge: (g, { kind, id }) => (kind === 'edge' ? g.edges.get(id) : undefined),
  box: (g, it) => (it.kind === 'node' ? g.nodes.get(it.id) : it.kind === 'group' ? g.groups.get(it.id) : undefined) ?? null,
};
