// Compound layout (T07): nested containers, each laid out in its own direction, with title bands, concurrency regions
// and hand-placed items, on top of the layered engine (layered.ts). Kind-independent: flowchart subgraphs use it, state
// composites (T09) and ER subgraphs (T11) will.
//
// Input (`layoutCompound({ nodes, containers, edges }, opts)`):
// - `CompoundNode { id, w, h, parent?, region?, order?, fixed?, beside?, hidden? }`: a leaf box (size, centre out);
//   `parent` names its container (absent / unknown: the top level); `region` its concurrency region in the parent
//   (0 by default); `order` sorts the items of a scope (input order otherwise: nodes, then containers); `fixed` a
//   hand-placed centre; `beside: { of, side }` keeps the node next to another one of its scope, in the same rank, on
//   that side (state notes): the pair is one box for the layered engine; `hidden`: positioned, but a container with
//   hand-placed contents does not grow around it (items hidden by layers).
// - `CompoundContainer { id, parent?, region?, order?, dir?, title?, pad?, regions?, fixed?, at? }`: a box around its
//   children. `dir` its own direction (inherited when absent); `title: { w, h }` the title band at the top (h: the
//   band's height, which replaces the top padding; w: the title's width, which the box is at least, plus padding);
//   `pad` its padding (`opts.padding` by default); `regions` > 1: the children are laid out per region and the regions
//   stacked across the flow (side by side for TB / BT, one under the other for LR / RL) with a separator line between
//   two; `fixed`: a frame placed by hand (top-left rect), children laid out inside it; `at`: a top-left placed by hand,
//   the size still from its contents.
// - `CompoundEdge { id, from, to, minlen? }`: ends are nodes or containers (an edge to a container ends on its border).
//
// Algorithm (bottom-up, then top-down):
// 1. The tree: parents resolved, cycles cut (a container that would be its own ancestor goes to the top level).
// 2. Each edge is lifted to the deepest scope holding both ends: there it joins the two items (children of that scope)
//    that hold its ends, so `layered` ranks a container like a node (an edge from a.x.y to a.z is x→z inside a). An
//    edge between a container and its own contents, or between two regions, places nothing.
// 3. Post-order, each container whose contents are all auto-placed is laid out once with `layered` in its own
//    direction (per region when it has regions), its size is the block plus padding and title band; it then moves as a
//    unit. A scope with hand-placed contents keeps them (T07 §3.3): its auto items are laid out as one block below the
//    placed ones (left-aligned with them), and its box is the bounding box of its children plus padding and title band
//    (the earlier flowchart behaviour, per scope). A fixed frame keeps its rect; its auto items go inside it.
// 4. Top-down, every container's children are translated by the container's position; the top level starts at
//    `opts.margin`.
//
// Output (`CompoundResult`): node centres (`nodes`), container rects (`containers`, top-left, with the direction used
// and whether the layout placed it), separator lines per container with regions (`regionLines`), per edge the scope
// it was laid out in, that scope's direction and the points `layered` kept free for it (`edges`: the virtual nodes of
// a long edge, a router's hints; the ends are the caller's ports), and the resolved parents (`parent`, for ancestor
// tests: a router must not cross containers other than the ends' ancestors, see route.ts).
//
// Cache (§3.5): each scope's `layered` run is cached under the scope's own input (its items' sizes, its lifted edges,
// its direction and the spacing), so an edit inside one container lays out that scope again, and its ancestors only
// when its size changed. `opts.cache` is the renderers' `LayoutCache` (layout/types.ts).
//
// Deterministic: insertion order everywhere, no randomness, the same input gives the same output.
import { layered, type LayeredOptions, type LayoutEdge, type LayoutNode } from './layered.js';
import type { Point, Rect } from '../types.js';
import { maxOf } from '../geom.js';
import { hash, pack, unpack } from './cache.js';
import type { LayoutCache } from './types.js';

export type CompoundDir = 'TB' | 'BT' | 'LR' | 'RL';

