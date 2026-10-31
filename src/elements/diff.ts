// <mmdx-diff> (diff design §8): how a diagram changed between two versions, and its version history. Behind the
// element is the DiagramDiff class, which can also be mounted into any element without custom elements.
//
// Views: Before, Merged, After (one canvas; switching animates) and Side by side (two linked canvases). Filters hide
// added / removed items and ignore content / layout / style changes. Panels: the version history and the code diff
// (left, one at a time) and the change list (right). Pan, the magic pen, the zoom bar with help, export.
import { ElementBase } from './base.js';
import type { ThemeSource } from '../adapters/themes.js';
import { contentId, staticHistory, type HistoryAdapter, type StaticVersion } from '../adapters/history.js';
import { localStorageAdapter, memoryStorage, type StorageAdapter } from '../adapters/storage.js';
import { ensureBuiltinThemes, getShared, instanceContext } from '../config.js';
import type { CoreContext } from '../core/context.js';
import { annotate, focusRect, shapeOf, type DiffView } from '../core/diff/annotate.js';
import { diffDiagrams, type ChangeFacet, type DiagramDiff as DiffResult, type DiffIgnore, type ItemChange } from '../core/diff/index.js';
import { changeKey } from '../core/diff/merge.js';
import { diffSvg, renderDiff, renderedOf, type DiffHide, type DiffRendered, type DiffSvgOptions } from '../core/diff/render.js';
import { diffReport, sourcePart, unifiedDiff, type VersionInfo } from '../core/diff/report.js';
import { splitSource } from '../core/meta/index.js';
import { renderSource, standaloneSvg, type Rendered } from '../core/pipeline.js';
import { pageScene } from '../core/render/page.js';
import { BUILTIN_IDS } from '../core/theme/builtin-ids.js';
import { counterpartTheme, HOUSE } from '../core/theme/pairs.js';
import { Lru } from '../core/text/measure.js';
import type { Diagnostic, Rect } from '../core/types.js';
import { Morph, type MorphState } from '../dom/morph.js';
import { patchChildren, setMarkedLines } from '../dom/patch.js';
import { hasMarks, markRuns } from '../core/text/marks.js';
import { fmt } from '../core/scene/serialize.js';
import { Viewport, type ViewState, type WheelMode } from '../dom/viewport.js';
import { h, icon } from '../ui/h.js';
import { registerMessages, type I18n } from '../ui/i18n.js';
import { I_code, I_download, I_expand, I_hand, I_list, I_pen, I_shrink } from '../ui/icons.js';
import { DIFF_MESSAGES } from '../ui/messages/diff.js';
import { attachPaneResizer } from '../ui/panes.js';
import { PopoverManager, Toaster } from '../ui/popover.js';
import { ShortcutRegistry, type Shortcut } from '../ui/shortcuts.js';
import { ALIASES, adoptStyles, BASE, resolveUiScheme, TOKENS, watchUiScheme } from '../ui/styles/base.js';
import { DIFF_CSS, DIFF_TOKENS } from '../ui/styles/diff.js';
import { helpKeys, ZOOM_BAR_CSS } from '../ui/zoom-bar.js';
import { penOptions } from './viewer-popups.js';
import { DiffInk } from './diff/ink.js';
import { ago, changeList, codeDiff, codeListing, describeChange, FILTER_ICONS, historyRows, I_history, metaLines, relatedLines } from './diff/panels.js';

const NS = 'http://www.w3.org/2000/svg';

export type DiffViewName = DiffView | 'side';
export type DiffFilter = 'added' | 'removed' | ChangeFacet;
export type DiffPanel = 'history' | 'code' | 'changes';
export type DiffMode = 'compare' | 'history';
export type DiffFeature = 'history' | 'code' | 'changes' | 'views' | 'filters' | 'pen' | 'export' | 'help' | 'fullscreen' | 'select';
export type DiffExportKind = 'svg' | 'png' | 'mmdx' | 'mmd' | 'diff' | 'json' | 'md';

export const DIFF_VIEWS: readonly DiffViewName[] = ['before', 'merged', 'after', 'side'];
export const DIFF_FILTERS: readonly DiffFilter[] = ['added', 'removed', 'content', 'layout', 'style'];

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

/** A button the host adds to the diff. */
export interface DiffAction {
  id: string;
  label: string;
  title?: string;
  primary?: boolean;
  /** Enabled for the shown versions (default: always). */
  enabled?: (pair: { base: string | null; head: string | null; viewing: string | null }) => boolean;
  run: () => void;
}

export interface DiffEventMap {
  'mmdx-compare': CustomEvent<{ counts: DiffResult['counts']; typeChanged: boolean; base: string | null; head: string | null }>;
  'mmdx-select': CustomEvent<{ key: string | null; change: ItemChange | null }>;
  'mmdx-view': CustomEvent<{ view: DiffViewName; mode: DiffMode }>;
  'mmdx-filters': CustomEvent<{ filters: DiffFilter[]; dim: boolean }>;
  'mmdx-version': CustomEvent<{ base: string | null; head: string | null; viewing?: string }>;
  'mmdx-export': CustomEvent<{ kind: DiffExportKind; name: string; data: string | Blob }>;
  'mmdx-render': CustomEvent<{ bounds: Rect; type: string | null; durationMs: number }>;
  'mmdx-error': CustomEvent<{ diagnostics: Diagnostic[] }>;
  'mmdx-fullscreen': CustomEvent<{ active: boolean }>;
}

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

interface Canvas {
  svg: SVGSVGElement;
  defs: SVGDefsElement;
  vpEl: SVGGElement;
  content: SVGGElement;
  inkLayer: SVGGElement;
  vp: Viewport;
  side: 'before' | 'after' | 'single';
  detach: () => void;
}

const emit = <K extends keyof DiffEventMap>(target: EventTarget, type: K, detail: DiffEventMap[K]['detail'], cancelable = false): boolean =>
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));

const STATE_OF: Record<DiffView, number> = { before: 0, merged: 1, after: 2 };
const VIEW_KEYS: Record<DiffViewName, string> = { before: '1', merged: '2', after: '3', side: '4' };
const PANE_LIMITS = { left: [280, 900], right: [240, 640] } as const;

