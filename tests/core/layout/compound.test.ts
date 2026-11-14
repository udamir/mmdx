import { describe, expect, it } from 'vitest';
import { ancestorsOf, layoutCompound, type CompoundContainer, type CompoundEdge, type CompoundInput, type CompoundNode, type CompoundResult } from '../../../src/core/layout/compound.js';
import { layered } from '../../../src/core/layout/layered.js';
import { Lru } from '../../../src/core/text/measure.js';
import type { Point, Rect } from '../../../src/core/types.js';

const node = (id: string, parent?: string, extra: Partial<CompoundNode> = {}): CompoundNode => ({ id, w: 80, h: 40, ...(parent ? { parent } : {}), ...extra });
const box = (id: string, parent?: string, extra: Partial<CompoundContainer> = {}): CompoundContainer => ({ id, ...(parent ? { parent } : {}), title: { w: 40, h: 30 }, ...extra });
const edge = (from: string, to: string, extra: Partial<CompoundEdge> = {}): CompoundEdge => ({ id: `${from}->${to}`, from, to, ...extra });

const nodeRect = (R: CompoundResult, n: CompoundNode): Rect => {
  const p = R.nodes.get(n.id)!;
  return { x: p.x - n.w / 2, y: p.y - n.h / 2, w: n.w, h: n.h };
};
const holds = (o: Rect, i: Rect, pad = 0): boolean =>
  i.x >= o.x + pad - 1e-6 && i.y >= o.y + pad - 1e-6 && i.x + i.w <= o.x + o.w - pad + 1e-6 && i.y + i.h <= o.y + o.h - pad + 1e-6;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

