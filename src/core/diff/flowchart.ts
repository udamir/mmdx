// The flowchart diff (the view kind's `diff`: items matched by identity, or by aligning positional ones, each change put into one
// facet) and its merged picture (`merge`: the after version plus the removed items, changed text marked word by word).
import type { DiagramMeta } from '../meta/types.js';
import type { FlowEdge, FlowEdgeData, FlowGroup, FlowNode, FlowNodeData, FlowchartModel } from '../model.js';
import { isEmpty, field, metaFacet, metaFields, mermaidStyleOf, finish, added, removed, changedPresets, align, renames } from './kit.js';
import type { FieldChange, ItemChange } from './types.js';
import { carryMeta, changedField, REMOVED, type MergeEnv } from './merge.js';
import { mergeText } from './text.js';

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
  for (const c of new Set([...Object.keys(a.classDefs), ...Object.keys(b.classDefs)])) field(doc, 'style', `classDef ${c}`, a.classDefs[c], b.classDefs[c]);
  const nodePresets = changedPresets(ma, mb, 'node'), edgePresets = changedPresets(ma, mb, 'edge'), groupPresets = changedPresets(ma, mb, 'group');

  const goneNodes = [...a.nodes.keys()].filter((id) => !b.nodes.has(id));
  const newNodes = [...b.nodes.keys()].filter((id) => !a.nodes.has(id));
  const sig = (side: 'a' | 'b', id: string) => {
    const n = (side === 'a' ? a : b).nodes.get(id)!;
    return `${n.label}\u0000${n.shape}`;
  };
  const renamed = renames(goneNodes, newNodes, sig);
  const toAfter = (id: string) => renamed.get(id) ?? id;

  const nodeFields = (na: FlowNode, nb: FlowNode): FieldChange[] => {
    const f: FieldChange[] = [];
    field(f, 'content', 'id', na.id, nb.id);
    field(f, 'content', 'label', na.label, nb.label);
    field(f, 'content', 'shape', na.shape, nb.shape);
    field(f, 'content', 'group', na.parent ? toAfter(na.parent) : null, nb.parent);
    field(f, 'content', 'link', na.link, nb.link);
    nodeDataFields(f, na.data, nb.data);
    field(f, 'style', 'classes', na.classes, nb.classes);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(na.classes, na.style, a.classDefs), mermaidStyleOf(nb.classes, nb.style, b.classDefs));
    metaFields(f, ma.nodes?.[na.id], mb.nodes?.[nb.id], nodePresets);
    return f;
  };

  for (const [id, nb] of b.nodes) {
    const beforeId = [...renamed].find(([, to]) => to === id)?.[0] ?? id;
    const na = a.nodes.get(beforeId);
    items.push(na ? finish('node', id, nb.label || id, nodeFields(na, nb), beforeId) : added('node', id, nb.label || id));
  }
  for (const id of goneNodes) if (!renamed.has(id)) items.push(removed('node', id, a.nodes.get(id)!.label || id));

  for (const [id, gb] of b.groups) {
    const ga = a.groups.get(id);
    if (!ga) {
      items.push(added('group', id, gb.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ga.label, gb.label);
    field(f, 'content', 'parent group', ga.parent, gb.parent);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(ga.classes, ga.style, a.classDefs), mermaidStyleOf(gb.classes, gb.style, b.classDefs));
    metaFields(f, ma.groups?.[id], mb.groups?.[id], groupPresets);
    items.push(finish('group', id, gb.label || id, f));
  }
  for (const [id, ga] of a.groups) if (!b.groups.has(id)) items.push(removed('group', id, ga.label || id));

  // edges: matched by endpoints (through renames), then in order among parallel edges
  const linkStyle = (m: FlowchartModel, e: FlowEdge) => {
    const s = { ...m.linkStyles['default'], ...m.linkStyles[String(e.index)] };
    return isEmpty(s) ? undefined : s;
  };
  const edgeKey = (e: FlowEdge, map: (id: string) => string) => `${map(e.from)}->${map(e.to)}`;
  const { pairs, onlyA, onlyB } = align(
    a.edges,
    b.edges,
    (e) => `${edgeKey(e, toAfter)}|${e.label}|${e.line}|${e.start}|${e.end}`,
    (x, y) => edgeKey(x, toAfter) === edgeKey(y, (i) => i),
  );
  for (const [ea, eb] of pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ea.label, eb.label);
    field(f, 'content', 'line', ea.line, eb.line);
    field(f, 'content', 'arrow heads', `${ea.start}/${ea.end}`, `${eb.start}/${eb.end}`);
    field(f, 'layout', 'min length', ea.minlen, eb.minlen);
    field(f, 'style', 'linkStyle', linkStyle(a, ea), linkStyle(b, eb));
    field(f, 'style', 'animation', edgeAnimation(ea.data), edgeAnimation(eb.data));
    field(f, 'style', 'curve', ea.data?.curve, eb.data?.curve);
    metaFields(f, ma.edges?.[ea.id], mb.edges?.[eb.id], edgePresets);
    items.push(finish('edge', eb.id, edgeName(eb, b), f, ea.id));
  }
  for (const e of onlyB) items.push(added('edge', e.id, edgeName(e, b)));
  for (const e of onlyA) items.push(removed('edge', e.id, edgeName(e, a)));
}

