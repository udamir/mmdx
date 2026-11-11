// The style toolbar's shared theme half and its token vocabulary (A14): one themeStyleTarget for every host, and the
// toolbar CSS on the --mmdx-* tokens only (not the prototype's names through ALIASES).
import { describe, expect, it } from 'vitest';
import { fontFamilyName, themeStyleTarget } from '../../src/ui/diagram/style-toolbar/theme-target.js';
import * as styles from '../../src/ui/diagram/toolbar-styles.js';

describe('themeStyleTarget', () => {
  it('names the palette, keeps a free colour relative to it and reads the font', () => {
    let theme = { palette: { lime: '#d4e63a', sky: '#bfe0ff' }, font: "'Open Sans', sans-serif" };
    const t = themeStyleTarget(() => theme);
    expect(t.palette()).toEqual([{ name: 'lime', value: '#d4e63a' }, { name: 'sky', value: '#bfe0ff' }]);
    expect(t.customColor!('#d4e63a')).toMatch(/^@lime/);
    expect(t.themeFont()).toBe("'Open Sans', sans-serif");
    expect(t.themeFontName()).toBe('Open Sans');
    // read live: the theme editor's draft changes under it
    theme = { palette: { lime: '#000000', sky: '#bfe0ff' }, font: '"Roboto", system-ui' };
    expect(t.palette()[0]!.value).toBe('#000000');
    expect(t.themeFontName()).toBe('Roboto');
    expect(fontFamilyName('Inter')).toBe('Inter');
  });
});

describe('toolbar CSS', () => {
  it('uses the --mmdx-* tokens, not the prototype names of ALIASES', () => {
    const css = (Object.values(styles) as unknown[]).filter((v): v is string => typeof v === 'string').join('\n');
    expect(css.length).toBeGreaterThan(0);
    const names = [...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]!).filter((n) => !n.startsWith('mmdx-'));
    // what remains are the toolbar's own layout variables
    expect(new Set(names)).toEqual(new Set(['cols', 'rows', 'pp-tile', 'pp-cols']));
  });
});
