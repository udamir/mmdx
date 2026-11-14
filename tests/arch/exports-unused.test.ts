// Architecture guard: no exported value that nobody imports (audit success criterion; D10, D14). Today's are listed in
// tests/arch/baseline/exports-unused.txt, which may only shrink: un-export or delete a value and remove its line.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unusedExports } from '../../tools/check-exports.mjs';

const ROOT = join(__dirname, '../..');

const baseline = new Set(
  readFileSync(join(__dirname, 'baseline/exports-unused.txt'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#')),
);

describe('exported values nobody imports', () => {
  const found = unusedExports(ROOT);

  it('no new one', () => {
    expect(found.filter((k) => !baseline.has(k)), 'un-export it, or delete it if its own file does not use it either').toEqual([]);
  });

  it('the baseline lists only current ones', () => {
    const have = new Set(found);
    expect([...baseline].filter((k) => !have.has(k)), 'remove from tests/arch/baseline/exports-unused.txt').toEqual([]);
  });
});
