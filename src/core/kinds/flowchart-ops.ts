// The flowchart ops kind: code order, the clipboard, auto-placed nodes, subgraph contents and the direction.
import { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset } from '../render/flow-presets.js';
import { minOf } from '../geom.js';
import type { FlowchartModel } from '../model.js';
import { cloneFlow, deleteFlow, setFlowDirection } from '../ops/flowchart.js';
import { groupDescendants } from '../ops/flowchart.js';
import { tidy } from '../ops/meta-util.js';
import type { FlowGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from '../kind/ops-types.js';
import { asPresets, collectionOps, lineSpan, pinAutoPlaced, rankByLine, resetGroupScope } from './ops-kit.js';


export const OPS: OpsKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  ...collectionOps<FlowchartModel, FlowGeometry>([
    { kind: 'node', ids: (m) => m.nodes.keys(), has: (m, id) => m.nodes.has(id), taken: true, boxes: (g) => g.nodes, texts: (m) => [...m.nodes.values()].map((n) => [n.id, [n.id, n.label, ...n.classes]] as const) },
    { kind: 'group', ids: (m) => m.groups.keys(), has: (m, id) => m.groups.has(id), taken: true, boxes: (g) => g.groups, texts: (m) => [...m.groups.values()].map((g) => [g.id, [g.id, g.label, ...(g.classes ?? [])]] as const) },
    { kind: 'edge', ids: (m) => m.edges.map((e) => e.id), lines: (g) => g.edges, texts: (m) => m.edges.map((e) => [e.id, [e.label]] as const) },
  ]),
  blocks: (model) => [...model.groups.values()].flatMap((g) => (g.endLine != null ? [{ start: g.line, end: g.endLine }] : [])),
  unit(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      return n ? lineSpan(n.defLine ?? minOf(n.lines)) : null;
    }
    if (kind === 'group') {
      const g = M.groups.get(id);
      return g ? { start: g.line, end: g.endLine ?? g.line } : null;
    }
    if (kind === 'edge') return lineSpan(M.edges.find((e) => e.id === id)?.src);
    return null;
  },
  relocate: (M, sel, line) => (sel.kind === 'edge' ? M.edges.find((e) => e.src === line)?.id : undefined),
  orderRank(M, sel) {
    if (sel.kind === 'node') return rankByLine([...M.nodes.values()].map((n) => ({ id: n.id, key: n.defLine })), sel.id);
    if (sel.kind === 'edge') return rankByLine(M.edges.map((e) => ({ id: e.id, key: e.src })), sel.id);
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
  // auto-placed nodes are laid out below hand-placed ones
  pinAuto: (meta, _model, geom) => (geom?.type === 'flowchart' ? pinAutoPlaced(meta, geom.nodes, 'node') : meta),
  descendants: groupDescendants,
  resetScope(meta, model, geom, gid) {
    if (!model.groups.has(gid)) return meta;
    return resetGroupScope(meta, gid, {
      leaf: 'node', inside: groupDescendants(model, gid), box: geom?.type === 'flowchart' ? geom.groups.get(gid) : undefined,
      clearLines: (within) => {
        for (const e of model.edges)
          if (within(e.from) && within(e.to)) {
            const m = edgeMeta(e, meta);
            if (!m?.points) continue;
            delete m.points;
            for (const k of [e.id, e.key]) if (k !== undefined && meta.edges?.[k] === m) tidy(meta, 'edge', k);
          }
      },
    });
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
  presets: (theme, meta) => asPresets(flowPresets(theme, meta)),
};
