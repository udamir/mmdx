// Theme editor and UI fixes of the codebase audit (task 1.24): B25, B26, B29, B37.
import { describe, expect, it, vi } from 'vitest';
import { CODE_TOKENS_CSS } from '../../src/ui/styles/code-tokens.js';
import { RATIOS } from '../../src/ui/page-ratios.js';
import { FONTS } from '../../src/theme-editor/constants.js';
import { FONTS as STYLE_FONTS } from '../../src/ui/fonts.js';

describe('B25: one table of page ratios and fonts', () => {
  it('the theme editor offers A4 and the style pickers\' font stacks', () => {
    expect(RATIOS.map(([r]) => r)).toEqual(expect.arrayContaining(['297:210', '210:297']));
    expect(FONTS).toEqual(STYLE_FONTS.filter(([v]) => v !== ''));
  });
});

describe('B29: every code token has a dark value', () => {
  it('the dark block defines every token the light block does', () => {
    const block = (sel: string): string[] => [...(CODE_TOKENS_CSS.split(sel)[1]!.split('}')[0]!.matchAll(/(--mmdx-code-[\w-]+):/g))].map((m) => m[1]!).sort();
    expect(block(':host([data-ui="dark"]) {')).toEqual(block(':host {'));
  });
});

describe('B37: concurrent diff kind loads register once', () => {
  it('two loads at the same time share one import', async () => {
    vi.resetModules();
    const reg = await import('../../src/core/kinds/registry.js');
    const spy = vi.spyOn(reg, 'registerDiffs');
    const { loadKindsOf } = await import('../../src/diff/kinds.js');
    await Promise.all([loadKindsOf('mindmap\n  root'), loadKindsOf('mindmap\n  root')]);
    expect(spy.mock.calls.filter(([d]) => 'mindmap' in d)).toHaveLength(1);
  });
});

describe('B26: theme editor page fields follow FIELD_DEFS', () => {
  it('mindLayout is a select with its three layouts; gap keeps its own label', async () => {
    const { pageField } = await import('../../src/theme-editor/props.js');
    const env = { t: (k: string) => k, tf: (_k: string, fallback: string) => fallback };
    const f = pageField(env as never, 'mindLayout');
    expect(f.type).toBe('select');
    expect(f.options?.map((o) => (Array.isArray(o) ? o[0] : o))).toEqual(['both', 'right', 'down']);
    expect(pageField(env as never, 'gap')).toMatchObject({ type: 'number', label: 'te.ppGap' });
    expect(pageField(env as never, 'unknownKey')).toMatchObject({ type: 'text' });
  });
});
