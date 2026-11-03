// Flowchart subgraphs on the compound layout (T07.3, T07.5): no overlaps over every example (laid out again without its
// positions) and the Mermaid docs' subgraph samples, no connector through a subgraph that holds neither end, subgraph
// `direction` as Mermaid honours it, connectors to a subgraph ending on its frame, the mixed manual / auto rules, and
// files with positions drawn as before.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { polylineCrosses } from '../../../src/core/layout/route.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import type { FlowchartModel } from '../../../src/core/model.js';
import { resetLayout } from '../../../src/core/ops/meta-ops.js';
import { parse } from '../../../src/core/parse/index.js';
import { render, renderSvgString } from '../../../src/core/render/index.js';
import type { BoxGeom, FlowGeometry } from '../../../src/core/render/types.js';
import type { Point, Rect } from '../../../src/core/types.js';
import { EXAMPLES, makeCtx, registry } from './helpers.js';

const FIXTURES = join(__dirname, '../../fixtures');
const DOCS = readdirSync(join(FIXTURES, 'mermaid-docs'))
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((name) => ({ name, src: readFileSync(join(FIXTURES, 'mermaid-docs', name), 'utf8') }));
const WHITEBOARD = { name: 'whiteboard.mmd', src: readFileSync(join(FIXTURES, 'mermaid-chart/whiteboard.mmd'), 'utf8') };
const FLOWCHARTS = EXAMPLES.filter((ex) => /^(?:---[\s\S]*?---\s*)?flowchart/m.test(ex.src) || /^\s*flowchart/m.test(ex.src));

const NESTED = `flowchart LR
  start --> outer
  subgraph outer [Outer]
    direction TB
    subgraph mid [Middle]
      subgraph deep [Deep]
        d1 --> d2
      end
      m1
    end
    o1 --> o2
  end
  subgraph side [Side]
    s1 --> s2
  end
  start --> s1
  d2 --> s2
  o2 --> finish
  start --> finish
  m1 -.-> d1`;

function renderMeta(src: string, edit?: (meta: DiagramMeta) => DiagramMeta, themeId = 'default-light'): { model: FlowchartModel; geom: FlowGeometry; svg: string } {
  const { doc } = splitSource(src);
  const meta = edit ? edit(doc.meta) : doc.meta;
  const model = parse(doc.code) as FlowchartModel;
  const T = registry.get(themeId);
  const ctx = makeCtx(T, meta);
  const result = render(model, meta, T, ctx, {});
  if (result.geom.type !== 'flowchart') throw new Error('expected a flowchart');
  return { model, geom: result.geom, svg: renderSvgString(result, ctx) };
}

const rect = (b: BoxGeom): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const holds = (o: Rect, i: Rect): boolean => i.x >= o.x - 0.01 && i.y >= o.y - 0.01 && i.x + i.w <= o.x + o.w + 0.01 && i.y + i.h <= o.y + o.h + 0.01;

/** Points along a path the renderer wrote (M, L, C and Q commands). */
function sample(d: string): Point[] {
  const out: Point[] = [];
  const tokens = d.match(/[MLCQ]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
  let cmd = '', cur: Point = { x: 0, y: 0 };
  const nums: number[] = [];
  const flush = (): void => {
    const p = (i: number): Point => ({ x: nums[i]!, y: nums[i + 1]! });
    if (cmd === 'M' || cmd === 'L') {
      cur = p(0);
      out.push(cur);
    } else if (cmd === 'C' || cmd === 'Q') {
      const c = cmd === 'C' ? [cur, p(0), p(2), p(4)] : [cur, p(0), p(2)];
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        let pts = c;
        while (pts.length > 1) pts = pts.slice(1).map((q, i) => ({ x: pts[i]!.x + (q.x - pts[i]!.x) * t, y: pts[i]!.y + (q.y - pts[i]!.y) * t }));
        out.push(pts[0]!);
      }
      cur = c[c.length - 1]!;
    }
    nums.length = 0;
  };
  for (const t of tokens) {
    if (/^[MLCQ]$/.test(t)) {
      if (cmd) flush();
      cmd = t;
    } else nums.push(Number(t));
  }
  if (cmd) flush();
  return out;
}