/** Every item lies inside its container (below its title band), and the items of one scope do not overlap. */
function checkNesting(input: CompoundInput, R: CompoundResult): void {
  const rectOf = (id: string): Rect => {
    const n = input.nodes.find((x) => x.id === id);
    return n ? nodeRect(R, n) : R.containers.get(id)!;
  };
  const scopes = new Map<string | null, string[]>();
  for (const id of [...input.nodes.map((n) => n.id), ...input.containers.map((c) => c.id)]) {
    const p = R.parent.get(id) ?? null;
    scopes.set(p, [...(scopes.get(p) ?? []), id]);
  }
  for (const [scope, ids] of scopes) {
    if (scope !== null) {
      const c = input.containers.find((x) => x.id === scope)!;
      const r = R.containers.get(scope)!;
      const body = { x: r.x, y: r.y + (c.title?.h ?? 0), w: r.w, h: r.h - (c.title?.h ?? 0) };
      for (const id of ids) expect(holds(body, rectOf(id)), `${id} inside ${scope}`).toBe(true);
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(overlap(rectOf(ids[i]!), rectOf(ids[j]!)), `${ids[i]} / ${ids[j]}`).toBe(false);
  }
}

describe('compound layout (T07.1)', () => {
  it('nests 3 deep: every box inside its parent, below its title, siblings apart', () => {
    const input: CompoundInput = {
      containers: [box('a'), box('b', 'a'), box('c', 'b')],
      nodes: [node('top'), node('a1', 'a'), node('b1', 'b'), node('c1', 'c'), node('c2', 'c'), node('out')],
      edges: [edge('top', 'a1'), edge('a1', 'b1'), edge('b1', 'c1'), edge('c1', 'c2'), edge('c2', 'out')],
    };
    const R = layoutCompound(input);
    checkNesting(input, R);
    expect(ancestorsOf(R.parent, 'c1')).toEqual(['c', 'b', 'a']);
    // TB: top above the containers, out below them
    expect(R.nodes.get('top')!.y).toBeLessThan(R.containers.get('a')!.y);
    expect(R.nodes.get('out')!.y).toBeGreaterThan(R.containers.get('a')!.y + R.containers.get('a')!.h);
    // the title band: a box is at least its title wide, its contents start below the band
    const c = R.containers.get('c')!;
    expect(R.nodes.get('c1')!.y - 20).toBeGreaterThanOrEqual(c.y + 30);
    // the top level starts at the margin
    let x0 = Infinity, y0 = Infinity;
    for (const r of R.containers.values()) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
    }
    for (const n of input.nodes) {
      const r = nodeRect(R, n);
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
    }
    expect([x0, y0]).toEqual([60, 60]);
    expect([...R.auto].sort()).toEqual(['a1', 'b1', 'c1', 'c2', 'out', 'top']);
  });

  it('lays each container out in its own direction (inherited when it has none)', () => {
    const input: CompoundInput = {
      containers: [box('lr', undefined, { dir: 'LR' }), box('bt', undefined, { dir: 'BT' }), box('inherit', 'lr'), box('rl', 'bt', { dir: 'RL' })],
      nodes: [node('l1', 'lr'), node('l2', 'lr'), node('i1', 'inherit'), node('i2', 'inherit'), node('b1', 'bt'), node('b2', 'bt'), node('r1', 'rl'), node('r2', 'rl'), node('t1'), node('t2')],
      edges: [edge('l1', 'l2'), edge('i1', 'i2'), edge('b1', 'b2'), edge('r1', 'r2'), edge('t1', 't2'), edge('lr', 'bt')],
    };
    const R = layoutCompound(input, { dir: 'TB' });
    checkNesting(input, R);
    const P = (id: string): Point => R.nodes.get(id)!;
    expect(P('l2').x).toBeGreaterThan(P('l1').x);
    expect(P('l2').y).toBeCloseTo(P('l1').y);
    expect(P('i2').x).toBeGreaterThan(P('i1').x); // LR from its parent
    expect(P('b2').y).toBeLessThan(P('b1').y);
    expect(P('r2').x).toBeLessThan(P('r1').x);
    expect(P('t2').y).toBeGreaterThan(P('t1').y);
    expect(R.containers.get('inherit')!.dir).toBe('LR');
    expect(R.containers.get('rl')!.dir).toBe('RL');
    // the containers themselves follow the top level's direction
    expect(R.containers.get('bt')!.y).toBeGreaterThanOrEqual(R.containers.get('lr')!.y + R.containers.get('lr')!.h);
  });

  it('lifts an edge across two borders to the scope holding both ends', () => {
    const input: CompoundInput = {
      containers: [box('a'), box('a2', 'a'), box('c'), box('c2', 'c')],
      nodes: [node('x', 'a2'), node('y', 'c2'), node('z', 'c')],
      edges: [edge('y', 'x'), edge('z', 'y')],
    };
    const R = layoutCompound(input);
    checkNesting(input, R);
    // y → x across a2, a, c2 and c: c is ranked above a at the top level
    const a = R.containers.get('a')!, c = R.containers.get('c')!;
    expect(c.y + c.h).toBeLessThanOrEqual(a.y);
    expect(R.edges.get('y->x')).toEqual({ scope: null, dir: 'TB', points: [] });
    // z → y is inside c, across c2's border: z above c2
    expect(R.edges.get('z->y')!.scope).toBe('c');
    expect(R.nodes.get('z')!.y).toBeLessThan(R.containers.get('c2')!.y);
  });

  it('ranks an edge to a container like an edge to a node; an edge into its own contents places nothing', () => {
    const input: CompoundInput = {
      containers: [box('g')],
      nodes: [node('n'), node('g1', 'g'), node('g2', 'g'), node('after')],
      edges: [edge('n', 'g'), edge('g', 'after'), edge('g', 'g1'), edge('g1', 'g2')],
    };
    const R = layoutCompound(input);
    checkNesting(input, R);
    const g = R.containers.get('g')!;
    expect(R.nodes.get('n')!.y + 20).toBeLessThanOrEqual(g.y);
    expect(R.nodes.get('after')!.y - 20).toBeGreaterThanOrEqual(g.y + g.h);
    expect(R.edges.get('n->g')).toMatchObject({ scope: null, dir: 'TB' });
    expect(R.edges.get('g->g1')).toMatchObject({ scope: null });
  });

  it('gives a long edge the points layered kept free for it, in the scope coordinates made absolute', () => {
    const input: CompoundInput = {
      containers: [box('g', undefined, { dir: 'LR' })],
      nodes: [node('a', 'g'), node('b', 'g'), node('c', 'g')],
      edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')],
    };
    const R = layoutCompound(input);
    const pts = R.edges.get('a->c')!.points;
    expect(pts).toHaveLength(1);
    const g = R.containers.get('g')!;
    expect(holds(g, { x: pts[0]!.x, y: pts[0]!.y, w: 0, h: 0 })).toBe(true);
    expect(pts[0]!.x).toBeCloseTo(R.nodes.get('b')!.x);
    expect(R.edges.get('a->b')!.points).toEqual([]);
  });

  it('cuts a cycle of parents and ignores unknown parents', () => {
    const R = layoutCompound({ containers: [box('p', 'q'), box('q', 'p')], nodes: [node('n', 'p'), node('m', 'nowhere')], edges: [] });
    expect(R.parent.get('m')).toBe(null);
    expect([R.parent.get('p'), R.parent.get('q')].filter((x) => x === null)).toHaveLength(1);
    expect(R.containers.size).toBe(2);
  });

  it('is deterministic, with or without the cache', () => {
    const input: CompoundInput = {
      containers: [box('a', undefined, { dir: 'LR' }), box('b', 'a'), box('c')],
      nodes: Array.from({ length: 12 }, (_, i) => node(`n${i}`, i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c', { w: 40 + i * 7 })),
      edges: Array.from({ length: 14 }, (_, i) => edge(`n${i % 12}`, `n${(i * 5 + 3) % 12}`)),
    };
    const a = layoutCompound(input);
    const b = layoutCompound(input);
    const cache = new Lru<string, Map<string, Point>>(32);
    const c = layoutCompound(input, { cache });
    const d = layoutCompound(input, { cache });
    for (const x of [b, c, d]) {
      expect([...x.nodes]).toEqual([...a.nodes]);
      expect([...x.containers]).toEqual([...a.containers]);
      expect([...x.edges]).toEqual([...a.edges]);
    }
    expect(d.stats.laidOut).toBe(0);
  });

  it('asking layered for the routes changes nothing in its result', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, w: 50 + i * 3, h: 30 }));
    const edges = [{ from: 'n0', to: 'n5' }, { from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n5' }, { from: 'n5', to: 'n0' }, { from: 'n3', to: 'n7', minlen: 3 }];
    for (const dir of ['TB', 'BT', 'LR', 'RL'] as const) {
      const routes = new Map<number, Point[]>();
      expect([...layered(nodes, edges, { dir }, { routes })]).toEqual([...layered(nodes, edges, { dir })]);
      expect(routes.get(0)).toHaveLength(2);
      expect(routes.get(5)).toHaveLength(2);
      expect(routes.has(1)).toBe(false);
    }
  });
});

