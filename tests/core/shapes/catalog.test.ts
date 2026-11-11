// @vitest-environment jsdom
// The shape catalogue (T02): every Mermaid 11.17 flowchart shape and alias resolves, the names the catalogue calls
// Mermaid's are the ones stock Mermaid accepts (its own parser decides), each shape has a golden, connector ends lie on
// each shape's outline, and previews and lists come from the one table.
import { beforeAll, describe, expect, it } from 'vitest';
import { byShapeId, menuShapes, pickerShapes, resolveShape, shapeDef, SHAPES, shapesIn } from '../../../src/core/shapes/catalog.js';
import { EXTENDED } from '../../../src/core/shapes/extended.js';
import { registerExtendedShapes } from '../../../src/core/extras.js';
import { shapeMisses } from '../../../src/core/shapes/misses.js';
import { EXTENDED_NAMES } from '../../../src/core/shapes/names.js';
import { onOutline, outlinePoints } from '../../../src/core/shapes/outline.js';
import { forgetShapes, shapeById } from '../../../src/core/shapes/registry.js';
import { portPoint } from '../../../src/core/render/common.js';
import type { Side } from '../../../src/core/style.js';
import type { CenterBox, Point } from '../../../src/core/types.js';
import { renderProd } from '../render/helpers.js';
import { stockParse, stockRejects } from '../../helpers/mermaid.js';

// Mermaid 11.17's `shapesDefs` (rendering-util/rendering-elements/shapes.ts): shortName and aliases of every documented shape
const MERMAID: Readonly<Record<string, readonly string[]>> = {
  rect: ['proc', 'process', 'rectangle'], rounded: ['event'], stadium: ['terminal', 'pill'], 'fr-rect': ['subprocess', 'subproc', 'framed-rectangle', 'subroutine'],
  cyl: ['db', 'database', 'cylinder'], datastore: ['data-store'], folder: ['directory'], bucket: [], console: [], browser: [], person: [], circle: ['circ'],
  bang: ['bang'], cloud: ['cloud'], diam: ['decision', 'diamond', 'question'], hex: ['hexagon', 'prepare'], 'lean-r': ['lean-right', 'in-out'],
  'lean-l': ['lean-left', 'out-in'], 'trap-b': ['priority', 'trapezoid-bottom', 'trapezoid'], 'trap-t': ['manual', 'trapezoid-top', 'inv-trapezoid'],
  'dbl-circ': ['double-circle'], text: [], 'notch-rect': ['card', 'notched-rectangle'], 'lin-rect': ['lined-rectangle', 'lined-process', 'lin-proc', 'shaded-process'],
  'sm-circ': ['start', 'small-circle'], 'fr-circ': ['stop', 'framed-circle'], fork: ['join'], hourglass: ['hourglass', 'collate'], brace: ['comment', 'brace-l'],
  'brace-r': [], braces: [], bolt: ['com-link', 'lightning-bolt'], doc: ['doc', 'document'], delay: ['half-rounded-rectangle'], 'h-cyl': ['das', 'horizontal-cylinder'],
  'lin-cyl': ['disk', 'lined-cylinder'], 'curv-trap': ['curved-trapezoid', 'display'], 'div-rect': ['div-proc', 'divided-rectangle', 'divided-process'],
  tri: ['extract', 'triangle'], 'win-pane': ['internal-storage', 'window-pane'], 'f-circ': ['junction', 'filled-circle'], 'notch-pent': ['loop-limit', 'notched-pentagon'],
  'flip-tri': ['manual-file', 'flipped-triangle'], 'sl-rect': ['manual-input', 'sloped-rectangle'], docs: ['documents', 'st-doc', 'stacked-document'],
  'st-rect': ['procs', 'processes', 'stacked-rectangle'], 'bow-rect': ['stored-data', 'bow-tie-rectangle'], 'cross-circ': ['summary', 'crossed-circle'],
  'tag-doc': ['tag-doc', 'tagged-document'], 'tag-rect': ['tagged-rectangle', 'tag-proc', 'tagged-process'], flag: ['paper-tape'], odd: [], 'lin-doc': ['lined-document'],
};

