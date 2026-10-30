// <mmdx-viewer> (§8.1, UC1): read-only interactive diagram for documentation pages. Behind the element is the
// DiagramViewer class, which can also be mounted into any element without custom elements.
import { ElementBase } from './base.js';
import type { ThemeSource } from '../adapters/themes.js';
import { localStorageAdapter, memoryStorage, type StorageAdapter } from '../adapters/storage.js';
import { ensureBuiltinThemes, getShared, instanceContext, renderWithMermaid } from '../config.js';
import { BASE_THEME_ID, BUILTIN_IDS } from '../core/theme/builtin-ids.js';
import { counterpartTheme, HOUSE } from '../core/theme/pairs.js';
import type { CoreContext } from '../core/context.js';
import { splitSource } from '../core/meta/index.js';
import { summarize } from '../core/summary.js';
import { detectType } from '../core/parse/dispatch.js';
import { renderSourceWith, standaloneSvg, type PipelineOptions, type Rendered } from '../core/pipeline-core.js';
import { pageScene } from '../core/render/page.js';
import { hasKind, loadedKinds, loadKind } from './kinds.js';
import type { Diagnostic, Rect } from '../core/types.js';
import { diagnosticText } from '../core/types.js';
import { renderInWorker, workerAvailable, WORKER_THRESHOLD_LINES } from '../dom/worker-client.js';
import { HIGHLIGHT_CSS, hoverHighlight, clearHighlight } from '../dom/highlight.js';
import { patchChildren } from '../dom/patch.js';
import type { MagicPen } from '../dom/pen.js';
import { Viewport, type WheelMode } from '../dom/viewport.js';
import { h, icon } from '../ui/h.js';
import type { I18n } from '../ui/i18n.js';
import { I_code, I_download, I_expand, I_layers, I_minus, I_pen, I_plus, I_shrink } from '../ui/icons.js';
import { PopoverManager, Toaster } from '../ui/popover.js';
import { adoptStyles, BASE, resolveUiScheme, TOKENS, watchUiScheme } from '../ui/styles/base.js';
import { VIEWER_CSS } from '../ui/styles/viewer.js';

const NS = 'http://www.w3.org/2000/svg';

export type ViewerControl = 'zoom' | 'layers' | 'pen' | 'fullscreen' | 'export' | 'code';
export type FitMode = 'contain' | 'width' | 'none';
export type FallbackMode = 'mermaid' | 'source' | 'error';

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
  /** `adopt` keeps server-rendered SVG as is (no idle re-measure). */
  rehydrate?: 'auto' | 'adopt';
  themeSource?: ThemeSource;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
}

export interface ViewerEventMap {
  'ds-render': CustomEvent<{ bounds: Rect; type: string | null; durationMs: number }>;
  'ds-error': CustomEvent<{ diagnostics: Diagnostic[] }>;
  'ds-link': CustomEvent<{ href: string; id: string | null }>;
  'ds-fullscreen': CustomEvent<{ active: boolean }>;
}

const DEFAULT_CONTROLS: readonly ViewerControl[] = ['zoom', 'fullscreen'];

const emit = <K extends keyof ViewerEventMap>(target: EventTarget, type: K, detail: ViewerEventMap[K]['detail'], cancelable = false): boolean =>
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));

export class DiagramViewer {
  readonly ctx: CoreContext;
  private readonly o: ViewerOptions;
  private readonly shadow: ShadowRoot;
  private readonly i18n: I18n;
  private readonly storage: StorageAdapter;
  private readonly rootEl: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly defsEl: SVGDefsElement;
  private readonly vpEl: SVGGElement;
  private readonly pageEl: SVGGElement;
  private readonly bodyEl: SVGGElement;
  private readonly bar: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly live: HTMLElement;
  private readonly pops: PopoverManager;
  private readonly toaster: Toaster;
  private viewport: Viewport | null = null;
  private pen: MagicPen | null = null;
  /** Pen and export code load on first use (they are not needed to show a diagram, §R5). */
  private penMod: typeof import('../dom/pen.js') | null = null;
  private rendered: Rendered | null = null;
  private text: string | null = null;
  private showCode = false;
  /** Code view module (with its styles adopted), loaded when the view is first shown. */
  private codeMod: typeof import('./viewer-code.js') | null = null;
  private hoverKey = '';
  private visible = false;
  private io: IntersectionObserver | null = null;
  private renderHandle = 0;
  private renderSeq = 0;
  private fetchSeq = 0;
  private moved = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly ac = new AbortController();
  private destroyed = false;

