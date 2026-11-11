// Architecture guard (D8): no stylesheet in src/ defines a class that no code can put on an element.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deadClasses } from '../../tools/check-css.mjs';

describe('CSS classes', () => {
  it('every class a stylesheet defines is named by some code', () => {
    expect(deadClasses(join(__dirname, '../..'))).toEqual([]);
  });
});
