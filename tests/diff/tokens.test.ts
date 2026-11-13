import { describe, expect, it } from 'vitest';
import { DIFF_COLORS, MARKS } from '../../src/core/diff/annotate.js';
import { DIFF_TOKENS } from '../../src/diff/styles.js';

/** The custom properties of one rule of the token sheet. */
function tokensOf(selector: string): Map<string, string> {
  const start = DIFF_TOKENS.indexOf(`${selector} {`);
  const body = DIFF_TOKENS.slice(start, DIFF_TOKENS.indexOf('}', start));
  return new Map([...body.matchAll(/(--mmdx-diff-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const NAME = { added: 'add', removed: 'del', content: 'content', layout: 'layout', style: 'style' } as const;

describe('diff highlight tokens (BUG-011)', () => {
  it.each([['light', ':host'], ['dark', ':host([data-ui="dark"])']] as const)('the %s tokens are the colours exports draw with', (scheme, selector) => {
    const tokens = tokensOf(selector);
    const colors = DIFF_COLORS[scheme];
    for (const m of MARKS) {
      expect(tokens.get(`--mmdx-diff-${NAME[m]}`)).toBe(colors.marks[m].c);
      expect(tokens.get(`--mmdx-diff-${NAME[m]}-bg`)).toBe(colors.marks[m].bg);
    }
    expect(Number(tokens.get('--mmdx-diff-dim'))).toBe(colors.dim);
  });
});
