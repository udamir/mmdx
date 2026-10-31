// DiffScene (component architecture §7.3, §8.1): paints a DiffSession onto the kernel's canvas area. Before, Merged
// and After are morph states of the main canvas (switching animates); Side by side adds a second canvas, linked to
// the main one (shared pan and zoom); highlights and badges are the overlay layers of each picture; History mode
// shows one version as it is. The selected change is marked (`dx-selected`) and brought into view; the pen's
// strokes are painted into every canvas the scene creates. Only paints while attached: `detach()` gives the canvas
// area back (extra canvases destroyed, the main canvas back in place, no morph). Replaces the canvas half of
// elements/diff.ts (`buildStage`, `buildPlain`, `makeCanvas`, `applySelection`, `focusSelected`).
import { annotate, focusRect, shapeOf, type DiffView } from '../core/diff/annotate.js';
import { changeKey } from '../core/diff/merge.js';
import { renderedOf, type DiffRendered } from '../core/diff/render.js';
import type { Rendered } from '../core/pipeline-core.js';
import { pageScene } from '../core/render/page.js';
import { fmt } from '../core/scene/serialize.js';
import { hasMarks, markRuns } from '../core/text/marks.js';
import type { CanvasOptions, CanvasPicture, DiagramCanvas, Insets } from '../dom/canvas.js';
import { Morph, type MorphState } from '../dom/morph.js';
import { patchChildren, setMarkedLines } from '../dom/patch.js';
import type { StrokeStore } from '../dom/pen.js';
import { createBanner, MESSAGES_CSS } from '../ui/blocks/messages.js';
import { ago } from '../ui/blocks/version-list.js';
import { h } from '../ui/h.js';
import { effect, untracked, type ReadSignal } from '../ui/signal.js';
import type { ViewCore } from '../view/core.js';
import { strokesOf } from '../view/strokes.js';
import { BaseScene, type CanvasArea } from '../view/scene.js';
import type { DiffSession, DiffViewName } from './session.js';