// word-level change marks in the merged picture become styled runs when patched into the DOM (fixed class tokens;
// the text only ever goes through text nodes)
setMarkedLines((el, lines) => {
  if (!lines.some((l) => hasMarks(l.text))) return false;
  const runs = markRuns(lines.map((l) => l.text));
  el.replaceChildren(...lines.map((l, i) => {
    const span = document.createElementNS(NS, 'tspan');
    span.setAttribute('x', fmt(l.x));
    span.setAttribute('y', fmt(l.y));
    const rs = runs[i]!;
    span.append(...(rs.length ? rs : [{ text: '\u00a0', mark: null }]).map((r) => {
      if (!r.mark) return document.createTextNode(r.text);
      const run = document.createElementNS(NS, 'tspan');
      run.setAttribute('class', `dx-${r.mark}`);
      run.textContent = r.text;
      return run;
    }));
    return span;
  }));
  return true;
});

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class DiagramDiff {
  readonly ctx: CoreContext;
  private readonly o: DiffOptions;
  private readonly shadow: ShadowRoot;
  private readonly i18n: I18n;
  private readonly storage: StorageAdapter;
  private readonly rootEl: HTMLElement;
  private readonly area: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly actionsBar: HTMLElement;
  private readonly live: HTMLElement;
  private readonly vbarWrap: HTMLElement;
  private readonly vbar: HTMLElement;
  private readonly dbar: HTMLElement;
  private readonly zoomLabel: HTMLOutputElement;
  private readonly helpBtn: HTMLButtonElement;
  private readonly fsBtn: HTMLButtonElement;
  /** The left column: History on top, the code diff below (each shown on its own), like the editor's right stack. */
  private readonly leftPane: HTMLElement;
  private readonly historyPanel: HTMLElement;
  private readonly historyHead: HTMLElement;
  private readonly historyBody: HTMLElement;
  private readonly codePanel: HTMLElement;
  private readonly codeHead: HTMLElement;
  private readonly codeBodyEl: HTMLElement;
  private readonly rightPane: HTMLElement;
  private readonly rightBody: HTMLElement;
  private readonly pops: PopoverManager;
  private readonly toaster: Toaster;
  private readonly shortcuts = new ShortcutRegistry();
  private readonly ink: DiffInk;
  private readonly cleanups: (() => void)[] = [];
  private readonly ac = new AbortController();
  private destroyed = false;

  // ---- data
  private adapter: HistoryAdapter | null = null;
  private unsubscribe: (() => void) | null = null;
  /** A history was given (the History panel is available); otherwise before / after are a two-version history. */
  private hasHistory = false;
  private versions: VersionInfo[] = [];
  private nextPage: string | undefined;
  private readonly sources = new Map<string, Promise<string>>();
  private readonly counts = new Map<string, DiffResult['counts'] | null>();
  private countQueue: Promise<void> = Promise.resolve();
  private base: string | null = null;
  private head: string | null = null;
  private viewing: string | null = null;
  private D: DiffRendered | null = null;
  private plain: Rendered | null = null;
  private readonly cache = new Lru<string, DiffRendered>(8);
  private loadSeq = 0;
  private readonly fetchedThemes = new Set<string>();

  // ---- UI state
  private view: DiffViewName;
  private mode: DiffMode;
  private ignore: DiffIgnore = {};
  private hide: DiffHide = {};
  private dim: boolean;
  private historyOpen = false;
  private codeOpen = false;
  private changesOpen = true;
  private tool: 'pan' | 'pen' = 'pan';
  private selected: string | null = null;
  private codeTab: 'code' | 'meta' = 'code';
  private codeAll = false;
  private helpOpen = false;

  // ---- canvases
  private canvases: Canvas[] = [];
  private morph: Morph | null = null;
  private linking = false;
  private stageKind: 'single' | 'side' | 'plain' | null = null;

  constructor(private readonly host: HTMLElement, options: DiffOptions = {}) {
    this.o = { ...options };
    registerMessages(DIFF_MESSAGES);
    const shared = getShared();
    this.i18n = shared.i18n;
    this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());
    this.ctx = instanceContext(options.ctx);
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    adoptStyles(this.shadow, [TOKENS, ALIASES, BASE, DIFF_TOKENS, ZOOM_BAR_CSS, DIFF_CSS]);
    const t = this.i18n.t;

    this.view = options.view ?? 'merged';
    this.mode = options.mode ?? 'compare';
    this.dim = options.dim ?? true;
    this.applyFilterList(options.filters);
    this.applyPanelList(options.panels);

    this.stage = h('div', { class: 'stage', part: 'canvas' });
    this.msg = h('div', { class: 'msg' });
    this.banner = h('div', { class: 'banner', role: 'status', hidden: true });
    this.actionsBar = h('div', { class: 'host-actions', role: 'group', hidden: true });
    this.vbar = h('div', { class: 'vbar mmdx-float', role: 'toolbar', 'aria-label': t('diff.tools'), 'aria-orientation': 'vertical', part: 'toolbar' });
    this.vbarWrap = h('div', { class: 'vbar-wrap' }, this.vbar);
    this.dbar = h('div', { class: 'dbar mmdx-float', role: 'toolbar', 'aria-label': t('diff.views'), part: 'diff-bar' });
    this.zoomLabel = h('output', { 'aria-live': 'off', 'aria-label': t('zoom.level') }, '100%');
    const zoomBtn = (label: string, text: string, f: () => void): HTMLButtonElement => h('button', { type: 'button', title: label, 'aria-label': label, onclick: f }, text);
    this.helpBtn = h('button', { type: 'button', class: 'help-btn', title: `${t('help.button')} (?)`, 'aria-label': t('help.button'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: () => this.toggleHelp() }, '?');
    this.fsBtn = h('button', { type: 'button', class: 'fs-btn', onclick: () => this.toggleFullscreen() });
    const zoom = h('div', { class: 'zoom', role: 'toolbar', 'aria-label': t('zoom.bar'), part: 'zoom-bar' },
      zoomBtn(t('zoom.out'), '−', () => this.zoomBy(1 / 1.2)), this.zoomLabel, zoomBtn(t('zoom.in'), '+', () => this.zoomBy(1.2)),
      h('button', { type: 'button', title: `${t('zoom.fit')} (F)`, onclick: () => this.fit() }, t('zoom.fitShort')), this.helpBtn, this.fsBtn);
    this.live = h('div', { class: 'mmdx-sr', 'aria-live': 'polite' });
    this.area = h('div', { class: 'area' }, this.stage, this.banner, this.msg, this.vbarWrap, this.dbar, this.actionsBar);

    this.historyHead = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('diff.panel.history') });
    this.historyBody = h('div', { class: 'pane-body' });
    this.historyPanel = h('section', { class: 'lpanel history', part: 'panel history', 'aria-label': t('diff.panel.history') }, this.historyHead, this.historyBody);
    this.codeHead = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('diff.tool.code') });
    this.codeBodyEl = h('div', { class: 'pane-body' });
    this.codePanel = h('section', { class: 'lpanel code', part: 'panel', 'aria-label': t('diff.tool.code') }, this.codeHead, this.codeBodyEl);
    const split = h('div', { class: 'lp-split', role: 'separator', 'aria-orientation': 'horizontal', title: t('diff.panel.resize') });
    this.leftPane = h('div', { class: 'pane-side left left-stack' }, this.historyPanel, split, this.codePanel);
    this.wireSplit(split);
    this.rightBody = h('div', { class: 'pane-body', part: 'change-list' });
    this.rightPane = h('aside', { class: 'pane-side right', part: 'panel', 'aria-label': t('diff.panel.changes') },
      h('div', { class: 'tabs' }, h('b', { class: 'head-title', role: 'heading', 'aria-level': '2' }, t('diff.panel.changes')), h('span', { class: 'tabs-spacer' }),
        h('button', { type: 'button', class: 'collapse-btn', title: `${t('diff.panel.hide')} (L)`, 'aria-label': t('diff.panel.hide'), onclick: () => this.togglePanel('changes', false) }, '×')),
      this.rightBody);
    this.rootEl = h('div', { class: 'root', tabindex: '0', role: 'group' }, this.area, this.leftPane, this.rightPane, h('div', { class: 'bottom-bar' }, zoom), this.live);
    this.shadow.append(this.rootEl);
    this.pops = new PopoverManager(this.shadow);
    this.toaster = new Toaster(this.area);
    this.ink = new DiffInk(this.storage, () => this.renderTools(), reducedMotion);

    this.restoreWidths();
    for (const [pane, side] of [[this.leftPane, 'left'], [this.rightPane, 'right']] as const) {
      const [min, max] = PANE_LIMITS[side];
      this.cleanups.push(attachPaneResizer(pane, side, {
        root: this.rootEl, varName: side === 'left' ? '--left-w' : '--right-w', min,
        max: () => Math.min(max, (this.rootEl.getBoundingClientRect().width || 1e4) - 320),
        title: t('diff.panel.resize'),
        onCommit: () => this.saveWidths(),
      }));
    }
    this.registerShortcuts();
    this.rootEl.addEventListener('keydown', (ev) => {
      if (this.shortcuts.handle(ev, true)) return;
    }, { signal: this.ac.signal });
    this.host.addEventListener('fullscreenchange', () => {
      this.syncFullscreen();
      emit(this.host, 'mmdx-fullscreen', { active: document.fullscreenElement === this.host });
    }, { signal: this.ac.signal });
    this.cleanups.push(watchUiScheme(() => this.applyScheme(true)));
    this.cleanups.push(this.ctx.themes.onChange(() => this.scheduleRefresh()));
    this.applyScheme(false);
    this.applyPanels();
    this.renderTools();
    this.renderBar();
    this.syncFullscreen();
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
    if ('view' in patch && patch.view) this.setView(patch.view);
    if ('mode' in patch && patch.mode) this.setMode(patch.mode);
    if ('filters' in patch) this.applyFilterList(patch.filters);
    if ('dim' in patch && patch.dim !== undefined) this.dim = patch.dim;
    if ('panels' in patch) {
      this.applyPanelList(patch.panels);
      this.applyPanels();
    }
    if ('ui' in patch) this.applyScheme(false);
    if ('actions' in patch) this.renderActions();
    if ('wheel' in patch) for (const c of this.canvases) c.vp.setOptions({ wheel: this.o.wheel ?? 'always' });
    if (reload) {
      void this.load();
      return;
    }
    if (('base' in patch || 'head' in patch) && this.versions.length) {
      this.pickPair(patch.base ?? this.base, patch.head ?? this.head);
      return;
    }
    this.renderTools();
    this.renderBar();
    this.scheduleRefresh();
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
    this.pickPair(baseId, headId);
  }

  /** Shows one version as it is (History mode). */
  viewVersion(id: string): void {
    if (!this.versions.some((v) => v.id === id)) return;
    this.viewing = id;
    this.mode = 'history';
    this.historyOpen = true;
    this.applyPanels();
    emit(this.host, 'mmdx-version', { base: this.base, head: this.head, viewing: id });
    void this.refresh();
  }

  setView(view: DiffViewName): void {
    if (!DIFF_VIEWS.includes(view) || view === this.view) return;
    if (view === 'merged' && this.D && !this.D.merged) return;
    const prev = this.view;
    this.view = view;
    emit(this.host, 'mmdx-view', { view, mode: this.mode });
    this.renderBar();
    if (this.viewOnly() || !this.D) return;
    if (prev !== 'side' && view !== 'side' && this.morph) {
      this.morph.go(STATE_OF[view]);
      this.applySelection(false);
      this.updateLabel();
    } else this.buildStage(true);
  }

  /** Shown change kinds; a facet left out is ignored. */
  setFilters(filters: readonly DiffFilter[], dim?: boolean): void {
    this.applyFilterList(filters);
    if (dim !== undefined) this.dim = dim;
    this.filtersChanged();
  }

  get filters(): DiffFilter[] {
    return DIFF_FILTERS.filter((f) => (f === 'added' || f === 'removed' ? !this.hide[f] : !this.ignore[f]));
  }

  /** Selects a change by key (`kind:id`), or clears the selection. */
  select(key: string | null, focus = true): void {
    const D = this.D;
    const change = key && D ? D.changes.find((c) => changeKey(c) === key) ?? null : null;
    this.selected = change ? key : null;
    this.codeAll = false;
    // in place: re-rendering the list would drop the keyboard focus out of the component
    for (const b of this.rightBody.querySelectorAll('.change')) b.setAttribute('aria-selected', String(b.getAttribute('data-key') === this.selected));
    if (this.codeOpen) this.renderCode();
    this.applySelection(focus && !!change);
    if (change) {
      this.rightBody.querySelector(`[data-key="${cssEscape(this.selected!)}"]`)?.scrollIntoView?.({ block: 'nearest' });
      this.live.textContent = describeChange(this.i18n.t, change);
    }
    emit(this.host, 'mmdx-select', { key: this.selected, change });
  }

  next(): void {
    this.step(1);
  }

  prev(): void {
    this.step(-1);
  }

  fit(): void {
    for (const c of this.canvases) c.vp.fit();
  }

  zoomTo(k: number): void {
    this.canvases[0]?.vp.zoomTo(k);
  }

  /** The diff with the filters applied (null before the first comparison). */
  getDiff(): DiffResult | null {
    return this.D?.diff ?? null;
  }

  /** The two compared versions and the shown one. */
  get pair(): { base: string | null; head: string | null; viewing: string | null } {
    return { base: this.base, head: this.head, viewing: this.viewOnly() ? this.viewing : null };
  }

  /** Standalone SVG of a view (default: the current one). */
  toSvg(o: DiffExportOptions = {}): string {
    if (this.viewOnly() && this.plain) return standaloneSvg(this.plain);
    const D = this.D;
    if (!D) return '';
    const view = o.view ?? this.view;
    const label = (id: string | null, fallback: string): string => (id ? `${fallback} · ${id}` : fallback);
    const so: DiffSvgOptions = {
      view: view === 'merged' && !D.merged ? 'after' : view, dim: this.dim, highlights: o.highlights ?? true, legend: o.legend ?? true,
      scheme: o.scheme ?? (this.isDark() ? 'dark' : 'light'),
      titles: { before: label(this.base, this.i18n.t('diff.view.before')), after: label(this.head, this.i18n.t('diff.view.after')) },
    };
    return diffSvg(D, so);
  }

  async toPng(o: DiffExportOptions = {}): Promise<Blob> {
    const svg = this.toSvg(o);
    if (!svg) throw new Error('Nothing rendered');
    const m = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const { svgToPng } = await import('../dom/export.js');
    const bg = this.D?.after.result.page.background;
    const res = await svgToPng(svg, Number(m?.[1] ?? 800), Number(m?.[2] ?? 600), { scale: Math.min(4, Math.max(1, o.scale ?? 2)), fonts: getShared().fonts, ...(bg && bg !== 'transparent' ? { background: bg } : {}) });
    return res.blob;
  }

  /** Builds an export and offers it to the host (`mmdx-export`, cancelable), else downloads it. */
  async exportAs(kind: DiffExportKind, o: DiffExportOptions = {}): Promise<void> {
    const name = this.fileName(kind, o);
    let data: string | Blob;
    let type = 'text/plain';
    const D = this.D;
    switch (kind) {
      case 'svg':
        data = this.toSvg(o);
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
        const [a, b] = await Promise.all([this.sourceOf(this.base), this.sourceOf(this.head)]);
        data = unifiedDiff(a, b, { name: `${this.o.name ?? 'diagram'}.mmdx`, ...(o.filtered === false ? {} : { ignore: this.ignore }) });
        type = 'text/x-diff';
        break;
      }
      case 'json':
      case 'md': {
        if (!D) return;
        const info = (id: string | null): VersionInfo | undefined => (id ? this.versions.find((v) => v.id === id) : undefined);
        const before = info(this.base), after = info(this.head);
        data = diffReport(o.filtered === false ? D.raw : D.diff, { format: kind === 'md' ? 'markdown' : 'json', name: this.o.name ?? 'diagram', ...(before ? { before } : {}), ...(after ? { after } : {}) });
        type = kind === 'md' ? 'text/markdown' : 'application/json';
        break;
      }
      default:
        return;
    }
    if (!emit(this.host, 'mmdx-export', { kind, name, data }, true)) return;
    const { download } = await import('../dom/export.js');
    download(name, data, type);
  }

  get diagnostics(): readonly Diagnostic[] {
    const D = this.D;
    return D ? [...D.before.diagnostics, ...D.after.diagnostics] : this.plain?.diagnostics ?? [];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    this.unsubscribe?.();
    this.clearCanvases();
    this.ink.destroy();
    this.pops.close();
    this.toaster.destroy();
    for (const c of this.cleanups) c();
    this.rootEl.remove();
  }

  // ---- loading ----------------------------------------------------------------------------------------------------

  private async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.sources.clear();
    this.counts.clear();
    this.cache.clear();
    this.selected = null;
    this.D = null;
    this.plain = null;
    try {
      if (this.o.history) {
        this.hasHistory = true;
        this.adapter = Array.isArray(this.o.history) ? staticHistory(this.o.history as readonly StaticVersion[]) : (this.o.history as HistoryAdapter);
        this.msg.replaceChildren(h('div', null, this.i18n.t('diff.history.loading')));
        const page = await this.adapter.list();
        if (seq !== this.loadSeq || this.destroyed) return;
        this.versions = page.versions;
        this.nextPage = page.next;
        this.unsubscribe?.();
        this.unsubscribe = this.adapter.subscribe?.(() => void this.reloadHistory()) ?? null;
      } else {
        this.hasHistory = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
        const [before, after] = await Promise.all([this.fetchSide(this.o.beforeSource, this.o.before), this.fetchSide(this.o.afterSource, this.o.after)]);
        if (seq !== this.loadSeq || this.destroyed) return;
        if (before === null || after === null) {
          this.versions = [];
          this.msg.replaceChildren(h('div', null, this.i18n.t('diff.empty.nothing')));
          this.renderTools();
          return;
        }
        const t = this.i18n.t;
        const list: StaticVersion[] = [
          { id: contentId(`1\n${after}`), message: t('diff.view.after'), source: after },
          { id: contentId(`0\n${before}`), message: t('diff.view.before'), source: before },
        ];
        this.adapter = staticHistory(list);
        this.versions = list.map(({ source: _s, ...v }) => v);
        this.nextPage = undefined;
      }
    } catch (e) {
      if (seq !== this.loadSeq || this.destroyed) return;
      this.showLoadError(e);
      return;
    }
    const ids = this.versions.map((v) => v.id);
    const head = this.o.head && ids.includes(this.o.head) ? this.o.head : ids[0] ?? null;
    const hi = head ? ids.indexOf(head) : -1;
    const base = this.o.base && ids.includes(this.o.base) && this.o.base !== head ? this.o.base : ids[hi + 1] ?? null;
    this.head = head;
    this.base = base;
    this.viewing = head;
    this.applyPanels();
    this.renderTools();
    await this.refresh();
    this.queueCounts();
  }

  private async fetchSide(source: string | undefined, url: string | undefined): Promise<string | null> {
    if (source !== undefined) return source;
    if (!url) return null;
    const loader = this.o.loader ?? ((u: string) => fetch(u, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }));
    return loader(url);
  }

  private async reloadHistory(): Promise<void> {
    if (!this.adapter) return;
    const page = await this.adapter.list();
    if (this.destroyed) return;
    this.versions = page.versions;
    this.nextPage = page.next;
    this.renderLeft();
    this.queueCounts();
  }

  private async loadMore(): Promise<void> {
    if (!this.adapter || !this.nextPage) return;
    try {
      const page = await this.adapter.list(this.nextPage);
      if (this.destroyed) return;
      const known = new Set(this.versions.map((v) => v.id));
      this.versions = [...this.versions, ...page.versions.filter((v) => !known.has(v.id))];
      this.nextPage = page.next;
      this.renderHistory();
      this.queueCounts();
    } catch (e) {
      this.toaster.show(`${this.i18n.t('diff.history.failed')}: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  private sourceOf(id: string | null): Promise<string> {
    if (!id || !this.adapter) return Promise.resolve('');
    let p = this.sources.get(id);
    if (!p) {
      p = this.adapter.load(id);
      this.sources.set(id, p);
      p.catch(() => this.sources.delete(id));
    }
    return p;
  }

  /** Change counts of every version against the one before it, one at a time in idle time (§8.6). */
  private queueCounts(): void {
    if (!this.hasHistory) return;
    const seq = this.loadSeq;
    for (let i = 0; i < this.versions.length; i++) {
      const v = this.versions[i]!, older = this.versions[i + 1];
      if (this.counts.has(v.id)) continue;
      if (!older) {
        if (!this.nextPage) this.counts.set(v.id, null);
        continue;
      }
      this.countQueue = this.countQueue.then(() => idle()).then(async () => {
        if (seq !== this.loadSeq || this.destroyed || this.counts.has(v.id)) return;
        try {
          const [a, b] = await Promise.all([this.sourceOf(older.id), this.sourceOf(v.id)]);
          this.counts.set(v.id, diffDiagrams(a, b).counts);
        } catch {
          this.counts.set(v.id, { added: 0, removed: 0, changed: 0, content: 0, layout: 0, style: 0 });
        }
        if (this.historyOpen) this.renderHistory();
      });
    }
    if (this.historyOpen) this.renderHistory();
  }

  private showLoadError(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    const t = this.i18n.t;
    this.msg.replaceChildren(h('div', { class: 'error', role: 'alert' }, h('div', null, `${t('diff.history.failed')}: ${message}`),
      h('button', { type: 'button', onclick: () => void this.load() }, t('diff.history.retry'))));
    emit(this.host, 'mmdx-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message }] });
  }

  // ---- rendering --------------------------------------------------------------------------------------------------

  private refreshHandle = 0;

  private scheduleRefresh(): void {
    if (this.refreshHandle || this.destroyed) return;
    this.refreshHandle = setTimeout(() => {
      this.refreshHandle = 0;
      void this.refresh();
    }, 16) as unknown as number;
  }

  private refreshSeq = 0;

  private async refresh(): Promise<void> {
    if (this.destroyed || !this.adapter) return;
    const seq = ++this.refreshSeq;
    const t0 = now();
    try {
      // the built-in themes: a diagram may name one, and dark pages pick counterparts among them
      await ensureBuiltinThemes();
      if (this.viewOnly()) {
        const src = await this.sourceOf(this.viewing);
        if (seq !== this.refreshSeq || this.destroyed) return;
        const theme = this.themeFor(src);
        this.plain = renderSource(src, this.ctx, theme ? { theme } : {});
        this.msg.replaceChildren();
        this.banner.hidden = true;
        this.buildPlain();
      } else {
        if (!this.base || !this.head) {
          this.msg.replaceChildren(h('div', null, this.i18n.t('diff.empty.nothing')));
          this.clearCanvases();
          return;
        }
        const [a, b] = await Promise.all([this.sourceOf(this.base), this.sourceOf(this.head)]);
        if (seq !== this.refreshSeq || this.destroyed) return;
        const theme = this.themeFor(b);
        const key = `${this.base}|${this.head}|${theme ?? ''}|${this.filters.join(',')}`;
        let D = this.cache.get(key);
        if (!D) {
          D = renderDiff(a, b, this.ctx, { ...(theme ? { theme } : {}), ignore: this.ignore, hide: this.hide });
          this.cache.set(key, D);
        }
        // a new pair fits the view again; a filter change keeps the pan and zoom
        const pair = `${this.base}|${this.head}`;
        const pairChanged = this.lastPair !== pair || this.stageKind === 'plain';
        this.lastPair = pair;
        this.D = D;
        this.plain = null;
        this.msg.replaceChildren();
        if (this.selected && !D.changes.some((c) => changeKey(c) === this.selected)) this.selected = null;
        if (this.view === 'merged' && !D.merged) this.view = 'after';
        this.showBanner();
        this.buildStage(pairChanged);
        const unknown = [D.before, D.after].flatMap((r) => r.diagnostics).filter((d) => d.severity !== 'info' || d.code === 'theme.missing');
        if (unknown.length) emit(this.host, 'mmdx-error', { diagnostics: unknown });
        emit(this.host, 'mmdx-compare', { counts: D.diff.counts, typeChanged: D.raw.typeChanged, base: this.base, head: this.head });
      }
      this.renderBar();
      this.renderTools();
      this.renderChanges();
      this.renderLeft();
      this.updateLabel();
      const r = this.plain ?? this.D?.after;
      emit(this.host, 'mmdx-render', { bounds: this.D?.bounds ?? r?.result.bounds ?? { x: 0, y: 0, w: 0, h: 0 }, type: r?.model.type ?? null, durationMs: Math.round((now() - t0) * 10) / 10 });
    } catch (e) {
      if (seq !== this.refreshSeq || this.destroyed) return;
      this.showLoadError(e);
    }
  }

  private lastPair = '';

  private showBanner(): void {
    const D = this.D;
    const t = this.i18n.t;
    const unsupported = !!D && (D.before.model.type === null || D.after.model.type === null) && !D.raw.typeChanged;
    const text = !D ? '' : unsupported ? t('diff.banner.unsupported') : D.raw.typeChanged ? t('diff.banner.typeChanged') : '';
    this.banner.textContent = text;
    this.banner.hidden = !text;
    if (unsupported && !this.codeOpen && this.feature('code')) {
      this.codeOpen = true;
      this.applyPanels();
    }
  }

  private themeFor(src: string): string | undefined {
    const { doc } = splitSource(src);
    const own = typeof doc.meta.canvas.theme === 'string' ? doc.meta.canvas.theme : undefined;
    let id = this.o.theme ?? own;
    if (this.isDark() && this.o.themeDark) {
      const known = this.ctx.themes.has(id ?? HOUSE.light) ? this.ctx.themes.get(id ?? HOUSE.light) : null;
      if (!known || known.appearance !== 'dark') id = this.o.themeDark === 'auto' ? counterpartTheme(this.ctx.themes, id, 'dark') : this.o.themeDark;
    }
    if (id && !this.ctx.themes.has(id) && !BUILTIN_IDS.includes(id)) void this.fetchTheme(id);
    return id;
  }

  private async fetchTheme(id: string): Promise<void> {
    const src = this.o.themeSource ?? getShared().themeSource;
    if (!src || this.fetchedThemes.has(id)) return;
    this.fetchedThemes.add(id);
    try {
      const file = await src.get(id);
      if (this.destroyed) return;
      this.ctx.themes.register(file);
      if (file.extends && !this.ctx.themes.has(file.extends)) await this.fetchTheme(file.extends);
      this.cache.clear();
      this.scheduleRefresh();
    } catch {
      // a missing theme: baseline with an info diagnostic
    }
  }

  private isDark(): boolean {
    return resolveUiScheme(this.o.ui === 'auto' || !this.o.ui ? null : this.o.ui) === 'dark';
  }

  private applyScheme(rerender: boolean): void {
    this.host.setAttribute('data-ui', this.isDark() ? 'dark' : 'light');
    if (rerender && this.o.themeDark) {
      this.cache.clear();
      this.scheduleRefresh();
    }
  }

  /** True while the history panel shows one version as it is (no diff controls). */
  private viewOnly(): boolean {
    return this.hasHistory && this.historyOpen && this.feature('history') && this.mode === 'history';
  }

  // ---- canvases -----------------------------------------------------------------------------------------------------

  private clearCanvases(): void {
    this.morph?.dispose();
    this.morph = null;
    for (const c of this.canvases) {
      c.vp.destroy();
      c.detach();
    }
    this.canvases = [];
    this.stage.replaceChildren();
    this.stageKind = null;
  }

  private makeCanvas(pane: HTMLElement, side: Canvas['side']): Canvas {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const defs = document.createElementNS(NS, 'defs');
    const vpEl = document.createElementNS(NS, 'g');
    const content = document.createElementNS(NS, 'g');
    const inkLayer = document.createElementNS(NS, 'g');
    inkLayer.setAttribute('class', 'ink');
    vpEl.append(content, inkLayer);
    svg.append(defs, vpEl);
    pane.append(svg);
    const c = {} as Canvas;
    const vp = new Viewport(svg, {
      wheel: this.o.wheel ?? 'always',
      panOnDrag: this.tool === 'pan',
      maxK: 8,
      reducedMotion: reducedMotion(),
      insets: () => ({ left: 52, right: 8, top: this.stageKind === 'side' ? 34 : 8, bottom: 52 }),
      onChange: (v) => this.onView(c, v),
    });
    // a click selects (a drag pans); the canvas takes keyboard focus
    let down: { x: number; y: number } | null = null;
    svg.addEventListener('pointerdown', (ev) => {
      down = { x: ev.clientX, y: ev.clientY };
      this.rootEl.focus({ preventScroll: true });
    }, { signal: this.ac.signal });
    svg.addEventListener('click', (ev) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4 || this.tool === 'pen' || !this.feature('select')) return;
      this.clickSelect(ev.target as Element);
    }, { signal: this.ac.signal });
    svg.addEventListener('dblclick', () => this.fit(), { signal: this.ac.signal });
    const detachInk = this.ink.attach({ svg, layer: inkLayer, toDiagram: (x, y) => vp.toDiagram(x, y), scale: () => vp.state.k });
    Object.assign(c, { svg, defs, vpEl, content, inkLayer, vp, side, detach: detachInk });
    this.canvases.push(c);
    return c;
  }

  /** A pan or zoom: apply it, and mirror it to the linked canvas (side by side). */
  private onView(c: Canvas, v: ViewState): void {
    c.vpEl.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`);
    c.svg.style.setProperty('--dx-inv', String(1 / v.k));
    if (c === this.canvases[0]) this.zoomLabel.textContent = `${Math.round(v.k * 100)}%`;
    if (this.linking) return;
    this.linking = true;
    try {
      for (const o of this.canvases)
        if (o !== c) {
          o.vp.auto = c.vp.auto;
          o.vp.set({ ...v });
        }
    } finally {
      this.linking = false;
    }
  }

  private pane(cls: string, title?: string, sub?: string): HTMLElement {
    const p = h('div', { class: `pane ${cls}` });
    if (title) p.append(h('div', { class: 'pane-title' }, h('b', null, title), sub ? h('span', null, sub) : null));
    return p;
  }

  private versionText(id: string | null): string {
    const v = this.versions.find((x) => x.id === id);
    if (!v) return '';
    return [v.id, v.author, ago(v.date, this.i18n.locale)].filter(Boolean).join(' · ');
  }

  /** One state of the single canvas (before, merged or after) as detached layers. */
  private state(view: DiffView): MorphState {
    const D = this.D!;
    const r = renderedOf(D, view);
    const v: DiffView = view === 'merged' && !D.merged ? 'after' : view;
    const a = annotate({ view: v, result: r.result, before: D.before.result, changes: D.changes, measure: r.rctx.measure }, { dim: this.dim });
    const content = document.createElementNS(NS, 'g');
    const layer = (cls: string, nodes: Parameters<typeof patchChildren>[1]): SVGGElement => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', cls);
      patchChildren(g, nodes);
      return g;
    };
    content.append(layer('page-layer', pageScene(r.result, r.rctx)), layer('body-layer', a.body), layer('dx-runs', a.runs), layer('dx-layer', a.overlay));
    const defs = layer('defs', r.result.defs);
    return { defs: [...defs.children], content };
  }

  private paneBackground(r: Rendered): string {
    const bg = r.result.page.background;
    return bg && bg !== 'transparent' ? bg : '';
  }

  /**
   * Builds (or refreshes) the canvases for the current view. `refit`: a new pair or another layout of the stage, so
   * the view fits again; otherwise the pan and zoom stay.
   */
  private buildStage(refit: boolean): void {
    const D = this.D;
    if (!D) return;
    const kind = this.view === 'side' ? 'side' : 'single';
    const keep = !refit && this.stageKind === kind && this.canvases[0] ? { ...this.canvases[0].vp.state, auto: this.canvases[0].vp.auto } : null;
    const states = kind === 'single' ? (['before', 'merged', 'after'] as const).map((v) => this.state(v)) : null;
    if (kind === 'single' && this.stageKind === 'single' && this.morph && states) {
      this.morph.reset(states, STATE_OF[this.view as DiffView]);
    } else {
      this.clearCanvases();
      this.stageKind = kind;
      this.stage.className = `stage ${kind}`;
      if (kind === 'single') {
        const p = this.pane('single');
        p.style.background = this.paneBackground(D.after);
        this.stage.append(p);
        const c = this.makeCanvas(p, 'single');
        this.morph = new Morph(c.defs, c.content, states!, STATE_OF[this.view as DiffView], reducedMotion);
      } else {
        const t = this.i18n.t;
        for (const side of ['before', 'after'] as const) {
          const p = this.pane(side, t(`diff.view.${side}`), this.versionText(side === 'before' ? this.base : this.head));
          p.style.background = this.paneBackground(D[side]);
          this.stage.append(p);
          const c = this.makeCanvas(p, side);
          const st = this.state(side);
          c.defs.replaceChildren(...st.defs);
          c.content.replaceChildren(...st.content.childNodes);
        }
      }
    }
    for (const c of this.canvases) {
      if (keep && !keep.auto) {
        c.vp.auto = false;
        c.vp.set({ k: keep.k, tx: keep.tx, ty: keep.ty });
        c.vp.setBounds(D.bounds);
      } else c.vp.setBounds(D.bounds, { fit: true });
    }
    this.applySelection(false);
    this.updateLabel();
  }

  /** History mode: one version as it is, the standard viewer picture. */
  private buildPlain(): void {
    const r = this.plain;
    if (!r) return;
    this.clearCanvases();
    this.stageKind = 'plain';
    this.stage.className = 'stage single';
    const v = this.versions.find((x) => x.id === this.viewing);
    const p = this.pane('single', v?.id ?? '', [v?.message, v?.author, ago(v?.date, this.i18n.locale)].filter(Boolean).join(' · '));
    p.style.background = this.paneBackground(r);
    this.stage.append(p);
    const c = this.makeCanvas(p, 'single');
    patchChildren(c.defs, r.result.defs);
    const page = document.createElementNS(NS, 'g'), body = document.createElementNS(NS, 'g');
    patchChildren(page, pageScene(r.result, r.rctx));
    patchChildren(body, r.result.body);
    c.content.replaceChildren(page, body);
    c.vp.setBounds(r.result.bounds, { fit: true });
  }

  private clickSelect(target: Element): void {
    const D = this.D;
    if (!D || this.viewOnly()) return;
    let key = target.closest('[data-key]')?.getAttribute('data-key') ?? null;
    if (!key) {
      // an item drawn in this view: its change key is on `data-ck` (minus the part prefix of edge labels)
      const ck = target.closest('[data-ck]')?.getAttribute('data-ck') ?? null;
      key = ck ? ck.replace(/^label:/, '') : null;
    }
    this.select(key && D.changes.some((c) => changeKey(c) === key) ? key : null);
  }

  private applySelection(focus: boolean): void {
    for (const c of this.canvases)
      for (const e of c.content.querySelectorAll('[data-key]')) e.classList.toggle('dx-selected', e.getAttribute('data-key') === this.selected);
    if (focus) this.focusSelected();
  }

  /** Brings the selected change into view when it is not fully visible. */
  private focusSelected(): void {
    const D = this.D, c = this.canvases[0];
    const ch = D && this.selected ? D.changes.find((x) => changeKey(x) === this.selected) : null;
    if (!D || !c || !ch) return;
    const view: DiffView = this.view === 'side' ? (ch.status === 'removed' ? 'before' : 'after') : this.view;
    const r = renderedOf(D, view);
    const id = view === 'before' ? ch.beforeId ?? ch.id : view === 'after' ? ch.id : changeKey(ch).slice(ch.kind.length + 1);
    const s = shapeOf(r.result.geom, ch.kind, id) ?? (ch.status === 'removed' ? shapeOf(D.before.result.geom, ch.kind, ch.beforeId ?? ch.id) : null);
    if (!s) return;
    const box = focusRect(s);
    const { w, h: hh } = c.vp.size, v = c.vp.state;
    const x0 = box.x * v.k + v.tx, y0 = box.y * v.k + v.ty, x1 = x0 + box.w * v.k, y1 = y0 + box.h * v.k;
    if (x0 >= 56 && y0 >= 8 && x1 <= w - 8 && y1 <= hh - 56) return;
    const k = Math.max(Math.min(v.k, 1), Math.min(1, w / (box.w * 3), hh / (box.h * 3)));
    c.vp.auto = false;
    c.vp.set({ k, tx: w / 2 - (box.x + box.w / 2) * k, ty: hh / 2 - (box.y + box.h / 2) * k });
  }

  private step(d: 1 | -1): void {
    const list = this.D?.changes ?? [];
    if (!list.length || this.viewOnly()) return;
    const i = list.findIndex((x) => changeKey(x) === this.selected);
    const next = list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length]!;
    this.select(changeKey(next));
  }

  private zoomBy(f: number): void {
    const c = this.canvases[0];
    if (!c) return;
    const s = c.vp.size;
    c.vp.zoomAt(f, s.w / 2, s.h / 2);
  }

  private updateLabel(): void {
    const t = this.i18n.t;
    const D = this.D;
    const label = this.o.label ?? (this.viewOnly() ? t('diff.labelVersion', { id: this.viewing ?? '' }) : D ? t('diff.label', { added: D.diff.counts.added, removed: D.diff.counts.removed, changed: D.diff.counts.changed }) : t('diff.empty.nothing'));
    this.rootEl.setAttribute('aria-label', label);
    this.stage.setAttribute('role', 'img');
    this.stage.setAttribute('aria-label', label);
  }

  // ---- filters ------------------------------------------------------------------------------------------------------

  private applyFilterList(list: readonly DiffFilter[] | undefined): void {
    const on = new Set(list ?? DIFF_FILTERS);
    this.ignore = Object.fromEntries((['content', 'layout', 'style'] as const).filter((f) => !on.has(f)).map((f) => [f, true]));
    this.hide = Object.fromEntries((['added', 'removed'] as const).filter((f) => !on.has(f)).map((f) => [f, true]));
  }

  private toggleFilter(f: DiffFilter): void {
    if (f === 'added' || f === 'removed') this.hide = { ...this.hide, [f]: !this.hide[f] };
    else this.ignore = { ...this.ignore, [f]: !this.ignore[f] };
    this.filtersChanged();
  }

  private filtersChanged(): void {
    emit(this.host, 'mmdx-filters', { filters: this.filters, dim: this.dim });
    void this.refresh();
  }

  // ---- panels -------------------------------------------------------------------------------------------------------

  private applyPanelList(list: readonly DiffPanel[] | undefined): void {
    const l = list ?? ['changes'];
    this.changesOpen = l.includes('changes');
    this.historyOpen = l.includes('history');
    this.codeOpen = l.includes('code');
  }

  private feature(f: DiffFeature): boolean {
    return this.o.features?.[f] !== false;
  }

  private applyPanels(): void {
    const history = this.historyOpen && this.hasHistory && this.feature('history');
    const code = this.codeOpen && this.feature('code');
    const right = this.changesOpen && this.feature('changes') && !this.viewOnly();
    this.historyPanel.hidden = !history;
    this.codePanel.hidden = !code;
    this.leftPane.classList.toggle('open', history || code);
    this.leftPane.classList.toggle('both', history && code);
    this.rightPane.classList.toggle('open', right);
    this.rootEl.classList.toggle('left-open', history || code);
    this.rootEl.classList.toggle('right-open', right);
    this.dbar.hidden = this.viewOnly();
    this.renderLeft();
  }

  private togglePanel(name: DiffPanel, open?: boolean): void {
    const wasViewOnly = this.viewOnly();
    if (name === 'changes') this.changesOpen = open ?? !this.changesOpen;
    else if (name === 'code') this.codeOpen = open ?? !this.codeOpen;
    else {
      if (!this.hasHistory) return;
      this.historyOpen = open ?? !this.historyOpen;
    }
    this.applyPanels();
    this.renderTools();
    this.renderBar();
    this.renderChanges();
    if (wasViewOnly !== this.viewOnly()) {
      emit(this.host, 'mmdx-view', { view: this.view, mode: this.mode });
      void this.refresh();
    }
  }

  /** The splitter between History and Code: drag sets the Code height (remembered); double-click resets. */
  private wireSplit(split: HTMLElement): void {
    const col = (): HTMLElement => this.leftPane;
    const setH = (px: number | null): void => {
      if (px === null) col().style.removeProperty('--code-h');
      else col().style.setProperty('--code-h', `${Math.round(px)}px`);
      col().classList.toggle('sized', px !== null);
    };
    queueMicrotask(() => {
      const saved = this.storage.get<number>('diff.codeH');
      if (typeof saved === 'number' && saved > 0) setH(saved);
    });
    split.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      try {
        split.setPointerCapture(ev.pointerId);
      } catch {
        // best-effort
      }
      const y0 = ev.clientY, h0 = this.codePanel.getBoundingClientRect().height, colH = col().getBoundingClientRect().height;
      split.classList.add('dragging');
      this.rootEl.classList.add('resizing-rows');
      const move = (e: PointerEvent): void => setH(Math.max(120, Math.min(colH - 140, h0 - (e.clientY - y0))));
      const up = (): void => {
        split.classList.remove('dragging');
        this.rootEl.classList.remove('resizing-rows');
        split.removeEventListener('pointermove', move);
        split.removeEventListener('pointerup', up);
        split.removeEventListener('pointercancel', up);
        const v = parseInt(col().style.getPropertyValue('--code-h'), 10);
        if (v) this.storage.set('diff.codeH', v);
      };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', up);
      split.addEventListener('pointercancel', up);
    }, { signal: this.ac.signal });
    split.addEventListener('dblclick', () => {
      setH(null);
      this.storage.remove('diff.codeH');
    }, { signal: this.ac.signal });
  }

  private setMode(m: DiffMode): void {
    if (m === this.mode) return;
    const was = this.viewOnly();
    this.mode = m;
    if (m === 'history' && !this.viewing) this.viewing = this.head;
    emit(this.host, 'mmdx-view', { view: this.view, mode: m });
    this.applyPanels();
    this.renderTools();
    if (was !== this.viewOnly()) void this.refresh();
  }

  private renderChanges(): void {
    const D = this.D;
    if (!D || !this.rightPane.classList.contains('open')) {
      if (!D) this.rightBody.replaceChildren();
      return;
    }
    this.keepFocus(this.rightBody, () => this.rightBody.replaceChildren(...changeList(this.i18n.t, {
      diff: D.diff, changes: D.changes, selected: this.selected,
      colorBefore: (v) => D.before.rctx.color(v), colorAfter: (v) => D.after.rctx.color(v),
      onSelect: (key) => this.select(key),
    })));
  }

  private renderLeft(): void {
    this.renderHistory();
    this.renderCode();
  }

  private tab(id: string, label: string, on: boolean, f: () => void): HTMLElement {
    return h('button', { type: 'button', role: 'tab', 'aria-selected': String(on), 'data-tab': id, onclick: f }, label);
  }

  private closeBtn(name: 'history' | 'code', key: string): HTMLElement {
    const t = this.i18n.t;
    return h('button', { type: 'button', class: 'collapse-btn', title: `${t('diff.panel.hide')} (${key})`, 'aria-label': t('diff.panel.hide'), onclick: () => this.togglePanel(name, false) }, '×');
  }

  private renderHistory(): void {
    const t = this.i18n.t;
    if (!this.historyOpen || !this.hasHistory || this.historyPanel.hidden) {
      this.historyBody.replaceChildren();
      return;
    }
    this.historyHead.replaceChildren(
      this.tab('history', t('diff.panel.history'), this.mode === 'history', () => this.setMode('history')),
      this.tab('compare', t('diff.panel.compare'), this.mode === 'compare', () => this.setMode('compare')),
      h('span', { class: 'tabs-spacer' }), this.closeBtn('history', 'V'));
    this.historyBody.replaceChildren(historyRows(t, {
      versions: this.versions, counts: (id) => this.counts.get(id), mode: this.mode, base: this.base, head: this.head, viewing: this.viewing,
      locale: this.i18n.locale, hasMore: !!this.nextPage,
      onPick: (side, id) => this.pickPair(side === 'before' ? id : this.base, side === 'after' ? id : this.head),
      onRow: (id) => (this.mode === 'compare' ? this.compareWithPrevious(id) : this.viewVersion(id)),
      onMore: () => void this.loadMore(),
    }));
  }

  private renderCode(): void {
    const t = this.i18n.t;
    if (!this.codeOpen || this.codePanel.hidden) {
      this.codeBodyEl.replaceChildren();
      return;
    }
    this.codeHead.replaceChildren(
      this.tab('code', t('diff.panel.code'), this.codeTab === 'code', () => ((this.codeTab = 'code'), this.renderCode())),
      this.tab('meta', t('diff.panel.meta'), this.codeTab === 'meta', () => ((this.codeTab = 'meta'), this.renderCode())),
      h('span', { class: 'tabs-spacer' }), this.closeBtn('code', 'C'));
    this.codeBodyEl.replaceChildren(...this.codeBody());
  }

  private codeBody(): HTMLElement[] {
    const t = this.i18n.t;
    const lines = (src: string): string[] => sourcePart(src, this.codeTab).replace(/\n$/, '').split('\n');
    if (this.viewOnly()) {
      const shown = this.viewing ? this.sources.get(this.viewing) : undefined;
      const box = h('div', { class: 'code-scroll' });
      void shown?.then((s) => box.replaceWith(codeListing(lines(s))));
      return [box];
    }
    const D = this.D;
    if (!D) return [];
    const a = lines(D.sources.before), b = lines(D.sources.after);
    const ch = this.selected && !this.codeAll ? D.changes.find((x) => changeKey(x) === this.selected) : undefined;
    let sel: { a: Set<number>; b: Set<number>; label: string } | null = null;
    if (ch) {
      const beforeId = ch.status === 'added' ? null : ch.beforeId ?? ch.id;
      const afterId = ch.status === 'removed' ? null : ch.id;
      sel = this.codeTab === 'code'
        ? { a: beforeId === null ? new Set() : relatedLines(D.before.model, ch.kind, beforeId), b: afterId === null ? new Set() : relatedLines(D.after.model, ch.kind, afterId), label: ch.label }
        : { a: metaLines(a, ch.kind, beforeId), b: metaLines(b, ch.kind, afterId), label: ch.label };
    }
    const notes: string[] = [];
    if (this.ignore.style) notes.push(t('diff.panel.styleRemoved'));
    if (D.layoutAligned) notes.push(t('diff.panel.layoutReplaced'));
    return codeDiff(t, { a, b, tab: this.codeTab, sel, notes, onShowAll: () => ((this.codeAll = true), this.renderCode()) });
  }

  // ---- history ------------------------------------------------------------------------------------------------------

  private pickPair(base: string | null, head: string | null): void {
    if (!base || !head || base === head) return;
    if (base === this.base && head === this.head && !this.viewOnly()) return;
    this.base = base;
    this.head = head;
    this.selected = null;
    emit(this.host, 'mmdx-version', { base, head });
    void this.refresh();
  }

  /** Compare mode: a version against the one before it (the oldest one becomes Before instead). */
  private compareWithPrevious(id: string): void {
    const i = this.versions.findIndex((v) => v.id === id);
    const older = this.versions[i + 1];
    if (older) this.pickPair(older.id, id);
    else if (id !== this.head) this.pickPair(id, this.head);
  }

  // ---- bars ---------------------------------------------------------------------------------------------------------

  /** Re-renders a bar keeping the keyboard focus on the same control (`data-f`). */
  private keepFocus(box: HTMLElement, render: () => void): void {
    const active = this.shadow.activeElement;
    const id = active && box.contains(active) ? active.getAttribute('data-f') : null;
    render();
    if (!id) return;
    // the same control, else the component itself (never the page)
    const next = [...box.querySelectorAll<HTMLElement>('[data-f]')].find((e) => e.getAttribute('data-f') === id);
    (next ?? this.rootEl).focus({ preventScroll: true });
  }

  private renderTools(): void {
    this.keepFocus(this.vbarWrap, () => this.drawTools());
    this.renderActions();
  }

  private renderActions(): void {
    const list = this.o.actions ?? [];
    this.actionsBar.hidden = !list.length;
    this.keepFocus(this.actionsBar, () => this.actionsBar.replaceChildren(...list.map((a) => h('button', {
      type: 'button', class: a.primary ? 'primary' : '', title: a.title ?? a.label, 'data-f': `act-${a.id}`, 'data-action': a.id,
      disabled: a.enabled ? !a.enabled(this.pair) : false, onclick: () => a.run(),
    }, a.label))));
  }

  private drawTools(): void {
    const t = this.i18n.t;
    const btn = (tip: string, ic: string, on: boolean, f: () => void, extra: Record<string, unknown> = {}): HTMLElement =>
      h('button', { type: 'button', 'data-tip': tip, 'aria-label': tip, 'data-f': ic.slice(0, 12), class: on ? 'on' : '', 'aria-pressed': String(on), onclick: f, ...extra }, icon(ic));
    const sep = (): HTMLElement => h('span', { class: 'sep', role: 'separator' });
    const parts: (HTMLElement | null)[] = [
      btn(`${t('diff.tool.pan')} (H)`, I_hand, this.tool === 'pan', () => this.setTool('pan')),
      this.feature('pen') ? btn(`${t('diff.tool.pen')} (P)`, I_pen, this.tool === 'pen', () => this.setTool(this.tool === 'pen' ? 'pan' : 'pen')) : null,
    ];
    const panels: HTMLElement[] = [];
    if (this.hasHistory && this.feature('history')) panels.push(btn(`${t('diff.tool.history')} (V)`, I_history, this.historyOpen, () => this.togglePanel('history')));
    if (this.feature('code')) panels.push(btn(`${t('diff.tool.code')} (C)`, I_code, this.codeOpen, () => this.togglePanel('code')));
    if (panels.length) parts.push(sep(), ...panels);
    if (this.feature('export')) parts.push(sep(), btn(t('diff.tool.export'), I_download, false, () => this.openExport(), { 'aria-haspopup': 'menu', 'aria-pressed': undefined, class: 'export-btn' }));
    this.vbar.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
    this.vbarWrap.querySelector('.pen-opts')?.remove();
    if (this.tool === 'pen') {
      const pop = penOptions(this.ink, t);
      pop.classList.add('mmdx-float');
      this.vbarWrap.append(pop);
    }
  }

  private setTool(tool: 'pan' | 'pen'): void {
    if (tool === 'pen' && !this.feature('pen')) return;
    this.tool = tool;
    this.ink.setActive(tool === 'pen');
    this.rootEl.classList.toggle('tool-pen', tool === 'pen');
    for (const c of this.canvases) c.vp.setOptions({ panOnDrag: tool === 'pan' });
    this.renderTools();
  }

  private renderBar(): void {
    this.keepFocus(this.dbar, () => this.drawBar());
  }

  private drawBar(): void {
    const t = this.i18n.t;
    const D = this.D;
    const raw = D?.raw.counts;
    const parts: HTMLElement[] = [];
    if (this.feature('views')) {
      const noMerged = !!D && !D.merged;
      for (const v of DIFF_VIEWS) {
        const on = this.view === v;
        parts.push(h('button', {
          type: 'button', class: `view${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: v === 'merged' && noMerged, 'data-f': `view-${v}`,
          'data-tip': `${t(`diff.view.${v}Help`)} (${VIEW_KEYS[v]})`, onclick: () => this.setView(v),
        }, t(`diff.view.${v}`)));
      }
      const select = h('select', { class: 'views', 'aria-label': t('diff.views'), 'data-f': 'views', onchange: (ev: Event) => this.setView((ev.target as HTMLSelectElement).value as DiffViewName) },
        ...DIFF_VIEWS.map((v) => h('option', { value: v, selected: this.view === v, disabled: v === 'merged' && noMerged }, t(`diff.view.${v}`))));
      parts.push(select);
    }
    if (this.feature('filters')) {
      if (parts.length) parts.push(h('span', { class: 'sep', role: 'separator' }));
      for (const f of DIFF_FILTERS) {
        const on = f === 'added' || f === 'removed' ? !this.hide[f] : !this.ignore[f];
        const n = raw?.[f] ?? 0;
        const label = t(`diff.filter.${f}`);
        parts.push(h('button', {
          type: 'button', class: `flt flt-${f} ${on ? 'on' : 'off'}`, 'aria-pressed': String(on), 'aria-label': `${label} (${n})`, 'data-f': `flt-${f}`,
          'data-tip': t('diff.filter.tip', { label, n, action: on ? t('diff.filter.hide') : t('diff.filter.show') }), onclick: () => this.toggleFilter(f),
        }, icon(FILTER_ICONS[f]), n ? h('span', { class: 'cnt', 'aria-hidden': 'true' }, String(n)) : null));
      }
      parts.push(h('span', { class: 'sep', role: 'separator' }), h('button', {
        type: 'button', class: this.dim ? 'on' : '', 'aria-pressed': String(this.dim), 'aria-label': t('diff.filter.dim'), 'data-tip': t('diff.filter.dim'), 'data-f': 'dim',
        onclick: () => {
          this.dim = !this.dim;
          this.filtersChanged();
        },
      }, icon(FILTER_ICONS.dim)));
    }
    // the change list (right panel), at the right end of the bar
    if (this.feature('changes')) {
      if (parts.length) parts.push(h('span', { class: 'sep', role: 'separator' }));
      const on = this.changesOpen;
      const label = `${t('diff.tool.changes')} (L)`;
      parts.push(h('button', {
        type: 'button', class: `changes-btn${on ? ' on' : ''}`, 'aria-pressed': String(on), 'aria-label': label, 'data-tip': label, 'data-f': 'changes',
        onclick: () => this.togglePanel('changes'),
      }, icon(I_list), D ? h('span', { class: 'cnt', 'aria-hidden': 'true' }, String(D.changes.length)) : null));
    }
    this.dbar.replaceChildren(...parts);
    this.dbar.hidden = !parts.length || this.viewOnly();
  }

  // ---- export, help, full screen --------------------------------------------------------------------------------------

  private fileName(kind: DiffExportKind, o: DiffExportOptions): string {
    const stem = this.o.name ?? 'diagram';
    const safe = (s: string | null): string => (s ?? '').replace(/[^\w.-]+/g, '_');
    if (kind === 'mmdx' || kind === 'mmd') {
      const id = o.version === 'before' ? this.base : o.version === 'viewed' || this.viewOnly() ? this.viewing : this.head;
      return `${stem}-${safe(id)}.${kind}`;
    }
    if (this.viewOnly() && (kind === 'svg' || kind === 'png')) return `${stem}-${safe(this.viewing)}.${kind}`;
    const ext = kind === 'md' ? 'md' : kind;
    const view = kind === 'svg' || kind === 'png' ? `-${o.view ?? this.view}` : '';
    return `${stem}-${safe(this.base)}..${safe(this.head)}${view}.${ext}`;
  }

  private async versionSource(which: DiffExportOptions['version']): Promise<string> {
    const id = which === 'before' ? this.base : which === 'viewed' || (!which && this.viewOnly()) ? this.viewing : this.head;
    return this.sourceOf(id);
  }

  private async portable(src: string): Promise<string> {
    const { toPortableMermaid } = await import('../core/export/portable.js');
    const r = renderSource(src, this.ctx);
    return toPortableMermaid(r.doc.code, r.doc.meta, r.model, r.theme, r.rctx.color);
  }

  private openExport(): void {
    const t = this.i18n.t;
    const opener = this.vbar.querySelector<HTMLElement>('.export-btn');
    const run = (f: () => Promise<void>) => (): void => {
      this.pops.close();
      void f().catch((e: unknown) => this.toaster.show(e instanceof Error ? e.message : String(e), { error: true }));
    };
    const item = (label: string, f: () => Promise<void>): HTMLElement => h('button', { type: 'button', role: 'menuitem', onclick: run(f) }, label);
    const view = this.viewOnly();
    const pop = h('div', { class: 'mmdx-menu export-pop', role: 'menu', 'aria-label': t('diff.tool.export') },
      item(t('diff.export.image'), () => this.exportAs('png')),
      item(t('diff.export.svg'), () => this.exportAs('svg')),
      h('hr'),
      view ? item(t('diff.export.version'), () => this.exportAs('mmdx', { version: 'viewed' })) : item(t('diff.export.before'), () => this.exportAs('mmdx', { version: 'before' })),
      view ? null : item(t('diff.export.after'), () => this.exportAs('mmdx', { version: 'after' })),
      item(t('diff.export.portable'), () => this.exportAs('mmd')),
      view ? null : h('hr'),
      view ? null : item(t('diff.export.patch'), () => this.exportAs('diff')),
      view ? null : item(t('diff.export.markdown'), () => this.exportAs('md')),
      view ? null : item(t('diff.export.json'), () => this.exportAs('json')));
    this.vbarWrap.append(pop);
    this.pops.open(pop, opener);
  }

  private registerShortcuts(): void {
    const t = this.i18n.t;
    const views = t('diff.help.views'), panels = t('diff.help.panels'), canvas = t('diff.help.canvas');
    const list: Shortcut[] = [
      ...DIFF_VIEWS.map((v): Shortcut => ({ id: `view-${v}`, keys: [VIEW_KEYS[v]], label: `${t(`diff.view.${v}`)}: ${t(`diff.view.${v}Help`)}`, group: views, run: () => (this.feature('views') ? this.setView(v) : false) })),
      { id: 'step-prev', keys: ['arrowleft'], label: t('diff.view.step'), group: views, run: () => this.stepView(-1) },
      { id: 'step-next', keys: ['arrowright'], label: t('diff.view.step'), group: views, hintOnly: false, run: () => this.stepView(1) },
      { id: 'filters', keys: ['Added · Removed · Content · Layout · Style'], label: `${t('diff.filter.addedHelp')}; ${t('diff.filter.removedHelp')}; ${t('diff.filter.contentHelp')}; ${t('diff.filter.layoutHelp')}; ${t('diff.filter.styleHelp')}`, group: t('diff.help.filters'), hintOnly: true },
      { id: 'history', keys: ['v'], label: t('diff.help.history'), group: panels, run: () => (this.hasHistory ? this.togglePanel('history') : false) },
      { id: 'code', keys: ['c'], label: t('diff.help.code'), group: panels, run: () => (this.feature('code') ? this.togglePanel('code') : false) },
      { id: 'changes', keys: ['l'], label: t('diff.help.changes'), group: panels, run: () => (this.feature('changes') ? this.togglePanel('changes') : false) },
      { id: 'next', keys: ['j', 'k'], label: t('diff.help.step'), group: panels, hintOnly: true },
      { id: 'next-run', keys: ['j'], label: '', group: '', run: () => this.next() },
      { id: 'prev-run', keys: ['k'], label: '', group: '', run: () => this.prev() },
      { id: 'pan', keys: ['h'], label: t('diff.help.pan'), group: canvas, run: () => this.setTool('pan') },
      { id: 'pen', keys: ['p'], label: t('diff.help.pen'), group: canvas, run: () => (this.feature('pen') ? this.setTool(this.tool === 'pen' ? 'pan' : 'pen') : false) },
      { id: 'undo', keys: ['mod+z'], label: t('diff.help.undo'), group: canvas, run: () => this.ink.undo() },
      { id: 'fit', keys: ['f'], label: t('diff.help.fit'), group: canvas, run: () => this.fit() },
      { id: 'zoom', keys: ['+', '-'], label: t('diff.help.zoom'), group: canvas, hintOnly: true },
      { id: 'zoom-in', keys: ['+', '='], label: '', group: '', run: () => this.zoomBy(1.2) },
      { id: 'zoom-out', keys: ['-'], label: '', group: '', run: () => this.zoomBy(1 / 1.2) },
      { id: 'help', keys: ['?'], label: t('diff.help.help'), group: canvas, run: () => (this.feature('help') ? this.toggleHelp() : false) },
      {
        id: 'escape', keys: ['escape'], label: t('diff.help.esc'), group: canvas,
        run: () => {
          if (this.helpOpen) this.toggleHelp(false);
          else if (this.tool === 'pen') this.setTool('pan');
          else if (this.selected) this.select(null, false);
          else return false;
          return true;
        },
      },
    ];
    this.shortcuts.add(...list);
  }

  private stepView(d: 1 | -1): boolean | void {
    if (this.view === 'side' || this.viewOnly()) return false;
    const order: DiffView[] = ['before', 'merged', 'after'];
    let i = order.indexOf(this.view) + d;
    if (order[i] === 'merged' && this.D && !this.D.merged) i += d;
    const next = order[i];
    if (next) this.setView(next);
  }

  private toggleHelp(force?: boolean): void {
    const open = force ?? !this.helpOpen;
    if (!open) {
      if (this.helpOpen) this.pops.close(true);
      return;
    }
    if (this.helpOpen) return;
    const t = this.i18n.t;
    const groups = new Map<string, Shortcut[]>();
    for (const s of this.shortcuts.list(true)) if (s.group && s.label) (groups.get(s.group) ?? groups.set(s.group, []).get(s.group)!).push(s);
    const close = h('button', { type: 'button', title: t('help.close'), 'aria-label': t('help.close'), onclick: () => this.pops.close(true) }, '×');
    const body = h('div', { class: 'help-body' });
    const seen = new Set<string>();
    for (const [title, rows] of groups) {
      body.append(h('div', { class: 'help-title', role: 'heading', 'aria-level': '3' }, title));
      for (const s of rows) {
        if (seen.has(s.label + s.keys.join())) continue;
        seen.add(s.label + s.keys.join());
        // ← and → share one row
        if (s.id === 'step-prev') continue;
        const keys = s.id === 'step-next' ? { ...s, keys: ['arrowleft', 'arrowright'] } : s;
        body.append(h('div', { class: 'help-row' }, helpKeys(keys), h('span', null, s.label)));
      }
    }
    const titleId = `diff-help-${Math.random().toString(36).slice(2, 8)}`;
    const pop = h('div', { class: 'help-pop', role: 'dialog', 'aria-labelledby': titleId }, h('div', { class: 'help-head' }, h('b', { id: titleId }, t('diff.help.title')), close), body);
    this.rootEl.append(pop);
    this.helpOpen = true;
    this.pops.open(pop, this.helpBtn, { onClose: () => { this.helpOpen = false; } });
  }

  private syncFullscreen(): void {
    const t = this.i18n.t;
    const can = this.feature('fullscreen') && typeof document !== 'undefined' && !!document.fullscreenEnabled && typeof this.host.requestFullscreen === 'function';
    this.fsBtn.hidden = !can;
    const on = typeof document !== 'undefined' && document.fullscreenElement === this.host;
    this.fsBtn.replaceChildren(icon(on ? I_shrink : I_expand, 16));
    const label = on ? t('fullscreen.exit') : t('fullscreen.enter');
    this.fsBtn.title = label;
    this.fsBtn.setAttribute('aria-label', label);
    this.fsBtn.classList.toggle('on', on);
    this.helpBtn.hidden = !this.feature('help');
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement === this.host) void document.exitFullscreen?.();
    else this.host.requestFullscreen?.().catch(() => this.toaster.show(this.i18n.t('fullscreen.failed'), { error: true }));
  }

  // ---- panel widths -------------------------------------------------------------------------------------------------

  private restoreWidths(): void {
    const saved = this.storage.get<Record<string, number>>('diff.panes') ?? {};
    for (const [v, [lo, hi]] of [['--left-w', PANE_LIMITS.left], ['--right-w', PANE_LIMITS.right]] as const) {
      const px = saved[v];
      if (typeof px === 'number' && Number.isFinite(px)) this.rootEl.style.setProperty(v, `${Math.round(Math.max(lo, Math.min(hi, px)))}px`);
    }
  }

  private saveWidths(): void {
    const out: Record<string, number> = {};
    for (const v of ['--left-w', '--right-w']) {
      const val = parseInt(this.rootEl.style.getPropertyValue(v), 10);
      if (Number.isFinite(val)) out[v] = val;
    }
    this.storage.set('diff.panes', out);
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

export class MmdxDiffElement extends ElementBase {
  static observedAttributes = ['before', 'after', 'base', 'head', 'mode', 'view', 'filters', 'dim', 'panels', 'theme', 'theme-dark', 'ui', 'wheel', 'name', 'label'];
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

// ---- helpers -------------------------------------------------------------------------------------------------------

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function idle(): Promise<void> {
  const w = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  return new Promise((r) => (w.requestIdleCallback ? w.requestIdleCallback(() => r(), { timeout: 500 }) : setTimeout(r, 16)));
}

const cssEscape = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));


export function defineDiff(name = 'mmdx-diff'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxDiffElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-diff': MmdxDiffElement;
  }
}
