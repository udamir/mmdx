// DiffScene (component architecture §7.3, §8.1): paints a DiffSession onto the kernel's canvas area. Before, Merged
// and After are morph states of the main canvas (switching animates); Side by side adds a second canvas, linked to
// the main one (shared pan and zoom); highlights and badges are the overlay layers of each picture; History mode
// shows one version as it is. The selected change is marked (`dx-selected`) and brought into view; the pen's
// strokes are painted into every canvas the scene creates. Only paints while attached: `detach()` gives the canvas
// area back (extra canvases destroyed, the main canvas back in place, no morph). Replaces the canvas half of
// elements/diff.ts (`buildStage`, `buildPlain`, `makeCanvas`, `applySelection`, `focusSelected`). The scene sees its
// host through the narrow `SceneHost` port (`sceneHost(core)` for a ViewCore), not the kernel.
import { annotate, focusRect, shapeOf, type DiffView } from '../core/diff/annotate.js';
import { createStatusBox, STATUS_BOX_CSS, type StatusBoxHandle } from '../ui/blocks/status-box.js';
import { Owner } from '../reactive/owner.js';
import { changeKey } from '../core/diff/merge.js';
import { renderedOf, type DiffRendered } from '../core/diff/render.js';
import type { Rendered } from '../core/pipeline-core.js';
import { pageScene } from '../core/render/page.js';
import type { CanvasOptions, CanvasPicture, DiagramCanvas, Insets } from '../dom/canvas.js';
import { Morph, transitionFrom, type MorphState } from '../dom/morph.js';
import { patchChildren } from '../dom/patch.js';
import type { StrokeStore } from '../dom/pen.js';
import { createBanner, MESSAGES_CSS } from '../ui/blocks/messages.js';
import { ago } from '../ui/kit/format.js';
import { h } from '../ui/kit/h.js';
import { effect, untracked, type ReadSignal } from '../reactive/signal.js';
import type { I18n } from '../i18n.js';
import type { ViewCore } from '../view/core.js';
import { BaseScene, type CanvasArea } from '../view/scene.js';
import type { DiffSession } from './session.js';
import type { DiffViewName } from '../view/history.js';

const NS = 'http://www.w3.org/2000/svg';
const STATE_OF: Record<DiffView, number> = { before: 0, merged: 1, after: 2 };
/** Margins a selected change is brought inside (clear of the tool dock and the bars). */
const FOCUS_MARGINS: Insets = { left: 56, top: 8, right: 8, bottom: 56 };

/** What a DiffScene needs of the component it is shown in. */
export interface SceneHost {
  readonly i18n: I18n;
  /** The pen's strokes (painted into the canvases the scene adds). */
  readonly strokes: ReadSignal<StrokeStore | null>;
  addCss(css: readonly string[]): void;
  /** Insets of the canvas area covered by the host's panel stacks and tool dock. */
  insets(): Insets;
  /** Width of the host's tool dock (0 while it is not shown). */
  dockWidth(): number;
  /** Pan, zoom or the insets changed (`view`), or a picture was drawn (`draw`). */
  on(event: 'view' | 'draw', f: () => void): () => void;
  /** The scene drew a picture (the host's `draw` event). */
  drew(): void;
}

/** A ViewCore as a DiffScene's host. */
export const sceneHost = (core: ViewCore): SceneHost => ({
  i18n: core.i18n,
  strokes: core.strokes,
  addCss: (css) => core.addCss(css),
  insets: () => core.insets(),
  dockWidth: () => core.dockWidth(),
  on: (event, f) => core.on(event, f),
  drew: () => core.fire('draw'),
});

export interface DiffSceneOptions {
  reducedMotion: () => boolean;
  /** Accessible name of the picture (`role=img`). */
  label?: ReadSignal<string>;
  /** Options of the canvases the scene adds (the host's current wheel mode). */
  canvas?: () => Partial<CanvasOptions>;
  /** The viewed version's id and details over the History mode picture (default on); off where the host names it already. */
  versionTitle?: boolean;
  /**
   * The host's own look (History in the editor): the panes span the canvas area under the panels, with the host's
   * canvas showing through (no pane background, the page drawn as the host draws it), fit keeps clear of the panels like
   * the host's, and badges at each page's corner name the diagram type and, side by side, the version shown.
   */
  hostLook?: boolean;
}

