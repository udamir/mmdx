// The merged diagram of a diff (§7.3): the after version plus every removed item (kept where it was), with changed
// text carrying word-level change marks. The renderer lays it out like any diagram, so removed items, removed ER
// attributes and removed sequence messages get real room instead of being drawn on top of the new version. A removed
// item keeps its text unmarked (the item itself shows as removed); a removed ER row inside a kept entity is marked.
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import { own, setOwn } from '../own.js';
import type {
  ErAttribute, ErModel, FlowEdge, FlowGroup, FlowNode, FlowchartModel, SeqItem, SeqMessage, SeqNote, SequenceModel,
  SupportedModel,
} from '../model.js';
import { deleted, inserted, stripMarks } from '../text/marks.js';
import type { ItemKind } from '../types.js';
import type { DiagramDiff, ItemChange } from './types.js';
import { mergeText } from './text.js';

/** Suffix of a removed item's id in the merged diagram (sequence ids are positions, so they would clash). */
export const REMOVED = '~del';

/**
 * The key of a change everywhere in the UI: the item's key in the merged diagram (`kind:id`; removed items carry the
 * `~del` suffix, except participants, which keep their id because removed messages still refer to them).
 */
export const changeKey = (c: Pick<ItemChange, 'kind' | 'id' | 'status'>): string =>
  `${c.kind}:${c.status === 'removed' && c.kind !== 'participant' ? c.id + REMOVED : c.id}`;

/** The item's key in the before version. */
export const beforeKey = (c: Pick<ItemChange, 'kind' | 'id' | 'beforeId'>): string => `${c.kind}:${c.beforeId ?? c.id}`;

export interface Merged {
  model: SupportedModel;
  meta: DiagramMeta;
  /** `kind:id` in the merged diagram → how the item changed. Unchanged items are absent. */
  status: Map<string, ItemChange>;
}

const clone = <T extends object>(o: T): T => ({ ...o });

function mergeMeta(a: DiagramMeta, b: DiagramMeta): DiagramMeta {
  const styles: DiagramMeta['styles'] = {};
  for (const k of new Set([...Object.keys(a.styles), ...Object.keys(b.styles)])) styles[k] = { ...a.styles[k], ...b.styles[k] };
  const meta = { ...b, canvas: { ...b.canvas }, styles } as DiagramMeta;
  for (const k of ['nodes', 'groups', 'edges', 'participants', 'messages', 'notes', 'blocks', 'boxes', 'activations', 'entities', 'rels'] as const)
    (meta as unknown as Record<string, unknown>)[k] = { ...(b[k] ?? {}) };
  return meta;
}

const collOf: Partial<Record<ItemKind, keyof DiagramMeta>> = {
  node: 'nodes', group: 'groups', edge: 'edges', participant: 'participants', message: 'messages', note: 'notes', block: 'blocks', entity: 'entities', rel: 'rels',
};

function carryMeta(meta: DiagramMeta, before: DiagramMeta, kind: ItemKind, fromId: string, toId: string): void {
  const coll = collOf[kind];
  if (!coll) return;
  const src = own(before[coll] as Record<string, ItemMeta> | undefined, fromId);
  if (src) setOwn(meta[coll] as Record<string, ItemMeta>, toId, { ...src });
}

const changedField = (c: ItemChange | undefined, name: string) => c?.status === 'changed' && c.fields.some((f) => f.facet === 'content' && f.field === name);

/**
 * Builds the merged model, or null when the diagram type changed (the views then fall back to before / after).
 * `status` maps the merged keys (`kind:id`, removed items with the `~del` suffix except participants) to changes.
 */
