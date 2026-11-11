// EditorCore: the shared state and services of one <mmdx-editor> instance. It replaces the prototype's global `S`
// and the free functions of app.js that everything called (draw, drawOverlay, commit, toast, ensure / getM / tidy,
// selection helpers). Feature modules (canvas gestures, panels, toolbars) are installed on it and talk to each other
// only through it: its signals, its events, and its registries for gestures, overlay painters and shortcuts.
//
// Component architecture §4.1: EditorCore extends the view kernel (ViewCore) — services, theme, chrome scheme,
// shell, module host and canvas come from it — and adds the document store, the selection, gestures and overlay
// painters. What the canvas shows is the StoreScene (src/editor/scene.ts); `draw()` invalidates it.
import type { ImageStore, StorageAdapter, ThemeSource } from '../ports.js';
import { UiState } from './services/ui-state.js';
import { SelectionService } from './services/selection.js';
import { InputService } from './services/input.js';
import { KindLoader } from './services/kind-loader.js';
import { VersionSource, type VersionView } from './services/version-source.js';
import { HostServices } from './services/host-services.js';
import { groupDescendants, groupTarget, insideGroup, parentOf } from './services/group-tree.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import { KIND_TO_COLL, type DiagramMeta, type ItemMeta } from '../core/meta/types.js';
import type { DiagramModel } from '../core/model.js';
import { own, ownOr } from '../core/own.js';
import { opsKind, withOps } from '../core/kinds/registry.js';
import { detectType } from '../core/parse/dispatch.js';
import { editorHasKind, loadEditorKind } from './kinds/loader.js';
import type { DiagramType } from '../core/types.js';
import type { ClipboardData } from '../core/ops/clipboard.js';
import { remapMeta } from '../core/ops/document.js';
import { currentPreset, type StyleEnv } from '../core/ops/style-env.js';
import type { Rendered } from '../core/pipeline-core.js';
import type { BoxGeom, GeometryIndex } from '../core/render/types.js';
import type { SceneNode } from '../core/scene/types.js';
import type { ItemKind, ItemRef, Rect } from '../core/types.js';
import type { TextFormat, TextFormats } from './ops/format.js';
import { HIGHLIGHT_CSS } from '../dom/highlight.js';
import type { Viewport, WheelMode } from '../dom/viewport.js';
import { Dialogs, DIALOG_CSS } from '../ui/kit/dialog.js';
import { signal, type ReadSignal, type Signal } from '../reactive/signal.js';
import { ALIASES } from '../ui/kit/base.js';
import { EDITOR_CSS } from './styles.js';
import { ViewCore } from '../view/core.js';
import type { Mode, Tool, ViewActions, ViewEvents } from '../view/types.js';
import { StoreScene } from './scene.js';
import type { ChangeReason, DocStore } from './store.js';

export type { Mode, Tool, VersionView };

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
  /** The light / dark toggle in the view bar; off when the host controls the scheme (`ui`). */
  schemeToggle: boolean;
  export: boolean;
  exportFormats: readonly ('mmdx' | 'mmd' | 'svg' | 'png')[];
  help: boolean;
  fullscreen: boolean;
  /** The History button (shown when the editor has a `history`). */
  history: boolean;
}

export const DEFAULT_FEATURES: EditorFeatures = {
  codePanel: true, metadataTab: true, properties: true, layers: true, pen: true, copyStyle: true, styleToolbar: true,
  pageToolbar: true, autoLayout: true, plainMermaid: true, open: false, themePicker: true, schemeToggle: true, export: true,
  exportFormats: ['mmdx', 'mmd', 'svg', 'png'], help: true, fullscreen: true, history: true,
};

