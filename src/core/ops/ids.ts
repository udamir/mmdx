// Id helpers for the ops: free ids for new and copied items, the ids a model holds per metadata collection, and
// existence checks, from the diagram's kind. Positional sequence ids and activation ids live in core/ids.
import { withOps } from '../kinds/registry.js';
import type { MetaIds } from '../meta/index.js';
import type { DiagramModel } from '../model.js';
import type { ItemRef } from '../types.js';

/** Ids already taken by nodes, subgraphs, entities and participants (one namespace per diagram). */
export function takenIds(model: DiagramModel, withParticipants: boolean): Set<string> {
  return new Set(withOps(model, (k, m) => k.takenIds(m, withParticipants)) ?? []);
}

/** `base1`, `base2`… — the first that is not taken. */
export function uniqueId(model: DiagramModel, base: string): string {
  const taken = takenIds(model, true);
  for (let i = 1; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * Free copy ids: `api` → `api_2`, `api_3`… (an existing `_n` suffix is replaced, so copies of copies stay short).
 * `alsoTaken`: ids of another diagram the copies go into (a paste from another version).
 */
export function copyIds(model: DiagramModel, ids: Iterable<string>, alsoTaken: Iterable<string> = []): Record<string, string> {
  const taken = takenIds(model, false);
  for (const id of alsoTaken) taken.add(id);
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
  return withOps(model, (k, m) => k.usedIds(m)) ?? {};
}

/** Does the item exist in the model (prototype app `elementExists`)? */
export function elementExists(model: DiagramModel, ref: ItemRef): boolean {
  return withOps(model, (k, m) => k.exists(m, ref)) ?? false;
}
