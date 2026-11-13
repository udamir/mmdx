// Order (z-index) slider and ⌘[ / ⌘] (row 39; prototype app `orderStep`, `orderInfo`, `orderRank`,
// `orderPreview`, `moveSelection`). Every position the selected item can reach in the code is counted when the slider
// opens, without parsing (X11, P2): a statement move only rearranges the code's lines, and the type's OrderSim tells
// from the base model what its `unit`, `blocks`, `relocate` and `orderRank` give after each move (the walk over the
// lines is order-walk.ts). A position's code and model are made when it is shown (one parse). A type without an
// OrderSim, or a step its OrderSim cannot tell, walks on as before, with a parse per step. The OrderSims and the walk
// over the lines are chunks of their own, loaded on demand (`loadOrderSim`, which the slider awaits before it counts);
// until a type's are here its walk parses each step too. The editor previews `applyOrderState(base, states[i])` live
// while the slider moves and records history once.
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { DiagramModel, SupportedModel } from '../model.js';
import type { OpsKind, OrderSim } from '../kind/ops-types.js';
import { opsKind, withOps } from '../kinds/registry.js';
import { reparse } from '../parse/dispatch.js';
import { own, ownOr } from '../own.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { ItemKind, ItemRef } from '../types.js';
import { cloneMeta } from './meta-util.js';
import { remapMeta } from './document.js';
import type { Walked, walkLines } from './order-walk.js';
import { moveStatement } from './reorder.js';
import type { DocResult, OrderState } from './types.js';

export type { OrderState } from './types.js';

export type OrderStepResult = { code: string; model: DiagramModel; sel: ItemRef; other?: string } | { reason: string } | null;

// Ids of these kinds survive a move; edges, messages, notes, blocks and boxes are positional.
const STABLE_IDS: ReadonlySet<ItemKind> = new Set(['node', 'group', 'entity', 'participant']);

/** One step of the code order: the new code / model / ref, a reason it cannot move, or null. */
export function orderStep(code: string, model: DiagramModel, sel: ItemRef, dir: -1 | 1): OrderStepResult {
  const r = withOps(model, (k, m) => k.orderStep?.(code, m, sel, dir)) ?? moveStatement(code, model, sel, dir);
  if (r.reason || r.code === code) return r.reason ? { reason: r.reason } : null;
  const M = reparse(r.code);
  const other = 'other' in r ? r.other : undefined;
  // Positional ids (and a kind's own, like mindmap nodes without a written id): find the moved item by its line.
  const line = 'line' in r ? r.line : undefined;
  const id = withOps(M, (k, m) => k.relocate?.(m, sel, line));
  if (id !== undefined) return { code: r.code, model: M, sel: { kind: sel.kind, id }, ...(other !== undefined ? { other } : {}) };
  if (STABLE_IDS.has(sel.kind)) return { code: r.code, model: M, sel, ...(other !== undefined ? { other } : {}) };
  return null;
}

/** Draw order among items of the same kind (nodes and tables by definition line, edges and relations by line). */
export function orderRank(M: DiagramModel, sel: ItemRef): number | null {
  return withOps(M, (k, m) => k.orderRank?.(m, sel)) ?? null;
}

export interface OrderPositions {
  /**
   * Every reachable position, first (back / earlier / left) to last; `states[index]` is the current one. A position's
   * `code` is made when it is read and its `model` parsed when it is read (once).
   */
  states: OrderState[];
  index: number;
  /** Slider end labels. */
  labels: [string, string];
}

/** At most this many steps each way. */
const MAX_STEPS = 400;

// the types' OrderSims with the walk over the lines, once loaded (null: the type has none), and the loads under way
const sims = new WeakMap<OpsKind, { of: { orderSim(code: string, model: SupportedModel): OrderSim | null }; walk: typeof walkLines } | null>();
const loads = new WeakMap<OpsKind, Promise<void>>();

/** Loads the OrderSim of the model's type (and the walk over the lines), which `orderPositions` walks by once it is here: null when it is (or the type has none, or its ops kind is not loaded), else the load to await (a failed one is tried again next time). */
export function loadOrderSim(model: DiagramModel): Promise<void> | null {
  const k = opsKind(model.type);
  if (!k || sims.has(k)) return null;
  if (!k.orderSim) {
    sims.set(k, null);
    return null;
  }
  let p = loads.get(k);
  if (!p) {
    p = Promise.all([k.orderSim(), import('./order-walk.js')]).then(([of, w]) => void sims.set(k, { of, walk: w.walkLines }), () => void loads.delete(k));
    loads.set(k, p);
  }
  return p;
}

