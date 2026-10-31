// DiffSession (component architecture §8.1): the model behind a DiffScene and the diff modules — the version source
// (a HistoryAdapter, a list of versions, or a pair of sources), the compared pair or the viewed version, the filters,
// the rendered diff, the change selection and the view (Before / Merged / After / Side by side). Its state is
// signals; its methods are the `<mmdx-diff>` API. It renders with the kinds of both versions, loaded on demand
// (`renderDiffWith(loadedKinds(), …)`), and with the host's theme and display settings (`renderOptions`). Events go
// out through the `emit` callback it is given, so `<mmdx-diff>` dispatches them as `mmdx-*` and History can route
// them as `mmdx-history-*`. Replaces the data, loading, rendering and export half of elements/diff.ts.
// Every load starts a generation: a list, a page, a source, a render or a change count that arrives for an older one is dropped.
import { contentId, staticHistory, type HistoryAdapter, type StaticVersion } from '../adapters/history.js';
import { getShared } from '../config.js';
import type { CoreContext } from '../core/context.js';
import type { DiffView } from '../core/diff/annotate.js';
import { diffDiagramsWith, type ChangeFacet, type DiagramDiff as DiffResult, type DiffIgnore, type ItemChange } from '../core/diff/index.js';
import { changeKey } from '../core/diff/merge.js';
import { diffSvg, renderDiffWith, type DiffHide, type DiffRendered, type DiffSvgOptions } from '../core/diff/render.js';
import { diffReport, sourcePart, unifiedDiff, type VersionInfo } from '../core/diff/report.js';
import { renderSourceWith, standaloneSvg, type PipelineOptions, type Rendered } from '../core/pipeline-core.js';
import { Lru } from '../core/text/measure.js';
import type { Diagnostic } from '../core/types.js';
import { loadedKinds } from '../elements/kinds.js';
import type { Translate } from '../ui/blocks/block.js';
import { batch, computed, signal, type ReadSignal, type Signal } from '../ui/signal.js';
import { loadKindsOf } from './kinds.js';

export type DiffViewName = DiffView | 'side';
export type DiffFilter = 'added' | 'removed' | ChangeFacet;
/** The version panel's tab: compare two versions, or view one as it is. */
export type DiffMode = 'compare' | 'history';
export type DiffExportKind = 'svg' | 'png' | 'mmdx' | 'mmd' | 'diff' | 'json' | 'md';

export const DIFF_VIEWS: readonly DiffViewName[] = ['before', 'merged', 'after', 'side'];
export const DIFF_FILTERS: readonly DiffFilter[] = ['added', 'removed', 'content', 'layout', 'style'];

export interface DiffExportOptions {
  /** The view of an image (default: the current one). */
  view?: DiffViewName;
  /** Which version a source export writes (default: after, or the viewed one in History mode). */
  version?: 'before' | 'after' | 'viewed';
  highlights?: boolean;
  legend?: boolean;
  /** PNG scale (1–4, default 2). */
  scale?: number;
  scheme?: 'light' | 'dark';
  /** Reports and patches with the filters applied (default true). */
  filtered?: boolean;
}

/** The two compared versions and the shown one (`viewing` only while one version is viewed as it is). */
export interface DiffPair {
  base: string | null;
  head: string | null;
  viewing: string | null;
}

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
  view?: DiffViewName;
  mode?: DiffMode;
  filters?: readonly DiffFilter[];
  dim?: boolean;
}

const EMPTY_COUNTS: DiffResult['counts'] = { added: 0, removed: 0, changed: 0, content: 0, layout: 0, style: 0 };
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function idle(): Promise<void> {
  const w = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  return new Promise((r) => (w.requestIdleCallback ? w.requestIdleCallback(() => r(), { timeout: 500 }) : setTimeout(r, 16)));
}

