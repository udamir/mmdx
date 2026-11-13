// Order (z-index) slider and ⌘[ / ⌘] (row 39; prototype app `orderStep`, `orderInfo`, `orderRank`,
// `orderPreview`, `moveSelection`). Every position the selected item can reach in the code is counted when the slider
// opens, without parsing (X11, P2): a statement move only rearranges the code's lines, and the type's OrderSim tells
// from the base model what its `unit`, `blocks`, `relocate` and `orderRank` give after each move. A position's code
// and model are made when it is shown (one parse). A type without an OrderSim, or a step its OrderSim cannot tell,
// walks on as before, with a parse per step. The editor previews `applyOrderState(base, states[i])` live while the
// slider moves and records history once.
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import type { LineOrder, OrderSim } from '../kind/ops-types.js';
import { isHeaderLine } from '../kinds/info.js';
import { opsKind, withOps } from '../kinds/registry.js';
import { reparse } from '../parse/dispatch.js';
import { own, ownOr } from '../own.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { ItemKind, ItemRef } from '../types.js';
import { cloneMeta } from './meta-util.js';
import { remapMeta } from './document.js';
import { moveStatement } from './reorder.js';
import type { DocResult, LineSpan } from './types.js';

/** One reachable position: the code there, its model and the item's (possibly positional) new ref. */
export interface OrderState {
  code: string;
  model: DiagramModel;
  sel: ItemRef;
  /** Participants: every neighbour swapped with on the way from the base (their x positions trade too). */
  others: string[];
}

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

/** The code's lines after some order steps: `perm[line]` is the base line there, `inv[base line]` where it is now. */
class Lines implements LineOrder {
  readonly perm: number[];
  readonly inv: number[];
  constructor(readonly text: readonly string[]) {
    this.perm = text.map((_, i) => i);
    this.inv = this.perm.slice();
  }
  readonly at = (orig: number): number => this.inv[orig] ?? orig;
  readonly orig = (line: number): number => this.perm[line] ?? line;
  textAt(line: number): string {
    return this.text[this.perm[line] ?? -1] ?? '';
  }
  code(): string {
    return this.perm.map((i) => this.text[i]).join('\n');
  }
  apply(m: LineMove): void {
    m.slice.forEach((o, k) => {
      this.perm[m.lo + k] = o;
      this.inv[o] = m.lo + k;
    });
  }
}

/** A statement move as a rearrangement: the lines from `lo` become the base lines `slice`; `line` is the item's first line after it. */
interface LineMove {
  lo: number;
  slice: number[];
  line: number;
}

const skip = (t: string): boolean => !t || t.startsWith('%%');
const isBoundary = (t: string): boolean => /^(else|and|option)\b/.test(t) || t === 'end' || t === '}';

/** `moveStatement` (reorder.ts) over the lines: the same checks and the same splice, given the item's unit and the blocks. */
function moveLines(L: Lines, u: LineSpan, blocks: readonly LineSpan[], dir: -1 | 1): LineMove | { reason: string } {
  const n = L.perm.length;
  const byEnd = new Map(blocks.map((b) => [b.end, b]));
  const byStart = new Map(blocks.map((b) => [b.start, b]));
  let i = dir < 0 ? u.start - 1 : u.end + 1;
  while (i >= 0 && i < n && skip(L.textAt(i).trim())) i += dir;
  if (i < 0 || i >= n) return { reason: dir < 0 ? 'Already first' : 'Already last' };
  const t = L.textAt(i).trim();
  let nb: LineSpan;
  if (dir < 0) {
    if (isHeaderLine(t)) return { reason: 'Already first' };
    if (byStart.has(i) || /^(else|and|option)\b/.test(t)) return { reason: 'Already first in its group' };
    nb = byEnd.get(i) ?? { start: i, end: i };
  } else {
    if (isBoundary(t) && !byStart.has(i)) return { reason: 'Already last in its group' };
    nb = byStart.get(i) ?? { start: i, end: i };
  }
  const P = L.perm;
  const unit = P.slice(u.start, u.end + 1), other = P.slice(nb.start, nb.end + 1);
  if (dir < 0) return { lo: nb.start, slice: [...unit, ...P.slice(nb.end + 1, u.start), ...other], line: nb.start };
  const between = P.slice(u.end + 1, nb.start);
  return { lo: u.start, slice: [...other, ...between, ...unit], line: u.start + other.length + between.length };
}