export interface CompoundNode {
  id: string;
  w: number;
  h: number;
  parent?: string | null | undefined;
  region?: number | undefined;
  order?: number | undefined;
  /** Hand-placed centre. */
  fixed?: Point | undefined;
  /** Next to `of` (same scope), in its rank, on that side (a note beside a state). */
  beside?: { of: string; side: 'left' | 'right' } | undefined;
  /** Positioned, but not counted in the bounding box of a container with hand-placed contents. */
  hidden?: boolean | undefined;
}

export interface CompoundContainer {
  id: string;
  parent?: string | null | undefined;
  region?: number | undefined;
  order?: number | undefined;
  dir?: CompoundDir | undefined;
  /** The title band: its height replaces the top padding; the box is at least the title's width plus padding. */
  title?: { w: number; h: number } | undefined;
  pad?: number | undefined;
  /** Concurrency regions (> 1: children laid out per region, stacked across the flow, separated by lines). */
  regions?: number | undefined;
  /** A frame placed by hand (top-left rect). */
  fixed?: Rect | undefined;
  /** A top-left placed by hand; the size comes from the contents. */
  at?: Point | undefined;
}

export interface CompoundEdge {
  id: string;
  from: string;
  to: string;
  minlen?: number | undefined;
}

export interface CompoundInput {
  nodes: readonly CompoundNode[];
  containers: readonly CompoundContainer[];
  edges: readonly CompoundEdge[];
}

