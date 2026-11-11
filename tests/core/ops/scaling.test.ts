// Ops on adversarial code stay linear (P16): a long run of spaces inside the code made `/\s+$/` quadratic (40k
// spaces took 1.2 s), and line offsets were found by a scan from the top per line. Compared as a ratio (4× the input
// under 8× the time), so it holds on any machine; tiny durations are below timer noise and pass.
import { describe, expect, it } from 'vitest';
import { addNote } from '../../../src/core/ops/sequence.js';
import { lineStart } from '../../../src/core/ops/lines.js';
import { parse } from '../../../src/core/parse/index.js';
import type { SequenceModel } from '../../../src/core/model.js';

const time = (f: () => unknown): number => {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    f();
    best = Math.min(best, performance.now() - t);
  }
  return best;
};
const ratio = (small: () => unknown, big: () => unknown): number => {
  const s = time(small), b = time(big);
  return s < 2 ? 0 : b / s;
};

describe('ops scaling', () => {
  it('a note added after a long run of spaces inside the code', () => {
    const code = (n: number) => `sequenceDiagram\n  A->>B: hi${' '.repeat(n)}x\n`;
    const model = parse(code(10)) as SequenceModel;
    expect(addNote(code(10), model, { over: 'A' }).code).toMatch(/Note over A: note\n$/);
    expect(ratio(() => addNote(code(20_000), model, { over: 'A' }), () => addNote(code(80_000), model, { over: 'A' }))).toBeLessThan(8);
  });

  it('line offsets: one scan per code', () => {
    const code = (n: number) => Array.from({ length: n }, (_, i) => `  n${i}`).join('\n');
    expect(lineStart('a\nbc\n', 1)).toBe(2);
    expect(lineStart('a\nbc\n', 2)).toBe(5);
    expect(lineStart('a\nbc', 5)).toBe(4);
    const c = code(4000), big = code(16000);
    const each = (s: string) => () => {
      let n = 0;
      for (let li = 0; li < 4000; li++) n += lineStart(s, li * 4);
      return n;
    };
    expect(ratio(each(c), each(big))).toBeLessThan(8);
  });
});
