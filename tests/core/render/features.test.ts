// Scene structure and production-only behaviour: item groups and keys, layers, sequence title, activation ids,
// page and export, layout cache.
import { describe, expect, it } from 'vitest';
import { activationsOf, parseActivationId } from '../../../src/core/ids.js';
import { splitSource } from '../../../src/core/meta/index.js';
import { parse } from '../../../src/core/parse/index.js';
import { exportScene, pageScene, renderSvgString } from '../../../src/core/render/index.js';
import { walk } from '../../../src/core/scene/build.js';
import type { SceneNode } from '../../../src/core/scene/types.js';
import { Lru } from '../../../src/core/text/measure.js';
import type { Point } from '../../../src/core/types.js';
import { itemKey, parseItemKey } from '../../../src/core/types.js';
import { EXAMPLES, renderProd } from './helpers.js';

const children = (n: SceneNode): SceneNode[] => (n.t === 'g' || n.t === 'a' || n.t === 'marker' || n.t === 'pattern' || n.t === 'clipPath' ? n.children : []);

describe('scene structure', () => {
  it('every item is a keyed group with item ref and data attributes; sibling keys are unique; no selection state', () => {
    for (const ex of EXAMPLES) {
      const { result, svg } = renderProd(`${ex.src}\n%%@ canvas {"mirror":true}`);
      const check = (list: SceneNode[]): void => {
        const keys = list.map((n) => n.key).filter((k): k is string => k !== undefined);
        expect(new Set(keys).size, ex.name).toBe(keys.length);
        for (const n of list) check(children(n));
      };
      check(result.body);
      let items = 0;
      for (const n of result.body)
        walk(n, (x) => {
          if (x.t !== 'g' || !x.item) return;
          items++;
          expect(x.attrs['data-kind']).toBe(x.item.kind);
          expect(x.attrs['data-id']).toBe(x.item.id);
          expect(String(x.attrs['class'])).toMatch(/^el /);
          const k = x.key!;
          const ref = parseItemKey(k);
          if (ref) expect(k).toBe(itemKey(x.item)); // `label:edge:…`, `foot:participant:…` are part keys
          else expect(k).toMatch(/^(label|foot):/);
        });
      expect(items).toBeGreaterThan(3);
      expect(svg).not.toMatch(/class="[^"]*\bselected\b/);
    }
  });

  it('z-order: groups, edges, nodes, labels', () => {
    const { result } = renderProd('flowchart LR\n  subgraph G\n    A -->|x| B\n  end');
    const kinds = result.body.map((n) => (n.t === 'g' ? `${String(n.attrs['class'])}` : n.t));
    expect(kinds).toEqual(['el group', 'el edge', 'el node', 'el node', 'el elabel']);
  });

  it('mirrored participants carry data-foot', () => {
    const { svg, result } = renderProd('sequenceDiagram\n  A->>B: hi\n%%@ canvas {"mirror":true}');
    expect(svg.match(/data-foot="1"/g)?.length).toBe(2);
    expect(result.geom.type === 'sequence' && result.geom.participantFeet.size).toBe(2);
  });
});