type Kind = 'single' | 'side' | 'plain';

/** The CSS a DiffScene needs besides the diff tokens and canvas styles (its banner). */
const DIFF_SCENE_CSS: readonly string[] = [MESSAGES_CSS, STATUS_BOX_CSS, /* css */ `
.dx-stage.host-look { gap: 0; background: transparent; }
.dx-stage.host-look.single, .dx-stage.host-look.side { left: 0; right: 0; }
/* side by side under the panels: the panes split at the middle of the area between the panel stacks */
.dx-stage.host-look.side > .pane.before { flex: none; width: calc(var(--inset-l, 0px) + (100% - var(--inset-l, 0px) - var(--inset-r, 0px)) / 2); }
.dx-stage.host-look .pane { background: transparent; }
.dx-stage.host-look.side .pane + .pane { border-left: 1px solid var(--mmdx-border); }
.dx-page-badges { position: absolute; left: 0; top: 0; z-index: 3; display: flex; gap: 6px; align-items: center; white-space: nowrap; pointer-events: none; }
.dx-page-badges[hidden] { display: none; }
.dx-page-badge, .dx-page-version { border: 1px solid var(--mmdx-border); border-radius: 6px; background: var(--mmdx-surface); color: var(--mmdx-muted);
  font-size: 11px; font-weight: 600; letter-spacing: .02em; padding: 2px 8px; line-height: 16px; }
.dx-page-badge { flex: none; }
.dx-page-version { display: flex; gap: 6px; min-width: 0; overflow: hidden; font-weight: 400; letter-spacing: 0; }
.dx-page-version b { flex: none; font-weight: 600; }
.dx-page-version span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pane.before .dx-page-version b { color: var(--mmdx-diff-del); }
.pane.after .dx-page-version b { color: var(--mmdx-diff-add); }
@container area (max-width: 480px) {
  .dx-stage.host-look.side .pane + .pane { border-left: 0; border-top: 1px solid var(--mmdx-border); }
  .dx-stage.host-look.side > .pane.before { flex: 1; width: auto; }
}
`];

export class DiffScene extends BaseScene {
  readonly id = 'diff';
  /** The stage element while attached (panes, banner, messages). */
  stage: HTMLElement | null = null;
  private msg: HTMLElement | null = null;
  /** Loading, nothing to compare, a failed load with Retry. */
  private status: StatusBoxHandle | null = null;
  private banner: { el: HTMLElement; destroy(): void } | null = null;
  private panes: HTMLElement[] = [];
  private second: { canvas: DiagramCanvas; unlink: () => void; ink: { store: StrokeStore; off: () => void } | null } | null = null;
  private morph: Morph | null = null;
  /** The picture shown before the scene was pushed (History: a version, the document): its first picture morphs from it. */
  private carry: MorphState | null = null;
  /** What an attach set up (listeners, effects), let go when the scene is detached; a new one per attach. */
  private owner = new Owner('diff scene');
  /** What is painted: a repaint only does what changed (a view switch animates). */
  private painted: { kind: Kind | null; D: DiffRendered | null; plain: Rendered | null; dim: boolean; view: DiffViewName | null; pair: string } = { kind: null, D: null, plain: null, dim: false, view: null, pair: '' };

  constructor(private readonly core: SceneHost, readonly session: DiffSession, private readonly o: DiffSceneOptions) {
    super();
  }

  /** Every canvas the diff draws into (the main one, and the After pane side by side). */
  canvases(): DiagramCanvas[] {
    return this.area ? [this.area.main, ...(this.second ? [this.second.canvas] : [])] : [];
  }

