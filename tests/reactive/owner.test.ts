// @vitest-environment jsdom
// Owner (A3): what a component, block or module set up goes at once, in reverse order; a failing cleanup does not stop
// the others; what comes after dispose runs at once.
import { describe, expect, it, vi } from 'vitest';
import { Owner } from '../../src/reactive/owner.js';
import { signal } from '../../src/reactive/signal.js';

describe('Owner', () => {
  it('lets go of effects, computeds, listeners and cleanups, last first', () => {
    const o = new Owner('test');
    const s = signal(1);
    const log: string[] = [];
    o.effect(() => void log.push(`effect ${s()}`));
    const c = o.computed(() => s() * 2);
    const el = document.createElement('div');
    o.on(el, 'click', () => void log.push('click'));
    o.add(() => log.push('first'));
    o.add(() => log.push('second'));
    expect(c()).toBe(2);
    el.click();
    o.dispose();
    expect(log).toEqual(['effect 1', 'click', 'second', 'first']);
    s.set(2);
    el.click();
    expect(log).toHaveLength(4);
    expect(o.disposed).toBe(true);
    expect(o.signal.aborted).toBe(true);
  });

  it('a cleanup that throws is reported and the rest still run; one added after dispose runs at once', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const o = new Owner('panel');
    const ran: number[] = [];
    o.add(() => ran.push(1));
    o.add(() => {
      throw new Error('x');
    });
    o.add(() => ran.push(3));
    o.dispose();
    expect(ran).toEqual([3, 1]);
    expect(String(err.mock.calls[0]?.[0])).toContain('panel: cleanup failed');
    o.add(() => ran.push(4));
    expect(ran).toEqual([3, 1, 4]);
    o.dispose();
    expect(ran).toEqual([3, 1, 4]);
    err.mockRestore();
  });

  it('an effect\'s returned function runs before its next run and on dispose', () => {
    const o = new Owner();
    const s = signal(0);
    const log: string[] = [];
    o.effect(() => {
      const v = s();
      return () => log.push(`undo ${v}`);
    });
    s.set(1);
    o.dispose();
    expect(log).toEqual(['undo 0', 'undo 1']);
  });
});
