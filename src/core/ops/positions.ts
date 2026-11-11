// Where items are (R9, task 5.7): Auto layout's reset, pinning auto-placed items, "Reset positions in this group",
// moving one item or several (snapped), and aligning or distributing them. Pure: (model, meta, geom, …) → { meta }.
import { maxOf, minOf } from '../geom.js';
import { PLACE_KEYS } from '../meta/keys.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import { COLLECTIONS } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { withOps } from '../kinds/registry.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import { type ItemKind, type ItemRef } from '../types.js';
import { boxOfItem, cloneMeta, ensure, getM, tidy } from './meta-util.js';
import type { MetaResult } from './types.js';


// ---- auto layout (row 12) -----------------------------------------------------------------------------------------

/**
 * "Auto layout": forgets manual positions and sizes (x / y / w / h, sequence `dy`, bend `points`, a custom page
 * size and position) and keeps every style. The editor then fits the view ("Manual positions removed (styles kept)").
 */
export function resetLayout(meta: DiagramMeta): MetaResult {
  const out = cloneMeta(meta);
  // every collection's manual places (meta/keys.ts PLACE_KEYS: positions, sizes, nudges, a mindmap branch's side, bend points)
  for (const coll of COLLECTIONS) {
    if (coll === 'layers') continue;
    const c = out[coll] as Record<string, Record<string, unknown>> | undefined;
    if (!c) continue;
    for (const [id, m] of Object.entries(c)) {
      for (const k of PLACE_KEYS) delete m[k];
      if (!Object.keys(m).length) delete c[id];
    }
  }
  for (const k of ['w', 'h', 'x', 'y'] as const) delete out.canvas[k];
  return { meta: out };
}

// ---- positions ----------------------------------------------------------------------------------------------------

/**
 * Auto-placed flowchart nodes are laid out below hand-placed ones: before the first manual placement, pin them where
 * they are (from the last render's geometry) so nothing else jumps. Mutates and returns `meta` (callers pass a clone).
 */
function pinAutoInPlace(meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined): DiagramMeta {
  return withOps(model, (k, m) => k.pinAuto?.(meta, m, geom)) ?? meta;
}

/** Pins every auto-placed flowchart node at its rendered position. */
export function pinAutoNodes(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined): MetaResult {
  return { meta: pinAutoInPlace(cloneMeta(meta), model, geom) };
}

/**
 * "Reset positions in this group" (T07): forgets the hand-placed positions inside one group (descendants, nested
 * frames, bend points of the connectors inside) and keeps the group where it is, so auto layout arranges its contents
 * again. Null when the type has no such action or the item is not a group.
 */
export function resetGroupPositions(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, ref: ItemRef): MetaResult | null {
  if (ref.kind !== 'group') return null;
  const out = withOps(model, (k, m) => k.resetScope?.(cloneMeta(meta), m, geom, ref.id));
  return out ? { meta: out } : null;
}

/** Whether a group has hand-placed positions inside it (what "Reset positions in this group" would forget). */
export function groupHasPositions(model: DiagramModel, meta: DiagramMeta, ref: ItemRef): boolean {
  if (ref.kind !== 'group') return false;
  const inside = withOps(model, (k, m) => (k.resetScope ? k.descendants?.(m, ref.id) : undefined));
  if (!inside) return false;
  const has = (m: ItemMeta | undefined): boolean => !!m && (m.x != null || m.y != null);
  const leaf = inside.leaf ?? 'node';
  return inside.nodes.some((id) => has(getM(meta, leaf, id))) || inside.groups.some((id) => has(meta.groups?.[id]));
}


/** Snapping of moved positions: 0 = exact (rounded); n = to the n-unit grid. */
const snapV = (v: number, snap: number): number => (!snap ? Math.round(v) : Math.round(v / snap) * snap);

interface MoveTarget {
  kind: ItemKind;
  id: string;
  x: number;
  y: number;
}

function shiftAll(meta: DiagramMeta, items: readonly MoveTarget[], ddx: number, ddy: number): void {
  for (const it of items) {
    const m = ensure(meta, it.kind, it.id);
    m.x = Math.round(it.x + ddx);
    m.y = Math.round(it.y + ddy);
  }
}