  /**
   * What fit() keeps clear of in a pane (`pane` 1: the After pane side by side): the tool dock, the pane titles (the
   * page badges), the bars. In the host's look the panes span the canvas area under the panels, so each keeps clear of
   * the panels on its side; the two panes share one view, measured from where each one's free area starts.
   */
  insets(pane = 0): Insets {
    if (this.o.hostLook) {
      // the host's: the panel stacks and the dock, and the diff bar at the bottom
      const c = this.core.insets();
      const all = { left: Math.max(c.left, 8), right: Math.max(c.right, 8), top: Math.max(c.top, 8), bottom: Math.max(c.bottom, 52) };
      if (this.painted.kind !== 'side') return all;
      const top = Math.max(c.top, 34);
      return pane === 0 ? { ...all, right: 8, top } : { ...all, left: 8, top };
    }
    const w = this.core.dockWidth();
    return { left: w ? 12 + w + 8 : 8, right: 8, top: this.painted.kind === 'side' ? 34 : 8, bottom: 52 };
  }

  override attach(area: CanvasArea): void {
    this.core.addCss(DIFF_SCENE_CSS);
    const stale = this.dirty;
    // the stage is inset by the panel stacks already: fit keeps clear of the scene's own chrome only
    area.main.setInsets(() => this.insets(0));
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
    this.owner.dispose();
    this.owner = new Owner('diff scene');
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
    this.status?.destroy();
    this.status = null;
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
    this.status = createStatusBox({ kind: null });
    this.msg = h('div', { class: 'msg' }, this.status.el);
    this.banner = createBanner({ text: s.banner });
    this.stage = h('div', { class: 'dx-stage', part: 'canvas' }, this.banner.el, this.msg);
    if (this.o.hostLook) {
      this.owner.add(this.core.on('view', () => this.placeBadges()));
      this.owner.add(this.core.on('draw', () => this.placeBadges()));
    }
    area.el.prepend(this.stage);
    this.layout('single');
    const label = this.o.label;
    if (label)
      this.owner.add(effect(() => {
        const text = label();
        this.stage?.setAttribute('role', 'img');
        this.stage?.setAttribute('aria-label', text);
      }));
    // the picture: a new render, a view switch, History mode, the dim setting
    this.owner.add(effect(() => {
      const viewOnly = s.viewOnly(), D = s.rendered(), plain = s.plain(), view = s.view(), dim = s.dim(), status = s.status();
      untracked(() => this.draw(viewOnly, D, plain, view, dim, status?.kind ?? null));
    }));
    // the selection: marked in every canvas, brought into view
    this.owner.add(effect(() => {
      const key = s.selected();
      untracked(() => this.applySelection(key !== null));
    }));
    // loading, nothing to compare, a failed load (with Retry)
    this.owner.add(effect(() => {
      const st = s.status();
      untracked(() => this.status?.update(st
        ? { kind: st.kind, text: st.text, retryLabel: this.core.i18n.t('diff.history.retry'), ...(st.kind === 'error' && st.retry ? { onRetry: () => void s.reload() } : { onRetry: undefined }) }
        : { kind: null }));
    }));
  }

  // ---- painting ---------------------------------------------------------------------------------------------------