/** What the inline text editor offers the toolbar: its selection's formats, and formatting it. */
export interface TextEditSession {
  /** The label can be rich (a markdown string): its words can be bold, italic, underlined and struck. */
  readonly rich: boolean;
  /** Part of the text is selected: formats act on it, and what styles only a whole label is off. */
  partial(): boolean;
  /** The formats of the selected words, or of the whole text when nothing is selected. */
  formats(): TextFormats;
  /** Toggles a format on the selected words, or on the whole text when nothing is selected. */
  format(f: TextFormat): void;
}

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
  ungroupSelection(): void | Promise<void>;
  /** "Reset positions in this group" (T07): forgets the hand-placed positions inside the selected group. */
  resetGroupPositions(): void;
  copySelection(): void;
  pasteAt(at?: { x: number; y: number }): void;
  duplicateSelection(): void;
  arrange(op: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdist' | 'vdist'): void;
  enterGroup(gid: string): void;
  exitGroup(): void;
  inlineEdit(item: Sel): boolean;
  moveSelection(dir: -1 | 1): void;
  applyActivation(): void;
  copyStyle(): void;
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
  setPanel(name: PanelName, open: boolean): void;
  /** Opens or closes the History of the document (when the editor has a history); `compare`: on the newest change. */
  toggleHistory(on?: boolean, opts?: { compare?: boolean }): void;
  exportAs(kind: 'mmdx' | 'mmd' | 'svg' | 'png'): Promise<void>;
  setTheme(id: string): void;
  openFiles(files: FileList | File[]): Promise<void>;
  autoLayout(): void;
  plainMermaid(): Promise<void>;
  refreshToolbar(): void;
  // insert dock (T05)
  /** Opens the image tool beside `anchor`: `insert` adds an image item, else it sets the selected item's image; `file` is uploaded at once. */
  /** The image tool, on its Library, Upload, URL or Icon tab (`tab`; default: an icon node's Icon, else the library when the host has one). */
  openImageTool(anchor?: HTMLElement | null, opts?: { insert?: boolean; file?: File; at?: { x: number; y: number }; tab?: 'library' | 'upload' | 'url' | 'icon' }): void;
  /** Opens the emoji picker beside `anchor`; `onPick` inserts the chosen emoji (it stays open), `onClose` when it closes. */
  pickEmoji(anchor: HTMLElement, onPick: (emoji: string) => void, onClose?: () => void): void;
}

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

export interface EditorCoreOptions {
  store: DocStore;
  features: EditorFeatures;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  /** The component's own icon packs, over the shared ones of `configure({ iconPacks })`; read when it is created. */
  iconPacks?: readonly IconPack[];
  themeSource?: ThemeSource;
  ui?: 'light' | 'dark' | 'auto';
  theme?: string;
  themeDark?: string;
  compact?: boolean | 'auto';
  /** What the mouse wheel does on the canvas (default `always`). */
  wheel?: WheelMode;
  /** CSS of the installed modules' that is not in their `css` (adopted after the editor's own). */
  css?: readonly string[];
}

/** The editor's own panels (History brings its own while it is open). */
export type PanelName = 'code' | 'properties' | 'layers';
export type EditorPanels = Readonly<Record<PanelName, boolean> & Record<string, boolean>>;

/** The kernel's events plus the editor's own: the mode and the tool, the document's model, the selection, the overlay. */
export interface EditorEvents extends ViewEvents {
  mode: void;
  tool: void;
  model: void;
  selection: void;
  overlay: void;
}

export class EditorCore extends ViewCore<EditorActions & ViewActions, EditorPanels, EditorEvents> {
  readonly store: DocStore;
  readonly features: EditorFeatures;
  readonly dialogs: Dialogs;
  /** The scene that draws the document (the canvas shows it unless History is open). */
  readonly storeScene: StoreScene;