// ---- merged picture -----------------------------------------------------------------------------------------

/** The merged flowchart: the after version plus the removed items, changed text marked word by word. */
export function mergeFlowchart(env: MergeEnv, a: FlowchartModel, b: FlowchartModel): FlowchartModel {
  const { diff, meta, byAfter, removed, mark } = env;
  const ma = env.before;
  const nodes = new Map<string, FlowNode>(), groups = new Map<string, FlowGroup>();
  for (const [id, g] of b.groups) groups.set(id, { ...g, children: [...g.children] });
  for (const [id, n] of b.nodes) {
    const c = byAfter.get(`node:${id}`);
    const before = c?.beforeId ?? id;
    nodes.set(id, changedField(c, 'label') ? { ...n, label: mergeText(a.nodes.get(before)?.label ?? '', n.label) } : n);
  }
  for (const [id, g] of groups) {
    const c = byAfter.get(`group:${id}`);
    if (changedField(c, 'label')) g.label = mergeText(a.groups.get(id)?.label ?? '', g.label);
  }
  // before id of a node → its id in the merged diagram
  const nodeId = new Map<string, string>();
  for (const c of diff.items) if (c.kind === 'node' && c.status !== 'removed') nodeId.set(c.beforeId ?? c.id, c.id);
  for (const c of removed) if (c.kind === 'group' || c.kind === 'node') nodeId.set(c.id, c.id + REMOVED);
  for (const c of removed.filter((x) => x.kind === 'group')) {
    const g = a.groups.get(c.id)!;
    const parent = g.parent ? nodeId.get(g.parent) ?? (groups.has(g.parent) ? g.parent : null) : null;
    groups.set(c.id + REMOVED, { ...g, id: c.id + REMOVED, label: g.label, parent, children: [] });
    groups.get(parent ?? '')?.children.push(c.id + REMOVED);
    carryMeta(meta, ma, 'group', c.id, c.id + REMOVED);
    mark(c, c.id + REMOVED);
  }
  for (const c of removed.filter((x) => x.kind === 'node')) {
    const n = a.nodes.get(c.id)!;
    const parent = n.parent ? (groups.has(nodeId.get(n.parent) ?? '') ? nodeId.get(n.parent)! : groups.has(n.parent) ? n.parent : null) : null;
    nodes.set(c.id + REMOVED, { ...n, id: c.id + REMOVED, label: n.label, parent, lines: new Set() });
    groups.get(parent ?? '')?.children.push(c.id + REMOVED);
    carryMeta(meta, ma, 'node', c.id, c.id + REMOVED);
    mark(c, c.id + REMOVED);
  }
  const edges: FlowEdge[] = b.edges.map((e) => {
    const c = byAfter.get(`edge:${e.id}`);
    const before = a.edges.find((x) => x.id === (c?.beforeId ?? e.id));
    return changedField(c, 'label') ? { ...e, label: mergeText(before?.label ?? '', e.label) } : e;
  });
  let index = 1e6;
  for (const c of removed.filter((x) => x.kind === 'edge')) {
    const e = a.edges.find((x) => x.id === c.id)!;
    const from = nodeId.get(e.from) ?? e.from, to = nodeId.get(e.to) ?? e.to;
    edges.push({ ...e, id: c.id + REMOVED, from, to, label: e.label, index: index++ });
    carryMeta(meta, ma, 'edge', c.id, c.id + REMOVED);
    mark(c, c.id + REMOVED);
  }
  const model: FlowchartModel = { ...b, nodes, groups, edges, classDefs: { ...a.classDefs, ...b.classDefs } };
  return model;
}
