// Icons, images and shapes in the kinds without icon or image syntax (T10.4), drawn through render/decorate.ts:
// goldens of a state and of a mindmap node with a leading icon token in each position (inline, left at its own size,
// above, below), with a metadata image (natural size, imgW / imgH, cover), with both, with a refused image and with a
// picture not chosen yet; a catalogue shape from metadata; the boxes growing with what they hold, and both kinds
// placing the same icon and image the same way. ER tables (T10.3): the alias's leading token as the title icon in
// both card modes (inline, at its own size, above), emoji aliases, tokens in relationship labels, no images.
import { describe, expect, it } from 'vitest';
import type { ErGeometry, MindmapGeometry, StateGeometry } from '../../../src/core/render/types.js';
import { renderProd } from './helpers.js';

const IMG = 'https://example.com/photo.png';
/** The scene of one item, serialized (not a mindmap node's branch, a group of its own). */
const nodeSvg = (svg: string, id: string, kind = 'node'): string => {
  const at = [...svg.matchAll(new RegExp(`data-kind="${kind}" data-id="${id}"(?! data-part)`, 'g'))][0]!.index;
  const start = svg.lastIndexOf('<g ', at);
  let depth = 0, i = start;
  for (; i < svg.length; i++) {
    if (svg.startsWith('<g', i)) depth++;
    else if (svg.startsWith('</g>', i) && --depth === 0) break;
  }
  return svg.slice(start, i + 4);
};

const state = (label: string, meta: string): string => `stateDiagram-v2\n  state "${label}" as s\n  [*] --> s\n%%@ node s ${meta}`;
const mind = (label: string, meta: string): string => `mindmap\n  root((Root))\n    s[${label}]\n%%@ node s ${meta}`;
const KINDS = { state, mindmap: mind };

const CASES: Record<string, [string, string]> = {
  'token inline (default)': ['fa:fa-cog Running', '{}'],
  'token left at its own size': ['fa:fa-cog Running', '{"iconSize":24}'],
  'token above': ['fa:fa-cog Running', '{"iconPos":"t"}'],
  'token below, coloured': ['fa:fa-cog Running', '{"iconPos":"b","iconColor":"@red"}'],
  'image': ['Running', `{"img":"${IMG}"}`],
  'image imgW × imgH, cover': ['Running', `{"img":"${IMG}","imgW":120,"imgH":40,"imgFit":"cover"}`],
  'image and the token above': ['tabler:user Alice', `{"img":"${IMG}","iconPos":"t"}`],
  'refused image': ['Running', '{"img":"http://example.com/a.png"}'],
  'picture not chosen yet': ['Running', '{"img":""}'],
};

describe('state and mindmap content (goldens)', () => {
  for (const [kind, src] of Object.entries(KINDS))
    for (const [name, [label, meta]] of Object.entries(CASES))
      it(`${kind}: ${name}`, () => {
        const r = renderProd(src(label, meta));
        expect(nodeSvg(r.svg, 's')).toMatchSnapshot();
      });
});

describe('state and mindmap content', () => {
  const stateBox = (label: string, meta: string): { w: number; h: number } => (renderProd(state(label, meta)).result.geom as StateGeometry).nodes.get('s')!;
  const mindBox = (label: string, meta: string): { w: number; h: number } => (renderProd(mind(label, meta)).result.geom as MindmapGeometry).nodes.get('s')!;

  it('the box grows with what it holds', () => {
    for (const box of [stateBox, mindBox]) {
      const plain = box('fa:fa-cog Running', '{}');
      const top = box('fa:fa-cog Running', '{"iconPos":"t"}');
      expect(top.h).toBeGreaterThan(plain.h);
      expect(box('fa:fa-cog Running', '{"iconPos":"b"}').h).toBe(top.h);
      expect(box('Running', `{"img":"${IMG}"}`).h).toBeGreaterThan(plain.h + 70);
      expect(box('Running', `{"img":"${IMG}","imgW":200,"imgH":20}`).w).toBeGreaterThanOrEqual(200);
    }
  });

  it('the token is taken out of the text above or below, and stays in it inline', () => {
    const inline = nodeSvg(renderProd(state('fa:fa-cog Running', '{}')).svg, 's');
    const top = nodeSvg(renderProd(state('fa:fa-cog Running', '{"iconPos":"t"}')).svg, 's');
    // the icon is drawn either way; the text runs no longer hold it above
    expect(inline.match(/<image /g)?.length).toBe(1);
    expect(top.match(/<image /g)?.length).toBe(1);
    expect(top).toMatch(/class="mmdx-icon"/);
    expect(inline).not.toMatch(/class="mmdx-icon"/);
  });

  it('both kinds place the icon and the image the same way (relative to the text)', () => {
    const at = (svg: string): number[] => [...svg.matchAll(/<image [^>]*?y="([\d.-]+)"[^>]*?height="([\d.]+)"/g)].map((m) => Number(m[2]));
    const s = nodeSvg(renderProd(state('tabler:user Alice', `{"img":"${IMG}","iconPos":"t"}`)).svg, 's');
    const m = nodeSvg(renderProd(mind('tabler:user Alice', `{"img":"${IMG}","iconPos":"t"}`)).svg, 's');
    // the image's and the icon's heights: the same image box; the icon 1.75 em (state 15 px → 26 px, mindmap 16 px → 28 px)
    expect(at(s)).toEqual([72, 26]);
    expect(at(m)).toEqual([72, 28]);
  });

  it('a refused image reports image.blocked from the metadata; a picture not chosen yet reports nothing', () => {
    for (const src of [state, mind]) {
      expect(renderProd(src('Running', '{"img":"http://example.com/a.png"}')).result.diagnostics?.map((d) => [d.code, d.source])).toEqual([['image.blocked', 'meta']]);
      expect(renderProd(src('Running', '{"img":""}')).result.diagnostics ?? []).toEqual([]);
    }
  });

  it('a catalogue shape from metadata (mmdx only)', () => {
    expect((renderProd(state('Running', '{"shape":"hex"}')).result.geom as StateGeometry).nodes.get('s')!.shape).toBe('hexagon');
    expect((renderProd(mind('Running', '{"shape":"hex"}')).result.geom as MindmapGeometry).nodes.get('s')!.shape).toBe('hexagon');
  });
});

