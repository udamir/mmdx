// The metadata key registry (meta/keys.ts, B7): every list of metadata keys comes from one fail-closed table, so
// "Reset style", "Style off", Auto layout and the diff agree on what a key is, and keys the table does not know are
// never thrown away.
import { describe, expect, it } from 'vitest';
import { metaFacet } from '../../../src/core/diff/kit.js';
import { withoutStyle } from '../../../src/core/diff/transform.js';
import { CLEANERS, classOf, COLOR_KEYS, COPY_KEYS, META_KEYS, STYLE_KEYS, valueType } from '../../../src/core/meta/keys.js';
import { mergeStyle, pickStyle } from '../../../src/core/render/common.js';
import type { RenderContext } from '../../../src/core/render/types.js';
import { hexToRgb } from '../../../src/core/theme/colors.js';
import { COLOR_REF, COLOR_REL, HEX_COLOR } from '../../../src/core/validate.js';
import { joinSource, splitSource } from '../../../src/core/meta/index.js';
import { emptyMeta, type DiagramMeta } from '../../../src/core/meta/types.js';
import { resetItemStyle } from '../../../src/core/ops/style-ops.js';
import { resetLayout } from '../../../src/core/ops/positions.js';

const meta = (m: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...m });

describe('META_KEYS', () => {
  it('every key has a class and a cleaner; unknown keys are "unknown", never look', () => {
    for (const k of Object.keys(META_KEYS)) {
      expect(['layout', 'content', 'look', 'state']).toContain(classOf(k));
      expect(typeof CLEANERS[k]).toBe('function');
    }
    expect(classOf('futureKey')).toBe('unknown');
    expect(classOf('__proto__')).toBe('unknown');
  });

  it('page keys take their page class', () => {
    expect(classOf('pad')).toBe('look');
    expect(classOf('pad', 'canvas')).toBe('layout');
  });

  it('Copy style keeps its keys and their order', () => {
    expect(COPY_KEYS.slice(0, 4)).toEqual(['preset', 'fill', 'stroke', 'strokeWidth']);
    expect(COPY_KEYS).toHaveLength(38);
    expect(COPY_KEYS.every((k) => classOf(k) === 'look')).toBe(true);
  });
});

describe('B7: one classification everywhere', () => {
  it('Reset style keeps the picture, its frame, the layer, waypoints and unknown keys', () => {
    const m = meta({ nodes: { A: { img: 'a.png', w: 80, h: 60, pos: 'b', constraint: 'on', fill: '#f00', layer: 'L1', futureKey: 1 } as never } });
    expect(resetItemStyle(m, { kind: 'node', id: 'A' }).meta.nodes!['A']).toEqual({ img: 'a.png', w: 80, h: 60, pos: 'b', constraint: 'on', layer: 'L1', futureKey: 1 });
  });

  it('Style off keeps pictures, nudges, folds and unknown keys of a mindmap node', () => {
    const src = joinSource({ code: 'mindmap\n  root\n    A', meta: meta({ nodes: { A: { img: 'a.png', dx: 4, collapsed: true, fill: '#f00', futureKey: 1 } as never } }) });
    const out = splitSource(withoutStyle(src)).doc.meta.nodes!['A'];
    expect(out).toEqual({ img: 'a.png', dx: 4, collapsed: true, futureKey: 1 });
  });

  it('a metadata icon or picture change is content; an unknown key is content; a lock is no change', () => {
    expect(metaFacet('icon')).toBe('content');
    expect(metaFacet('img')).toBe('content');
    expect(metaFacet('futureKey')).toBe('content');
    expect(metaFacet('locked')).toBeNull();
    expect(metaFacet('collapsed')).toBe('layout');
    expect(metaFacet('fill')).toBe('style');
  });

  it('Auto layout forgets a mindmap branch\'s nudges and side, keeps its look and picture', () => {
    const m = meta({ nodes: { A: { dx: 4, dy: 2, side: 'l', fill: '#f00', img: 'a.png' } as never } });
    expect(resetLayout(m).meta.nodes!['A']).toEqual({ fill: '#f00', img: 'a.png' });
  });
});

describe('META_KEYS: value types and the style sets (X6, task 4.1)', () => {
  it('each key has a value type from its cleaner; the colour keys are the keys holding colours', () => {
    expect(valueType('fill')).toBe('color');
    expect(valueType('labelColor')).toBe('color');
    expect(valueType('strokeWidth')).toBe('number');
    expect(valueType('dash')).toBe('dash');
    expect(valueType('fontWeight')).toBe('weight');
    expect(valueType('fontFamily')).toBe('font');
    expect(valueType('wrap')).toBe('bool');
    expect(valueType('stack')).toBe('stack');
    expect(valueType('align')).toBe('enum');
    expect(valueType('points')).toBeUndefined();
    expect(valueType('futureKey')).toBeUndefined();
    // one list: the page's colours and the icon colour are colours too (the renderer resolves them)
    expect([...COLOR_KEYS].sort()).toEqual(['attrColor', 'background', 'border', 'color', 'fill', 'grid', 'iconColor', 'labelColor', 'stroke', 'text', 'titleColor']);
    for (const k of Object.keys(META_KEYS)) expect(COLOR_KEYS.has(k)).toBe(valueType(k) === 'color');
  });

  it('the style properties the renderer picks from an item are the flagged keys', () => {
    expect([...STYLE_KEYS].sort()).toEqual([
      'align', 'arrow', 'attrColor', 'attrSize', 'color', 'curve', 'dash', 'fill', 'fillOpacity', 'fontFamily', 'fontSize', 'fontWeight', 'labelColor',
      'labelSize', 'pad', 'padTop', 'radius', 'shape', 'stack', 'stroke', 'strokeOpacity', 'strokeWidth', 'text', 'titleAlign', 'titleColor',
      'titleSize', 'titleWeight', 'valign', 'width', 'wrap',
    ]);
    expect(pickStyle({ fill: '#fff', x: 10, routing: 'straight', pad: 4 })).toEqual({ fill: '#fff', pad: 4 });
  });

  it('a style layer is validated by value type: an icon colour resolves a palette reference, bad values are dropped', () => {
    const ctx = { color: (v: unknown) => (v === '@accent' ? '#123456' : typeof v === 'string' && v.startsWith('#') ? v : undefined) } as unknown as RenderContext;
    expect(mergeStyle(ctx, { iconColor: '@accent', labelDx: '4', fontWeight: 'heavy', dash: '6 4', wrap: 'yes', mode: 'table' })).toEqual({
      iconColor: '#123456', labelDx: 4, dash: '6 4', mode: 'table',
    });
  });

  it('one colour grammar: hex of 3, 4, 6 or 8 digits and the palette references, in validate.ts and the theme colours', () => {
    for (const hex of ['#abc', '#abcd', '#aabbcc', '#aabbccdd']) {
      expect(HEX_COLOR.test(hex)).toBe(true);
      expect(hexToRgb(hex)).not.toBeNull();
    }
    expect(HEX_COLOR.test('#abcde')).toBe(false);
    expect(COLOR_REF.test('@accent')).toBe(true);
    expect(COLOR_REF.test('@accent~+10,-5,0')).toBe(true);
    expect(COLOR_REF.test('@accent~')).toBe(false);
    expect('@accent~=200,0,+5'.match(COLOR_REL)?.slice(1)).toEqual(['accent', '=200', '0', '+5']);
  });
});
