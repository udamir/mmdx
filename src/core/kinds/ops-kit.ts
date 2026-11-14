// The ops-kind kit (X3, task 4.5): what the graph kinds' ops (flowchart, state, ER, mindmap) wrote out each — the
// lookups over their collections (find, exists, search, the ids in use and taken, the drawn items, a box, a line)
// from one declaration per collection; an item's line span and code rank; pinning auto-placed items before a manual
// placement; "Reset positions in this group" (counting hand-placed groups outside it too, B22); and the presets cast.
import { KIND_TO_COLL, type DiagramMeta, type MetaIds } from '../meta/types.js';
import type { DrawnItem, Presets } from '../kind/types.js';
import type { OpsKind } from '../kind/ops-types.js';
import { ensure, getM, tidy } from '../ops/meta-util.js';
import type { LineSpan } from '../ops/types.js';
import type { SupportedModel } from '../model.js';
import type { BoxGeom, EdgeGeom, GeometryIndex } from '../render/types.js';
import type { ItemKind } from '../types.js';

/** One collection of a kind's items: its ids in the model and, where they are drawn, its boxes or its lines. */
export interface CollectionDecl<M, G> {
  kind: ItemKind & keyof typeof KIND_TO_COLL;
  ids(m: M): Iterable<string>;
  /** A fast membership test (a Map's `has`); default: a scan of `ids`. */
  has?(m: M, id: string): boolean;
  /** Each item's search texts (the code filter), in model order. */
  texts(m: M): Iterable<readonly [string, readonly (string | undefined)[]]>;
  /** Its ids name boxes a new item may not reuse (nodes, groups, entities): `takenIds`. */
  taken?: boolean;
  /** Its drawn boxes (by id), or its drawn lines. */
  boxes?(g: G): ReadonlyMap<string, BoxGeom & { hidden?: boolean }>;
  lines?(g: G): ReadonlyMap<string, EdgeGeom>;
}

type Lookups = 'find' | 'exists' | 'search' | 'takenIds' | 'usedIds' | 'drawn' | 'box' | 'edge';

/**
 * The lookups of a kind from its collections, in declaration order (the first collection that has an id answers
 * `find`); the drawn items list the boxes, then the lines.
 */
export function collectionOps<M extends SupportedModel, G extends GeometryIndex>(decls: readonly CollectionDecl<M, G>[]): Pick<OpsKind<M, G>, Lookups> {
  const has = (d: CollectionDecl<M, G>, m: M, id: string): boolean => (d.has ? d.has(m, id) : [...d.ids(m)].includes(id));
  return {
    find(m, id) {
      for (const d of decls) if (has(d, m, id)) return { kind: d.kind, id };
      return null;
    },
    exists(m, { kind, id }) {
      const d = decls.find((x) => x.kind === kind);
      return !!d && has(d, m, id);
    },
    search: (m) => decls.flatMap((d) => [...d.texts(m)].map(([id, texts]) => ({ ref: { kind: d.kind, id }, texts: [...texts] }))),
    takenIds: (m) => decls.flatMap((d) => (d.taken ? [...d.ids(m)] : [])),
    usedIds(m) {
      const out: MetaIds = {};
      for (const d of decls) out[KIND_TO_COLL[d.kind]] = new Set(d.ids(m));
      return out;
    },
    drawn(g) {
      const out: DrawnItem[] = [];
      for (const d of decls) for (const [id, box] of d.boxes?.(g) ?? []) out.push({ ref: { kind: d.kind, id }, box });
      for (const d of decls) for (const [id, e] of d.lines?.(g) ?? []) out.push({ ref: { kind: d.kind, id }, d: e.d, label: e.label });
      return out;
    },
    box: (g, it) => decls.find((d) => d.kind === it.kind && d.boxes)?.boxes!(g).get(it.id) ?? null,
    edge: (g, it) => decls.find((d) => d.kind === it.kind && d.lines)?.lines!(g).get(it.id),
  };
}

