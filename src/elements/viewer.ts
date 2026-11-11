// <mmdx-viewer> (§8.1, UC1): read-only interactive diagram for documentation pages. Behind the element is the
// DiagramViewer class, which can also be mounted into any element without custom elements.
//
// Component architecture §4: the viewer is the view kernel (ViewCore) with a TextScene (source text → async render)
// and the viewer's modules — the editor's chrome (tool dock, zoom bar with help, view params), every piece behind a
// control of the `controls` attribute.
import { MmdxElement, readInlineSource, warnOnce, words, type AttrSpec, type Patch } from './base.js';
import { fetchText } from '../adapters/fetch-text.js';
import type { ThemeSource } from '../adapters/themes.js';
import type { HistoryAdapter, StaticVersion } from '../adapters/history.js';
import type { StorageAdapter } from '../adapters/storage.js';
import { getShared } from '../config.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import { splitSource } from '../core/meta/index.js';
import { standaloneSvg } from '../core/pipeline-core.js';
import { summarize } from '../core/summary.js';
import { effect } from '../reactive/signal.js';
import type { Diagnostic, Rect } from '../core/types.js';
import type { WheelMode } from '../dom/viewport.js';
import { h } from '../ui/h.js';
import { VIEWER_CSS } from '../ui/styles/viewer.js';
import { ViewCore } from '../view/core.js';
import type { HistorySession } from '../view/history.js';
import type { HostFullscreen } from '../view/types.js';
import { lazyModule, type ViewModule } from '../view/module.js';
import { VIEWER_MODULES } from '../view/modules/viewer.js';
import { TextScene, type FallbackMode, type FitMode } from '../view/scenes/text.js';

export type { FallbackMode, FitMode, HostFullscreen };
export type ViewerControl = 'zoom' | 'layers' | 'pen' | 'fullscreen' | 'export' | 'code' | 'history' | 'theme';

export interface ViewerOptions {
  source?: string;
  src?: string;
  loader?: (url: string) => Promise<string>;
  theme?: string;
  themeDark?: string;
  fit?: FitMode;
  controls?: readonly ViewerControl[];
  interactive?: boolean;
  lazy?: boolean;
  layers?: readonly string[];
  wheel?: WheelMode;
  fallback?: FallbackMode;
  label?: string;
  labels?: boolean;
  hoverHighlight?: boolean;
  /** `light` | `dark` | `auto` chrome scheme. */
  ui?: 'light' | 'dark' | 'auto';
  /** With the `theme` control: the light / dark toggle next to the theme menu (default on). Off when the host sets `ui`. */
  schemeToggle?: boolean;
  /** The `compact` preset (§7.6): smaller, icon-only chrome; automatic below a host size by default. */
  compact?: boolean | 'auto';
  themeSource?: ThemeSource;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  /** The component's own icon packs, over the shared ones of `configure({ iconPacks })`; read when it is created. */
  iconPacks?: readonly IconPack[];
  /** The diagram's versions: with `controls` including `history`, a History button shows how it changed. */
  history?: HistoryAdapter | readonly StaticVersion[];
  /** The host page's full screen, used by the `fullscreen` control when the browser's is unavailable (sandboxed iframes). */
  fullscreen?: HostFullscreen;
}

export interface ViewerEventMap {
  'mmdx-render': CustomEvent<{ bounds: Rect; type: string | null; durationMs: number }>;
  'mmdx-error': CustomEvent<{ diagnostics: Diagnostic[] }>;
  'mmdx-link': CustomEvent<{ href: string; id: string | null }>;
  'mmdx-fullscreen': CustomEvent<{ active: boolean }>;
  /** Before the full-screen button enters or leaves full screen; cancelable (the host handles it, nothing changes). */
  'mmdx-fullscreen-request': CustomEvent<{ enter: boolean }>;
  'mmdx-ui': CustomEvent<{ ui: 'light' | 'dark' }>;
  'mmdx-history-open': CustomEvent<Record<string, never>>;
  'mmdx-history-close': CustomEvent<Record<string, never>>;
}

