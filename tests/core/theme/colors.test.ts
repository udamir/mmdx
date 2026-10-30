import { describe, expect, it } from 'vitest';
import {
  createColorResolver, diagramPaletteOf, hexToRgb, hslToRgb, isColorRef, refName, relativeColor, resolveAll, resolveColor,
  resolveThemeColors, rgbToHex, rgbToHsl,
} from '../../../src/core/theme/colors.js';
import { BUILTIN_THEMES, createDefaultRegistry } from '../../../src/core/theme/builtin.js';

const palettes = BUILTIN_THEMES.filter((t) => t.palette).map((t) => [t.id, t.palette!] as const);
const base = palettes.find(([id]) => id === 'default-light')![1];

// A deterministic spread of colours: every palette colour, nudged ones, greys and a few corners.
const probes: string[] = [];
for (const [, p] of palettes) for (const c of Object.values(p)) probes.push(c);
for (let i = 0; i < 120; i++) probes.push(rgbToHex((i * 53) % 256, (i * 97 + 31) % 256, (i * 151 + 7) % 256));
probes.push('#000000', '#ffffff', '#808080', '#7f7f80', '#fff', '#abc');

const normal = (hex: string): string => rgbToHex(...hexToRgb(hex)!);

describe('colour maths', () => {
  it('rgb ↔ hsl', () => {
    const close = (a: readonly number[], b: readonly number[]): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    close(rgbToHsl([255, 0, 0]), [0, 100, 50]);
    close(rgbToHsl([0, 128, 0]), [120, 100, 25.098039215686274]);
    close(rgbToHsl([128, 128, 128]), [0, 0, 50.19607843137255]);
    close(hslToRgb([210, 50, 40]), [51, 102, 153]);
    close(hslToRgb([-30, 120, 50]), [255, 0, 127.5]); // hue wraps, saturation is clamped
    for (const hex of probes) {
      const rgb = hexToRgb(hex)!;
      const [h, s, l] = rgbToHsl(rgb);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      for (const v of [s, l]) expect(v >= 0 && v <= 100, hex).toBe(true);
      close(hslToRgb([h, s, l]), rgb);
    }
  });

  for (const [id, pal] of palettes) {
    it(`relativeColor is exact in the ${id} palette it was picked in`, () => {
      for (const hex of probes) expect(resolveColor(relativeColor(hex, pal), pal, base), hex).toBe(normal(hex));
    });
  }

  it('a relative colour follows the other theme', () => {
    const [, light] = palettes.find(([id]) => id === 'default-light')!;
    const [, dark] = palettes.find(([id]) => id === 'default-dark')!;
    const rows = probes.slice(-126).map((hex) => {
      const rel = relativeColor(hex, light);
      return `${hex} ${rel} ${resolveColor(rel, dark, base)}`;
    });
    expect(rows).toMatchSnapshot();
  });

  it('resolveColor edge cases', () => {
    const cases: unknown[] = ['@lime', '@nope', '@nope~+1,+2,+3', '@lime~=210,+0,+0', '@lime~-400,+200,-200', 'none', 'rgba(0,0,0,.1)', 5, null, '#d4e63a'];
    expect(cases.map((v) => resolveColor(v, base))).toEqual(['#d4e63a', 'nope', 'nope', '#3a90e6', '#000000', 'none', 'rgba(0,0,0,.1)', 5, null, '#d4e63a']);
  });

  it('resolveAll over each built-in theme', () => {
    for (const t of BUILTIN_THEMES) {
      const r = resolveAll(t, t.palette ?? {}, base);
      expect(r.palette, t.id).toEqual(t.palette); // palette sections are left as they are
      expect(JSON.stringify({ ...r, palette: undefined }), t.id).not.toMatch(/"@/);
    }
    expect(resolveAll({ fill: '@lime', list: ['@red', 'x'], deep: { c: '@lime~+0,+0,-100' }, palette: { a: '@lime' } }, base)).toEqual({
      fill: '#d4e63a', list: ['#d0312d', 'x'], deep: { c: '#000000' }, palette: { a: '@lime' },
    });
  });

  it('relativeColor of a palette colour is the bare reference', () => {
    expect(relativeColor('#d4e63a', base)).toBe('@lime');
    expect(relativeColor('not-hex', base)).toBe('not-hex');
    expect(relativeColor('#123456', {})).toBe('#123456');
  });

  it('refs', () => {
    expect(isColorRef('@a~+1,+1,+1')).toBe(true);
    expect(isColorRef('#fff')).toBe(false);
    expect(refName('@lime~+1,+2,+3')).toBe('lime');
    expect(refName('red')).toBeNull();
  });
});

describe('resolveThemeColors', () => {
  it('resolves only colour keys and drops unresolvable ones', () => {
    const r = resolveThemeColors({ fill: '@lime', label: '@home', text: '@nope~+1,+1,+1', stroke: '@red', color: '@x' }, base);
    expect(r).toEqual({ fill: '#d4e63a', label: '@home', stroke: '#d0312d' });
  });
});

describe('createColorResolver', () => {
  const reg = createDefaultRegistry();
  const dark = reg.get('default-dark');
  it('theme palette, then baseline palette, then diagram palette', () => {
    const resolve = createColorResolver(dark, { brand: '#123456', lime: '#000000', ref: '@lime' });
    expect(resolve('@lime')).toBe(dark.palette['lime']);
    expect(resolve('@paper')).toBe(dark.palette['paper'] ?? base['paper']);
    expect(resolve('@brand')).toBe('#123456');
    expect(resolve('@ref')).toBe(dark.palette['lime']);
    expect(resolve('@brand~+0,+0,+10')).toBe(resolveColor('@brand~+0,+0,+10', { brand: '#123456' }));
  });
  it('fallback to the base palette for names the theme lacks', () => {
    const t = { palette: { only: '#010203' }, basePalette: { lime: '#d4e63a' } };
    expect(createColorResolver(t)('@lime')).toBe('#d4e63a');
  });
  it('literals pass, invalid values are undefined', () => {
    const resolve = createColorResolver(dark);
    expect(resolve(' #fff ')).toBe('#fff');
    expect(resolve('transparent')).toBe('transparent');
    expect(resolve('red" onload="x')).toBeUndefined();
    expect(resolve('url(javascript:x)')).toBeUndefined();
    expect(resolve('@nope~+1,+1,+1')).toBeUndefined();
    expect(resolve('@red')).toBe(dark.palette['red'] ?? base['red']);
    expect(resolve('@definitelynotacolour')).toBeUndefined();
    expect(resolve(5)).toBeUndefined();
    expect(createColorResolver(dark, { evil: 'x;y' })('@evil')).toBeUndefined();
  });
  it('diagramPaletteOf reads style.palette', () => {
    expect(diagramPaletteOf({ palette: { a: { color: '#111' }, b: {} }, node: { a: { fill: 'red' } } })).toEqual({ a: '#111' });
    expect(diagramPaletteOf(undefined)).toEqual({});
  });
});