  private draw(viewOnly: boolean, D: DiffRendered | null, plain: Rendered | null, view: DiffViewName, dim: boolean, status: string | null): void {
    if (!this.area) return;
    this.syncInk();
    const p = this.painted;
    if (viewOnly) {
      // the viewed version is loading: the shown picture stays, under its own title, and animates to the new one once
      // it is rendered; a failed load clears it (no other version's picture under the viewed one's name)
      if (!plain) {
        if (!p.kind || status !== 'error') return;
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
      // a new pair or another layout of the stage fits again (a new pair animates); a filter change keeps the pan and zoom
      const switched = p.pair !== pair;
      this.paintDiff(D, kind, view as DiffView, dim, pair, p.kind !== kind || switched, switched);
    } else if (status === 'empty' && p.kind) this.clearStage();
    else return;
    this.core.drew();
  }

  /** `switched`: another pair than the one shown (or a version shown alone before): the picture animates to it. */
  private paintDiff(D: DiffRendered, kind: 'single' | 'side', view: DiffView, dim: boolean, pair: string, refit: boolean, switched: boolean): void {
    const area = this.area!;
    const main = area.main;
    const keep = refit ? null : main.saveView();
    const animate = switched && kind === 'single' && (this.morph !== null || this.carry !== null);
    if (kind !== 'single') this.carry = null;
    if (kind === 'single') {
      const states = (['before', 'merged', 'after'] as const).map((v) => this.state(D, v, dim));
      if (this.painted.kind !== 'single') this.layout('single');
      this.showStates(states, STATE_OF[view], animate);
      if (!this.o.hostLook) this.panes[0]!.style.background = paneBackground(D.after);
    } else {
      const t = this.core.i18n.t;
      this.morph = null;
      this.layout('side', [
        { side: 'before', title: t('diff.view.before'), sub: this.versionText(this.session.base.peek()) },
        { side: 'after', title: t('diff.view.after'), sub: this.versionText(this.session.head.peek()) },
      ]);
      main.show(this.picture(D, 'before', dim));
      this.second?.canvas.show(this.picture(D, 'after', dim));
      if (!this.o.hostLook) {
        this.panes[0]!.style.background = paneBackground(D.before);
        if (this.panes[1]) this.panes[1].style.background = paneBackground(D.after);
      }
    }
    this.painted = { ...this.painted, kind, D, plain: null, dim, view, pair };
    for (const c of this.canvases()) {
      if (keep && !keep.auto) c.setBounds(D.bounds);
      else c.setBounds(D.bounds, { fit: true, animate });
    }
    this.bounds.set(D.bounds);
    this.applySelection(false);
  }

  /**
   * History mode: one version as it is, the standard viewer picture. Switching from another version (or from a
   * comparison) animates: the items both show move, the others fade in or out.
   */
  private paintPlain(r: Rendered): void {
    const area = this.area!;
    const id = this.session.viewing.peek();
    const v = this.session.versions.peek().find((x) => x.id === id);
    const pair = `v:${id}`;
    const animate = (this.morph !== null || this.carry !== null) && this.painted.pair !== pair;
    const title = this.o.versionTitle === false ? [] : [{ side: 'single', title: v?.id ?? '', sub: [v?.message, v?.author, ago(v?.date, this.core.i18n.locale)].filter(Boolean).join(' · ') }];
    this.layout('plain', title);
    if (!this.o.hostLook) this.panes[0]!.style.background = paneBackground(r);
    this.showStates([this.plainState(r)], 0, animate);
    this.painted = { ...this.painted, kind: 'plain', D: null, plain: r, view: null, pair };
    area.main.setBounds(r.result.bounds, { fit: true, animate });
    this.bounds.set(r.result.bounds);
  }

  /** Shows morph states on the main canvas: a new morph, or the shown one moved to them (animated or not). */
  private showStates(states: MorphState[], i: number, animate: boolean): void {
    const main = this.area!.main;
    const carry = this.carry;
    this.carry = null;
    if (this.morph) this.morph.replace(states, i, animate);
    else {
      this.morph = new Morph(main.defs, main.content, states, i, this.o.reducedMotion);
      main.setMorph(this.morph);
      if (carry && animate && typeof requestAnimationFrame !== 'undefined') transitionFrom(main.defs, main.content, carry);
    }
  }

  /**
   * The picture on the canvas before the scene is pushed (History: a version or the document drawn by its host): the
   * scene's first picture morphs from it and the view glides from where it is to the new fit.
   */
  continueFrom(from: MorphState | null): void {
    this.carry = from && !this.o.reducedMotion() ? from : null;
  }

  /**
   * The badges over each page's top-left corner (`hostLook`), as the host's own page shows its type: the diagram type,
   * and side by side the version of the pane. They move with the page.
   */
  private placeBadges(): void {
    const p = this.painted, D = p.D;
    const type = (D?.after ?? p.plain)?.model.type;
    const t = this.core.i18n.t, key = `type.${type}`, label = t(key);
    this.panes.forEach((pane, i) => {
      const b = pane.querySelector<HTMLElement>(':scope > .dx-page-badges');
      if (!b) return;
      const vp = (i === 0 ? this.area?.main : this.second?.canvas)?.viewport;
      // side by side, each pane shows its own version's page
      const r = p.kind === 'side' && D ? renderedOf(D, i === 0 ? 'before' : 'after').result.bounds : this.bounds.peek();
      b.hidden = !(p.kind && vp && r && type);
      if (b.hidden || !vp || !r || !type) return;
      b.firstElementChild!.textContent = label === key ? type : label;
      const { k, tx, ty } = vp.state;
      const x = Math.round(tx + r.x * k);
      // the version details shorten (ellipsis) rather than run past the pane's edge
      b.style.maxWidth = `${Math.max(120, pane.clientWidth - x - 8)}px`;
      b.style.transform = `translate(${x}px, ${Math.round(ty + r.y * k - (b.offsetHeight || 22) - 6)}px)`;
    });
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
   * a second canvas linked to it. Pane titles name the versions; in the host's look they are badges at the page's corner.
   */
  private layout(kind: Kind, titles: { side: string; title: string; sub: string }[] = []): void {
    const area = this.area!;
    const stage = this.stage!;
    const two = kind === 'side';
    if (!two) this.dropSecond();
    stage.className = `dx-stage ${two ? 'side' : 'single'}${this.o.hostLook ? ' host-look' : ''}`;
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
      for (const old of pane.querySelectorAll(':scope > .pane-title, :scope > .dx-page-badges')) old.remove();
      if (this.o.hostLook) {
        const version = tt ? h('span', { class: 'dx-page-version' }, h('b', null, tt.title), tt.sub ? h('span', null, tt.sub) : null) : null;
        pane.prepend(h('div', { class: 'dx-page-badges', hidden: true, 'aria-hidden': 'true' }, h('span', { class: 'dx-page-badge' }), version));
      } else if (tt) pane.prepend(h('div', { class: 'pane-title' }, h('b', null, tt.title), tt.sub ? h('span', null, tt.sub) : null));
    });
    const main = area.main;
    if (main.svg.parentNode !== this.panes[0]) this.panes[0]!.append(main.svg);
    if (two && !this.second) {
      const canvas = area.createCanvas(this.panes[1]!, { ...this.o.canvas?.(), insets: () => this.insets(1) });
      this.second = { canvas, unlink: main.link(canvas), ink: null };
    }
    this.syncInk();
  }

