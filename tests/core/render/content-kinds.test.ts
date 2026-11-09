// Icons, images and shapes in the kinds without icon or image syntax (T10.4): goldens of a state and of a mindmap node
// with a leading icon token in each position (inline, left at its own size, above, below), drawn through
// render/decorate.ts; a mindmap node's metadata image (natural size, imgW / imgH, cover), with the token, refused and
// not chosen yet; image and icon states, drawn as the flowchart's image and icon nodes (render/media-node.ts: the
// picture or the icon is the state, captioned above or below) with the same keys and the same boxes; a catalogue shape
// from metadata; the boxes growing with what they hold.
import { describe, expect, it } from 'vitest';
import type { MindmapGeometry, StateGeometry } from '../../../src/core/render/types.js';
import { renderProd } from './helpers.js';

const IMG = 'https://example.com/photo.png';
/** The scene of one node, serialized (not a mindmap node's branch, a group of its own). */
const nodeSvg = (svg: string, id: string): string => {
  const at = [...svg.matchAll(new RegExp(`data-kind="node" data-id="${id}"(?! data-part)`, 'g'))][0]!.index;
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
const flow = (label: string, data: string): string => `flowchart TB\n  s["${label}"]\n  s@{ ${data} }`;
const KINDS = { state, mindmap: mind };

const TOKENS: Record<string, [string, string]> = {
  'token inline (default)': ['fa:fa-cog Running', '{}'],
  'token left at its own size': ['fa:fa-cog Running', '{"iconSize":24}'],
  'token above': ['fa:fa-cog Running', '{"iconPos":"t"}'],
  'token below, coloured': ['fa:fa-cog Running', '{"iconPos":"b","iconColor":"@red"}'],
};
const IMAGES: Record<string, [string, string]> = {
  'image': ['Running', `{"img":"${IMG}"}`],
  'image imgW × imgH, cover': ['Running', `{"img":"${IMG}","imgW":120,"imgH":40,"imgFit":"cover"}`],
  'image and the token above': ['tabler:user Alice', `{"img":"${IMG}","iconPos":"t"}`],
  'refused image': ['Running', '{"img":"http://example.com/a.png"}'],
  'picture not chosen yet': ['Running', '{"img":""}'],
};

/** Image and icon states: the flowchart image node's keys in the state's metadata. */
const STATE_MEDIA: Record<string, [string, string]> = {
  'image state': ['Running', `{"img":"${IMG}","w":200,"h":200,"pos":"b","constraint":"on"}`],
  'image state, caption above, w × h, cover': ['Running', `{"img":"${IMG}","w":120,"h":40,"pos":"t","imgFit":"cover"}`],
  'image state with a description row': ['Running', `{"img":"${IMG}","h":80}`],
  'icon state in a square': ['Alice', '{"icon":"tabler:user","form":"square","pos":"b","h":60}'],
  'icon state in a circle, caption above': ['Alice', '{"icon":"tabler:user","form":"circle","pos":"t"}'],
  'refused image state': ['Running', '{"img":"http://example.com/a.png"}'],
  'image state not chosen yet': ['Running', '{"img":""}'],
};

describe('state and mindmap content (goldens)', () => {
  for (const [kind, src] of Object.entries(KINDS))
    for (const [name, [label, meta]] of Object.entries(TOKENS))
      it(`${kind}: ${name}`, () => {
        const r = renderProd(src(label, meta));
        expect(nodeSvg(r.svg, 's')).toMatchSnapshot();
      });
  for (const [name, [label, meta]] of Object.entries(IMAGES))
    it(`mindmap: ${name}`, () => {
      expect(nodeSvg(renderProd(mind(label, meta)).svg, 's')).toMatchSnapshot();
    });
  for (const [name, [label, meta]] of Object.entries(STATE_MEDIA))
    it(`state: ${name}`, () => {
      const src = name.includes('description') ? `${state(label, meta)}\n  s : waiting for input` : state(label, meta);
      expect(nodeSvg(renderProd(src).svg, 's')).toMatchSnapshot();
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
    }
    expect(mindBox('Running', `{"img":"${IMG}"}`).h).toBeGreaterThan(mindBox('Running', '{}').h + 70);
    expect(mindBox('Running', `{"img":"${IMG}","imgW":200,"imgH":20}`).w).toBeGreaterThanOrEqual(200);
  });

  it('an image or icon state is drawn as the flowchart draws an image or icon node with the same keys', () => {
    const cases: [string, string][] = [
      [`{"img":"${IMG}","w":200,"h":120,"pos":"b"}`, `img: "${IMG}", w: 200, h: 120, pos: "b"`],
      [`{"img":"${IMG}","w":90,"h":60,"pos":"t"}`, `img: "${IMG}", w: 90, h: 60, pos: "t"`],
      ['{"icon":"tabler:user","form":"circle","h":60}', 'icon: "tabler:user", form: "circle", h: 60'],
      ['{"icon":"tabler:user"}', 'icon: "tabler:user"'],
    ];
    for (const [meta, data] of cases) {
      const s = (renderProd(state('Running', meta)).result.geom as StateGeometry).nodes.get('s')!;
      const f = (renderProd(flow('Running', data)).result.geom as StateGeometry).nodes.get('s')!;
      expect(s.asset, meta).toBeDefined();
      // the same asset and the same box around it and its caption (the state's text is a pixel smaller than the node's)
      expect([s.asset!.w, s.asset!.h], meta).toEqual([f.asset!.w, f.asset!.h]);
      expect(Math.abs(s.w - f.w), meta).toBeLessThan(12);
      expect(Math.abs(s.h - f.h), meta).toBeLessThan(4);
      expect(Math.sign(s.asset!.y - s.y), meta).toBe(Math.sign(f.asset!.y - f.y));
    }
    // no state box: the picture is the state
    const svg = nodeSvg(renderProd(state('Running', `{"img":"${IMG}","w":200,"h":120}`)).svg, 's');
    expect(svg).not.toMatch(/<rect [^>]*rx=/);
    expect(svg).toMatch(/st-image/);
  });

  it('`imgW` / `imgH` size an image state where `w` / `h` are not written', () => {
    const s = (renderProd(state('Running', `{"img":"${IMG}","imgW":120,"imgH":40}`)).result.geom as StateGeometry).nodes.get('s')!;
    expect([s.asset!.w, s.asset!.h]).toEqual([120, 40]);
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

  it('a mindmap node draws its image and its icon above the text', () => {
    const at = (svg: string): number[] => [...svg.matchAll(/<image [^>]*?y="([\d.-]+)"[^>]*?height="([\d.]+)"/g)].map((m) => Number(m[2]));
    const m = nodeSvg(renderProd(mind('tabler:user Alice', `{"img":"${IMG}","iconPos":"t"}`)).svg, 's');
    // the image box; the icon 1.75 em (16 px → 28 px)
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
