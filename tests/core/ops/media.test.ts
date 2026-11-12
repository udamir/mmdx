// The image and icon state machine (X9, BUG-012): one mediaPatch for the flowchart's node data and the metadata of the types without image syntax. A new icon item is framed in a square whichever way it is made (the image tool's Icon tab, a picture given an icon, "Convert to icon node"), as Mermaid's icon shape examples write it; the two writers agree on every change.
import { describe, expect, it } from 'vitest';
import { ICON_FORM, mediaPatch, type MediaChange } from '../../../src/core/ops/media.js';
import { setFlowIconNode, setFlowImage, setFlowMedia, toFlowIconNode } from '../../../src/core/kinds/flowchart/ops-media.js';
import { parseFlowchart } from '../../../src/core/kinds/flowchart/parse.js';
import { patchMetaMedia, setMetaIcon, setMetaImage } from '../../../src/core/ops/meta-media.js';

const P = parseFlowchart;
const dataOf = (code: string, id: string): Record<string, unknown> => ({ ...P(code).nodes.get(id)!.data });

describe('mediaPatch', () => {
  it('pins a new icon item\'s frame: a square', () => {
    expect(ICON_FORM).toBe('square');
    expect(mediaPatch({}, { icon: 'fa:car' })).toEqual({ icon: 'fa:car', form: 'square', h: 60, pos: 'b' });
    expect(mediaPatch({ img: 'a.png', w: 200, h: 200, pos: 't', constraint: 'on' }, { icon: 'fa:car' })).toEqual({ img: null, w: null, constraint: null, icon: 'fa:car', form: 'square', h: 60 });
    // a frame the item has is kept
    expect(mediaPatch({ form: 'circle' }, { icon: 'fa:car' })).toMatchObject({ icon: 'fa:car', h: 60, pos: 'b' });
    expect(mediaPatch({ form: 'circle' }, { icon: 'fa:car' })).not.toHaveProperty('form');
  });

  it('the flowchart writes a square frame for every new icon node, "Convert to icon node" too', () => {
    const plain = 'flowchart LR\n  A["Car"]\n';
    expect(dataOf(setFlowIconNode(plain, P(plain), 'A', 'fa:car')!.code, 'A')).toMatchObject({ form: 'square' });
    const token = 'flowchart LR\n  A["fa:fa-car Car"]\n';
    expect(toFlowIconNode(token, P(token), 'A')!.code).toBe('flowchart LR\n  A["Car"]\n  A@{ icon: "fa:car", form: "square", h: 60, pos: "b" }\n');
    expect(setFlowMedia(token, P(token), 'A', { node: 'icon' })!.code).toBe(toFlowIconNode(token, P(token), 'A')!.code);
  });

  it('a layout change: null for a plain item, a frame for icons only, the lock for pictures only, sizes clamped', () => {
    expect(mediaPatch({}, { layout: { h: 10 } })).toBeNull();
    expect(mediaPatch({ icon: 'fa:car' }, { layout: { form: 'circle', constraint: 'on', h: 1 } })).toEqual({ form: 'circle', h: 8 });
    expect(mediaPatch({ img: 'a.png' }, { layout: { form: 'circle', constraint: 'off', w: 1e6 } })).toEqual({ constraint: 'off', w: 2000 });
    expect(mediaPatch({ img: 'a.png', pos: 'b' }, { layout: { pos: null } })).toEqual({ pos: null });
  });

  it('removing the media removes every media key the item has, and only those', () => {
    expect(mediaPatch({ icon: 'fa:car', form: 'square', h: 60, color: '#f00' }, { icon: null })).toEqual({ icon: null, form: null, h: null });
    expect(mediaPatch({ icon: 'fa:car' }, { image: null })).toEqual({});
    expect(mediaPatch({ img: 'a.png' }, { icon: null })).toEqual({});
  });
});

describe('the node data and the metadata writers agree', () => {
  // flowchart node data and an item's metadata, from the same keys, after the same changes (a metadata item's plain box is not an asset size, so the starting items have none)
  const steps: readonly MediaChange[] = [{ image: 'https://example.com/a.png' }, { layout: { pos: 't', constraint: null, w: 300 } }, { icon: 'tabler:user' }, { layout: { form: 'circle', h: 96 } }, { icon: 'tabler:car' }, { image: 'https://example.com/b.png' }, { image: null }];
  it('step by step', () => {
    let code = 'flowchart LR\n  A["Photo"]\n';
    const meta: Record<string, unknown> = {};
    for (const s of steps) {
      if ('image' in s) code = setFlowImage(code, P(code), 'A', s.image)!.code, setMetaImage(meta, s.image);
      else if ('icon' in s) code = setFlowIconNode(code, P(code), 'A', s.icon)!.code, setMetaIcon(meta, s.icon);
      else code = setFlowMedia(code, P(code), 'A', s.layout)!.code, patchMetaMedia(meta, s.layout);
      expect(dataOf(code, 'A'), JSON.stringify(s)).toEqual(meta);
    }
    expect(code).toBe('flowchart LR\n  A["Photo"]\n');
  });
});
