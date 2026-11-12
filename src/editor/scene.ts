// StoreScene (component architecture §7.3; A10h): the editor's scene source, which owns painting the document. The
// document store → a synchronous render (gestures preview through it; the last one is kept for the geometry and the
// exports), the selection decorations and the overlay painters. Only paints while attached: a change while another
// scene owns the canvas (History) marks it dirty, and it repaints in full when it is back.
import { registeredKinds } from '../core/kinds/registry.js';
import { renderDocumentWith, type Rendered } from '../core/pipeline-core.js';
import { pageScene } from '../core/render/page.js';
import type { SceneNode } from '../core/scene/types.js';
import { itemKey, type ItemRef } from '../core/types.js';
import { BaseScene } from '../view/scene.js';
import type { EditorCore, OverlayPainter } from './core.js';

export class StoreScene extends BaseScene {
  readonly id = 'store';
  /** The last render (null: render again when asked). */
  private rendered: Rendered | null = null;
  /** The overlay painters, lowest order first. */
  private readonly painters: OverlayPainter[] = [];
  /** The drawn picture's item elements by item key, read once per paint (null: read again when asked). */
  private drawn: Map<string, Element[]> | null = null;

  constructor(private readonly core: EditorCore) {
    super();
  }

  /** The last render (scene, geometry, theme), rendering when there is none. */
  get result(): Rendered {
    return this.rendered ?? this.render();
  }

  /** Forgets the last render (what it shows changed: a version shown or closed). */
  forget(): void {
    this.rendered = null;
  }

  /** Renders the shown document (no DOM work). */
  render(): Rendered {
    const c = this.core;
    const v = c.version.peek();
    const doc = v?.doc ?? c.store.doc();
    const model = c.model;
    c.kinds.need(doc.code);
    const edit = c.mode.peek() === 'edit';
    const opts: Parameters<typeof renderDocumentWith>[4] = {};
    if (!edit && !c.display.peek().labels) opts.hideLabels = true;
    opts.theme = c.shownTheme();
    // a version's layers are a view override too (its Layers panel hides and shows them without writing)
    const layers = !edit || v ? c.visibleLayers.peek() : undefined;
    if (layers) opts.visibleLayers = layers;
    if (c.tableView && edit && !v) opts.tableView = [c.tableView];
    const r = renderDocumentWith(registeredKinds(), doc, model, c.ctx, opts);
    this.rendered = { doc, model, tooLarge: false, ...r, diagnostics: [...model.diagnostics, ...r.diagnostics] };
    return this.rendered;
  }

  protected paint(): void {
    this.paintDocument();
  }

  /** Paints the document into the main canvas, its decorations and the overlay. */
  paintDocument(): void {
    const c = this.core;
    // the type's kinds are loading: nothing to draw yet (the canvas is cleared; the kinds' arrival draws and fits)
    const code = c.version.peek()?.doc.code ?? c.code;
    this.drawn = null;
    if (c.kinds.pending(code)) {
      c.kinds.need(code);
      this.rendered = null;
      c.canvas.clear();
      this.bounds.set(null);
      return;
    }
    const r = this.render();
    const res = r.result;
    c.canvas.show({ defs: res.defs, page: pageScene(res, r.rctx), body: res.body });
    this.bounds.set(res.bounds);
    this.decorate();
    this.paintOverlay();
    c.fire('draw');
  }

  /** The drawn picture's marks only (the selection changed; the picture itself does not depend on it, P4). */
  decorateSelection(): void {
    if (this.attached && this.core.dom.body.childElementCount) this.decorate();
  }

  /** Marks multi-selected items and the inline-edited item on the scene (classes only). */
  private decorate(): void {
    const c = this.core;
    const body = c.dom.body;
    for (const n of Array.from(body.querySelectorAll('.selected, .text-editing'))) n.classList.remove('selected', 'text-editing');
    // one pass over the scene, however many items are selected
    const marks = new Map<string, string[]>();
    const mark = (r: ItemRef, cls: string): void => {
      const k = itemKey(r);
      marks.set(k, [...(marks.get(k) ?? []), cls]);
    };
    const sel = c.selection();
    if (sel.length > 1) for (const r of sel) mark(r, 'selected');
    if (c.inlineEditing) mark(c.inlineEditing, 'text-editing');
    if (marks.size) {
      const drawn = this.drawnItems();
      for (const [k, cls] of marks) for (const n of drawn.get(k) ?? []) n.classList.add(...cls);
    }
    c.dom.root.classList.toggle('group-edit', !!c.enteredGroup.peek() && c.mode.peek() === 'edit');
  }

  /**
   * The drawn picture's item elements (`.el[data-kind][data-id]`: an item's main element and its parts, in document order) by item key (`kind:id`): read once per paint of this scene, and afresh while another scene owns the canvas.
   */
  drawnItems(): ReadonlyMap<string, readonly Element[]> {
    if (this.drawn && this.attached) return this.drawn;
    const m = new Map<string, Element[]>();
    for (const n of Array.from(this.core.dom.body.querySelectorAll('.el[data-kind][data-id]'))) {
      const k = `${n.getAttribute('data-kind')}:${n.getAttribute('data-id')}`;
      const list = m.get(k);
      if (list) list.push(n);
      else m.set(k, [n]);
    }
    if (this.attached) this.drawn = m;
    return m;
  }

  /** Adds an overlay painter (again: nothing); returns its removal. */
  addPainter(p: OverlayPainter): () => void {
    if (!this.painters.includes(p)) {
      this.painters.push(p);
      this.painters.sort((a, b) => a.order - b.order);
    }
    return () => {
      const i = this.painters.indexOf(p);
      if (i >= 0) this.painters.splice(i, 1);
    };
  }

  /** Repaints the overlay layer (handles, dots, marquee) from the current geometry. */
  paintOverlay(): void {
    const c = this.core;
    const k = c.viewport.state.k;
    const nodes: SceneNode[] = [];
    const exclusive = this.painters.filter((p) => p.exclusive?.());
    if (c.mode.peek() === 'edit' && !c.inlineEditing)
      for (const p of exclusive.length ? exclusive : this.painters) {
        try {
          nodes.push(...p.paint(k));
        } catch (e) {
          // a broken painter must not take the canvas down
          console.error(`[mmdx] overlay painter ${p.id}`, e);
        }
      }
    if (c.scene === this) c.canvas.setOverlay(nodes);
    c.fire('overlay');
  }
}
