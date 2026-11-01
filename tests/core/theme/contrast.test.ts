import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance } from '../../../src/core/theme/contrast.js';

describe('contrast', () => {
  it('luminance of #hex colours; null for anything else', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(luminance('#fff')).toBeCloseTo(1, 6);
    expect(luminance('red')).toBeNull();
    expect(luminance('@ink')).toBeNull();
  });

  it('contrast ratio: 21 for black on white, 1 for equal colours, symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#ffffff', '#eeeeee')).toBeCloseTo(contrastRatio('#eeeeee', '#ffffff')!, 9);
    expect(contrastRatio('#ffffff', '#eeeeee')!).toBeLessThan(4.5);
    expect(contrastRatio('none', '#ffffff')).toBeNull();
  });
});