const holdersOf = (model: FlowchartModel, id: string): Set<string> => {
  const out = new Set<string>();
  if (model.groups.has(id)) out.add(id);
  for (let p = model.nodes.get(id)?.parent ?? model.groups.get(id)?.parent ?? null; p && !out.has(p); p = model.groups.get(p)?.parent ?? null) out.add(p);
  return out;
};

/** The no-overlap property: siblings apart, children inside their subgraph. */
function checkNoOverlap(name: string, model: FlowchartModel, geom: FlowGeometry): void {
  const shown = (b: BoxGeom | undefined): b is BoxGeom => !!b && !b.hidden;
  const scopes = new Map<string | null, Rect[]>();
  const add = (parent: string | null, r: Rect): void => void scopes.set(parent, [...(scopes.get(parent) ?? []), r]);
  for (const n of model.nodes.values()) {
    const b = geom.nodes.get(n.id);
    if (!shown(b)) continue;
    add(n.parent, rect(b));
    const pg = n.parent ? geom.groups.get(n.parent) : undefined;
    if (shown(pg)) expect(holds(rect(pg), rect(b)), `${name}: ${n.id} inside ${n.parent}`).toBe(true);
  }
  for (const g of model.groups.values()) {
    const b = geom.groups.get(g.id);
    if (!shown(b)) continue;
    add(g.parent, rect(b));
    const pg = g.parent ? geom.groups.get(g.parent) : undefined;
    if (shown(pg)) expect(holds(rect(pg), rect(b)), `${name}: ${g.id} inside ${g.parent}`).toBe(true);
  }
  for (const [scope, rs] of scopes)
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]!, rs[j]!), `${name}: overlap in ${scope ?? 'the top level'}`).toBe(false);
}

/** No connector between auto-placed ends crosses a subgraph that holds neither end. */
function checkNoCrossing(name: string, model: FlowchartModel, geom: FlowGeometry): number {
  let checked = 0;
  for (const e of model.edges) {
    const eg = geom.edges.get(e.id);
    if (!eg) continue;
    const skip = new Set([...holdersOf(model, e.from), ...holdersOf(model, e.to)]);
    const frames = [...geom.groups].filter(([id, b]) => !b.hidden && !skip.has(id)).map(([, b]) => rect(b));
    expect(polylineCrosses(sample(eg.d), frames), `${name}: ${e.id} crosses a subgraph`).toBe(false);
    checked++;
  }
  return checked;
}

const strip = (meta: DiagramMeta): DiagramMeta => resetLayout(meta).meta;

