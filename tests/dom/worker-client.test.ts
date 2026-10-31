// The render worker's client (§6.4): one job at a time, the timeout counts from when the worker takes a job, a
// viewer's newer job replaces its older one still waiting, a timeout restarts the worker for the jobs behind it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContext } from '../../src/core/context.js';
import type { WorkerRequest } from '../../src/dom/worker-protocol.js';

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: WorkerRequest[] = [];
  terminated = false;
  private listeners: Record<string, ((ev: { data: unknown }) => void)[]> = {};
  constructor() {
    FakeWorker.all.push(this);
  }
  addEventListener(type: string, f: (ev: { data: unknown }) => void): void {
    (this.listeners[type] ??= []).push(f);
  }
  postMessage(m: WorkerRequest): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** The worker answers a job (a failure: the client falls back to the main thread, resolving null). */
  answer(id: number): void {
    for (const f of this.listeners['message'] ?? []) f({ data: { id, ok: false, error: 'boom' } });
  }
}

const load = async (): Promise<typeof import('../../src/dom/worker-client.js')> => {
  vi.resetModules();
  return import('../../src/dom/worker-client.js');
};

beforeEach(() => {
  FakeWorker.all = [];
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('render worker client', () => {
  it('runs one job at a time; the timeout counts from when the worker takes the job', async () => {
    const { renderInWorker } = await load();
    const ctx = createContext({ idPrefix: 'a' });
    const one = renderInWorker('a', ctx, {}, {});
    const two = renderInWorker('b', ctx, {}, {});
    const w = FakeWorker.all[0]!;
    expect(w.posted.map((r) => r.src)).toEqual(['a']);
    vi.advanceTimersByTime(1500);
    w.answer(w.posted[0]!.id);
    expect(await one).toBeNull();
    expect(w.posted.map((r) => r.src)).toEqual(['a', 'b']);
    // 3 s after it was asked for, 1.5 s after the worker took it: not timed out
    vi.advanceTimersByTime(1500);
    w.answer(w.posted[1]!.id);
    expect(await two).toBeNull();
  });

  it('a viewer\'s newer job replaces its older one still waiting', async () => {
    const { renderInWorker } = await load();
    const ctx = createContext({ idPrefix: 'a' });
    const viewer = {};
    void renderInWorker('first', ctx, {}, {});
    const old = renderInWorker('old', ctx, {}, viewer);
    const latest = renderInWorker('new', ctx, {}, viewer);
    expect(await old).toEqual({ error: 'superseded' });
    const w = FakeWorker.all[0]!;
    w.answer(w.posted[0]!.id);
    await Promise.resolve();
    expect(w.posted.map((r) => r.src)).toEqual(['first', 'new']);
    w.answer(w.posted[1]!.id);
    expect(await latest).toBeNull();
  });

  it('a job that times out restarts the worker; the jobs behind it run in the new one', async () => {
    const { renderInWorker } = await load();
    const ctx = createContext({ idPrefix: 'a' });
    const slow = renderInWorker('slow', ctx, {}, {});
    const other = renderInWorker('other', ctx, {}, {});
    vi.advanceTimersByTime(2001);
    expect(await slow).toEqual({ error: 'timeout' });
    expect(FakeWorker.all[0]!.terminated).toBe(true);
    const w2 = FakeWorker.all[1]!;
    expect(w2.posted.map((r) => r.src)).toEqual(['other']);
    w2.answer(w2.posted[0]!.id);
    expect(await other).toBeNull();
  });

  it('the themes key changes when the registry changes, not with the size of a theme', async () => {
    const { renderInWorker } = await load();
    const ctx = createContext({ idPrefix: 'a' });
    void renderInWorker('a', ctx);
    const w = FakeWorker.all[0]!;
    const k1 = w.posted[0]!.themesKey;
    w.answer(w.posted[0]!.id);
    await Promise.resolve();
    void renderInWorker('b', ctx);
    expect(w.posted[1]!.themesKey).toBe(k1);
    const base = ctx.themes.raw(ctx.themes.list()[0]!.id)!;
    ctx.themes.register({ ...base, id: 'mine', name: 'Mine' });
    w.answer(w.posted[1]!.id);
    await Promise.resolve();
    void renderInWorker('c', ctx);
    expect(w.posted[2]!.themesKey).not.toBe(k1);
  });
});