describe('sequence', () => {
  it('renders the title above the participants (A.13)', () => {
    const plain = renderProd('sequenceDiagram\n  A->>B: hi').result;
    const titled = renderProd('sequenceDiagram\n  title Order <flow>\n  A->>B: hi');
    expect(titled.svg).toContain('Order &lt;flow&gt;</tspan>');
    const a = plain.contentBounds, b = titled.result.contentBounds;
    expect(b.y).toBeLessThan(a.y);
    expect(b.y + b.h).toBeCloseTo(a.y + a.h, 5);
  });

  // activate / deactivate lines, +/- markers, nesting and blocks
  const ACT_SEQ = `sequenceDiagram
  participant Browser
  participant API
  participant Queue
  participant Worker
  participant DB
  opt Browser: on load
    activate Browser
    Browser->>+API: GET /cart (id)
    API->>+DB: read cart (id)
    DB->>-API: cart
    API->>+Queue: last revision (id)
    Queue->>-API: revision
    API->>-Browser: cart, revision
    deactivate Browser
  end
  opt Browser: on change
    activate Browser
    Browser->>+API: update (msgId, delta)
    API->>+Queue: push pending (id, msgId, delta)
    deactivate Queue
    API->>-Browser: ok (msgId)
    deactivate Browser
  end
  opt API: handle pending
    activate API
    API->>+Queue: take pending
    Queue->>-API: id, msgId, delta
    API->>+Worker: apply delta
    Worker->>Worker: validate and apply
    Worker->>-API: result
    API->>+DB: save cart
    deactivate DB
    API->>Browser: cart updated (revision)
    deactivate API
  end
`;

  it('activation ids come from core/ids: per participant, in closing order, from +/- markers and activate lines', () => {
    const ex = { src: ACT_SEQ };
    const code = splitSource(ex.src).doc.code;
    const model = parse(code);
    if (model.type !== 'sequence') throw new Error('expected a sequence');
    const mine = activationsOf(model);
    const end = (e: unknown): unknown => {
      if (!e) return null;
      const { type, src, msg } = e as { type: string; src: number; msg?: string };
      return msg === undefined ? { type, src } : { type, src, msg };
    };
    const plus = (src: number, msg: string): unknown => ({ type: '+', src, msg });
    const minus = (src: number, msg: string): unknown => ({ type: '-', src, msg });
    const line = (src: number): unknown => ({ type: 'line', src });
    expect(mine.map((a) => [a.id, a.participant, end(a.start), end(a.end)])).toEqual([
      ['DB:1', 'DB', plus(9, 'm2'), minus(10, 'm3')],
      ['Queue:1', 'Queue', plus(11, 'm4'), minus(12, 'm5')],
      ['API:1', 'API', plus(8, 'm1'), minus(13, 'm6')],
      ['Browser:1', 'Browser', line(7), line(14)],
      ['Queue:2', 'Queue', plus(19, 'm8'), line(20)],
      ['API:2', 'API', plus(18, 'm7'), minus(21, 'm9')],
      ['Browser:2', 'Browser', line(17), line(22)],
      ['Queue:3', 'Queue', plus(26, 'm10'), minus(27, 'm11')],
      ['Worker:1', 'Worker', plus(28, 'm12'), minus(30, 'm14')],
      ['DB:2', 'DB', plus(31, 'm15'), line(32)],
      ['API:3', 'API', line(25), line(34)],
    ]);
    const { result } = renderProd(ex.src);
    if (result.geom.type !== 'sequence') throw new Error('expected sequence geometry');
    expect(new Set(result.geom.activations.keys())).toEqual(new Set(mine.map((a) => a.id)));
    for (const [id, a] of result.geom.activations) expect(parseActivationId(id)?.participant).toBe(a.participant);
    const started = mine.find((a) => a.start.msg);
    expect(result.geom.activations.get(started!.id)?.from).toBe(started!.start.msg);
  });

  it('hiding a participant hides its messages, notes and activations', () => {
    const src = 'sequenceDiagram\n  A->>+B: hi\n  Note over B: n\n  B-->>-A: ok\n  A->>C: x';
    const { result, svg } = renderProd(src, undefined, { opts: { hidden: { participant: new Set(['B']) } } });
    expect(svg).not.toContain('data-id="m1"');
    expect(svg).not.toContain('data-id="m2"');
    expect(svg).not.toContain('data-id="n1"');
    expect(svg).not.toContain('data-kind="activation"');
    expect(svg).toContain('data-id="m3"');
    expect(result.geom.type === 'sequence' && result.geom.notes.get('n1')?.hidden).toBe(true);
  });
});