describe('regions (T07.2)', () => {
  const regions = (k: number, dir: 'TB' | 'LR'): { input: CompoundInput; R: CompoundResult } => {
    const nodes: CompoundNode[] = [];
    const edges: CompoundEdge[] = [];
    for (let r = 0; r < k; r++) {
      nodes.push(node(`r${r}a`, 's', { region: r }), node(`r${r}b`, 's', { region: r, w: 60 + r * 30 }));
      edges.push(edge(`r${r}a`, `r${r}b`));
    }
    edges.push(edge('r0a', `r${k - 1}b`)); // across regions: places nothing
    const input: CompoundInput = { containers: [box('s', undefined, { regions: k, dir })], nodes: [node('before'), ...nodes], edges: [...edges, edge('before', 's')] };
    return { input, R: layoutCompound(input, { regionGap: 24 }) };
  };
  for (const k of [2, 3])
    for (const dir of ['TB', 'LR'] as const)
      it(`${k} regions in ${dir}: stacked across the flow, separated by lines`, () => {
        const { input, R } = regions(k, dir);
        checkNesting(input, R);
        const s = R.containers.get('s')!;
        const lines = R.regionLines.get('s')!;
        expect(lines).toHaveLength(k - 1);
        const span = (r: number): Rect => {
          const rs = input.nodes.filter((n) => n.region === r && n.parent === 's').map((n) => nodeRect(R, n));
          const x0 = Math.min(...rs.map((q) => q.x)), y0 = Math.min(...rs.map((q) => q.y));
          return { x: x0, y: y0, w: Math.max(...rs.map((q) => q.x + q.w)) - x0, h: Math.max(...rs.map((q) => q.y + q.h)) - y0 };
        };
        for (let r = 0; r < k; r++) {
          const a = span(r);
          // within a region the flow goes the container's way
          const p = R.nodes.get(`r${r}a`)!, q = R.nodes.get(`r${r}b`)!;
          if (dir === 'TB') expect(q.y).toBeGreaterThan(p.y);
          else expect(q.x).toBeGreaterThan(p.x);
          if (r + 1 < k) {
            const b = span(r + 1), L = lines[r]!;
            if (dir === 'TB') {
              // side by side, a vertical separator between them over the body below the title
              expect(L.x1).toBe(L.x2);
              expect(a.x + a.w).toBeLessThan(L.x1);
              expect(b.x).toBeGreaterThan(L.x1);
              expect([L.y1, L.y2]).toEqual([s.y + 30, s.y + s.h]);
            } else {
              expect(L.y1).toBe(L.y2);
              expect(a.y + a.h).toBeLessThan(L.y1);
              expect(b.y).toBeGreaterThan(L.y1);
              expect([L.x1, L.x2]).toEqual([s.x, s.x + s.w]);
            }
          }
        }
      });

  it('an empty region keeps its place', () => {
    const R = layoutCompound({ containers: [box('s', undefined, { regions: 3 })], nodes: [node('a', 's', { region: 0 }), node('c', 's', { region: 2 })], edges: [] });
    const lines = R.regionLines.get('s')!;
    expect(lines).toHaveLength(2);
    expect(lines[1]!.x1 - lines[0]!.x1).toBe(40 + 24);
  });
});

