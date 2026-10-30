import { describe, expect, it } from 'vitest';
import { batch, computed, effect, signal } from '../../src/ui/signal.js';

describe('signals', () => {
  it('effects re-run when a read signal changes, and only then', () => {
    const a = signal(1), b = signal(10);
    const seen: number[] = [];
    effect(() => { seen.push(a()); });
    b.set(11);
    a.set(2);
    a.set(2);
    expect(seen).toEqual([1, 2]);
  });
  it('computed is lazy and memoized', () => {
    const a = signal(2);
    let runs = 0;
    const sq = computed(() => { runs++; return a() * a(); });
    expect(runs).toBe(0);
    expect(sq()).toBe(4);
    expect(sq()).toBe(4);
    expect(runs).toBe(1);
    a.set(3);
    expect(sq()).toBe(9);
    expect(runs).toBe(2);
  });
  it('effects depending on computed update', () => {
    const a = signal(1);
    const dbl = computed(() => a() * 2);
    const seen: number[] = [];
    effect(() => { seen.push(dbl()); });
    a.set(5);
    expect(seen).toEqual([2, 10]);
  });
  it('batch coalesces notifications', () => {
    const a = signal(1), b = signal(1);
    let runs = 0;
    effect(() => { a(); b(); runs++; });
    batch(() => { a.set(2); b.set(2); });
    expect(runs).toBe(2);
  });
  it('disposed effects stop and run their teardown', () => {
    const a = signal(0);
    let tear = 0, runs = 0;
    const stop = effect(() => { a(); runs++; return () => { tear++; }; });
    a.set(1);
    stop();
    a.set(2);
    expect(runs).toBe(2);
    expect(tear).toBe(2);
  });
  it('dependencies are re-tracked on each run', () => {
    const flag = signal(true), x = signal(1), y = signal(1);
    let runs = 0;
    effect(() => { runs++; if (flag()) x(); else y(); });
    flag.set(false);
    x.set(2); // no longer a dependency
    expect(runs).toBe(2);
    y.set(2);
    expect(runs).toBe(3);
  });
});
