// Layers (A.7 row 67): user-defined, stored as metadata.
//   %%@ layer L1 {"name":"Infrastructure","hidden":true}   definitions (order = list order)
//   %%@ node metrics {…,"layer":"L1"}                      membership; no "layer" = Default
// Hiding a layer hides its items and everything attached to them (connectors, messages, group contents): the
// renderers cascade from the direct ids computed here.
import type { DiagramMeta, ItemMeta, LayerMeta } from './meta/types.js';
import { KIND_TO_COLL } from './meta/types.js';
import type { DiagramModel } from './model.js';
import type { HiddenSets } from './render/types.js';
import type { ItemKind, ItemRef } from './types.js';

export const DEFAULT_LAYER = 'default';

/** Kinds that can sit on a layer (processes / activations cannot). */
export type LayerKind = Exclude<ItemKind, 'activation'>;

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
  const out: ItemRef[] = [];
  if (model.type === 'flowchart') {
    for (const id of model.nodes.keys()) out.push({ kind: 'node', id });
    for (const id of model.groups.keys()) out.push({ kind: 'group', id });
    for (const e of model.edges) out.push({ kind: 'edge', id: e.id });
  } else if (model.type === 'sequence') {
    for (const p of model.participants) out.push({ kind: 'participant', id: p.id });
    for (const it of model.items) {
      if (it.kind === 'message') out.push({ kind: 'message', id: it.id });
      else if (it.kind === 'note') out.push({ kind: 'note', id: it.id });
      else if (it.kind === 'blockStart') out.push({ kind: 'block', id: it.id });
    }
    for (const b of model.boxes) out.push({ kind: 'box', id: b.id });
  } else if (model.type === 'er') {
    for (const id of model.entities.keys()) out.push({ kind: 'entity', id });
    for (const r of model.rels) out.push({ kind: 'rel', id: r.id });
  }
  return out;
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
  // a hidden box hides its participants (and through them their messages and notes)
  if (model.type === 'sequence')
    for (const b of model.boxes) if (sets.box?.has(b.id)) for (const p of b.members) add('participant', p);
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
  if (model.type === 'flowchart') {
    for (const n of model.nodes.values()) if (n.parent) parent.set(key('node', n.id), key('group', n.parent));
    for (const g of model.groups.values()) if (g.parent) parent.set(key('group', g.id), key('group', g.parent));
  } else if (model.type === 'sequence') {
    for (const b of model.boxes) for (const p of b.members) parent.set(key('participant', p), key('box', b.id));
    const stack: string[] = [];
    for (const it of model.items) {
      const top = stack[stack.length - 1];
      if (it.kind === 'blockStart') {
        if (top) parent.set(key('block', it.id), key('block', top));
        stack.push(it.id);
      } else if (it.kind === 'blockEnd') stack.pop();
      else if ((it.kind === 'message' || it.kind === 'note') && top) parent.set(key(it.kind, it.id), key('block', top));
    }
  }
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
  const ends: [ItemKind, { id: string; from: string; to: string }, ItemKind][] =
    model.type === 'flowchart' ? model.edges.map((e) => ['edge', e, 'node'])
    : model.type === 'er' ? model.rels.map((r) => ['rel', r, 'entity'])
    : model.type === 'sequence' ? model.items.flatMap((i) => (i.kind === 'message' ? [['message', i, 'participant'] as [ItemKind, typeof i, ItemKind]] : []))
    : [];
  for (const [kind, c, endKind] of ends) {
    if (out.get(key(kind, c.id)) !== DEFAULT_LAYER) continue;
    const a = out.get(key(endKind, c.from)), b = out.get(key(endKind, c.to));
    if (a && a === b && a !== DEFAULT_LAYER) out.set(key(kind, c.id), a);
  }
  return (kind, id) => out.get(key(kind, id)) ?? DEFAULT_LAYER;
}