export interface CompoundOptions extends Omit<LayeredOptions, 'groupGap'> {
  /** A container's padding when it has no `pad` (default 16). */
  padding?: number;
  /** Space between the title band and the contents (default 0). */
  titleGap?: number;
  /** Space between two regions; the separator runs in its middle (default 24). */
  regionGap?: number;
  /** Where the top level starts (default 60, as `layered`). */
  margin?: number;
  /** Space between hand-placed items and the auto-placed block below them (default 60). */
  placedGap?: number;
  /** Space between a node and the nodes `beside` it (default 16). */
  besideGap?: number;
  /** The contents of an empty container or region (default 40 × 20). */
  emptySize?: { w: number; h: number };
  cache?: LayoutCache | undefined;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CompoundContainerBox extends Rect {
  /** The direction its contents were laid out in. */
  dir: CompoundDir;
  /** Placed by the layout (no hand-placed contents, no fixed frame): it moved as a unit. */
  auto: boolean;
}

export interface CompoundEdgeRoute {
  /** The scope the edge was laid out in (null: the top level). */
  scope: string | null;
  /** That scope's direction (the side its ports prefer). */
  dir: CompoundDir;
  /** The points `layered` kept free for a long edge, from `from` to `to` (empty: none). */
  points: Point[];
}

export interface CompoundResult {
  /** Node centres. */
  nodes: Map<string, Point>;
  /** Nodes the layout placed (not hand-placed). */
  auto: Set<string>;
  /** Container rects (top-left). */
  containers: Map<string, CompoundContainerBox>;
  /** Separators between regions, per container with regions. */
  regionLines: Map<string, Line[]>;
  edges: Map<string, CompoundEdgeRoute>;
  /** Resolved parents (null: the top level) of every node and container. */
  parent: Map<string, string | null>;
  /** Scopes laid out with `layered` (cache misses) and scopes seen, for the cache tests. */
  stats: { scopes: number; laidOut: number };
}

/** The containers holding `id`, innermost first (the item itself not included). */
export function ancestorsOf(parent: ReadonlyMap<string, string | null>, id: string): string[] {
  const out: string[] = [];
  let p = parent.get(id) ?? null;
  while (p !== null && out.length <= parent.size) {
    out.push(p);
    p = parent.get(p) ?? null;
  }
  return out;
}

interface Item {
  id: string;
  w: number;
  h: number;
  container: boolean;
}

/** A laid-out block: item centres relative to its top-left, its size, the hint points of its edges. */
interface Block {
  w: number;
  h: number;
  pos: Map<string, Point>;
  routes: Map<string, Point[]>;
}

interface Lifted {
  id: string;
  from: string;
  to: string;
  minlen?: number | undefined;
}

const ROOT = '\u0000root';

/** The options with their defaults. */
interface Opts {
  padding: number;
  titleGap: number;
  regionGap: number;
  margin: number;
  placedGap: number;
  besideGap: number;
  emptySize: { w: number; h: number };
  rankSep: number;
  nodeSep: number;
  cache: LayoutCache | undefined;
}

/** Step 1's tree (R1): the containers and nodes by id, the resolved parents, every scope's children in order, the scopes in post-order (children first), and the scope readers. */
interface Tree {
  C: Map<string, CompoundContainer>;
  N: Map<string, CompoundNode>;
  parent: Map<string, string | null>;
  kids: Map<string, string[]>;
  post: string[];
  regionsOf(scope: string): number;
  regionOf(id: string): number;
  dirOf(scope: string): CompoundDir;
}

/** Which items are placed by hand (step 3's split): `isPlaced(id)`, and per scope whether something inside it is. */
interface Placed {
  isPlaced(id: string): boolean;
  inside: Map<string, boolean>;
}

/** Step 3's result: sizes and rects of the containers, item centres relative to their scope or absolute, hint points, region lines and what the layout placed. */
interface BottomUp {
  /** Container sizes (auto ones) and absolute rects (placed ones, known bottom-up). */
  size: Map<string, { w: number; h: number }>;
  absRect: Map<string, Rect>;
  /** Child centres relative to their container's top-left (auto containers and the top level). */
  rel: Map<string, Point>;
  /** Absolute centres of items in scopes with hand-placed contents. */
  abs: Map<string, Point>;
  /** Hint points per edge, relative to the top-left of the scope that holds them (or absolute when `absolute`). */
  relRoutes: Map<string, { scope: string; pts: Point[]; absolute: boolean }>;
  regionLines: Map<string, Line[]>;
  autoNodes: Set<string>;
  autoContainers: Set<string>;
}

type Stats = CompoundResult['stats'];

export function layoutCompound(input: CompoundInput, opts: CompoundOptions = {}): CompoundResult {
  const {
    padding = 16, titleGap = 0, regionGap = 24, margin = 60, placedGap = 60, besideGap = 16, emptySize = { w: 40, h: 20 },
    rankSep = 70, nodeSep = 40, cache,
  } = opts;
  const o: Opts = { padding, titleGap, regionGap, margin, placedGap, besideGap, emptySize, rankSep, nodeSep, cache };
  const stats: Stats = { scopes: 0, laidOut: 0 };
  const t = buildTree(input, opts.dir ?? 'TB');
  cache?.reserve?.(2 * (t.C.size + 1));
  const { lifted, routes } = liftEdges(t, input.edges);
  const placed = placedOf(t);
  const b = layoutBottomUp(t, lifted, placed, o, stats);
  const { nodes, containers } = placeTopDown(t, b, routes, placed.inside.get(ROOT)!, margin);
  return { nodes, auto: b.autoNodes, containers, regionLines: b.regionLines, edges: routes, parent: t.parent, stats };
}

/** 1. The tree: parents resolved, cycles cut (a container that would be its own ancestor goes to the top level), each scope's children in `order` (stable: input order, nodes first). */
function buildTree(input: CompoundInput, rootDir: CompoundDir): Tree {
  const C = new Map<string, CompoundContainer>();
  for (const c of input.containers) if (!C.has(c.id)) C.set(c.id, c);
  const N = new Map<string, CompoundNode>(), parent = new Map<string, string | null>();
  for (const n of input.nodes) if (!N.has(n.id) && !C.has(n.id)) N.set(n.id, n);
  for (const c of C.values()) parent.set(c.id, c.parent != null && C.has(c.parent) && c.parent !== c.id ? c.parent : null);
  // cut cycles: walking up from each container, a container met twice goes to the top level
  for (const c of C.values()) {
    const seen = new Set<string>([c.id]);
    let p = parent.get(c.id) ?? null;
    let prev = c.id;
    while (p !== null) {
      if (seen.has(p)) {
        parent.set(prev, null);
        break;
      }
      seen.add(p);
      prev = p;
      p = parent.get(p) ?? null;
    }
  }
  for (const n of N.values()) parent.set(n.id, n.parent != null && C.has(n.parent) ? n.parent : null);

  const kids = new Map<string, string[]>([[ROOT, []]]);
  for (const c of C.values()) kids.set(c.id, []);
  const all: { id: string; order: number | undefined; i: number }[] = [];
  let i = 0;
  for (const n of N.values()) all.push({ id: n.id, order: n.order, i: i++ });
  for (const c of C.values()) all.push({ id: c.id, order: c.order, i: i++ });
  all.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.i - b.i);
  for (const x of all) kids.get(parent.get(x.id) ?? ROOT)!.push(x.id);

