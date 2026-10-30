// UI preference storage (§8.2 `storage`, A.12). Never holds the document itself.

export interface StorageAdapter {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

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
 * localStorage under a namespace (`ds.` by default, the prototype's keys). Falls back to memory when storage is
 * unavailable (private mode, sandboxed iframes, quota errors).
 */
export function localStorageAdapter(namespace = 'ds.'): StorageAdapter {
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
  return {
    get<T>(key: string): T | undefined {
      try {
        const raw = store.getItem(namespace + key);
        return raw === null ? fallback.get<T>(key) : (JSON.parse(raw) as T);
      } catch {
        return fallback.get<T>(key);
      }
    },
    set(key, value) {
      try {
        store.setItem(namespace + key, JSON.stringify(value));
      } catch {
        fallback.set(key, value);
      }
    },
    remove(key) {
      try {
        store.removeItem(namespace + key);
      } catch {
        fallback.remove(key);
      }
    },
  };
}