describe('names', () => {
  it('has all 53 documented Mermaid shapes, each with its own entry (sm-circ, f-circ, fr-circ and lin-cyl no longer collapse)', () => {
    expect(Object.keys(MERMAID)).toHaveLength(53);
    const ids = new Set<string>();
    for (const [short, aliases] of Object.entries(MERMAID)) {
      const r = resolveShape(short);
      expect(r?.ok, short).toBe(true);
      expect(r?.names.mermaid, short).toBe(short);
      ids.add(r!.names.id);
      for (const a of aliases) expect(resolveShape(a)?.names.id, a).toBe(r!.names.id);
    }
    expect(ids.size).toBe(53);
    expect(new Set(['sm-circ', 'f-circ', 'fr-circ', 'circle'].map((n) => resolveShape(n)?.names.id)).size).toBe(4);
    expect(resolveShape('lin-cyl')?.names.id).not.toBe(resolveShape('cyl')?.names.id);
  });

  it('keeps the old mmdx ids and reads legacy names, which Mermaid rejects', () => {
    for (const [name, id] of [['parallelogram', 'parallelogram'], ['lean_r', 'parallelogram'], ['notch_rect', 'card'], ['hcyl', 'hcyl'], ['queue', 'hcyl'], ['state-start', 'sm-circ']] as const) {
      expect(resolveShape(name)?.names.id, name).toBe(id);
      expect(resolveShape(name)?.ok, name).toBe(false);
    }
    expect(resolveShape('constructor')).toBeUndefined();
    expect(resolveShape('__proto__')).toBeUndefined();
    expect(shapeDef('nope').id).toBe('rect');
  });

  it('the name table of the shapes beyond the 17 has exactly their entries, in catalogue order (T02.9)', () => {
    expect(EXTENDED_NAMES.map((n) => n.id)).toEqual(EXTENDED.map((d) => d.id));
    for (const d of EXTENDED) expect(Array.isArray(d.aliases), d.id).toBe(true);
    expect(SHAPES.slice(17)).toEqual(EXTENDED);
  });

  it('a known shape whose geometry is not loaded resolves by name and draws as a counted rectangle (T02.9)', () => {
    forgetShapes();
    try {
      const n = shapeMisses();
      expect(resolveShape('lightning-bolt')?.names.id).toBe('bolt');
      expect(shapeById('bolt')).toBeUndefined();
      expect(shapeDef('lightning-bolt').id).toBe('rect');
      expect(shapeMisses()).toBe(n + 1);
      expect(shapeDef('diam').id).toBe('diamond');
      expect(shapeDef('nope').id).toBe('rect');
      expect(shapeMisses()).toBe(n + 1);
    } finally {
      registerExtendedShapes();
    }
    expect(shapeDef('lightning-bolt').id).toBe('bolt');
  });

  it('a theme names shapes by id or any catalogue name; the id key wins', () => {
    const st = byShapeId({ cyl: { fill: 'a' }, 'lean-r': { fill: 'b' }, parallelogram: { fill: 'c' }, odd2: { fill: 'd' } })!;
    expect(st['cylinder']).toEqual({ fill: 'a' });
    expect(st['parallelogram']).toEqual({ fill: 'c' });
    expect(st['odd2']).toEqual({ fill: 'd' });
  });

  it('one table for every list: pickers by category, the Shapes menu, ids unique', () => {
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length);
    expect(pickerShapes().map((s) => s.category)).toEqual([...shapesIn('basic'), ...shapesIn('process'), ...shapesIn('technical'), ...shapesIn('annotation')].map((s) => s.category));
    expect(menuShapes().map((m) => m.label)).toEqual(['Process', 'Step', 'Start / End', 'Decision', 'Input / Output', 'Database', 'Queue', 'Document', 'Subprocess', 'Event', 'Preparation']);
    for (const cat of ['figure', 'media'] as const) expect(shapesIn(cat).length).toBeGreaterThan(0);
  });
});

describe('Mermaid agreement (mermaid.parse 12.2 and 11.17)', () => {
  let parse: (code: string) => Promise<unknown>;
  beforeAll(async () => {
    parse = stockParse;
  });

  it('accepts every name the catalogue calls Mermaid\'s, and rejects the ones it reads as legacy', async () => {
    for (const s of SHAPES) {
      for (const n of [s.mermaid, ...s.aliases].filter((x): x is string => !!x)) await expect(parse(`flowchart TD\n  A@{ shape: ${n} }`), n).resolves.toBeTruthy();
      for (const n of s.legacy ?? []) expect(await stockRejects(`flowchart TD\n  A@{ shape: ${n} }`), n).toBe(true);
    }
  });

  it('the bracket forms are Mermaid\'s', async () => {
    for (const s of SHAPES.filter((x) => x.bracket)) await expect(parse(`flowchart TD\n  A${s.bracket![0]}"x"${s.bracket![1]}`), s.id).resolves.toBeTruthy();
  });
});

