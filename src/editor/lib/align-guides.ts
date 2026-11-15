// Smart guides (task 005): where a moved or resized box snaps to line up with the boxes around it (edges and centres,
// equal gaps to its row / column neighbours, equal margins inside its parent frame) and which of those relations hold
// for the box as drawn. Pure: rectangles in diagram units in, a correction per axis and the guides to draw out.

/** An axis-aligned box by its edges (x0 < x1, y0 < y1). */
export interface Rect { x0: number; y0: number; x1: number; y1: number }
/** Which lines of the moving box may snap on an axis: its low edge, its middle, its high edge. */
export type Anchor = 'lo' | 'mid' | 'hi';
export type Axis = 'x' | 'y';

export interface GuideInput {
  /** The moving box as the pointer puts it (start + delta, before any snapping). */
  box: Rect;
  /** Boxes it can align to (frozen at the press). */
  others: readonly Rect[];
  /** The parent frame (hand-sized), or null. */
  parent: Rect | null;
  /** Lines of the box that may snap, per axis (move: all three; resize: 'hi'). */
  anchors: { x: readonly Anchor[]; y: readonly Anchor[] };
  /** Snap distance in diagram units (6 screen px / zoom). */
  tol: number;
}

export interface Snap {
  /** Correction to add to the raw delta on each axis; null = no guide there (the grid applies). */
  dx: number | null;
  dy: number | null;
}

export type Guide =
  /** Edges or centres in line: at `at` on `axis`, from `from` to `to` across it. */
  | { type: 'line'; axis: Axis; at: number; from: number; to: number }
  /** Equal gaps: one segment per gap (a, b along `axis`, at `cross` across it). */
  | { type: 'gap'; axis: Axis; segs: readonly { a: number; b: number; cross: number }[] }
  /** Equal margins to the parent frame: one segment per margin. */
  | { type: 'margin'; segs: readonly { axis: Axis; a: number; b: number; cross: number }[] };

const ANCHORS: readonly Anchor[] = ['lo', 'mid', 'hi'];
const AXES: readonly Axis[] = ['y', 'x'];
/** Where a snap comes from, in tie order: what the user most often wants first. */
const RANK = { align: 0, space: 1, parent: 2 } as const;
/** The margins to the parent frame on each axis (low side, high side). */
const SIDES = { x: ['L', 'R'], y: ['T', 'B'] } as const;
type Side = (typeof SIDES)[Axis][number];
/** Margin pairs that count as equal: opposite (centred in the parent), then corner (the same inset from a corner). */
const PAIRS: readonly (readonly [Side, Side])[] = [['L', 'R'], ['T', 'B'], ['L', 'T'], ['L', 'B'], ['R', 'T'], ['R', 'B']];
/**
 * A relation holds for the drawn box: a line within one unit, two distances within one and a half. Positions are whole
 * units, so a snapped box lands a little off its target (a resize rounds both its size and its centre).
 */
const LINE_EPS = 1 + 1e-6, DIST_EPS = 1.5 + 1e-6;

const crossOf = (a: Axis): Axis => (a === 'x' ? 'y' : 'x');
const lo = (r: Rect, a: Axis): number => (a === 'x' ? r.x0 : r.y0);
const hi = (r: Rect, a: Axis): number => (a === 'x' ? r.x1 : r.y1);
const mid = (r: Rect, a: Axis): number => (lo(r, a) + hi(r, a)) / 2;
const valueAt = (r: Rect, a: Axis, an: Anchor): number => (an === 'lo' ? lo(r, a) : an === 'hi' ? hi(r, a) : mid(r, a));

/** Which edges of the box move on an axis: both for a move, the high one for a resize. */
interface Moves { lo: boolean; hi: boolean }
const movesOf = (anchors: readonly Anchor[]): Moves => ({ lo: anchors.includes('lo'), hi: anchors.includes('hi') });
/** How far an anchor goes when the moving edges go `s`. */
const rate = (mv: Moves, an: Anchor): number => (an === 'lo' ? +mv.lo : an === 'hi' ? +mv.hi : (+mv.lo + +mv.hi) / 2);

function shifted(r: Rect, a: Axis, s: number, mv: Moves): Rect {
  const d0 = mv.lo ? s : 0, d1 = mv.hi ? s : 0;
  return a === 'x' ? { ...r, x0: r.x0 + d0, x1: r.x1 + d1 } : { ...r, y0: r.y0 + d0, y1: r.y1 + d1 };
}

// ---- rows and neighbours ------------------------------------------------------------------------------------------

/** The boxes beside `r` on axis `a`: those overlapping it across the axis. */
const rowOf = (others: readonly Rect[], r: Rect, a: Axis): Rect[] => {
  const c = crossOf(a);
  return others.filter((o) => lo(o, c) < hi(r, c) && hi(o, c) > lo(r, c));
};

