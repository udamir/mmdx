import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext } from '../../../src/core/context.js';
import { diffDiagrams, renderDiff, renderDiffToSvg } from '../../../src/core/diff/all.js';
import { diffReport, unifiedDiff } from '../../../src/core/diff/index.js';
import { createStaticMeasurer } from '../../../src/core/text/measure.js';

const sample = (name: string) => [0, 1].map((i) => readFileSync(`apps/studio-site/diff-samples/${name}.${i ? 'after' : 'before'}.mmd`, 'utf8')) as [string, string];

describe('renderDiff', () => {
  it('renders before, merged and after in one coordinate space, changes in drawing order', () => {
    const d = renderDiff(...sample('architecture'), createContext());
    expect(d.merged).not.toBeNull();
    expect(d.changes.length).toBe(d.diff.counts.added + d.diff.counts.removed + d.diff.counts.changed);
    for (const r of [d.before, d.after, d.merged!]) {
      expect(r.result.bounds.x).toBeGreaterThanOrEqual(d.bounds.x);
      expect(r.result.bounds.x + r.result.bounds.w).toBeLessThanOrEqual(d.bounds.x + d.bounds.w + 0.01);
    }
    expect(d.before.themeId).toBe(d.after.themeId);
  });

  it('filters: hidden added items and ignored facets leave the change list', () => {
    const [a, b] = sample('architecture');
    const all = renderDiff(a, b, createContext());
    const some = renderDiff(a, b, createContext(), { hide: { added: true }, ignore: { style: true } });
    expect(some.changes.some((c) => c.status === 'added')).toBe(false);
    expect(some.changes.some((c) => c.facets.includes('style'))).toBe(false);
    expect(some.raw.counts).toEqual(all.raw.counts);
    expect(some.sources.after).not.toContain('classDef');
  });
});

describe('renderDiffToSvg', () => {
  it('is deterministic and marks text changes with fixed classes', async () => {
    const [a, b] = sample('architecture');
    const ctx = () => createContext({ measure: createStaticMeasurer(), idPrefix: 'd-' });
    const s1 = await renderDiffToSvg(a, b, { ctx: ctx() });
    const s2 = await renderDiffToSvg(a, b, { ctx: ctx() });
    expect(s1).toBe(s2);
    expect(s1.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(s1).toContain('<tspan class="dx-ins">');
    expect(s1).toContain('class="dx-hl dx-added"');
    expect(s1).not.toMatch(/[​‌‍⁠]/);
  });

  it('composes side by side with titles', async () => {
    const svg = await renderDiffToSvg(...sample('schema'), { view: 'side', titles: { before: 'main', after: 'feature' } });
    expect(svg).toContain('>main</tspan>');
    expect(svg).toContain('data-mmdx-diff="side"');
  });

  it('escapes diagram text', async () => {
    const svg = await renderDiffToSvg('flowchart LR\n  a[A] --> b[B]', 'flowchart LR\n  a["<script>x</script>"] --> b[B]');
    expect(svg).not.toContain('<script>');
  });
});

describe('reports', () => {
  it('markdown lists counts and every change, escaped', () => {
    const d = diffDiagrams(...sample('architecture'));
    const md = diffReport(d, { format: 'markdown', before: { id: 'abc123' }, after: { id: 'def456', message: 'Add tracing' }, name: 'arch' });
    expect(md).toContain('### Diagram changes: arch');
    expect(md).toContain('`abc123`');
    expect(md).toMatch(/\*\*\d+\*\* added/);
    expect(md).toContain('#### Removed');
    const json = JSON.parse(diffReport(d, { format: 'json' }));
    expect(json.version).toBe(1);
    expect(json.items.every((x: { status: string }) => x.status !== 'unchanged')).toBe(true);
  });

  it('unified diff has standard headers and hunks', () => {
    const p = unifiedDiff('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\n', { name: 'x.mmdx', context: 1 });
    expect(p).toBe('--- a/x.mmdx\n+++ b/x.mmdx\n@@ -1,4 +1,5 @@\n a\n-b\n+B\n c\n d\n+e\n');
    expect(unifiedDiff('same', 'same')).toBe('');
  });

  it('unified diff of the samples applies with git apply', () => {
    const pairs: [string, string][] = [...['architecture', 'sequence', 'er-many'].map(sample), ['a\nb\nc', 'a\nB\nc'], ['a\nb\n', 'a\nb\nc'], ['x\ny', 'x\ny\n']];
    for (const [a, b] of pairs) {
      const dir = mkdtempSync(join(tmpdir(), 'mmdx-diff-'));
      writeFileSync(join(dir, 'diagram.mmdx'), a);
      writeFileSync(join(dir, 'x.patch'), unifiedDiff(a, b));
      execFileSync('git', ['apply', '--unidiff-zero', 'x.patch'], { cwd: dir });
      expect(readFileSync(join(dir, 'diagram.mmdx'), 'utf8')).toBe(b);
    }
  });
});