/** A one-line span, or null. */
export const lineSpan = (li: number | null | undefined): LineSpan | null => (li == null ? null : { start: li, end: li });

/** An item's rank among its siblings in code order (`key`: its line; none: last). */
export const rankByLine = (arr: readonly { id: string; key: number | null | undefined }[], id: string): number =>
  arr.slice().sort((a, b) => (a.key ?? 1e9) - (b.key ?? 1e9)).findIndex((x) => x.id === id);

/** A kind's presets as the ops read them (each kind's own typed table). */
export const asPresets = (p: object): Partial<Record<ItemKind, Presets>> => p as Partial<Record<ItemKind, Presets>>;

/**
 * Auto-placed items are laid out below hand-placed ones: before the first manual placement they are pinned where
 * they are drawn. A group's top-left without a size (left by "Reset positions in this group") then goes: its place
 * is its contents' place now.
 */
export function pinAutoPlaced(meta: DiagramMeta, boxes: ReadonlyMap<string, { x: number; y: number; auto?: boolean }>, leaf: ItemKind): DiagramMeta {
  let pinned = false;
  for (const [id, b] of boxes)
    if (b.auto && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      const m = ensure(meta, leaf, id);
      if (m.x == null || m.y == null) {
        m.x = Math.round(b.x);
        m.y = Math.round(b.y);
        pinned = true;
      }
    }
  if (pinned)
    for (const [id, m] of Object.entries(meta.groups ?? {}))
      if (m.w == null && m.h == null && (m.x != null || m.y != null)) {
        delete m.x;
        delete m.y;
        tidy(meta, 'group', id);
      }
  return meta;
}

export interface ScopeReset {
  /** The kind of the items a group holds (`node`, `entity`). */
  leaf: ItemKind;
  /** What is inside the group, at any depth. */
  inside: { readonly nodes: readonly string[]; readonly groups: readonly string[] };
  /** Clears the waypoints of the lines whose two ends are inside (each kind finds a line's metadata its own way). */
  clearLines(within: (id: string) => boolean): void;
  /** The group's drawn box (its top-left is kept when something outside it is placed by hand). */
  box?: { x: number; y: number; w: number; h: number } | undefined;
}

/**
 * "Reset positions in this group" (T07): the hand-placed positions and sizes inside the group are forgotten, and its
 * lines' waypoints. A fixed frame (x, y, w and h) stays as it is; otherwise the group keeps its top-left, without a
 * size, when something outside it is placed by hand — an item or another group (B22) — which the layout keeps while
 * it lays the contents out.
 */
export function resetGroupScope(meta: DiagramMeta, gid: string, o: ScopeReset): DiagramMeta {
  for (const id of o.inside.nodes) {
    const m = getM(meta, o.leaf, id);
    delete m.x;
    delete m.y;
    tidy(meta, o.leaf, id);
  }
  for (const id of o.inside.groups) {
    const m = getM(meta, 'group', id);
    delete m.x;
    delete m.y;
    delete m.w;
    delete m.h;
    tidy(meta, 'group', id);
  }
  const within = new Set([gid, ...o.inside.nodes, ...o.inside.groups]);
  o.clearLines((id) => within.has(id));
  const gm = getM(meta, 'group', gid);
  if (gm.x != null && gm.y != null && gm.w != null && gm.h != null) return meta;
  delete gm.x;
  delete gm.y;
  delete gm.w;
  delete gm.h;
  const leafColl = KIND_TO_COLL[o.leaf as keyof typeof KIND_TO_COLL];
  const placedOutside = (coll: 'groups' | typeof leafColl): boolean =>
    Object.entries(meta[coll] ?? {}).some(([id, m]) => !within.has(id) && typeof m.x === 'number' && typeof m.y === 'number');
  if (o.box && (placedOutside(leafColl) || placedOutside('groups'))) {
    const m = ensure(meta, 'group', gid);
    m.x = Math.round(o.box.x - o.box.w / 2);
    m.y = Math.round(o.box.y - o.box.h / 2);
  }
  tidy(meta, 'group', gid);
  return meta;
}
