// The flowchart view kind: what drawing a flowchart needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import { boxShape, pathShape } from '../diff/shape.js';
import { diffFlowchart, mergeFlowchart } from '../diff/flowchart.js';
import type { FlowchartModel } from '../model.js';
import type { OutlineItem } from '../outline.js';
import type { FlowGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import { emptyFlowchart, parseFlowchart } from '../parse/flowchart.js';
import { edgePreset, flowPresets, groupPreset, nodePreset, renderFlowchart } from '../render/flowchart.js';
import type { Presets, ViewKind } from './types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export const VIEW: ViewKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  parse: parseFlowchart,
  empty: emptyFlowchart,
  render: renderFlowchart,
  presets: (theme, meta) => flowPresets(theme, meta) as unknown as Record<string, Presets>,
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

  items(model) {
    const out: ItemRef[] = [];
    for (const id of model.nodes.keys()) out.push({ kind: 'node', id });
    for (const id of model.groups.keys()) out.push({ kind: 'group', id });
    for (const e of model.edges) out.push({ kind: 'edge', id: e.id });
    return out;
  },
  parents(model) {
    const out: [ItemRef, ItemRef][] = [];
    for (const n of model.nodes.values()) if (n.parent) out.push([{ kind: 'node', id: n.id }, { kind: 'group', id: n.parent }]);
    for (const g of model.groups.values()) if (g.parent) out.push([{ kind: 'group', id: g.id }, { kind: 'group', id: g.parent }]);
    return out;
  },
  connectors: (model) => model.edges.map((e) => ({ ref: { kind: 'edge', id: e.id }, from: { kind: 'node', id: e.from }, to: { kind: 'node', id: e.to } })),
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
  box: (g, it) => (it.kind === 'node' ? g.nodes.get(it.id) : it.kind === 'group' ? g.groups.get(it.id) : undefined) ?? null,
  frames(model, lit) {
    const out: ItemRef[] = [];
    for (const nid of lit)
      for (let g = model.nodes.get(nid)?.parent ?? null, guard = 0; g && guard < 64; g = model.groups.get(g)?.parent ?? null, guard++) out.push({ kind: 'group', id: g });
    return out;
  },
  isEmpty: (model) => !model.nodes.size,
  outline(model) {
    const label = (id: string): string => one(model.nodes.get(id)?.label ?? model.groups.get(id)?.label ?? id);
    const out: OutlineItem[] = [];
    for (const n of model.nodes.values()) {
      const edges = model.edges.filter((e) => e.from === n.id);
      const item: OutlineItem = { text: label(n.id) + (n.parent ? ` (in ${label(n.parent)})` : '') };
      if (edges.length) item.children = edges.map((e) => ({ text: `→ ${label(e.to)}${e.label ? `: ${one(e.label)}` : ''}` }));
      out.push(item);
    }
    return out;
  },
  summary: (model) => (model.nodes.size ? { key: 'label.flowchart', params: { nodes: model.nodes.size, edges: model.edges.length } } : { key: 'label.empty', params: {} }),
  diff: diffFlowchart,
  merge: mergeFlowchart,
  shape: (g, { kind, id }) => (kind === 'node' ? boxShape(g.nodes.get(id)) : kind === 'group' ? boxShape(g.groups.get(id)) : kind === 'edge' ? pathShape(g.edges.get(id)) : null),
};