const DEFAULT_CONTROLS: readonly ViewerControl[] = ['zoom', 'fullscreen'];

export class DiagramViewer {
  readonly core: ViewCore;
  readonly ctx: CoreContext;
  private readonly o: ViewerOptions;
  private readonly scene: TextScene;
  private readonly msg: HTMLElement;
  private visible = false;
  private io: IntersectionObserver | null = null;
  private fetchSeq = 0;
  private readonly ac = new AbortController();
  private destroyed = false;

  constructor(private readonly host: HTMLElement, options: ViewerOptions = {}) {
    this.o = { ...options };
    const o = this.o;
    this.core = new ViewCore(host, {
      product: 'viewer',
      css: [VIEWER_CSS],
      root: { class: 'root', role: 'img' },
      areaClass: 'stage',
      canvas: { interaction: o.interactive === false ? 'static' : 'pan-zoom', wheel: o.wheel ?? 'ctrl', panOnDrag: true, svgClass: 'scene', part: 'canvas' },
      feature: (name) => this.feature(name),
      loadHistory: () => import('../diff/history.js'),
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
    core.display.set({ ...core.display.peek(), labels: o.labels !== false, hoverHighlight: o.hoverHighlight !== false });
    if (o.layers) core.visibleLayers.set(o.layers);
    this.msg = h('div', { class: 'msg' });
    core.area.after(this.msg);
    this.scene = new TextScene(core, {
      fit: () => this.o.fit ?? 'contain',
      fallback: () => this.o.fallback ?? 'mermaid',
      msg: this.msg,
      stage: core.area,
      onRendered: (r, durationMs) => {
        const a11y = r.result.a11y;
        this.syncLabel();
        if (a11y?.desc) core.root.setAttribute('aria-description', a11y.desc);
        else core.root.removeAttribute('aria-description');
        core.root.classList.toggle('can-pan', core.canvas.interaction === 'pan-zoom');
        const warn = r.diagnostics.filter((d) => d.severity !== 'info' || d.code === 'theme.missing');
        if (warn.length) core.emit('mmdx-error', { diagnostics: warn });
        core.emit('mmdx-render', { bounds: r.result.bounds, type: r.model.type, durationMs });
      },
      onError: (diagnostics) => core.emit('mmdx-error', { diagnostics }),
    });
    core.provide('documentModel', () => this.scene.rendered?.model ?? null);
    core.provide('documentMeta', () => this.scene.rendered?.doc.meta ?? null);
    core.provide('documentCode', () => this.scene.rendered?.doc.code ?? (this.scene.text !== null ? splitSource(this.scene.text).doc.code : null));
    core.provide('documentSource', () => this.scene.text);
    core.provide('documentName', () => this.fileName);
    if (o.history) core.history.set(o.history);
    if (o.fullscreen) core.hostFullscreen.set(o.fullscreen);

    core.pushScene(this.scene);
    this.installModules();
    // a picture while the diagram shows; the code panel must stay readable for screen readers
    // however the panels change (a toggle, a set restored from storage: no `panels` event, B19)
    const offRole = effect(() => this.syncRole(core.panels()));
    this.ac.signal.addEventListener('abort', offRole);

    const ssr = host.querySelector(':scope > svg[data-mmdx-ssr]');
    if (ssr instanceof SVGSVGElement) this.scene.adoptSsr(ssr, host, this.ac.signal);
    if (o.lazy !== false && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.visible = true;
          this.io?.disconnect();
          this.io = null;
          void this.load();
        }
      }, { rootMargin: '300px' });
      this.io.observe(host);
    } else {
      this.visible = true;
      void this.load();
    }
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  /**
   * Updates options; only what changed is applied (an option set to `undefined` goes back to its default). Re-renders,
   * re-fetches or re-evaluates the controls as needed — a change elsewhere keeps History open, the pen's strokes and
   * the user's light / dark choice.
   */
  set(patch: Patch<ViewerOptions>): void {
    const prev = { ...this.o };
    const changed = (k: keyof ViewerOptions): boolean => k in patch && !sameOption(prev[k], patch[k]);
    Object.assign(this.o, patch);
    for (const k of Object.keys(patch) as (keyof ViewerOptions)[]) if (patch[k] === undefined) delete this.o[k];
    const core = this.core;
    if (changed('storage')) core.setStorage(this.o.storage);
    if (changed('themeSource')) core.setThemeSource(this.o.themeSource);
    if (changed('ctx')) warnOnce('viewer: `ctx` is read when the viewer is created');
    if (changed('ui')) core.setUi(this.o.ui);
    if (changed('theme')) core.themes.attr.set(this.o.theme ?? null);
    if (changed('themeDark')) core.themes.attrDark.set(this.o.themeDark ?? null);
    if (changed('compact')) core.setCompact(this.o.compact ?? 'auto');
    if (changed('interactive')) {
      core.canvas.setInteraction(this.o.interactive === false ? 'static' : 'pan-zoom');
      core.root.classList.toggle('can-pan', core.canvas.interaction === 'pan-zoom');
    }
    if (changed('wheel')) core.canvas.setOptions({ wheel: this.o.wheel ?? 'ctrl' });
    if (changed('labels') || changed('hoverHighlight')) core.display.set({ ...core.display.peek(), labels: this.o.labels !== false, hoverHighlight: this.o.hoverHighlight !== false });
    if (changed('layers')) core.visibleLayers.set(this.o.layers);
    if (changed('history')) core.history.set(this.o.history ?? null);
    if (changed('fullscreen')) core.hostFullscreen.set(this.o.fullscreen ?? null);
    if (changed('label')) this.syncLabel();
    // the modules follow the controls (each one re-evaluates what it shows)
    if (changed('controls') || changed('interactive')) core.refreshModules();
    if (changed('src') || changed('source') || changed('loader')) void this.load();
    else if (changed('fit') || changed('fallback')) core.invalidate();
  }