/** In-place move of one item (prototype app `moveDrag(...).apply`). */
function moveInPlace(meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, { kind, id }: ItemRef, dx: number, dy: number, part: 'label' | undefined, snap: number): void {
  if (kind === 'activation') return; // resized by its top / bottom handles
  if (getM(meta, kind, id).locked && part !== 'label') return;
  if (part === 'label') {
    const m = ensure(meta, kind, id);
    m.labelDx = Math.round((typeof m.labelDx === 'number' ? m.labelDx : 0) + dx);
    m.labelDy = Math.round((typeof m.labelDy === 'number' ? m.labelDy : 0) + dy);
    return;
  }
  const moveSet = (items: MoveTarget[]): void => {
    const f = items[0];
    if (!f) return;
    shiftAll(meta, items, snapV(f.x + dx, snap) - f.x, snapV(f.y + dy, snap) - f.y);
  };
  if (kind === 'node' || kind === 'entity') {
    const b = boxOfItem(geom, { kind, id });
    if (b) moveSet([{ kind, id, x: b.x, y: b.y }]);
  } else if (kind === 'group') {
    const self = boxOfItem(geom, { kind, id });
    const inside = withOps(model, (k, m) => k.descendants?.(m, id));
    if (!self || !inside) return;
    const { nodes, groups } = inside;
    const leaf = inside.leaf ?? 'node';
    const items: MoveTarget[] = [];
    const gm = getM(meta, 'group', id);
    if (gm.w) items.push({ kind: 'group', id, x: Number(gm.x), y: Number(gm.y) });
    for (const n of nodes) {
      const b = boxOfItem(geom, { kind: leaf, id: n });
      if (b) items.push({ kind: leaf, id: n, x: b.x, y: b.y });
    }
    for (const sg of groups) {
      const m = getM(meta, 'group', sg);
      if (m.w) items.push({ kind: 'group', id: sg, x: Number(m.x), y: Number(m.y) });
    }
    if (!items.length) return;
    // snap relative to the group's top-left
    const tl = { x: self.x - self.w / 2, y: self.y - self.h / 2 };
    shiftAll(meta, items, snapV(tl.x + dx, snap) - tl.x, snapV(tl.y + dy, snap) - tl.y);
  } else if (kind === 'participant') {
    const b = boxOfItem(geom, { kind, id });
    if (b) ensure(meta, 'participant', id).x = snapV(b.x + dx, snap);
  } else if (kind === 'message' || kind === 'note' || kind === 'block') {
    const m = ensure(meta, kind, id);
    m.dy = Math.max(-40, Math.round((typeof m.dy === 'number' ? m.dy : 0) + dy));
    if (!m.dy) delete m.dy;
    tidy(meta, kind, id);
  }
}

export interface MoveOpts {
  /** Move a connector's label (edge / rel) instead of the item. */
  part?: 'label';
  /** Grid to snap to (0 = exact). */
  snap?: number;
}

/**
 * Moves one item by (dx, dy) as dragging does: groups carry their contents, participants move sideways only,
 * messages / notes / blocks vertically (`dy`, floor −40), locked items stay. Auto-placed nodes are pinned first.
 */
export function moveItem(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, ref: ItemRef, dx: number, dy: number, { part, snap = 0 }: MoveOpts = {}): MetaResult {
  const out = cloneMeta(meta);
  if ((ref.kind === 'node' || ref.kind === 'group' || ref.kind === 'entity') && part !== 'label') pinAutoInPlace(out, model, geom);
  moveInPlace(out, model, geom, ref, dx, dy, part, snap);
  return { meta: out };
}

/** Moves a multi-selection by the same delta (prototype `multiMoveDrag`): nodes, tables, groups with contents, and the sequence items. */
export function moveItems(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, refs: readonly ItemRef[], dx: number, dy: number, snap = 0): MetaResult {
  const out = pinAutoInPlace(cloneMeta(meta), model, geom);
  const items = new Map<string, MoveTarget>();
  const add = (kind: ItemKind, id: string, x: unknown, y: unknown): void => {
    if (x != null) items.set(`${kind}:${id}`, { kind, id, x: Number(x), y: Number(y) });
  };
  for (const it of refs) {
    if (getM(out, it.kind, it.id).locked) continue;
    if (it.kind === 'node' || it.kind === 'entity') {
      const b = boxOfItem(geom, it);
      if (b) add(it.kind, it.id, b.x, b.y);
    } else if (it.kind === 'group') {
      const inside = withOps(model, (k, m) => k.descendants?.(m, it.id));
      if (!inside) continue;
      const { nodes, groups } = inside;
      const leaf = inside.leaf ?? 'node';
      const gm = getM(out, 'group', it.id);
      if (gm.w) add('group', it.id, gm.x, gm.y);
      for (const n of nodes) {
        const b = boxOfItem(geom, { kind: leaf, id: n });
        if (b) add(leaf, n, b.x, b.y);
      }
      for (const sg of groups) {
        const m = getM(out, 'group', sg);
        if (m.w) add('group', sg, m.x, m.y);
      }
    }
  }
  const list = [...items.values()];
  const f = list[0];
  if (f) shiftAll(out, list, snapV(f.x + dx, snap) - f.x, snapV(f.y + dy, snap) - f.y);
  // sequence items move as dragging one does: participants sideways, messages / notes / blocks up or down
  for (const it of refs)
    if ((it.kind === 'participant' || it.kind === 'message' || it.kind === 'note' || it.kind === 'block') && !getM(out, it.kind, it.id).locked)
      moveInPlace(out, model, geom, it, dx, dy, undefined, snap);
  return { meta: out };
}

