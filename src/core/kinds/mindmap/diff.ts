// The mindmap diff (the diff kind's `diff`: nodes matched across the versions, each change put into one facet) and its
// merged picture (`merge`: the after version plus the removed nodes in their old place, changed text marked).
// Matching: ops-match.ts matchMindNodes, which the metadata carry-over over a code change shares.
import type { DiagramMeta } from '../../meta/types.js';
import type { MindmapModel, MindNode } from '../../model.js';
import { assignDepths } from './parse.js';
import { matchMindNodes } from './ops-match.js';
import { field, metaFields, finish, added, removed, changedPresets } from '../../diff/kit.js';
import type { FieldChange, ItemChange } from '../../diff/types.js';
import { keepRemoved, REMOVED } from '../../diff/merge.js';
import { type MergeEnv } from '../../diff/types.js';
import { mergeText } from '../../diff/text.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

/** Each node's place among its parent's children (a flat map's `indexOf` per node is quadratic). */
const ranksOf = (m: MindmapModel): Map<string, number> => {
  const out = new Map<string, number>();
  for (const n of m.nodes.values()) n.children.forEach((c, i) => out.set(c, i));
  return out;
};

const parentLabel = (m: MindmapModel, n: MindNode): string | undefined => (n.parent ? one(m.nodes.get(n.parent)?.label ?? '') : undefined);

export function diffMindmap(a: MindmapModel, b: MindmapModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'style', 'colour by', a.colorBy, b.colorBy);
  field(doc, 'content', 'label width', a.maxNodeWidth, b.maxNodeWidth);
  const presets = changedPresets(ma, mb, 'node');
  const map = matchMindNodes(a, b);
  const back = new Map([...map].map(([x, y]) => [y, x]));
  const ra = ranksOf(a), rb = ranksOf(b);
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
    else if (na.parent && ra.get(na.id) !== rb.get(nb.id)) field(f, 'layout', 'order', ra.get(na.id)! + 1, rb.get(nb.id)! + 1);
    field(f, 'style', 'classes', na.classes.join(' ') || undefined, nb.classes.join(' ') || undefined);
    metaFields(f, ma.nodes?.[na.id], mb.nodes?.[nb.id], presets);
    items.push(finish('node', nb.id, one(nb.label), f, na.id));
  }
  for (const na of a.nodes.values()) if (!map.has(na.id)) items.push(removed('node', na.id, one(na.label)));
}

/** The merged map: the after version, the removed nodes back under their old parent at their old rank, changed text marked. */
export function mergeMindmap(env: MergeEnv, a: MindmapModel, b: MindmapModel): MindmapModel {
  const { byAfter, removed: gone } = env;
  const nodes = new Map<string, MindNode>();
  for (const [id, n] of b.nodes) {
    const c = byAfter.get(`node:${id}`);
    const na = c?.beforeId !== undefined ? a.nodes.get(c.beforeId) : a.nodes.get(id);
    const changed = c?.status === 'changed' && c.fields.some((f) => f.facet === 'content' && f.field === 'label');
    nodes.set(id, { ...n, children: [...n.children], label: changed && na ? mergeText(na.label, n.label) : n.label });
  }
  const map = matchMindNodes(a, b);
  const ra = ranksOf(a);
  const goneById = new Map(gone.map((c) => [c.id, c]));
  const idOf = (beforeId: string): string | undefined => map.get(beforeId) ?? (goneById.has(beforeId) ? beforeId + REMOVED : undefined);
  // in code order, so a removed parent is in place before its removed children
  for (const na of a.nodes.values()) {
    const c = goneById.get(na.id);
    if (!c) continue;
    const parent = na.parent ? idOf(na.parent) ?? b.root : null;
    const kept = keepRemoved(env, c, (id) => ({ ...na, id, written: null, parent, children: [] as string[] }));
    const id = kept.id;
    nodes.set(id, kept);
    const p = parent ? nodes.get(parent) : undefined;
    if (p) {
      const at = Math.min(ra.get(na.id) ?? p.children.length, p.children.length);
      p.children.splice(at, 0, id);
    }
  }
  const model: MindmapModel = { ...b, nodes, root: b.root ?? (a.root ? idOf(a.root) ?? null : null) };
  assignDepths(model);
  return model;
}
