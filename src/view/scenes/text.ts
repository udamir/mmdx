// TextScene (component architecture §7.3): the viewer's scene source. Source text → async render (the worker over
// 300 lines, the diagram kind's parser and renderer loaded on demand), server-rendered SVG adoption, the Mermaid
// fallback for unsupported types, the error card, and the reserved aspect ratio. Draws with the kernel's theme and
// display settings.
import { renderWithMermaid } from '../../config.js';
import { splitSource } from '../../core/meta/index.js';
import { detectType } from '../../core/parse/dispatch.js';
import { renderSourceWith, type PipelineOptions, type Rendered } from '../../core/pipeline-core.js';
import { pageScene } from '../../core/render/page.js';
import { BUILTIN_IDS } from '../../core/theme/builtin-ids.js';
import { diagnosticText, type Diagnostic, type Rect } from '../../core/types.js';
import { cancelIdle, idle } from '../../dom/idle.js';
import { renderInWorker, workerAvailable, WORKER_THRESHOLD_LINES } from '../../dom/worker-client.js';
import { h } from '../../ui/h.js';
import type { ViewCore } from '../core.js';
import { lazyKinds, type KindsProvider } from '../kinds.js';
import { BaseScene } from '../scene.js';

export type FitMode = 'contain' | 'width' | 'none';
export type FallbackMode = 'mermaid' | 'source' | 'error';

export interface TextSceneOptions {
  fit: () => FitMode;
  fallback: () => FallbackMode;
  /** Where messages (loading, errors, the Mermaid fallback) are shown. */
  msg: HTMLElement;
  /** The element that carries the aspect ratio (`--mmdx-aspect`) and the `fit="none"` size. */
  stage: HTMLElement;
  onRendered(r: Rendered, durationMs: number): void;
  onFallback(): void;
  onError(diags: Diagnostic[]): void;
  /** Parsers and renderers of the diagram kinds (default: loaded on first use). */
  kinds?: KindsProvider;
}

export class TextScene extends BaseScene {
  readonly id = 'text';
  /** The source shown (null until loaded). */
  text: string | null = null;
  rendered: Rendered | null = null;
  /** The source `rendered` was made from. */
  private renderedText: string | null = null;
  private renderSeq = 0;
  private handle = 0;
  private destroyed = false;
  private readonly kinds: KindsProvider;
  /** A message to show once attached again (an error that came while History had the canvas). */
  private deferred: (() => void) | null = null;

  constructor(private readonly core: ViewCore, private readonly o: TextSceneOptions) {
    super();
    this.kinds = o.kinds ?? lazyKinds;
  }

  /** Shows a new source (renders now). */
  setText(text: string): void {
    this.text = text;
    this.deferred = null;
    this.reserveAspect();
    this.renderNow();
  }

  /** Re-renders on the next idle period (theme, display, layers changed). */
  override invalidate(): void {
    if (!this.area) {
      this.dirty = true;
      return;
    }
    if (this.text === null || this.handle) return;
    this.handle = idle(() => {
      this.handle = 0;
      this.renderNow();
    });
  }

  protected paint(full: boolean, stale = false): void {
    if (full && this.deferred) {
      const show = this.deferred;
      this.deferred = null;
      show();
    } else if (full && !stale && this.rendered && this.renderedText === this.text) this.apply(this.rendered, 0, false);
    else this.renderNow();
  }

  /** Not attached: what arrives now is shown when the scene is attached again (it repaints from scratch). */
  private missed(): boolean {
    if (this.area) return false;
    this.dirty = true;
    return true;
  }

  /** Lazy viewers reserve the page's aspect ratio from `%%@ canvas` before rendering (no layout shift). */
  private reserveAspect(): void {
    if (this.text === null) return;
    const { doc } = splitSource(this.text);
    const { w, h: hh } = doc.meta.canvas;
    if (typeof w === 'number' && typeof hh === 'number' && w > 0 && hh > 0) this.o.stage.style.setProperty('--mmdx-aspect', `${w} / ${hh}`);
  }

  renderNow(): void {
    if (this.destroyed || this.text === null || this.missed()) return;
    if (this.handle) {
      cancelIdle(this.handle);
      this.handle = 0;
    }
    const core = this.core;
    const text = this.text;
    const again = (): void => {
      if (!this.destroyed && text === this.text) this.renderNow();
    };
    // the parser and renderer of this diagram type load on first use
    const type = detectType(text);
    if (type && !this.kinds.has(type)) {
      this.kinds.load(type).then(again, () => {
        if (!this.destroyed && text === this.text) this.showError([{ severity: 'error', code: 'load.failed', message: `Could not load the ${type} renderer` }], text);
      });
      return;
    }
    const theme = core.shownTheme();
    if (!core.ctx.themes.has(theme)) {
      // a built-in theme that is not loaded yet: wait for it instead of flashing baseline
      if (BUILTIN_IDS.includes(theme)) {
        void core.ensureTheme(theme).then(again);
        return;
      }
      void core.ensureTheme(theme).then((ok) => ok && again());
    }
    const t0 = now();
    const display = core.display.peek();
    const opts: PipelineOptions = { hideLabels: !display.labels, theme };
    const layers = core.visibleLayers.peek();
    if (layers) opts.visibleLayers = layers;
    if (countLines(text) > WORKER_THRESHOLD_LINES && workerAvailable()) {
      const seq = ++this.renderSeq;
      void renderInWorker(text, core.ctx, opts).then((wr) => {
        if (this.destroyed || seq !== this.renderSeq || text !== this.text) return;
        if (wr && 'error' in wr) this.showError([{ severity: 'error', code: 'doc.too-large', message: 'Rendering this diagram took too long' }], text);
        else this.apply(wr ?? renderSourceWith(this.kinds.kinds(), text, core.ctx, opts), t0, true);
      });
      return;
    }
    ++this.renderSeq;
    this.apply(renderSourceWith(this.kinds.kinds(), text, core.ctx, opts), t0, true);
  }

