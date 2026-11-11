// The group tree (A10g): which group an item is in, the group a click selects, whether an item is inside a group, and
// a group's descendants — pure functions of a model (the view kind's containers of kind `group`), cached per model.
import { withKind, withOps } from '../../core/kinds/registry.js';
import type { DiagramModel } from '../../core/model.js';
import type { ItemKind, ItemRef } from '../../core/types.js';

/** Item key → the group it is directly in, per model. */
const parentCache = new WeakMap<object, Map<string, string>>();
function groupParents(model: DiagramModel): Map<string, string> {
  let m = parentCache.get(model);
  if (!m) {
    m = new Map();
    for (const [c, p] of withKind(model, (k, mm) => k.parents(mm)) ?? []) if (p.kind === 'group') m.set(`${c.kind}:${c.id}`, p.id);
    parentCache.set(model, m);
  }
  return m;
}

/** The groups around an item, innermost first (at most 64: a broken tree never loops). */
function* ancestors(model: DiagramModel, it: ItemRef): Generator<string> {
  const up = groupParents(model);
  for (let g = parentOf(model, it), guard = 0; g && guard < 64; g = up.get(`group:${g}`) ?? null, guard++) yield g;
}

/** The group an item is directly in (null: none). */
export function parentOf(model: DiagramModel, it: ItemRef): string | null {
  return groupParents(model).get(`${it.kind}:${it.id}`) ?? null;
}

/** What stops a click's group walk: the entered group, lanes, and locked groups (skipped, not stopped at). */
export interface GroupWalk {
  entered: string | null;
  isLane(gid: string): boolean;
  locked(gid: string): boolean;
}

/** The outermost group around an item that a click selects (stops at lanes and the entered group, skips locked groups). */
export function groupTarget(model: DiagramModel, it: ItemRef, w: GroupWalk): string | null {
  if (it.kind !== 'node' && it.kind !== 'group' && it.kind !== 'entity') return null;
  let best: string | null = null;
  for (const g of ancestors(model, it)) {
    if (g === w.entered || w.isLane(g)) break;
    if (!w.locked(g)) best = g;
  }
  return best;
}

/** The item is the group or inside it, at any depth. */
export function insideGroup(model: DiagramModel, it: ItemRef, gid: string): boolean {
  if (it.kind === 'group' && it.id === gid) return true;
  for (const g of ancestors(model, it)) if (g === gid) return true;
  return false;
}

/** The nodes and groups inside a group, at any depth (`leaf`: the kind of its items when not nodes). */
export function groupDescendants(model: DiagramModel, gid: string): { nodes: string[]; groups: string[]; leaf?: ItemKind } {
  return withOps(model, (k, m) => k.descendants?.(m, gid)) ?? { nodes: [], groups: [] };
}
