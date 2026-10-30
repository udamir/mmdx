// EditorCore: the shared state and services of one <mmdx-editor> instance. It replaces the prototype's global `S`
// and the free functions of app.js that everything called (draw, drawOverlay, commit, toast, ensure / getM / tidy,
// selection helpers). Feature modules (canvas gestures, panels, toolbars) are installed on it and talk to each other
// only through it: its signals, its events, and its registries for gestures, overlay painters and shortcuts.
import type { StorageAdapter } from '../adapters/storage.js';
import type { CoreContext } from '../core/context.js';
import { KIND_TO_COLL, type DiagramMeta, type ItemMeta } from '../core/meta/types.js';
import type { DiagramModel } from '../core/model.js';
import { remapSequenceMeta } from '../core/ops/remap.js';
import { counterpartTheme } from '../core/theme/pairs.js';
import { BASELINE, canonicalId } from '../core/theme/registry.js';
import { currentPreset, type StyleEnv } from '../core/ops/style-env.js';
import { renderDocument, type Rendered } from '../core/pipeline.js';
import { pageScene } from '../core/render/index.js';
import type { BoxGeom, GeometryIndex } from '../core/render/types.js';
import type { SceneNode } from '../core/scene/types.js';
import type { ItemKind, ItemRef, Rect } from '../core/types.js';
import { itemKey } from '../core/types.js';
import { patchChildren } from '../dom/patch.js';
import type { Viewport } from '../dom/viewport.js';
import type { Dialogs } from '../ui/dialog.js';
import type { I18n } from '../ui/i18n.js';
import type { PopoverManager, Toaster } from '../ui/popover.js';
import type { ShortcutRegistry } from '../ui/shortcuts.js';
import { signal, type Signal } from '../ui/signal.js';
import type { DocStore } from './store.js';

export type Mode = 'edit' | 'view';
export type Tool = 'pointer' | 'hand' | 'pen' | 'shapes' | 'paint';

/** Feature flags (§8.2 `features`): every group of Appendix A rows can be turned off; all on by default. */
export interface EditorFeatures {
  codePanel: boolean;
  metadataTab: boolean;
  properties: boolean;
  layers: boolean;
  pen: boolean;
  copyStyle: boolean;
  styleToolbar: boolean;
  pageToolbar: boolean;
  autoLayout: boolean;
  plainMermaid: boolean;
  open: boolean;
  themePicker: boolean;
  export: boolean;
  exportFormats: readonly ('mmdx' | 'mmd' | 'svg' | 'png')[];
  help: boolean;
  fullscreen: boolean;
}

export const DEFAULT_FEATURES: EditorFeatures = {
  codePanel: true, metadataTab: true, properties: true, layers: true, pen: true, copyStyle: true, styleToolbar: true,
  pageToolbar: true, autoLayout: true, plainMermaid: true, open: false, themePicker: true, export: true,
  exportFormats: ['mmdx', 'mmd', 'svg', 'png'], help: true, fullscreen: true,
};

/** A selected item; `foot` marks the mirrored copy of a participant at the bottom of a sequence diagram. */
export interface Sel extends ItemRef {
  foot?: boolean;
}

/**
 * One pointer gesture (the prototype's `drag` objects): created on pointerdown by a GestureSource, then fed
 * diagram-space deltas until the pointer is released or the gesture is cancelled (Esc, lost capture).
 */
export interface Gesture {
  /** dx / dy in diagram units from the pointerdown point. */
  move(dx: number, dy: number, ev: PointerEvent): void;
  /** Called on release when the pointer moved (beyond the 3 px threshold). Commit here. */
  end?(ev: PointerEvent): void;
  /** Called on release without movement, or on cancel. Roll back here. */
  cancel?(): void;
  /** Called on release without movement (a click). */
  click?(ev: PointerEvent): void;
  /** Movement threshold in screen px before move() starts (default 3; 0 = immediately). */
  threshold?: number;
  /** Label for the history step when the core commits for the gesture (default: the gesture commits itself). */
  label?: string;
}