  constructor(private readonly host: HTMLElement, options: ViewerOptions = {}) {
    this.o = { ...options };
    const shared = getShared();
    this.i18n = shared.i18n;
    this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());
    this.ctx = instanceContext(options.ctx);
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    adoptStyles(this.shadow, [TOKENS, BASE, VIEWER_CSS, HIGHLIGHT_CSS]);

    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'scene');
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.setAttribute('part', 'canvas');
    this.defsEl = document.createElementNS(NS, 'defs');
    this.vpEl = document.createElementNS(NS, 'g');
    this.pageEl = document.createElementNS(NS, 'g');
    this.bodyEl = document.createElementNS(NS, 'g');
    this.pageEl.setAttribute('class', 'page-layer');
    this.bodyEl.setAttribute('class', 'body-layer');
    this.vpEl.append(this.pageEl, this.bodyEl);
    this.svg.append(this.defsEl, this.vpEl);
    this.stage = h('div', { class: 'stage' }, this.svg);
    this.bar = h('div', { class: 'bar ds-float', part: 'zoom-bar', role: 'toolbar' });
    this.msg = h('div', { class: 'msg' });
    this.live = h('div', { class: 'ds-sr', 'aria-live': 'polite' });
    this.rootEl = h('div', { class: 'root', role: 'img', tabindex: '0' }, this.stage, this.bar, this.msg, this.live);
    this.shadow.append(this.rootEl);
    this.pops = new PopoverManager(this.shadow);
    this.toaster = new Toaster(this.shadow);

    this.wireLinks();
    this.wireKeys();
    this.wireHover();
    this.cleanups.push(watchUiScheme(() => this.applyScheme(true)));
    // a theme registered later (built-ins loaded on demand, a theme saved in the theme editor) re-renders
    this.cleanups.push(this.ctx.themes.onChange(() => this.scheduleRender()));
    this.applyScheme(false);

    const ssr = host.querySelector(':scope > svg[data-ds-ssr]');
    if (ssr instanceof SVGSVGElement) this.adoptSsr(ssr);
    if (this.o.lazy !== false && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.visible = true;
          this.io?.disconnect();
          this.io = null;
          this.load();
        }
      }, { rootMargin: '300px' });
      this.io.observe(host);
    } else {
      this.visible = true;
      this.load();
    }
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  /** Updates options; re-renders or re-fetches as needed. */
  set(patch: Partial<ViewerOptions>): void {
    const srcChanged = 'src' in patch && patch.src !== this.o.src;
    Object.assign(this.o, patch);
    if ('ui' in patch) this.applyScheme(true);
    if ('interactive' in patch || 'wheel' in patch) this.setupInteraction();
    if (srcChanged || ('source' in patch && patch.source !== undefined)) this.load();
    else this.scheduleRender();
  }

  get options(): Readonly<ViewerOptions> {
    return this.o;
  }

  fit(): void {
    this.viewport?.fit();
  }

  zoomTo(k: number): void {
    this.viewport?.zoomTo(k);
  }

  /** Re-fetches `src` (after an edit, §11.5). */
  reload(): Promise<void> {
    return this.load();
  }

  setLayers(ids: readonly string[] | undefined): void {
    if (ids) this.o.layers = ids;
    else delete this.o.layers;
    this.scheduleRender();
  }

  /** Standalone SVG document of what is shown (visible layers, label setting). */
  toSvg(): string {
    return this.rendered ? standaloneSvg(this.rendered, this.ctx) : '';
  }

  async toPng(opts: { scale?: number } = {}): Promise<Blob> {
    const r = this.rendered;
    if (!r) throw new Error('Nothing rendered');
    const b = r.result.bounds;
    const { svgToPng } = await import('../dom/export.js');
    const res = await svgToPng(this.toSvg(), b.w, b.h, { scale: opts.scale ?? 2, fonts: getShared().fonts });
    if (res.missingFonts.length) emit(this.host, 'ds-error', { diagnostics: [{ severity: 'info', code: 'export.font-missing', message: `Fonts not embedded (no font source): ${res.missingFonts.join(', ')}` }] });
    return res.blob;
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.rendered?.diagnostics ?? [];
  }

  /** The source text currently shown. */
  get sourceText(): string | null {
    return this.text;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    this.io?.disconnect();
    this.viewport?.destroy();
    this.pen?.destroy();
    this.pops.close();
    this.toaster.destroy();
    for (const c of this.cleanups) c();
    if (this.renderHandle) cancelIdle(this.renderHandle);
    this.rootEl.remove();
  }

  // ---- loading and rendering --------------------------------------------------------------------------------------

  private async load(): Promise<void> {
    if (!this.visible) return;
    const seq = ++this.fetchSeq;
    if (this.o.source !== undefined) this.text = this.o.source;
    else if (this.o.src) {
      if (!this.rendered) this.msg.replaceChildren(h('div', { class: 'loading' }, this.i18n.t('loading')));
      try {
        const loader = this.o.loader ?? ((url: string) => fetch(url, { credentials: 'same-origin' }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        }));
        const t = await loader(this.o.src);
        if (seq !== this.fetchSeq || this.destroyed) return;
        this.text = t;
      } catch (e) {
        if (seq !== this.fetchSeq || this.destroyed) return;
        this.showError([{ severity: 'error', code: 'load.failed', message: `Could not load ${this.o.src}: ${e instanceof Error ? e.message : String(e)}` }], '');
        return;
      }
    } else {
      const script = this.host.querySelector(':scope > script[type="text/mermaid"], :scope > script[type="text/x-mermaid"]');
      this.text = script?.textContent ?? this.host.getAttribute('data-source') ?? '';
      this.text = dedent(this.text.replace(/<\\\/(script)/gi, '</$1'));
    }
    this.reserveAspect();
    this.renderNow();
  }

  /** Lazy viewers reserve the page's aspect ratio from `%%@ canvas` before rendering (no layout shift). */
  private reserveAspect(): void {
    if (this.text === null) return;
    const { doc } = splitSource(this.text);
    const { w, h: hh } = doc.meta.canvas;
    if (typeof w === 'number' && typeof hh === 'number' && w > 0 && hh > 0) this.stage.style.setProperty('--ds-aspect', `${w} / ${hh}`);
  }

  private scheduleRender(): void {
    if (!this.visible || this.text === null || this.renderHandle) return;
    this.renderHandle = idle(() => {
      this.renderHandle = 0;
      this.renderNow();
    });
  }

  private themeFor(diagramTheme: string | undefined): string | undefined {
    const forced = this.o.theme;
    const id = forced ?? diagramTheme;
    if (this.isDark() && this.o.themeDark) {
      const t = this.ctx.themes.has(id ?? BASE_THEME_ID) ? this.ctx.themes.get(id ?? BASE_THEME_ID) : null;
      // "auto": the dark counterpart of the diagram's theme (GitHub Light → GitHub Dark, Default Light → Default Dark)
      if (!t || t.appearance !== 'dark') return this.o.themeDark === 'auto' ? counterpartTheme(this.ctx.themes, id, 'dark') : this.o.themeDark;
    }
    return id;
  }

  private isDark(): boolean {
    return resolveUiScheme(this.o.ui === 'auto' || !this.o.ui ? null : this.o.ui) === 'dark';
  }

  private renderNow(): void {
    if (this.destroyed || this.text === null) return;
    // theme-dark="auto" on a dark page needs the dark built-in themes to pick a counterpart: load them first
    if (this.o.themeDark === 'auto' && this.isDark() && !this.ctx.themes.has(HOUSE.dark)) {
      const text = this.text;
      void ensureBuiltinThemes().then(() => {
        if (!this.destroyed && text === this.text) this.renderNow();
      });
      return;
    }
    // the parser and renderer of this diagram type load on first use
    const type = detectType(this.text);
    if (type && !hasKind(type)) {
      const text = this.text;
      loadKind(type).then(() => {
        if (!this.destroyed && text === this.text) this.renderNow();
      }, () => this.showError([{ severity: 'error', code: 'load.failed', message: `Could not load the ${type} renderer` }], text));
      return;
    }
    const t0 = now();
    const { doc } = splitSource(this.text);
    const themeId = this.themeFor(typeof doc.meta.canvas.theme === 'string' ? doc.meta.canvas.theme : undefined);
    if (themeId && !this.ctx.themes.has(themeId)) {
      // a built-in theme that is not loaded yet: wait for it instead of flashing baseline
      if (BUILTIN_IDS.includes(themeId)) {
        const text = this.text;
        void ensureBuiltinThemes().then(() => {
          if (!this.destroyed && text === this.text) this.renderNow();
        });
        return;
      }
      void this.fetchTheme(themeId);
    }
    const opts: PipelineOptions = { hideLabels: this.o.labels === false };
    if (themeId !== undefined) opts.theme = themeId;
    if (this.o.layers) opts.visibleLayers = this.o.layers;
    const text = this.text;
    if (countLines(text) > WORKER_THRESHOLD_LINES && workerAvailable()) {
      const seq = ++this.renderSeq;
      void renderInWorker(text, this.ctx, opts).then((wr) => {
        if (this.destroyed || seq !== this.renderSeq || text !== this.text) return;
        if (wr && 'error' in wr) this.showError([{ severity: 'error', code: 'doc.too-large', message: 'Rendering this diagram took too long' }], text);
        else this.applyRendered(wr ?? renderSourceWith(loadedKinds(), text, this.ctx, opts), t0);
      });
      return;
    }
    ++this.renderSeq;
    this.applyRendered(renderSourceWith(loadedKinds(), text, this.ctx, opts), t0);
  }

  private applyRendered(r: Rendered, t0: number): void {
    this.rendered = r;
    const errors = r.diagnostics.filter((d) => d.severity === 'error');
    if (r.model.type === null) {
      void this.showUnsupported(r);
      return;
    }
    if (errors.length && r.tooLarge) {
      this.showError(errors, this.text ?? '');
      return;
    }
    this.msg.replaceChildren();
    if (this.showCode) this.renderCode();
    const res = r.result;
    patchChildren(this.defsEl, res.defs);
    patchChildren(this.pageEl, pageScene(res, r.rctx));
    patchChildren(this.bodyEl, res.body);
    this.rootEl.style.setProperty('--ds-page-bg', res.page.background);
    const b = res.bounds;
    this.stage.style.setProperty('--ds-aspect', `${Math.max(1, b.w)} / ${Math.max(1, b.h)}`);
    if (this.o.fit === 'none') {
      this.stage.style.width = `${b.w}px`;
      this.stage.style.height = `${b.h}px`;
    } else {
      this.stage.style.removeProperty('width');
      this.stage.style.removeProperty('height');
    }
    const s = summarize(r.model);
    const label = this.o.label ?? this.i18n.t(s.key, s.params);
    this.rootEl.setAttribute('aria-label', label);
    this.setupInteraction();
    this.viewport?.setBounds(b);
    if (!this.viewport) this.staticFit(b);
    this.buildBar();
    const warn = r.diagnostics.filter((d) => d.severity !== 'info' || d.code === 'theme.missing');
    if (warn.length) emit(this.host, 'ds-error', { diagnostics: warn });
    emit(this.host, 'ds-render', { bounds: b, type: r.model.type, durationMs: Math.round((now() - t0) * 10) / 10 });
  }

  /** Non-interactive viewers: the whole page fills the element through the viewBox. */
  private staticFit(b: Rect): void {
    this.vpEl.removeAttribute('transform');
    this.svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  private async fetchTheme(id: string): Promise<void> {
    const src = this.o.themeSource ?? getShared().themeSource;
    if (!src) return;
    try {
      const file = await src.get(id);
      if (this.destroyed) return;
      this.ctx.themes.register(file);
      // a theme that extends another unknown theme pulls that one in too
      if (file.extends && !this.ctx.themes.has(file.extends)) await this.fetchTheme(file.extends);
      this.scheduleRender();
    } catch {
      // missing or private theme: the diagram stays on baseline with an info diagnostic (§8.1)
    }
  }

  private async showUnsupported(r: Rendered): Promise<void> {
    const text = this.text ?? '';
    patchChildren(this.bodyEl, []);
    patchChildren(this.pageEl, []);
    this.stage.hidden = true;
    this.bar.replaceChildren();
    const mode = this.o.fallback ?? 'mermaid';
    if (mode === 'error') return this.showError(r.diagnostics, text);
    if (mode === 'source') {
      this.msg.replaceChildren(h('pre', { class: 'error' }, text));
      return;
    }
    this.msg.replaceChildren(h('div', { class: 'loading' }, this.i18n.t('loading')));
    try {
      const svg = await renderWithMermaid(text, this.isDark());
      if (this.destroyed || text !== this.text) return;
      const box = h('div', { class: 'fallback', part: 'canvas' });
      // stock Mermaid output, rendered with securityLevel "strict" (sanitised by Mermaid's DOMPurify)
      box.innerHTML = svg;
      this.msg.replaceChildren(box);
      emit(this.host, 'ds-render', { bounds: { x: 0, y: 0, w: 0, h: 0 }, type: null, durationMs: 0 });
    } catch (e) {
      if (this.destroyed) return;
      this.showError([...r.diagnostics, { severity: 'error', code: 'mermaid.failed', message: e instanceof Error ? e.message : String(e) }], text);
    }
  }

  /** Compact error panel with line numbers and the source; never throws into the host. */
  private showError(diags: readonly Diagnostic[], source: string): void {
    this.stage.hidden = true;
    this.bar.replaceChildren();
    const bad = new Set(diags.map((d) => d.range?.line).filter((l): l is number => l !== undefined));
    const pre = h('pre', null, ...source.split('\n').slice(0, 2000).map((l, i) => h('span', { class: bad.has(i) ? 'bad' : '' }, l || ' ')));
    const copy = h('button', {
      type: 'button',
      onclick: () => {
        void navigator.clipboard?.writeText(source).then(() => {
          copy.textContent = this.i18n.t('error.copied');
        });
      },
    }, this.i18n.t('error.copy'));
    this.msg.replaceChildren(h('div', { class: 'error', role: 'alert' },
      h('h2', null, diags.some((d) => d.code === 'doc.too-large' || d.code === 'doc.too-many-items') ? this.i18n.t('error.tooLarge') : this.i18n.t('error.title')),
      h('ul', null, ...diags.slice(0, 20).map((d) => h('li', null, diagnosticText(d)))),
      source ? pre : null,
      source ? h('div', { class: 'actions' }, copy) : null));
    emit(this.host, 'ds-error', { diagnostics: [...diags] });
  }

  /** Code view over the diagram: its Mermaid code without the layout metadata and without styling. */
  private renderCode(): void {
    const r = this.rendered;
    if (!r) return;
    void (async () => {
      if (!this.codeMod) {
        const mod = await import('./viewer-code.js');
        if ('adoptedStyleSheets' in this.shadow && typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(mod.CODE_VIEW_CSS);
          this.shadow.adoptedStyleSheets = [...this.shadow.adoptedStyleSheets, sheet];
        } else this.shadow.append(h('style', null, mod.CODE_VIEW_CSS));
        this.codeMod = mod;
      }
      if (this.destroyed || !this.showCode || this.rendered !== r) return;
      this.msg.replaceChildren(this.codeMod.codeView(r.doc.code, this.i18n));
    })();
  }

  /** Server-rendered SVG (build plugin, §11.4): shown immediately; interaction attaches on first render. */
  private adoptSsr(ssr: SVGSVGElement): void {
    const vb = ssr.viewBox.baseVal;
    if (vb && vb.width && vb.height) this.stage.style.setProperty('--ds-aspect', `${vb.width} / ${vb.height}`);
    const clone = ssr.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('class', 'scene ssr');
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    this.stage.prepend(clone);
    this.svg.style.visibility = 'hidden';
    const reveal = (): void => {
      clone.remove();
      this.svg.style.removeProperty('visibility');
    };
    // the server's pixels stay until the first client render replaces them in one swap
    this.host.addEventListener('ds-render', reveal, { once: true, signal: this.ac.signal });
  }

  // ---- interaction ------------------------------------------------------------------------------------------------

  private setupInteraction(): void {
    const interactive = this.o.interactive !== false;
    this.rootEl.classList.toggle('can-pan', interactive);
    if (!interactive) {
      this.viewport?.destroy();
      this.viewport = null;
      return;
    }
    if (this.viewport) {
      this.viewport.setOptions({ wheel: this.o.wheel ?? 'ctrl' });
      return;
    }
    this.svg.removeAttribute('viewBox');
    this.viewport = new Viewport(this.svg, {
      wheel: this.o.wheel ?? 'ctrl',
      panOnDrag: true,
      reducedMotion: matchMediaSafe('(prefers-reduced-motion: reduce)'),
      onChange: (v) => {
        this.vpEl.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`);
        this.pen?.sync();
        const pct = this.bar.querySelector('.pct');
        if (pct) pct.textContent = `${Math.round(v.k * 100)}%`;
      },
    });
    this.svg.addEventListener('pointerdown', (ev) => {
      this.moved = false;
      const x = ev.clientX, y = ev.clientY;
      const mv = (e: PointerEvent): void => {
        if (Math.hypot(e.clientX - x, e.clientY - y) > 4) this.moved = true;
      };
      this.svg.addEventListener('pointermove', mv, { signal: this.ac.signal });
      this.svg.addEventListener('pointerup', () => this.svg.removeEventListener('pointermove', mv), { once: true, signal: this.ac.signal });
    }, { signal: this.ac.signal });
    this.svg.addEventListener('dblclick', () => this.viewport?.fit(), { signal: this.ac.signal });
  }

  private wireLinks(): void {
    // links open on click (not after a pan); hosts can route or veto them through the cancelable ds-link event
    this.svg.addEventListener('click', (ev) => {
      const a = (ev.target as Element).closest('a');
      if (!a) return;
      ev.preventDefault();
      if (this.moved) return;
      const href = a.getAttribute('href');
      if (!href) return;
      const item = a.closest('[data-id]');
      if (!emit(this.host, 'ds-link', { href, id: item?.getAttribute('data-id') ?? null }, true)) return;
      const target = this.ctx.linkPolicy.target ?? '_blank';
      if (target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
      else window.location.assign(href);
    }, { signal: this.ac.signal });
  }

  private wireHover(): void {
    this.svg.addEventListener('pointermove', (ev) => {
      if (this.o.hoverHighlight === false || this.viewport?.panning || this.pen?.active) return;
      const key = hoverHighlight(this.bodyEl, ev.target as Element, this.rendered?.model ?? null);
      if (key !== this.hoverKey) this.hoverKey = key;
    }, { signal: this.ac.signal });
    this.svg.addEventListener('pointerleave', () => {
      clearHighlight(this.bodyEl);
      this.hoverKey = '';
    }, { signal: this.ac.signal });
  }

  private wireKeys(): void {
    // shortcuts only while focus is inside the viewer (§8.2: never at document level)
    this.rootEl.addEventListener('keydown', (ev) => {
      if (ev.target !== this.rootEl || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const vp = this.viewport;
      const { w, h: hh } = vp?.size ?? { w: 0, h: 0 };
      const k = ev.key;
      if ((k === '+' || k === '=') && vp) vp.zoomAt(1.2, w / 2, hh / 2);
      else if (k === '-' && vp) vp.zoomAt(1 / 1.2, w / 2, hh / 2);
      else if ((k === 'f' || k === 'F' || k === '0') && vp) vp.fit();
      else if (k.startsWith('Arrow') && vp) vp.panBy(k === 'ArrowLeft' ? 40 : k === 'ArrowRight' ? -40 : 0, k === 'ArrowUp' ? 40 : k === 'ArrowDown' ? -40 : 0);
      else if ((k === 'p' || k === 'P') && this.controls().includes('pen')) this.togglePen();
      else if (k === 'Escape' && this.pen?.active) this.togglePen(false);
      else return;
      ev.preventDefault();
    }, { signal: this.ac.signal });
  }

  private applyScheme(rerender: boolean): void {
    const dark = this.isDark();
    this.host.setAttribute('data-ui', dark ? 'dark' : 'light');
    if (rerender && this.o.themeDark) this.scheduleRender();
  }

  // ---- controls bar -----------------------------------------------------------------------------------------------

  private controls(): readonly ViewerControl[] {
    return this.o.controls ?? DEFAULT_CONTROLS;
  }

  private buildBar(): void {
    const c = this.controls();
    const t = this.i18n.t;
    const parts: (HTMLElement | null)[] = [];
    const btn = (label: string, ic: string, onclick: (ev: MouseEvent) => void, extra: Record<string, unknown> = {}): HTMLButtonElement =>
      h('button', { type: 'button', title: label, 'aria-label': label, onclick, ...extra }, icon(ic));
    if (c.includes('zoom') && this.viewport) {
      const vp = this.viewport;
      const mid = (): [number, number] => [vp.size.w / 2, vp.size.h / 2];
      parts.push(
        btn(t('zoom.out'), I_minus, () => vp.zoomAt(1 / 1.2, ...mid())),
        h('span', { class: 'pct', 'aria-live': 'off' }, `${Math.round(vp.state.k * 100)}%`),
        btn(t('zoom.in'), I_plus, () => vp.zoomAt(1.2, ...mid())),
        h('button', { type: 'button', title: t('zoom.fit'), onclick: () => vp.fit() }, t('zoom.fitShort')),
      );
    }
    const extra: HTMLElement[] = [];
    if (c.includes('layers')) extra.push(btn(t('layers.title'), I_layers, (ev) => this.openLayers(ev.currentTarget as HTMLElement), { 'aria-haspopup': 'true', 'aria-expanded': 'false' }));
    if (c.includes('pen') && this.viewport) extra.push(btn(t('pen.title'), I_pen, () => this.togglePen(), { class: this.pen?.active ? 'on' : '', 'aria-pressed': String(!!this.pen?.active) }));
    if (c.includes('code')) extra.push(btn(this.showCode ? t('codeView.hide') : t('codeView.show'), I_code, () => this.toggleCode(), { class: this.showCode ? 'on' : '', 'aria-pressed': String(this.showCode) }));
    if (c.includes('export')) extra.push(btn(t('export.title'), I_download, (ev) => this.openExport(ev.currentTarget as HTMLElement), { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }));
    if (c.includes('fullscreen') && document.fullscreenEnabled) {
      const active = document.fullscreenElement === this.host;
      extra.push(btn(active ? t('fullscreen.exit') : t('fullscreen.enter'), active ? I_shrink : I_expand, () => this.toggleFullscreen()));
    }
    if (parts.length && extra.length) parts.push(h('span', { class: 'sep' }));
    this.bar.replaceChildren(...parts.filter((p): p is HTMLElement => !!p), ...extra);
    this.bar.hidden = !this.bar.childElementCount;
  }

  private toggleCode(): void {
    this.showCode = !this.showCode;
    if (!this.showCode) this.msg.replaceChildren();
    // a picture while the diagram shows; the code view inside must stay readable for screen readers
    this.rootEl.setAttribute('role', this.showCode ? 'group' : 'img');
    this.renderNow();
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement === this.host) {
      void document.exitFullscreen();
      return;
    }
    this.host.requestFullscreen().then(() => {
      emit(this.host, 'ds-fullscreen', { active: true });
      const off = (): void => {
        if (document.fullscreenElement === this.host) return;
        document.removeEventListener('fullscreenchange', off);
        emit(this.host, 'ds-fullscreen', { active: false });
        this.buildBar();
        this.viewport?.fit();
      };
      document.addEventListener('fullscreenchange', off, { signal: this.ac.signal });
      this.buildBar();
      this.viewport?.fit();
    }, () => this.toaster.show(this.i18n.t('fullscreen.failed'), { error: true }));
  }

  private togglePen(on?: boolean): void {
    if (!this.penMod) {
      void import('../dom/pen.js').then((m) => {
        this.penMod = m;
        if (!this.destroyed) this.togglePen(on);
      });
      return;
    }
    if (!this.pen) {
      const vp = this.viewport;
      if (!vp) return;
      this.pen = this.penMod.createMagicPen({
        container: this.stage,
        getView: () => vp.state,
        wheelTarget: this.svg,
        storage: this.storage,
        reducedMotion: () => matchMediaSafe('(prefers-reduced-motion: reduce)'),
        onChange: () => this.buildBar(),
      });
    }
    const next = on ?? !this.pen.active;
    this.pen.setActive(next);
    if (next) this.openPenOptions();
    else this.pops.close();
  }

  private openPenOptions(): void {
    const pen = this.pen;
    if (!pen) return;
    void import('./viewer-popups.js').then(({ penOptions }) => {
      if (this.destroyed || !pen.active) return;
      this.pops.open(penOptions(pen, this.i18n.t), null, { focus: false });
    });
  }

  private openLayers(opener: HTMLElement): void {
    if (!this.rendered) return;
    void import('./viewer-popups.js').then(({ viewSettings }) => {
      if (this.destroyed) return;
      this.pops.open(viewSettings({
        meta: () => this.rendered?.doc.meta ?? { canvas: {}, styles: {} },
        visible: () => this.o.layers,
        labels: () => this.o.labels !== false,
        hover: () => this.o.hoverHighlight !== false,
        setVisible: (ids) => this.setLayers(ids),
        setLabels: (v) => this.set({ labels: v }),
        setHover: (v) => this.set({ hoverHighlight: v }),
      }, this.i18n.t), opener);
    });
  }

  private openExport(opener: HTMLElement): void {
    const t = this.i18n.t;
    const name = (this.o.src?.split('/').pop() ?? 'diagram').replace(/\.(mmdx?|md|txt)$/i, '') || 'diagram';
    const item = (label: string, f: () => void | Promise<void>): HTMLElement =>
      h('button', { type: 'button', role: 'menuitem', onclick: () => { this.pops.close(); void Promise.resolve(f()).catch((e: unknown) => this.toaster.show(e instanceof Error ? e.message : String(e), { error: true })); } }, label);
    const download = async (file: string, data: string | Blob, type?: string): Promise<void> => (await import('../dom/export.js')).download(file, data, type);
    const pop = h('div', { class: 'pop ds-menu', role: 'menu' },
      item(t('export.svg'), () => download(`${name}.svg`, this.toSvg(), 'image/svg+xml')),
      item(t('export.png'), async () => download(`${name}.png`, await this.toPng())),
      this.text ? item(t('export.mmdx'), () => download(`${name}.mmdx`, this.text ?? '')) : null);
    this.pops.open(pop, opener);
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

const BOOL_ATTRS = ['interactive', 'lazy', 'labels', 'hover-highlight'] as const;

export class MmdxViewerElement extends ElementBase {
  static observedAttributes = ['src', 'theme', 'theme-dark', 'fit', 'controls', 'wheel', 'fallback', 'label', 'ui', 'rehydrate', ...BOOL_ATTRS];
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
}

// ---- helpers -------------------------------------------------------------------------------------------------------

const countLines = (s: string): number => {
  let n = 1;
  for (let i = s.indexOf('\n'); i >= 0 && n <= WORKER_THRESHOLD_LINES; i = s.indexOf('\n', i + 1)) n++;
  return n;
};

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function idle(f: () => void): number {
  const w = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  return w.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 120 }) : (setTimeout(f, 16) as unknown as number);
}
function cancelIdle(id: number): void {
  const w = globalThis as typeof globalThis & { cancelIdleCallback?: (id: number) => void };
  if (w.cancelIdleCallback) w.cancelIdleCallback(id);
  else clearTimeout(id);
}

function matchMediaSafe(q: string): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia(q).matches;
}

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