const er = (alias: string, meta: string, rel = 'places'): string =>
  `erDiagram\n  C${alias} {\n    string id PK\n    string name\n  }\n  C ||--o{ ORDER : ${rel}\n%%@ entity C ${meta}`;
const ER_CASES: Record<string, [string, string]> = {
  'token inline (default)': ['["fa:fa-user Customer"]', '{}'],
  'token left at its own size': ['["fa:fa-user Customer"]', '{"iconSize":24}'],
  'token above': ['["fa:fa-user Customer"]', '{"iconPos":"t"}'],
  'table: token inline': ['["fa:fa-user Customer"]', '{"mode":"table"}'],
  'table: token above': ['["fa:fa-user Customer"]', '{"mode":"table","iconPos":"t"}'],
  'emoji alias': ['["🛒 Customer"]', '{}'],
  'emoji alias, table': ['["🛒 Customer"]', '{"mode":"table"}'],
  'markdown alias with a token': ['["tabler:user **Customer**"]', '{}'],
};

describe('ER table icons (goldens)', () => {
  for (const [name, [alias, meta]] of Object.entries(ER_CASES))
    it(name, () => {
      expect(nodeSvg(renderProd(er(alias, meta)).svg, 'C', 'entity')).toMatchSnapshot();
    });
  it('a relationship label with a token', () => {
    const r = renderProd(er('', '{}', '"fa:fa-truck ships"'));
    expect(r.result.diagnostics?.filter((d) => d.code === 'icon.unknown') ?? []).toEqual([]);
    const svg = r.svg;
    const at = svg.indexOf('data-part="label"');
    expect(svg.slice(svg.lastIndexOf('<g ', at), svg.indexOf('</g>', at) + 4)).toMatchSnapshot();
  });
});

describe('ER table icons', () => {
  const geom = (alias: string, meta: string): ErGeometry => renderProd(er(alias, meta)).result.geom as ErGeometry;
  const card = (alias: string, meta: string): { w: number; h: number; head?: number } => geom(alias, meta).entities.get('C')!;

  it('the token is drawn as an icon inline, or apart above the title (the card grows)', () => {
    const inline = nodeSvg(renderProd(er('["fa:fa-user Customer"]', '{}')).svg, 'C', 'entity');
    const top = nodeSvg(renderProd(er('["fa:fa-user Customer"]', '{"iconPos":"t"}')).svg, 'C', 'entity');
    expect(inline.match(/<image /g)?.length).toBe(1);
    expect(inline).not.toMatch(/class="mmdx-icon"/);
    expect(inline).not.toContain('fa:fa-user');
    expect(top).toMatch(/class="mmdx-icon"/);
    for (const mode of ['', '"mode":"table",']) {
      const a = card('["fa:fa-user Customer"]', `{${mode}}`), b = card('["fa:fa-user Customer"]', `{${mode}"iconPos":"t"}`);
      expect(b.h).toBeGreaterThan(a.h);
      expect(b.head!).toBeGreaterThan(a.head!);
    }
    // the inline icon makes the title wider than the text alone
    expect(card('["fa:fa-user Customer"]', '{"mode":"table","minW":0}').w).toBeGreaterThan(card('["Customer"]', '{"mode":"table","minW":0}').w);
  });

  it('only an alias holds an icon; tables take no images', () => {
    const plain = nodeSvg(renderProd('erDiagram\n  "fa:fa-user" {\n    int id\n  }').svg, 'fa:fa-user', 'entity');
    expect(plain).not.toMatch(/<image /);
    const svg = nodeSvg(renderProd(er('["Customer"]', `{"img":"${IMG}"}`)).svg, 'C', 'entity');
    expect(svg).not.toMatch(/<image /);
    expect(card('["Customer"]', `{"img":"${IMG}"}`)).toEqual(card('["Customer"]', '{}'));
  });
});
