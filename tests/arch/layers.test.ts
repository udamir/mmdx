// Architecture guard (A1): the import graph follows the layer model and modules reach the kernel only through their
// scope. Today's violations are baselined in tests/arch/baseline/; the baseline may only shrink — a new violation
// fails, and so does a fixed one until its line is removed from the baseline in the same change.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockContractGaps, compareBaseline, coreLayerOf, edgeViolation, importCycles, kernelSignals, layerViolations, manualCleanupArrays, moduleViolations, readBaseline, signalWrites, signalWritesIn } from '../../tools/check-layers.mjs';

const ROOT = join(__dirname, '../..');
const BASE = join(__dirname, 'baseline');

describe('layers', () => {
  it('no import breaks the layer model beyond the baseline', () => {
    const r = compareBaseline(layerViolations(ROOT), readBaseline(join(BASE, 'layers.txt')));
    expect(r.added, 'new layer violations').toEqual([]);
    expect(r.fixed, 'fixed — remove these lines from tests/arch/baseline/layers.txt').toEqual([]);
  });

  it('the rules catch what they should', () => {
    expect(edgeViolation({ from: 'core/parse/er.ts', to: 'ui/i18n.ts', kind: 'value' })).toMatch(/^upward/);
    expect(edgeViolation({ from: 'editor/modules/a/x.ts', to: 'editor/modules/b/y.ts', kind: 'value' })).toMatch(/^module → module/);
    expect(edgeViolation({ from: 'editor/kinds/er.ts', to: 'editor/modules/shapes/drop.ts', kind: 'value' })).toBe('editor kinds → editor module');
    expect(edgeViolation({ from: 'diff/history.ts', to: 'editor/core.ts', kind: 'type' })).toMatch(/^product → product/);
    expect(edgeViolation({ from: 'view/core.ts', to: 'core/types.ts', kind: 'value' })).toBeNull();
    // core's sub-layers: C0 base … C9 assembly, a stage's types.ts is C0
    expect(edgeViolation({ from: 'core/kind/types.ts', to: 'core/render/common.ts', kind: 'type' })).toBe('upward core C1 → C5');
    expect(edgeViolation({ from: 'core/kind/types.ts', to: 'core/render/types.ts', kind: 'type' })).toBeNull();
    expect(edgeViolation({ from: 'core/render/flowchart.ts', to: 'core/parse/dispatch.ts', kind: 'value' })).toBeNull();
    expect([coreLayerOf('types.ts'), coreLayerOf('kinds/registry.ts'), coreLayerOf('meta/keys.ts'), coreLayerOf('parse/er.ts'), coreLayerOf('layout/tree.ts')]).toEqual([0, 1, 2, 3, 4]);
    expect([coreLayerOf('render/er.ts'), coreLayerOf('ops/er.ts'), coreLayerOf('diff/er.ts'), coreLayerOf('kinds/er-ops.ts'), coreLayerOf('kinds/all.ts')]).toEqual([5, 6, 7, 8, 9]);
    // a type's folder (A12): each file the layer of its stage
    expect(['parse', 'parse-id', 'render', 'presets', 'style', 'ops', 'ops-edge', 'diff', 'view', 'ops-kind', 'diff-kind', 'extras'].map((f) => coreLayerOf(`kinds/er/${f}.ts`))).toEqual([3, 3, 5, 5, 5, 6, 6, 7, 8, 8, 8, 8]);
    expect(edgeViolation({ from: 'core/kinds/er/view.ts', to: 'core/kinds/er/render.ts', kind: 'value' })).toBeNull();
    expect(edgeViolation({ from: 'core/kinds/er/ops-kind.ts', to: 'core/kinds/er/render.ts', kind: 'value' })).toBe('ops/kinds → full renderer');
    expect(edgeViolation({ from: 'core/kinds/er/render.ts', to: 'core/kinds/er/ops.ts', kind: 'value' })).toMatch(/^upward core C5 → C6/);
  });
});

describe('blocks (A1, A5)', () => {
  it('every block exports its CSS and has a story and a test, beyond the baseline', () => {
    const r = compareBaseline(blockContractGaps(ROOT), readBaseline(join(BASE, 'blocks.txt')));
    expect(r.added, 'blocks missing their CSS export, story or test').toEqual([]);
    expect(r.fixed, 'fixed — remove these lines from tests/arch/baseline/blocks.txt').toEqual([]);
  });
});

describe('cleanup arrays (R14)', () => {
  it('what is set up goes through an Owner or a module scope, not a hand-kept array of undo functions', () => {
    expect(manualCleanupArrays(ROOT)).toEqual([]);
  });
});

describe('cycles', () => {
  it('no import cycle beyond the baseline (core has none)', () => {
    const r = compareBaseline(importCycles(ROOT), readBaseline(join(BASE, 'cycles.txt')));
    expect(r.added, 'new import cycles').toEqual([]);
    expect(r.fixed, 'fixed — remove these lines from tests/arch/baseline/cycles.txt').toEqual([]);
    expect(importCycles(ROOT).filter((c) => c.startsWith('core/'))).toEqual([]);
  });
});

describe('modules', () => {
  it('no module uses kernel DOM, writes the store or registers outside its scope beyond the baseline', () => {
    const r = compareBaseline(moduleViolations(ROOT), readBaseline(join(BASE, 'modules.txt')));
    expect(r.added, 'new or grown module violations').toEqual([]);
    expect(r.fixed, 'fixed or shrunk — update these lines in tests/arch/baseline/modules.txt').toEqual([]);
  });
});

describe('signal ownership (A7, BUG-015)', () => {
  it('no module writes a kernel or editor-core signal beyond the baseline', () => {
    const r = compareBaseline(signalWrites(ROOT), readBaseline(join(BASE, 'signals.txt')));
    expect(r.added, 'a module writes a kernel signal: call its owner method, or contribute / claim through the scope').toEqual([]);
    expect(r.fixed, 'fixed or shrunk — update these lines in tests/arch/baseline/signals.txt').toEqual([]);
  });

  it('the rule catches what it should', () => {
    const names = kernelSignals(ROOT);
    // the kernel's state, its lists and slots, and the editor core's
    for (const n of ['panels', 'tool', 'compact', 'stackInsets', 'strokes', 'dockItems', 'exportFormats', 'dockFlyout', 'paramItems', 'panelItems', 'enteredGroup', 'issueCount']) expect(names.has(n), n).toBe(true);
    const text = [
      'core.stackInsets.set({ left: 0, right: 0 });',
      'core.dockItems.update((l) => l);',
      'scope.core.panels.set({});',
      '// core.tool.set(\'hand\') in a comment',
      'core.storage.set(\'k\', 1);',
      'core.setStackInsets(null);',
    ].join('\n');
    expect([...signalWritesIn(text, names)]).toEqual([['core.stackInsets.set', 1], ['core.dockItems.update', 1], ['core.panels.set', 1]]);
  });
});
