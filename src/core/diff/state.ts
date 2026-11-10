// The state diagram diff (the diff kind's `diff`: states, composites and transitions matched as in the flowchart, notes by
// their state and side, each change put into one facet) and its merged picture (`merge`: the after version plus the
// removed items in their old composite, changed text marked word by word). A state moved into another composite (or
// another concurrency region) is a layout change; its title, description rows, kind (state, choice, fork, join) or
// link are content. Pseudo-states (`[*]start`, `X/[*]end`…) are matched by id only.
import type { DiagramMeta } from '../meta/types.js';
import type { StateEdge, StateGroup, StateModel, StateNode, StateNote } from '../model.js';
import { field, metaFields, mermaidStyleOf, finish, added, removed, changedPresets, align, renames } from './kit.js';
import type { FieldChange, ItemChange } from './types.js';
import { carryMeta, changedField, REMOVED, type MergeEnv } from './merge.js';
import { mergeText } from './text.js';
import { maxOf } from '../geom.js';

// ---- diff --------------------------------------------------------------------------------------------------

const pseudo = (n: StateNode): boolean => n.kind === 'start' || n.kind === 'end';
const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();
const nodeName = (n: StateNode): string => one(n.label) || n.id;
const noteName = (n: StateNote): string => `Note: ${one(n.text)}`;

const edgeName = (e: StateEdge, m: StateModel): string => {
  const n = (id: string) => one(m.nodes.get(id)?.label || m.groups.get(id)?.label || '') || id;
  return `${n(e.from)} → ${n(e.to)}${e.label ? ` (${one(e.label)})` : ''}`;
};

/** Where an item is drawn: its composite, and its concurrency region when the composite has several (null: the top level). */
const placeOf = (m: StateModel, parent: string | null, region: number): string | null =>
  parent === null ? null : (m.groups.get(parent)?.regions ?? 1) > 1 ? `${parent} (region ${region + 1})` : parent;

const linkOf = (x: { link?: string; tooltip?: string }): string | undefined => (x.link ? (x.tooltip ? `${x.link} "${x.tooltip}"` : x.link) : undefined);