/** The nearest box of the row before `r` and after it on axis `a`. */
function neighbours(others: readonly Rect[], r: Rect, a: Axis): { before: Rect | null; after: Rect | null } {
  let before: Rect | null = null, after: Rect | null = null;
  for (const o of rowOf(others, r, a)) {
    if (hi(o, a) <= lo(r, a) && (!before || hi(o, a) > hi(before, a))) before = o;
    if (lo(o, a) >= hi(r, a) && (!after || lo(o, a) < lo(after, a))) after = o;
  }
  return { before, after };
}

/** The box's neighbours and theirs, farther out: what equal spacing compares (only neighbours, never boxes beyond). */
function rowFacts(others: readonly Rect[], box: Rect, a: Axis): { L: Rect | null; R: Rect | null; LL: Rect | null; RR: Rect | null } {
  const { before: L, after: R } = neighbours(others, box, a);
  return { L, R, LL: L && neighbours(others, L, a).before, RR: R && neighbours(others, R, a).after };
}

/** Shifts that give the box equal gaps: between its two neighbours, or continuing the gap of a neighbour pair. */
function spacingShifts(others: readonly Rect[], box: Rect, a: Axis): number[] {
  const { L, R, LL, RR } = rowFacts(others, box, a);
  const size = hi(box, a) - lo(box, a), out: number[] = [];
  if (L && R) {
    const at = (hi(L, a) + lo(R, a) - size) / 2;
    if (at > hi(L, a)) out.push(at - lo(box, a));
  }
  if (L && LL && lo(L, a) > hi(LL, a)) out.push(hi(L, a) + lo(L, a) - hi(LL, a) - lo(box, a));
  if (R && RR && lo(RR, a) > hi(R, a)) out.push(lo(R, a) - (lo(RR, a) - hi(R, a)) - hi(box, a));
  return out;
}

// ---- parent margins -----------------------------------------------------------------------------------------------

const margins = (p: Rect, b: Rect): Record<Side, number> => ({ L: b.x0 - p.x0, R: p.x1 - b.x1, T: b.y0 - p.y0, B: p.y1 - b.y1 });

/** Shifts on axis `a` that make a margin pair equal (both margins > 0 after it). */
function parentShifts(p: Rect, box: Rect, a: Axis, mv: Moves): number[] {
  const m = margins(p, box), [sLo, sHi] = SIDES[a];
  const rateOf = (s: Side): number => (s === sLo ? +mv.lo : s === sHi ? -mv.hi : 0);
  const out: number[] = [];
  for (const [s1, s2] of PAIRS) {
    const c1 = rateOf(s1), c2 = rateOf(s2);
    if (c1 === c2) continue;
    const s = (m[s2] - m[s1]) / (c1 - c2);
    if (m[s1] + c1 * s > 0 && m[s2] + c2 * s > 0) out.push(s);
  }
  return out;
}

// ---- the snap -----------------------------------------------------------------------------------------------------

/** The correction on axis `a` with the lowest cost within the tolerance (ties: alignment, spacing, parent), or null. */
function snapAxis(inp: GuideInput, box: Rect, a: Axis): number | null {
  const anchors = inp.anchors[a], mv = movesOf(anchors);
  let best: { cost: number; rank: number; s: number } | null = null;
  const offer = (s: number, rank: number): void => {
    const cost = Math.abs(s);
    if (cost > inp.tol + 1e-9) return;
    if (!best || cost < best.cost - 1e-9 || (cost <= best.cost + 1e-9 && rank < best.rank)) best = { cost, rank, s };
  };
  for (const an of anchors) {
    const r = rate(mv, an), v = valueAt(box, a, an);
    if (r) for (const o of inp.others) for (const t of ANCHORS) offer((valueAt(o, a, t) - v) / r, RANK.align);
  }
  if (mv.lo && mv.hi) for (const s of spacingShifts(inp.others, box, a)) offer(s, RANK.space);
  if (inp.parent) for (const s of parentShifts(inp.parent, box, a, mv)) offer(s, RANK.parent);
  return (best as { s: number } | null)?.s ?? null;
}

/** Where the box snaps (per axis) within the tolerance: y first, then x against the final y. */
export function snapBox(inp: GuideInput): Snap {
  const dy = snapAxis(inp, inp.box, 'y');
  const box = dy === null ? inp.box : shifted(inp.box, 'y', dy, movesOf(inp.anchors.y));
  return { dx: snapAxis(inp, box, 'x'), dy };
}

// ---- what to draw -------------------------------------------------------------------------------------------------