  const regionsOf = (scope: string): number => (scope === ROOT ? 1 : Math.max(1, Math.trunc(C.get(scope)!.regions ?? 1) || 1));
  const regionOf = (id: string): number => {
    const r = N.get(id)?.region ?? C.get(id)?.region ?? 0;
    const max = regionsOf(parent.get(id) ?? ROOT) - 1;
    return Math.max(0, Math.min(max, Math.trunc(r) || 0));
  };
  const dirMemo = new Map<string, CompoundDir>();
  const dirOf = (scope: string): CompoundDir => {
    if (scope === ROOT) return rootDir;
    const m = dirMemo.get(scope);
    if (m) return m;
    // iterative: nesting depth is user input
    const chain: string[] = [];
    let s: string | null = scope;
    let d: CompoundDir = rootDir;
    while (s !== null) {
      const known = dirMemo.get(s);
      if (known) {
        d = known;
        break;
      }
      chain.push(s);
      s = parent.get(s) ?? null;
    }
    for (let k = chain.length - 1; k >= 0; k--) {
      const c = C.get(chain[k]!)!;
      if (c.dir) d = c.dir;
      dirMemo.set(chain[k]!, d);
    }
    return d;
  };

  // post-order over containers (iterative)
  const post: string[] = [];
  const stack: { id: string; k: number }[] = [{ id: ROOT, k: 0 }];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    const ch = kids.get(top.id)!;
    if (top.k < ch.length) {
      const c = ch[top.k++]!;
      if (C.has(c)) stack.push({ id: c, k: 0 });
      continue;
    }
    post.push(top.id);
    stack.pop();
  }
  return { C, N, parent, kids, post, regionsOf, regionOf, dirOf };
}

/** 2. Each edge lifted to the deepest scope holding both ends, where it joins the two children that hold them (`lifted`, per scope); every edge gets its route record (its scope and that scope's direction; the points come in step 4). */
function liftEdges(t: Tree, edges: readonly CompoundEdge[]): { lifted: Map<string, Lifted[]>; routes: Map<string, CompoundEdgeRoute> } {
  const { parent } = t;
  /** The item itself, then the containers holding it, innermost first. */
  const scopeChain = (id: string): string[] => [id, ...ancestorsOf(parent, id)];
  const lifted = new Map<string, Lifted[]>();
  const routes = new Map<string, CompoundEdgeRoute>();
  for (const e of edges) {
    if (!parent.has(e.from) || !parent.has(e.to) || e.from === e.to) continue;
    const cu = scopeChain(e.from), cv = scopeChain(e.to);
    const inV = new Set(cv);
    // the deepest container strictly holding both ends (the ends themselves excluded), else the top level
    let scope = ROOT;
    for (const s of cu.slice(1))
      if (inV.has(s) && s !== e.to) {
        scope = s;
        break;
      }
    const pick = (chain: string[]): string | undefined => chain.find((x) => (parent.get(x) ?? ROOT) === scope);
    const a = pick(cu), b = pick(cv);
    routes.set(e.id, { scope: scope === ROOT ? null : scope, dir: t.dirOf(scope), points: [] });
    if (!a || !b || a === b || t.regionOf(a) !== t.regionOf(b)) continue;
    let L = lifted.get(scope);
    if (!L) lifted.set(scope, (L = []));
    L.push({ id: e.id, from: a, to: b, minlen: e.minlen });
  }
  return { lifted, routes };
}