export function diffState(a: StateModel, b: StateModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'layout', 'direction', a.direction, b.direction);
  field(doc, 'content', 'title', a.title, b.title);
  for (const c of new Set([...Object.keys(a.classDefs), ...Object.keys(b.classDefs)])) field(doc, 'style', `classDef ${c}`, a.classDefs[c], b.classDefs[c]);
  const nodePresets = changedPresets(ma, mb, 'node'), edgePresets = changedPresets(ma, mb, 'edge'), groupPresets = changedPresets(ma, mb, 'group'), notePresets = changedPresets(ma, mb, 'note');

  // states: by id; a removed and an added state with the same title and kind are a rename (pseudo-states by id only)
  const goneNodes = [...a.nodes.values()].filter((n) => !b.nodes.has(n.id) && !pseudo(n)).map((n) => n.id);
  const newNodes = [...b.nodes.values()].filter((n) => !a.nodes.has(n.id) && !pseudo(n)).map((n) => n.id);
  const sig = (side: 'a' | 'b', id: string) => {
    const n = (side === 'a' ? a : b).nodes.get(id)!;
    return `${n.label}\u0000${n.kind}`;
  };
  const renamed = renames(goneNodes, newNodes, sig);
  const back = new Map([...renamed].map(([x, y]) => [y, x]));
  const toAfter = (id: string) => renamed.get(id) ?? id;

  const nodeFields = (na: StateNode, nb: StateNode): FieldChange[] => {
    const f: FieldChange[] = [];
    field(f, 'content', 'id', na.id, nb.id);
    field(f, 'content', 'label', na.label, nb.label);
    field(f, 'content', 'descriptions', na.descriptions.join('\n') || undefined, nb.descriptions.join('\n') || undefined);
    field(f, 'content', 'kind', na.kind, nb.kind);
    field(f, 'content', 'link', linkOf(na), linkOf(nb));
    field(f, 'layout', 'composite', placeOf(a, na.parent, na.region), placeOf(b, nb.parent, nb.region));
    field(f, 'style', 'classes', na.classes.join(' ') || undefined, nb.classes.join(' ') || undefined);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(na.classes, na.style, a.classDefs), mermaidStyleOf(nb.classes, nb.style, b.classDefs));
    metaFields(f, ma.nodes?.[na.id], mb.nodes?.[nb.id], nodePresets);
    return f;
  };
  for (const [id, nb] of b.nodes) {
    const beforeId = back.get(id) ?? id;
    const na = a.nodes.get(beforeId);
    items.push(na ? finish('node', id, nodeName(nb), nodeFields(na, nb), beforeId) : added('node', id, nodeName(nb)));
  }
  for (const [id, na] of a.nodes) if (!b.nodes.has(id) && !renamed.has(id)) items.push(removed('node', id, nodeName(na)));

  // composites: by id
  for (const [id, gb] of b.groups) {
    const ga = a.groups.get(id);
    if (!ga) {
      items.push(added('group', id, one(gb.label) || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ga.label, gb.label);
    field(f, 'content', 'link', linkOf(ga), linkOf(gb));
    field(f, 'layout', 'parent composite', placeOf(a, ga.parent, ga.region), placeOf(b, gb.parent, gb.region));
    field(f, 'layout', 'direction', ga.dir, gb.dir);
    field(f, 'layout', 'regions', ga.regions, gb.regions);
    field(f, 'style', 'classes', ga.classes.join(' ') || undefined, gb.classes.join(' ') || undefined);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(ga.classes, ga.style, a.classDefs), mermaidStyleOf(gb.classes, gb.style, b.classDefs));
    metaFields(f, ma.groups?.[id], mb.groups?.[id], groupPresets);
    items.push(finish('group', id, one(gb.label) || id, f));
  }
  for (const [id, ga] of a.groups) if (!b.groups.has(id)) items.push(removed('group', id, one(ga.label) || id));

  // transitions: matched by their ends (through renames), then in order among parallel ones
  const edgeKey = (e: StateEdge, map: (id: string) => string) => `${map(e.from)}->${map(e.to)}`;
  const { pairs, onlyA, onlyB } = align(
    a.edges,
    b.edges,
    (e) => `${edgeKey(e, toAfter)}|${e.label}`,
    (x, y) => edgeKey(x, toAfter) === edgeKey(y, (i) => i),
  );
  for (const [ea, eb] of pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ea.label, eb.label);
    metaFields(f, ma.edges?.[ea.id], mb.edges?.[eb.id], edgePresets);
    items.push(finish('edge', eb.id, edgeName(eb, b), f, ea.id));
  }
  for (const e of onlyB) items.push(added('edge', e.id, edgeName(e, b)));
  for (const e of onlyA) items.push(removed('edge', e.id, edgeName(e, a)));

  // notes: by (state, side), then in order among those (the same text first); a note that only changed sides is moved
  const where = (n: StateNote, map: (id: string) => string) => `${map(n.target)}|${n.side}`;
  const slots = new Map<string, [StateNote[], StateNote[]]>();
  const slot = (k: string): [StateNote[], StateNote[]] => slots.get(k) ?? (slots.set(k, [[], []]), slots.get(k)!);
  for (const n of a.notes) slot(where(n, toAfter))[0].push(n);
  for (const n of b.notes) slot(where(n, (i) => i))[1].push(n);
  const notePairs: [StateNote, StateNote][] = [], leftA: StateNote[] = [], leftB: StateNote[] = [];
  for (const [xs, ys] of slots.values()) {
    const r = align(xs, ys, (n) => n.text, () => true);
    notePairs.push(...r.pairs);
    leftA.push(...r.onlyA);
    leftB.push(...r.onlyB);
  }
  for (const x of [...leftA]) {
    const k = leftB.findIndex((y) => y.target === toAfter(x.target) && y.text === x.text);
    if (k < 0) continue;
    notePairs.push([x, leftB[k]!]);
    leftB.splice(k, 1);
    leftA.splice(leftA.indexOf(x), 1);
  }
  const byB = new Map(b.notes.map((n, i) => [n.id, i]));
  notePairs.sort((p, q) => byB.get(p[1].id)! - byB.get(q[1].id)!);
  for (const [x, y] of notePairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'layout', 'side', x.side, y.side);
    metaFields(f, ma.notes?.[x.id], mb.notes?.[y.id], notePresets);
    items.push(finish('note', y.id, noteName(y), f, x.id));
  }
  for (const y of leftB) items.push(added('note', y.id, noteName(y)));
  for (const x of leftA) items.push(removed('note', x.id, noteName(x)));
}

// ---- merged picture -----------------------------------------------------------------------------------------

/**
 * The merged state diagram: the after version plus the removed states, composites, transitions and notes, each in its
 * old composite (its after self when it is kept, else the removed one), so the layout grows the composites around
 * them; changed titles, description rows, transition labels and note texts marked word by word.
 */