export type AlignOp = 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter' | 'hdist' | 'vdist';

function insideGroup(model: DiagramModel, it: ItemRef, gid: string): boolean {
  if (it.kind === 'group' && it.id === gid) return true;
  const d = withOps(model, (k, m) => k.descendants?.(m, gid));
  return !!d && (it.kind === (d.leaf ?? 'node') ? d.nodes.includes(it.id) : it.kind === 'group' ? d.groups.includes(it.id) : false);
}

/**
 * Align / distribute a multi-selection (row 37, Miro-like). Groups carry their contents; locked items stay put.
 * Returns the unchanged metadata when fewer than 2 items (3 for distribute) can move.
 */
export function alignItems(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, refs: readonly ItemRef[], op: AlignOp): MetaResult {
  const out = pinAutoInPlace(cloneMeta(meta), model, geom);
  const groups = refs.filter((it) => it.kind === 'group').map((it) => it.id);
  // an item inside a selected group moves with that group
  const items = refs
    .filter((it) => !groups.some((g) => g !== it.id && insideGroup(model, it, g)))
    .map((it) => ({ it, b: boxOfItem(geom, it) }))
    .filter((x): x is { it: ItemRef; b: BoxGeom } => !!x.b && !getM(out, x.it.kind, x.it.id).locked);
  if (items.length < 2) return { meta };
  const L = (b: BoxGeom): number => b.x - b.w / 2, R = (b: BoxGeom): number => b.x + b.w / 2;
  const T = (b: BoxGeom): number => b.y - b.h / 2, B = (b: BoxGeom): number => b.y + b.h / 2;
  const minL = minOf(items.map((x) => L(x.b))), maxR = maxOf(items.map((x) => R(x.b)));
  const minT = minOf(items.map((x) => T(x.b))), maxB = maxOf(items.map((x) => B(x.b)));
  const shift = new Map<(typeof items)[number], [number, number]>();
  const put = (x: (typeof items)[number], dx: number, dy: number): void => void shift.set(x, [dx, dy]);
  if (op === 'left') items.forEach((x) => put(x, minL - L(x.b), 0));
  if (op === 'right') items.forEach((x) => put(x, maxR - R(x.b), 0));
  if (op === 'hcenter') items.forEach((x) => put(x, (minL + maxR) / 2 - x.b.x, 0));
  if (op === 'top') items.forEach((x) => put(x, 0, minT - T(x.b)));
  if (op === 'bottom') items.forEach((x) => put(x, 0, maxB - B(x.b)));
  if (op === 'vcenter') items.forEach((x) => put(x, 0, (minT + maxB) / 2 - x.b.y));
  if (op === 'hdist' || op === 'vdist') {
    if (items.length < 3) return { meta };
    const h = op === 'hdist';
    const size = (b: BoxGeom): number => (h ? b.w : b.h), lo = (b: BoxGeom): number => (h ? L(b) : T(b));
    const sorted = items.slice().sort((a, b) => (h ? a.b.x - b.b.x : a.b.y - b.b.y));
    const span = (h ? maxR - minL : maxB - minT) - sorted.reduce((s, x) => s + size(x.b), 0);
    const gap = span / (sorted.length - 1);
    let at = h ? minL : minT;
    for (const x of sorted) {
      const d = at - lo(x.b);
      put(x, h ? d : 0, h ? 0 : d);
      at += size(x.b) + gap;
    }
  }
  for (const [x, [dx, dy]] of shift) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    if (x.it.kind === 'participant' && !dx) continue;
    moveInPlace(out, model, geom, x.it, dx, dy, undefined, 0); // exact, no snapping
  }
  return { meta: out };
}