  private apply(r: Rendered, t0: number, announce: boolean): void {
    const area = this.area;
    if (this.missed() || !area) return;
    this.rendered = r;
    this.renderedText = this.text;
    const errors = r.diagnostics.filter((d) => d.severity === 'error');
    if (r.model.type === null) {
      void this.showUnsupported(r);
      return;
    }
    if (errors.length && r.tooLarge) {
      this.showError(errors, this.text ?? '');
      return;
    }
    this.o.msg.replaceChildren();
    this.o.stage.hidden = false;
    const res = r.result;
    const canvas = area.main;
    canvas.show({ defs: res.defs, page: pageScene(res, r.rctx), body: res.body });
    this.core.root.style.setProperty('--mmdx-page-bg', res.page.background);
    const b = res.bounds;
    this.o.stage.style.setProperty('--mmdx-aspect', `${Math.max(1, b.w)} / ${Math.max(1, b.h)}`);
    if (this.o.fit() === 'none') {
      this.o.stage.style.width = `${b.w}px`;
      this.o.stage.style.height = `${b.h}px`;
    } else {
      this.o.stage.style.removeProperty('width');
      this.o.stage.style.removeProperty('height');
    }
    canvas.setBounds(b);
    this.bounds.set(b);
    this.core.fire('draw');
    if (announce) this.o.onRendered(r, Math.round((now() - t0) * 10) / 10);
  }

  private async showUnsupported(r: Rendered): Promise<void> {
    const text = this.text ?? '';
    this.area?.main.clear();
    this.bounds.set(null);
    this.o.stage.hidden = true;
    this.o.onFallback();
    const mode = this.o.fallback();
    if (mode === 'error') return this.showError(r.diagnostics, text);
    if (mode === 'source') {
      this.o.msg.replaceChildren(h('pre', { class: 'error' }, text));
      return;
    }
    const t = this.core.i18n.t;
    this.o.msg.replaceChildren(h('div', { class: 'loading' }, t('loading')));
    try {
      const svg = await renderWithMermaid(text, this.core.scheme.peek() === 'dark');
      if (this.destroyed || text !== this.text || this.missed()) return;
      const box = h('div', { class: 'fallback', part: 'canvas' });
      // stock Mermaid output, rendered with securityLevel "strict" (sanitised by Mermaid's DOMPurify)
      box.innerHTML = svg;
      this.o.msg.replaceChildren(box);
      this.core.emit('mmdx-render', { bounds: { x: 0, y: 0, w: 0, h: 0 } satisfies Rect, type: null, durationMs: 0 });
    } catch (e) {
      if (this.destroyed || text !== this.text) return;
      this.showError([...r.diagnostics, { severity: 'error', code: 'mermaid.failed', message: e instanceof Error ? e.message : String(e) }], text);
    }
  }

  /** Compact error panel with line numbers and the source; never throws into the host. */
  showError(diags: readonly Diagnostic[], source: string): void {
    if (this.destroyed) return;
    if (this.missed()) {
      this.deferred = () => this.showError(diags, source);
      return;
    }
    const t = this.core.i18n.t;
    this.o.stage.hidden = true;
    this.bounds.set(null);
    this.o.onFallback();
    const bad = new Set(diags.map((d) => d.range?.line).filter((l): l is number => l !== undefined));
    const pre = h('pre', null, ...source.split('\n').slice(0, 2000).map((l, i) => h('span', { class: bad.has(i) ? 'bad' : '' }, l || ' ')));
    const copy = h('button', {
      type: 'button',
      onclick: () => {
        void navigator.clipboard?.writeText(source).then(() => {
          copy.textContent = t('error.copied');
        });
      },
    }, t('error.copy'));
    this.o.msg.replaceChildren(h('div', { class: 'error', role: 'alert' },
      h('h2', null, diags.some((d) => d.code === 'doc.too-large' || d.code === 'doc.too-many-items') ? t('error.tooLarge') : t('error.title')),
      h('ul', null, ...diags.slice(0, 20).map((d) => h('li', null, diagnosticText(d)))),
      source ? pre : null,
      source ? h('div', { class: 'actions' }, copy) : null));
    this.o.onError([...diags]);
  }

  /** Server-rendered SVG (build plugin): shown immediately; the first client render replaces it in one swap. */
  adoptSsr(ssr: SVGSVGElement, revealOn: EventTarget, signal: AbortSignal): void {
    const vb = ssr.viewBox.baseVal;
    if (vb && vb.width && vb.height) this.o.stage.style.setProperty('--mmdx-aspect', `${vb.width} / ${vb.height}`);
    const clone = ssr.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('class', 'scene ssr');
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    const main = (this.area?.main ?? this.core.canvas).svg;
    main.before(clone);
    main.style.visibility = 'hidden';
    revealOn.addEventListener('mmdx-render', () => {
      clone.remove();
      main.style.removeProperty('visibility');
    }, { once: true, signal });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.handle) cancelIdle(this.handle);
  }
}

const countLines = (s: string): number => {
  let n = 1;
  for (let i = s.indexOf('\n'); i >= 0 && n <= WORKER_THRESHOLD_LINES; i = s.indexOf('\n', i + 1)) n++;
  return n;
};

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
