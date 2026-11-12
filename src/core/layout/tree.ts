// Tidy tree layout (T08): the mindmap's deterministic layout. Each subtree is laid out once in a frame of its own (its
// root's left edge at x 0, its centre at y 0): the children stand one level gap to the right of the parent, one under
// the other, each pushed down only as far as its contour needs to clear the ones above (per depth: the box around that
// depth's nodes, compared with every depth of the placed siblings whose x range it shares, so nodes never overlap
// whatever their widths), and the parent sits midway between its first and last child (Walker's rule).
//
// Modes: `both` (default) — the root in the centre, its children split into a right and a left side, balanced by the
// heights of their subtrees in code order (the first ones on the right, clockwise: the left side runs bottom to top),
// a node's `side` overriding the split; `right` — one side; `down` — top to bottom (the same layout, transposed).
// Nudges (`dx`, `dy`) move a node and its subtree from the computed spot. A subtree's frame is cached under its own
// input (ids, sizes, order, collapsed), so an edit lays out its own branch and its ancestors only.
import type { Point } from '../types.js';
import { maxOf, minOf } from '../geom.js';
import { pack, unpack } from './cache.js';
import { hash } from './hash.js';
import type { LayoutCache } from './types.js';

export interface TreeNode {
  id: string;
  w: number;
  h: number;
  children: readonly string[];
  /** A first-level node's side (both mode). */
  side?: 'l' | 'r';
  dx?: number;
  dy?: number;
  /** Its children are not laid out (they are hidden). */
  collapsed?: boolean;
}

export type TreeMode = 'both' | 'right' | 'down';

export interface TreeOptions {
  mode?: TreeMode;
  /** Gap between a parent and its children (horizontal; vertical in `down`). */
  levelGap?: number;
  /** Gap between siblings' subtrees. */
  siblingGap?: number;
  /** Gap between the root's branches. */
  branchGap?: number;
  /** Cache of subtree frames (keyed by the subtree's input). */
  cache?: LayoutCache;
}

export interface TreeResult {
  /** Centres of the laid-out nodes (collapsed subtrees are left out). */
  pos: Map<string, Point>;
  /** Where each node grows from its parent: right, left or down. */
  side: Map<string, 'l' | 'r' | 'd'>;
}

/** One depth of a subtree's contour: the box around its nodes at that depth (frame coordinates). */
interface Band {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Frame {
  /** Node centres relative to the subtree root's left edge (x) and centre (y). */
  pos: Map<string, Point>;
  contour: Band[];
}

const KEY = '\u0000';

/** The vertical shift that puts contour `b` below contour `a` with `gap` between every pair of bands sharing x. */
function clearance(a: readonly Band[], b: readonly Band[], gap: number): number {
  let need = -Infinity;
  for (const p of a) for (const q of b) if (q.x0 < p.x1 && p.x0 < q.x1) need = Math.max(need, p.y1 - q.y0 + gap);
  return need === -Infinity ? 0 : need;
}

function merge(into: Band[], bands: readonly Band[], dx: number, dy: number, from: number): void {
  bands.forEach((b, k) => {
    const s = { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy };
    const cur = into[from + k];
    into[from + k] = cur ? { x0: Math.min(cur.x0, s.x0), x1: Math.max(cur.x1, s.x1), y0: Math.min(cur.y0, s.y0), y1: Math.max(cur.y1, s.y1) } : s;
  });
}

/** Stacks frames one under the other, each as high as the ones above allow; returns their y offsets. */
function stack(frames: readonly Frame[], gap: number): number[] {
  const placed: Band[] = [];
  return frames.map((f, i) => {
    const dy = i ? clearance(placed, f.contour, gap) : 0;
    merge(placed, f.contour, 0, dy, 0);
    return dy;
  });
}

export function layoutTree(root: string, nodes: ReadonlyMap<string, TreeNode>, o: TreeOptions = {}): TreeResult {
  const mode = o.mode ?? 'both';
  const down = mode === 'down';
  const levelGap = o.levelGap ?? 56, gap = o.siblingGap ?? 12, branchGap = o.branchGap ?? 22;
  // `down` is the horizontal layout transposed
  const W = (n: TreeNode): number => (down ? n.h : n.w);
  const H = (n: TreeNode): number => (down ? n.w : n.h);
  const kids = (n: TreeNode): TreeNode[] => (n.collapsed ? [] : n.children.map((c) => nodes.get(c)).filter((c): c is TreeNode => !!c));
  const sigs = new Map<string, string>();
  const accepted = new Map<string, TreeNode[]>();
  const onPath = new Set<string>();
  // one entry per subtree, for both versions of a diff
  o.cache?.reserve?.(2 * nodes.size);

  /** The subtree's input as a string (its cache key); a node reached twice (bad input) is a leaf. */
  const sig = (n: TreeNode): string => {
    const s = sigs.get(n.id);
    if (s !== undefined) return s;
    onPath.add(n.id);
    const cs = kids(n).filter((c) => !onPath.has(c.id) && !sigs.has(c.id));
    accepted.set(n.id, cs);
    const out = hash(`${JSON.stringify(n.id)}:${W(n)}x${H(n)}(${cs.map(sig).join(',')})`);
    onPath.delete(n.id);
    sigs.set(n.id, out);
    return out;
  };

  const frame = (n: TreeNode): Frame => {
    const key = `tree${down ? 'v' : 'h'}${levelGap},${gap}${KEY}${sig(n)}`;
    const hit = o.cache?.get(key);
    if (hit) return unframe(hit);
    const w = W(n), h = H(n);
    const own: Band = { x0: 0, x1: w, y0: -h / 2, y1: h / 2 };
    const children = childrenOf(n);
    const f: Frame = { pos: new Map([[n.id, { x: w / 2, y: 0 }]]), contour: [own] };
    if (children.length) {
      const subs = children.map(frame);
      const x = w + levelGap;
      const ys = stack(subs, gap);
      const mid = (ys[0]! + ys[ys.length - 1]!) / 2;
      subs.forEach((s, i) => {
        const dy = ys[i]! - mid;
        for (const [id, p] of s.pos) f.pos.set(id, { x: p.x + x, y: p.y + dy });
        merge(f.contour, s.contour, x, dy, 1);
      });
    }
    o.cache?.set(key, pack(f.pos, f.contour.map((b, k) => [k, [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }]] as const)));
    return f;
  };
  // children as the frame sees them: in order, each once (sig() decided which)
  const childrenOf = (n: TreeNode): TreeNode[] => {
    if (!sigs.has(n.id)) sig(n);
    return accepted.get(n.id) ?? [];
  };

