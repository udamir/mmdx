// <mmdx-viewer> (§8.1, UC1): read-only interactive diagram for documentation pages. Behind the element is the
// DiagramViewer class, which can also be mounted into any element without custom elements.
//
// Component architecture §4: the viewer is the view kernel (ViewCore) with a TextScene (source text → async render)
// and the viewer's modules — the editor's chrome (tool dock, zoom bar with help, view params), every piece behind a
// control of the `controls` attribute.
import { ElementBase } from './base.js';
import type { ThemeSource } from '../adapters/themes.js';
import type { HistoryAdapter, StaticVersion } from '../adapters/history.js';
import type { StorageAdapter } from '../adapters/storage.js';
import { getShared } from '../config.js';
import type { CoreContext } from '../core/context.js';
import { splitSource } from '../core/meta/index.js';
import { standaloneSvg } from '../core/pipeline-core.js';
import { summarize } from '../core/summary.js';
import type { Diagnostic, Rect } from '../core/types.js';
import type { WheelMode } from '../dom/viewport.js';
import { h } from '../ui/h.js';
import { VIEWER_CSS } from '../ui/styles/viewer.js';
import { ViewCore } from '../view/core.js';
import { lazyModule, type ViewModule } from '../view/module.js';
import { VIEWER_MODULES } from '../view/modules/viewer.js';
import { TextScene, type FallbackMode, type FitMode } from '../view/scenes/text.js';

export type { FallbackMode, FitMode };
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
  /** The `compact` preset (§7.6): smaller, icon-only chrome; automatic below a host size by default. */
  compact?: boolean | 'auto';
  /** `adopt` keeps server-rendered SVG as is (no idle re-measure). */
  rehydrate?: 'auto' | 'adopt';
  themeSource?: ThemeSource;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  /** The diagram's versions: with `controls` including `history`, a History button shows how it changed. */
  history?: HistoryAdapter | readonly StaticVersion[];
}

export interface ViewerEventMap {
  'mmdx-render': CustomEvent<{ bounds: Rect; type: string | null; durationMs: number }>;
  'mmdx-error': CustomEvent<{ diagnostics: Diagnostic[] }>;
  'mmdx-link': CustomEvent<{ href: string; id: string | null }>;
  'mmdx-fullscreen': CustomEvent<{ active: boolean }>;
  'mmdx-ui': CustomEvent<{ ui: 'light' | 'dark' }>;
}

