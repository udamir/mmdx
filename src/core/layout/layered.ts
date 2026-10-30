// Small layered (Sugiyama-style) auto-layout used when metadata has no positions (prototype `layout.js`).
// nodes: [{id, w, h, path: [groupIds outer→inner]}], edges: [{from, to, minlen}]
// Returns Map id → {x, y} (centres).
//
// Same algorithm and output as the prototype for normal input, hardened against pathological input (§12):
// - both depth-first passes (cycle breaking, longest-path ranking) are iterative, so a 10 000-node chain does not
//   overflow the stack;
// - `minlen` is clamped to MAX_MINLEN and the total number of virtual nodes to MAX_VIRTUAL (an edge that would go
//   over the budget is not split: it still constrains ranks, it just is not kept straight by the ordering pass);
// - no `Math.min(...arr)` / `Math.max(...arr)` spreads;
// - ties are broken by insertion order (stable sort, Map iteration order), so the result is deterministic.
import type { Point } from '../types.js';

export interface LayoutNode {
  id: string;
  w: number;
  h: number;
  /** Enclosing group ids, outermost first. */
  path?: readonly string[];
}

export interface LayoutEdge {
  from: string | null;
  to: string | null;
  minlen?: number;
}

export interface LayeredOptions {
  dir?: 'TB' | 'BT' | 'LR' | 'RL';
  rankSep?: number;
  nodeSep?: number;
  groupGap?: number;
}

/** Longest edge, in ranks (Mermaid's `---->` adds one rank per extra dash; nobody needs 50). */
export const MAX_MINLEN = 50;
/** Virtual nodes over all edges; past this, long edges are no longer split. */
export const MAX_VIRTUAL = 20_000;

interface DEdge {
  from: string;
  to: string;
  minlen: number;
}

const EMPTY: readonly string[] = [];

