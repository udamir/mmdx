import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '../../../src/core/theme/builtin.js';
import { createDefaultRegistry } from '../../../src/core/theme/builtin.js';
import { migrateTheme, validateTheme } from '../../../src/core/theme/validate.js';
import type { ThemeFile } from '../../../src/core/theme/types.js';

describe('validateTheme', () => {
  it('accepts every built-in theme unchanged', () => {
    for (const t of BUILTIN_THEMES) {
      const r = validateTheme(t);
      expect(r.diagnostics).toEqual([]);
      expect(r.theme).toEqual(t);
    }
  });

  it('rejects non-themes', () => {
    expect(validateTheme(null).theme).toBeNull();
    expect(validateTheme({ name: 'x' }).diagnostics[0]?.code).toBe('theme.missing-id');
    expect(validateTheme({ id: 'a\nb' }).theme).toBeNull();
  });

  it('drops injected style values, fonts and palette entries', () => {
    const r = validateTheme({
      id: 'evil',
      font: "x;}</style><script>alert(1)</script>",
      appearance: 'sepia',
      palette: { ok: '#123456', bad: 'url(javascript:x)', ref: '@ok', 'no space': '#fff' },
      canvas: { background: 'red" onload="x', pad: 'big', grid: 'rgba(0,0,0,.1)' },
      flowchart: {
        node: { fill: 'url(javascript:x)', stroke: '@ok', fontFamily: '@import url(x)', dash: '4 4;', radius: 4 },
        nodePresets: { a: { fill: 'expression(x)', text: '#fff' }, b: 'nope' },
        pagePresets: { p: { label: 'Page', background: '</style>' } },
      },
      sequence: { layout: { gap: 'x', rowH: 40 } },
      extraSection: { kept: true },
    });
    expect(r.theme).toEqual({
      id: 'evil',
      palette: { ok: '#123456' },
      canvas: { grid: 'rgba(0,0,0,.1)' },
      flowchart: {
        node: { stroke: '@ok', radius: 4 },
        nodePresets: { a: { text: '#fff' } },
        pagePresets: { p: { label: 'Page' } },
      },
      sequence: { layout: { rowH: 40 } },
      extraSection: { kept: true },
    });
    expect(r.diagnostics.map((d) => d.params?.['key'])).toEqual([
      'font', 'appearance', 'palette.bad', 'palette.ref', 'palette.no space', 'canvas.background', 'canvas.pad',
      'flowchart.node.fill', 'flowchart.node.fontFamily', 'flowchart.node.dash', 'flowchart.nodePresets.a.fill',
      'flowchart.nodePresets.b', 'flowchart.pagePresets.p.background', 'sequence.layout.gap',
    ]);
  });

  it('the registry validates on register', () => {
    const reg = createDefaultRegistry();
    const d = reg.register({ id: 'evil', extends: 'default-light', flowchart: { node: { fill: 'red" onload="x' } } });
    expect(d.map((x) => x.code)).toEqual(['theme.bad-value']);
    expect(reg.get('evil').flowchart.node.fill).toBe(reg.get('default-light').flowchart.node.fill);
    expect(reg.register({ nope: 1 })[0]?.severity).toBe('error');
  });

  it('schemaVersion: none is v1; newer is flagged', () => {
    const t: ThemeFile = { id: 'a' };
    expect(migrateTheme(t)).toBe(t);
    expect(validateTheme({ id: 'a', schemaVersion: 1 }).diagnostics).toEqual([]);
    expect(validateTheme({ id: 'a', schemaVersion: 7 }).diagnostics[0]?.code).toBe('theme.newer-version');
    expect(validateTheme({ id: 'a', schemaVersion: 'x' }).diagnostics[0]?.code).toBe('theme.bad-value');
  });
});