  get options(): Readonly<ViewerOptions> {
    return this.o;
  }

  fit(): void {
    this.core.canvas.fit();
  }

  zoomTo(k: number): void {
    this.core.canvas.zoomTo(k);
  }

  /** Re-fetches `src` (after an edit, §11.5). */
  reload(): Promise<void> {
    return this.load();
  }

  /** Changes the controls (like the `controls` attribute); undefined: the default (`zoom fullscreen`). */
  setControls(controls: readonly ViewerControl[] | undefined): void {
    this.set({ controls });
  }

  setLayers(ids: readonly string[] | undefined): void {
    if (ids) this.o.layers = ids;
    else delete this.o.layers;
    this.core.visibleLayers.set(ids);
  }

  /** Standalone SVG document of what is shown (visible layers, label setting). */
  toSvg(): string {
    const r = this.scene.rendered;
    return r ? standaloneSvg(r, this.ctx) : '';
  }

  async toPng(opts: { scale?: number } = {}): Promise<Blob> {
    const r = this.scene.rendered;
    if (!r) throw new Error('Nothing rendered');
    const b = r.result.bounds;
    const { svgToPng, reportMissingImages } = await import('../dom/export.js');
    const res = await svgToPng(this.toSvg(), b.w, b.h, { scale: opts.scale ?? 2, fonts: getShared().fonts });
    if (res.missingFonts.length) this.core.emit('mmdx-error', { diagnostics: [{ severity: 'info', code: 'export.font-missing', message: `Fonts not embedded (no font source): ${res.missingFonts.join(', ')}` }] });
    if (res.missingImages) reportMissingImages(this.core, res.missingImages);
    return res.blob;
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.scene.rendered?.diagnostics ?? [];
  }

  /** The source text currently shown. */
  get sourceText(): string | null {
    return this.scene.text;
  }

  /** The file name stem of exports. */
  get fileName(): string {
    return (this.o.src?.split('/').pop() ?? 'diagram').replace(/\.(mmdx?|md|txt)$/i, '') || 'diagram';
  }

