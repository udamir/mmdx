// The live preview: a sample diagram per diagram type (tabs), drawn with the draft on a DiagramCanvas with the zoom
// bar; its Mermaid can be edited (Code), and edited samples are kept in the UI storage. A selected page preset shows
// the sample on that page. Built once; signals redraw it.
import { splitSource } from '../core/meta/index.js';
import { parse } from '../core/parse/index.js';
import { renderContext } from '../core/pipeline.js';
import { pageScene, render } from '../core/render/index.js';
import type { DiagramType } from '../core/types.js';
import { DiagramCanvas } from '../dom/canvas.js';
import { Scope } from '../ui/blocks/block.js';
import { createToggleButton } from '../ui/blocks/button.js';
import { createTabs } from '../ui/blocks/tabs.js';
import { createZoomBar } from '../ui/blocks/zoom-bar.js';
import { h } from '../ui/h.js';
import { signal, untracked, type ReadSignal, type Signal } from '../ui/signal.js';
import { DEFAULT_SAMPLES, TYPES } from './constants.js';
import type { Env } from './env.js';
import type { ThemeSamples } from './types.js';

export interface PreviewProps {
  /** The diagram type shown. */
  type: Signal<DiagramType>;
  /** Edited samples by type (kept in the UI storage). */
  samples: Signal<Readonly<Record<string, string>>>;
  /** The host's samples (option), before the defaults. */
  hostSamples: () => ThemeSamples | undefined;
  /** The selected page preset of the type shown (its page frames the sample). */
  pagePreset: ReadSignal<string | null>;
  /** Bumps when the draft's changes should show (debounced edits). */
  view: ReadSignal<number>;
  /** Stores the edited samples. */
  keep(samples: Readonly<Record<string, string>>): void;
}

export interface Preview {
  destroy(): void;
}

export function createPreview(env: Env, side: HTMLElement, p: PreviewProps): Preview {
  const { t, draft } = env;
  const scope = new Scope();
  const showCode = signal(false);
  let refit = true;
  let shownType: DiagramType | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  scope.add(() => clearTimeout(timer));
  const sample = (type: DiagramType): string => p.samples.peek()[type] ?? p.hostSamples()?.[type] ?? DEFAULT_SAMPLES[type];

  const box = h('div', { class: 'te-pbox' });
  const canvas = new DiagramCanvas(box, { interaction: 'pan-zoom', wheel: 'always', panOnDrag: true, svgClass: 'vw-svg' });
  canvas.svg.setAttribute('role', 'img');
  canvas.svg.setAttribute('aria-label', t('te.samplePreview'));
  scope.on(canvas.svg, 'dblclick', () => canvas.fit());
  const zoom = createZoomBar({ view: canvas.view, onZoom: (f) => canvas.zoomBy(f), onFit: () => canvas.fit(), t });
  zoom.el.querySelector('[role=toolbar]')?.setAttribute('aria-label', t('te.preview'));
  box.append(zoom.el);

  const tabs = createTabs<DiagramType>({
    label: t('te.samplePreview'), class: 'te-ptabs', value: p.type,
    tabs: TYPES.map((type) => ({ value: type, label: t(`te.${type}`) })),
    onChange: (type) => p.type.set(type),
  });
  const code = createToggleButton({ icon: null, text: t('te.code'), label: t('te.code'), tip: t('te.codeTitle'), pressed: showCode, class: 'te-codebtn', onClick: () => showCode.update((v) => !v) });
  const ta = h('textarea', { class: 'te-code', spellcheck: false, 'aria-label': t('te.sampleCode') });
  const reset = h('button', { type: 'button', class: 'link' }, t('te.resetSample'));
  const err = h('div', { class: 'te-hint te-perr', role: 'alert' });
  side.replaceChildren(h('div', { class: 'te-phead' }, tabs.el, code.el), ta, reset, err, box, h('div', { class: 'te-hint' }, t('te.previewHint')));

  const store = (type: DiagramType, text: string | undefined): void => {
    const next = { ...p.samples.peek() };
    if (text === undefined) delete next[type];
    else next[type] = text;
    p.samples.set(next);
    p.keep(next);
  };
  // typing here is not a shortcut, except Esc / ⌘S / ⌘Z handled by the registry (inText)
  scope.on(ta, 'input', () => {
    clearTimeout(timer);
    const type = p.type.peek();
    timer = setTimeout(() => {
      const def = p.hostSamples()?.[type] ?? DEFAULT_SAMPLES[type];
      store(type, ta.value.trim() === def.trim() ? undefined : ta.value);
    }, 200);
  });
  scope.on(reset, 'click', () => {
    clearTimeout(timer);
    store(p.type.peek(), undefined);
    ta.value = sample(p.type.peek());
  });
  // the code box shows the sample of the type shown (kept while it is typed in)
  scope.effect(() => {
    const type = p.type(), shown = showCode();
    ta.hidden = !shown;
    if (shown && env.shadow.activeElement !== ta) ta.value = untracked(() => sample(type));
  });
  scope.effect(() => void (reset.hidden = !showCode() || p.samples()[p.type()] === undefined));
  scope.effect(() => {
    p.view();
    draft.epoch();
    p.samples();
    // another type: fitted to the box again
    const type = p.type();
    if (type !== shownType) refit = true;
    shownType = type;
    p.pagePreset();
    untracked(paint);
  });

  // the sample parsed once while its text stays (P19: a theme edit repaints, the sample is the same)
  let parsed: { text: string; doc: ReturnType<typeof splitSource>['doc']; model: ReturnType<typeof parse> } | null = null;
  function paint(): void {
    if (!draft.current()) return;
    try {
      const T = draft.resolved.peek();
      const text = sample(p.type.peek());
      if (parsed?.text !== text) {
        const { doc } = splitSource(text);
        parsed = { text, doc, model: parse(doc.code) };
      }
      const { doc, model } = parsed;
      if (!model.type) throw new Error(model.diagnostics.find((d) => d.severity === 'error')?.message ?? t('te.notDiagram'));
      const meta = { ...doc.meta, canvas: { ...doc.meta.canvas } };
      delete meta.canvas.theme;
      // a selected page preset: the sample on that page
      const preset = p.pagePreset.peek();
      if (preset) meta.canvas.preset = preset;
      const rctx = renderContext(env.ctx, T, { code: doc.code, meta });
      const res = render(model, meta, T, rctx);
      canvas.show({ defs: res.defs, page: pageScene(res, rctx), body: res.body });
      canvas.setBounds(res.bounds, { fit: refit });
      refit = false;
      err.textContent = '';
    } catch (e) {
      err.textContent = t('te.previewErr', { msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    destroy() {
      scope.dispose();
      tabs.destroy();
      code.destroy();
      zoom.destroy();
      canvas.destroy();
    },
  };
}