  // ---- UI state (never saved into the document) -------------------------------------------------------------------
  readonly enteredGroup: Signal<string | null> = signal<string | null>(null);
  readonly pageSelected: Signal<boolean> = signal(false);
  readonly codeFilter = signal('');
  /** Problems in the Mermaid code and the metadata (code panel → canvas issue bar, badge on the Code tool). */
  readonly issueCount = signal(0);
  /** What the host gives the editor (A10g): its image store and its upload of pictures. */
  readonly hostServices = new HostServices();
  /**
   * The host's upload of a dropped, pasted or chosen picture (T05 `uploadImage`): resolves to the URL the image item
   * references (the editor never embeds files). Null: images are added by URL only.
   */
  get uploadImage(): ((file: File) => Promise<{ url: string }>) | null {
    return this.hostServices.uploadImage.peek();
  }
  /**
   * The host's image store (`EditorOptions.images`): the image tool's Library tab lists it, and uploads go to it
   * (before `uploadImage`). Null: no library.
   */
  get images(): ImageStore | null {
    return this.hostServices.images.peek();
  }
  /** Where an upload goes: the image store, else the host's `uploadImage` (null: images by URL only). */
  get upload(): ((file: File) => Promise<{ url: string }>) | null {
    return this.hostServices.upload();
  }
  /** Base name for exports (no extension); files opened through `openFiles` set it. */
  get fileName(): string {
    return this.uiState.fileName.peek();
  }
  /** Session snap grid in diagram px (0 = off). Alt while dragging = free. */
  get snap(): number {
    return this.uiState.snap.peek();
  }
  /** The session's UI state (A10f): signals, read through the getters below and written through `uiState.<name>.set`. */
  readonly uiState = new UiState<Sel, TextEditSession, ClipboardData>();
  /** The selection (A10e): the document's and a shown version's. */
  readonly selections: SelectionService = new SelectionService(this);
  /** Primary selected item's `foot` flag (participant copy at the bottom). */
  get foot(): boolean {
    return this.selections.foot;
  }
  /** An inline text editor is open over this item: no handles around it. */
  get inlineEditing(): ItemRef | null {
    return this.uiState.inlineEditing.peek();
  }
  /** The open inline text editor's formatting (the toolbar's text format menu acts on its selection); null: none open. */
  get textEdit(): TextEditSession | null {
    return this.uiState.textEdit.peek();
  }
  /** ER table whose attributes are being edited: drawn as a table with an empty row for a new attribute. */
  get tableView(): string | null {
    return this.uiState.tableView.peek();
  }
  /** Item under the pointer (connection dots on hover). */
  get hover(): Sel | null {
    return this.uiState.hover.peek();
  }
  /** The pointer loop and Space-to-pan (A10c: what it tracks is read here, written only by it). */
  readonly input: InputService<Hit> = new InputService<Hit>(this);
  /** A gesture is running. */
  get dragging(): boolean {
    return this.input.dragging;
  }
  /** Space is held: drag pans. */
  get spaceDown(): boolean {
    return this.input.spaceDown;
  }
  /** Last pointer position (client coordinates), for paste-at-pointer and menus. */
  get pointer(): { clientX: number; clientY: number } | null {
    return this.input.pointer;
  }
  /** Cancels the running pointer gesture, if any. */
  cancelPointer(): void {
    this.input.cancelGesture();
  }
  /** The item clipboard (UI state, never saved): copies carry their content (§9), so History can fill it too. */
  get clipboard(): ClipboardData | null {
    return this.uiState.clipboard.peek();
  }
  /**
   * An old version shown read-only (History, `showVersion`): the getters, the render and the selection read it instead
   * of the store, and nothing writes (changes, transactions, undo are refused) while it shows.
   */
  readonly versions: VersionSource = new VersionSource({
    enteredGroup: this.enteredGroup,
    pageSelected: this.pageSelected,
    visibleLayers: this.visibleLayers,
    setLayers: (ids) => this.visibleLayersState.set(ids),
    stopEditing: () => {
      this.cancelGesture();
      this.uiState.inlineEditing.set(null);
    },
    needKind: (code) => this.kinds.need(code),
    selections: this.selections,
    shown: () => {
      this.storeScene.forget();
      this.draw();
      this.fire('model');
      this.fire('selection');
      this.fire('panels');
    },
  });
  get version(): ReadSignal<VersionView | null> {
    return this.versions.view;
  }
  /** The kinds of the shown diagram types, loaded on demand (A10g; T01). */
  readonly kinds: KindLoader = new KindLoader({
    has: editorHasKind,
    load: loadEditorKind,
    live: () => this.host.isConnected,
    loaded: (fit) => {
      this.draw();
      if (fit && this.scene === this.storeScene && !this.version.peek()) this.viewport.setBounds(this.result.result.bounds, { fit: true });
      this.fire('model');
      this.fire('panels');
    },
    failed: (e) => this.toast(`Could not load the editor for this diagram type: ${e instanceof Error ? e.message : String(e)}`, { error: true }),
  });
  /**
   * The document's diagram type, from its code (known before its kinds load; null: not a diagram the editor knows). A
   * module follows it instead of the `model` event, which does not fire when a kind was loaded before (B42).
   */
  readonly docType: ReadSignal<DiagramType | null>;

