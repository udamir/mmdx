// Architecture guard: no function over 300 lines in src/. Today's long functions are baselined with their length in
// tests/arch/baseline/funcs.txt; each may shrink but not grow, and no new one may appear. A function that drops under
// the limit is removed from the baseline in the same change.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { longFunctions, MAX_LINES } from '../../tools/check-funcs.mjs';

const ROOT = join(__dirname, '../..');

const baseline = new Map(
  readFileSync(join(__dirname, 'baseline/funcs.txt'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const [lines, key] = l.split('\t');
      return [key!, Number(lines)] as const;
    }),
);

describe(`functions over ${MAX_LINES} lines`, () => {
  const found: { key: string; lines: number }[] = longFunctions(ROOT);

  it('no new long function and no baselined one grows', () => {
    expect(found.filter((f) => !baseline.has(f.key)).map((f) => `${f.lines}\t${f.key}`), 'new').toEqual([]);
    expect(found.filter((f) => f.lines > baseline.get(f.key)!).map((f) => `${f.lines} > ${baseline.get(f.key)}\t${f.key}`), 'grown').toEqual([]);
  });

  it('the baseline lists only functions still over the limit', () => {
    const have = new Set(found.map((f) => f.key));
    expect([...baseline.keys()].filter((k) => !have.has(k)), 'remove from tests/arch/baseline/funcs.txt').toEqual([]);
  });
});