/** What is under the pointer: the closest scene item and/or overlay handle. */
export interface Hit {
  /** Item element under the pointer (`.el[data-kind]`), if any. */
  el: Element | null;
  item: Sel | null;
  /** `data-part` of the item element (`label` for connector labels…). */
  part: string | null;
  /** Overlay handle element (`[data-handle]`), if any. */
  handle: Element | null;
  /** Diagram coordinates of the pointer. */
  p: { x: number; y: number };
}

export interface GestureSource {
  id: string;
  /** Higher runs first (handles > items > background). */
  priority: number;
  /** Returns a gesture to start, or null to let the next source try. */
  down(ev: PointerEvent, hit: Hit): Gesture | null;
}

/** Paints part of the overlay (handles, highlights, marquee) from the current geometry. */
export interface OverlayPainter {
  id: string;
  /** Lower paints first (underneath). */
  order: number;
  paint(k: number): SceneNode[];
  /** While true, only exclusive painters paint (a link or process preview hides selection boxes and handles). */
  exclusive?(): boolean;
}

/**
 * Named actions that feature modules provide to each other (the prototype's free functions that every part called).
 * A module registers the ones it owns in install(); callers use `core.run(name, …)`, which is a no-op (returns
 * undefined) when the providing module is not installed (e.g. turned off through `features`).
 */
export interface EditorActions {
  // canvas: selection and structure
  selectAll(): void;
  deleteSelection(): void;
  groupSelection(): void | Promise<void>;
  ungroupSelection(): void;
  copySelection(): void;
  pasteAt(at?: { x: number; y: number }): void;
  duplicateSelection(): void;
  arrange(op: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdist' | 'vdist'): void;
  enterGroup(gid: string): void;
  exitGroup(): void;
  /** ER: edit a table's attributes in place (table view); null leaves it. */
  editTable(id: string | null): void;
  inlineEdit(item: Sel): boolean;
  moveSelection(dir: -1 | 1): void;
  unlockAll(): void;
  applyActivation(): void;
  copyStyle(): void;
  pasteStyle(target: Sel): boolean;
  setPainting(on: boolean): void;
  addShape(kind: string, opts?: { preset?: string; at?: { x: number; y: number } }): void;
  /** Shapes menu of the tool dock (ER: the table presets); `anchor` = the dock button it flies out of. */
  toggleShapesMenu(anchor?: HTMLElement): void;
  /** Two selected messages → can they become a process ("Show as process", properties panel)? null = not applicable. */
  activationInfo(): { participant?: string; removed?: boolean; reason?: string } | null;
  // panels and chrome
  fitView(): void;
  /** Opens the code panel at a real (1-based) line of the Mermaid code (clears a code filter that hides it). */
  gotoCodeLine(line: number): void;
  /** Opens the Metadata tab at a (1-based) line of the metadata text. */
  gotoMetaLine(line: number): void;
  setPanel(name: 'code' | 'properties' | 'layers', open: boolean): void;
  toggleHelp(on?: boolean): void;
  exportAs(kind: 'mmdx' | 'mmd' | 'svg' | 'png'): Promise<void>;
  setTheme(id: string): void;
  openFiles(files: FileList | File[]): Promise<void>;
  autoLayout(): void;
  plainMermaid(): Promise<void>;
  refreshToolbar(): void;
}

export type CoreEvent = 'draw' | 'selection' | 'panels' | 'mode' | 'tool' | 'view' | 'model' | 'theme' | 'overlay';

export interface CoreDom {
  shadow: ShadowRoot;
  /** The editor's root element inside the shadow root. */
  root: HTMLElement;
  /** Canvas wrapper (positioning context for floating toolbars, menus, inline editors). */
  wrap: HTMLElement;
  svg: SVGSVGElement;
  defs: SVGDefsElement;
  /** Viewport group (pan / zoom transform). */
  vp: SVGGElement;
  page: SVGGElement;
  body: SVGGElement;
  overlay: SVGGElement;
}

export interface CoreServices {
  store: DocStore;
  ctx: CoreContext;
  i18n: I18n;
  storage: StorageAdapter;
  features: EditorFeatures;
  dom: CoreDom;
  viewport: Viewport;
  dialogs: Dialogs;
  toaster: Toaster;
  popovers: PopoverManager;
  shortcuts: ShortcutRegistry;
  /** Dispatches a DOM event from the host element (`ds-*`). Returns false when a cancelable event was prevented. */
  emit(type: string, detail: unknown, cancelable?: boolean): boolean;
}

export class EditorCore implements CoreServices {
  readonly store: DocStore;
  readonly ctx: CoreContext;
  readonly i18n: I18n;
  readonly storage: StorageAdapter;
  readonly features: EditorFeatures;
  readonly dom: CoreDom;
  readonly viewport: Viewport;
  readonly dialogs: Dialogs;
  readonly toaster: Toaster;
  readonly popovers: PopoverManager;
  readonly shortcuts: ShortcutRegistry;
  readonly emit: CoreServices['emit'];

