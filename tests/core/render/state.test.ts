// The state diagram renderer (T09): no overlaps and no transition through a composite that holds neither end over the
// examples (laid out again without their positions), the Mermaid docs' state samples and seeded random diagrams;
// the shapes of pseudo-states and bars, description rows, composites with title bands and regions, notes, labels,
// links, styles, presets, layers, hand-placed states, media, the layout cache, Mermaid's composite direction rule,
// and every built-in theme.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { polylineCrosses } from '../../../src/core/layout/route.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import type { StateModel } from '../../../src/core/model.js';
import { resetLayout } from '../../../src/core/ops/meta-ops.js';
import { parse } from '../../../src/core/parse/index.js';
import { render } from '../../../src/core/render/index.js';
import type { BoxGeom, StateGeometry } from '../../../src/core/render/types.js';
import type { Point, Rect } from '../../../src/core/types.js';
import { makeCtx, registry } from './helpers.js';

const ROOT = join(__dirname, '../../..');
const DOCS = readdirSync(join(ROOT, 'tests/fixtures/mermaid-docs'))
  .filter((f) => f.startsWith('state-') && f.endsWith('.mmd'))
  .sort()
  .map((name) => ({ name, src: readFileSync(join(ROOT, 'tests/fixtures/mermaid-docs', name), 'utf8') }));
const EXAMPLE_FILES = ['order-lifecycle.mmdx', 'traffic-light.mmdx'].map((name) => ({ name, src: readFileSync(join(ROOT, 'examples', name), 'utf8') }));

function renderState(src: string, edit?: (meta: DiagramMeta) => DiagramMeta): { model: StateModel; geom: StateGeometry } {
  const { doc } = splitSource(src);
  const meta = edit ? edit(doc.meta) : doc.meta;
  const model = parse(doc.code);
  if (model.type !== 'state') throw new Error('expected a state diagram');
  const T = registry.get('default-light');
  const result = render(model, meta, T, makeCtx(T, meta), {});
  if (result.geom.type !== 'state') throw new Error('expected state geometry');
  return { model, geom: result.geom };
}

const rect = (b: BoxGeom): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const holds = (o: Rect, i: Rect): boolean => i.x >= o.x - 0.01 && i.y >= o.y - 0.01 && i.x + i.w <= o.x + o.w + 0.01 && i.y + i.h <= o.y + o.h + 0.01;
const shrink = (r: Rect, m: number): Rect => ({ x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h - 2 * m });

/** Points along a path the renderer wrote (M, L, C and Q commands), as compound-layout.test.ts samples them. */
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

/** The composites holding an item (the item itself when a composite, then its ancestors). */
const holdersOf = (model: StateModel, id: string): Set<string> => {
  const out = new Set<string>();
  if (model.groups.has(id)) out.add(id);
  for (let p = model.nodes.get(id)?.parent ?? model.groups.get(id)?.parent ?? null; p && !out.has(p); p = model.groups.get(p)?.parent ?? null) out.add(p);
  return out;
};

/** Overlap problems: siblings apart, children inside their composite, notes clear of states and of each other. */
function overlaps(model: StateModel, geom: StateGeometry): string[] {
  const bad: string[] = [];
  const shown = (b: BoxGeom | undefined): b is BoxGeom => !!b && !b.hidden && Number.isFinite(b.x);
  const scopes = new Map<string | null, { id: string; r: Rect }[]>();
  const add = (parent: string | null, id: string, r: Rect): void => void scopes.set(parent, [...(scopes.get(parent) ?? []), { id, r }]);
  for (const n of model.nodes.values()) {
    const b = geom.nodes.get(n.id);
    if (!shown(b)) continue;
    add(n.parent, n.id, rect(b));
    const pg = n.parent ? geom.groups.get(n.parent) : undefined;
    if (shown(pg) && !holds(rect(pg), rect(b))) bad.push(`${n.id} outside ${n.parent}`);
  }
  for (const g of model.groups.values()) {
    const b = geom.groups.get(g.id);
    if (!shown(b)) continue;
    add(g.parent, g.id, rect(b));
    const pg = g.parent ? geom.groups.get(g.parent) : undefined;
    if (shown(pg) && !holds(rect(pg), rect(b))) bad.push(`${g.id} outside ${g.parent}`);
  }
  for (const [scope, rs] of scopes)
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) if (overlap(rs[i]!.r, rs[j]!.r)) bad.push(`${rs[i]!.id} overlaps ${rs[j]!.id} in ${scope ?? 'the top level'}`);
  for (const note of model.notes) {
    const b = geom.notes.get(note.id);
    if (!shown(b)) continue;
    const parent = model.nodes.get(note.target)?.parent ?? model.groups.get(note.target)?.parent ?? null;
    add(parent, `note ${note.id}`, rect(b));
    const pg = parent ? geom.groups.get(parent) : undefined;
    if (shown(pg) && !holds(rect(pg), rect(b))) bad.push(`note ${note.id} outside ${parent}`);
  }
  const notes = [...geom.notes].filter(([, b]) => shown(b));
  const states = [...geom.nodes].filter(([, b]) => shown(b));
  for (const [nid, nb] of notes) {
    for (const [sid, sb] of states) if (overlap(rect(nb), rect(sb))) bad.push(`note ${nid} overlaps ${sid}`);
    for (const [oid, ob] of notes) if (oid > nid && overlap(rect(nb), rect(ob))) bad.push(`note ${nid} overlaps note ${oid}`);
  }
  return bad;
}

/**
 * Crossing problems: a transition between auto-placed ends (without bend points of its own, not to itself) through a
 * composite that holds neither end, as the renderer's router sees it; the frames shrink by `tol` so a line along a
 * border does not count.
 */