describe('compound layout of flowchart subgraphs', () => {
  const cases = [
    ...FLOWCHARTS.map((ex) => ({ name: `${ex.name} (positions removed)`, src: ex.src, edit: strip })),
    { ...WHITEBOARD, edit: undefined },
    ...DOCS.map((d) => ({ ...d, edit: undefined })),
    { name: 'nested', src: NESTED, edit: undefined },
    { name: 'nested LR → TB', src: NESTED.replace('flowchart LR', 'flowchart TB'), edit: undefined },
    { name: 'nested BT', src: NESTED.replace('flowchart LR', 'flowchart BT'), edit: undefined },
    { name: 'nested RL', src: NESTED.replace('flowchart LR', 'flowchart RL'), edit: undefined },
  ];
  for (const c of cases)
    it(`no overlap and no connector through another subgraph: ${c.name}`, () => {
      const { model, geom } = renderMeta(c.src, c.edit);
      expect(model.groups.size).toBeGreaterThan(0);
      checkNoOverlap(c.name, model, geom);
      expect(checkNoCrossing(c.name, model, geom)).toBeGreaterThan(0);
    });

  it('honours a subgraph direction as Mermaid does (not when a link from outside reaches inside)', () => {
    const doc = (n: string): string => DOCS.find((d) => d.name === n)!.src;
    let { geom } = renderMeta(doc('subgraph-direction.mmd'));
    const P = (id: string): BoxGeom => geom.nodes.get(id)!;
    expect(P('f1').x).toBeLessThan(P('i1').x); // RL
    expect(P('f1').y).toBeCloseTo(P('i1').y);
    expect(P('f2').y).toBeLessThan(P('i2').y); // BT
    // TOP is TB: B1 above B2
    expect(geom.groups.get('B1')!.y).toBeLessThan(geom.groups.get('B2')!.y);
    ({ geom } = renderMeta(doc('subgraph-direction-limitation.mmd')));
    expect(P('bottom1').y).toBeGreaterThan(P('top1').y); // a link to subgraph1 itself: TB kept
    expect(P('bottom1').x).toBeCloseTo(P('top1').x);
    expect(P('bottom2').x).toBeGreaterThan(P('top2').x); // a link to top2: LR from the top level
    expect(P('bottom2').y).toBeCloseTo(P('top2').y);
  });

  it('ends a connector to a subgraph on its frame', () => {
    const { geom } = renderMeta(WHITEBOARD.src);
    const s1 = rect(geom.groups.get('s1')!), s2 = rect(geom.groups.get('s2')!);
    const onBorder = (p: Point, r: Rect): boolean =>
      (Math.abs(p.x - r.x) < 0.5 || Math.abs(p.x - r.x - r.w) < 0.5 || Math.abs(p.y - r.y) < 0.5 || Math.abs(p.y - r.y - r.h) < 0.5) && holds({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, { ...p, w: 0, h: 0 });
    const from = [...geom.edges].find(([id]) => id.startsWith('s1->'))![1];
    const to = [...geom.edges].find(([id]) => id.endsWith('->s2'))![1];
    expect(onBorder(from.a, s1)).toBe(true);
    expect(onBorder(to.b, s2)).toBe(true);
  });

  it('draws files whose nodes all have positions as before', () => {
    const placed = FLOWCHARTS.filter((ex) => {
      const { doc } = splitSource(ex.src);
      const model = parse(doc.code) as FlowchartModel;
      return model.groups.size && [...model.nodes.keys()].every((id) => typeof doc.meta.nodes?.[id]?.x === 'number');
    });
    expect(placed.length).toBeGreaterThanOrEqual(3);
    for (const ex of placed) {
      const legacy = renderMeta(ex.src, (m) => ({ ...m, canvas: { ...m.canvas, layout: 'legacy' } })).svg;
      expect(renderMeta(ex.src).svg, ex.name).toBe(legacy);
    }
  });

  it('keeps hand-placed nodes and lays the others out per subgraph, below them', () => {
    const src = `flowchart TB
  subgraph g [Group]
    a --> b
    c
  end
  subgraph h [Auto]
    x --> y
  end
  out --> a
%%@ node a {"x":400,"y":300}
%%@ node b {"x":400,"y":420}`;
    const { geom } = renderMeta(src);
    const N = (id: string): BoxGeom & { auto?: boolean } => geom.nodes.get(id)!;
    expect([N('a').x, N('a').y]).toEqual([400, 300]);
    expect(N('a').auto).toBeUndefined();
    // c goes below the placed a and b inside g, which grows around all three
    expect(N('c').y - N('c').h / 2).toBe(420 + N('b').h / 2 + 60);
    expect(N('c').auto).toBe(true);
    const g = rect(geom.groups.get('g')!);
    for (const id of ['a', 'b', 'c']) expect(holds(g, rect(N(id)))).toBe(true);
    // h is laid out as a unit and goes, with `out`, below the placed contents of the top level
    const h = rect(geom.groups.get('h')!);
    expect(h.y).toBeGreaterThanOrEqual(g.y + g.h + 60 - 0.01);
    expect(holds(h, rect(N('x'))) && holds(h, rect(N('y')))).toBe(true);
    expect(N('y').y).toBeGreaterThan(N('x').y);
  });

  it('keeps a group where it was after "Reset positions in this group" (x / y without a size)', () => {
    const src = `flowchart LR
  subgraph g [Group]
    a --> b
  end
  c
%%@ node c {"x":100,"y":100}
%%@ group g {"x":300,"y":200}`;
    const { geom } = renderMeta(src);
    const g = rect(geom.groups.get('g')!);
    expect([g.x, g.y]).toEqual([300, 200]);
    expect(geom.nodes.get('b')!.x).toBeGreaterThan(geom.nodes.get('a')!.x);
    expect((geom.nodes.get('a') as BoxGeom & { auto?: boolean }).auto).toBe(true);
  });

  it('routes a connector around a subgraph in its way', () => {
    const src = `flowchart LR
  a --> b
  subgraph mid [In the way]
    m1
    m2
    m3
  end
  a --> m1
  m1 --> c
  a --> c
  b --> c`;
    const { model, geom } = renderMeta(src);
    checkNoCrossing('around', model, geom);
    checkNoOverlap('around', model, geom);
  });
});