const NS = 'http://www.w3.org/2000/svg';
const STATE_OF: Record<DiffView, number> = { before: 0, merged: 1, after: 2 };
/** Margins a selected change is brought inside (clear of the tool dock and the bars). */
const FOCUS_MARGINS: Insets = { left: 56, top: 8, right: 8, bottom: 56 };

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
    span.append(...(rs.length ? rs : [{ text: ' ', mark: null }]).map((r) => {
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

export interface DiffSceneOptions {
  reducedMotion: () => boolean;
  /** Accessible name of the picture (`role=img`). */
  label?: ReadSignal<string>;
  /** Options of the canvases the scene adds (the host's current wheel mode). */
  canvas?: () => Partial<CanvasOptions>;
}

type Kind = 'single' | 'side' | 'plain';

/** The CSS a DiffScene needs besides the diff tokens and canvas styles (its banner). */
export const DIFF_SCENE_CSS: readonly string[] = [MESSAGES_CSS];

export class DiffScene extends BaseScene {
  readonly id = 'diff';
  /** The stage element while attached (panes, banner, messages). */
  stage: HTMLElement | null = null;
  private msg: HTMLElement | null = null;
  private banner: { el: HTMLElement; destroy(): void } | null = null;
  private panes: HTMLElement[] = [];
  private second: { canvas: DiagramCanvas; unlink: () => void; ink: { store: StrokeStore; off: () => void } | null } | null = null;
  private morph: Morph | null = null;
  private offs: (() => void)[] = [];
  /** What is painted: a repaint only does what changed (a view switch animates). */
  private painted: { kind: Kind | null; D: DiffRendered | null; plain: Rendered | null; dim: boolean; view: DiffViewName | null; pair: string } = { kind: null, D: null, plain: null, dim: false, view: null, pair: '' };

  constructor(private readonly core: ViewCore, readonly session: DiffSession, private readonly o: DiffSceneOptions) {
    super();
  }

  /** Every canvas the diff draws into (the main one, and the After pane side by side). */
  canvases(): DiagramCanvas[] {
    return this.area ? [this.area.main, ...(this.second ? [this.second.canvas] : [])] : [];
  }

  /** What fit() keeps clear of in each pane: the tool dock, the pane titles, the bars. */
  insets(): Insets {
    const dock = this.core.slots['left-dock'].querySelector<HTMLElement>('.tool-dock');
    const w = dock && !dock.hidden ? dock.offsetWidth : 0;
    return { left: w ? 12 + w + 8 : 8, right: 8, top: this.painted.kind === 'side' ? 34 : 8, bottom: 52 };
  }

  override attach(area: CanvasArea): void {
    this.core.addCss(DIFF_SCENE_CSS);
    const stale = this.dirty;
    // the stage is inset by the panel stacks already: fit keeps clear of the scene's own chrome only
    area.main.setInsets(() => this.insets());
    super.attach(area);
    if (stale) this.session.invalidate();
  }

  /** The theme or the display settings changed: the session renders again (and the scene repaints). */
  override invalidate(): void {
    if (!this.area) {
      this.dirty = true;
      return;
    }
    this.session.invalidate();
  }

  override detach(): void {
    const area = this.area;
    for (const off of this.offs.splice(0).reverse()) off();
    if (area) {
      area.main.setInsets(null);
      this.dropSecond();
      this.morph = null;
      area.main.setMorph(null);
      area.main.clear();
      area.restoreMain();
    }
    this.banner?.destroy();
    this.banner = null;
    this.stage?.remove();
    this.stage = this.msg = null;
    this.panes = [];
    this.painted = { kind: null, D: null, plain: null, dim: false, view: null, pair: '' };
    super.detach();
  }

  destroy(): void {
    if (this.area) this.detach();
  }

  /** Takes the canvas area (first paint): the stage, its messages, and the effects that repaint it. */
  protected paint(full: boolean): void {
    const area = this.area;
    if (!area) return;
    if (full && !this.stage) this.setup(area);
  }

  private setup(area: CanvasArea): void {
    const s = this.session;
    this.msg = h('div', { class: 'msg' });
    this.banner = createBanner({ text: s.banner });
    this.stage = h('div', { class: 'dx-stage', part: 'canvas' }, this.banner.el, this.msg);
    area.el.prepend(this.stage);
    this.layout('single');
    const label = this.o.label;
    if (label)
      this.offs.push(effect(() => {
        const text = label();
        this.stage?.setAttribute('role', 'img');
        this.stage?.setAttribute('aria-label', text);
      }));
    // the picture: a new render, a view switch, History mode, the dim setting
    this.offs.push(effect(() => {
      const viewOnly = s.viewOnly(), D = s.rendered(), plain = s.plain(), view = s.view(), dim = s.dim(), status = s.status();
      untracked(() => this.draw(viewOnly, D, plain, view, dim, status?.kind === 'empty'));
    }));
    // the selection: marked in every canvas, brought into view
    this.offs.push(effect(() => {
      const key = s.selected();
      untracked(() => this.applySelection(key !== null));
    }));
    // loading, nothing to compare, a failed load (with Retry)
    this.offs.push(effect(() => {
      const st = s.status();
      untracked(() => {
        const box = this.msg;
        if (!box) return;
        if (!st) box.replaceChildren();
        else if (st.kind === 'error') {
          const retry = st.retry ? h('button', { type: 'button' }, this.core.i18n.t('diff.history.retry')) : null;
          retry?.addEventListener('click', () => void s.reload());
          box.replaceChildren(h('div', { class: 'error', role: 'alert' }, h('div', null, st.text), retry));
        } else box.replaceChildren(h('div', null, st.text));
      });
    }));
  }

  // ---- painting ---------------------------------------------------------------------------------------------------

  private draw(viewOnly: boolean, D: DiffRendered | null, plain: Rendered | null, view: DiffViewName, dim: boolean, empty: boolean): void {
    if (!this.area) return;
    this.syncInk();
    const p = this.painted;
    if (viewOnly) {
      // the viewed version is loading: no other version's picture under its name
      if (!plain) {
        if (!p.kind) return;
        this.clearStage();
      } else if (p.kind === 'plain' && p.plain === plain) return;
      else this.paintPlain(plain);
    } else if (D) {
      const kind: Kind = view === 'side' ? 'side' : 'single';
      const pair = `${this.session.base.peek()}|${this.session.head.peek()}`;
      if (kind === 'single' && p.kind === 'single' && p.D === D && p.dim === dim && this.morph) {
        if (p.view !== view) {
          this.morph.go(STATE_OF[view as DiffView]);
          p.view = view;
          this.applySelection(false);
        }
        return;
      }
      // a new pair or another layout of the stage fits again; a filter change keeps the pan and zoom
      this.paintDiff(D, kind, view as DiffView, dim, p.kind !== kind || p.pair !== pair);
      p.pair = pair;
    } else if (empty && p.kind) this.clearStage();
    else return;
    this.core.fire('draw');
  }

  private paintDiff(D: DiffRendered, kind: 'single' | 'side', view: DiffView, dim: boolean, refit: boolean): void {
    const area = this.area!;
    const main = area.main;
    const keep = refit ? null : main.saveView();
    if (kind === 'single') {
      const states = (['before', 'merged', 'after'] as const).map((v) => this.state(D, v, dim));
      if (this.painted.kind === 'single' && this.morph) this.morph.reset(states, STATE_OF[view]);
      else {
        this.layout('single');
        this.morph = new Morph(main.defs, main.content, states, STATE_OF[view], this.o.reducedMotion);
        main.setMorph(this.morph);
      }
      this.panes[0]!.style.background = paneBackground(D.after);
    } else {
      const t = this.core.i18n.t;
      this.morph = null;
      this.layout('side', [
        { side: 'before', title: t('diff.view.before'), sub: this.versionText(this.session.base.peek()) },
        { side: 'after', title: t('diff.view.after'), sub: this.versionText(this.session.head.peek()) },
      ]);
      main.show(this.picture(D, 'before', dim));
      this.second?.canvas.show(this.picture(D, 'after', dim));
      this.panes[0]!.style.background = paneBackground(D.before);
      if (this.panes[1]) this.panes[1].style.background = paneBackground(D.after);
    }
    this.painted = { ...this.painted, kind, D, plain: null, dim, view };
    for (const c of this.canvases()) {
      if (keep && !keep.auto) c.setBounds(D.bounds);
      else c.setBounds(D.bounds, { fit: true });
    }
    this.bounds.set(D.bounds);
    this.applySelection(false);
  }

  /** History mode: one version as it is, the standard viewer picture. */
  private paintPlain(r: Rendered): void {
    const area = this.area!;
    const v = this.session.versions.peek().find((x) => x.id === this.session.viewing.peek());
    this.morph = null;
    this.layout('plain', [{ side: 'single', title: v?.id ?? '', sub: [v?.message, v?.author, ago(v?.date, this.core.i18n.locale)].filter(Boolean).join(' · ') }]);
    this.panes[0]!.style.background = paneBackground(r);
    area.main.show({ defs: r.result.defs, page: pageScene(r.result, r.rctx), body: r.result.body });
    this.painted = { ...this.painted, kind: 'plain', D: null, plain: r, view: null };
    area.main.setBounds(r.result.bounds, { fit: true });
    this.bounds.set(r.result.bounds);
  }

  /** Nothing to compare: an empty pane. */
  private clearStage(): void {
    this.morph = null;
    this.area!.main.clear();
    this.layout('single');
    this.painted = { ...this.painted, kind: null, D: null, plain: null, view: null };
    this.bounds.set(null);
  }

  /**
   * The panes of a layout: one (Before / Merged / After, History mode) with the main canvas, or two side by side with
   * a second canvas linked to it. Pane titles name the versions.
   */
  private layout(kind: Kind, titles: { side: string; title: string; sub: string }[] = []): void {
    const area = this.area!;
    const stage = this.stage!;
    const two = kind === 'side';
    if (!two) this.dropSecond();
    stage.className = `dx-stage ${two ? 'side' : 'single'}`;
    const want = two ? 2 : 1;
    while (this.panes.length > want) this.panes.pop()!.remove();
    while (this.panes.length < want) {
      const pane = h('div', { class: 'pane' });
      stage.insertBefore(pane, this.banner?.el ?? null);
      this.panes.push(pane);
    }
    this.panes.forEach((pane, i) => {
      const tt = titles[i];
      pane.className = `pane ${tt ? tt.side : 'single'}`;
      pane.style.removeProperty('background');
      pane.querySelector(':scope > .pane-title')?.remove();
      if (tt) pane.prepend(h('div', { class: 'pane-title' }, h('b', null, tt.title), tt.sub ? h('span', null, tt.sub) : null));
    });
    const main = area.main;
    if (main.svg.parentNode !== this.panes[0]) this.panes[0]!.append(main.svg);
    if (two && !this.second) {
      const canvas = area.createCanvas(this.panes[1]!, { ...this.o.canvas?.(), insets: () => this.insets() });
      this.second = { canvas, unlink: main.link(canvas), ink: null };
    }
    this.syncInk();
  }

  /** The pen's strokes in the second canvas too (the main canvas is the pen module's). */
  syncInk(): void {
    const sec = this.second;
    if (!sec) return;
    const store = strokesOf.get(this.core) ?? null;
    if (sec.ink?.store === store) return;
    sec.ink?.off();
    sec.ink = store ? { store, off: sec.canvas.attachInk(store) } : null;
  }

  private dropSecond(): void {
    const sec = this.second;
    if (!sec) return;
    this.second = null;
    sec.ink?.off();
    sec.unlink();
    sec.canvas.destroy();
  }

  /** One state of the single canvas (before, merged or after) as detached layers. */
  private state(D: DiffRendered, view: DiffView, dim: boolean): MorphState {
    const r = renderedOf(D, view);
    const v: DiffView = view === 'merged' && !D.merged ? 'after' : view;
    const a = annotate({ view: v, result: r.result, before: D.before.result, changes: D.changes, measure: r.rctx.measure }, { dim });
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

  /** One side of side by side, painted through the canvas's layers. */
  private picture(D: DiffRendered, view: 'before' | 'after', dim: boolean): CanvasPicture {
    const r = renderedOf(D, view);
    const a = annotate({ view, result: r.result, before: D.before.result, changes: D.changes, measure: r.rctx.measure }, { dim });
    return { defs: r.result.defs, page: pageScene(r.result, r.rctx), body: a.body, runs: a.runs, overlay: a.overlay };
  }

  private versionText(id: string | null): string {
    const v = this.session.versions.peek().find((x) => x.id === id);
    if (!v) return '';
    return [v.id, v.author, ago(v.date, this.core.i18n.locale)].filter(Boolean).join(' · ');
  }

  // ---- selection --------------------------------------------------------------------------------------------------

  private applySelection(focus: boolean): void {
    const key = this.session.selected.peek();
    for (const c of this.canvases())
      for (const e of c.content.querySelectorAll('[data-key]')) e.classList.toggle('dx-selected', e.getAttribute('data-key') === key);
    if (focus) this.focusSelected();
  }

  /** Brings the selected change into view when it is not fully visible. */
  private focusSelected(): void {
    const s = this.session;
    const D = s.rendered.peek(), main = this.area?.main;
    const ch = s.change(s.selected.peek());
    if (!D || !main || !ch || s.viewOnly.peek()) return;
    const shown = s.view.peek();
    const view: DiffView = shown === 'side' ? (ch.status === 'removed' ? 'before' : 'after') : shown;
    const r = renderedOf(D, view);
    const id = view === 'before' ? ch.beforeId ?? ch.id : view === 'after' ? ch.id : changeKey(ch).slice(ch.kind.length + 1);
    const sh = shapeOf(r.result.geom, ch.kind, id) ?? (ch.status === 'removed' ? shapeOf(D.before.result.geom, ch.kind, ch.beforeId ?? ch.id) : null);
    if (sh) main.focus(focusRect(sh), FOCUS_MARGINS);
  }
}

const paneBackground = (r: Rendered): string => {
  const bg = r.result.page.background;
  return bg && bg !== 'transparent' ? bg : '';
};
