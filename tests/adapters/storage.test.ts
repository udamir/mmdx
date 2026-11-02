import { describe, expect, it, vi } from 'vitest';
import { preloadedStorage } from '../../src/adapters/storage.js';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('preloadedStorage', () => {
  it('awaits the preload, then reads from memory synchronously', async () => {
    const read = vi.fn(async () => ({ 'viewer.ui': 'dark', 'editor.panels': { code: true } }));
    const s = await preloadedStorage(read, async () => undefined);
    expect(read).toHaveBeenCalledTimes(1);
    expect(s.get('viewer.ui')).toBe('dark');
    expect(s.get<{ code: boolean }>('editor.panels')).toEqual({ code: true });
    expect(s.get('missing')).toBeUndefined();
  });

  it('writes through in the background; remove writes undefined', async () => {
    const store: Record<string, unknown> = {};
    const write = vi.fn(async (k: string, v: unknown) => {
      if (v === undefined) delete store[k];
      else store[k] = v;
    });
    const s = await preloadedStorage(async () => ({}), write);
    const value = { a: 1 };
    s.set('k', value);
    // read back at once, before the write finished
    expect(s.get('k')).toEqual({ a: 1 });
    value.a = 2;
    await flush();
    expect(store['k']).toEqual({ a: 1 });
    s.remove('k');
    expect(s.get('k')).toBeUndefined();
    await flush();
    expect(write).toHaveBeenLastCalledWith('k', undefined);
    expect('k' in store).toBe(false);
  });

  it('writes of one key reach the store in order', async () => {
    const seen: unknown[] = [];
    let release!: () => void;
    const first = new Promise<void>((r) => (release = r));
    const write = vi.fn(async (_k: string, v: unknown) => {
      if (v === 1) await first;
      seen.push(v);
    });
    const s = await preloadedStorage(async () => ({}), write);
    s.set('k', 1);
    s.set('k', 2);
    s.remove('k');
    await flush();
    expect(seen).toEqual([]);
    release();
    await flush();
    expect(seen).toEqual([1, 2, undefined]);
  });

  it('a failed write is swallowed (or reported to onError) and the value stays in memory', async () => {
    const onError = vi.fn();
    const s = await preloadedStorage(async () => ({}), async () => {
      throw new Error('quota');
    }, { onError });
    s.set('k', 'v');
    await flush();
    expect(s.get('k')).toBe('v');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'k');
    const quiet = await preloadedStorage(async () => ({}), async () => Promise.reject(new Error('no')));
    quiet.set('k', 'v');
    await flush();
    expect(quiet.get('k')).toBe('v');
  });

  it('a failed preload rejects', async () => {
    await expect(preloadedStorage(async () => Promise.reject(new Error('down')), async () => undefined)).rejects.toThrow('down');
  });
});