const DEFAULT_CONTROLS: readonly ViewerControl[] = ['zoom', 'fullscreen'];

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      canvas: { interaction: o.interactive === false ? 'static' : 'pan-zoom', wheel: o.wheel ?? 'ctrl', panOnDrag: true, svgClass: 'scene', part: 'canvas', reducedMotion },
      feature: (name) => this.feature(name),
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
    core.display.set({ labels: o.labels !== false, hoverHighlight: o.hoverHighlight !== false });
    if (o.layers) core.visibleLayers.set(o.layers);
    this.msg = h('div', { class: 'msg' });
    core.area.after(this.msg);
    this.scene = new TextScene(core, {
      fit: () => this.o.fit ?? 'contain',
      fallback: () => this.o.fallback ?? 'mermaid',
      msg: this.msg,
      stage: core.area,
      onRendered: (r, durationMs) => {
        const s = summarize(r.model);
        core.root.setAttribute('aria-label', this.o.label ?? core.i18n.t(s.key, s.params));
        core.root.classList.toggle('can-pan', core.canvas.interaction === 'pan-zoom');
        const warn = r.diagnostics.filter((d) => d.severity !== 'info' || d.code === 'theme.missing');
        if (warn.length) core.emit('mmdx-error', { diagnostics: warn });
        core.emit('mmdx-render', { bounds: r.result.bounds, type: r.model.type, durationMs });
      },
      onFallback: () => undefined,
      onError: (diagnostics) => core.emit('mmdx-error', { diagnostics }),
    });
    core.provide('documentModel', () => this.scene.rendered?.model ?? null);
    core.provide('documentMeta', () => this.scene.rendered?.doc.meta ?? null);
    core.provide('documentCode', () => this.scene.rendered?.doc.code ?? (this.scene.text !== null ? splitSource(this.scene.text).doc.code : null));
    core.provide('contentBounds', () => this.scene.bounds.peek());
    core.pushScene(this.scene);
    this.installModules();
    // a picture while the diagram shows; the code panel must stay readable for screen readers
    core.on('panels', () => this.syncRole());
    core.panels.set({ ...core.panels.peek() });

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

  /** Updates options; re-renders or re-fetches as needed. */
  set(patch: Partial<ViewerOptions>): void {
    const srcChanged = 'src' in patch && patch.src !== this.o.src;
    const controlsChanged = 'controls' in patch && patch.controls?.join(' ') !== this.o.controls?.join(' ');
    Object.assign(this.o, patch);
    const core = this.core;
    if ('ui' in patch) core.setUi(patch.ui);
    if ('theme' in patch) core.themes.attr.set(patch.theme ?? null);
    if ('themeDark' in patch) core.themes.attrDark.set(patch.themeDark ?? null);
    if ('compact' in patch) core.setCompact(patch.compact ?? 'auto');
    if ('interactive' in patch) core.canvas.setInteraction(patch.interactive === false ? 'static' : 'pan-zoom');
    if ('wheel' in patch) core.canvas.setOptions({ wheel: patch.wheel ?? 'ctrl' });
    if ('labels' in patch || 'hoverHighlight' in patch) core.display.set({ labels: this.o.labels !== false, hoverHighlight: this.o.hoverHighlight !== false });
    if ('layers' in patch) core.visibleLayers.set(this.o.layers);
    if (controlsChanged || 'interactive' in patch || 'history' in patch) this.installModules();
    if (srcChanged || ('source' in patch && patch.source !== undefined)) void this.load();
    else core.invalidate();
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

  setLayers(ids: readonly string[] | undefined): void {
    if (ids) this.o.layers = ids;
    else delete this.o.layers;
    this.core.visibleLayers.set(ids);
    this.core.invalidate();
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
    const { svgToPng } = await import('../dom/export.js');
    const res = await svgToPng(this.toSvg(), b.w, b.h, { scale: opts.scale ?? 2, fonts: getShared().fonts });
    if (res.missingFonts.length) this.core.emit('mmdx-error', { diagnostics: [{ severity: 'info', code: 'export.font-missing', message: `Fonts not embedded (no font source): ${res.missingFonts.join(', ')}` }] });
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

  /** Opens or closes the History of the diagram. */
  toggleHistory(on?: boolean): void {
    this.core.run('toggleHistory', on);
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
      case 'scheme':
        return c.includes('theme');
      case 'history':
        return c.includes('history') && !!this.o.history;
      default:
        return c.includes(name as ViewerControl);
    }
  }

  private installModules(): void {
    const list: ViewModule<ViewCore>[] = [
      ...VIEWER_MODULES,
      lazyModule({ id: 'viewer-export', enabled: (c) => c.feature('export') }, () => import('./viewer-modules.js').then((m) => m.viewerExportModule(this))),
      lazyModule({ id: 'history', enabled: (c) => c.feature('history') }, () => import('./viewer-modules.js').then((m) => m.viewerHistoryModule(this))),
    ];
    this.core.useModules([]);
    this.core.useModules(list);
  }

  private syncRole(): void {
    this.core.root.setAttribute('role', this.core.panels.peek()['code-view'] ? 'group' : 'img');
    this.core.root.classList.toggle('pinned', Object.values(this.core.panels.peek()).some(Boolean));
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
        const loader = this.o.loader ?? ((url: string) => fetch(url, { credentials: 'same-origin' }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        }));
        text = await loader(this.o.src);
        if (seq !== this.fetchSeq || this.destroyed) return;
      } catch (e) {
        if (seq !== this.fetchSeq || this.destroyed) return;
        this.scene.showError([{ severity: 'error', code: 'load.failed', message: `Could not load ${this.o.src}: ${e instanceof Error ? e.message : String(e)}` }], '');
        return;
      }
    } else {
      const script = this.host.querySelector(':scope > script[type="text/mermaid"], :scope > script[type="text/x-mermaid"]');
      text = dedent((script?.textContent ?? this.host.getAttribute('data-source') ?? '').replace(/<\\\/(script)/gi, '</$1'));
    }
    this.scene.setText(text);
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

const BOOL_ATTRS = ['interactive', 'lazy', 'labels', 'hover-highlight'] as const;

export class MmdxViewerElement extends ElementBase {
  static observedAttributes = ['src', 'theme', 'theme-dark', 'fit', 'controls', 'wheel', 'fallback', 'label', 'ui', 'rehydrate', 'compact', ...BOOL_ATTRS];
  private viewer: DiagramViewer | null = null;
  private pending: Partial<ViewerOptions> = {};

  connectedCallback(): void {
    if (!this.hasAttribute('fit')) this.setAttribute('fit', 'width');
    this.viewer = new DiagramViewer(this, { ...this.attrOptions(), ...this.pending });
  }

