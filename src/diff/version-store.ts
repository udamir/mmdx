// VersionStore (A13c): the versions half of a DiffSession — the adapter, the version list and its pages, the
// versions' sources (an LRU that always keeps the shown ones, P12) and parsed models, and the change counts computed
// on demand in idle time (§8.6). A version whose source changed is forgotten alone, not the whole store (B10). Work
// that arrives for an older load generation (the session's `gen()`) is dropped.
import type { HistoryAdapter } from '../ports.js';
import type { DiagramModel } from '../core/model.js';
import { diffDiagramsWith, type DiagramDiff as DiffResult } from '../core/diff/index.js';
import type { VersionInfo } from '../core/diff/report.js';
import { parseWith } from '../core/parse/dispatch.js';
import { Lru } from '../core/text/measure.js';
import { nextIdle } from '../dom/idle.js';
import { loadedKinds } from '../platform/kinds.js';
import { batch, signal, type Signal } from '../reactive/signal.js';
import { loadKindsOf } from './kinds.js';

export type Counts = DiffResult['counts'];

const EMPTY_COUNTS: Counts = { added: 0, removed: 0, changed: 0, content: 0, layout: 0, style: 0 };

/** What the store needs of its session. */
export interface VersionStoreHost {
  /** The load generation: bumped by every load. */
  gen(): number;
  destroyed(): boolean;
  /** The version is in the shown pair or viewed (its source stays cached). */
  shows(id: string): boolean;
  /** A read that leaves what is shown as it is failed (`mmdx-error`). */
  loadError(e: unknown): void;
}