  const pos = new Map<string, Point>();
  const side = new Map<string, 'l' | 'r' | 'd'>();
  const top = nodes.get(root);
  if (!top) return { pos, side };
  sig(top);
  const rw = W(top);
  pos.set(top.id, { x: 0, y: 0 });

  const branches = childrenOf(top);
  const subs = new Map(branches.map((b) => [b.id, frame(b)]));
  const height = (b: TreeNode): number => {
    const c = subs.get(b.id)!.contour;
    return maxOf(c.map((x) => x.y1)) - minOf(c.map((x) => x.y0));
  };
  let right: TreeNode[] = branches, left: TreeNode[] = [];
  if (mode === 'both' && branches.length > 1) {
    // balance the summed heights; pinned branches count on their side, the others split in code order
    const free = branches.filter((b) => !b.side);
    let R = 0, L = 0;
    for (const b of branches) if (b.side === 'r') R += height(b);
    else if (b.side === 'l') L += height(b);
    const hs = free.map(height);
    const total = hs.reduce((a, b) => a + b, 0);
    let best = 0, bestD = Infinity, acc = 0;
    for (let k = 0; k <= free.length; k++) {
      const d = Math.abs(R + acc - (L + total - acc));
      // ties: more on the right (clockwise from the top right)
      if (d < bestD - 1e-9) {
        bestD = d;
        best = k;
      }
      acc += hs[k] ?? 0;
    }
    const onRight = new Set(free.slice(0, best).map((b) => b.id));
    right = branches.filter((b) => b.side === 'r' || (!b.side && onRight.has(b.id)));
    left = branches.filter((b) => !right.includes(b)).reverse();
  }

  const place = (list: readonly TreeNode[], dir: 1 | -1): void => {
    if (!list.length) return;
    const fs = list.map((b) => subs.get(b.id)!);
    const ys = stack(fs, branchGap);
    let y0 = Infinity, y1 = -Infinity;
    fs.forEach((f, i) => {
      for (const b of f.contour) {
        y0 = Math.min(y0, b.y0 + ys[i]!);
        y1 = Math.max(y1, b.y1 + ys[i]!);
      }
    });
    const mid = (y0 + y1) / 2;
    const x = rw / 2 + levelGap;
    fs.forEach((f, i) => {
      for (const [id, p] of f.pos) {
        pos.set(id, { x: dir * (p.x + x), y: p.y + ys[i]! - mid });
        side.set(id, down ? 'd' : dir === 1 ? 'r' : 'l');
      }
    });
  };
  place(right, 1);
  place(left, -1);

  // nudges: a node and its subtree move together
  const nudge = (n: TreeNode, ox: number, oy: number, seen: Set<string>): void => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const ax = ox + (n.dx ?? 0), ay = oy + (n.dy ?? 0);
    const p = pos.get(n.id);
    if (p && (ax || ay)) pos.set(n.id, down ? { x: p.x + ay, y: p.y + ax } : { x: p.x + ax, y: p.y + ay });
    for (const c of kids(n)) nudge(c, ax, ay, seen);
  };
  // nudges are stored in page coordinates; in `down` the layout's axes are swapped back below
  nudge(top, 0, 0, new Set());
  if (down) for (const [id, p] of pos) pos.set(id, { x: p.y, y: p.x });
  return { pos, side };
}

// ---- cache values: a frame's node centres, its contour's bands as two corners each (layout/cache.ts) ----

function unframe(m: ReadonlyMap<string, Point>): Frame {
  const { pos, lists } = unpack(m);
  const contour: Band[] = [];
  for (const [k, [a, b]] of lists) contour[k] = { x0: a!.x, x1: b!.x, y0: a!.y, y1: b!.y };
  return { pos, contour };
}