describe('page and export', () => {
  it('unsupported diagrams render the empty 400×200 result inside the minimum page', () => {
    const { result, svg } = renderProd('pie\n  "a": 1');
    expect(result.contentBounds).toEqual({ x: 0, y: 0, w: 400, h: 200 });
    expect(result.bounds).toEqual({ x: -160, y: -110, w: 720, h: 420 });
    expect(result.geom).toEqual({ type: null });
    expect(svg).toContain('viewBox="-160 -110 720 420"');
  });

  it('page preset background, grid and border; diagram values win over the preset', () => {
    const { result, ctx } = renderProd('flowchart LR\n  A --> B\n%%@ canvas {"preset":"grid","border":"@red","ratio":"16:9"}');
    expect((result.pageSettings as { preset?: string }).preset).toBe('grid');
    expect(result.page.grid).toBe('rgba(0,0,0,0.05)');
    expect(result.page.border).toBe('#d0312d');
    expect(result.page.background).toBe('#ffffff');
    expect(result.bounds.w / result.bounds.h).toBeCloseTo(16 / 9, 5);
    const page = pageScene(result, ctx);
    expect(page.map((n) => n.key)).toEqual(['page', 'page-grid', 'page-border']);
    const ex = exportScene(result, ctx);
    expect(ex.body.slice(0, 3)).toEqual(page);
    expect(ex.defs.some((d) => d.t === 'pattern')).toBe(true);
  });

  it('custom page size wins; content bounds stay the content', () => {
    const { result } = renderProd('flowchart LR\n  A --> B\n%%@ canvas {"x":-10,"y":-20,"w":1000,"h":500}');
    expect(result.bounds).toEqual({ x: -10, y: -20, w: 1000, h: 500 });
    expect(result.contentBounds.w).toBeLessThan(1000);
  });

  it('SSR output records how text was measured', () => {
    const { result, ctx } = renderProd('flowchart LR\n  A --> B');
    expect(renderSvgString(result, ctx, { ssr: true })).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" [^>]*data-ds-ssr="1" data-ds-measure="static">/);
  });

  it('auto layout goes through the caller-bounded layout cache', () => {
    const cache = new Lru<string, Map<string, Point>>(4);
    let gets = 0, sets = 0;
    const layoutCache = { get: (k: string) => (gets++, cache.get(k)), set: (k: string, v: Map<string, Point>) => (sets++, cache.set(k, v)) };
    renderProd('flowchart LR\n  A --> B', undefined, { layoutCache });
    renderProd('flowchart LR\n  A --> B', undefined, { layoutCache });
    expect([gets, sets]).toEqual([2, 1]);
  });
});

describe('ER table cards', () => {
  const SRC = 'erDiagram\n  CUSTOMER {\n    string id PK\n    string name "full name"\n  }\n%%@ entity CUSTOMER {"mode":"table","showTypes":false,"showComments":true}';
  const texts = (svg: string): string[] => [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]!);

  it('columns type | keys | name, the comment after the name in brackets (no column of its own)', () => {
    const t = texts(renderProd(SRC).svg);
    expect(t).toEqual(['CUSTOMER', 'PK', 'id', 'name', '(full name)']);
  });

  it('underline primary keys works in the table layout too', () => {
    const svg = renderProd(SRC.replace('"showComments":true', '"showComments":true,"pkUnderline":true')).svg;
    expect(svg).toMatch(/text-decoration="underline"[^>]*><tspan[^>]*>id<\/tspan>/);
    expect(svg).not.toMatch(/text-decoration="underline"[^>]*><tspan[^>]*>name<\/tspan>/);
    expect(renderProd(SRC).svg).not.toMatch(/text-decoration="underline"/);
  });

  it('attribute editing (tableView) shows every column whatever the style hides, and an empty last row', () => {
    const hidden = SRC.replace('"showComments":true', '"showComments":false');
    expect(texts(renderProd(hidden).svg)).toEqual(['CUSTOMER', 'PK', 'id', 'name']);
    const r = renderProd(hidden, undefined, { opts: { tableView: ['CUSTOMER'] } });
    expect(texts(r.svg)).toEqual(['CUSTOMER', 'string', 'PK', 'id', 'string', 'name', '(full name)', '+ attribute']);
    const g = r.result.geom;
    expect(g.type === 'er' && g.entities.get('CUSTOMER')!.rows!.map((x) => x.add ?? false)).toEqual([false, false, true]);
  });
});
