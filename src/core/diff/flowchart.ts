// The flowchart diff (the view kind's `diff`: items matched by identity, or by aligning positional ones, each change put into one
// facet) and its merged picture (`merge`: the after version plus the removed items, changed text marked word by word).
import type { DiagramMeta } from '../meta/types.js';
import type { FlowEdge, FlowEdgeData, FlowGroup, FlowNode, FlowNodeData, FlowchartModel } from '../model.js';
import { classDefFields, diffAligned, diffById, isEmpty, field, metaFacet, metaFields, changedPresets, renames, styleFields } from './kit.js';
import type { FieldChange, ItemChange } from './types.js';
import { changedField, keepRemoved, relabelChanged, REMOVED } from './merge.js';
import { type MergeEnv } from './types.js';

// ---- diff --------------------------------------------------------------------------------------------------

const edgeName = (e: FlowEdge, m: FlowchartModel): string => {
  const n = (id: string) => m.nodes.get(id)?.label || m.groups.get(id)?.label || id;
  return `${n(e.from)} → ${n(e.to)}${e.label ? ` (${e.label})` : ''}`;
};

/** The image frame of an icon or image node, as one change (the keys of a metadata image's frame, meta/keys.ts). */
const FRAME_KEYS = ['pos', 'w', 'h', 'form', 'constraint'] as const;

/**
 * An icon or image node's data (B5): its picture and icon are content, its frame (caption side, size, icon form,
 * aspect lock) layout — the facets the same keys have in metadata.
 */
function nodeDataFields(f: FieldChange[], a: FlowNodeData | undefined, b: FlowNodeData | undefined): void {
  field(f, metaFacet('img')!, 'image', a?.img, b?.img);
  field(f, metaFacet('icon')!, 'icon', a?.icon, b?.icon);
  const frame = (d: FlowNodeData | undefined) => (d && FRAME_KEYS.some((k) => d[k] !== undefined) ? Object.fromEntries(FRAME_KEYS.map((k) => [k, d[k]])) : undefined);
  field(f, 'layout', 'image frame', frame(a), frame(b));
}

const edgeAnimation = (d: FlowEdgeData | undefined): string | undefined => (d?.animate ? d.animation ?? 'on' : undefined);

export function diffFlowchart(a: FlowchartModel, b: FlowchartModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'layout', 'direction', a.direction, b.direction);
  classDefFields(doc, a.classDefs, b.classDefs);
  const nodePresets = changedPresets(ma, mb, 'node'), edgePresets = changedPresets(ma, mb, 'edge'), groupPresets = changedPresets(ma, mb, 'group');

  const goneNodes = [...a.nodes.keys()].filter((id) => !b.nodes.has(id));
  const newNodes = [...b.nodes.keys()].filter((id) => !a.nodes.has(id));
  const sig = (side: 'a' | 'b', id: string) => {
    const n = (side === 'a' ? a : b).nodes.get(id)!;
    return `${n.label}\u0000${n.shape}`;
  };
  const renamed = renames(goneNodes, newNodes, sig);
  const toAfter = (id: string) => renamed.get(id) ?? id;

  diffById(items, 'node', a.nodes, b.nodes, (n, id) => n.label || id, (na, nb, f) => {
    field(f, 'content', 'id', na.id, nb.id);
    field(f, 'content', 'label', na.label, nb.label);
    field(f, 'content', 'shape', na.shape, nb.shape);
    field(f, 'content', 'group', na.parent ? toAfter(na.parent) : null, nb.parent);
    field(f, 'content', 'link', na.link, nb.link);
    nodeDataFields(f, na.data, nb.data);
    styleFields(f, na, nb, a.classDefs, b.classDefs);
    metaFields(f, ma.nodes?.[na.id], mb.nodes?.[nb.id], nodePresets);
  }, renamed);
  diffById(items, 'group', a.groups, b.groups, (g, id) => g.label || id, (ga, gb, f) => {
    field(f, 'content', 'label', ga.label, gb.label);
    field(f, 'content', 'parent group', ga.parent, gb.parent);
    styleFields(f, ga, gb, a.classDefs, b.classDefs);
    metaFields(f, ma.groups?.[gb.id], mb.groups?.[gb.id], groupPresets);
  });

  // edges: matched by endpoints (through renames), then in order among parallel edges
  const linkStyle = (m: FlowchartModel, e: FlowEdge) => {
    const s = { ...m.linkStyles['default'], ...m.linkStyles[String(e.index)] };
    return isEmpty(s) ? undefined : s;
  };
  const edgeKey = (e: FlowEdge, map: (id: string) => string) => `${map(e.from)}->${map(e.to)}`;
  diffAligned(items, 'edge', a.edges, b.edges, (e) => `${edgeKey(e, toAfter)}|${e.label}|${e.line}|${e.start}|${e.end}`, (e, side) => edgeKey(e, side === 'a' ? toAfter : (i) => i), (e, side) => edgeName(e, side === 'a' ? a : b), (ea, eb, f) => {
    field(f, 'content', 'label', ea.label, eb.label);
    field(f, 'content', 'line', ea.line, eb.line);
    field(f, 'content', 'arrow heads', `${ea.start}/${ea.end}`, `${eb.start}/${eb.end}`);
    field(f, 'layout', 'min length', ea.minlen, eb.minlen);
    field(f, 'style', 'linkStyle', linkStyle(a, ea), linkStyle(b, eb));
    field(f, 'style', 'animation', edgeAnimation(ea.data), edgeAnimation(eb.data));
    field(f, 'style', 'curve', ea.data?.curve, eb.data?.curve);
    metaFields(f, ma.edges?.[ea.id], mb.edges?.[eb.id], edgePresets);
  });
}

