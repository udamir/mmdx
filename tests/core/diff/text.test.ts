import { diffArrays as jsDiffArrays } from 'diff';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffArrays, diffLines, diffWords, hunks, markRuns, mergeText, MARK, words } from '../../../src/core/diff/index.js';

const edits = (runs: { op?: string; added?: boolean; removed?: boolean; items?: unknown[]; value?: unknown[] }[]) =>
  runs.reduce((n, r) => n + ((r.op ? r.op !== 'same' : r.added || r.removed) ? (r.items ?? r.value)!.length : 0), 0);

const sample = (name: string, side: string) => readFileSync(`apps/studio-site/diff-samples/${name}.${side}.mmd`, 'utf8').split('\n');

describe('Myers diff', () => {
  it('finds a shortest edit script (same size as jsdiff on the samples)', () => {
    for (const name of ['architecture', 'sequence', 'schema', 'flow-many', 'er-many', 'seq-many']) {
      const a = sample(name, 'before'), b = sample(name, 'after');
      const ours = diffArrays(a, b);
      expect(edits(ours)).toBe(edits(jsDiffArrays(a, b)));
      // applying the script gives the after text back
      const rebuilt = ours.flatMap((r) => (r.op === 'del' ? [] : r.items));
      expect(rebuilt).toEqual(b);
    }
  });

  it('handles empty sides and identical lists', () => {
    expect(diffArrays([], ['a'])).toEqual([{ op: 'add', items: ['a'] }]);
    expect(diffArrays(['a'], [])).toEqual([{ op: 'del', items: ['a'] }]);
    expect(diffArrays(['a', 'b'], ['a', 'b'])).toEqual([{ op: 'same', items: ['a', 'b'] }]);
    expect(diffArrays([], [])).toEqual([]);
  });

  it('puts removals before additions in a changed stretch', () => {
    expect(diffArrays(['a', 'x', 'c'], ['a', 'y', 'c']).map((r) => r.op)).toEqual(['same', 'del', 'add', 'same']);
  });
});

describe('words and lines', () => {
  it('keeps punctuation on the word and line breaks as tokens', () => {
    expect(words('GET /networks/{name}  now\nok')).toEqual(['GET', '/networks/{name}', 'now', '\n', 'ok']);
    expect(diffWords('Load Balancer', 'Load Balancer (L7)')).toEqual([{ op: 'same', value: 'Load Balancer' }, { op: 'add', value: '(L7)' }]);
  });

  it('numbers both sides of a line diff', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'c', 'd'])).toEqual([
      { op: 'same', text: 'a', a: 1, b: 1 },
      { op: 'del', text: 'b', a: 2 },
      { op: 'same', text: 'c', a: 3, b: 2 },
      { op: 'add', text: 'd', b: 3 },
    ]);
  });

  it('collapses long unchanged runs into hunks', () => {
    const a = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const b = a.map((x, i) => (i === 15 ? 'changed' : x));
    const hs = hunks(diffLines(a, b));
    expect(hs.filter((h) => 'skip' in h).map((h) => (h as { skip: number }).skip)).toEqual([12, 11]);
  });
});

describe('marks', () => {
  it('carries an open mark over wrapped lines', () => {
    const m = mergeText('one two three four', 'one five');
    const lines = [m.slice(0, 8), m.slice(8)];
    const runs = markRuns(lines);
    expect(runs.flat().filter((r) => r.mark === 'del').map((r) => r.text).join('')).toBe('two three four');
    expect(m.startsWith(`one ${MARK.DEL_OPEN}`)).toBe(true);
  });
});