/** One way of the walk from the base, by the OrderSim while it can tell (order-walk.ts), then with a parse per step. */
function walk(base: OrderState, by: { sim: OrderSim; walk: typeof walkLines } | null, dir: -1 | 1): Walked[] {
  const r = by?.walk(base, by.sim, dir, MAX_STEPS, STABLE_IDS);
  if (r?.done) return r.out;
  const out = r?.out ?? [];
  let cur = r?.cur ?? base;
  // ---- with a parse per step (from where the OrderSim could not tell)
  for (let i = out.length; i < MAX_STEPS; i++) {
    const nx = orderStep(cur.code, cur.model, cur.sel, dir);
    if (!nx || 'reason' in nx) break;
    const st: OrderState = { code: nx.code, model: nx.model, sel: nx.sel, others: nx.other !== undefined ? [...cur.others, nx.other] : cur.others };
    out.push({ st, rank: orderRank(st.model, st.sel) });
    cur = st;
  }
  return out;
}

/** Every position the item can reach (at most 400 steps each way); steps that change nothing visible are skipped. */
export function orderPositions(code: string, model: DiagramModel, sel: ItemRef): OrderPositions {
  const base: OrderState = { code, model, sel, others: [] };
  const by = withOps(model, (k, m) => {
    const got = sims.get(k), sim = got?.of.orderSim(code, m);
    return got && sim ? { sim, walk: got.walk } : null;
  }) ?? null;
  // Steps past statements of another kind (an edge line for a node…) change nothing on the canvas: keep one per rank.
  const distinct = (list: Walked[]): OrderState[] => {
    let last = orderRank(base.model, sel);
    return list.filter(({ rank: r }) => {
      if (r == null || r !== last) {
        last = r;
        return true;
      }
      return false;
    }).map((w) => w.st);
  };
  const before = distinct(walk(base, by, -1)).reverse(), after = distinct(walk(base, by, 1));
  const labels: [string, string] = withOps(model, (k) => k.orderLabels?.(sel)) ?? ['back', 'front'];
  return { states: [...before, base, ...after], index: before.length, labels };
}

/** Hand-placed participants trade places too (mutates `meta`). */
export function swapParticipantX(meta: DiagramMeta, a: string, b: string, geom: ReadonlyMap<string, Pick<BoxGeom, 'x'>> | null | undefined): void {
  const P = (meta.participants ??= {});
  if (own(P, a)?.x == null && own(P, b)?.x == null) return;
  const xa = own(P, a)?.x ?? geom?.get(a)?.x, xb = own(P, b)?.x ?? geom?.get(b)?.x;
  if (xa == null || xb == null) return;
  ownOr(P, a, (): ItemMeta => ({})).x = Math.round(xb);
  ownOr(P, b, (): ItemMeta => ({})).x = Math.round(xa);
}

export interface OrderBase {
  code: string;
  model: DiagramModel;
  meta: DiagramMeta;
  /** Participant boxes of the base render (sequence), for hand-placed x swaps. */
  participants?: ReadonlyMap<string, Pick<BoxGeom, 'x'>> | null;
}

/** The document at one reachable position (live preview and commit of the order slider). */
export function applyOrderState(base: OrderBase, st: OrderState): DocResult {
  let meta = cloneMeta(base.meta);
  meta = remapMeta(base.model, base.code, st.model, st.code, meta);
  if (st.sel.kind === 'participant' && base.participants) for (const other of st.others) swapParticipantX(meta, st.sel.id, other, base.participants);
  return { code: st.code, meta, selection: [st.sel] };
}

/** ⌘[ / ⌘]: one step back / forward, with the metadata following (refused with a reason at the ends). */
export function moveOrder(code: string, meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, sel: ItemRef, dir: -1 | 1): DocResult {
  const r = orderStep(code, model, sel, dir);
  if (!r || 'reason' in r) return { code, meta, reason: r?.reason ?? 'Cannot move further' };
  const participants = geom?.type ? opsKind(geom.type)?.swapBoxes?.(geom) ?? null : null;
  return applyOrderState({ code, model, meta, participants }, { code: r.code, model: r.model, sel: r.sel, others: r.other !== undefined ? [r.other] : [] });
}