describe('geometry', () => {
  // one golden per shape, through the production pipeline (light theme): size around a label, text box, drawing
  for (const s of SHAPES)
    it(`golden: ${s.id}`, () => {
      const name = s.mermaid && !s.legacy?.includes(s.id) ? s.mermaid : s.id;
      expect(renderProd(`flowchart LR\n  A@{ shape: ${name}, label: "Label" }`).svg).toMatchSnapshot();
    });

  it('draws every shape at its default size; outlines are closed and inside the box', () => {
    for (const s of SHAPES) {
      const b = { x: 100, y: 100, ...s.size };
      expect(s.draw(b, {}, {}).length, s.id).toBeGreaterThan(0);
      for (const p of outlinePoints(s, b)) {
        expect(Math.abs(p.x - b.x), s.id).toBeLessThanOrEqual(b.w / 2 + 0.01);
        expect(Math.abs(p.y - b.y), s.id).toBeLessThanOrEqual(b.h / 2 + 0.01);
      }
      const tb = s.textBox?.(b.w, b.h);
      if (tb) expect(tb.w > 0 && tb.h > 0 && Math.abs(tb.x) <= b.w / 2 + 0.01, s.id).toBe(true);
      expect(JSON.stringify(s.draw(b, {}, {})), s.id).not.toMatch(/NaN|Infinity|null/);
    }
  });
});

/** Distance from a point to a shape's outline (its polygon, or the ellipse). */
function distance(s: (typeof SHAPES)[number], b: CenterBox, p: Point): number {
  const ol = s.outline(b.w, b.h);
  if (ol === 'ellipse') return Math.abs(Math.hypot((p.x - b.x) / (b.w / 2), (p.y - b.y) / (b.h / 2)) - 1) * Math.min(b.w, b.h) / 2;
  let best = Infinity;
  for (let i = 0; i < ol.length; i++) {
    const a = { x: b.x + ol[i]!.x, y: b.y + ol[i]!.y }, c = { x: b.x + ol[(i + 1) % ol.length]!.x, y: b.y + ol[(i + 1) % ol.length]!.y };
    const dx = c.x - a.x, dy = c.y - a.y, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

describe('connector ends on the outline (T02.3)', () => {
  it('every port of every shape, moved along its side\'s normal, lies on the outline (±0.5 px)', () => {
    for (const s of SHAPES) {
      const b = { x: 300, y: 200, w: Math.max(40, s.size.w * 1.5), h: Math.max(30, s.size.h * 1.3) };
      for (const side of ['t', 'r', 'b', 'l'] as Side[])
        for (const at of [0.06, 0.2, 0.35, 0.5, 0.65, 0.8, 0.94]) {
          const port = portPoint(b, side, at);
          const p = onOutline(s, b, port);
          // a port whose normal misses the shape (a narrow figure's side) stays on the box
          if (p === port) continue;
          expect(distance(s, b, p), `${s.id} ${side} ${at}`).toBeLessThanOrEqual(0.5);
        }
    }
  });

  it('the renderer ends edges on the outlines (diamond, circle, document, stadium sides)', () => {
    const src = 'flowchart LR\n  A{"Decide"} --> B & C & D\n  B((B))\n  C@{ shape: doc, label: "Doc" }\n  D(["D"])\n  B & C & D --> E{{"E"}}';
    const { result, model } = renderProd(src);
    const geom = result.geom;
    if (geom?.type !== 'flowchart' || model.type !== 'flowchart') throw new Error('flowchart');
    for (const e of model.edges) {
      const eg = geom.edges.get(e.id)!;
      for (const [id, p] of [[e.from, eg.a], [e.to, eg.b]] as const) {
        const nb = geom.nodes.get(id)!;
        expect(distance(shapeDef(nb.shape), nb, p), `${e.id} at ${id}`).toBeLessThanOrEqual(0.5);
      }
    }
  });
});

describe('the Shapes menu list (Mermaid Chart sections)', () => {
  it('lists each catalogue shape once: a Mermaid name and all its aliases are one tile', async () => {
    const { SHAPE_MENU } = await import('../../../src/core/shapes/menu.js');
    const { shapeIdOf } = await import('../../../src/core/shapes/catalog.js');
    const ids = SHAPE_MENU.flatMap((s) => s.ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(pickerShapes().map((d) => d.id)));
    // `proc`, `process` and `rectangle` are the rect tile; every other alias its shape's
    for (const id of ids) {
      const def = shapeById(id)!;
      for (const name of [def.mermaid, ...def.aliases].filter((x): x is string => !!x)) expect(shapeIdOf(name), name).toBe(id);
    }
    expect(['proc', 'process', 'rectangle', 'rect'].map(shapeIdOf)).toEqual(['rect', 'rect', 'rect', 'rect']);
  });
});
