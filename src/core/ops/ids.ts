// Id helpers for the ops: free ids for new and copied items, the ids a model holds per metadata collection, and
// existence checks. Positional sequence ids and activation ids live in core/ids (one source of truth).
import { activationsOf } from '../ids.js';
import type { MetaIds } from '../meta/index.js';
import type { DiagramModel } from '../model.js';
import type { ItemRef } from '../types.js';

/** Ids already taken by nodes, subgraphs, entities and participants (one namespace per diagram). */
function takenIds(model: DiagramModel, withParticipants: boolean): Set<string> {
  const taken = new Set<string>();
  if (model.type === 'flowchart') {
    for (const id of model.nodes.keys()) taken.add(id);
    for (const id of model.groups.keys()) taken.add(id);
  } else if (model.type === 'er') for (const id of model.entities.keys()) taken.add(id);
  else if (model.type === 'sequence' && withParticipants) for (const p of model.participants) taken.add(p.id);
  return taken;
}

/** `base1`, `base2`… — the first that is not taken. */
export function uniqueId(model: DiagramModel, base: string): string {
  const taken = takenIds(model, true);
  for (let i = 1; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/** Free copy ids: `api` → `api_2`, `api_3`… (an existing `_n` suffix is replaced, so copies of copies stay short). */
export function copyIds(model: DiagramModel, ids: Iterable<string>): Record<string, string> {
  const taken = takenIds(model, false);
  const map = Object.create(null) as Record<string, string>; // no prototype: an id may be `__proto__`
  for (const id of ids) {
    const base = id.replace(/_\d+$/, '');
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    taken.add(`${base}_${i}`);
    map[id] = `${base}_${i}`;
  }
  return map;
}

/** Item ids per metadata collection (prototype app `usedIds`) — what `pruneMeta` keeps. */
export function usedIds(model: DiagramModel): MetaIds {
  if (model.type === 'flowchart')
    return { nodes: new Set(model.nodes.keys()), groups: new Set(model.groups.keys()), edges: new Set(model.edges.map((e) => e.id)) };
  if (model.type === 'sequence') {
    const messages = new Set<string>(), notes = new Set<string>(), blocks = new Set<string>();
    for (const it of model.items) {
      if (it.kind === 'message') messages.add(it.id);
      else if (it.kind === 'note') notes.add(it.id);
      else if (it.kind === 'blockStart') blocks.add(it.id);
    }
    return {
      participants: new Set(model.participants.map((p) => p.id)),
      messages, notes, blocks,
      boxes: new Set(model.boxes.map((b) => b.id)),
      activations: new Set(activationsOf(model).map((a) => a.id)),
    };
  }
  if (model.type === 'er') return { entities: new Set(model.entities.keys()), rels: new Set(model.rels.map((r) => r.id)) };
  return {};
}

/** Does the item exist in the model (prototype app `elementExists`)? */
export function elementExists(model: DiagramModel, { kind, id }: ItemRef): boolean {
  switch (model.type) {
    case 'flowchart':
      return kind === 'node' ? model.nodes.has(id) : kind === 'group' ? model.groups.has(id) : kind === 'edge' ? model.edges.some((e) => e.id === id) : false;
    case 'er':
      return kind === 'entity' ? model.entities.has(id) : kind === 'rel' ? model.rels.some((r) => r.id === id) : false;
    case 'sequence':
      if (kind === 'participant') return model.participants.some((p) => p.id === id);
      if (kind === 'box') return model.boxes.some((b) => b.id === id);
      if (kind === 'activation') return activationsOf(model).some((a) => a.id === id);
      if (kind === 'message' || kind === 'note') return model.items.some((it) => it.kind === kind && it.id === id);
      if (kind === 'block') return model.items.some((it) => it.kind === 'blockStart' && it.id === id);
      return false;
    default:
      return false;
  }
}
