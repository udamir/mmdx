// <mmdx-diff> (diff design §8): how a diagram changed between two versions, and its version history. Behind the
// element is the DiagramDiff class, which can also be mounted into any element without custom elements.
//
// Component architecture §8.4: DiagramDiff is the view kernel (ViewCore) with a pinned DiffScene over a DiffSession
// (src/diff) and the diff modules — the diff bar, the version list, the code diff and the change list, the canvas
// behaviour, the export formats, the host's buttons — next to the standard ones: the zoom bar with help and full
// screen, the tool dock with Hand and the pen, the view params with the theme menu and the light / dark toggle, and
// view settings. Views: Before, Merged, After (one canvas; switching animates) and Side by side (two linked canvases).
import { ElementBase } from './base.js';
import { fetchText } from '../adapters/fetch-text.js';
import type { ThemeSource } from '../adapters/themes.js';
import type { HistoryAdapter, StaticVersion } from '../adapters/history.js';
import type { StorageAdapter } from '../adapters/storage.js';
import type { CoreContext } from '../core/context.js';
import type { DiagramDiff as DiffResult, ItemChange } from '../core/diff/index.js';
import type { Rendered } from '../core/pipeline-core.js';
import type { Diagnostic, Rect } from '../core/types.js';
import { reducedMotion } from '../dom/motion.js';
import type { WheelMode } from '../dom/viewport.js';
import { registerMessages } from '../ui/i18n.js';
import { DIFF_MESSAGES } from '../ui/messages/diff.js';
import { computed, effect, signal, untracked } from '../ui/signal.js';
import { DIFF_CSS, DIFF_HOST_CSS, DIFF_TOKENS } from '../ui/styles/diff.js';
import { ViewCore } from '../view/core.js';
import { diffModules, type DiffAction } from '../diff/modules/index.js';
import { DiffScene } from '../diff/scene.js';
import { DIFF_FILTERS, DIFF_VIEWS, DiffSession, type DiffExportKind, type DiffExportOptions, type DiffFilter, type DiffMode, type DiffPair, type DiffSource, type DiffViewName } from '../diff/session.js';

export { DIFF_FILTERS, DIFF_VIEWS };
export type { DiffAction, DiffExportKind, DiffExportOptions, DiffFilter, DiffMode, DiffPair, DiffViewName };

export type DiffPanel = 'history' | 'code' | 'changes';
/** Parts that can be turned off (all on by default): `theme` is the theme menu, `scheme` the light / dark toggle, `layers` view settings. */
export type DiffFeature = 'history' | 'code' | 'changes' | 'views' | 'filters' | 'pen' | 'export' | 'help' | 'fullscreen' | 'select' | 'theme' | 'scheme' | 'layers';

export interface DiffOptions {
  /** URLs of the two versions, fetched through `loader`. */
  before?: string;
  after?: string;
  /** The two versions as sources (win over the URLs). */
  beforeSource?: string;
  afterSource?: string;
  /** A version history: enables the History panel. */
  history?: HistoryAdapter | readonly StaticVersion[];
  /** Version ids to compare when a history is set (default: the one before the newest, and the newest). */
  base?: string;
  head?: string;
  /** History panel tab: compare two versions, or view one as it is. */
  mode?: DiffMode;
  view?: DiffViewName;
  /** Shown change kinds; a facet left out is ignored. Default: all. */
  filters?: readonly DiffFilter[];
  /** Fade unchanged items (default true). */
  dim?: boolean;
  /** Open side panels: `history` and `code` (stacked on the left), `changes` (right); any combination. Default `changes`. */
  panels?: readonly DiffPanel[];
  /** Parts to turn off (all on by default). */
  features?: Partial<Record<DiffFeature, boolean>>;
  theme?: string;
  themeDark?: string;
  ui?: 'light' | 'dark' | 'auto';
  /** The `compact` preset (component architecture §7.6): smaller, icon-only chrome; automatic below a host size. */
  compact?: boolean | 'auto';
  /** `always` (default): wheel pans, ⌘ / Ctrl + wheel and pinch zoom; `ctrl`: only ⌘ / Ctrl + wheel zooms; `never`. */
  wheel?: WheelMode;
  /** File name stem of exports. */
  name?: string;
  /** Accessible name; generated with the change counts by default. */
  label?: string;
  loader?: (url: string) => Promise<string>;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  themeSource?: ThemeSource;
  /** Host actions shown as buttons in the top right corner (e.g. the editor's Restore and Back). */
  actions?: readonly DiffAction[];
}