describe('notes beside a node', () => {
  it('sit in the node\'s rank on their side, outside the ranking', () => {
    const input: CompoundInput = {
      containers: [],
      nodes: [node('a'), node('b'), node('noteR', undefined, { w: 60, beside: { of: 'b', side: 'right' } }), node('noteL', undefined, { w: 50, beside: { of: 'b', side: 'left' } })],
      edges: [edge('a', 'b')],
    };
    const R = layoutCompound(input, { besideGap: 16 });
    const b = R.nodes.get('b')!, r = R.nodes.get('noteR')!, l = R.nodes.get('noteL')!;
    expect(r.y).toBe(b.y);
    expect(l.y).toBe(b.y);
    expect(r.x - 30 - (b.x + 40)).toBe(16);
    expect(b.x - 40 - (l.x + 25)).toBe(16);
  });
});

describe('hand-placed items (T07 §3.3)', () => {
  it('a scope with placed contents keeps them, puts the others below them and grows around them all', () => {
    const input: CompoundInput = {
      containers: [box('g', undefined, { pad: 10 }), box('auto')],
      nodes: [node('p1', 'g', { fixed: { x: 500, y: 300 } }), node('p2', 'g', { fixed: { x: 700, y: 320 } }), node('q', 'g'), node('h', 'g', { fixed: { x: 2000, y: 2000 }, hidden: true }), node('x1', 'auto'), node('x2', 'auto'), node('free')],
      edges: [edge('x1', 'x2'), edge('free', 'p1')],
    };
    const R = layoutCompound(input, { placedGap: 60 });
    expect(R.nodes.get('p1')).toEqual({ x: 500, y: 300 });
    expect(R.auto.has('p1')).toBe(false);
    // q goes below the placed ones, left-aligned with them
    const q = R.nodes.get('q')!;
    expect(q.y - 20).toBe(340 + 60);
    expect(q.x - 40).toBe(460);
    // g is the box around its children (the hidden one left out) plus padding and the title band
    expect(R.containers.get('g')).toEqual({ x: 450, y: 280 - 30, w: 740 - 460 + 20, h: q.y + 20 - 280 + 30 + 10, dir: 'TB', auto: false });
    // the top level holds a placed scope: the auto container and the free node go below it as one block
    const a = R.containers.get('auto')!;
    expect(a.auto).toBe(true);
    expect(Math.min(a.y, R.nodes.get('free')!.y - 20)).toBe(R.containers.get('g')!.y + R.containers.get('g')!.h + 60);
    checkNesting({ ...input, nodes: input.nodes.filter((n) => n.id !== 'h') }, R);
  });

  it('a fixed frame keeps its rect and lays its contents out inside it', () => {
    const input: CompoundInput = { containers: [box('f', undefined, { pad: 10, fixed: { x: 100, y: 100, w: 400, h: 300 } })], nodes: [node('a', 'f'), node('b', 'f')], edges: [edge('a', 'b')] };
    const R = layoutCompound(input);
    expect(R.containers.get('f')).toEqual({ x: 100, y: 100, w: 400, h: 300, dir: 'TB', auto: false });
    checkNesting(input, R);
    expect(R.nodes.get('a')!.y - 20).toBe(130);
  });

  it('a container placed at a top-left lays its contents out from there', () => {
    const input: CompoundInput = { containers: [box('g', undefined, { pad: 10, at: { x: 300, y: 50 } })], nodes: [node('a', 'g'), node('b', 'g'), node('placed', undefined, { fixed: { x: 100, y: 100 } })], edges: [edge('a', 'b')] };
    const R = layoutCompound(input);
    const g = R.containers.get('g')!;
    expect([g.x, g.y]).toEqual([300, 50]);
    expect(R.nodes.get('a')).toEqual({ x: 300 + g.w / 2, y: 50 + 30 + 20 });
    expect(R.auto.has('a')).toBe(true);
  });
});