  /** The pen's strokes in the second canvas too (the main canvas is the pen module's). */
  syncInk(): void {
    const sec = this.second;
    if (!sec) return;
    const store = this.core.strokes.peek();
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
    return this.layers(r, annotate({ view: v, result: r.result, before: D.before.result, changes: D.changes, measure: r.rctx.measure }, { dim }));
  }

  /** One version alone as a morph state: its items keyed like the comparisons' (`kind:id`), no highlights. */
  private plainState(r: Rendered): MorphState {
    return this.layers(r, annotate({ view: 'after', result: r.result, before: r.result, changes: [], measure: r.rctx.measure }, { highlights: false }));
  }

  /** Detached layers of a state; the page pairs across states too (it resizes with the diagram). */
  private layers(r: Rendered, a: ReturnType<typeof annotate>): MorphState {
    const content = document.createElementNS(NS, 'g');
    const layer = (cls: string, nodes: Parameters<typeof patchChildren>[1]): SVGGElement => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', cls);
      patchChildren(g, nodes);
      return g;
    };
    const page = layer('page-layer', pageScene(r.result, r.rctx));
    page.setAttribute('data-ck', '~page');
    content.append(page, layer('body-layer', a.body), layer('dx-runs', a.runs), layer('dx-layer', a.overlay));
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