export class DiffSession {
  // ---- versions
  readonly versions: Signal<readonly VersionInfo[]> = signal<readonly VersionInfo[]>([]);
  /** Older versions can be loaded (`loadMore`). */
  readonly hasMore = signal(false);
  /** A history was given (the version panel is available); two sources are a two-version history without it. */
  readonly hasHistory = signal(false);
  /** Bumped when a version's change count arrives (`counts(id)`). */
  readonly countsRev = signal(0);
  readonly base = signal<string | null>(null);
  readonly head = signal<string | null>(null);
  readonly viewing = signal<string | null>(null);
  readonly mode: Signal<DiffMode>;
  /** The host shows the version panel (History mode needs it: one version as it is). */
  readonly versionsShown = signal(false);
  /** True while one version is shown as it is (no diff, no diff controls). */
  readonly viewOnly: ReadSignal<boolean>;

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
  private src: DiffSource | null = null;
  private adapter: HistoryAdapter | null = null;
  private unsubscribe: (() => void) | null = null;
  private nextPage: string | undefined;
  private readonly sources = new Map<string, Promise<string>>();
  private readonly countMap = new Map<string, DiffResult['counts'] | null>();
  private countQueue: Promise<void> = Promise.resolve();
  private readonly cache = new Lru<string, DiffRendered>(8);
  /** The load generation: bumped by every `load()`; work of an older generation is dropped when it arrives. */
  private loadSeq = 0;
  private refreshSeq = 0;
  /** The version `plain` renders. */
  private plainOf: string | null = null;
  private more: Promise<void> | null = null;
  private refreshHandle: ReturnType<typeof setTimeout> | 0 = 0;
  private destroyed = false;