export function layered(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], opts: LayeredOptions = {}): Map<string, Point> {
  const { dir = 'TB', rankSep = 70, nodeSep = 40, groupGap = 50 } = opts;
  const horizontal = dir === 'LR' || dir === 'RL';
  const ids = nodes.map((n) => n.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const E: DEdge[] = [];
  for (const e of edges) {
    if (e.from === null || e.to === null || !byId.has(e.from) || !byId.has(e.to) || e.from === e.to) continue;
    const ml = Number.isFinite(e.minlen) ? Math.trunc(e.minlen ?? 1) : 1;
    E.push({ from: e.from, to: e.to, minlen: Math.max(1, Math.min(MAX_MINLEN, ml || 1)) });
  }

  // 1. Break cycles (DFS back edges get reversed). Iterative DFS, visiting out-edges in order like the recursion.
  const out = new Map<string, number[]>(ids.map((i) => [i, []]));
  E.forEach((e, i) => out.get(e.from)!.push(i));
  const state = new Map<string, number>();
  const reversed = new Set<number>();
  for (const root of ids) {
    if (state.get(root)) continue;
    const stack: { v: string; k: number }[] = [{ v: root, k: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const outs = out.get(top.v)!;
      if (top.k >= outs.length) {
        state.set(top.v, 2);
        stack.pop();
        continue;
      }
      const i = outs[top.k++]!;
      const w = E[i]!.to;
      const s = state.get(w);
      if (s === 1) reversed.add(i);
      else if (!s) {
        state.set(w, 1);
        stack.push({ v: w, k: 0 });
      }
    }
  }
  const DE: DEdge[] = E.map((e, i) => (reversed.has(i) ? { from: e.to, to: e.from, minlen: e.minlen } : e));

  // 2. Rank by longest path, then pull sources down next to their successors.
  const preds = new Map<string, DEdge[]>(ids.map((i) => [i, []]));
  const succs = new Map<string, DEdge[]>(ids.map((i) => [i, []]));
  for (const e of DE) {
    preds.get(e.to)!.push(e);
    succs.get(e.from)!.push(e);
  }
  const rank = new Map<string, number>();
  // post-order over predecessors (the prototype's memoized recursive `visit`, made iterative)
  for (const root of ids) {
    if (rank.has(root)) continue;
    rank.set(root, 0);
    const stack: { v: string; k: number }[] = [{ v: root, k: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const ps = preds.get(top.v)!;
      if (top.k < ps.length) {
        const u = ps[top.k++]!.from;
        if (!rank.has(u)) {
          rank.set(u, 0); // guard, as in the prototype (the graph is acyclic after step 1)
          stack.push({ v: u, k: 0 });
        }
        continue;
      }
      let r = 0;
      for (const e of ps) r = Math.max(r, rank.get(e.from)! + e.minlen);
      rank.set(top.v, r);
      stack.pop();
    }
  }
  for (const v of ids) {
    const ss = succs.get(v)!;
    if (preds.get(v)!.length || !ss.length) continue;
    let m = Infinity;
    for (const e of ss) m = Math.min(m, rank.get(e.to)! - e.minlen);
    rank.set(v, Math.max(0, m));
  }

  // 3. Virtual nodes for long edges so ordering keeps them straight.
  const layers: string[][] = [];
  const put = (id: string, r: number): void => {
    (layers[r] ??= []).push(id);
  };
  for (const v of ids) put(v, rank.get(v)!);
  const vnodes = new Map<string, readonly string[]>();
  const adjUp = new Map<string, string[]>();
  const adjDown = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    let d = adjDown.get(a);
    if (!d) adjDown.set(a, (d = []));
    d.push(b);
    let u = adjUp.get(b);
    if (!u) adjUp.set(b, (u = []));
    u.push(a);
  };
  let vc = 0;
  for (const e of DE) {
    let prev = e.from;
    const r0 = rank.get(e.from)!, r1 = rank.get(e.to)!;
    if (r1 - r0 - 1 > 0 && vc + (r1 - r0 - 1) <= MAX_VIRTUAL) {
      for (let r = r0 + 1; r < r1; r++) {
        const vid = `__v${vc++}`;
        vnodes.set(vid, byId.get(e.from)!.path ?? EMPTY);
        put(vid, r);
        link(prev, vid);
        prev = vid;
      }
    }
    link(prev, e.to);
  }
  for (let r = 0; r < layers.length; r++) layers[r] ??= [];
  const pathOf = (id: string): readonly string[] => byId.get(id)?.path ?? vnodes.get(id) ?? EMPTY;
  const size = (id: string): { a: number; b: number } => {
    const n = byId.get(id);
    if (!n) return { a: 10, b: 10 };
    return horizontal ? { a: n.h, b: n.w } : { a: n.w, b: n.h }; // a = along layer, b = across
  };

  // 4. Ordering: barycenter sweeps, keeping groups contiguous.
  const pos = new Map<string, number>();
  for (const L of layers) L.forEach((id, i) => pos.set(id, i));
  const sortLayer = (L: string[], nbrs: Map<string, string[]>): void => {
    const bc = new Map<string, number>();
    for (const id of L) {
      const ns = nbrs.get(id) ?? EMPTY;
      let s = 0;
      for (const n of ns) s += pos.get(n)!;
      bc.set(id, ns.length ? s / ns.length : pos.get(id)!);
    }
    const groupAvg = new Map<string, [number, number]>();
    for (const id of L)
      pathOf(id).forEach((g, depth) => {
        const k = `${depth}:${g}`;
        const a = groupAvg.get(k) ?? [0, 0];
        groupAvg.set(k, [a[0] + bc.get(id)!, a[1] + 1]);
      });
    const key = (id: string, depth: number): [number, string] => {
      const p = pathOf(id);
      if (depth < p.length) {
        const a = groupAvg.get(`${depth}:${p[depth]}`)!;
        return [a[0] / a[1], p[depth]!];
      }
      return [bc.get(id)!, id];
    };
    L.sort((x, y) => {
      for (let d = 0; d < 6; d++) {
        const [kx, ix] = key(x, d), [ky, iy] = key(y, d);
        if (ix === iy) {
          if (d >= Math.max(pathOf(x).length, pathOf(y).length)) break;
          continue;
        }
        return kx - ky || (ix < iy ? -1 : 1);
      }
      return bc.get(x)! - bc.get(y)!;
    });
    L.forEach((id, i) => pos.set(id, i));
  };
  for (let it = 0; it < 8; it++) {
    if (it % 2 === 0) for (let r = 1; r < layers.length; r++) sortLayer(layers[r]!, adjUp);
    else for (let r = layers.length - 2; r >= 0; r--) sortLayer(layers[r]!, adjDown);
  }

  // 5. Coordinates along the layer: pack, then relax towards neighbours.
  const coord = new Map<string, number>();
  const gap = (x: string, y: string): number => {
    const px = pathOf(x), py = pathOf(y);
    let shared = 0;
    while (shared < px.length && shared < py.length && px[shared] === py[shared]) shared++;
    const diff = Math.max(px.length, py.length) - shared;
    return nodeSep + (diff ? groupGap * Math.min(diff, 2) : 0);
  };
  const pack = (L: string[], desired: Map<string, number>): void => {
    for (let i = 0; i < L.length; i++) {
      const id = L[i]!;
      let c = desired.get(id)!;
      if (i > 0) {
        const p = L[i - 1]!;
        const min = coord.get(p)! + size(p).a / 2 + gap(p, id) + size(id).a / 2;
        c = Math.max(c, min);
      }
      coord.set(id, c);
    }
    // shift back so the mean displacement is zero
    let s = 0;
    for (const id of L) s += coord.get(id)! - desired.get(id)!;
    const shift = s / (L.length || 1);
    for (const id of L) coord.set(id, coord.get(id)! - shift);
  };
  for (const L of layers) {
    let c = 0;
    const d = new Map<string, number>();
    for (const id of L) {
      d.set(id, c + size(id).a / 2);
      c += size(id).a + nodeSep;
    }
    pack(L, d);
  }
  for (let it = 0; it < 6; it++) {
    for (let k = 0; k < layers.length; k++) {
      const L = layers[it % 2 === 0 ? k : layers.length - 1 - k]!;
      const d = new Map<string, number>();
      for (const id of L) {
        const up = adjUp.get(id) ?? EMPTY, down = adjDown.get(id) ?? EMPTY;
        const n = up.length + down.length;
        let s = 0;
        for (const x of up) s += coord.get(x)!;
        for (const x of down) s += coord.get(x)!;
        d.set(id, n ? s / n : coord.get(id)!);
      }
      pack(L, d);
    }
  }

  // 6. Coordinates across layers.
  const res = new Map<string, Point>();
  let offset = 0;
  for (const L of layers) {
    let thick = 0;
    for (const id of L) thick = Math.max(thick, size(id).b);
    for (const id of L) {
      if (!byId.has(id)) continue;
      const a = coord.get(id)!, b = offset + thick / 2;
      res.set(id, horizontal ? { x: b, y: a } : { x: a, y: b });
    }
    offset += thick + rankSep;
  }
  // Flip for BT / RL, then normalize to positive coordinates.
  let minX = Infinity, minY = Infinity;
  for (const [id, p] of res) {
    if (dir === 'BT') p.y = -p.y;
    if (dir === 'RL') p.x = -p.x;
    const n = byId.get(id)!;
    minX = Math.min(minX, p.x - n.w / 2);
    minY = Math.min(minY, p.y - n.h / 2);
  }
  for (const p of res.values()) {
    p.x += 60 - minX;
    p.y += 60 - minY;
  }
  return res;
}
