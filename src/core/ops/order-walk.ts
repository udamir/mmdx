// The order slider's walk without a parse (X11, P2; core/ops/order.ts): the statement moves of `moveStatement`
// (reorder.ts) as rearrangements of the code's lines, with what the type's OrderSim tells of the model after each. A
// chunk of its own, loaded with the type's OrderSim (`loadOrderSim`): only the order slider needs it.
import type { LineOrder, OrderSim } from '../kind/ops-types.js';
import { isHeaderLine } from '../kinds/info.js';
import { withOps } from '../kinds/registry.js';
import type { DiagramModel } from '../model.js';
import { reparse } from '../parse/dispatch.js';
import type { ItemKind, ItemRef } from '../types.js';
import type { LineSpan, OrderState } from './types.js';

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

/** A position reached, with its draw rank. */
export interface Walked {
  st: OrderState;
  rank: number | null;
}

/** Two blocks with one start or one end: `moveStatement` keeps the last of them, which the OrderSim's order may not match. */
function sharesEnds(blocks: readonly LineSpan[]): boolean {
  return new Set(blocks.map((b) => b.start)).size !== blocks.length || new Set(blocks.map((b) => b.end)).size !== blocks.length;
}

/**
 * One way of the walk from the base while the OrderSim can tell, at most `max` steps: the positions reached, and
 * whether the walk ends there (`done`: a reason, the same code, a ref the type gives none, the type's checkMove) or
 * goes on from `cur` with a parse per step.
 */
export function walkLines(base: OrderState, sim: OrderSim, dir: -1 | 1, max: number, stable: ReadonlySet<ItemKind>): { out: Walked[]; cur: OrderState; done: boolean } {
  const out: Walked[] = [];
  const L = new Lines(base.code.split('\n'));
  const check = withOps(base.model, (k) => (k.checkMove ? (c: string): string | null => k.checkMove!(c) : undefined));
  const moves: LineMove[] = [];
  let cur = base;
  for (let i = 0; i < max; i++) {
    const u = sim.unit(L, cur.sel), blocks = sim.blocks(L);
    if (u === undefined || blocks === undefined || sharesEnds(blocks)) break;
    if (u === null) return { out, cur, done: true }; // moveStatement: no line of its own to move (a reason)
    const mv = moveLines(L, u, blocks, dir);
    if ('reason' in mv) return { out, cur, done: true };
    // the same code (a line written twice traded with its twin): no step
    if (mv.slice.every((o, k) => L.text[o] === L.textAt(mv.lo + k))) return { out, cur, done: true };
    const before = mv.slice.map((_, k) => L.orig(mv.lo + k));
    L.apply(mv);
    if (sim.fragile?.some((run) => run.some((o, k) => k > 0 && L.at(o) !== L.at(run[k - 1]!) + 1)) || sim.keep?.some(([a, b]) => L.at(a) > L.at(b))) {
      L.apply({ lo: mv.lo, slice: before, line: mv.line });
      break;
    }
    if (check?.(L.code())) return { out, cur, done: true }; // the type's checkMove refuses the code
    const id = sim.relocate(L, cur.sel, mv.line);
    const sel: ItemRef | null | undefined = id === undefined ? undefined : id !== null ? { kind: cur.sel.kind, id } : stable.has(cur.sel.kind) ? cur.sel : null;
    if (sel === null) return { out, cur, done: true };
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
  return { out, cur, done: false };
}