  /** Opens or closes the History of the diagram; `compare` opens on the newest change compared. */
  toggleHistory(on?: boolean, opts?: { compare?: boolean }): void {
    this.core.run('toggleHistory', on, opts);
  }

  /** The open History's session (the `<mmdx-diff>` methods), null while History is closed. */
  get historySession(): HistorySession | null {
    return this.core.historySession.peek();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    this.io?.disconnect();
    this.core.destroy();
  }

  // ---- internals --------------------------------------------------------------------------------------------------

  private controls(): readonly ViewerControl[] {
    return this.o.controls ?? DEFAULT_CONTROLS;
  }

  /** Features of the kernel's modules, from the `controls`. */
  private feature(name: string): boolean {
    const c = this.controls();
    const interactive = this.o.interactive !== false;
    switch (name) {
      case 'zoom':
        return interactive && (c.includes('zoom') || c.includes('fullscreen'));
      case 'help':
        return interactive && c.includes('zoom');
      case 'fullscreen':
        return c.includes('fullscreen');
      case 'pen':
        return interactive && c.includes('pen');
      case 'theme':
        return c.includes('theme');
      case 'scheme':
        return c.includes('theme') && this.o.schemeToggle !== false;
      case 'history':
        return c.includes('history');
      // History's own parts (the diff bar, the panels, selecting changes) are on while History is open
      case 'views':
      case 'filters':
      case 'changes':
      case 'select':
        return true;
      default:
        if (name === 'code' && this.core?.historyOpen.peek()) return true;
        return c.includes(name as ViewerControl);
    }
  }

  private installModules(): void {
    const list: ViewModule<ViewCore>[] = [
      ...VIEWER_MODULES,
      lazyModule({ id: 'viewer-export', enabled: (c) => c.feature('export') }, () => import('./viewer-modules.js').then((m) => m.viewerExportModule(this))),
    ];
    this.core.useModules(list);
  }

  private syncRole(panels: Readonly<Record<string, boolean>>): void {
    this.core.root.setAttribute('role', panels['code-view'] ? 'group' : 'img');
    this.core.root.classList.toggle('pinned', Object.values(panels).some(Boolean));
  }

  /** The accessible name: the host's `label`, else the diagram's `accTitle`, else the generated summary (B20). */
  private syncLabel(): void {
    const r = this.scene.rendered;
    if (!r) return;
    const s = summarize(r.model);
    this.core.root.setAttribute('aria-label', this.o.label ?? r.result.a11y?.title ?? this.core.i18n.t(s.key, s.params));
  }