/** The hand-placed contents: a node with `fixed`, a container with a frame or a top-left, or one holding something placed (memoised per scope, children first). */
function placedOf(t: Tree): Placed {
  const { C, N, kids } = t;
  const inside = new Map<string, boolean>();
  const isPlaced = (id: string): boolean => {
    const n = N.get(id);
    if (n) return !!n.fixed;
    const c = C.get(id)!;
    return !!(c.fixed || c.at) || holdsPlaced(id);
  };
  const holdsPlaced = (scope: string): boolean => {
    const m = inside.get(scope);
    if (m !== undefined) return m;
    const v = kids.get(scope)!.some(isPlaced);
    inside.set(scope, v);
    return v;
  };
  for (const s of t.post) holdsPlaced(s);
  return { isPlaced, inside };
}

/**
 * 3. Bottom-up: each container whose contents are all auto-placed is laid out once with `layered` in its own direction
 * (per region when it has regions) and moves as a unit; a scope with hand-placed contents keeps them and lays out its
 * auto items as one block below them; a fixed frame keeps its rect.
 */
function layoutBottomUp(t: Tree, lifted: ReadonlyMap<string, Lifted[]>, placed: Placed, o: Opts, stats: Stats): BottomUp {
  const { C, N, kids } = t;
  const b: BottomUp = { size: new Map(), absRect: new Map(), rel: new Map(), abs: new Map(), relRoutes: new Map(), regionLines: new Map(), autoNodes: new Set(), autoContainers: new Set() };
  const { size, absRect, rel, abs, relRoutes, regionLines, autoNodes, autoContainers } = b;
  const itemOf = (id: string): Item => {
    const n = N.get(id);
    if (n) return { id, w: n.w, h: n.h, container: false };
    const s = size.get(id) ?? (() => {
      const r = absRect.get(id)!;
      return { w: r.w, h: r.h };
    })();
    return { id, w: s.w, h: s.h, container: true };
  };
  const insets = (scope: string): { t: number; s: number; minW: number } => {
    if (scope === ROOT) return { t: 0, s: 0, minW: 0 };
    const c = C.get(scope)!;
    const pad = c.pad ?? o.padding;
    return { t: c.title ? c.title.h + o.titleGap : pad, s: pad, minW: c.title ? c.title.w + 2 * pad : 0 };
  };
  for (const scope of t.post) {
    const ch = kids.get(scope)!;
    const items = ch.map(itemOf);
    const edges = lifted.get(scope) ?? [];
    const c = scope === ROOT ? undefined : C.get(scope)!;
    const ins = insets(scope);
    if (!placed.inside.get(scope)! && !c?.fixed) {
      // auto: laid out here, moves as a unit
      const bl = contents(t, scope, items, edges, o, stats);
      const empty = !items.length;
      const cw = empty ? o.emptySize.w : bl.w, chh = empty ? o.emptySize.h : bl.h;
      const w = Math.max(cw + 2 * ins.s, ins.minW), h = ins.t + chh + ins.s;
      const ox = (w - cw) / 2, oy = ins.t;
      for (const [id, p] of bl.pos) rel.set(id, { x: p.x + ox, y: p.y + oy });
      for (const [id, pts] of bl.routes) relRoutes.set(id, { scope, pts: pts.map((p) => ({ x: p.x + ox, y: p.y + oy })), absolute: false });
      if (bl.lines.length) {
        const top = c?.title ? c.title.h : 0;
        regionLines.set(scope, bl.lines.map((l) => (l.x1 === l.x2 ? { x1: l.x1 + ox, y1: top, x2: l.x2 + ox, y2: h } : { x1: 0, y1: l.y1 + oy, x2: w, y2: l.y2 + oy })));
      }
      for (const id of ch) if (N.has(id)) autoNodes.add(id);
      if (scope !== ROOT) {
        size.set(scope, { w, h });
        if (c?.at) absRect.set(scope, { x: c.at.x, y: c.at.y, w, h });
        else autoContainers.add(scope);
      }
      continue;
    }
    // hand-placed contents (or a fixed frame): placed items keep their place, the others go below them as a block
    const fixed: Item[] = [], loose: Item[] = [];
    for (const it of items) (placed.isPlaced(it.id) ? fixed : loose).push(it);
    const centre = (it: Item): Point => {
      const n = N.get(it.id);
      if (n?.fixed) return n.fixed;
      const r = absRect.get(it.id)!;
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    };
    for (const it of fixed) abs.set(it.id, centre(it));
    const P = extent(fixed, abs, N, true);
    if (loose.length) {
      const ids = new Set(loose.map((x) => x.id));
      const bl = contents(t, scope, loose, edges.filter((e) => ids.has(e.from) && ids.has(e.to)), o, stats);
      let ox: number, oy: number;
      if (P.x0 !== Infinity) {
        ox = P.x0;
        oy = P.y1 + o.placedGap;
      } else if (c?.fixed) {
        // inside an empty fixed frame: below the title band, centred
        ox = c.fixed.x + Math.max(ins.s, (c.fixed.w - bl.w) / 2);
        oy = c.fixed.y + ins.t;
      } else {
        ox = o.margin;
        oy = o.margin;
      }
      for (const [id, p] of bl.pos) abs.set(id, { x: p.x + ox, y: p.y + oy });
      for (const [id, pts] of bl.routes) relRoutes.set(id, { scope, pts: pts.map((p) => ({ x: p.x + ox, y: p.y + oy })), absolute: true });
      for (const it of loose) if (N.has(it.id)) autoNodes.add(it.id);
    }
    if (scope === ROOT) continue;
    if (c?.fixed) {
      absRect.set(scope, { ...c.fixed });
      continue;
    }
    // the bounding box of the children plus padding and the title band; everything inside hidden: a box around the
    // hidden ones (the caller does not draw it)
    let E = extent(items, abs, N, true);
    if (E.x0 === Infinity) E = extent(items, abs, N, false);
    const w = Math.max(E.x1 - E.x0 + 2 * ins.s, ins.minW);
    absRect.set(scope, { x: (E.x0 + E.x1) / 2 - w / 2, y: E.y0 - ins.t, w, h: E.y1 - E.y0 + ins.t + ins.s });
  }
  return b;
}

