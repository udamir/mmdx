// DiffSession (component architecture §8.1): the model behind a DiffScene and the diff modules — the version source
// (a HistoryAdapter, a list of versions, or a pair of sources), the compared pair or the viewed version, the filters,
// the rendered diff, the change selection and the view (Before / Merged / After / Side by side). Its state is
// signals; its methods are the `<mmdx-diff>` API. It renders with the kinds of both versions, loaded on demand
// (`renderDiffWith(loadedKinds(), …)`; the shapes beyond the 17 load the first time a render draws one), and with the
// host's theme and display settings (`renderOptions`). Events go out through the `emit` callback it is given, so
// `<mmdx-diff>` dispatches them as `mmdx-*` and History can route them as `mmdx-history-*`. Replaces the data, loading,
// rendering and export half of elements/diff.ts.
// Every load starts a generation: a list, a page, a source, a render or a change count that arrives for an older one is dropped.
// The session is a facade (A13c): the versions, their sources and counts are a VersionStore, the exports a
// DiffExporter, and what is shown one `shown` model (nothing, a version as it is, a comparison).
import { contentId, staticHistory, type StaticVersion } from '../adapters/history.js';
import type { DiffExportKind, DiffExportOptions, DiffFilter, DiffPair, DiffViewName } from '../view/history.js';
import { type HistoryAdapter } from '../ports.js';
import type { CoreContext } from '../core/context.js';
import type { DiffView } from '../core/diff/annotate.js';
import type { DiagramDiff as DiffResult, DiffIgnore, ItemChange } from '../core/diff/index.js';
import { changeKey } from '../core/diff/merge.js';
import { renderDiffWith, type DiffHide, type DiffRendered } from '../core/diff/render.js';
import { sourcePart, type VersionInfo } from '../core/diff/report.js';
import { renderSourceWith, type PipelineOptions, type Rendered } from '../core/pipeline-core.js';
import { Lru } from '../core/text/measure.js';
import type { Diagnostic } from '../core/types.js';
import { loadedKinds, renderShapes } from '../platform/kinds.js';
import type { Translate } from '../ui/blocks/block.js';
import { batch, computed, signal, type ReadSignal, type Signal } from '../reactive/signal.js';
import { DiffExporter } from './exporter.js';
import { loadKindsOf } from './kinds.js';
import type { Shown } from './shown.js';
import { VersionStore, type Counts } from './version-store.js';

/** How long the document must rest before History follows it (a working copy row, a comparison that shows it). */
const SOURCE_DEBOUNCE_MS = 150;

/** The version panel's tab: compare two versions, or view one as it is. */
export type DiffMode = 'compare' | 'history';
export const DIFF_VIEWS: readonly DiffViewName[] = ['before', 'merged', 'after', 'side'];
export const DIFF_FILTERS: readonly DiffFilter[] = ['added', 'removed', 'content', 'layout', 'style'];

/** Where the versions come from: a history, or two sources (each may still be loading). */
export type DiffSource =
  | { history: HistoryAdapter | readonly StaticVersion[]; base?: string | undefined; head?: string | undefined }
  | { before: string | null | Promise<string | null>; after: string | null | Promise<string | null>; base?: string | undefined; head?: string | undefined };

/** A message over the canvas instead of (or before) a picture. */
export interface DiffStatus {
  kind: 'loading' | 'empty' | 'error';
  text: string;
  /** Offer Retry (a failed load). */
  retry?: boolean;
}