export interface DiffEventMap {
  'mmdx-compare': CustomEvent<{ counts: DiffResult['counts']; typeChanged: boolean; base: string | null; head: string | null }>;
  'mmdx-select': CustomEvent<{ key: string | null; change: ItemChange | null }>;
  'mmdx-view': CustomEvent<{ view: DiffViewName; mode: DiffMode }>;
  /** The version panel's tab changed, or History mode (one version as it is) started or ended. */
  'mmdx-mode': CustomEvent<{ mode: DiffMode; viewOnly: boolean }>;
  'mmdx-filters': CustomEvent<{ filters: DiffFilter[]; dim: boolean }>;
  'mmdx-version': CustomEvent<{ base: string | null; head: string | null; viewing?: string }>;
  'mmdx-export': CustomEvent<{ kind: DiffExportKind; name: string; data: string | Blob }>;
  'mmdx-render': CustomEvent<{ bounds: Rect; type: string | null; durationMs: number }>;
  'mmdx-error': CustomEvent<{ diagnostics: Diagnostic[] }>;
  'mmdx-fullscreen': CustomEvent<{ active: boolean }>;
  'mmdx-link': CustomEvent<{ href: string; id: string | null }>;
  'mmdx-ui': CustomEvent<{ ui: 'light' | 'dark' }>;
}

/** The open panels of the `panels` option (every key set, so remembered panels never override it). */
const panelState = (list: readonly DiffPanel[] | undefined): Record<DiffPanel, boolean> => {
  const l = list ?? ['changes'];
  return { history: l.includes('history'), code: l.includes('code'), changes: l.includes('changes') };
};

export class DiagramDiff {
  readonly core: ViewCore;
  readonly ctx: CoreContext;
  /** The model: versions, pair, filters, the rendered diff, the selection and the view. */
  readonly session: DiffSession;
  private readonly scene: DiffScene;
  private readonly o: DiffOptions;
  private readonly actions = signal<readonly DiffAction[]>([]);
  private readonly label = signal<string | null>(null);
  private readonly offs: (() => void)[] = [];
  private destroyed = false;

