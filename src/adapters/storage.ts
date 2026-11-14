// UI preference storage (§8.2 `storage`, A.12). Never holds the document itself.
import type { StorageAdapter } from '../ports.js';

/** In-memory storage: tests, sandboxed iframes, hosts that persist nothing. */
export function memoryStorage(initial: Record<string, unknown> = {}): StorageAdapter {
  const m = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get<T>(key: string): T | undefined {
      const raw = m.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    set(key, value) {
      m.set(key, JSON.stringify(value));
    },
    remove(key) {
      m.delete(key);
    },
  };
}

/**
 * localStorage under a namespace (`mmdx.` by default, the prototype's keys). Falls back to memory when storage is
 * unavailable (private mode, sandboxed iframes, quota errors).
 */
export function localStorageAdapter(namespace = 'mmdx.'): StorageAdapter {
  let ls: Storage | null = null;
  try {
    ls = typeof localStorage !== 'undefined' ? localStorage : null;
    ls?.getItem('__ds_probe__');
  } catch {
    ls = null;
  }
  if (!ls) return memoryStorage();
  const store = ls;
  const fallback = memoryStorage();
  // a write localStorage refused (quota, private mode) is kept in memory, and the memory copy wins while it is
  // there: an older value in localStorage must not come back (B18)
  return {
    get<T>(key: string): T | undefined {
      const mem = fallback.get<T>(key);
      if (mem !== undefined) return mem;
      try {
        const raw = store.getItem(namespace + key);
        return raw === null ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      try {
        store.setItem(namespace + key, JSON.stringify(value));
        fallback.remove(key);
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      fallback.remove(key);
      try {
        store.removeItem(namespace + key);
      } catch {
        // nothing stored there to remove
      }
    },
  };
}

export interface PreloadedStorageOptions {
  /** Called with a write that failed (the value stays in memory); default: ignored. */
  onError?: (error: unknown, key: string) => void;
}

/**
 * The sync `StorageAdapter` over an async key-value store (a host's storage API in a sandboxed iframe without
 * `localStorage`): awaits `read()` once, then serves reads from memory and writes through in the background
 * (`remove(key)` writes `undefined`). Writes of one key reach the store in order; a failed write is ignored (or
 * reported to `onError`), and the value stays in memory.
 */
export async function preloadedStorage(
  read: () => Promise<Record<string, unknown>>,
  write: (key: string, value: unknown | undefined) => Promise<void>,
  opts: PreloadedStorageOptions = {},
): Promise<StorageAdapter> {
  const mem = memoryStorage(await read());
  const chains = new Map<string, Promise<void>>();
  const put = (key: string, value: unknown): void => {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(() => write(key, value)).catch((e: unknown) => {
      try {
        opts.onError?.(e, key);
      } catch {
        // a failing error handler must not break the next writes
      }
    });
    chains.set(key, next);
    void next.then(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  };
  return {
    get: (key) => mem.get(key),
    set(key, value) {
      mem.set(key, value);
      // the stored value is a copy, like the memory one (a later change of the object is not written)
      put(key, value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown));
    },
    remove(key) {
      mem.remove(key);
      put(key, undefined);
    },
  };
}
