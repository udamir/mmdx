// Layers (A.7 row 67): user-defined, stored as metadata.
//   %%@ layer L1 {"name":"Infrastructure","hidden":true}   definitions (order = list order)
//   %%@ node metrics {…,"layer":"L1"}                      membership; no "layer" = Default
// Hiding a layer hides its items and everything attached to them (connectors, messages, group contents): the
// renderers cascade from the direct ids computed here.
import { withKind } from './kinds/registry.js';
import type { DiagramMeta, ItemMeta, LayerMeta } from './meta/types.js';
import { KIND_TO_COLL } from './meta/types.js';
import type { DiagramModel } from './model.js';
import type { HiddenSets } from './render/types.js';
import type { ItemKind, ItemRef } from './types.js';

export const DEFAULT_LAYER = 'default';

export interface LayerDef extends LayerMeta {
  id: string;
  name: string;
  hidden: boolean;
}

/** Default first, then the diagram's layers in file order. */
export function layerDefs(meta: DiagramMeta): LayerDef[] {
  const L = meta.layers ?? {};
  const d = L[DEFAULT_LAYER] ?? {};
  const out: LayerDef[] = [{ ...d, id: DEFAULT_LAYER, name: d.name ?? 'Default', hidden: !!d.hidden }];
  for (const [id, l] of Object.entries(L)) if (id !== DEFAULT_LAYER) out.push({ ...l, id, name: l.name ?? id, hidden: !!l.hidden });
  return out;
}

const itemMeta = (meta: DiagramMeta, kind: ItemKind, id: string): ItemMeta | undefined =>
  meta[KIND_TO_COLL[kind]]?.[id] as ItemMeta | undefined;

/** The layer an item is on by its own metadata; an unknown layer id counts as Default. */
export function layerOf(meta: DiagramMeta, kind: ItemKind, id: string): string {
  const l = itemMeta(meta, kind, id)?.layer;
  return typeof l === 'string' && meta.layers?.[l] ? l : DEFAULT_LAYER;
}

/** Every item of the diagram that can be on a layer. */
export function layerItems(model: DiagramModel): ItemRef[] {
  return withKind(model, (k, m) => k.items(m)) ?? [];
}

/**
 * Items hidden directly by their layer. `visible` (the viewer's `layers` property) overrides the stored hidden
 * flags: only the listed layer ids are shown.
 */
export function hiddenByLayers(model: DiagramModel, meta: DiagramMeta, visible?: readonly string[]): HiddenSets {
  const defs = layerDefs(meta);
  const hidden = new Set(defs.filter((l) => (visible ? !visible.includes(l.id) : l.hidden)).map((l) => l.id));
  if (!hidden.size || !model.type) return {};
  const sets: Partial<Record<ItemKind, Set<string>>> = {};
  const add = (kind: ItemKind, id: string): void => {
    (sets[kind] ??= new Set()).add(id);
  };
  for (const it of layerItems(model)) if (hidden.has(layerOf(meta, it.kind, it.id))) add(it.kind, it.id);
  withKind(model, (k, m) => k.hideWith?.(m, sets));
  return sets;
}

/**
 * The layer each item is effectively on — what hiding a layer hides. An item without a layer of its own takes the
 * layer of its nearest container (flowchart group, sequence box / block); a connector (edge, message, relationship)
 * without one takes the layer of its two ends when they share one. Used by the Layers panel's counts and highlights.
 */
export function effectiveLayers(model: DiagramModel, meta: DiagramMeta): (kind: ItemKind, id: string) => string {
  const out = new Map<string, string>();
  const key = (k: ItemKind, id: string): string => `${k}:${id}`;
  const parent = new Map<string, string>();
  for (const [c, p] of withKind(model, (k, m) => k.parents(m)) ?? []) parent.set(key(c.kind, c.id), key(p.kind, p.id));
  const own = (k: string): string | null => {
    const i = k.indexOf(':');
    const l = layerOf(meta, k.slice(0, i) as ItemKind, k.slice(i + 1));
    return l === DEFAULT_LAYER ? null : l;
  };
  // iterative walk up the container chain (bounded: containers nest, they do not cycle, but never trust input)
  const resolve = (k: string): string => {
    const chain: string[] = [];
    let cur: string | undefined = k, found: string | null = null;
    while (cur !== undefined && chain.length < 64) {
      const cached = out.get(cur);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      chain.push(cur);
      const o = own(cur);
      if (o) {
        found = o;
        break;
      }
      cur = parent.get(cur);
    }
    const l = found ?? DEFAULT_LAYER;
    for (const c of chain) out.set(c, l);
    return l;
  };
  for (const it of layerItems(model)) resolve(key(it.kind, it.id));
  // connectors on the Default layer follow their ends when both are on the same other layer
  for (const { ref, from, to } of withKind(model, (k, m) => k.connectors(m)) ?? []) {
    if (out.get(key(ref.kind, ref.id)) !== DEFAULT_LAYER) continue;
    const a = out.get(key(from.kind, from.id)), b = out.get(key(to.kind, to.id));
    if (a && a === b && a !== DEFAULT_LAYER) out.set(key(ref.kind, ref.id), a);
  }
  return (kind, id) => out.get(key(kind, id)) ?? DEFAULT_LAYER;
}