// ---- merged picture -----------------------------------------------------------------------------------------

/** The merged flowchart: the after version plus the removed items, changed text marked word by word. */
export function mergeFlowchart(env: MergeEnv, a: FlowchartModel, b: FlowchartModel): FlowchartModel {
  const { diff, byAfter, removed } = env;
  const nodes = new Map<string, FlowNode>(), groups = new Map<string, FlowGroup>();
  for (const [id, g] of b.groups) groups.set(id, { ...g, children: [...g.children] });
  for (const [id, n] of b.nodes) {
    const c = byAfter.get(`node:${id}`);
    const before = c?.beforeId ?? id;
    nodes.set(id, relabelChanged(c, a.nodes.get(before), n));
  }
  for (const [id, g] of groups) {
    const c = byAfter.get(`group:${id}`);
    if (changedField(c, 'label')) g.label = relabelChanged(c, a.groups.get(id), g).label;
  }
  // before id of a node → its id in the merged diagram
  const nodeId = new Map<string, string>();
  for (const c of diff.items) if (c.kind === 'node' && c.status !== 'removed') nodeId.set(c.beforeId ?? c.id, c.id);
  for (const c of removed) if (c.kind === 'group' || c.kind === 'node') nodeId.set(c.id, c.id + REMOVED);
  for (const c of removed.filter((x) => x.kind === 'group')) {
    const g = a.groups.get(c.id)!;
    const parent = g.parent ? nodeId.get(g.parent) ?? (groups.has(g.parent) ? g.parent : null) : null;
    const kept = keepRemoved(env, c, (id) => ({ ...g, id, label: g.label, parent, children: [] }));
    groups.set(kept.id, kept);
    groups.get(parent ?? '')?.children.push(kept.id);
  }
  for (const c of removed.filter((x) => x.kind === 'node')) {
    const n = a.nodes.get(c.id)!;
    const parent = n.parent ? (groups.has(nodeId.get(n.parent) ?? '') ? nodeId.get(n.parent)! : groups.has(n.parent) ? n.parent : null) : null;
    const kept = keepRemoved(env, c, (id) => ({ ...n, id, label: n.label, parent, lines: new Set<number>() }));
    nodes.set(kept.id, kept);
    groups.get(parent ?? '')?.children.push(kept.id);
  }
  const aEdges = new Map(a.edges.map((e) => [e.id, e]));
  const edges: FlowEdge[] = b.edges.map((e) => {
    const c = byAfter.get(`edge:${e.id}`);
    const before = aEdges.get(c?.beforeId ?? e.id);
    return relabelChanged(c, before, e);
  });
  let index = 1e6;
  for (const c of removed.filter((x) => x.kind === 'edge')) {
    const e = aEdges.get(c.id)!;
    const from = nodeId.get(e.from) ?? e.from, to = nodeId.get(e.to) ?? e.to;
    edges.push(keepRemoved(env, c, (id) => ({ ...e, id, from, to, label: e.label, index: index++ })));
  }
  const model: FlowchartModel = { ...b, nodes, groups, edges, classDefs: { ...a.classDefs, ...b.classDefs } };
  return model;
}
