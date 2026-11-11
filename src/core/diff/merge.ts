// The merged diagram of a diff (§7.3): the after version plus every removed item (kept where it was), with changed
// text carrying word-level change marks. The renderer lays it out like any diagram, so removed items, removed ER
// attributes and removed sequence messages get real room instead of being drawn on top of the new version. A removed
// item keeps its text unmarked (the item itself shows as removed); a removed ER row inside a kept entity is marked.
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import { own, setOwn } from '../own.js';
import { diffKind, withDiff } from '../kinds/registry.js';
import type { SupportedModel } from '../model.js';
import type { ItemKind } from '../types.js';
import type { DiagramDiff, ItemChange, MergeEnv } from './types.js';

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

export function carryMeta(meta: DiagramMeta, before: DiagramMeta, kind: ItemKind, fromId: string, toId: string): void {
  const coll = collOf[kind];
  if (!coll) return;
  const src = own(before[coll] as Record<string, ItemMeta> | undefined, fromId);
  if (src) setOwn(meta[coll] as Record<string, ItemMeta>, toId, { ...src });
}

export const changedField = (c: ItemChange | undefined, name: string) => c?.status === 'changed' && c.fields.some((f) => f.facet === 'content' && f.field === name);

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

  const env: MergeEnv = { diff, meta, before: ma, byAfter, removed, mark };
  // without the type's diff kind there is no merged picture (the views show before and after; the diff says why)
  if (!diffKind(a.type)) return null;
  const model = withDiff(a, (k, m) => k.merge(env, m, b));
  return model ? { model, meta, status } : null;
}
