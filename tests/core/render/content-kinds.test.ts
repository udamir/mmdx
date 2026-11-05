// Icons, images and shapes in the kinds without icon or image syntax (T10.4), drawn through render/decorate.ts:
// goldens of a state and of a mindmap node with a leading icon token in each position (inline, left at its own size,
// above, below), with a metadata image (natural size, imgW / imgH, cover), with both, with a refused image and with a
// picture not chosen yet; a catalogue shape from metadata; the boxes growing with what they hold, and both kinds
// placing the same icon and image the same way.
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
