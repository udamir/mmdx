// Small helpers for the metadata ops: copy-on-write of the whole metadata, per-item access, empty-entry cleanup.
// The prototype mutated the one global `S.meta`; the ops clone first and mutate the clone, so every op is pure.
import { KIND_TO_COLL } from '../meta/types.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { ItemKind, ItemRef } from '../types.js';

/** Deep copy (metadata is plain JSON by construction: splitSource / normalizeMeta). */
export const cloneMeta = (meta: DiagramMeta): DiagramMeta => JSON.parse(JSON.stringify(meta)) as DiagramMeta;
export const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const collOf = (kind: ItemKind): (typeof KIND_TO_COLL)[ItemKind] => KIND_TO_COLL[kind];

/** The item's metadata, or a fresh empty object (not attached). */
export const getM = (meta: DiagramMeta, kind: ItemKind, id: string): ItemMeta => meta[collOf(kind)]?.[id] ?? {};

/** The item's metadata, created (and attached) when missing. */
export function ensure(meta: DiagramMeta, kind: ItemKind, id: string): ItemMeta {
  const c = (meta[collOf(kind)] ??= {});
  return (c[id] ??= {});
}

/** Drops the item's entry when it became empty. */
export function tidy(meta: DiagramMeta, kind: ItemKind, id: string): void {
  const c = meta[collOf(kind)];
  if (c && c[id] && !Object.keys(c[id]).length) delete c[id];
}

/** Rendered box (centre + size) of an item (prototype app `boxOfItem`). */
export function boxOfItem(geom: GeometryIndex | null | undefined, it: ItemRef): BoxGeom | null {
  if (!geom) return null;
  switch (geom.type) {
    case 'flowchart':
      return (it.kind === 'node' ? geom.nodes.get(it.id) : it.kind === 'group' ? geom.groups.get(it.id) : undefined) ?? null;
    case 'er':
      return (it.kind === 'entity' ? geom.entities.get(it.id) : undefined) ?? null;
    case 'sequence':
      return (
        (it.kind === 'participant' ? geom.participants.get(it.id)
          : it.kind === 'box' ? geom.boxes.get(it.id)
            : it.kind === 'block' ? geom.blocks.get(it.id)
              : it.kind === 'note' ? geom.notes.get(it.id)
                : undefined) ?? null
      );
    default:
      return null;
  }
}

export const selKey = (r: ItemRef): string => `${r.kind}:${r.id}`;

/** Unique refs in order (prototype app `selection`). */
export function uniqueRefs(refs: readonly ItemRef[]): ItemRef[] {
  const seen = new Set<string>(), out: ItemRef[] = [];
  for (const r of refs) {
    const k = selKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
