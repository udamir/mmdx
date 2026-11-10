// Architecture guard (A1): the import graph follows the layer model and modules reach the kernel only through their
// scope. Today's violations are baselined in tests/arch/baseline/; the baseline may only shrink — a new violation
// fails, and so does a fixed one until its line is removed from the baseline in the same change.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM tool without type declarations
import { compareBaseline, edgeViolation, layerViolations, moduleViolations, readBaseline } from '../../tools/check-layers.mjs';

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
  });
});

describe('modules', () => {
  it('no module uses kernel DOM, writes the store or registers outside its scope beyond the baseline', () => {
    const r = compareBaseline(moduleViolations(ROOT), readBaseline(join(BASE, 'modules.txt')));
    expect(r.added, 'new or grown module violations').toEqual([]);
    expect(r.fixed, 'fixed or shrunk — update these lines in tests/arch/baseline/modules.txt').toEqual([]);
  });
});
