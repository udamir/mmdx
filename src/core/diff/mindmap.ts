// The mindmap diff (the diff kind's `diff`: nodes matched across the versions, each change put into one facet) and its
// merged picture (`merge`: the after version plus the removed nodes in their old place, changed text marked).
// Matching: a written id that both versions have, else a node's place in the tree (its path of labels and its rank
// among same-label siblings), else (label, matched parent), else the label alone — a node with the same label under
// another parent is one that moved (layout), not a removal and an addition.
import type { DiagramMeta } from '../meta/types.js';
import type { MindmapModel, MindNode } from '../model.js';
import { assignDepths, mindKeys } from '../parse/mindmap.js';
import { field, metaFields, finish, added, removed, changedPresets } from './kit.js';
import type { FieldChange, ItemChange } from './types.js';
import { carryMeta, REMOVED, type MergeEnv } from './merge.js';
import { mergeText } from './text.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

/** Before id → after id of the nodes both versions have. */
export function matchMindNodes(a: MindmapModel, b: MindmapModel): Map<string, string> {
  const out = new Map<string, string>(), taken = new Set<string>();
  const pair = (x: string, y: string): void => {
    out.set(x, y);
    taken.add(y);
  };
  // written ids
  for (const n of a.nodes.values()) {
    const m = n.written ? b.nodes.get(n.id) : undefined;
    if (m && m.written === n.written) pair(n.id, m.id);
  }
  // the root is the root
  if (a.root && b.root && !out.has(a.root) && !taken.has(b.root)) pair(a.root, b.root);
  // the same place in the tree
  const ka = mindKeys(a), kb = mindKeys(b);
  const byKey = new Map<string, string>();
  for (const [id, k] of kb) if (!taken.has(id) && !byKey.has(k)) byKey.set(k, id);
  for (const n of a.nodes.values()) {
    if (out.has(n.id)) continue;
    const k = ka.get(n.id);
    const hit = k !== undefined ? byKey.get(k) : undefined;
    if (hit && !taken.has(hit)) pair(n.id, hit);
  }
  // (label, matched parent), then the label alone, in code order
  const free = (pred: (x: MindNode, y: MindNode) => boolean): void => {
    for (const n of a.nodes.values()) {
      if (out.has(n.id)) continue;
      const hit = [...b.nodes.values()].find((m) => !taken.has(m.id) && m.label === n.label && pred(n, m));
      if (hit) pair(n.id, hit.id);
    }
  };
  free((x, y) => !!x.parent && out.get(x.parent) === y.parent);
  free(() => true);
  return out;
}

const parentLabel = (m: MindmapModel, n: MindNode): string | undefined => (n.parent ? one(m.nodes.get(n.parent)?.label ?? '') : undefined);

export function diffMindmap(a: MindmapModel, b: MindmapModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'style', 'colour by', a.colorBy, b.colorBy);
  field(doc, 'content', 'label width', a.maxNodeWidth, b.maxNodeWidth);
  const presets = changedPresets(ma, mb, 'node');
  const map = matchMindNodes(a, b);
  const back = new Map([...map].map(([x, y]) => [y, x]));
  for (const nb of b.nodes.values()) {
    const ida = back.get(nb.id);
    const na = ida !== undefined ? a.nodes.get(ida) : undefined;
    if (!na) {
      items.push(added('node', nb.id, one(nb.label)));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', na.label, nb.label);
    field(f, 'content', 'shape', na.shape, nb.shape);
    field(f, 'content', 'icon', na.icon ?? undefined, nb.icon ?? undefined);
    // a new parent: the node moved
    const movedParent = (na.parent ? map.get(na.parent) : null) !== nb.parent;
    if (movedParent) field(f, 'layout', 'parent', parentLabel(a, na), parentLabel(b, nb));
    else if (na.parent && a.nodes.get(na.parent)!.children.indexOf(na.id) !== b.nodes.get(nb.parent!)?.children.indexOf(nb.id)) field(f, 'layout', 'order', a.nodes.get(na.parent)!.children.indexOf(na.id) + 1, b.nodes.get(nb.parent!)!.children.indexOf(nb.id) + 1);
    field(f, 'style', 'classes', na.classes.join(' ') || undefined, nb.classes.join(' ') || undefined);
    metaFields(f, ma.nodes?.[na.id], mb.nodes?.[nb.id], presets);
    items.push(finish('node', nb.id, one(nb.label), f, na.id));
  }
  for (const na of a.nodes.values()) if (!map.has(na.id)) items.push(removed('node', na.id, one(na.label)));
}

/** The merged map: the after version, the removed nodes back under their old parent at their old rank, changed text marked. */
export function mergeMindmap(env: MergeEnv, a: MindmapModel, b: MindmapModel): MindmapModel {
  const { meta, byAfter, removed: gone, mark } = env;
  const ma = env.before;
  const nodes = new Map<string, MindNode>();
  for (const [id, n] of b.nodes) {
    const c = byAfter.get(`node:${id}`);
    const na = c?.beforeId !== undefined ? a.nodes.get(c.beforeId) : a.nodes.get(id);
    const changed = c?.status === 'changed' && c.fields.some((f) => f.facet === 'content' && f.field === 'label');
    nodes.set(id, { ...n, children: [...n.children], label: changed && na ? mergeText(na.label, n.label) : n.label });
  }
  const map = matchMindNodes(a, b);
  const idOf = (beforeId: string): string | undefined => map.get(beforeId) ?? (gone.some((c) => c.id === beforeId) ? beforeId + REMOVED : undefined);
  // in code order, so a removed parent is in place before its removed children
  for (const na of a.nodes.values()) {
    const c = gone.find((x) => x.id === na.id);
    if (!c) continue;
    const id = na.id + REMOVED;
    const parent = na.parent ? idOf(na.parent) ?? b.root : null;
    nodes.set(id, { ...na, id, written: null, parent, children: [] });
    const p = parent ? nodes.get(parent) : undefined;
    if (p) {
      const at = Math.min(a.nodes.get(na.parent!)?.children.indexOf(na.id) ?? p.children.length, p.children.length);
      p.children.splice(at, 0, id);
    }
    carryMeta(meta, ma, 'node', na.id, id);
    mark(c, id);
  }
  const model: MindmapModel = { ...b, nodes, root: b.root ?? (a.root ? idOf(a.root) ?? null : null) };
  assignDepths(model);
  return model;
}
