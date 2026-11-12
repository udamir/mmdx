// Small helpers for the metadata ops: copy-on-write of the whole metadata, per-item access, empty-entry cleanup.
// The prototype mutated the one global `S.meta`; the ops clone first and mutate the clone, so every op is pure.
import { opsKind } from '../kinds/registry.js';
import { KIND_TO_COLL } from '../meta/types.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import { own, ownOr } from '../own.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { ItemKind, ItemRef } from '../types.js';

/** Deep copy (metadata is plain JSON by construction: splitSource / normalizeMeta). */
export const cloneMeta = (meta: DiagramMeta): DiagramMeta => JSON.parse(JSON.stringify(meta)) as DiagramMeta;
export const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const collOf = (kind: ItemKind): (typeof KIND_TO_COLL)[ItemKind] => KIND_TO_COLL[kind];

/** The item's metadata, or a fresh empty object (not attached). */
export const getM = (meta: DiagramMeta, kind: ItemKind, id: string): ItemMeta => own(meta[collOf(kind)], id) ?? {};

/** The item's metadata, created (and attached) when missing. */
export function ensure(meta: DiagramMeta, kind: ItemKind, id: string): ItemMeta {
  // own entries only: an item may be called `__proto__` or `toString` (own.ts)
  return ownOr((meta[collOf(kind)] ??= {}), id, (): ItemMeta => ({}));
}

/** Drops the item's entry when it became empty. */
export function tidy(meta: DiagramMeta, kind: ItemKind, id: string): void {
  const c = meta[collOf(kind)];
  const m = own(c, id);
  if (c && m && !Object.keys(m).length) delete c[id];
}

/** Rendered box (centre + size) of an item (prototype app `boxOfItem`). */
export function boxOfItem(geom: GeometryIndex | null | undefined, it: ItemRef): BoxGeom | null {
  return geom?.type ? opsKind(geom.type)?.box(geom, { kind: it.kind, id: it.id }) ?? null : null;
}

/** The rendered bounding box of items (null: none of them is drawn). */
export function selectionBox(geom: GeometryIndex | null | undefined, items: readonly ItemRef[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of items) {
    const b = boxOfItem(geom, it);
    if (!b) continue;
    x0 = Math.min(x0, b.x - b.w / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    y1 = Math.max(y1, b.y + b.h / 2);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/** A moved position snapped: 0 = exact (rounded); n = to the n-unit grid. */
export const snap = (v: number, grid: number): number => (!grid ? Math.round(v) : Math.round(v / grid) * grid);

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