export interface DiffSessionOptions {
  ctx: CoreContext;
  t: Translate;
  /** Dispatches a host event (`mmdx-compare`, `mmdx-select`…); false when a cancelable one was prevented. */
  emit(type: string, detail: unknown, cancelable?: boolean): boolean;
  /** The theme and display settings both versions are drawn with (the host's kernel theme, labels, layers). */
  renderOptions(): PipelineOptions & { theme: string };
  /** Loads a theme that is not registered yet (built-ins on demand, the theme source). */
  ensureTheme?(id: string): Promise<boolean>;
  /** The chrome scheme (highlight colours of image exports). */
  scheme(): 'light' | 'dark';
  /** File name stem of exports. */
  name(): string;
  /** Asks the host to show the version list (`viewVersion` from code). */
  showVersions?(): void;
  /**
   * A loaded history opens on its newest change (default). False: nothing is picked, compared or rendered until a
   * version is (History in place, where the document shows until then).
   */
  pick?: boolean;
  view?: DiffViewName;
  mode?: DiffMode;
  filters?: readonly DiffFilter[];
  dim?: boolean;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class DiffSession {
  // ---- versions
  /** The versions, their sources and change counts. */
  readonly store: VersionStore;
  readonly versions: Signal<readonly VersionInfo[]>;
  /** Older versions can be loaded (`loadMore`). */
  readonly hasMore: Signal<boolean>;
  /** A history was given (the version panel is available); two sources are a two-version history without it. */
  readonly hasHistory: Signal<boolean>;
  /** Bumped when a version's change count arrives (`counts(id)`). */
  readonly countsRev: Signal<number>;
  readonly base = signal<string | null>(null);
  readonly head = signal<string | null>(null);
  readonly viewing = signal<string | null>(null);
  readonly mode: Signal<DiffMode>;
  /** The host shows the version panel (History mode needs it: one version as it is). */
  readonly versionsShown = signal(false);
  /** True while one version is shown as it is (no diff, no diff controls). */
  readonly viewOnly: ReadSignal<boolean>;
  /** What is shown: nothing, the viewed version as it is (History mode), or the compared pair. */
  readonly shown: ReadSignal<Shown>;

  // ---- view, filters, selection
  readonly view: Signal<DiffViewName>;
  readonly ignore: Signal<DiffIgnore>;
  readonly hide: Signal<DiffHide>;
  /** Fade unchanged items. */
  readonly dim: Signal<boolean>;
  /** Key (`kind:id`) of the selected change; every `select()` notifies, the same key again too (focus, narrowing). */
  readonly selected: Signal<string | null> = signal<string | null>(null, () => false);

  // ---- what is shown
  /** The compared pair as rendered (null before the first comparison). */
  readonly rendered: Signal<DiffRendered | null> = signal<DiffRendered | null>(null);
  /** The viewed version as rendered (History mode); null while it is not rendered yet (never another version's picture). */
  readonly plain: Signal<Rendered | null> = signal<Rendered | null>(null);
  readonly status: Signal<DiffStatus | null> = signal<DiffStatus | null>(null);
  /** One line over the canvas: the diagram type changed, or it cannot be compared visually. */
  readonly banner: ReadSignal<string>;
  /** The diagram type cannot be drawn: the code diff shows the changes. */
  readonly unsupported: ReadSignal<boolean>;

  private readonly o: DiffSessionOptions;
  private readonly exporter: DiffExporter;
  private src: DiffSource | null = null;
  private readonly cache = new Lru<string, DiffRendered>(8);
  /** Versions whose source changed since the last flush (sourceChanged, debounced). */
  private readonly changedSources = new Set<string>();
  private sourceTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** The load generation: bumped by every `load()`; work of an older generation is dropped when it arrives. */
  private loadSeq = 0;
  private refreshSeq = 0;
  /** The version `plain` renders. */
  private plainOf: string | null = null;
  private refreshHandle: ReturnType<typeof setTimeout> | 0 = 0;
  private destroyed = false;

  constructor(o: DiffSessionOptions) {
    this.o = o;
    this.store = new VersionStore({ gen: () => this.loadSeq, destroyed: () => this.destroyed, shows: (id) => this.shows(id), loadError: (e) => this.loadError(e) });
    ({ versions: this.versions, hasMore: this.hasMore, hasHistory: this.hasHistory, countsRev: this.countsRev } = this.store);
    this.mode = signal<DiffMode>(o.mode ?? 'compare');
    this.view = signal<DiffViewName>(o.view ?? 'merged');
    this.dim = signal(o.dim ?? true);
    const f = DiffSession.filterState(o.filters);
    this.ignore = signal<DiffIgnore>(f.ignore);
    this.hide = signal<DiffHide>(f.hide);
    this.viewOnly = computed(() => this.hasHistory() && this.versionsShown() && this.mode() === 'history');
    this.shown = computed((): Shown => {
      if (this.viewOnly()) return { kind: 'version', id: this.viewing() };
      const base = this.base(), head = this.head();
      return base && head ? { kind: 'compare', base, head } : { kind: 'none' };
    });
    this.unsupported = computed(() => {
      const D = this.rendered();
      return !!D && !this.viewOnly() && (D.before.model.type === null || D.after.model.type === null) && !D.raw.typeChanged;
    });
    this.banner = computed(() => {
      const D = this.rendered();
      if (!D || this.viewOnly()) return '';
      return this.unsupported() ? o.t('diff.banner.unsupported') : D.raw.typeChanged ? o.t('diff.banner.typeChanged') : '';
    });
    this.exporter = new DiffExporter({
      shown: this.shown, base: this.base, head: this.head, viewing: this.viewing, rendered: this.rendered, view: this.view, dim: this.dim, ignore: this.ignore, versions: this.versions,
      viewedPicture: () => {
        const plain = this.plain.peek();
        return plain && this.plainOf === this.viewing.peek() ? plain : null;
      },
      sourceOf: (id) => this.sourceOf(id),
    }, o);
  }

  private static filterState(list: readonly DiffFilter[] | undefined): { ignore: DiffIgnore; hide: DiffHide } {
    const on = new Set(list ?? DIFF_FILTERS);
    return {
      ignore: Object.fromEntries((['content', 'layout', 'style'] as const).filter((f) => !on.has(f)).map((f) => [f, true])),
      hide: Object.fromEntries((['added', 'removed'] as const).filter((f) => !on.has(f)).map((f) => [f, true])),
    };
  }

  // ---- the <mmdx-diff> API ----------------------------------------------------------------------------------------

  /** The two compared versions and the shown one. */
  get pair(): DiffPair {
    return { base: this.base.peek(), head: this.head.peek(), viewing: this.viewOnly.peek() ? this.viewing.peek() : null };
  }

  /** Shown change kinds; a facet left out is ignored. */
  get filters(): DiffFilter[] {
    const hide = this.hide.peek(), ignore = this.ignore.peek();
    return DIFF_FILTERS.filter((f) => (f === 'added' || f === 'removed' ? !hide[f] : !ignore[f]));
  }

  /** The diff with the filters applied (null before the first comparison). */
  getDiff(): DiffResult | null {
    return this.rendered.peek()?.diff ?? null;
  }

  /** A change of the shown diff by key. */
  change(key: string | null): ItemChange | null {
    const D = this.rendered.peek();
    return key && D ? D.changes.find((c) => changeKey(c) === key) ?? null : null;
  }

  /**
   * Change counts of a version against the one before it (undefined: not computed yet; null: the first). Asking
   * starts the count in idle time; `countsRev` bumps when it arrives.
   */
  counts(id: string): Counts | null | undefined {
    return this.store.counts(id);
  }

  /** The version is in the shown pair or viewed. */
  private shows(id: string): boolean {
    const p = this.pair;
    return p.base === id || p.head === id || p.viewing === id;
  }

  get diagnostics(): readonly Diagnostic[] {
    const D = this.rendered.peek();
    return D ? [...D.before.diagnostics, ...D.after.diagnostics] : this.plain.peek()?.diagnostics ?? [];
  }

  /** Loads the versions (a history, or two sources) and compares the newest pair, or the given one. */
  async load(src?: DiffSource): Promise<void> {
    if (src) this.src = src;
    const s = this.src;
    if (!s || this.destroyed) return;
    const seq = ++this.loadSeq;
    // a render of the previous source still in flight must not land
    this.refreshSeq++;
    if (this.refreshHandle) clearTimeout(this.refreshHandle);
    this.refreshHandle = 0;
    const t = this.o.t;
    const store = this.store;
    store.reset();
    this.cache.clear();
    batch(() => {
      this.selected.set(null);
      this.rendered.set(null);
      this.setPlain(null, null);
    });
    try {
      if ('history' in s) {
        const adapter = Array.isArray(s.history) ? staticHistory(s.history as readonly StaticVersion[]) : (s.history as HistoryAdapter);
        store.adapter = adapter;
        batch(() => {
          this.hasHistory.set(true);
          this.status.set({ kind: 'loading', text: t('diff.history.loading') });
        });
        const page = await adapter.list();
        if (seq !== this.loadSeq || this.destroyed) return;
        store.setPage(page.versions, page.next);
        store.watch(() => void store.reloadHistory());
      } else {
        this.hasHistory.set(false);
        store.unwatch();
        const [before, after] = await Promise.all([s.before, s.after]);
        if (seq !== this.loadSeq || this.destroyed) return;
        if (before === null || after === null) {
          batch(() => {
            this.versions.set([]);
            this.status.set({ kind: 'empty', text: t('diff.empty.nothing') });
          });
          return;
        }
        const list: StaticVersion[] = [
          { id: contentId(`1\n${after}`), message: t('diff.view.after'), source: after },
          { id: contentId(`0\n${before}`), message: t('diff.view.before'), source: before },
        ];
        store.adapter = staticHistory(list);
        store.setPage(list.map(({ source: _s, ...v }) => v), undefined);
      }
    } catch (e) {
      if (seq !== this.loadSeq || this.destroyed) return;
      this.loadFailed(e);
      return;
    }
    if (this.o.pick === false && 'history' in s) {
      this.status.set(null);
      store.queueCounts();
      return;
    }
    const ids = this.versions.peek().map((v) => v.id);
    const head = s.head && ids.includes(s.head) ? s.head : ids[0] ?? null;
    const hi = head ? ids.indexOf(head) : -1;
    const base = s.base && ids.includes(s.base) && s.base !== head ? s.base : ids[hi + 1] ?? null;
    batch(() => {
      this.head.set(head);
      this.base.set(base);
      this.viewing.set(head);
    });
    await this.refresh();
    if (seq !== this.loadSeq || this.destroyed) return;
    store.queueCounts();
  }

  /** Loads the same source again (Retry). */
  reload(): Promise<void> {
    return this.load();
  }

  /** Compares two versions by id (no-op for the same version on both sides); leaves History mode (one version as it is) for Compare. */
  setPair(base: string | null, head: string | null): void {
    if (!base || !head || base === head) return;
    const leave = this.mode.peek() === 'history';
    if (base === this.base.peek() && head === this.head.peek() && !leave) return;
    batch(() => {
      this.base.set(base);
      this.head.set(head);
      this.selected.set(null);
      if (leave) this.mode.set('compare');
    });
    this.o.emit('mmdx-version', { base, head });
    if (leave) this.emitMode();
    void this.refresh();
  }

  /** Compare mode: a version against the one before it (the oldest one becomes Before instead); loads the next page first when the version before it is not loaded yet. */
  async compareWithPrevious(id: string): Promise<void> {
    const gen = this.loadSeq;
    const at = (): number => this.versions.peek().findIndex((v) => v.id === id);
    if (at() < 0) return;
    if (!this.versions.peek()[at() + 1] && this.hasMore.peek()) {
      try {
        await this.loadMore();
      } catch (e) {
        if (gen === this.loadSeq && !this.destroyed) this.loadError(e);
        return;
      }
      if (gen !== this.loadSeq || this.destroyed) return;
    }
    const i = at();
    if (i < 0) return;
    const older = this.versions.peek()[i + 1];
    if (older) this.setPair(older.id, id);
    else if (id !== this.head.peek()) this.setPair(id, this.head.peek());
  }

  /** Shows one version as it is (History mode). */
  viewVersion(id: string): void {
    if (!this.versions.peek().some((v) => v.id === id)) return;
    const was = this.mode.peek();
    batch(() => {
      this.viewing.set(id);
      this.mode.set('history');
      this.versionsShown.set(true);
      this.dropStalePlain();
    });
    this.o.showVersions?.();
    this.o.emit('mmdx-version', { base: this.base.peek(), head: this.head.peek(), viewing: id });
    if (was !== 'history') this.emitMode();
    void this.refresh();
  }

  /** The version panel's tab: compare two versions, or view one as it is. Emits `mmdx-mode`. */
  setMode(m: DiffMode): void {
    if (this.applyMode(m)) this.emitMode();
  }

  /** Sets the tab without an event (host options); renders again when what is shown changes. False when it was set already. */
  applyMode(m: DiffMode): boolean {
    if (m === this.mode.peek()) return false;
    const was = this.viewOnly.peek();
    batch(() => {
      this.mode.set(m);
      if (m === 'history' && !this.viewing.peek()) this.viewing.set(this.head.peek());
      this.dropStalePlain();
    });
    if (was !== this.viewOnly.peek()) void this.refresh();
    return true;
  }

  /** The host shows or hides the version panel: History mode starts or ends with it (`mmdx-mode`). */
  setVersionsShown(on: boolean): void {
    if (on === this.versionsShown.peek()) return;
    const was = this.viewOnly.peek();
    batch(() => {
      this.versionsShown.set(on);
      this.dropStalePlain();
    });
    if (was === this.viewOnly.peek()) return;
    this.emitMode();
    void this.refresh();
  }

  /** Shows Before, Merged, After or Side by side. Emits `mmdx-view`. */
  setView(view: DiffViewName): void {
    if (this.applyView(view)) this.o.emit('mmdx-view', { view, mode: this.mode.peek() });
  }

  /** Sets the view without an event (host options). False when it was set already or cannot be shown. */
  applyView(view: DiffViewName): boolean {
    if (!DIFF_VIEWS.includes(view) || view === this.view.peek()) return false;
    const D = this.rendered.peek();
    if (view === 'merged' && D && !D.merged) return false;
    this.view.set(view);
    return true;
  }

  /** Steps between Before, Merged and After (← →); false when there is nothing to step (side by side, History mode). */
  stepView(d: 1 | -1): boolean {
    const view = this.view.peek();
    if (view === 'side' || this.viewOnly.peek()) return false;
    const order: DiffView[] = ['before', 'merged', 'after'];
    let i = order.indexOf(view) + d;
    const D = this.rendered.peek();
    if (order[i] === 'merged' && D && !D.merged) i += d;
    const next = order[i];
    if (next) this.setView(next);
    return true;
  }

  /** Shown change kinds; a facet left out is ignored. Emits `mmdx-filters`. */
  setFilters(filters: readonly DiffFilter[], dim?: boolean): void {
    this.applyFilters(filters);
    if (dim !== undefined) this.dim.set(dim);
    this.filtersChanged();
  }

  /** Sets the filters without an event (host options); re-renders soon. */
  applyFilters(filters: readonly DiffFilter[] | undefined): void {
    const f = DiffSession.filterState(filters);
    batch(() => {
      this.ignore.set(f.ignore);
      this.hide.set(f.hide);
    });
  }

  toggleFilter(f: DiffFilter): void {
    if (f === 'added' || f === 'removed') this.hide.set({ ...this.hide.peek(), [f]: !this.hide.peek()[f] });
    else this.ignore.set({ ...this.ignore.peek(), [f]: !this.ignore.peek()[f] });
    this.filtersChanged();
  }

  setDim(on: boolean): void {
    this.dim.set(on);
    this.filtersChanged();
  }

  /** Selects a change by key (`kind:id`), or clears the selection. */
  select(key: string | null): void {
    const change = this.change(key);
    this.selected.set(change ? key : null);
    this.o.emit('mmdx-select', { key: this.selected.peek(), change });
  }

  next(): void {
    this.step(1);
  }

  prev(): void {
    this.step(-1);
  }

  /** Older versions of a paged history (one request at a time; rejects when the page fails to load). */
  loadMore(): Promise<void> {
    return this.store.loadMore();
  }

  /** A version's source (cached per load). */
  sourceOf(id: string | null): Promise<string> {
    return this.store.sourceOf(id);
  }

  /**
   * A version's source changed (History's working copy follows the document): its cached source and counts go, the
   * version list is read again (the working copy may appear or go), and a comparison that shows it renders again.
   */
  sourceChanged(id: string): void {
    // typing changes the document on every key: the work below runs once the changes pause (B10)
    this.changedSources.add(id);
    if (this.sourceTimer) clearTimeout(this.sourceTimer);
    this.sourceTimer = setTimeout(() => this.flushSourceChanges(), SOURCE_DEBOUNCE_MS);
  }

  private flushSourceChanges(): void {
    this.sourceTimer = 0;
    if (this.destroyed) return;
    const ids = [...this.changedSources];
    this.changedSources.clear();
    const p = this.pair;
    let refresh = false;
    for (const id of ids) {
      this.store.forget(id);
      // only the renders that show this version
      this.cache.deleteWhere((k) => k.split('|', 2).includes(id));
      if (p.base === id || p.head === id || p.viewing === id) refresh = true;
    }
    this.store.refreshList(ids);
    if (refresh) this.scheduleRefresh();
  }

  /** The theme, the display settings or the registered themes changed: render again. */
  invalidate(): void {
    this.cache.clear();
    this.scheduleRefresh();
  }

  /** Renders again on the next frame (several changes in a row render once). */
  scheduleRefresh(): void {
    if (this.refreshHandle || this.destroyed) return;
    this.refreshHandle = setTimeout(() => {
      this.refreshHandle = 0;
      void this.refresh();
    }, 16);
  }

  // ---- exports ----------------------------------------------------------------------------------------------------

  /** Standalone SVG of a view (default: the current one), or of the viewed version in History mode. */
  toSvg(o: DiffExportOptions = {}): string {
    return this.exporter.toSvg(o);
  }

  toPng(o: DiffExportOptions = {}): Promise<Blob> {
    return this.exporter.toPng(o);
  }

  /** Builds an export and offers it to the host (`mmdx-export`, cancelable), else downloads it. */
  exportAs(kind: DiffExportKind, o: DiffExportOptions = {}): Promise<void> {
    return this.exporter.exportAs(kind, o);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.store.destroy();
    if (this.refreshHandle) clearTimeout(this.refreshHandle);
    this.refreshHandle = 0;
    if (this.sourceTimer) clearTimeout(this.sourceTimer);
    this.sourceTimer = 0;
  }

  // ---- rendering --------------------------------------------------------------------------------------------------

  /** Renders the shown pair (or the viewed version) and emits `mmdx-compare` / `mmdx-render`. */
  async refresh(): Promise<void> {
    if (this.destroyed || !this.store.adapter) return;
    const seq = ++this.refreshSeq, gen = this.loadSeq;
    const stale = (): boolean => seq !== this.refreshSeq || gen !== this.loadSeq || this.destroyed;
    const t0 = now();
    const ro = this.o.renderOptions();
    try {
      if (this.viewOnly.peek()) {
        const id = this.viewing.peek();
        const src = await this.sourceOf(id);
        await this.prepare(ro.theme, src);
        if (stale()) return;
        const r = await renderShapes(() => renderSourceWith(loadedKinds(), src, this.o.ctx, ro));
        if (stale()) return;
        batch(() => {
          this.setPlain(r, id);
          this.status.set(null);
        });
      } else {
        const base = this.base.peek(), head = this.head.peek();
        if (!base || !head) {
          batch(() => {
            this.rendered.set(null);
            this.status.set({ kind: 'empty', text: this.o.t('diff.empty.nothing') });
          });
          return;
        }
        const [a, b] = await Promise.all([this.sourceOf(base), this.sourceOf(head)]);
        await this.prepare(ro.theme, a, b);
        if (stale()) return;
        const ignore = this.ignore.peek(), hide = this.hide.peek();
        const key = [base, head, ro.theme, this.filters.join(','), ro.hideLabels ? 'nl' : '', ro.visibleLayers?.join(',') ?? '*'].join('|');
        let D = this.cache.get(key);
        if (!D) {
          D = await renderShapes(() => renderDiffWith(loadedKinds(), a, b, this.o.ctx, { ...ro, ignore, hide }));
          if (stale()) return;
          this.cache.set(key, D);
        }
        const shown = D;
        batch(() => {
          const sel = this.selected.peek();
          if (sel && !shown.changes.some((c) => changeKey(c) === sel)) this.selected.set(null);
          if (this.view.peek() === 'merged' && !shown.merged) this.view.set('after');
          this.rendered.set(shown);
          this.status.set(null);
        });
        const unknown = [D.before, D.after].flatMap((r) => r.diagnostics).filter((d) => d.severity !== 'info' || d.code === 'theme.missing');
        if (unknown.length) this.o.emit('mmdx-error', { diagnostics: unknown });
        this.o.emit('mmdx-compare', { counts: D.diff.counts, typeChanged: D.raw.typeChanged, base, head });
      }
      const D = this.rendered.peek();
      const r = this.viewOnly.peek() ? this.plain.peek() : D?.after;
      this.o.emit('mmdx-render', { bounds: (!this.viewOnly.peek() && D?.bounds) || r?.result.bounds || { x: 0, y: 0, w: 0, h: 0 }, type: r?.model.type ?? null, durationMs: Math.round((now() - t0) * 10) / 10 });
    } catch (e) {
      if (stale()) return;
      this.loadFailed(e);
    }
  }

  /** The kinds of the shown sources and the theme, before a render. */
  private async prepare(theme: string, ...sources: string[]): Promise<void> {
    await loadKindsOf(...sources);
    if (this.o.ensureTheme && !this.o.ctx.themes.has(theme)) await this.o.ensureTheme(theme);
  }

  /** `mmdx-mode`: the tab changed, or History mode (one version as it is) started or ended with the version panel. */
  private emitMode(): void {
    this.o.emit('mmdx-mode', { mode: this.mode.peek(), viewOnly: this.viewOnly.peek() });
  }

  private setPlain(r: Rendered | null, id: string | null): void {
    this.plainOf = r ? id : null;
    this.plain.set(r);
  }

  /** The viewed version or History mode changed: the picture of another version goes, and History mode shows loading until the viewed one is rendered. */
  private dropStalePlain(): void {
    if (this.plain.peek() && this.plainOf === this.viewing.peek()) return;
    this.setPlain(null, null);
    if (this.viewOnly.peek()) this.status.set({ kind: 'loading', text: this.o.t('diff.history.loading') });
  }

  private filtersChanged(): void {
    this.o.emit('mmdx-filters', { filters: this.filters, dim: this.dim.peek() });
    void this.refresh();
  }

  private step(d: 1 | -1): void {
    const list = this.rendered.peek()?.changes ?? [];
    if (!list.length || this.viewOnly.peek()) return;
    const sel = this.selected.peek();
    const i = list.findIndex((x) => changeKey(x) === sel);
    const next = list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length]!;
    this.select(changeKey(next));
  }

  private loadFailed(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.status.set({ kind: 'error', text: `${this.o.t('diff.history.failed')}: ${message}`, retry: true });
    this.loadError(e);
  }

  /** A load that leaves what is shown as it is failed (a page of the history read again): `mmdx-error` only. */
  private loadError(e: unknown): void {
    this.o.emit('mmdx-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message: e instanceof Error ? e.message : String(e) }] });
  }
}

/** The code or metadata part of a source as lines (code diff panel). */
export const sourceLines = (src: string, tab: 'code' | 'meta'): string[] => sourcePart(src, tab).replace(/\n$/, '').split('\n');