export class VersionStore {
  readonly versions: Signal<readonly VersionInfo[]> = signal<readonly VersionInfo[]>([]);
  /** Older versions can be loaded (`loadMore`). */
  readonly hasMore = signal(false);
  /** A history was given (the version panel is available); two sources are a two-version history without it. */
  readonly hasHistory = signal(false);
  /** Bumped when a version's change count arrives (`counts(id)`). */
  readonly countsRev = signal(0);
  adapter: HistoryAdapter | null = null;
  /** Versions' sources: the latest read, and always the shown ones (P12: every version read stayed). */
  readonly sources: Lru<string, Promise<string>>;
  /** Versions' parsed codes: a version's count and the next one's read the same model (P12: parsed twice). */
  private readonly models = new Lru<string, DiagramModel>(16);
  private nextPage: string | undefined;
  private readonly countMap = new Map<string, Counts | null>();
  /** The versions whose counts a row asked for (counts(): computed for the rows shown, P12). */
  private readonly countsAsked = new Set<string>();
  private countQueue: Promise<void> = Promise.resolve();
  private more: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly host: VersionStoreHost) {
    this.sources = new Lru<string, Promise<string>>(16, 16, (id) => host.shows(id));
  }

  private stale(gen: number): boolean {
    return gen !== this.host.gen() || this.host.destroyed();
  }

  /** A new load: the caches of the previous source go. */
  reset(): void {
    this.more = null;
    this.sources.clear();
    this.models.clear();
    this.countMap.clear();
    this.countsAsked.clear();
    this.countQueue = Promise.resolve();
  }

  /** Follows the adapter's changes (`subscribe`): `onChange` runs when the history says it changed. */
  watch(onChange: () => void): void {
    this.unwatch();
    this.unsubscribe = this.adapter?.subscribe?.(onChange) ?? null;
  }

  unwatch(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** The first page (or the whole list) of the versions. */
  setPage(versions: readonly VersionInfo[], next: string | undefined): void {
    this.nextPage = next;
    batch(() => {
      this.versions.set(versions);
      this.hasMore.set(!!next);
    });
  }

  /**
   * Change counts of a version against the one before it (undefined: not computed yet; null: the first). Asking
   * starts the count in idle time; `countsRev` bumps when it arrives.
   */
  counts(id: string): Counts | null | undefined {
    if (!this.countMap.has(id) && !this.countsAsked.has(id)) {
      this.countsAsked.add(id);
      this.queueCounts([id]);
    }
    return this.countMap.get(id);
  }

  /** Older versions of a paged history (one request at a time; rejects when the page fails to load). */
  loadMore(): Promise<void> {
    const adapter = this.adapter, cursor = this.nextPage;
    if (!adapter || !cursor) return Promise.resolve();
    if (this.more) return this.more;
    const gen = this.host.gen();
    let p: Promise<void> | null = null;
    p = (async () => {
      try {
        const page = await adapter.list(cursor);
        if (this.stale(gen)) return;
        const known = new Set(this.versions.peek().map((v) => v.id));
        this.setPage([...this.versions.peek(), ...page.versions.filter((v) => !known.has(v.id))], page.next);
        this.queueCounts();
      } finally {
        if (this.more === p) this.more = null;
      }
    })();
    this.more = p;
    return p;
  }

  /** A version's source (cached per load). */
  sourceOf(id: string | null): Promise<string> {
    if (!id || !this.adapter) return Promise.resolve('');
    let p = this.sources.get(id);
    if (!p) {
      p = this.adapter.load(id);
      this.sources.set(id, p);
      p.catch(() => {
        if (this.sources.get(id) === p) this.sources.delete(id);
      });
    }
    return p;
  }

  /** A version's source changed: its source and its counts (and the next newer version's) are forgotten. */
  forget(id: string): void {
    this.sources.delete(id);
    this.countMap.delete(id);
    const list = this.versions.peek();
    for (const [i, v] of list.entries()) if (list[i + 1]?.id === id) this.countMap.delete(v.id);
    // asked again by the rows that show them
    this.countsAsked.clear();
  }

  /** Versions changed (`ids`): History's working copy updates its row, any other history is read again. */
  refreshList(ids: readonly string[]): void {
    const a = this.adapter;
    if (a && 'workingCopy' in a && typeof a.workingCopy === 'function') void this.updateWorkingCopy(a.workingCopy as () => Promise<VersionInfo | null>, ids);
    else void this.reloadHistory();
  }

  /** Puts the working copy's row in the version list, or takes it out, without reading the history again. */
  private async updateWorkingCopy(row: () => Promise<VersionInfo | null>, ids: readonly string[]): Promise<void> {
    const gen = this.host.gen();
    let working: VersionInfo | null;
    try {
      working = await row();
    } catch (e) {
      if (!this.stale(gen)) this.host.loadError(e);
      return;
    }
    if (this.stale(gen)) return;
    const rest = this.versions.peek().filter((v) => !ids.includes(v.id));
    this.versions.set(working && ids.includes(working.id) ? [working, ...rest] : rest);
    this.queueCounts();
  }

  /** Reads the first page of the history again (it changed); older pages loaded already stay. */
  async reloadHistory(): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    const gen = this.host.gen();
    let page: Awaited<ReturnType<HistoryAdapter['list']>>;
    try {
      page = await adapter.list();
    } catch (e) {
      if (!this.stale(gen)) this.host.loadError(e);
      return;
    }
    if (this.stale(gen)) return;
    const old = this.versions.peek();
    const last = page.versions.at(-1);
    const from = last && page.next ? old.findIndex((v) => v.id === last.id) : -1;
    const tail = from >= 0 ? old.slice(from + 1).filter((v) => !page.versions.some((n) => n.id === v.id)) : [];
    this.setPage([...page.versions, ...tail], tail.length ? this.nextPage : page.next);
    this.queueCounts();
  }

  /**
   * Change counts of the versions asked for (all asked so far: a newer page may give the last one its older
   * version) against the one before each, one at a time in idle time (§8.6).
   */
  queueCounts(ids: Iterable<string> = this.countsAsked): void {
    if (!this.hasHistory.peek()) return;
    const gen = this.host.gen();
    const list = this.versions.peek();
    const want = new Set(ids);
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!, older = list[i + 1];
      if (!want.has(v.id) || this.countMap.has(v.id)) continue;
      if (!older) {
        if (!this.nextPage) {
          this.countMap.set(v.id, null);
          this.countsRev.update((n) => n + 1);
        }
        continue;
      }
      this.countQueue = this.countQueue.then(() => nextIdle(500)).then(async () => {
        if (this.stale(gen) || this.countMap.has(v.id)) return;
        let counts: Counts;
        try {
          const [a, b] = await Promise.all([this.sourceOf(older.id), this.sourceOf(v.id)]);
          if (this.stale(gen)) return;
          await loadKindsOf(a, b);
          if (this.stale(gen)) return;
          const kinds = loadedKinds();
          counts = diffDiagramsWith(kinds, a, b, (code) => this.models.get(code) ?? (this.models.set(code, parseWith(code, kinds)), this.models.get(code)!)).counts;
        } catch {
          counts = { ...EMPTY_COUNTS };
        }
        if (this.stale(gen)) return;
        this.countMap.set(v.id, counts);
        this.countsRev.update((n) => n + 1);
      });
    }
  }

  destroy(): void {
    this.unwatch();
  }
}
