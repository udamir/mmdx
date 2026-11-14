// The ER renderer since T11: Mermaid's classes and styles on tables (classDef, `classDef default`, `:::`, `class`,
// `style`; a class naming a preset gives that preset), aliases drawn as markdown, a relationship to itself with both
// markers, its label and its line, the title and the SVG's `<title>` / `<desc>`; subgraphs (11.17+) laid out with the
// compound layout — tables inside their frames, sibling frames apart, relationships kept out of frames that hold
// neither end, Mermaid's direction rule, hidden subgraphs, hand-placed frames — over Mermaid's docs sample, the
// example and nested samples, and goldens of the features sample.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { polylineCrosses } from '../../../src/core/layout/route.js';
import type { ErModel } from '../../../src/core/model.js';
import type { BoxGeom, ErGeometry, RenderOptions } from '../../../src/core/render/types.js';
import type { Point, Rect } from '../../../src/core/types.js';
import { renderProd } from './helpers.js';

const ROOT = join(__dirname, '../../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

function draw(src: string, opts: RenderOptions = {}): { svg: string; geom: ErGeometry; model: ErModel; a11y: unknown } {
  const r = renderProd(src, undefined, { opts });
  if (r.result.geom.type !== 'er' || r.model.type !== 'er') throw new Error('expected an ER diagram');
  return { svg: r.svg, geom: r.result.geom, model: r.model, a11y: r.result.a11y };
}

const rect = (b: BoxGeom): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
const holds = (o: Rect, i: Rect): boolean => i.x >= o.x - 0.01 && i.y >= o.y - 0.01 && i.x + i.w <= o.x + o.w + 0.01 && i.y + i.h <= o.y + o.h + 0.01;
const shrink = (r: Rect, m: number): Rect => ({ x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: r.h - 2 * m });

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
      const pts = cmd === 'C' ? [cur, p(0), p(2), p(4)] : [cur, p(0), p(2)];
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        let q = pts.slice();
        while (q.length > 1) q = q.slice(1).map((b, i) => ({ x: q[i]!.x + (b.x - q[i]!.x) * t, y: q[i]!.y + (b.y - q[i]!.y) * t }));
        out.push(q[0]!);
      }
      cur = pts[pts.length - 1]!;
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

/** Tables inside their subgraph frames, sibling frames and tables apart, no relationship through a frame holding neither end. */
function checkLayout(model: ErModel, geom: ErGeometry, name: string): void {
  const within = (id: string, gid: string): boolean => {
    for (let p: string | null = model.entities.get(id)?.parent ?? model.groups.get(id)?.parent ?? null, n = 0; p && n < 50; p = model.groups.get(p)?.parent ?? null, n++) if (p === gid) return true;
    return false;
  };
  for (const [id, e] of model.entities) if (e.parent) expect(holds(rect(geom.groups.get(e.parent)!), rect(geom.entities.get(id)!)), `${name}: ${id} in ${e.parent}`).toBe(true);
  const siblings = [...model.entities.keys()].map((id) => ({ id, p: model.entities.get(id)!.parent, r: rect(geom.entities.get(id)!) }))
    .concat([...model.groups.values()].map((g) => ({ id: g.id, p: g.parent, r: rect(geom.groups.get(g.id)!) })));
  for (const a of siblings)
    for (const b of siblings) if (a.id < b.id && a.p === b.p) expect(overlap(a.r, b.r), `${name}: ${a.id} / ${b.id}`).toBe(false);
  for (const r of model.rels) {
    if (r.from === r.to) continue;
    const d = geom.rels.get(r.id)?.d;
    if (!d) continue;
    const line = sample(d);
    for (const [gid, gb] of geom.groups) {
      if (gid === r.from || gid === r.to || within(r.from, gid) || within(r.to, gid)) continue;
      expect(polylineCrosses(line, [shrink(rect(gb), 2)]), `${name}: ${r.id} through ${gid}`).toBe(false);
    }
  }
}

const FEATURES = `---
title: Shop model
---
erDiagram
  accTitle: Shop
  accDescr: Customers and their orders
  CUSTOMER["**Customer** *account*"]:::hot
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  ORDER |o..o| ORDER : parent
  CUSTOMER {
    string id PK
    string? middle
  }
  classDef hot fill:#fde2e2,stroke:#cc0000,color:#990000
  classDef default stroke-width:3px
  style ORDER fill:#e2f0fd
`;