/** A position reached by order steps that is made only when read. */
class LazyState implements OrderState {
  private c: string | undefined;
  private m: DiagramModel | undefined;
  constructor(private readonly make: () => string, readonly sel: ItemRef, readonly others: string[]) {}
  get code(): string {
    return (this.c ??= this.make());
  }
  get model(): DiagramModel {
    return (this.m ??= reparse(this.code));
  }
}

interface Walked {
  st: OrderState;
  rank: number | null;
}

/** One way of the walk from the base, by the OrderSim while it can tell, then with a parse per step. */
function walk(base: OrderState, sim: OrderSim | null, dir: -1 | 1): Walked[] {
  const out: Walked[] = [];
  const L = sim ? new Lines(base.code.split('\n')) : null;
  const check = withOps(base.model, (k) => (k.checkMove ? (c: string): string | null => k.checkMove!(c) : undefined));
  const moves: LineMove[] = [];
  let cur = base, i = 0;
  // ---- without a parse
  for (; sim && L && i < MAX_STEPS; i++) {
    const u = sim.unit(L, cur.sel), blocks = sim.blocks(L);
    if (u === undefined || blocks === undefined || sharesEnds(blocks)) break;
    if (u === null) return out; // moveStatement: no line of its own to move (a reason)
    const mv = moveLines(L, u, blocks, dir);
    if ('reason' in mv) return out;
    // the same code (a line written twice traded with its twin): no step
    if (mv.slice.every((o, k) => L.text[o] === L.textAt(mv.lo + k))) return out;
    const before = mv.slice.map((_, k) => L.orig(mv.lo + k));
    L.apply(mv);
    if (sim.fragile?.some((run) => run.some((o, k) => k > 0 && L.at(o) !== L.at(run[k - 1]!) + 1)) || sim.keep?.some(([a, b]) => L.at(a) > L.at(b))) {
      L.apply({ lo: mv.lo, slice: before, line: mv.line });
      break;
    }
    if (check?.(L.code())) return out; // the type's checkMove refuses the code
    const id = sim.relocate(L, cur.sel, mv.line);
    const sel: ItemRef | null | undefined = id === undefined ? undefined : id !== null ? { kind: cur.sel.kind, id } : STABLE_IDS.has(cur.sel.kind) ? cur.sel : null;
    if (sel === null) return out;
    const rank = sel && sim.rank(L, sel);
    if (sel === undefined || rank === undefined) {
      L.apply({ lo: mv.lo, slice: before, line: mv.line });
      break;
    }
    moves.push(mv);
    const upTo = moves.slice();
    const lines = L.text;
    const make = (): string => {
      const R = new Lines(lines);
      for (const m of upTo) R.apply(m);
      return R.code();
    };
    cur = new LazyState(make, sel, cur.others);
    out.push({ st: cur, rank });
  }
  // ---- with a parse per step (from where the OrderSim could not tell)
  for (; i < MAX_STEPS; i++) {
    const nx = orderStep(cur.code, cur.model, cur.sel, dir);
    if (!nx || 'reason' in nx) break;
    const st: OrderState = { code: nx.code, model: nx.model, sel: nx.sel, others: nx.other !== undefined ? [...cur.others, nx.other] : cur.others };
    out.push({ st, rank: orderRank(st.model, st.sel) });
    cur = st;
  }
  return out;
}

/** Two blocks with one start or one end: `moveStatement` keeps the last of them, which the OrderSim's order may not match. */
function sharesEnds(blocks: readonly LineSpan[]): boolean {
  return new Set(blocks.map((b) => b.start)).size !== blocks.length || new Set(blocks.map((b) => b.end)).size !== blocks.length;
}

/** Every position the item can reach (at most 400 steps each way); steps that change nothing visible are skipped. */
export function orderPositions(code: string, model: DiagramModel, sel: ItemRef): OrderPositions {
  const base: OrderState = { code, model, sel, others: [] };
  const sim = withOps(model, (k, m) => k.orderSim?.(code, m)) ?? null;
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
  const before = distinct(walk(base, sim, -1)).reverse(), after = distinct(walk(base, sim, 1));
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
