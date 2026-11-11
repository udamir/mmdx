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
  it('an effect reading a signal and a computed of it sees both new values and runs once (glitch-free)', () => {
    const a = signal(1);
    const dbl = computed(() => a() * 2);
    const quad = computed(() => dbl() * 2);
    const log: string[] = [];
    effect(() => { log.push(`a=${a()} dbl=${dbl()} quad=${quad()}`); });
    a.set(2);
    expect(log).toEqual(['a=1 dbl=2 quad=4', 'a=2 dbl=4 quad=8']);
    batch(() => { a.set(3); a.set(4); });
    expect(log.at(-1)).toBe('a=4 dbl=8 quad=16');
    expect(log).toHaveLength(3);
  });
  it('a disposed computed lets go of its inputs; reads still compute, and readers follow the inputs', () => {
    const a = signal(1);
    let runs = 0;
    const dbl = computed(() => { runs++; return a() * 2; });
    const seen: number[] = [];
    const stop = effect(() => { seen.push(dbl()); });
    stop();
    dbl.dispose();
    runs = 0;
    a.set(2);
    expect(runs).toBe(0);
    expect(dbl()).toBe(4);
    effect(() => { seen.push(dbl()); });
    a.set(3);
    expect(seen).toEqual([2, 4, 6]);
  });
});

describe('robustness (R12)', () => {
  it('a throwing effect does not drop the rest of the batch; the error comes out after it', () => {
    const s = signal(0);
    const seen: number[] = [];
    effect(() => {
      if (s() === 1) throw new Error('boom');
    });
    effect(() => void seen.push(s()));
    expect(() => s.set(1)).toThrow('boom');
    expect(seen).toEqual([0, 1]);
    // the throwing effect still follows what it read
    s.set(2);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('a set inside an effect does not flush re-entrantly: effects run in order, each once', () => {
    const a = signal(0), b = signal(0);
    const log: string[] = [];
    effect(() => {
      log.push(`A${a()}`);
      if (a() === 1) b.set(1);
    });
    effect(() => void log.push(`B${b()}:${a()}`));
    log.length = 0;
    a.set(1);
    // the second effect runs once, after the first, and sees both new values (no nested pass in between)
    expect(log).toEqual(['A1', 'B1:1']);
  });

  it('an effect that keeps setting what it reads stops with an error (cycle guard)', () => {
    const s = signal(0);
    const stop = (() => {
      try {
        return effect(() => s.set(s() + 1));
      } catch (e) {
        return e;
      }
    })();
    expect(String(stop)).toMatch(/cycle/i);
    expect(s.peek()).toBeLessThan(200);
  });

  it('a computed whose value stays the same does not re-run its readers', () => {
    const n = signal(2);
    const even = computed(() => n() % 2 === 0);
    let runs = 0;
    effect(() => {
      even();
      runs++;
    });
    n.set(4);
    n.set(6);
    expect(runs).toBe(1);
    n.set(7);
    expect(runs).toBe(2);
    expect(even()).toBe(false);
  });

  it('a computed that threw is notified again when its inputs change', () => {
    const s = signal(0);
    const c = computed(() => {
      if (s() === 1) throw new Error('bad');
      return s() * 10;
    });
    const seen: unknown[] = [];
    effect(() => {
      try {
        seen.push(c());
      } catch (e) {
        seen.push((e as Error).message);
      }
    });
    s.set(1);
    s.set(2);
    s.set(3);
    expect(seen).toEqual([0, 'bad', 20, 30]);
  });

  it('a computed read inside a batch sees the values set so far, and the effect runs once after it', () => {
    const a = signal(1), b = signal(1);
    const sum = computed(() => a() + b());
    const seen: number[] = [];
    effect(() => void seen.push(sum()));
    batch(() => {
      a.set(2);
      b.set(3);
    });
    expect(seen).toEqual([2, 5]);
  });
});