  private async load(): Promise<void> {
    if (!this.visible) return;
    const seq = ++this.fetchSeq;
    const t = this.core.i18n.t;
    let text: string;
    if (this.o.source !== undefined) text = this.o.source;
    else if (this.o.src) {
      if (!this.scene.rendered) this.msg.replaceChildren(h('div', { class: 'loading' }, t('loading')));
      try {
        text = await (this.o.loader ?? fetchText)(this.o.src);
        if (seq !== this.fetchSeq || this.destroyed) return;
      } catch (e) {
        if (seq !== this.fetchSeq || this.destroyed) return;
        this.scene.showError([{ severity: 'error', code: 'load.failed', message: `Could not load ${this.o.src}: ${e instanceof Error ? e.message : String(e)}` }], '');
        return;
      }
    } else {
      text = readInlineSource(this.host) ?? '';
    }
    this.scene.setText(text);
    this.core.fire('document');
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

const bool = (v: string | null): boolean | undefined => (v === null ? undefined : v !== 'false');
const text = (v: string | null): string | undefined => v ?? undefined;

/** Attributes and the option each one sets (absent: the option's default; the element's default fit is `width`). */
const ATTRS: Readonly<Record<string, AttrSpec<ViewerOptions>>> = {
  src: ['src', text], theme: ['theme', text], 'theme-dark': ['themeDark', text], fit: ['fit', (v) => v ?? 'width'], wheel: ['wheel', text],
  fallback: ['fallback', text], label: ['label', text], ui: ['ui', text], interactive: ['interactive', bool], lazy: ['lazy', bool], labels: ['labels', bool],
  'hover-highlight': ['hoverHighlight', bool], 'scheme-toggle': ['schemeToggle', bool], compact: ['compact', (v) => (v === null ? undefined : v === 'auto' ? 'auto' : v !== 'false')],
  // `list` (the former text outline) now opens the code view
  controls: ['controls', (v) => (v === null ? undefined : words(v).map((c) => (c === 'list' ? 'code' : c)))],
};

export class MmdxViewerElement extends MmdxElement<ViewerOptions, DiagramViewer> {
  static observedAttributes = Object.keys(ATTRS);

  protected attrs(): typeof ATTRS {
    return ATTRS;
  }

  protected create(o: ViewerOptions): DiagramViewer {
    return new DiagramViewer(this, o);
  }

  protected apply(v: DiagramViewer, patch: Patch<ViewerOptions>): void {
    v.set(patch);
  }

  get source(): string | undefined {
    return this.live?.options.source ?? this.props.source;
  }
  set source(v: string | undefined) {
    this.setOpt({ source: v });
  }
  get loader(): ViewerOptions['loader'] {
    return this.props.loader;
  }
  set loader(v: ViewerOptions['loader']) {
    this.setOpt({ loader: v });
  }
  get layers(): readonly string[] | undefined {
    return this.live?.options.layers ?? this.props.layers;
  }
  set layers(v: readonly string[] | undefined) {
    this.setOpt({ layers: v });
  }
  get themeSource(): ThemeSource | undefined {
    return this.props.themeSource;
  }
  set themeSource(v: ThemeSource | undefined) {
    this.setOpt({ themeSource: v });
  }
  get storage(): StorageAdapter | undefined {
    return this.props.storage;
  }
  set storage(v: StorageAdapter | undefined) {
    this.setOpt({ storage: v });
  }
  get history(): ViewerOptions['history'] {
    return this.props.history;
  }
  set history(v: ViewerOptions['history']) {
    this.setOpt({ history: v });
  }
  toggleHistory(on?: boolean, opts?: { compare?: boolean }): void {
    this.live?.toggleHistory(on, opts);
  }
  /** The open History's session, null while History is closed. */
  get historySession(): HistorySession | null {
    return this.live?.historySession ?? null;
  }
  /** The host page's full screen, used when the browser's is unavailable (sandboxed iframes). */
  get fullscreen(): HostFullscreen | undefined {
    return this.props.fullscreen;
  }
  set fullscreen(v: HostFullscreen | undefined) {
    this.setOpt({ fullscreen: v });
  }
  /** Changes the controls at run time, like the `controls` attribute (undefined: the default). */
  setControls(controls: readonly ViewerControl[] | undefined): void {
    this.setOpt({ controls });
  }

  fit(): void {
    this.live?.fit();
  }
  zoomTo(k: number): void {
    this.live?.zoomTo(k);
  }
  reload(): Promise<void> {
    return this.live?.reload() ?? Promise.resolve();
  }
  toSvg(): string {
    return this.live?.toSvg() ?? '';
  }
  toPng(opts?: { scale?: number }): Promise<Blob> {
    return this.live ? this.live.toPng(opts) : Promise.reject(new Error('Not connected'));
  }
  setLayers(ids: readonly string[] | undefined): void {
    this.layers = ids;
  }
  get diagnostics(): readonly Diagnostic[] {
    return this.live?.diagnostics ?? [];
  }
}

// ---- helpers -------------------------------------------------------------------------------------------------------

/** Option values compare by content (lists of controls or layers set again from an attribute are the same). */
function sameOption(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return Object.is(a, b);
}

export { dedent } from './base.js';

export function defineViewer(name = 'mmdx-viewer'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxViewerElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-viewer': MmdxViewerElement;
  }
}