describe('ER: classes, styles, aliases, loops, title (T11.4)', () => {
  it('E3: classDef, `classDef default` and `style` colour the tables; `color` their text', () => {
    const { svg } = draw(FEATURES);
    expect(svg).toMatch(/data-id="CUSTOMER"[^>]*>(?:(?!<\/g>).)*fill="#fde2e2"/s);
    expect(svg).toMatch(/data-id="ORDER"[^>]*>(?:(?!<\/g>).)*fill="#e2f0fd"/s);
    expect(svg).toMatch(/data-id="LINE-ITEM"[^>]*>(?:(?!<\/g>).)*stroke-width="3"/s);
    expect(svg).toContain('fill="#990000"');
  });

  it('a class that names a theme preset draws the table with that preset', () => {
    const preset = Object.keys(renderProd('erDiagram\n  A\n').theme.er.entityPresets ?? {})[0]!;
    const plain = renderProd('erDiagram\n  B:::nosuch\n');
    const r = renderProd(`erDiagram\n  B:::${preset}\n`);
    expect(r.result.presetsUsed.entity).toEqual(new Map([[preset, 1]]));
    expect(plain.result.presetsUsed.entity).toEqual(new Map([['(none)', 1]]));
    // the same as the preset given in metadata
    expect(r.svg).toBe(renderProd(`erDiagram\n  B:::nosuch\n%%@ entity B {"preset":"${preset}"}`).svg);
  });

  it('E10: an alias is drawn as markdown (bold and italic runs)', () => {
    const { svg } = draw(FEATURES);
    expect(svg).toMatch(/font-weight="700"[^>]*>Customer/);
    expect(svg).toMatch(/font-style="italic"[^>]*>account/);
    expect(svg).not.toContain('**Customer**');
  });

  it('E5: a relationship to itself: a loop with both markers, its label and its dash', () => {
    const { svg, geom } = draw(FEATURES);
    const loop = geom.rels.get('ORDER--ORDER')!;
    expect(loop.a.n).toEqual({ x: 1, y: 0 });
    expect(loop.label).toBeTruthy();
    const g = /<g class="el rel"[^>]*data-id="ORDER--ORDER"[^>]*>(.*?)<\/g>/s.exec(svg)![1]!;
    expect(g).toContain('stroke-dasharray');
    expect((g.match(/<circle/g) ?? []).length).toBe(2);
    expect(svg).toMatch(/>parent</);
    // left to right: the loop hangs below the table
    expect(draw(FEATURES.replace('erDiagram\n', 'erDiagram\n  direction LR\n')).geom.rels.get('ORDER--ORDER')!.a.n).toEqual({ x: 0, y: 1 });
  });

  it('E4 / E9: the title is drawn above; accTitle and accDescr are the SVG title and description', () => {
    const { svg, a11y } = draw(FEATURES);
    expect(svg).toMatch(/class="title"[^>]*>.*Shop model/s);
    expect(a11y).toEqual({ title: 'Shop', desc: 'Customers and their orders' });
    expect(svg).toContain('<title>Shop</title>');
  });

  it('golden', () => {
    expect(draw(FEATURES).svg).toMatchSnapshot();
  });
});

const NESTED = `erDiagram
  subgraph Outer [Outer group]
    A ||--o{ B : ab
    subgraph Inner
      C ||--|| D : cd
    end
    B ||--o{ C : bc
  end
  subgraph Side
    E
  end
  E ||--o{ A : ea
  F ||--|| D : fd
  F ||--o{ Outer : fo
`;

describe('ER: subgraphs (T11.6)', () => {
  const samples = [
    ['er-subgraph.mmd', read('tests/fixtures/mermaid-docs/er-subgraph.mmd')],
    ['shop-domains-er.mmdx', read('examples/shop-domains-er.mmdx')],
    ['nested', NESTED],
    ...(['LR', 'BT', 'RL'] as const).map((d) => [`nested ${d}`, NESTED.replace('erDiagram\n', `erDiagram\n  direction ${d}\n`)]),
  ] as const;
  for (const [name, src] of samples)
    it(`tables in their frames, frames apart, no relationship through a frame: ${name}`, () => {
      const { model, geom } = draw(src);
      expect(model.groups.size).toBeGreaterThan(0);
      checkLayout(model, geom, name);
    });

  it("a subgraph's direction is honoured unless a relationship from outside reaches a table inside (Mermaid's rule)", () => {
    const src = 'erDiagram\n  subgraph S\n    direction LR\n    A ||--o{ B : x\n  end\n';
    const g = draw(src).geom;
    expect(Math.abs(g.entities.get('A')!.y - g.entities.get('B')!.y)).toBeLessThan(1);
    const crossed = draw(`${src}  C ||--o{ A : y\n`).geom;
    expect(Math.abs(crossed.entities.get('A')!.x - crossed.entities.get('B')!.x)).toBeLessThan(1);
  });

  it('a relationship to a subgraph ends on its frame', () => {
    const { geom } = draw(NESTED);
    const r = geom.rels.get('F--Outer')!, o = rect(geom.groups.get('Outer')!);
    const onFrame = Math.abs(r.b.x - o.x) < 1 || Math.abs(r.b.x - o.x - o.w) < 1 || Math.abs(r.b.y - o.y) < 1 || Math.abs(r.b.y - o.y - o.h) < 1;
    expect(onFrame).toBe(true);
  });

  it('a hidden subgraph hides what is in it and its relationships', () => {
    const { geom, svg } = draw(NESTED, { hidden: { group: new Set(['Outer']) } });
    expect(geom.groups.get('Inner')!.hidden).toBe(true);
    expect(geom.entities.get('C')!.hidden).toBe(true);
    expect(geom.rels.has('F--D')).toBe(false);
    expect(svg).not.toContain('data-id="Inner"');
  });

  it('hand-placed tables and frames keep their places; the rest is laid out around them', () => {
    const src = `${NESTED}%%@ entity E {"x":900,"y":60}\n%%@ group Side {"x":780,"y":0,"w":260,"h":120}\n`;
    const { geom, model } = draw(src);
    expect(geom.entities.get('E')).toMatchObject({ x: 900, y: 60 });
    expect(geom.groups.get('Side')).toMatchObject({ x: 910, y: 60, w: 260, h: 120, fixed: true });
    expect(geom.entities.get('A')!.auto).toBe(true);
    checkLayout(model, geom, 'placed');
  });

  it('subgraph titles are drawn; presets of the flowchart groups apply', () => {
    const { svg } = draw(NESTED);
    expect(svg).toContain('>Outer group<');
    expect(svg).toMatch(/class="el group"[^>]*data-id="Outer"/);
  });
});