/** The box around items at their absolute centres (`visible`: the hidden nodes left out); x0 is Infinity for none. */
function extent(items: readonly Item[], abs: ReadonlyMap<string, Point>, N: ReadonlyMap<string, CompoundNode>, visible: boolean): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    if (visible && N.get(it.id)?.hidden) continue;
    const p = abs.get(it.id)!;
    x0 = Math.min(x0, p.x - it.w / 2);
    y0 = Math.min(y0, p.y - it.h / 2);
    x1 = Math.max(x1, p.x + it.w / 2);
    y1 = Math.max(y1, p.y + it.h / 2);
  }
  return { x0, y0, x1, y1 };
}

/** Lays out items with `layered` (cached per scope input): a block with its top-left at (0, 0); nodes `beside` another of the same items join it into one box. */
function layoutBlock(N: ReadonlyMap<string, CompoundNode>, items: readonly Item[], edges: readonly Lifted[], dir: CompoundDir, o: Opts, stats: Stats): Block {
  const { besideGap, cache } = o;
  stats.scopes++;
  if (!items.length) return { w: 0, h: 0, pos: new Map(), routes: new Map() };
  const ids = new Set(items.map((x) => x.id));
  const host = new Map<string, string>();
  const sides = new Map<string, { left: Item[]; right: Item[] }>();
  for (const it of items) {
    const b = it.container ? undefined : N.get(it.id)?.beside;
    if (!b || !ids.has(b.of) || b.of === it.id || N.get(b.of)?.beside) continue;
    host.set(it.id, b.of);
    let s = sides.get(b.of);
    if (!s) sides.set(b.of, (s = { left: [], right: [] }));
    s[b.side === 'left' ? 'left' : 'right'].push(it);
  }
  const span = (L: readonly Item[]): number => L.reduce((a, x) => a + x.w + besideGap, 0);
  const ln: LayoutNode[] = [];
  for (const it of items) {
    if (host.has(it.id)) continue;
    const s = sides.get(it.id);
    if (!s) ln.push({ id: it.id, w: it.w, h: it.h });
    else ln.push({ id: it.id, w: it.w + span(s.left) + span(s.right), h: Math.max(it.h, maxOf([...s.left, ...s.right].map((x) => x.h))) });
  }
  const le: LayoutEdge[] = edges.map((e) => ({ from: host.get(e.from) ?? e.from, to: host.get(e.to) ?? e.to, minlen: e.minlen ?? 1 }));
  const lo = { dir, rankSep: o.rankSep, nodeSep: o.nodeSep };
  const key = cache ? 'compound' + hash(JSON.stringify([ln, le, lo])) : '';
  const hit = cache?.get(key);
  let pos: Map<string, Point>, routes: Map<number, Point[]>;
  if (hit) ({ pos, lists: routes } = unpack(hit));
  else {
    stats.laidOut++;
    routes = new Map();
    pos = layered(ln, le, lo, { routes });
    // the hint points under keys no item id can have (layout/cache.ts)
    if (cache) cache.set(key, pack(pos, routes));
  }
  // to the block's own top-left
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of ln) {
    const p = pos.get(n.id)!;
    x0 = Math.min(x0, p.x - n.w / 2);
    y0 = Math.min(y0, p.y - n.h / 2);
    x1 = Math.max(x1, p.x + n.w / 2);
    y1 = Math.max(y1, p.y + n.h / 2);
  }
  const out = new Map<string, Point>();
  for (const n of ln) {
    const p = pos.get(n.id)!;
    const c = { x: p.x - x0, y: p.y - y0 };
    const s = sides.get(n.id);
    if (!s) {
      out.set(n.id, c);
      continue;
    }
    // the host keeps its own width in the middle of the joined box, notes outwards on each side
    const own = items.find((x) => x.id === n.id)!;
    let left = c.x - n.w / 2;
    for (const x of [...s.left].reverse()) {
      out.set(x.id, { x: left + x.w / 2, y: c.y });
      left += x.w + besideGap;
    }
    out.set(n.id, { x: left + own.w / 2, y: c.y });
    let right = left + own.w + besideGap;
    for (const x of s.right) {
      out.set(x.id, { x: right + x.w / 2, y: c.y });
      right += x.w + besideGap;
    }
  }
  const rmap = new Map<string, Point[]>();
  edges.forEach((e, k) => {
    const r = routes.get(k);
    if (r?.length) rmap.set(e.id, r.map((p) => ({ x: p.x - x0, y: p.y - y0 })));
  });
  return { w: x1 - x0, h: y1 - y0, pos: out, routes: rmap };
}

