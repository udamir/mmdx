// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getShared, instanceContext } from '../../src/platform/config.js';
import { parseFlowchart } from '../../src/core/kinds/flowchart/parse.js';
import { ALL_VIEW_KINDS } from '../../src/core/kinds/all.js';
import { drawItemPreview, drawItemPreviewWith, renderItemSample, renderItemSampleWith, type PreviewKind } from '../../src/ui/diagram/item-preview.js';
import { kindUi, previewSample } from '../../src/ui/diagram/kind-ui.js';
import { fitPresetGrid, shapePreview } from '../../src/ui/diagram/shape-preview.js';
import { SHAPES } from '../../src/core/shapes/catalog.js';

const theme = getShared().themes.get('default-light');
/** Every built-in type's preview samples (each type's KindUi supplies its own, X21). */
const SAMPLE_KINDS: PreviewKind[] = (['flowchart', 'sequence', 'er', 'mindmap', 'state'] as const).flatMap((t) => Object.keys(kindUi(t).previewSamples ?? {}));

describe('item previews', () => {
  it('each type supplies its own samples, found by preview kind', () => {
    expect(SAMPLE_KINDS).toHaveLength(25);
    expect(new Set(SAMPLE_KINDS).size).toBe(25);
    expect(previewSample('st-note')).toBe(kindUi('state').previewSamples!['st-note']);
    expect(previewSample('nothing')).toBeUndefined();
  });

  it('renders every kind\'s sample with every kind loaded (the wrapper) and draws an svg into the element', () => {
    for (const kind of SAMPLE_KINDS) {
      const { result, background } = renderItemSample(kind, null, theme);
      expect(result.body.length, kind).toBeGreaterThan(0);
      expect(background).toMatch(/^#|rgb/);
      const pic = document.createElement('div');
      drawItemPreview(pic, kind, null, theme);
      const svg = pic.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('viewBox')!.split(' ')).toHaveLength(4);
      expect(pic.style.height).toMatch(/px$/);
    }
  });

  it('fit: the window is the element\'s width × the given height', () => {
    const pic = document.createElement('div');
    drawItemPreview(pic, 'node', null, theme, { fit: { h: 60 } });
    expect(pic.querySelector('svg')!.getAttribute('height')).toBe('60');
    expect(pic.style.height).toBe('60px');
  });

  it('the injectable variant renders with the kinds and the context it is given', () => {
    const parse = vi.fn(parseFlowchart);
    const env = { kinds: { flowchart: { ...ALL_VIEW_KINDS.flowchart!, parse } }, ctx: instanceContext() };
    const { result } = renderItemSampleWith(env, 'node', null, theme);
    expect(parse).toHaveBeenCalledOnce();
    expect(result.body.length).toBeGreaterThan(0);
    const pic = document.createElement('div');
    drawItemPreviewWith(env, pic, 'edge', null, theme);
    expect(pic.querySelector('svg')).not.toBeNull();
    // a kind that is not loaded renders nothing (no throw)
    expect(renderItemSampleWith(env, 'participant', null, theme).result.body).toHaveLength(0);
  });
});

describe('shape previews', () => {
  it('shapePreview draws a known outline, an empty one for unknown shapes', () => {
    const svg = shapePreview('diamond', 20);
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')).not.toBeNull();
    expect(shapePreview('nope').childElementCount).toBe(0);
  });

  it('draws every catalogue shape (the same drawing as the canvas) and the participant shapes', () => {
    for (const s of SHAPES) expect(shapePreview(s.id).childElementCount, s.id).toBeGreaterThan(0);
    for (const name of ['box', 'actor', 'database', 'hcyl']) expect(shapePreview(name).childElementCount, name).toBeGreaterThan(0);
  });

  it('fitPresetGrid sizes the submenu to its tiles and the room', () => {
    const sub = document.createElement('div');
    for (let i = 0; i < 2; i++) sub.append(Object.assign(document.createElement('div'), { className: 'pp-item' }));
    const two = fitPresetGrid(sub, 1000, 1000);
    expect([sub.style.getPropertyValue('--cols'), sub.style.getPropertyValue('--rows')]).toEqual(['2', '1']);
    for (let i = 0; i < 30; i++) sub.append(Object.assign(document.createElement('div'), { className: 'pp-item' }));
    const many = fitPresetGrid(sub, 300, 300);
    expect(Number(sub.style.getPropertyValue('--cols'))).toBeLessThanOrEqual(5);
    expect(Number(sub.style.getPropertyValue('--rows'))).toBeLessThanOrEqual(5);
    expect(many.w).toBeGreaterThanOrEqual(two.w);
  });
});
