// B40: a diff whose type has no diff kind registered says so instead of reporting "no changes".
import { describe, expect, it } from 'vitest';
import { diffDiagramsWith } from '../../../src/core/diff/index.js';
import { ALL_VIEW_KINDS } from '../../../src/core/kinds/all.js';
import { ALL_DIFF_KINDS } from '../../../src/core/kinds/all-diff.js';
import { diffKind, forgetDiffs, KindNotLoaded, registerDiffs, requireKind } from '../../../src/core/kinds/registry.js';
import { renderDiffWith } from '../../../src/core/diff/render.js';
import { createContext } from '../../../src/core/context.js';
import { annotate, shapeOf } from '../../../src/core/diff/annotate.js';

describe('diff without a diff kind (B40)', () => {
  it('A-->B vs A-->C: kind.not-loaded, not an empty diff', () => {
    forgetDiffs();
    try {
      expect(diffKind('flowchart')).toBeUndefined();
      const d = diffDiagramsWith(ALL_VIEW_KINDS, 'flowchart LR\n  A --> B', 'flowchart LR\n  A --> C');
      expect(d.diagnostics?.map((x) => x.code)).toEqual(['kind.not-loaded']);
    } finally {
      registerDiffs(ALL_DIFF_KINDS);
    }
    // with the kind: a real diff and no diagnostic
    expect(diffDiagramsWith(ALL_VIEW_KINDS, 'flowchart LR\n  A --> B', 'flowchart LR\n  A --> C').diagnostics).toBeUndefined();
  });

  it('lookups fail closed (A4): requireKind throws KindNotLoaded; a diff render without the kind has no merged picture', () => {
    forgetDiffs();
    try {
      expect(() => requireKind('flowchart', 'diff')).toThrow(KindNotLoaded);
      try {
        requireKind('flowchart', 'diff');
      } catch (e) {
        expect((e as KindNotLoaded).code).toBe('kind.not-loaded');
      }
      const r = renderDiffWith(ALL_VIEW_KINDS, 'flowchart LR\n  A --> B', 'flowchart LR\n  A --> C', createContext());
      expect(r.merged).toBeNull();
      expect(r.raw.diagnostics?.map((x) => x.code)).toEqual(['kind.not-loaded']);
    } finally {
      registerDiffs(ALL_DIFF_KINDS);
    }
    expect(requireKind('flowchart', 'diff').type).toBe('flowchart');
  });

  it('annotations fail closed too (BUG-030): a shape lookup without the diff kind throws KindNotLoaded, not an empty overlay', () => {
    const d = renderDiffWith(ALL_VIEW_KINDS, 'flowchart LR\n  A --> B', 'flowchart LR\n  A --> C', createContext());
    const geom = d.after.result.geom;
    expect(shapeOf(geom, 'node', 'A')).not.toBeNull();
    const input = { view: 'after' as const, result: d.after.result, before: d.before.result, changes: d.changes, measure: d.after.rctx.measure };
    expect(annotate(input).overlay.length).toBeGreaterThan(0);
    forgetDiffs();
    try {
      expect(() => shapeOf(geom, 'node', 'A')).toThrow(KindNotLoaded);
      expect(() => annotate(input)).toThrow(KindNotLoaded);
    } finally {
      registerDiffs(ALL_DIFF_KINDS);
    }
  });
});
