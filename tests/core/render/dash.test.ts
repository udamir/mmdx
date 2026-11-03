// Dash patterns at a line's width: the editor's dotted and dashed patterns scale with the stroke (a thick dotted
// border is round dots, not ticks across the line); other dasharrays are drawn as written.
import { describe, expect, it } from 'vitest';
import { DASHED, DOTTED, dashAttrs } from '../../../src/core/render/dash.js';
import { shapeDef } from '../../../src/core/shapes/catalog.js';

describe('dashAttrs', () => {
  it('dotted: zero-length dashes with round caps, spaced by the width', () => {
    expect(dashAttrs(DOTTED, 1.5)).toEqual({ 'stroke-dasharray': '0 4', 'stroke-linecap': 'round' });
    expect(dashAttrs(DOTTED, 8)).toEqual({ 'stroke-dasharray': '0 20', 'stroke-linecap': 'round' });
    expect(dashAttrs(' 1.5,4 ', 8)).toEqual({ 'stroke-dasharray': '0 20', 'stroke-linecap': 'round' });
  });

  it('dashed: as written up to 2 px, then 3 : 2 of the width', () => {
    expect(dashAttrs(DASHED, 1.5)).toEqual({ 'stroke-dasharray': '6 4' });
    expect(dashAttrs(DASHED, 8)).toEqual({ 'stroke-dasharray': '24 16' });
  });

  it('any other pattern as written; none or empty: nothing', () => {
    expect(dashAttrs('5 5', 8)).toEqual({ 'stroke-dasharray': '5 5' });
    expect(dashAttrs('none', 2)).toEqual({});
    expect(dashAttrs('', 2)).toEqual({});
    expect(dashAttrs(undefined, 2)).toEqual({});
  });

  it('a shape with a thick dotted border is drawn with round dots', () => {
    const out = shapeDef('stadium').draw({ x: 0, y: 0, w: 120, h: 56 }, { fill: '#fff', stroke: '#000', strokeWidth: 8, dash: DOTTED }, {});
    const attrs = (out[0] as { attrs: Record<string, unknown> }).attrs;
    expect(attrs['stroke-dasharray']).toBe('0 20');
    expect(attrs['stroke-linecap']).toBe('round');
  });
});