  // ---- UI state (never saved into the document) -------------------------------------------------------------------
  readonly mode: Signal<Mode> = signal<Mode>('edit');
  readonly tool: Signal<Tool> = signal<Tool>('pointer');
  readonly enteredGroup: Signal<string | null> = signal<string | null>(null);
  readonly pageSelected: Signal<boolean> = signal(false);
  readonly panels = signal({ code: true, properties: true, layers: true });
  readonly codeFilter = signal('');
  readonly display = signal({ labels: true, hoverHighlight: true });
  /** The chrome's light / dark scheme. The diagram is shown in the counterpart of its theme that matches it. */
  readonly scheme: Signal<'light' | 'dark'> = signal<'light' | 'dark'>('light');
  /** Problems in the Mermaid code and the metadata (code panel → canvas issue bar, badge on the Code tool). */
  readonly issueCount = signal(0);
  /** Base name for exports (no extension); files opened through `openFiles` set it. */
  fileName = 'diagram';
  /** Session snap grid in diagram px (0 = off). Alt while dragging = free. */
  snap = 5;
  /** Primary selected item's `foot` flag (participant copy at the bottom). */
  foot = false;
  /** An inline text editor is open over this item: no handles around it. */
  inlineEditing: ItemRef | null = null;
  /** ER table whose attributes are being edited: drawn as a table with an empty row for a new attribute. */
  tableView: string | null = null;
  /** Item under the pointer (connection dots on hover). */
  hover: Sel | null = null;
  /** A gesture is running. */
  dragging = false;
  /** Space is held: drag pans. */
  spaceDown = false;
  /** Last pointer position (client coordinates), for paste-at-pointer and menus. */
  pointer: { clientX: number; clientY: number } | null = null;

  private readonly actionMap = new Map<keyof EditorActions, (...args: never[]) => unknown>();
  private rendered: Rendered | null = null;
  private readonly gestures: GestureSource[] = [];
  private readonly painters: OverlayPainter[] = [];
  private readonly listeners = new Map<CoreEvent, Set<() => void>>();
  private drawQueued = 0;

  constructor(s: CoreServices) {
    this.store = s.store;
    this.ctx = s.ctx;
    this.i18n = s.i18n;
    this.storage = s.storage;
    this.features = s.features;
    this.dom = s.dom;
    this.viewport = s.viewport;
    this.dialogs = s.dialogs;
    this.toaster = s.toaster;
    this.popovers = s.popovers;
    this.shortcuts = s.shortcuts;
    this.emit = s.emit;
  }

  // ---- events -----------------------------------------------------------------------------------------------------

  on(ev: CoreEvent, cb: () => void): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(cb);
    return () => set.delete(cb);
  }

  fire(ev: CoreEvent): void {
    for (const cb of [...(this.listeners.get(ev) ?? [])]) cb();
  }

  // ---- actions ----------------------------------------------------------------------------------------------------

  provide<K extends keyof EditorActions>(name: K, f: EditorActions[K]): () => void {
    this.actionMap.set(name, f as (...args: never[]) => unknown);
    return () => {
      if (this.actionMap.get(name) === (f as unknown)) this.actionMap.delete(name);
    };
  }

  has(name: keyof EditorActions): boolean {
    return this.actionMap.has(name);
  }