/** A scope's auto contents: per region, stacked across the flow; centres relative to the contents' top-left. */
function contents(t: Tree, scope: string, items: readonly Item[], edges: readonly Lifted[], o: Opts, stats: Stats): Block & { lines: Line[] } {
  const dir = t.dirOf(scope);
  const k = t.regionsOf(scope);
  if (k <= 1) return { ...layoutBlock(t.N, items, edges, dir, o, stats), lines: [] };
  const across = dir === 'TB' || dir === 'BT' ? 'x' : 'y';
  const blocks: Block[] = [];
  for (let r = 0; r < k; r++) {
    const its = items.filter((x) => t.regionOf(x.id) === r);
    const ids = new Set(its.map((x) => x.id));
    const b = layoutBlock(t.N, its, edges.filter((e) => ids.has(e.from) && ids.has(e.to)), dir, o, stats);
    if (!its.length) {
      b.w = o.emptySize.w;
      b.h = o.emptySize.h;
    }
    blocks.push(b);
  }
  const pos = new Map<string, Point>(), routes = new Map<string, Point[]>();
  const cut: number[] = [];
  let at = 0, thick = 0;
  for (const b of blocks) thick = Math.max(thick, across === 'x' ? b.h : b.w);
  blocks.forEach((b, r) => {
    if (r) {
      cut.push(at + o.regionGap / 2);
      at += o.regionGap;
    }
    const dx = across === 'x' ? at : 0, dy = across === 'x' ? 0 : at;
    for (const [id, p] of b.pos) pos.set(id, { x: p.x + dx, y: p.y + dy });
    for (const [id, pts] of b.routes) routes.set(id, pts.map((p) => ({ x: p.x + dx, y: p.y + dy })));
    at += across === 'x' ? b.w : b.h;
  });
  const w = across === 'x' ? at : thick, h = across === 'x' ? thick : at;
  // separators in contents coordinates; the container stretches them over its whole body below
  const lines = cut.map((c) => (across === 'x' ? { x1: c, y1: 0, x2: c, y2: h } : { x1: 0, y1: c, x2: w, y2: c }));
  return { w, h, pos, routes, lines };
}