describe('per-scope cache (T07.4)', () => {
  /** 200 nodes in 10 containers (one nested), chains inside and links between them. */
  const big = (w3: number): CompoundInput => {
    const containers: CompoundContainer[] = Array.from({ length: 10 }, (_, i) => box(`c${i}`, i === 9 ? 'c8' : undefined, { dir: i % 2 ? 'LR' : 'TB' }));
    const nodes: CompoundNode[] = [];
    const edges: CompoundEdge[] = [];
    for (let i = 0; i < 200; i++) {
      nodes.push(node(`n${i}`, `c${i % 10}`, { w: i === 3 ? w3 : 60 + (i % 7) * 10 }));
      if (i >= 10) edges.push(edge(`n${i - 10}`, `n${i}`));
      if (i % 17 === 0 && i + 23 < 200) edges.push(edge(`n${i}`, `n${i + 23}`));
    }
    return { containers, nodes, edges };
  };

  it('an edit inside one container lays out that scope and its ancestors only, quickly', () => {
    const cache = new Lru<string, Map<string, Point>>(64);
    const first = layoutCompound(big(80), { cache });
    expect(first.stats.laidOut).toBe(first.stats.scopes);
    // n3 is in c3: wider, so c3 changes size and the top level is laid out again; nothing else
    const t0 = performance.now();
    const second = layoutCompound(big(140), { cache });
    const ms = performance.now() - t0;
    expect(second.stats.laidOut).toBe(2);
    // the same edit again is all cache hits
    expect(layoutCompound(big(140), { cache }).stats.laidOut).toBe(0);
    expect([...layoutCompound(big(140)).nodes]).toEqual([...second.nodes]);
    // < 5 ms on a laptop; generous here so a busy CI machine does not fail it
    expect(ms).toBeLessThan(50);
  });
});

describe('the layout cache across many scopes (P6)', () => {
  /** `n` containers in a row, three nodes each. */
  const many = (n: number): CompoundInput => {
    const containers: CompoundContainer[] = Array.from({ length: n }, (_, i) => box(`c${i}`));
    const nodes: CompoundNode[] = [];
    const edges: CompoundEdge[] = [];
    for (let i = 0; i < n * 3; i++) {
      nodes.push(node(`n${i}`, `c${Math.floor(i / 3)}`));
      if (i % 3) edges.push(edge(`n${i - 1}`, `n${i}`));
    }
    return { containers, nodes, edges };
  };

  it('a re-render of 80 subgraphs lays out no scope (the cache grows with the diagram)', () => {
    const cache = new Lru<string, Map<string, Point>>(64, 8192);
    const first = layoutCompound(many(80), { cache });
    expect(first.stats.laidOut).toBe(81);
    expect(layoutCompound(many(80), { cache }).stats.laidOut).toBe(0);
  });

  it('keys are short digests, not the layout input', () => {
    const keys: string[] = [];
    const cache = { get: () => undefined, set: (k: string) => void keys.push(k) };
    layoutCompound(many(3), { cache });
    expect(keys.length).toBe(4);
    for (const k of keys) expect(k.length).toBeLessThan(40);
  });
});
