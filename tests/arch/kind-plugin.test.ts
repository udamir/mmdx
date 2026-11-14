// A11e acceptance: a new diagram type needs no edit of mmdx's own files. A test-only "checklist" kind registers
// through the one manifest call (`registerKindPlugin`) and is then detected, parsed, drawn, outlined, exported,
// themed and listed like a built-in type; no file under src/ names it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext } from '../../src/core/context.js';
import { toPortableMermaid } from '../../src/core/export/portable.js';
import type { ExtrasKind } from '../../src/core/kind/extras-types.js';
import type { ViewKind } from '../../src/core/kind/types.js';
import { DIAGRAM_TYPES, isDiagramType, kindInfo } from '../../src/core/kinds/info.js';
import { outline } from '../../src/core/outline.js';
import { detectType } from '../../src/core/parse/dispatch.js';
import { renderSourceWith, standaloneSvg } from '../../src/core/pipeline-core.js';
import { el, text } from '../../src/core/scene/build.js';
import { themeSection, THEME_SECTIONS } from '../../src/core/schema/style-fields.js';
import { starterSource } from '../../src/core/starter.js';
import { ThemeRegistry } from '../../src/core/theme/registry.js';
import { loadDiffKind, loadedKinds, loadExtrasKind, loadKind } from '../../src/platform/kinds.js';
import { diffDiagrams } from '../../src/diff/kinds.js';
import { kindUi } from '../../src/ui/diagram/kind-ui.js';
import { registerKindPlugin } from '../../src/view/kind-plugin.js';

interface ChecklistModel {
  type: 'checklist';
  items: { id: string; label: string; done: boolean }[];
  diagnostics: [];
}

const parse = (code: string): ChecklistModel => ({
  type: 'checklist',
  diagnostics: [],
  items: code.split('\n').slice(1).flatMap((l, i) => {
    const m = /^\s*\[( |x)\]\s*(.+)$/.exec(l);
    return m ? [{ id: `i${i}`, label: m[2]!, done: m[1] === 'x' }] : [];
  }),
});

const VIEW = {
  type: 'checklist',
  parse,
  empty: () => ({ type: 'checklist', items: [], diagnostics: [] }),
  render: (m: ChecklistModel) => ({
    defs: [],
    body: m.items.flatMap((it, i) => [el('rect', { x: 0, y: i * 24, width: 16, height: 16 }, `box:${it.id}`), text({ x: 24, y: i * 24 + 12 }, [{ runs: [{ text: it.label }] }] as never, `label:${it.id}`)]),
    bounds: { x: 0, y: 0, w: 200, h: Math.max(24, m.items.length * 24) },
    geom: { type: null },
    presetsUsed: {},
  }),
  items: (m: ChecklistModel) => m.items.map((it) => ({ kind: 'node' as const, id: it.id })),
  parents: () => [],
  connectors: () => [],
  summary: (m: ChecklistModel) => ({ key: 'label.checklist' as const, params: { items: m.items.length } }),
} as unknown as ViewKind;

const EXTRAS = {
  type: 'checklist',
  outline: (m: ChecklistModel) => m.items.map((it) => ({ text: `${it.done ? '☑' : '☐'} ${it.label}` })),
} as unknown as ExtrasKind;

registerKindPlugin({
  info: { type: 'checklist', header: /^checklist\b/, starter: 'checklist\n', label: 'type.checklist', styleStatements: false },
  modules: { view: async () => ({ VIEW }), extras: async () => ({ EXTRAS }) },
  themeSection: { title: 'Checklist', routing: false, items: [] },
  ui: { names: { name: 'Checklist', title: 'Checklist', blurb: 'Things to do, ticked off' }, sample: 'checklist\n  [x] Sample' },
});

const SRC = 'checklist\n  [x] Write the kind\n  [ ] Ship it\n';

describe('a kind plugin (A11e)', () => {
  it('is a diagram type: detected, listed, with a starter', () => {
    expect(isDiagramType('checklist')).toBe(true);
    expect(DIAGRAM_TYPES.at(-1)).toBe('checklist');
    expect(detectType(SRC)).toBe('checklist');
    expect(starterSource('checklist')).toBe('checklist\n');
    expect(kindInfo('checklist')?.label).toBe('type.checklist');
  });

  it('loads on demand, parses and draws through the generic pipeline', async () => {
    await loadKind('checklist');
    const r = renderSourceWith(loadedKinds(), SRC, createContext());
    expect(r.model.type).toBe('checklist');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(standaloneSvg(r)).toContain('Write the kind');
  });

  it('has an outline, and a portable export that passes it through', async () => {
    await loadExtrasKind('checklist');
    const model = parse(SRC) as never;
    expect(outline(model)).toEqual([{ text: '☑ Write the kind' }, { text: '☐ Ship it' }]);
    const r = renderSourceWith(loadedKinds(), SRC, createContext());
    expect(toPortableMermaid(SRC, r.doc.meta, model, r.theme, r.rctx.color)).toBe(SRC);
  });

  it('without a diff module, is "not compared" in a diff instead of failing it (B40, BUG-004)', async () => {
    await expect(loadDiffKind('checklist')).resolves.toBeUndefined();
    const d = await diffDiagrams(SRC, SRC.replace('[ ] Ship it', '[x] Ship it'));
    expect(d.diagnostics?.map((x) => x.code)).toEqual(['kind.not-loaded']);
    expect(d.items).toEqual([]);
  });

  it('has a theme section and a UI', () => {
    const themes = new ThemeRegistry();
    themes.register({ id: 'base', name: 'Base' });
    themes.register({ id: 'mine', name: 'Mine', extends: 'base', checklist: { node: { fill: '#ffeeaa' } } });
    expect((themes.get('mine') as unknown as Record<string, unknown>)['checklist']).toEqual({ node: { fill: '#ffeeaa' } });
    expect(THEME_SECTIONS.at(-1)?.type).toBe('checklist');
    expect(themeSection('checklist').title).toBe('Checklist');
    expect(kindUi('checklist').names.title).toBe('Checklist');
  });

  it('needs no edit of mmdx: no file under src/ names it', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    // the code (icon data names "checklist" as a search term of its list icons)
    expect(walk('src').filter((f) => f.endsWith('.ts') && /checklist/i.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