  run<K extends keyof EditorActions>(name: K, ...args: Parameters<EditorActions[K]>): ReturnType<EditorActions[K]> | undefined {
    const f = this.actionMap.get(name) as ((...a: Parameters<EditorActions[K]>) => ReturnType<EditorActions[K]>) | undefined;
    return f ? f(...args) : undefined;
  }

  // ---- document access --------------------------------------------------------------------------------------------

  get model(): DiagramModel {
    return this.store.model.peek();
  }

  get meta(): DiagramMeta {
    return this.store.meta.peek();
  }

  get code(): string {
    return this.store.code.peek();
  }

  /** The last render (scene, geometry, theme). */
  get result(): Rendered {
    return this.rendered ?? this.render();
  }

  get geom(): GeometryIndex {
    return this.result.result.geom;
  }

  /** Item metadata, or an empty object (never stored). */
  getM(kind: ItemKind, id: string): ItemMeta {
    return (this.meta[KIND_TO_COLL[kind]]?.[id] as ItemMeta | undefined) ?? {};
  }

  /** Item metadata, created when missing (mutate it inside a transaction). */
  ensure(kind: ItemKind, id: string): ItemMeta {
    const coll = KIND_TO_COLL[kind];
    const c = (this.meta[coll] ??= {}) as Record<string, ItemMeta>;
    return (c[id] ??= {});
  }

  /** Drops an item's metadata entry when it became empty. */
  tidy(kind: ItemKind, id: string): void {
    const c = this.meta[KIND_TO_COLL[kind]] as Record<string, ItemMeta> | undefined;
    if (c && c[id] && !Object.keys(c[id]).length) delete c[id];
  }

  /** Snaps a coordinate to the session grid unless Alt is held. */
  snapV(v: number, ev?: { altKey?: boolean } | null): number {
    return ev?.altKey || !this.snap ? Math.round(v) : Math.round(v / this.snap) * this.snap;
  }

  // ---- selection --------------------------------------------------------------------------------------------------

  selection(): Sel[] {
    const sel = this.store.selection.peek();
    return sel.map((r, i) => (i === 0 && this.foot && r.kind === 'participant' ? { ...r, foot: true } : r));
  }

  /** The single selected item (null when nothing or several are selected). */
  primary(): Sel | null {
    const s = this.selection();
    return s.length === 1 ? s[0]! : null;
  }

  isSelected(r: ItemRef): boolean {
    return this.store.selection.peek().some((x) => x.kind === r.kind && x.id === r.id);
  }

