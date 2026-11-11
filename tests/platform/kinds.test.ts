// One in-flight load per chunk (A4, B37): concurrent callers share it, a settled one is forgotten (a failed load is
// tried again).
import { describe, expect, it } from 'vitest';
import { KIND_MODULES, loadOnce } from '../../src/platform/kinds.js';

describe('loadOnce', () => {
  it('shares one load between concurrent callers and runs none once it is done', async () => {
    let runs = 0, loaded = false;
    const load = () => loadOnce('test:a', () => loaded, async () => {
      runs++;
      await Promise.resolve();
      loaded = true;
    });
    await Promise.all([load(), load(), load()]);
    expect(runs).toBe(1);
    await load();
    expect(runs).toBe(1);
  });

  it('a failed load is tried again by the next caller', async () => {
    let runs = 0;
    const load = () => loadOnce('test:b', () => false, async () => {
      runs++;
      if (runs === 1) throw new Error('offline');
    });
    await expect(load()).rejects.toThrow('offline');
    await load();
    expect(runs).toBe(2);
  });

  it('the manifest names a view and a diff kind for every type', () => {
    for (const m of Object.values(KIND_MODULES)) {
      expect(typeof m.view).toBe('function');
      expect(typeof m.diff).toBe('function');
    }
  });
});
