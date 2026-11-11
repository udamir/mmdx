// Diff alignment scales (P3, P11): 4× the items must take well under 16× the time (a quadratic step would). Compared as
// a ratio so it holds on any machine; tiny durations are below timer noise and pass.
import { describe, expect, it } from 'vitest';
import { diffDiagrams, renderDiff } from '../../../src/core/diff/all.js';
import { createContext } from '../../../src/core/context.js';
import { align } from '../../../src/core/diff/kit.js';

/** Best of three, in ms. */
const time = (f: () => unknown): number => {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
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

describe('diff scaling', () => {
  it('align is near-linear for an edited list and for a replaced one', () => {
    const list = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ k: i % 7 === 0 ? `${tag}${i}` : `x${i}`, g: `g${i % 50}` }));
    const run = (n: number, tag: string) => () => align(list(n, 'a'), list(n, tag), (x) => x.k, (x) => x.g);
    expect(ratio(run(8000, 'b'), run(32000, 'b'))).toBeLessThan(8);
    const swap = (n: number) => () => align(list(n, 'a').map((x) => ({ ...x, k: 'a' + x.k })), list(n, 'b'), (x) => x.k, () => '');
    expect(ratio(swap(8000), swap(32000))).toBeLessThan(8);
  });

  it('align pairs a gap by group in order, the rest left on each side', () => {
    const r = align(['a1', 'k', 'a2', 'c'], ['b1', 'k', 'b2', 'b3'], (x) => x, (x) => x.slice(0, 1) === 'c' ? 'c' : 'n');
    expect(r.pairs).toEqual([['a1', 'b1'], ['k', 'k'], ['a2', 'b2']]);
    expect(r.onlyA).toEqual(['c']);
    expect(r.onlyB).toEqual(['b3']);
  });

  it('a mindmap with every node renamed diffs near-linearly', () => {
    // a new root label moves every node's place in the tree: matched by label, ranked in a flat list
    const mm = (n: number, root: string) => `mindmap\n  root((${root}))\n` + Array.from({ length: n }, (_, i) => `    n${i}[L${i % 40}]`).join('\n');
    const run = (n: number) => () => renderDiff(mm(n, 'R'), mm(n, 'S'), createContext());
    expect(ratio(run(1000), run(4000))).toBeLessThan(8);
  });

  it('a flowchart and a sequence with most items edited diff near-linearly', () => {
    const fc = (n: number, t: string) => 'flowchart TD\n' + Array.from({ length: n }, (_, i) => `  n${i}[${i % 3 ? 'L' + i : t + i}] --> n${i + 1}`).join('\n');
    const sq = (n: number, t: string) => 'sequenceDiagram\n' + Array.from({ length: n }, (_, i) => `  P${i % 9}->>P${(i + 1) % 9}: ${i % 3 ? 'm' + i : t + i}`).join('\n');
    expect(ratio(() => diffDiagrams(fc(500, 'a'), fc(500, 'b')), () => diffDiagrams(fc(2000, 'a'), fc(2000, 'b')))).toBeLessThan(8);
    expect(ratio(() => diffDiagrams(sq(500, 'a'), sq(500, 'b')), () => diffDiagrams(sq(2000, 'a'), sq(2000, 'b')))).toBeLessThan(8);
  });
});