export function mergeState(env: MergeEnv, a: StateModel, b: StateModel): StateModel {
  const { diff, meta, byAfter, removed: gone, mark } = env;
  const ma = env.before;
  const groups = new Map<string, StateGroup>(), nodes = new Map<string, StateNode>();
  for (const [id, g] of b.groups) {
    const c = byAfter.get(`group:${id}`);
    groups.set(id, { ...g, children: [...g.children], label: changedField(c, 'label') ? mergeText(a.groups.get(id)?.label ?? '', g.label) : g.label });
  }
  for (const [id, n] of b.nodes) {
    const c = byAfter.get(`node:${id}`);
    const na = a.nodes.get(c?.beforeId ?? id);
    if (!na || c?.status !== 'changed') {
      nodes.set(id, n);
      continue;
    }
    const next: StateNode = { ...n };
    if (changedField(c, 'label')) next.label = mergeText(na.label, n.label);
    if (changedField(c, 'descriptions')) next.descriptions = mergeText(na.descriptions.join('\n'), n.descriptions.join('\n')).split('\n');
    nodes.set(id, next);
  }

  // before id of a state or composite → its id in the merged diagram
  const idOf = new Map<string, string>();
  for (const c of diff.items) if ((c.kind === 'node' || c.kind === 'group') && (c.status === 'changed' || c.status === 'unchanged')) idOf.set(c.beforeId ?? c.id, c.id);
  const goneBy = new Map<string, ItemChange>();
  for (const c of gone) {
    goneBy.set(`${c.kind}:${c.id}`, c);
    if (c.kind === 'group' || c.kind === 'node') idOf.set(c.id, c.id + REMOVED);
  }
  /** The merged composite an item of the before version goes in (null: the top level), and its region there. */
  const placeIn = (parent: string | null, region: number): { parent: string | null; region: number } => {
    const p = parent === null ? undefined : idOf.get(parent) ?? (groups.has(parent) ? parent : undefined);
    const g = p === undefined ? undefined : groups.get(p);
    return g ? { parent: g.id, region: Math.min(region, Math.max(0, g.regions - 1)) } : { parent: null, region: 0 };
  };

  // removed composites: all of them first, so a removed composite inside another removed one finds its parent
  const goneGroups = [...a.groups.values()].filter((g) => goneBy.has(`group:${g.id}`));
  for (const ga of goneGroups) groups.set(ga.id + REMOVED, { ...ga, id: ga.id + REMOVED, children: [] });
  for (const ga of goneGroups) {
    const id = ga.id + REMOVED;
    const at = placeIn(ga.parent, ga.region);
    Object.assign(groups.get(id)!, at);
    groups.get(at.parent ?? '')?.children.push(id);
    carryMeta(meta, ma, 'group', ga.id, id);
    mark(goneBy.get(`group:${ga.id}`)!, id);
  }
  // removed states, in their old composite
  for (const na of a.nodes.values()) {
    const c = goneBy.get(`node:${na.id}`);
    if (!c) continue;
    const id = na.id + REMOVED;
    const at = placeIn(na.parent, na.region);
    nodes.set(id, { ...na, id, ...at });
    groups.get(at.parent ?? '')?.children.push(id);
    carryMeta(meta, ma, 'node', na.id, id);
    mark(c, id);
  }

  const end = (id: string): string => idOf.get(id) ?? id;
  const exists = (id: string): boolean => nodes.has(id) || groups.has(id);
  const edges: StateEdge[] = b.edges.map((e) => {
    const c = byAfter.get(`edge:${e.id}`);
    const before = a.edges.find((x) => x.id === (c?.beforeId ?? e.id));
    return before && changedField(c, 'label') ? { ...e, label: mergeText(before.label, e.label) } : e;
  });
  let index = Math.max(-1, maxOf(edges.map((e) => e.index))) + 1;
  for (const e of a.edges) {
    const c = goneBy.get(`edge:${e.id}`);
    if (!c) continue;
    const from = end(e.from), to = end(e.to);
    if (!exists(from) || !exists(to)) continue;
    const id = e.id + REMOVED;
    const at = placeIn(e.scope, e.region);
    edges.push({ ...e, id, from, to, scope: at.parent, region: at.region, index: index++ });
    carryMeta(meta, ma, 'edge', e.id, id);
    mark(c, id);
  }

  const notes: StateNote[] = b.notes.map((n) => {
    const c = byAfter.get(`note:${n.id}`);
    const before = a.notes.find((x) => x.id === (c?.beforeId ?? n.id));
    return before && changedField(c, 'text') ? { ...n, text: mergeText(before.text, n.text) } : n;
  });
  for (const n of a.notes) {
    const c = goneBy.get(`note:${n.id}`);
    if (!c) continue;
    const target = end(n.target);
    if (!exists(target)) continue;
    const id = n.id + REMOVED;
    const at = placeIn(n.scope, n.region);
    notes.push({ ...n, id, target, scope: at.parent, region: at.region });
    carryMeta(meta, ma, 'note', n.id, id);
    mark(c, id);
  }

  const model: StateModel = { ...b, nodes, groups, edges, notes, classDefs: { ...a.classDefs, ...b.classDefs } };
  return model;
}