/** Alignment lines on axis `a`: across the box and the nearest matched box on each side only. */
function lineGuides(inp: Omit<GuideInput, 'tol'>, a: Axis): Guide[] {
  const { box } = inp, c = crossOf(a), out: Guide[] = [], seen = new Set<number>();
  for (const an of inp.anchors[a]) {
    const v = valueAt(box, a, an);
    if (seen.has(v)) continue;
    seen.add(v);
    const bm = mid(box, c);
    let before: Rect | null = null, after: Rect | null = null;
    for (const o of inp.others) {
      if (!ANCHORS.some((t) => Math.abs(valueAt(o, a, t) - v) <= LINE_EPS)) continue;
      if (mid(o, c) < bm) {
        if (!before || mid(o, c) > mid(before, c)) before = o;
      } else if (!after || mid(o, c) < mid(after, c)) after = o;
    }
    if (!before && !after) continue;
    out.push({ type: 'line', axis: a, at: v, from: Math.min(lo(box, c), before ? lo(before, c) : Infinity), to: Math.max(hi(box, c), after ? hi(after, c) : -Infinity) });
  }
  return out;
}

/** Equal gaps on axis `a`: between the two neighbours, or continuing a neighbour pair's gap; one guide per gap size. */
function gapGuides(others: readonly Rect[], box: Rect, a: Axis): Guide[] {
  const { L, R, LL, RR } = rowFacts(others, box, a), c = crossOf(a);
  const gap = (p: Rect, q: Rect): number => lo(q, a) - hi(p, a);
  const seg = (p: Rect, q: Rect): { a: number; b: number; cross: number } =>
    ({ a: hi(p, a), b: lo(q, a), cross: (Math.max(lo(p, c), lo(q, c)) + Math.min(hi(p, c), hi(q, c))) / 2 });
  const pairs: [[Rect, Rect], [Rect, Rect]][] = [];
  if (L && R) pairs.push([[L, box], [box, R]]);
  if (L && LL) pairs.push([[LL, L], [L, box]]);
  if (R && RR) pairs.push([[box, R], [R, RR]]);
  const groups: { g: number; segs: Map<string, { a: number; b: number; cross: number }> }[] = [];
  for (const [p, q] of pairs) {
    const g1 = gap(...p), g2 = gap(...q);
    if (g1 <= 0 || g2 <= 0 || Math.abs(g1 - g2) > DIST_EPS) continue;
    let grp = groups.find((x) => Math.abs(x.g - g1) <= DIST_EPS);
    if (!grp) groups.push((grp = { g: g1, segs: new Map() }));
    for (const s of [seg(...p), seg(...q)]) grp.segs.set(`${s.a}:${s.b}`, s);
  }
  return groups.map((x) => ({ type: 'gap', axis: a, segs: [...x.segs.values()] }));
}

/** Equal margins to the parent frame: the pairs with a moving side whose margins are equal and > 0. */
function marginGuide(p: Rect, box: Rect, anchors: GuideInput['anchors']): Guide | null {
  const m = margins(p, box), mx = movesOf(anchors.x), my = movesOf(anchors.y);
  const moving: Record<Side, boolean> = { L: mx.lo, R: mx.hi, T: my.lo, B: my.hi };
  const on = new Set<Side>();
  for (const [s1, s2] of PAIRS)
    if ((moving[s1] || moving[s2]) && m[s1] > 0 && m[s2] > 0 && Math.abs(m[s1] - m[s2]) <= DIST_EPS) on.add(s1).add(s2);
  if (!on.size) return null;
  const cx = mid(box, 'x'), cy = mid(box, 'y');
  const SEG: Record<Side, { axis: Axis; a: number; b: number; cross: number }> = {
    L: { axis: 'x', a: p.x0, b: box.x0, cross: cy },
    R: { axis: 'x', a: box.x1, b: p.x1, cross: cy },
    T: { axis: 'y', a: p.y0, b: box.y0, cross: cx },
    B: { axis: 'y', a: box.y1, b: p.y1, cross: cx },
  };
  return { type: 'margin', segs: [...on].map((s) => SEG[s]) };
}

/** The relations that hold for `box` (lines within one unit, distances within one and a half): what to draw. */
export function guidesFor(inp: Omit<GuideInput, 'tol'>): Guide[] {
  const out: Guide[] = [];
  for (const a of AXES) {
    out.push(...lineGuides(inp, a));
    const mv = movesOf(inp.anchors[a]);
    if (mv.lo && mv.hi) out.push(...gapGuides(inp.others, inp.box, a));
  }
  const mg = inp.parent && marginGuide(inp.parent, inp.box, inp.anchors);
  if (mg) out.push(mg);
  return out;
}
