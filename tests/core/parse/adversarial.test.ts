// The parsers on adversarial sources (B1–B3, G13): linear time, never a throw, and `doc.too-complex` instead of a
// quadratic read past the limits. Time is compared as a ratio (4× the source must take well under 16× the time), so
// the test holds on any machine; tiny durations are below timer noise and pass.
import { describe, expect, it } from 'vitest';
import { LexBudget, lexBudget, TooComplex } from '../../../src/core/parse/limits.js';
import { parse } from '../../../src/core/parse/index.js';
import { renderToSvg } from '../../../src/core.js';
import { ADVERSARIAL, OVER_LIMIT } from '../../fixtures/adversarial.js';

const N = 10_000;

/** Best of three, in ms. */
const time = (f: () => unknown): number => {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    f();
    best = Math.min(best, performance.now() - t);
  }
  return best;
};

describe('parsers on adversarial sources', () => {
  it.each(ADVERSARIAL.map((c) => [c.name, c] as const))('%s: linear and never throws', (_, c) => {
    const small = c.make(N), big = c.make(4 * N);
    expect(() => parse(small)).not.toThrow();
    const t1 = time(() => parse(small)), t4 = time(() => parse(big));
    // quadratic growth would be ~16×; linear ~4×
    if (t4 > 20) expect(t4 / Math.max(t1, 1)).toBeLessThan(8);
  });

  it.each(OVER_LIMIT.map((c) => [c.name, c] as const))('%s: stops with doc.too-complex', (_, c) => {
    const t = performance.now();
    const m = parse(c.make(c.n));
    expect(performance.now() - t).toBeLessThan(5000);
    expect(m.diagnostics.map((d) => d.code)).toContain('doc.too-complex');
  });
});

describe('large inputs never throw (B3)', () => {
  // `Math.min(...lines)` over a note's or a state's lines overflowed the call stack
  const note = `stateDiagram-v2\nnote left of A\n${'  x\n'.repeat(200_000)}end note\n`;
  const refs = `stateDiagram-v2\n${'A\n'.repeat(200_000)}`;
  it.each([['an 800 KB note', note], ['a state on 200 000 lines', refs]])('%s', async (_, code) => {
    expect(() => parse(code)).not.toThrow();
    await expect(renderToSvg(code)).resolves.toBeTypeOf('string');
  });
});

describe('the lexer step budget', () => {
  it('is linear in the source and throws TooComplex when spent', () => {
    expect(lexBudget(1000)).toBeLessThan(lexBudget(2000));
    const b = new LexBudget(0);
    expect(() => b.step(lexBudget(0))).not.toThrow();
    expect(() => b.step()).toThrow(TooComplex);
  });
});
