// Theme sources and stores (§8.3). Read: viewer, editor and theme editor share a ThemeSource. Write: the theme
// editor saves through a ThemeStore. The library never talks to a backend by itself.
import { BASE_THEME_ID } from '../core/theme/builtin-ids.js';
import type { ThemeFile, ThemeInfo } from '../core/theme/types.js';
import type { StorageAdapter } from './storage.js';

export interface ThemeSource {
  list(): Promise<ThemeInfo[]>;
  get(id: string): Promise<ThemeFile>;
  subscribe?(cb: () => void): () => void;
}

export type SaveResult = { version: string } | { conflict: ThemeFile };

export interface ThemeStore extends ThemeSource {
  save(theme: ThemeFile, opts: { version?: string }): Promise<SaveResult>;
  delete?(id: string): Promise<void>;
  publish?(id: string): Promise<void>;
  /** Number of diagrams that use the theme, when the host can tell. */
  usage?(id: string): Promise<number>;
}

const info = (t: ThemeFile, version?: string): ThemeInfo => {
  const i: ThemeInfo = {
    id: t.id,
    name: t.name ?? t.id,
    appearance: t.appearance === 'dark' ? 'dark' : 'light',
    extends: t.id === BASE_THEME_ID ? null : t.extends ?? BASE_THEME_ID,
  };
  if (version !== undefined) i.version = version;
  return i;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Themes held in memory; the default store of the theme editor and of tests. */
export function memoryThemeStore(initial: readonly ThemeFile[] = []): ThemeStore {
  const themes = new Map<string, { file: ThemeFile; version: number }>();
  for (const t of initial) themes.set(t.id, { file: clone(t), version: 1 });
  const subs = new Set<() => void>();
  const notify = (): void => {
    for (const cb of subs) cb();
  };
  return {
    async list() {
      return [...themes.values()].map((t) => info(t.file, String(t.version)));
    },
    async get(id) {
      const t = themes.get(id);
      if (!t) throw new Error(`Unknown theme "${id}"`);
      return clone(t.file);
    },
    async save(theme, opts) {
      const cur = themes.get(theme.id);
      if (cur && opts.version !== undefined && opts.version !== String(cur.version)) return { conflict: clone(cur.file) };
      const version = (cur?.version ?? 0) + 1;
      themes.set(theme.id, { file: clone(theme), version });
      notify();
      return { version: String(version) };
    },
    async delete(id) {
      themes.delete(id);
      notify();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

/**
 * Read-only themes from a manifest (`themes/index.json`: `{ "themes": ["default-light.theme.json", …] }`), resolved
 * relative to the manifest URL. Files are fetched once and cached.
 */
export function fetchThemeSource(manifestUrl: string, init: RequestInit = { credentials: 'same-origin' }): ThemeSource {
  let all: Promise<Map<string, ThemeFile>> | null = null;
  const load = (): Promise<Map<string, ThemeFile>> =>
    (all ??= (async () => {
      const base = new URL(manifestUrl, typeof location !== 'undefined' ? location.href : 'http://localhost/');
      const res = await fetch(base, init);
      if (!res.ok) throw new Error(`Theme manifest ${base.href}: HTTP ${res.status}`);
      const manifest = (await res.json()) as { themes?: unknown };
      const files = Array.isArray(manifest.themes) ? manifest.themes.filter((f): f is string => typeof f === 'string') : [];
      const loaded = await Promise.all(
        files.map(async (f) => {
          const r = await fetch(new URL(f, base), init);
          return r.ok ? ((await r.json()) as ThemeFile) : null;
        }),
      );
      return new Map(loaded.filter((t): t is ThemeFile => !!t && typeof t.id === 'string').map((t) => [t.id, t]));
    })().catch((e: unknown) => {
      all = null; // retry on the next call
      throw e;
    }));
  return {
    async list() {
      return [...(await load()).values()].map((t) => info(t));
    },
    async get(id) {
      const t = (await load()).get(id);
      if (!t) throw new Error(`Unknown theme "${id}"`);
      return clone(t);
    },
  };
}

/**
 * Themes edited in this browser, layered over a read-only source (the studio's `ds.themes`, A.12). Saving stores
 * the whole file; deleting a theme that exists in the source drops the browser edit (revert).
 */
export function localStorageThemeStore(storage: StorageAdapter, base?: ThemeSource, key = 'themes'): ThemeStore {
  const read = (): Record<string, ThemeFile> => {
    const v = storage.get<Record<string, ThemeFile>>(key);
    return v && typeof v === 'object' ? v : {};
  };
  const subs = new Set<() => void>();
  const notify = (): void => {
    for (const cb of subs) cb();
  };
  let unsubBase: (() => void) | undefined;
  return {
    async list() {
      const local = read();
      const fromBase = base ? await base.list().catch(() => []) : [];
      const ids = new Set(fromBase.map((t) => t.id));
      return [...fromBase.map((t) => (local[t.id] ? info(local[t.id]!) : t)), ...Object.values(local).filter((t) => !ids.has(t.id)).map((t) => info(t))];
    },
    async get(id) {
      const local = read()[id];
      if (local) return clone(local);
      if (base) return base.get(id);
      throw new Error(`Unknown theme "${id}"`);
    },
    async save(theme) {
      const all = read();
      all[theme.id] = clone(theme);
      storage.set(key, all);
      notify();
      return { version: String(Date.now()) };
    },
    async delete(id) {
      const all = read();
      delete all[id];
      storage.set(key, all);
      notify();
    },
    subscribe(cb) {
      subs.add(cb);
      if (base?.subscribe && !unsubBase) unsubBase = base.subscribe(notify);
      return () => {
        subs.delete(cb);
        if (!subs.size) {
          unsubBase?.();
          unsubBase = undefined;
        }
      };
    },
  };
}

/** True when a theme was edited in the browser on top of a source file. */
export async function isLocalEdit(store: ThemeStore, source: ThemeSource | undefined, id: string): Promise<boolean> {
  if (!source) return false;
  try {
    const [a, b] = await Promise.all([store.get(id), source.get(id)]);
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return false;
  }
}