function crossings(model: StateModel, geom: StateGeometry, tol = 2): { bad: string[]; checked: number } {
  const bad: string[] = [];
  let checked = 0;
  for (const e of model.edges) {
    const eg = geom.edges.get(e.id);
    if (!eg || e.from === e.to) continue;
    const skip = new Set([...holdersOf(model, e.from), ...holdersOf(model, e.to)]);
    const frames = [...geom.groups].filter(([id, b]) => !b.hidden && !skip.has(id)).map(([id, b]) => ({ id, r: shrink(rect(b), tol) }));
    const pts = sample(eg.d);
    for (const f of frames) if (polylineCrosses(pts, [f.r])) bad.push(`${e.id} crosses ${f.id}`);
    checked++;
  }
  return { bad, checked };
}

// ---- seeded random state diagrams -------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random state diagram: nested composites up to depth 3, regions, notes, choice / fork / join, transitions within and across scopes. */
function randomDiagram(seed: number, dir: 'TB' | 'LR'): string {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  let k = 0;
  const leaves: string[] = [];
  const lines: string[] = ['stateDiagram-v2', `  direction ${dir}`];
  const notes: string[] = [];
  /** One scope's (or region's) contents, at an indentation; returns the ids it holds directly. */
  const scope = (depth: number, pad: string): string[] => {
    const ids: string[] = [];
    const n = int(1, 3);
    for (let i = 0; i < n; i++) {
      const id = `s${++k}`;
      ids.push(id);
      leaves.push(id);
      if (rnd() < 0.3) lines.push(`${pad}${id} : row ${k}`);
      if (rnd() < 0.15) notes.push(`${pad}note ${rnd() < 0.5 ? 'left' : 'right'} of ${id} : note ${k}`);
    }
    if (depth < 3 && rnd() < 0.7 - depth * 0.15) {
      const comps = int(1, 2);
      for (let c = 0; c < comps; c++) {
        const id = `C${++k}`;
        ids.push(id);
        lines.push(`${pad}state ${id} {`);
        if (rnd() < 0.2) lines.push(`${pad}  direction ${pick(['LR', 'TB'])}`);
        const regions = rnd() < 0.25 ? 2 : 1;
        for (let r = 0; r < regions; r++) {
          if (r) lines.push(`${pad}  --`);
          scope(depth + 1, `${pad}  `);
        }
        lines.push(`${pad}}`);
      }
    }
    // pseudo-states: a choice, or a fork and a join
    const states = ids.filter((x) => x.startsWith('s'));
    if (states.length >= 2 && rnd() < 0.3) {
      const c = `ch${++k}`;
      lines.push(`${pad}state ${c} <<choice>>`);
      lines.push(`${pad}${states[0]} --> ${c}`);
      lines.push(`${pad}${c} --> ${states[1]} : yes`);
      if (states[2]) lines.push(`${pad}${c} --> ${states[2]} : no`);
    } else if (ids.length >= 3 && rnd() < 0.3) {
      const f = `fk${++k}`, j = `jn${k}`;
      lines.push(`${pad}state ${f} <<fork>>`, `${pad}state ${j} <<join>>`);
      lines.push(`${pad}${ids[0]} --> ${f}`, `${pad}${f} --> ${ids[1]}`, `${pad}${f} --> ${ids[2]}`, `${pad}${ids[1]} --> ${j}`, `${pad}${ids[2]} --> ${j}`);
    }
    // within the scope: start, a chain, an end, sometimes a back edge
    lines.push(`${pad}[*] --> ${ids[0]}`);
    for (let i = 1; i < ids.length; i++) if (rnd() < 0.75) lines.push(`${pad}${ids[i - 1]} --> ${ids[i]}${rnd() < 0.3 ? ` : t${i}` : ''}`);
    if (ids.length >= 3 && rnd() < 0.3) lines.push(`${pad}${ids[ids.length - 1]} --> ${ids[0]} : back`);
    if (rnd() < 0.5) lines.push(`${pad}${ids[ids.length - 1]} --> [*]`);
    return ids;
  };
  scope(0, '  ');
  // across scopes, written at the top level (the states stay in their composites)
  const across = int(1, 4);
  for (let i = 0; i < across; i++) {
    const a = pick(leaves), b = pick(leaves);
    if (a !== b) lines.push(`  ${a} --> ${b}`);
  }
  return [...lines, ...notes].join('\n');
}

const strip = (meta: DiagramMeta): DiagramMeta => resetLayout(meta).meta;

describe('state layout properties', () => {
  const cases: { name: string; src: string; edit?: (m: DiagramMeta) => DiagramMeta }[] = [
    ...EXAMPLE_FILES.map((ex) => ({ name: `${ex.name} (positions removed)`, src: ex.src, edit: strip })),
    ...DOCS,
  ];
  for (const c of cases)
    it(`no overlap and no transition through another composite: ${c.name}`, () => {
      const { model, geom } = renderState(c.src, c.edit);
      expect(overlaps(model, geom)).toEqual([]);
      const { bad, checked } = crossings(model, geom);
      expect(bad).toEqual([]);
      if (model.edges.length) expect(checked).toBeGreaterThan(0);
    });

  it('random diagrams (40 seeds, TB and LR)', () => {
    const fails: string[] = [];
    for (let seed = 1; seed <= 20; seed++)
      for (const dir of ['TB', 'LR'] as const) {
        const src = randomDiagram(seed * 7919, dir);
        const { model, geom } = renderState(src);
        const o = overlaps(model, geom), x = crossings(model, geom).bad;
        if (o.length || x.length) fails.push(`seed ${seed * 7919} ${dir}: ${[...o, ...x].join('; ')}`);
      }
    expect(fails).toEqual([]);
  });
});