  select(items: readonly Sel[]): void {
    const seen = new Set<string>();
    const list: ItemRef[] = [];
    for (const it of items) {
      const k = itemKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ kind: it.kind, id: it.id });
    }
    this.foot = !!items[0]?.foot;
    if (list.length) this.pageSelected.set(false);
    this.store.selection.set(list);
    this.fire('selection');
    this.drawOverlay();
    this.emit('ds-selection', { items: list });
  }

  toggleSelected(it: Sel): void {
    const cur = this.selection();
    const i = cur.findIndex((x) => x.kind === it.kind && x.id === it.id);
    if (i >= 0) {
      cur.splice(i, 1);
      this.select(cur);
    } else this.select([it, ...cur]);
  }

  /** Geometry box of an item (participant foot when asked), or null. */
  boxOf(it: Sel | null): (BoxGeom & { hidden?: boolean }) | null {
    const g = this.geom;
    if (!it) return null;
    if (g.type === 'flowchart') return it.kind === 'node' ? g.nodes.get(it.id) ?? null : it.kind === 'group' ? g.groups.get(it.id) ?? null : null;
    if (g.type === 'er') return it.kind === 'entity' ? g.entities.get(it.id) ?? null : null;
    if (g.type === 'sequence') {
      if (it.kind === 'participant') return (it.foot ? g.participantFeet.get(it.id) : null) ?? g.participants.get(it.id) ?? null;
      if (it.kind === 'box') return g.boxes.get(it.id) ?? null;
      if (it.kind === 'block') return g.blocks.get(it.id) ?? null;
      if (it.kind === 'note') return g.notes.get(it.id) ?? null;
      if (it.kind === 'activation') {
        const a = g.activations.get(it.id);
        return a ? { x: a.x, y: (a.y0 + a.y1) / 2, w: a.w, h: a.y1 - a.y0 } : null;
      }
    }
    return null;
  }

  /** The diagram's own theme (`canvas.theme`), or baseline when it names none or one that is not registered. */
  documentTheme(): string {
    const id = canonicalId(typeof this.meta.canvas.theme === 'string' ? this.meta.canvas.theme : null);
    return this.ctx.themes.has(id) ? id : BASELINE;
  }

  /** The theme the diagram is drawn with: its own theme, or that theme's counterpart for the current UI scheme. */
  shownTheme(): string {
    return counterpartTheme(this.ctx.themes, this.documentTheme(), this.scheme.peek());
  }

  // ---- rendering --------------------------------------------------------------------------------------------------

  /** Renders the current document (no DOM work). */
  render(): Rendered {
    const doc = this.store.doc();
    const model = this.model;
    const opts: Parameters<typeof renderDocument>[3] = {};
    if (this.mode.peek() === 'view' && !this.display.peek().labels) opts.hideLabels = true;
    opts.theme = this.shownTheme();
    if (this.tableView && this.mode.peek() === 'edit') opts.tableView = [this.tableView];
    const r = renderDocument(doc, model, this.ctx, opts);
    this.rendered = { doc, model, tooLarge: false, ...r, diagnostics: [...model.diagnostics, ...r.diagnostics] };
    return this.rendered;
  }

  /** Re-renders and patches the scene, then the overlay. Synchronous (gestures preview through it). */
  draw(): void {
    if (this.drawQueued) {
      cancelAnimationFrame(this.drawQueued);
      this.drawQueued = 0;
    }
    const r = this.render();
    const res = r.result;
    patchChildren(this.dom.defs, res.defs);
    patchChildren(this.dom.page, pageScene(res, r.rctx));
    patchChildren(this.dom.body, res.body);
    this.decorate();
    this.drawOverlay();
    this.fire('draw');
  }

  /** Draws on the next animation frame (coalesces bursts, e.g. typing). */
  drawSoon(): void {
    if (this.drawQueued) return;
    this.drawQueued = requestAnimationFrame(() => {
      this.drawQueued = 0;
      this.draw();
    });
  }

  /** Marks multi-selected items and the inline-edited item on the scene (classes only). */
  private decorate(): void {
    const body = this.dom.body;
    for (const n of Array.from(body.querySelectorAll('.selected, .text-editing'))) n.classList.remove('selected', 'text-editing');
    const mark = (r: ItemRef, cls: string): void => {
      for (const n of Array.from(body.querySelectorAll('.el[data-id]')))
        if (n.getAttribute('data-id') === r.id && n.getAttribute('data-kind') === r.kind) n.classList.add(cls);
    };
    const sel = this.selection();
    if (sel.length > 1) for (const r of sel) mark(r, 'selected');
    if (this.inlineEditing) mark(this.inlineEditing, 'text-editing');
    this.dom.root.classList.toggle('group-edit', !!this.enteredGroup.peek() && this.mode.peek() === 'edit');
  }

  addOverlay(p: OverlayPainter): () => void {
    this.painters.push(p);
    this.painters.sort((a, b) => a.order - b.order);
    return () => {
      const i = this.painters.indexOf(p);
      if (i >= 0) this.painters.splice(i, 1);
    };
  }

  /** Repaints the overlay layer (handles, dots, marquee) from the current geometry. */
  drawOverlay(): void {
    const k = this.viewport.state.k;
    const nodes: SceneNode[] = [];
    const exclusive = this.painters.filter((p) => p.exclusive?.());
    if (this.mode.peek() === 'edit' && !this.inlineEditing)
      for (const p of exclusive.length ? exclusive : this.painters) {
        try {
          nodes.push(...p.paint(k));
        } catch (e) {
          // a broken painter must not take the canvas down
          console.error(`[mmdx] overlay painter ${p.id}`, e);
        }
      }
    patchChildren(this.dom.overlay, nodes);
    this.fire('overlay');
  }

  // ---- gestures ---------------------------------------------------------------------------------------------------

  addGestureSource(s: GestureSource): () => void {
    this.gestures.push(s);
    this.gestures.sort((a, b) => b.priority - a.priority);
    return () => {
      const i = this.gestures.indexOf(s);
      if (i >= 0) this.gestures.splice(i, 1);
    };
  }

  /** Runs the gesture sources in priority order; the first that returns a gesture wins. */
  startGesture(ev: PointerEvent, hit: Hit): Gesture | null {
    for (const s of this.gestures) {
      const g = s.down(ev, hit);
      if (g) return g;
    }
    return null;
  }

  /** Builds a Hit from an event target. */
  hitTest(ev: { target: EventTarget | null; clientX: number; clientY: number }): Hit {
    const t = ev.target instanceof Element ? ev.target : null;
    const handle = t?.closest('[data-handle]') ?? null;
    const el = t?.closest('.el[data-kind]') ?? null;
    const item: Sel | null = el ? { kind: el.getAttribute('data-kind') as ItemKind, id: el.getAttribute('data-id') ?? '' } : null;
    if (item && el?.hasAttribute('data-foot')) item.foot = true;
    return { el, item, part: el?.getAttribute('data-part') ?? null, handle, p: this.toDiagram(ev) };
  }

  /** Client point → canvas-local px. */
  toLocal(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.dom.svg.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  /** Client point → diagram coordinates. */
  toDiagram(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    return this.viewport.toDiagram(ev.clientX, ev.clientY);
  }

  /** Diagram point → canvas-local px. */
  toScreen(p: { x: number; y: number }): { x: number; y: number } {
    const v = this.viewport.state;
    return { x: p.x * v.k + v.tx, y: p.y * v.k + v.ty };
  }

  /** A diagram-space rect on screen (canvas-local px). */
  rectOnScreen(b: Rect): Rect {
    const a = this.toScreen({ x: b.x, y: b.y });
    const k = this.viewport.state.k;
    return { x: a.x, y: a.y, w: b.w * k, h: b.h * k };
  }

  // ---- changes ----------------------------------------------------------------------------------------------------

  /**
   * Applies a code rewrite from an op (`edit.js` / `connect.js` results). Remaps positional sequence metadata, keeps
   * the selection where items survive, fires the cancelable `ds-op` event, commits one history step. Returns false
   * when nothing changed or the host vetoed the op.
   */
  applyCode(res: { code?: string | null; meta?: DiagramMeta } | null | undefined, label: string, opts: { select?: Sel[] | null } = {}): boolean {
    if (!res || res.code == null || (res.code === this.code && !res.meta)) return false;
    if (!this.emit('ds-op', { type: label, code: res.code }, true)) return false;
    const oldModel = this.model, oldCode = this.code;
    this.store.begin();
    try {
      if (res.meta) this.store.meta.set(res.meta);
      this.store.code.set(res.code);
      const model = this.model;
      // ops that return metadata have already carried it over to the new positional ids
      if (!res.meta && model.type === 'sequence' && oldModel.type === 'sequence')
        this.store.meta.set(remapSequenceMeta(this.meta, oldModel, oldCode, model, res.code));
      const keep = (r: Sel): boolean => this.store.exists(r);
      if (opts.select !== undefined) this.select((opts.select ?? []).filter(keep));
      else this.select(this.selection().filter(keep));
    } finally {
      this.store.commit(label);
    }
    this.afterChange();
    return true;
  }

  /**
   * Runs a metadata-only change as one history step (styles, positions): `f` mutates `this.meta` in place.
   * Fires `ds-op`; a veto rolls the change back.
   */
  change(label: string, f: () => void): void {
    this.store.begin();
    try {
      f();
    } catch (e) {
      this.store.rollback();
      throw e;
    }
    if (!this.emit('ds-op', { type: label }, true)) {
      this.store.rollback();
      this.draw();
      return;
    }
    this.store.commit(label);
    this.afterChange();
  }

  /** Starts a gesture transaction (live preview through draw(); commit or roll back at the end). */
  begin(): void {
    this.store.begin();
  }

  commit(label: string): void {
    if (!this.store.inTransaction) return;
    if (!this.emit('ds-op', { type: label }, true)) {
      this.rollback();
      return;
    }
    this.store.commit(label);
    this.afterChange();
  }

  rollback(): void {
    this.store.rollback();
    this.afterChange();
  }

  /** Redraw + panels after a committed change. */
  afterChange(): void {
    this.draw();
    this.fire('panels');
  }

  toast(msg: string, opts: { error?: boolean } = {}): void {
    this.toaster.show(msg, opts);
  }

  setMode(m: Mode): void {
    if (this.mode.peek() === m) return;
    this.mode.set(m);
    this.tool.set(m === 'edit' ? 'pointer' : 'hand');
    if (m === 'view') {
      this.select([]);
      this.enteredGroup.set(null);
      this.pageSelected.set(false);
    }
    this.fire('mode');
    this.draw();
    this.fire('panels');
  }

  setTool(t: Tool): void {
    if (this.tool.peek() === t) return;
    this.tool.set(t);
    this.fire('tool');
    this.drawOverlay();
  }

  // ---- group editing (Miro-like) ------------------------------------------------------------------------------------

  parentOf(it: ItemRef): string | null {
    const M = this.model;
    if (M.type !== 'flowchart') return null;
    return (it.kind === 'node' ? M.nodes.get(it.id)?.parent : it.kind === 'group' ? M.groups.get(it.id)?.parent : null) ?? null;
  }

  /** The outermost group around an item that a click selects (stops at lanes, locked groups and the entered group). */
  groupTarget(it: ItemRef, isLane: (gid: string) => boolean): string | null {
    const M = this.model;
    if (M.type !== 'flowchart' || (it.kind !== 'node' && it.kind !== 'group')) return null;
    let best: string | null = null;
    for (let g = this.parentOf(it), guard = 0; g && guard < 64; g = M.groups.get(g)?.parent ?? null, guard++) {
      if (g === this.enteredGroup.peek() || isLane(g)) break;
      if (!this.getM('group', g).locked) best = g;
    }
    return best;
  }

  insideGroup(it: ItemRef, gid: string): boolean {
    if (it.kind === 'group' && it.id === gid) return true;
    const M = this.model;
    if (M.type !== 'flowchart') return false;
    for (let g = this.parentOf(it), guard = 0; g && guard < 64; g = M.groups.get(g)?.parent ?? null, guard++) if (g === gid) return true;
    return false;
  }

  groupDescendants(gid: string): { nodes: string[]; groups: string[] } {
    const M = this.model;
    const nodes: string[] = [], groups: string[] = [];
    if (M.type !== 'flowchart') return { nodes, groups };
    const stack = [gid];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const c of M.groups.get(id)?.children ?? []) {
        if (M.groups.has(c)) {
          groups.push(c);
          stack.push(c);
        } else if (M.nodes.has(c)) nodes.push(c);
      }
    }
    return { nodes, groups };
  }

  /** The diagram has no items yet (empty-canvas hint). */
  isEmptyDiagram(): boolean {
    const M = this.model;
    if (M.type === 'flowchart') return !M.nodes.size;
    if (M.type === 'sequence') return !M.participants.length;
    if (M.type === 'er') return !M.entities.size;
    return false;
  }

  // ---- style environment (canvas module, additive) -----------------------------------------------------------------

  /** Model, metadata and theme of the current render, for the style ops (`src/core/ops/style-env.ts`). */
  styleEnv(): StyleEnv {
    const r = this.result;
    return { model: this.model, meta: this.meta, theme: r.theme, color: (v: unknown) => r.rctx.color(v) };
  }

  /** A swim-lane group (preset `lane`): never selected by clicks inside it, by the marquee or by ⌘A. */
  isLane(gid: string): boolean {
    return this.model.type === 'flowchart' && currentPreset(this.styleEnv(), { kind: 'group', id: gid }) === 'lane';
  }
}