  disconnectedCallback(): void {
    this.viewer?.destroy();
    this.viewer = null;
  }

  attributeChangedCallback(): void {
    this.viewer?.set(this.attrOptions());
  }

  private attrOptions(): Partial<ViewerOptions> {
    const o: Partial<ViewerOptions> = {};
    const a = (n: string): string | null => this.getAttribute(n);
    const bool = (n: string): boolean | undefined => (this.hasAttribute(n) ? a(n) !== 'false' : undefined);
    const set = <K extends keyof ViewerOptions>(k: K, v: ViewerOptions[K] | undefined | null): void => {
      if (v !== undefined && v !== null) o[k] = v;
    };
    set('src', a('src'));
    set('theme', a('theme'));
    set('themeDark', a('theme-dark'));
    set('fit', (a('fit') as FitMode | null) ?? 'width');
    const controls = a('controls');
    // `list` (the former text outline) now opens the code view
    if (controls !== null) o.controls = controls === 'none' ? [] : (controls.split(/\s+/).filter(Boolean).map((c) => (c === 'list' ? 'code' : c)) as ViewerControl[]);
    set('wheel', a('wheel') as WheelMode | null);
    set('fallback', a('fallback') as FallbackMode | null);
    set('label', a('label'));
    set('ui', a('ui') as ViewerOptions['ui'] | null);
    set('rehydrate', a('rehydrate') as ViewerOptions['rehydrate'] | null);
    const compact = a('compact');
    if (compact !== null) o.compact = compact === 'auto' ? 'auto' : compact !== 'false';
    set('interactive', bool('interactive'));
    set('lazy', bool('lazy'));
    set('labels', bool('labels'));
    set('hoverHighlight', bool('hover-highlight'));
    return o;
  }

  private setOpt(patch: Partial<ViewerOptions>): void {
    if (this.viewer) this.viewer.set(patch);
    else Object.assign(this.pending, patch);
  }

  get source(): string | undefined {
    return this.viewer?.options.source ?? this.pending.source;
  }
  set source(v: string | undefined) {
    this.setOpt(v === undefined ? {} : { source: v });
  }
  get loader(): ViewerOptions['loader'] {
    return this.viewer?.options.loader ?? this.pending.loader;
  }
  set loader(v: ViewerOptions['loader']) {
    if (v) this.setOpt({ loader: v });
  }
  get layers(): readonly string[] | undefined {
    return this.viewer?.options.layers ?? this.pending.layers;
  }
  set layers(v: readonly string[] | undefined) {
    if (this.viewer) this.viewer.setLayers(v);
    else if (v) this.pending.layers = v;
  }
  set themeSource(v: ThemeSource) {
    this.setOpt({ themeSource: v });
  }
  set storage(v: StorageAdapter) {
    this.setOpt({ storage: v });
  }
  get history(): ViewerOptions['history'] {
    return this.viewer?.options.history ?? this.pending.history;
  }
  set history(v: ViewerOptions['history']) {
    if (v) this.setOpt({ history: v });
  }
  toggleHistory(on?: boolean): void {
    this.viewer?.toggleHistory(on);
  }

  fit(): void {
    this.viewer?.fit();
  }
  zoomTo(k: number): void {
    this.viewer?.zoomTo(k);
  }
  reload(): Promise<void> {
    return this.viewer?.reload() ?? Promise.resolve();
  }
  toSvg(): string {
    return this.viewer?.toSvg() ?? '';
  }
  toPng(opts?: { scale?: number }): Promise<Blob> {
    return this.viewer ? this.viewer.toPng(opts) : Promise.reject(new Error('Not connected'));
  }
  setLayers(ids: readonly string[] | undefined): void {
    this.layers = ids;
  }
  get diagnostics(): readonly Diagnostic[] {
    return this.viewer?.diagnostics ?? [];
  }
  /** The underlying viewer (advanced use; undefined while disconnected). */
  get instance(): DiagramViewer | undefined {
    return this.viewer ?? undefined;
  }
}

// ---- helpers -------------------------------------------------------------------------------------------------------

/** Removes the common indentation of an inline `<script type="text/mermaid">` block. */
export function dedent(s: string): string {
  const lines = s.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  let ind = Infinity;
  for (const l of lines) if (l.trim()) ind = Math.min(ind, /^[ \t]*/.exec(l)![0].length);
  return Number.isFinite(ind) && ind > 0 ? lines.map((l) => l.slice(ind)).join('\n') : lines.join('\n');
}

export function defineViewer(name = 'mmdx-viewer'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxViewerElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-viewer': MmdxViewerElement;
  }
}