  constructor(host: HTMLElement, options: DiffOptions = {}) {
    registerMessages(DIFF_MESSAGES);
    this.o = { ...options };
    const o = this.o;
    this.core = new ViewCore(host, {
      product: 'diff',
      css: [DIFF_TOKENS, DIFF_HOST_CSS, DIFF_CSS],
      root: { class: 'root', role: 'group' },
      areaClass: 'area',
      canvas: { interaction: 'pan-zoom', wheel: o.wheel ?? 'always', panOnDrag: true, maxK: 8, insets: () => this.scene?.insets() ?? { left: 8, right: 8, top: 8, bottom: 52 } },
      feature: (name) => this.o.features?.[name as DiffFeature] !== false,
      ...(o.storage ? { storage: o.storage } : {}),
      ...(o.ctx ? { ctx: o.ctx } : {}),
      ...(o.themeSource ? { themeSource: o.themeSource } : {}),
      ...(o.ui ? { ui: o.ui } : {}),
      ...(o.theme ? { theme: o.theme } : {}),
      ...(o.themeDark ? { themeDark: o.themeDark } : {}),
      ...(o.compact !== undefined ? { compact: o.compact } : {}),
    });
    const core = this.core;
    this.ctx = core.ctx;
    core.canvas.svg.setAttribute('aria-hidden', 'true');
    // hover highlight is a view setting the diff starts with off (unchanged items are already dimmed)
    core.display.set({ labels: true, hoverHighlight: false });
    this.actions.set(o.actions ?? []);
    this.label.set(o.label ?? null);

    const session = (this.session = new DiffSession({
      ctx: core.ctx,
      t: core.i18n.t,
      emit: (type, detail, cancelable) => core.emit(type, detail, cancelable),
      renderOptions: () => {
        const d = core.display.peek(), layers = core.visibleLayers.peek();
        return { theme: core.shownTheme(), ...(d.labels ? {} : { hideLabels: true }), ...(layers ? { visibleLayers: layers } : {}) };
      },
      ensureTheme: (id) => core.ensureTheme(id),
      scheme: () => core.scheme.peek(),
      name: () => this.o.name ?? 'diagram',
      showVersions: () => {
        if (!core.feature('history')) return;
        session.versionsShown.set(true);
        core.run('setPanel', 'history', true);
      },
      ...(o.view ? { view: o.view } : {}),
      ...(o.mode ? { mode: o.mode } : {}),
      ...(o.filters ? { filters: o.filters } : {}),
      ...(o.dim !== undefined ? { dim: o.dim } : {}),
    }));
    const label = computed(() => {
      const t = core.i18n.t;
      const own = this.label();
      if (own) return own;
      if (session.viewOnly()) return t('diff.labelVersion', { id: session.viewing() ?? '' });
      const D = session.rendered();
      return D ? t('diff.label', { added: D.diff.counts.added, removed: D.diff.counts.removed, changed: D.diff.counts.changed }) : t('diff.empty.nothing');
    });
    this.scene = new DiffScene(core, session, { reducedMotion, label, canvas: () => ({ wheel: this.o.wheel ?? 'always' }) });

    // what view settings and the export of the version read
    const shown = (): Rendered | null => (session.viewOnly.peek() ? session.plain.peek() : session.rendered.peek()?.after) ?? null;
    core.provide('documentModel', () => shown()?.model ?? null);
    core.provide('documentMeta', () => shown()?.doc.meta ?? null);
    core.provide('documentCode', () => shown()?.doc.code ?? null);
    core.pushScene(this.scene);

    core.panels.set({ ...core.panels.peek(), ...panelState(o.panels) });
    core.useModules(diffModules(this.scene, { actions: this.actions }));
    this.offs.push(
      effect(() => core.root.setAttribute('aria-label', label())),
      // History mode needs the version panel
      effect(() => {
        const on = !!core.panels()['history'] && core.feature('history');
        untracked(() => session.setVersionsShown(on));
      }),
      // a type that cannot be drawn: the code diff shows the changes
      effect(() => {
        if (session.unsupported() && core.feature('code') && !core.panels.peek()['code']) untracked(() => core.run('setPanel', 'code', true));
      }),
    );
    void this.load();
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  get options(): Readonly<DiffOptions> {
    return this.o;
  }

  /** Updates options; reloads or re-renders as needed. */
  set(patch: Partial<DiffOptions>): void {
    const reload = ['before', 'after', 'beforeSource', 'afterSource', 'history'].some((k) => k in patch && (patch as Record<string, unknown>)[k] !== (this.o as Record<string, unknown>)[k]);
    Object.assign(this.o, patch);
    const core = this.core, s = this.session;
    // options and attributes set the state without an event, as the filters do
    if ('view' in patch && patch.view) s.applyView(patch.view);
    if ('mode' in patch && patch.mode) s.applyMode(patch.mode);
    if ('filters' in patch) s.applyFilters(patch.filters);
    if ('dim' in patch && patch.dim !== undefined) s.dim.set(patch.dim);
    if ('panels' in patch) core.panels.set({ ...core.panels.peek(), ...panelState(patch.panels) });
    if ('ui' in patch) core.setUi(patch.ui);
    if ('theme' in patch) core.themes.attr.set(patch.theme ?? null);
    if ('themeDark' in patch) core.themes.attrDark.set(patch.themeDark ?? null);
    if ('compact' in patch) core.setCompact(patch.compact ?? 'auto');
    if ('label' in patch) this.label.set(patch.label ?? null);
    if ('actions' in patch) this.actions.set(patch.actions ?? []);
    if ('wheel' in patch) for (const c of this.scene.canvases()) c.setOptions({ wheel: patch.wheel ?? 'always' });
    if ('features' in patch || 'actions' in patch) core.refreshModules();
    if (reload) {
      void this.load();
      return;
    }
    if (('base' in patch || 'head' in patch) && s.versions.peek().length) {
      s.setPair(patch.base ?? s.base.peek(), patch.head ?? s.head.peek());
      return;
    }
    s.scheduleRefresh();
  }

  /** Compares two sources (a two-version history). */
  compare(before: string, after: string): Promise<void> {
    Object.assign(this.o, { beforeSource: before, afterSource: after });
    delete this.o.history;
    return this.load();
  }

  /** Shows a version history (an adapter, or a list of versions with their sources). */
  setHistory(history: HistoryAdapter | readonly StaticVersion[]): Promise<void> {
    this.o.history = history;
    return this.load();
  }

  /** Compares two versions of the history by id. */
  setPair(baseId: string, headId: string): void {
    this.session.setPair(baseId, headId);
  }

  /** Shows one version as it is (History mode). */
  viewVersion(id: string): void {
    this.session.viewVersion(id);
  }

  setView(view: DiffViewName): void {
    this.session.setView(view);
  }

  /** Shown change kinds; a facet left out is ignored. */
  setFilters(filters: readonly DiffFilter[], dim?: boolean): void {
    this.session.setFilters(filters, dim);
  }

  get filters(): DiffFilter[] {
    return this.session.filters;
  }

  /** Selects a change by key (`kind:id`), or clears the selection; a selected change is brought into view. */
  select(key: string | null): void {
    this.session.select(key);
  }

  next(): void {
    this.session.next();
  }

  prev(): void {
    this.session.prev();
  }

  fit(): void {
    const b = this.scene.bounds.peek();
    if (b) this.core.canvas.fit(b);
    else this.core.canvas.fit();
  }

  zoomTo(k: number): void {
    this.core.canvas.zoomTo(k);
  }

  /** The diff with the filters applied (null before the first comparison). */
  getDiff(): DiffResult | null {
    return this.session.getDiff();
  }

  /** The two compared versions and the shown one. */
  get pair(): DiffPair {
    return this.session.pair;
  }

  /** Standalone SVG of a view (default: the current one). */
  toSvg(o: DiffExportOptions = {}): string {
    return this.session.toSvg(o);
  }

  toPng(o: DiffExportOptions = {}): Promise<Blob> {
    return this.session.toPng(o);
  }

  /** Builds an export and offers it to the host (`mmdx-export`, cancelable), else downloads it. */
  exportAs(kind: DiffExportKind, o: DiffExportOptions = {}): Promise<void> {
    return this.session.exportAs(kind, o);
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.session.diagnostics;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.offs.splice(0)) off();
    this.session.destroy();
    this.core.destroy();
  }

