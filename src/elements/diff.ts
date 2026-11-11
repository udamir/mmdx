// <mmdx-diff> (diff design §8): how a diagram changed between two versions, and its version history. Behind the
// element is the DiagramDiff class, which can also be mounted into any element without custom elements.
//
// Component architecture §8.4: DiagramDiff is the view kernel (ViewCore) with a pinned DiffScene over a DiffSession
// (src/diff) and the diff modules — the diff bar, the version list, the code diff and the change list, the canvas
// behaviour, the export formats, the host's buttons — next to the standard ones: the zoom bar with help and full
// screen, the tool dock with Hand and the pen, the view params with the theme menu and the light / dark toggle, and
// view settings. Views: Before, Merged, After (one canvas; switching animates) and Side by side (two linked canvases).
import { MmdxElement, warnOnce, words, type AttrSpec, type Patch } from './base.js';
import { Owner } from '../reactive/owner.js';
import { fetchText } from '../adapters/fetch-text.js';
import type { ThemeSource, HistoryAdapter, StorageAdapter } from '../ports.js';
import type { StaticVersion } from '../adapters/history.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import type { DiagramDiff as DiffResult, ItemChange } from '../core/diff/index.js';
import type { Rendered } from '../core/pipeline-core.js';
import type { Diagnostic, Rect } from '../core/types.js';
import { reducedMotion } from '../dom/motion.js';
import type { WheelMode } from '../dom/viewport.js';
import { registerMessages } from '../i18n.js';
import { DIFF_MESSAGES } from '../diff/messages.js';
import { computed, effect, signal, untracked } from '../reactive/signal.js';
import { DIFF_CSS, DIFF_HOST_CSS, DIFF_TOKENS } from '../diff/styles.js';
import { ViewCore } from '../view/core.js';
import { diffModules, type DiffAction } from '../diff/modules/index.js';
import { DiffScene } from '../diff/scene.js';
import { DIFF_FILTERS, DIFF_VIEWS, DiffSession, type DiffMode, type DiffSource } from '../diff/session.js';
import { type DiffExportKind, type DiffExportOptions, type DiffFilter, type DiffPair, type DiffViewName } from '../view/history.js';

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
  /** `always` (default): wheel pans, ⌘ / Ctrl + wheel and pinch zoom; `zoom`: wheel zooms, Shift + wheel pans; `ctrl`: only ⌘ / Ctrl + wheel zooms; `never`. */
  wheel?: WheelMode;
  /** File name stem of exports. */
  name?: string;
  /** Accessible name; generated with the change counts by default. */
  label?: string;
  loader?: (url: string) => Promise<string>;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  /** The component's own icon packs, over the shared ones of `configure({ iconPacks })`; read when it is created. */
  iconPacks?: readonly IconPack[];
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
  private readonly owner = new Owner('diff');
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
      ...(o.iconPacks ? { iconPacks: o.iconPacks } : {}),
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
    core.setDisplay({ labels: true, hoverHighlight: false, animate: true });
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

    core.setPanels({ ...panelState(o.panels) });
    core.useModules(diffModules(this.scene, { actions: this.actions }));
    this.owner.add(effect(() => core.root.setAttribute('aria-label', label())));
    // History mode needs the version panel
    this.owner.add(effect(() => {
      const on = !!core.panels()['history'] && core.feature('history');
      untracked(() => session.setVersionsShown(on));
    }));
    // a type that cannot be drawn: the code diff shows the changes
    this.owner.add(effect(() => {
      if (session.unsupported() && core.feature('code') && !core.panels.peek()['code']) untracked(() => core.run('setPanel', 'code', true));
    }));
    void this.load();
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  get options(): Readonly<DiffOptions> {
    return this.o;
  }

  /** Updates options; reloads or re-renders as needed. */
  set(patch: Patch<DiffOptions>): void {
    const reload = ['before', 'after', 'beforeSource', 'afterSource', 'history'].some((k) => k in patch && (patch as Record<string, unknown>)[k] !== (this.o as Record<string, unknown>)[k]);
    const ctx = this.o.ctx;
    Object.assign(this.o, patch);
    const core = this.core, s = this.session;
    // options and attributes set the state without an event, as the filters do
    if ('view' in patch && patch.view) s.applyView(patch.view);
    if ('mode' in patch && patch.mode) s.applyMode(patch.mode);
    if ('filters' in patch) s.applyFilters(patch.filters);
    if ('dim' in patch && patch.dim !== undefined) s.dim.set(patch.dim);
    if ('panels' in patch) core.setPanels({ ...panelState(patch.panels) });
    if ('storage' in patch) core.setStorage(patch.storage);
    if ('themeSource' in patch) core.setThemeSource(patch.themeSource);
    if ('ctx' in patch && patch.ctx !== ctx) warnOnce('diff: `ctx` is read when the diff is created');
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
    this.owner.dispose();
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

const DIFF_FEATURES: readonly DiffFeature[] = ['history', 'code', 'changes', 'views', 'filters', 'pen', 'export', 'help', 'fullscreen', 'select', 'theme', 'scheme', 'layers'];
const DIFF_PANELS: readonly DiffPanel[] = ['history', 'code', 'changes'];
const text = (v: string | null): string | undefined => v ?? undefined;
/** The known entries of a list attribute. */
const listOf = <T extends string>(known: readonly T[]) => (v: string | null): T[] | undefined => (v === null ? undefined : words(v).filter((x): x is T => known.includes(x as T)));
const panelList = listOf(DIFF_PANELS);

/** Attributes and the option each one sets. `features` lists the parts that are on (like the viewer's `controls`). */
const ATTRS: Readonly<Record<string, AttrSpec<DiffOptions>>> = {
  before: ['before', text], after: ['after', text], base: ['base', text], head: ['head', text],
  mode: ['mode', (v) => (v === 'history' || v === 'compare' ? v : undefined)],
  view: ['view', (v) => (v && (DIFF_VIEWS as readonly string[]).includes(v) ? v : undefined)],
  filters: ['filters', listOf(DIFF_FILTERS)], dim: ['dim', (v) => (v === null ? undefined : v !== 'false')], panels: ['panels', panelList],
  features: ['features', (v) => (v === null ? undefined : Object.fromEntries(DIFF_FEATURES.map((f) => [f, words(v).includes(f)])))],
  theme: ['theme', text], 'theme-dark': ['themeDark', text], ui: ['ui', text], wheel: ['wheel', text], name: ['name', text], label: ['label', text],
  compact: ['compact', (v) => (v === null ? undefined : v === 'auto' ? 'auto' : v !== 'false')],
};

export class MmdxDiffElement extends MmdxElement<DiffOptions, DiagramDiff> {
  static observedAttributes = Object.keys(ATTRS);

  protected attrs(): typeof ATTRS {
    return ATTRS;
  }

  protected create(o: DiffOptions): DiagramDiff {
    return new DiagramDiff(this, o);
  }

  protected apply(d: DiagramDiff, patch: Patch<DiffOptions>): void {
    d.set(patch);
  }

  get beforeSource(): string | undefined {
    return this.live?.options.beforeSource ?? this.props.beforeSource;
  }
  set beforeSource(v: string | undefined) {
    this.setOpt({ beforeSource: v });
  }
  get afterSource(): string | undefined {
    return this.live?.options.afterSource ?? this.props.afterSource;
  }
  set afterSource(v: string | undefined) {
    this.setOpt({ afterSource: v });
  }
  get history(): DiffOptions['history'] {
    return this.live?.options.history ?? this.props.history;
  }
  set history(v: DiffOptions['history']) {
    this.setOpt({ history: v });
  }
  get features(): DiffOptions['features'] {
    return this.live?.options.features ?? this.props.features;
  }
  /** Parts on and off: an object, or a space-separated string like the attribute. */
  set features(v: DiffOptions['features'] | string) {
    this.setOpt({ features: typeof v === 'string' ? (ATTRS['features']![1](v) as DiffOptions['features']) : v });
  }
  /** Open panels: a list, or a space-separated string like the attribute. */
  get panels(): readonly DiffPanel[] | undefined {
    return this.live?.options.panels ?? this.props.panels;
  }
  set panels(v: readonly DiffPanel[] | string | undefined) {
    this.setOpt({ panels: typeof v === 'string' ? panelList(v) : v });
  }
  get loader(): DiffOptions['loader'] {
    return this.props.loader;
  }
  set loader(v: DiffOptions['loader']) {
    this.setOpt({ loader: v });
  }
  get storage(): StorageAdapter | undefined {
    return this.props.storage;
  }
  set storage(v: StorageAdapter | undefined) {
    this.setOpt({ storage: v });
  }
  /** Read when the component is created (a change while connected applies the next time it is). */
  get ctx(): Partial<CoreContext> | undefined {
    return this.props.ctx;
  }
  set ctx(v: Partial<CoreContext> | undefined) {
    this.setOpt({ ctx: v });
  }
  get themeSource(): ThemeSource | undefined {
    return this.props.themeSource;
  }
  set themeSource(v: ThemeSource | undefined) {
    this.setOpt({ themeSource: v });
  }
  /** Host buttons in the top right corner. */
  get actions(): readonly DiffAction[] | undefined {
    return this.live?.options.actions ?? this.props.actions;
  }
  set actions(v: readonly DiffAction[] | undefined) {
    this.setOpt({ actions: v });
  }

  compare(before: string, after: string): Promise<void> {
    Object.assign(this.props, { beforeSource: before, afterSource: after });
    delete this.props.history;
    return this.live?.compare(before, after) ?? Promise.resolve();
  }
  setHistory(history: HistoryAdapter | readonly StaticVersion[]): Promise<void> {
    this.props.history = history;
    return this.live?.setHistory(history) ?? Promise.resolve();
  }
  setPair(baseId: string, headId: string): void {
    this.live?.setPair(baseId, headId);
  }
  viewVersion(id: string): void {
    this.live?.viewVersion(id);
  }
  setView(view: DiffViewName): void {
    this.live?.setView(view);
  }
  setFilters(filters: readonly DiffFilter[], dim?: boolean): void {
    this.live?.setFilters(filters, dim);
  }
  select(key: string | null): void {
    this.live?.select(key);
  }
  next(): void {
    this.live?.next();
  }
  prev(): void {
    this.live?.prev();
  }
  fit(): void {
    this.live?.fit();
  }
  zoomTo(k: number): void {
    this.live?.zoomTo(k);
  }
  getDiff(): DiffResult | null {
    return this.live?.getDiff() ?? null;
  }
  exportAs(kind: DiffExportKind, options?: DiffExportOptions): Promise<void> {
    return this.live ? this.live.exportAs(kind, options) : Promise.reject(new Error('Not connected'));
  }
  toSvg(options?: DiffExportOptions): string {
    return this.live?.toSvg(options) ?? '';
  }
  toPng(options?: DiffExportOptions): Promise<Blob> {
    return this.live ? this.live.toPng(options) : Promise.reject(new Error('Not connected'));
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
