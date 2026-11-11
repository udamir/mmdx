// B40: a diff whose type has no diff kind registered says so instead of reporting "no changes".
import { describe, expect, it } from 'vitest';
import { diffDiagramsWith } from '../../../src/core/diff/index.js';
import { ALL_VIEW_KINDS } from '../../../src/core/kinds/all.js';
import { ALL_DIFF_KINDS } from '../../../src/core/kinds/all-diff.js';
import { diffKind, forgetDiffs, registerDiffs } from '../../../src/core/kinds/registry.js';

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
});