  // ---- loading ----------------------------------------------------------------------------------------------------

  private load(): Promise<void> {
    const o = this.o;
    const src: DiffSource = o.history
      ? { history: o.history, base: o.base, head: o.head }
      : { before: this.fetchSide(o.beforeSource, o.before), after: this.fetchSide(o.afterSource, o.after), base: o.base, head: o.head };
    return this.session.load(src);
  }

  private async fetchSide(source: string | undefined, url: string | undefined): Promise<string | null> {
    if (source !== undefined) return source;
    if (!url) return null;
    return (this.o.loader ?? fetchText)(url);
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

export class MmdxDiffElement extends ElementBase {
  static observedAttributes = ['before', 'after', 'base', 'head', 'mode', 'view', 'filters', 'dim', 'panels', 'theme', 'theme-dark', 'ui', 'wheel', 'name', 'label', 'compact'];
  private diff: DiagramDiff | null = null;
  private pending: Partial<DiffOptions> = {};

  connectedCallback(): void {
    this.diff = new DiagramDiff(this, { ...this.attrOptions(), ...this.pending });
  }

  disconnectedCallback(): void {
    this.diff?.destroy();
    this.diff = null;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (!this.diff || old === value) return;
    const o = this.attrOptions();
    const key = name === 'theme-dark' ? 'themeDark' : name;
    this.diff.set({ [key]: (o as Record<string, unknown>)[key] } as Partial<DiffOptions>);
  }

  private attrOptions(): Partial<DiffOptions> {
    const o: Partial<DiffOptions> = {};
    const a = (n: string): string | null => this.getAttribute(n);
    const list = (n: string): string[] | undefined => (this.hasAttribute(n) ? (a(n) ?? '').split(/[\s,]+/).filter(Boolean) : undefined);
    const set = <K extends keyof DiffOptions>(k: K, v: DiffOptions[K] | undefined | null): void => {
      if (v !== undefined && v !== null) o[k] = v;
    };
    set('before', a('before'));
    set('after', a('after'));
    set('base', a('base'));
    set('head', a('head'));
    set('mode', a('mode') === 'history' ? 'history' : a('mode') === 'compare' ? 'compare' : undefined);
    const view = a('view') as DiffViewName | null;
    set('view', view && DIFF_VIEWS.includes(view) ? view : undefined);
    set('filters', list('filters')?.filter((f): f is DiffFilter => (DIFF_FILTERS as readonly string[]).includes(f)));
    set('dim', this.hasAttribute('dim') ? a('dim') !== 'false' : undefined);
    set('panels', list('panels')?.filter((p): p is DiffPanel => p === 'history' || p === 'code' || p === 'changes'));
    set('theme', a('theme'));
    set('themeDark', a('theme-dark'));
    set('ui', a('ui') as DiffOptions['ui'] | null);
    set('wheel', a('wheel') as WheelMode | null);
    set('name', a('name'));
    set('label', a('label'));
    const compact = a('compact');
    if (compact !== null) o.compact = compact === 'auto' ? 'auto' : compact !== 'false';
    return o;
  }

  private setOpt(patch: Partial<DiffOptions>): void {
    if (this.diff) this.diff.set(patch);
    else Object.assign(this.pending, patch);
  }

  /** The imperative instance (null while disconnected). */
  get instance(): DiagramDiff | null {
    return this.diff;
  }

  get beforeSource(): string | undefined {
    return this.diff?.options.beforeSource ?? this.pending.beforeSource;
  }
  set beforeSource(v: string | undefined) {
    if (v !== undefined) this.setOpt({ beforeSource: v });
  }
  get afterSource(): string | undefined {
    return this.diff?.options.afterSource ?? this.pending.afterSource;
  }
  set afterSource(v: string | undefined) {
    if (v !== undefined) this.setOpt({ afterSource: v });
  }
  get history(): DiffOptions['history'] {
    return this.diff?.options.history ?? this.pending.history;
  }
  set history(v: DiffOptions['history']) {
    if (v) this.setOpt({ history: v });
  }
  get features(): DiffOptions['features'] {
    return this.diff?.options.features ?? this.pending.features;
  }
  set features(v: DiffOptions['features']) {
    this.setOpt({ features: v ?? {} });
  }
  /** Open panels: a list, or a space-separated string like the attribute. */
  get panels(): readonly DiffPanel[] | undefined {
    return this.diff?.options.panels ?? this.pending.panels;
  }
  set panels(v: readonly DiffPanel[] | string | undefined) {
    const list = typeof v === 'string' ? v.split(/[\s,]+/).filter((p): p is DiffPanel => p === 'history' || p === 'code' || p === 'changes') : v;
    if (list) this.setOpt({ panels: list });
  }
  set loader(v: DiffOptions['loader']) {
    if (v) this.setOpt({ loader: v });
  }
  set storage(v: StorageAdapter) {
    this.pending.storage = v;
  }
  set ctx(v: Partial<CoreContext>) {
    this.pending.ctx = v;
  }
  set themeSource(v: ThemeSource) {
    this.setOpt({ themeSource: v });
  }
  /** Host buttons in the top right corner. */
  get actions(): readonly DiffAction[] | undefined {
    return this.diff?.options.actions ?? this.pending.actions;
  }
  set actions(v: readonly DiffAction[] | undefined) {
    this.setOpt({ actions: v ?? [] });
  }

  compare(before: string, after: string): Promise<void> {
    if (this.diff) return this.diff.compare(before, after);
    Object.assign(this.pending, { beforeSource: before, afterSource: after });
    return Promise.resolve();
  }
  setHistory(history: HistoryAdapter | readonly StaticVersion[]): Promise<void> {
    if (this.diff) return this.diff.setHistory(history);
    this.pending.history = history;
    return Promise.resolve();
  }
  setPair(baseId: string, headId: string): void {
    this.diff?.setPair(baseId, headId);
  }
  viewVersion(id: string): void {
    this.diff?.viewVersion(id);
  }
  setView(view: DiffViewName): void {
    this.diff?.setView(view);
  }
  setFilters(filters: readonly DiffFilter[], dim?: boolean): void {
    this.diff?.setFilters(filters, dim);
  }
  select(key: string | null): void {
    this.diff?.select(key);
  }
  next(): void {
    this.diff?.next();
  }
  prev(): void {
    this.diff?.prev();
  }
  fit(): void {
    this.diff?.fit();
  }
  zoomTo(k: number): void {
    this.diff?.zoomTo(k);
  }
  getDiff(): DiffResult | null {
    return this.diff?.getDiff() ?? null;
  }
  exportAs(kind: DiffExportKind, options?: DiffExportOptions): Promise<void> {
    return this.diff ? this.diff.exportAs(kind, options) : Promise.reject(new Error('Not connected'));
  }
  toSvg(options?: DiffExportOptions): string {
    return this.diff?.toSvg(options) ?? '';
  }
  toPng(options?: DiffExportOptions): Promise<Blob> {
    return this.diff ? this.diff.toPng(options) : Promise.reject(new Error('Not connected'));
  }
}

export function defineDiff(name = 'mmdx-diff'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxDiffElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-diff': MmdxDiffElement;
  }
}