/** 4. Top-down: every container's children translated by the container's position (the top level starts at the margin unless something in it is placed by hand); the region lines and the edges' hint points follow. */
function placeTopDown(t: Tree, b: BottomUp, routes: ReadonlyMap<string, CompoundEdgeRoute>, rootPlaced: boolean, margin: number): { nodes: Map<string, Point>; containers: Map<string, CompoundContainerBox> } {
  const { N, parent, kids } = t;
  const nodes = new Map<string, Point>();
  const containers = new Map<string, CompoundContainerBox>();
  const origin = new Map<string, Point>();
  origin.set(ROOT, rootPlaced ? { x: 0, y: 0 } : { x: margin, y: margin });
  for (const scope of [...t.post].reverse()) {
    if (scope !== ROOT) {
      // the container's own place: known (placed) or from its parent's layout
      let r = b.absRect.get(scope);
      if (!r) {
        const s = b.size.get(scope)!;
        const pScope = parent.get(scope) ?? ROOT;
        const p = b.abs.get(scope) ?? add(origin.get(pScope)!, b.rel.get(scope)!);
        r = { x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
      }
      containers.set(scope, { ...r, dir: t.dirOf(scope), auto: b.autoContainers.has(scope) });
      origin.set(scope, { x: r.x, y: r.y });
      const lines = b.regionLines.get(scope);
      if (lines) b.regionLines.set(scope, lines.map((l) => ({ x1: l.x1 + r!.x, y1: l.y1 + r!.y, x2: l.x2 + r!.x, y2: l.y2 + r!.y })));
    }
    const o = origin.get(scope)!;
    for (const id of kids.get(scope)!) {
      if (!N.has(id)) continue;
      nodes.set(id, b.abs.get(id) ?? add(o, b.rel.get(id)!));
    }
  }
  for (const [id, r] of b.relRoutes) {
    const route = routes.get(id);
    if (!route) continue;
    const o = r.absolute ? { x: 0, y: 0 } : origin.get(r.scope)!;
    route.points = r.pts.map((p) => add(o, p));
  }
  return { nodes, containers };
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