  private readonly gestures: GestureSource[] = [];
  /** Applies a drag's move still waiting for its animation frame (the pointer loop's; P1). */
  flushPreview(): void {
    this.input.flushMove();
  }
  private readonly domCache: CoreDom;

  constructor(host: HTMLElement, o: EditorCoreOptions) {
    super(host, {
      product: 'editor',
      css: [ALIASES, DIALOG_CSS, EDITOR_CSS, HIGHLIGHT_CSS, ...(o.css ?? [])],
      root: { class: 'ed mode-edit', role: 'application', roleDescription: 'diagram editor' },
      areaClass: 'canvas-wrap',
      initialMode: 'edit',
      canvas: {
        interaction: 'pan-zoom', wheel: o.wheel ?? 'always', panOnDrag: false, minK: 0.05, maxK: 6, pad: 16, svgClass: 'canvas', part: 'canvas',
        // fit() fills the canvas under the panels, leaving room above the page for its badge
        insets: () => ({ left: 0, right: 0, top: 28, bottom: 0 }),
        pageClass: 'page-layer page-shadow',
        // the kernel fires `view`
        onView: () => this.drawOverlay(),
      },
      feature: (name) => this.featureOn(name),
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
    this.store = o.store;
    this.features = o.features;
    this.docType = this.owner.computed(() => detectType(this.store.code()));
    this.dialogs = new Dialogs(this.shadow, this.i18n.t);
    this.toolState.set('pointer');
    this.panelsState.set({ code: true, properties: true, layers: true });
    const c = this.canvas;
    this.domCache = { shadow: this.shadow, root: this.root, wrap: this.area, svg: c.svg, defs: c.defs, vp: c.vp, page: c.page, body: c.body, overlay: c.overlay };
    this.storeScene = new StoreScene(this);
    this.pushScene(this.storeScene);
    // the document's selection reported once per real change (B11, P5): not on construction, not for the same items
    // again, not while a version is shown (its items are picked to copy them; the net change is reported when it closes)
    this.owner.add(this.selections.watch());
  }

  /** The editor's DOM (the shell's root and canvas area, the main canvas's layers). */
  get dom(): CoreDom {
    return this.domCache;
  }

  /** Pan and zoom of the main canvas. */
  get viewport(): Viewport {
    return this.canvas.viewport!;
  }

  private featureOn(name: string): boolean {
    const f = this.features;
    switch (name) {
      case 'help':
        return f.help;
      case 'fullscreen':
        return f.fullscreen;
      case 'pen':
        return f.pen;
      case 'theme':
        return f.themePicker;
      case 'scheme':
        return f.schemeToggle;
      case 'export':
        return f.export && f.exportFormats.length > 0;
      case 'code':
        return f.codePanel;
      case 'layers':
        return f.layers;
      case 'history':
        return f.history;
      default:
        return true;
    }
  }

  // ---- document access --------------------------------------------------------------------------------------------

  get model(): DiagramModel {
    return this.version.peek()?.model ?? this.store.model.peek();
  }

  get meta(): DiagramMeta {
    return this.version.peek()?.doc.meta ?? this.store.meta.peek();
  }

  get code(): string {
    return this.version.peek()?.doc.code ?? this.store.code.peek();
  }

  /** The full source of what is shown: the version, or the document. */
  shownSource(): string {
    return this.version.peek()?.source ?? this.store.source();
  }

  /**
   * Shows an old version read-only (History) or the document again (null). The document's selection, entered group
   * and layer visibility are kept for when it is back; the view stays where it is.
   */
  showVersion(v: { id: string; source: string } | null): void {
    this.versions.show(v);
  }

  /** The last render (scene, geometry, theme). */
  get result(): Rendered {
    return this.storeScene.result;
  }

  get geom(): GeometryIndex {
    return this.result.result.geom;
  }

  /** Item metadata, or an empty object (never stored). */
  getM(kind: ItemKind, id: string): ItemMeta {
    return own(this.meta[KIND_TO_COLL[kind]] as Record<string, ItemMeta> | undefined, id) ?? {};
  }

  /** Item metadata, created when missing (mutate it inside a transaction). */
  ensure(kind: ItemKind, id: string): ItemMeta {
    const coll = KIND_TO_COLL[kind];
    // own entries only: an item may be called `__proto__` or `toString` (core/own.ts)
    return ownOr((this.meta[coll] ??= {}) as Record<string, ItemMeta>, id, (): ItemMeta => ({}));
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
    return this.selections.list();
  }

  /** The single selected item (null when nothing or several are selected). */
  primary(): Sel | null {
    const s = this.selection();
    return s.length === 1 ? s[0]! : null;
  }

  isSelected(r: ItemRef): boolean {
    return this.selections.has(r);
  }

  select(items: readonly Sel[]): void {
    this.selections.set(items);
  }

  toggleSelected(it: Sel): void {
    this.selections.toggle(it);
  }

  /** The drawn picture's selection marks (the picture itself does not depend on the selection, P4). */
  decorateSelection(): void {
    this.storeScene.decorateSelection();
  }

  /** Geometry box of an item (participant foot when asked), or null. */
  boxOf(it: Sel | null): (BoxGeom & { hidden?: boolean }) | null {
    const g = this.geom;
    if (!it || !g.type) return null;
    return opsKind(g.type)?.box(g, it, true) ?? null;
  }


  // ---- rendering --------------------------------------------------------------------------------------------------

  /** Renders the current document (no DOM work). */
  render(): Rendered {
    return this.storeScene.render();
  }

  /**
   * Re-renders and patches the document, then the overlay. Synchronous (gestures preview through it). While another
   * scene owns the canvas (History), the store scene only becomes dirty and repaints in full when it is back.
   */
  draw(): void {
    this.storeScene.invalidate();
  }

  /** Adds an overlay painter; one added while a module installs is muted while the module is suspended. */
  addOverlay(p: OverlayPainter): () => void {
    let remove = this.storeScene.addPainter(p);
    this.track({ set: (on) => void (on ? (remove = this.storeScene.addPainter(p)) : remove()), dispose: () => remove() });
    return () => remove();
  }

  /** Repaints the overlay layer (handles, dots, marquee) from the current geometry. */
  drawOverlay(): void {
    this.storeScene.paintOverlay();
  }

  // ---- gestures ---------------------------------------------------------------------------------------------------

  /** Adds a gesture source; one added while a module installs is muted while the module is suspended. */
  addGestureSource(s: GestureSource): () => void {
    const add = (): void => {
      if (this.gestures.includes(s)) return;
      this.gestures.push(s);
      this.gestures.sort((a, b) => b.priority - a.priority);
    };
    const remove = (): void => {
      const i = this.gestures.indexOf(s);
      if (i >= 0) this.gestures.splice(i, 1);
    };
    add();
    this.track({ set: (on) => (on ? add() : remove()), dispose: remove });
    return remove;
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
   * Applies a code rewrite from an op (`edit.js` / `connect.js` results) or typed into the code panel. Remaps
   * positional sequence metadata, keeps the selection where items survive, fires the cancelable `mmdx-op` event
   * (`type`, default the label), commits one history step (`reason` of the `mmdx-change`, default `op`). `%%@` lines
   * in the code move into the metadata. Returns false when nothing changed or the host vetoed the op.
   */
  applyCode(res: { code?: string | null; meta?: DiagramMeta } | null | undefined, label: string, opts: { select?: Sel[] | null; type?: string; reason?: ChangeReason } = {}): boolean {
    // a version shown read-only is never written (and the store is not what is shown)
    if (this.version.peek()) return false;
    if (!res || res.code == null || (res.code === this.code && !res.meta)) return false;
    if (!this.emit('mmdx-op', opDetail(opts.type ?? label, res.code), true)) return false;
    const oldModel = this.model, oldCode = this.code;
    this.store.begin();
    try {
      if (res.meta) this.store.meta.set(res.meta);
      this.store.setCode(res.code, label);
      const model = this.model;
      // ops that return metadata have already carried it over to the new positional ids
      if (!res.meta) this.store.meta.set(remapMeta(oldModel, oldCode, model, this.code, this.meta));
      const keep = (r: Sel): boolean => this.store.exists(r);
      if (opts.select !== undefined) this.select((opts.select ?? []).filter(keep));
      else {
        const cur = this.selection(), kept = cur.filter(keep);
        if (kept.length !== cur.length) this.select(kept);
      }
    } finally {
      this.store.commit(label, opts.reason);
    }
    this.afterChange();
    return true;
  }

  /**
   * Replaces the document (a host's `setSource`, a remote update, an opened file). A gesture or transaction in flight
   * is cancelled first (rolled back, like Esc). `reset` clears the history, `push` makes it an undoable step. A load
   * (not a remote update) leaves group editing and the page selection; the view fits the new document unless `fit` is
   * false and the diagram type stayed (while History owns the canvas, the document's view is restored on the way back).
   */
  loadSource(src: string, opts: { history: 'reset' | 'push'; reason: 'load' | 'remote'; fit?: boolean; markSaved?: boolean }): void {
    this.cancelGesture();
    const before = this.store.model.peek().type;
    this.store.load(src, { history: opts.history, reason: opts.reason, markSaved: opts.markSaved !== false });
    if (opts.reason === 'load') {
      this.enteredGroup.set(null);
      this.pageSelected.set(false);
    }
    this.draw();
    if (this.scene === this.storeScene && !this.version.peek() && (opts.fit !== false || before !== this.store.model.peek().type)) {
      this.viewport.setBounds(this.result.result.bounds, { fit: true });
      this.kinds.oweFit(this.code);
    }
    this.fire('model');
    this.fire('panels');
  }

  /** Replaces the metadata as one history step (`mmdx-op`; a veto rolls it back). */
  setMeta(label: string, meta: DiagramMeta): void {
    this.change(label, () => this.store.meta.set(meta));
  }

  /**
   * Writes the document inside the open transaction (a drag, a nudge, a live field edit; A10d: modules do not write
   * the store themselves): its code and / or metadata. The commit records it as one step, a rollback undoes it.
   */
  write(doc: { code?: string; meta?: DiagramMeta }): void {
    if (this.version.peek()) return;
    if (doc.meta !== undefined) this.store.meta.set(doc.meta);
    if (doc.code !== undefined) this.store.code.set(doc.code);
  }

  /** As `write`, then draws (a gesture's preview frame). */
  preview(doc: { code?: string; meta?: DiagramMeta }): void {
    this.write(doc);
    this.draw();
  }

  /**
   * Runs a metadata-only change as one history step (styles, positions): `f` mutates `this.meta` in place.
   * Fires `mmdx-op`; a veto rolls the change back.
   */
  change(label: string, f: () => void): void {
    if (this.version.peek()) return;
    this.store.begin();
    try {
      f();
    } catch (e) {
      this.store.rollback();
      throw e;
    }
    if (!this.emit('mmdx-op', opDetail(label, this.code), true)) {
      this.store.rollback();
      this.draw();
      return;
    }
    this.store.commit(label);
    this.afterChange();
  }

  /** Starts a gesture transaction (live preview through draw(); commit or roll back at the end). */
  begin(): void {
    if (this.version.peek()) return;
    this.store.begin();
  }

  commit(label: string): void {
    if (!this.store.inTransaction) return;
    if (!this.emit('mmdx-op', opDetail(label, this.code), true)) {
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

  /**
   * Ends whatever edit is in flight, like Esc: the running pointer gesture is cancelled and an open transaction
   * (a drag, coalesced nudges, a live field edit) is rolled back. Called before undo / redo, a load, and when the
   * stage or the mode changes, so nothing keeps writing the store from a state captured before.
   */
  cancelGesture(): void {
    this.cancelPointer?.();
    if (this.store.inTransaction) this.rollback();
  }

  /** Undo, after cancelling the edit in flight (its later commit would record a stale start and drop the redo steps). */
  undo(): void {
    if (this.version.peek()) return;
    this.cancelGesture();
    this.store.undo();
    this.afterChange();
  }

  redo(): void {
    if (this.version.peek()) return;
    this.cancelGesture();
    this.store.redo();
    this.afterChange();
  }

  /** Redraw + panels after a committed change. */
  afterChange(): void {
    this.draw();
    this.fire('panels');
  }

  override setMode(m: Mode): void {
    // no Edit / View switching while History is open (§8.2)
    if (this.mode.peek() === m || this.stage.peek() !== 'document') return;
    this.modeState.set(m);
    this.toolState.set(m === 'edit' ? 'pointer' : 'hand');
    if (m === 'view') {
      this.select([]);
      this.enteredGroup.set(null);
      this.pageSelected.set(false);
    }
    this.fire('mode');
    this.draw();
    this.fire('panels');
  }

  override setTool(t: Tool): void {
    if (this.tool.peek() === t) return;
    this.toolState.set(t);
    this.fire('tool');
    this.drawOverlay();
  }

  /** Resolves once the kinds of the document's diagram type are loaded (at once when they are). */
  kindsReady(): Promise<void> {
    return this.kinds.ready(this.code);
  }

  // ---- group editing (Miro-like) ------------------------------------------------------------------------------------

  /** The group an item is directly in (null: none). */
  parentOf(it: ItemRef): string | null {
    return parentOf(this.model, it);
  }

  /** The outermost group around an item that a click selects (stops at lanes, locked groups and the entered group). */
  groupTarget(it: ItemRef, isLane: (gid: string) => boolean): string | null {
    return groupTarget(this.model, it, { entered: this.enteredGroup.peek(), isLane, locked: (g) => !!this.getM('group', g).locked });
  }

  insideGroup(it: ItemRef, gid: string): boolean {
    return insideGroup(this.model, it, gid);
  }

  groupDescendants(gid: string): { nodes: string[]; groups: string[]; leaf?: ItemKind } {
    return groupDescendants(this.model, gid);
  }

  /** The diagram has no items yet (empty-canvas hint). */
  isEmptyDiagram(): boolean {
    return withOps(this.model, (k, m) => k.isEmpty(m)) ?? false;
  }


  // ---- style environment (canvas module, additive) -----------------------------------------------------------------

  /** Model, metadata and theme of the current render, for the style ops (`src/core/ops/style-env.ts`). */
  styleEnv(): StyleEnv {
    const r = this.result;
    return { model: this.model, meta: this.meta, theme: r.theme, color: (v: unknown) => r.rctx.color(v) };
  }

  /** A swim-lane group (preset `lane`): never selected by clicks inside it, by the marquee or by ⌘A. */
  isLane(gid: string): boolean {
    return this.store.exists({ kind: 'group', id: gid }) && currentPreset(this.styleEnv(), { kind: 'group', id: gid }) === 'lane';
  }
}

/**
 * The `mmdx-op` payload, the same for every commit path (B46): the op's type and the code it leaves (a gesture's and a
 * metadata change's too, so a host's veto policy sees one shape).
 */
const opDetail = (type: string, code: string): { type: string; code: string } => ({ type, code });