  constructor(o: DiffSessionOptions) {
    this.o = o;
    this.mode = signal<DiffMode>(o.mode ?? 'compare');
    this.view = signal<DiffViewName>(o.view ?? 'merged');
    this.dim = signal(o.dim ?? true);
    const f = DiffSession.filterState(o.filters);
    this.ignore = signal<DiffIgnore>(f.ignore);
    this.hide = signal<DiffHide>(f.hide);
    this.viewOnly = computed(() => this.hasHistory() && this.versionsShown() && this.mode() === 'history');
    this.unsupported = computed(() => {
      const D = this.rendered();
      return !!D && !this.viewOnly() && (D.before.model.type === null || D.after.model.type === null) && !D.raw.typeChanged;
    });
    this.banner = computed(() => {
      const D = this.rendered();
      if (!D || this.viewOnly()) return '';
      return this.unsupported() ? o.t('diff.banner.unsupported') : D.raw.typeChanged ? o.t('diff.banner.typeChanged') : '';
    });
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

  /** Change counts of a version against the one before it (undefined: not computed yet; null: the first). */
  counts(id: string): DiffResult['counts'] | null | undefined {
    return this.countMap.get(id);
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
    this.more = null;
    const t = this.o.t;
    this.sources.clear();
    this.countMap.clear();
    this.cache.clear();
    this.countQueue = Promise.resolve();
    batch(() => {
      this.selected.set(null);
      this.rendered.set(null);
      this.setPlain(null, null);
    });
    try {
      if ('history' in s) {
        this.adapter = Array.isArray(s.history) ? staticHistory(s.history as readonly StaticVersion[]) : (s.history as HistoryAdapter);
        batch(() => {
          this.hasHistory.set(true);
          this.status.set({ kind: 'loading', text: t('diff.history.loading') });
        });
        const page = await this.adapter.list();
        if (seq !== this.loadSeq || this.destroyed) return;
        this.nextPage = page.next;
        batch(() => {
          this.versions.set(page.versions);
          this.hasMore.set(!!page.next);
        });
        this.unsubscribe?.();
        this.unsubscribe = this.adapter.subscribe?.(() => void this.reloadHistory()) ?? null;
      } else {
        this.hasHistory.set(false);
        this.unsubscribe?.();
        this.unsubscribe = null;
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
        this.adapter = staticHistory(list);
        this.nextPage = undefined;
        batch(() => {
          this.versions.set(list.map(({ source: _s, ...v }) => v));
          this.hasMore.set(false);
        });
      }
    } catch (e) {
      if (seq !== this.loadSeq || this.destroyed) return;
      this.loadFailed(e);
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
    this.queueCounts();
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
    if (!this.versions.peek()[at() + 1] && this.nextPage) {
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
    const adapter = this.adapter, cursor = this.nextPage;
    if (!adapter || !cursor) return Promise.resolve();
    if (this.more) return this.more;
    const gen = this.loadSeq;
    let p: Promise<void> | null = null;
    p = (async () => {
      try {
        const page = await adapter.list(cursor);
        if (gen !== this.loadSeq || this.destroyed) return;
        const known = new Set(this.versions.peek().map((v) => v.id));
        this.nextPage = page.next;
        batch(() => {
          this.versions.set([...this.versions.peek(), ...page.versions.filter((v) => !known.has(v.id))]);
          this.hasMore.set(!!page.next);
        });
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

  /**
   * A version's source changed (History's working copy follows the document): its cached source and counts go, the
   * version list is read again (the working copy may appear or go), and a comparison that shows it renders again.
   */
  sourceChanged(id: string): void {
    this.sources.delete(id);
    this.countMap.delete(id);
    for (const [i, v] of this.versions.peek().entries()) if (this.versions.peek()[i + 1]?.id === id) this.countMap.delete(v.id);
    this.cache.clear();
    void this.reloadHistory();
    const p = this.pair;
    if (p.base === id || p.head === id || p.viewing === id) this.scheduleRefresh();
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
    if (this.viewOnly.peek()) {
      // the viewed version once it is rendered, never the previous one under its name
      const plain = this.plain.peek();
      return plain && this.plainOf === this.viewing.peek() ? standaloneSvg(plain) : '';
    }
    const D = this.rendered.peek();
    if (!D) return '';
    const view = o.view ?? this.view.peek();
    const t = this.o.t;
    const label = (id: string | null, fallback: string): string => (id ? `${fallback} · ${id}` : fallback);
    const so: DiffSvgOptions = {
      view: view === 'merged' && !D.merged ? 'after' : view, dim: this.dim.peek(), highlights: o.highlights ?? true, legend: o.legend ?? true,
      scheme: o.scheme ?? this.o.scheme(),
      titles: { before: label(this.base.peek(), t('diff.view.before')), after: label(this.head.peek(), t('diff.view.after')) },
    };
    return diffSvg(D, so);
  }

  async toPng(o: DiffExportOptions = {}): Promise<Blob> {
    const svg = this.toSvg(o);
    if (!svg) throw new Error('Nothing rendered');
    const m = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const { svgToPng } = await import('../dom/export.js');
    const bg = this.rendered.peek()?.after.result.page.background;
    const res = await svgToPng(svg, Number(m?.[1] ?? 800), Number(m?.[2] ?? 600), { scale: Math.min(4, Math.max(1, o.scale ?? 2)), fonts: getShared().fonts, ...(bg && bg !== 'transparent' ? { background: bg } : {}) });
    return res.blob;
  }

  /** Builds an export and offers it to the host (`mmdx-export`, cancelable), else downloads it. */
  async exportAs(kind: DiffExportKind, o: DiffExportOptions = {}): Promise<void> {
    const name = this.fileName(kind, o);
    let data: string | Blob;
    let type = 'text/plain';
    const D = this.rendered.peek();
    switch (kind) {
      case 'svg':
        data = this.toSvg(o);
        if (!data) return;
        type = 'image/svg+xml';
        break;
      case 'png':
        data = await this.toPng(o);
        break;
      case 'mmdx':
      case 'mmd': {
        const src = await this.versionSource(o.version);
        data = kind === 'mmd' ? await this.portable(src) : src;
        break;
      }
      case 'diff': {
        if (!D) return;
        const [a, b] = await Promise.all([this.sourceOf(this.base.peek()), this.sourceOf(this.head.peek())]);
        data = unifiedDiff(a, b, { name: `${this.o.name()}.mmdx`, ...(o.filtered === false ? {} : { ignore: this.ignore.peek() }) });
        type = 'text/x-diff';
        break;
      }
      case 'json':
      case 'md': {
        if (!D) return;
        const info = (id: string | null): VersionInfo | undefined => (id ? this.versions.peek().find((v) => v.id === id) : undefined);
        const before = info(this.base.peek()), after = info(this.head.peek());
        data = diffReport(o.filtered === false ? D.raw : D.diff, { format: kind === 'md' ? 'markdown' : 'json', name: this.o.name(), ...(before ? { before } : {}), ...(after ? { after } : {}) });
        type = kind === 'md' ? 'text/markdown' : 'application/json';
        break;
      }
      default:
        return;
    }
    if (!this.o.emit('mmdx-export', { kind, name, data }, true)) return;
    const { download } = await import('../dom/export.js');
    download(name, data, type);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.refreshHandle) clearTimeout(this.refreshHandle);
    this.refreshHandle = 0;
  }

  // ---- rendering --------------------------------------------------------------------------------------------------

  /** Renders the shown pair (or the viewed version) and emits `mmdx-compare` / `mmdx-render`. */
  async refresh(): Promise<void> {
    if (this.destroyed || !this.adapter) return;
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
        const r = renderSourceWith(loadedKinds(), src, this.o.ctx, ro);
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
          D = renderDiffWith(loadedKinds(), a, b, this.o.ctx, { ...ro, ignore, hide });
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

  /** Reads the first page of the history again (it changed); older pages loaded already stay. */
  private async reloadHistory(): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    const gen = this.loadSeq;
    let page: Awaited<ReturnType<HistoryAdapter['list']>>;
    try {
      page = await adapter.list();
    } catch (e) {
      if (gen === this.loadSeq && !this.destroyed) this.loadError(e);
      return;
    }
    if (gen !== this.loadSeq || this.destroyed) return;
    const old = this.versions.peek();
    const last = page.versions.at(-1);
    const from = last && page.next ? old.findIndex((v) => v.id === last.id) : -1;
    const tail = from >= 0 ? old.slice(from + 1).filter((v) => !page.versions.some((n) => n.id === v.id)) : [];
    if (!tail.length) this.nextPage = page.next;
    batch(() => {
      this.versions.set([...page.versions, ...tail]);
      this.hasMore.set(!!this.nextPage);
    });
    this.queueCounts();
  }

  /** Change counts of every version against the one before it, one at a time in idle time (§8.6). */
  private queueCounts(): void {
    if (!this.hasHistory.peek()) return;
    const seq = this.loadSeq;
    const list = this.versions.peek();
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!, older = list[i + 1];
      if (this.countMap.has(v.id)) continue;
      if (!older) {
        if (!this.nextPage) {
          this.countMap.set(v.id, null);
          this.countsRev.update((n) => n + 1);
        }
        continue;
      }
      this.countQueue = this.countQueue.then(() => idle()).then(async () => {
        if (seq !== this.loadSeq || this.destroyed || this.countMap.has(v.id)) return;
        const stale = (): boolean => seq !== this.loadSeq || this.destroyed;
        let counts: DiffResult['counts'];
        try {
          const [a, b] = await Promise.all([this.sourceOf(older.id), this.sourceOf(v.id)]);
          if (stale()) return;
          await loadKindsOf(a, b);
          if (stale()) return;
          counts = diffDiagramsWith(loadedKinds(), a, b).counts;
        } catch {
          counts = { ...EMPTY_COUNTS };
        }
        if (stale()) return;
        this.countMap.set(v.id, counts);
        this.countsRev.update((n) => n + 1);
      });
    }
  }

  private fileName(kind: DiffExportKind, o: DiffExportOptions): string {
    const stem = this.o.name();
    const safe = (s: string | null): string => (s ?? '').replace(/[^\w.-]+/g, '_');
    const viewOnly = this.viewOnly.peek();
    if (kind === 'mmdx' || kind === 'mmd') {
      const id = o.version === 'before' ? this.base.peek() : o.version === 'viewed' || viewOnly ? this.viewing.peek() : this.head.peek();
      return `${stem}-${safe(id)}.${kind}`;
    }
    if (viewOnly && (kind === 'svg' || kind === 'png')) return `${stem}-${safe(this.viewing.peek())}.${kind}`;
    const view = kind === 'svg' || kind === 'png' ? `-${o.view ?? this.view.peek()}` : '';
    return `${stem}-${safe(this.base.peek())}..${safe(this.head.peek())}${view}.${kind}`;
  }

  private versionSource(which: DiffExportOptions['version']): Promise<string> {
    const id = which === 'before' ? this.base.peek() : which === 'viewed' || (!which && this.viewOnly.peek()) ? this.viewing.peek() : this.head.peek();
    return this.sourceOf(id);
  }

  private async portable(src: string): Promise<string> {
    const [{ toPortableMermaid }] = await Promise.all([import('../core/export/portable.js'), loadKindsOf(src)]);
    const r = renderSourceWith(loadedKinds(), src, this.o.ctx);
    return toPortableMermaid(r.doc.code, r.doc.meta, r.model, r.theme, r.rctx.color);
  }
}

/** The code or metadata part of a source as lines (code diff panel). */
export const sourceLines = (src: string, tab: 'code' | 'meta'): string[] => sourcePart(src, tab).replace(/\n$/, '').split('\n');