export function mergeDiagrams(diff: DiagramDiff, a: SupportedModel, b: SupportedModel, ma: DiagramMeta, mb: DiagramMeta): Merged | null {
  if (diff.typeChanged || a.type !== b.type) return null;
  const meta = mergeMeta(ma, mb);
  const status = new Map<string, ItemChange>();
  const byAfter = new Map<string, ItemChange>();
  for (const c of diff.items) {
    if (c.status === 'removed') continue;
    byAfter.set(`${c.kind}:${c.id}`, c);
    if (c.status !== 'unchanged') status.set(`${c.kind}:${c.id}`, c);
  }
  const removed = diff.items.filter((c) => c.status === 'removed');
  const mark = (c: ItemChange, id: string) => status.set(`${c.kind}:${id}`, c);

  if (a.type === 'flowchart' && b.type === 'flowchart') {
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
    return { model, meta, status };
  }

  if (a.type === 'er' && b.type === 'er') {
    const entities = new Map(b.entities);
    for (const [id, e] of entities) {
      const c = byAfter.get(`entity:${id}`);
      const ea = a.entities.get(id);
      if (!ea || c?.status !== 'changed' || !c.facets.includes('content')) continue;
      entities.set(id, { ...e, label: mergeText(ea.label, e.label), attrs: mergeAttrs(ea.attrs, e.attrs) });
    }
    for (const c of removed.filter((x) => x.kind === 'entity')) {
      const e = a.entities.get(c.id)!;
      entities.set(c.id + REMOVED, { ...e, id: c.id + REMOVED, attrs: [...e.attrs], lines: new Set() });
      carryMeta(meta, ma, 'entity', c.id, c.id + REMOVED);
      mark(c, c.id + REMOVED);
    }
    const ent = (id: string) => (entities.has(id) ? id : id + REMOVED);
    const rels = b.rels.map((r) => {
      const c = byAfter.get(`rel:${r.id}`);
      const ra = a.rels.find((x) => x.id === r.id);
      return ra && changedField(c, 'label') ? { ...r, label: mergeText(ra.label, r.label) } : r;
    });
    for (const c of removed.filter((x) => x.kind === 'rel')) {
      const r = a.rels.find((x) => x.id === c.id)!;
      rels.push({ ...r, id: c.id + REMOVED, from: ent(r.from), to: ent(r.to) });
      carryMeta(meta, ma, 'rel', c.id, c.id + REMOVED);
      mark(c, c.id + REMOVED);
    }
    const model: ErModel = { ...b, entities, rels };
    return { model, meta, status };
  }

  if (a.type === 'sequence' && b.type === 'sequence') {
    const participants = [...b.participants];
    for (const [i, p] of participants.entries()) {
      const c = byAfter.get(`participant:${p.id}`);
      const pa = a.participants.find((x) => x.id === p.id);
      if (pa && changedField(c, 'label')) participants[i] = { ...p, label: mergeText(pa.label, p.label) };
    }
    for (const c of removed.filter((x) => x.kind === 'participant')) {
      const p = a.participants.find((x) => x.id === c.id)!;
      const at = Math.min(a.participants.indexOf(p), participants.length);
      participants.splice(at, 0, { ...p, box: null, lines: new Set() });
      mark(c, p.id);
    }
    const items: SeqItem[] = b.items.map((it) => {
      if (it.kind !== 'message' && it.kind !== 'note' && it.kind !== 'blockStart') return it;
      const kind = it.kind === 'blockStart' ? 'block' : it.kind;
      const c = byAfter.get(`${kind}:${it.id}`);
      if (c?.status !== 'changed') return it;
      const prev = a.items.find((x) => x.kind === it.kind && x.id === (c.beforeId ?? it.id));
      if (it.kind === 'message' && prev?.kind === 'message' && changedField(c, 'text')) return { ...it, text: mergeText(prev.text, it.text) };
      if (it.kind === 'note' && prev?.kind === 'note' && changedField(c, 'text')) return { ...it, text: mergeText(prev.text, it.text) };
      if (it.kind === 'blockStart' && prev?.kind === 'blockStart' && changedField(c, 'label')) return { ...it, label: mergeText(prev.label, it.label) };
      return it;
    });
    // removed messages and notes go right after the nearest earlier item that both versions have
    const afterOf = new Map<string, string>();
    for (const c of diff.items) if (c.status !== 'removed' && (c.kind === 'message' || c.kind === 'note')) afterOf.set(`${c.kind}:${c.beforeId ?? c.id}`, `${c.kind}:${c.id}`);
    const gone = new Set(removed.filter((c) => c.kind === 'message' || c.kind === 'note').map((c) => `${c.kind}:${c.id}`));
    let anchor: string | null = null;
    const pending = new Map<string | null, SeqItem[]>();
    for (const x of a.items) {
      if (x.kind !== 'message' && x.kind !== 'note') continue;
      const k = `${x.kind}:${x.id}`;
      if (gone.has(k)) {
        const copy: SeqMessage | SeqNote = x.kind === 'message' ? { ...x, id: x.id + REMOVED, activate: false, deactivate: false } : { ...x, id: x.id + REMOVED };
        pending.set(anchor, [...(pending.get(anchor) ?? []), copy]);
        carryMeta(meta, ma, x.kind, x.id, x.id + REMOVED);
        mark(removed.find((c) => `${c.kind}:${c.id}` === k)!, x.id + REMOVED);
      } else anchor = afterOf.get(k) ?? anchor;
    }
    const merged: SeqItem[] = [...(pending.get(null) ?? [])];
    for (const it of items) {
      merged.push(it);
      if (it.kind === 'message' || it.kind === 'note') merged.push(...(pending.get(`${it.kind}:${it.id}`) ?? []));
    }
    const model: SequenceModel = { ...b, participants, items: merged };
    return { model, meta, status };
  }
  return null;
}

const delAttr = (x: ErAttribute): ErAttribute => ({ ...x, type: deleted(x.type), name: deleted(x.name), comment: deleted(x.comment), keys: x.keys.map(deleted) as ErAttribute['keys'] });
const insAttr = (x: ErAttribute): ErAttribute => ({ ...x, type: inserted(x.type), name: inserted(x.name), comment: inserted(x.comment), keys: x.keys.map(inserted) as ErAttribute['keys'] });

/** The after attributes in order, with removed ones put back after their previous neighbour, and changes marked. */
function mergeAttrs(before: readonly ErAttribute[], after: readonly ErAttribute[]): ErAttribute[] {
  const A = new Map(before.map((x) => [x.name, x]));
  const B = new Set(after.map((x) => x.name));
  const out: ErAttribute[] = after.map((x) => {
    const y = A.get(x.name);
    if (!y) return insAttr(x);
    if (y.type === x.type && y.comment === x.comment && y.keys.join() === x.keys.join()) return x;
    return { ...x, type: mergeText(y.type, x.type), comment: mergeText(y.comment, x.comment), keys: (y.keys.join() === x.keys.join() ? x.keys : [mergeText(y.keys.join(','), x.keys.join(','))]) as ErAttribute['keys'] };
  });
  let prev: string | null = null;
  for (const y of before) {
    if (B.has(y.name)) {
      prev = y.name;
      continue;
    }
    const at = prev === null ? 0 : out.findIndex((x) => stripMarks(x.name) === prev) + 1;
    out.splice(at, 0, delAttr(y));
    prev = y.name;
  }
  return out;
}

