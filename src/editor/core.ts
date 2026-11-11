// EditorCore: the shared state and services of one <mmdx-editor> instance. It replaces the prototype's global `S`
// and the free functions of app.js that everything called (draw, drawOverlay, commit, toast, ensure / getM / tidy,
// selection helpers). Feature modules (canvas gestures, panels, toolbars) are installed on it and talk to each other
// only through it: its signals, its events, and its registries for gestures, overlay painters and shortcuts.
//
// Component architecture §4.1: EditorCore extends the view kernel (ViewCore) — services, theme, chrome scheme,
// shell, module host and canvas come from it — and adds the document store, the selection, gestures and overlay
// painters. What the canvas shows is the StoreScene (src/editor/scene.ts); `draw()` invalidates it.
import type { ImageStore, StorageAdapter, ThemeSource } from '../ports.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import { normalizeMeta, splitSource, type DiagramDocument } from '../core/meta/index.js';
import { KIND_TO_COLL, type DiagramMeta, type ItemMeta } from '../core/meta/types.js';
import type { DiagramModel } from '../core/model.js';
import { own, ownOr } from '../core/own.js';
import { opsKind, registeredKinds, withKind, withOps } from '../core/kinds/registry.js';
import { reparse, detectType } from '../core/parse/dispatch.js';
import { editorHasKind, loadEditorKind } from './kinds/loader.js';
import type { ClipboardData } from '../core/ops/clipboard.js';
import { remapMeta } from '../core/ops/meta-ops.js';
import { currentPreset, type StyleEnv } from '../core/ops/style-env.js';
import { renderDocumentWith, type Rendered } from '../core/pipeline-core.js';
import { pageScene } from '../core/render/page.js';
import type { BoxGeom, GeometryIndex } from '../core/render/types.js';
import type { SceneNode } from '../core/scene/types.js';
import type { ItemKind, ItemRef, Rect } from '../core/types.js';
import { itemKey } from '../core/types.js';
import type { TextFormat, TextFormats } from './ops/format.js';
import { HIGHLIGHT_CSS } from '../dom/highlight.js';
import type { Viewport, WheelMode } from '../dom/viewport.js';
import { Dialogs, DIALOG_CSS } from '../ui/dialog.js';
import { effect, signal, untracked, type Signal } from '../reactive/signal.js';
import { ALIASES } from '../ui/styles/base.js';
import { EDITOR_CSS } from '../ui/styles/editor.js';
import { ViewCore } from '../view/core.js';
import type { Mode, Tool, ViewActions } from '../view/types.js';
import { StoreScene } from './scene.js';
import { itemExists, type ChangeReason, type DocStore } from './store.js';

export type { Mode, Tool };

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

/** An old version shown read-only in the editor's canvas (History): read and drawn instead of the store's document. */
export interface VersionView {
  id: string;
  source: string;
  doc: DiagramDocument;
  model: DiagramModel;
}

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

/** Item key → the group it is directly in, per model (the view kind's containers of kind `group`). */
const parentCache = new WeakMap<object, Map<string, string>>();
function groupParents(model: DiagramModel): Map<string, string> {
  let m = parentCache.get(model);
  if (!m) {
    m = new Map();
    for (const [c, p] of withKind(model, (k, mm) => k.parents(mm)) ?? []) if (p.kind === 'group') m.set(`${c.kind}:${c.id}`, p.id);
    parentCache.set(model, m);
  }
  return m;
}

export class EditorCore extends ViewCore<EditorActions & ViewActions, EditorPanels> {
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
  /**
   * The host's upload of a dropped, pasted or chosen picture (T05 `uploadImage`): resolves to the URL the image item
   * references (the editor never embeds files). Null: images are added by URL only.
   */
  uploadImage: ((file: File) => Promise<{ url: string }>) | null = null;
  /**
   * The host's image store (`EditorOptions.images`): the image tool's Library tab lists it, and uploads go to it
   * (before `uploadImage`). Null: no library.
   */
  images: ImageStore | null = null;
  /** Where an upload goes: the image store, else the host's `uploadImage` (null: images by URL only). */
  get upload(): ((file: File) => Promise<{ url: string }>) | null {
    const store = this.images;
    return store ? (file) => store.put(file, { name: file.name }) : this.uploadImage;
  }
  /** Base name for exports (no extension); files opened through `openFiles` set it. */
  fileName = 'diagram';
  /** Session snap grid in diagram px (0 = off). Alt while dragging = free. */
  snap = 5;
  /** Primary selected item's `foot` flag (participant copy at the bottom). */
  foot = false;
  /** An inline text editor is open over this item: no handles around it. */
  inlineEditing: ItemRef | null = null;
  /** The open inline text editor's formatting (the toolbar's text format menu acts on its selection); null: none open. */
  textEdit: TextEditSession | null = null;
  /** ER table whose attributes are being edited: drawn as a table with an empty row for a new attribute. */
  tableView: string | null = null;
  /** Item under the pointer (connection dots on hover). */
  hover: Sel | null = null;
  /** A gesture is running. */
  dragging = false;
  /** Cancels the running pointer gesture, if any (set by the editor's pointer wiring). */
  cancelPointer: (() => void) | null = null;
  /** Space is held: drag pans. */
  spaceDown = false;
  /** Last pointer position (client coordinates), for paste-at-pointer and menus. */
  pointer: { clientX: number; clientY: number } | null = null;
  /** The item clipboard (UI state, never saved): copies carry their content (§9), so History can fill it too. */
  clipboard: ClipboardData | null = null;
  /**
   * An old version shown read-only (History, `showVersion`): the getters, the render and the selection read it instead
   * of the store, and nothing writes (changes, transactions, undo are refused) while it shows.
   */
  readonly version: Signal<VersionView | null> = signal<VersionView | null>(null);
  /** The selection while a version shows (the document's own selection is kept in the store meanwhile). */
  private versionSel: ItemRef[] = [];
  /** What showing a version put aside (the document's entered group and layer override), given back after it. */
  private beforeVersion: { group: string | null; layers: readonly string[] | undefined } | null = null;

  private rendered: Rendered | null = null;
  private readonly gestures: GestureSource[] = [];
  private readonly painters: OverlayPainter[] = [];
  /** Applies a drag's move still waiting for its animation frame (the editor's pointer loop sets it; P1). */
  flushPreview: () => void = () => {};
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
    this.dialogs = new Dialogs(this.shadow, this.i18n.t);
    this.tool.set('pointer');
    this.panels.set({ code: true, properties: true, layers: true });
    const c = this.canvas;
    this.domCache = { shadow: this.shadow, root: this.root, wrap: this.area, svg: c.svg, defs: c.defs, vp: c.vp, page: c.page, body: c.body, overlay: c.overlay };
    this.storeScene = new StoreScene(this);
    this.pushScene(this.storeScene);
    // the document's selection, however it changes (a pick, undo / redo, a rolled-back gesture, a load): `selection`
    // and `mmdx-selection` once per real change (B11, P5) — not on construction, not for the same items again, and not
    // while a version is shown (its items are picked to copy them; the net change is reported when it closes)
    let last = this.store.selection.peek().map(itemKey).join('\n');
    this.owner.add(effect(() => {
      const sel = this.store.selection();
      if (this.version()) return;
      const key = sel.map(itemKey).join('\n');
      if (key === last) return;
      last = key;
      untracked(() => {
        this.fire('selection');
        // the picture does not depend on the selection: its marks and the overlay only, no render (P4)
        if (this.storeScene.attached && this.dom.body.childElementCount) this.decorate();
        this.drawOverlay();
        this.emit('mmdx-selection', { items: sel.map((r) => ({ kind: r.kind, id: r.id })) });
      });
    }));
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
    const cur = this.version.peek();
    if ((v?.id ?? null) === (cur?.id ?? null) && v?.source === cur?.source) return;
    this.cancelGesture();
    this.inlineEditing = null;
    if (v) {
      const split = splitSource(v.source);
      const doc: DiagramDocument = { code: split.doc.code, meta: normalizeMeta(split.doc.meta) };
      if (!cur) {
        this.beforeVersion = { group: this.enteredGroup.peek(), layers: this.visibleLayers.peek() };
        this.enteredGroup.set(null);
        this.pageSelected.set(false);
      }
      // the same item stays selected from version to version while it is there
      const model = reparse(doc.code);
      this.needKind(doc.code);
      this.versionSel = cur ? this.versionSel.filter((r) => itemExists(model, r)) : [];
      this.version.set({ id: v.id, source: v.source, doc, model });
    } else {
      this.version.set(null);
      this.versionSel = [];
      const back = this.beforeVersion;
      this.beforeVersion = null;
      if (back) {
        this.enteredGroup.set(back.group);
        this.visibleLayers.set(back.layers);
      }
    }
    this.rendered = null;
    this.draw();
    this.fire('model');
    this.fire('selection');
    this.fire('panels');
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
    const sel = this.version.peek() ? this.versionSel : this.store.selection.peek();
    return sel.map((r, i) => (i === 0 && this.foot && r.kind === 'participant' ? { ...r, foot: true } : r));
  }

  /** The single selected item (null when nothing or several are selected). */
  primary(): Sel | null {
    const s = this.selection();
    return s.length === 1 ? s[0]! : null;
  }

  isSelected(r: ItemRef): boolean {
    return (this.version.peek() ? this.versionSel : this.store.selection.peek()).some((x) => x.kind === r.kind && x.id === r.id);
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
    const foot = !!items[0]?.foot;
    if (list.length) this.pageSelected.set(false);
    // a version's items are selected to copy them: the document's selection and its event stay as they are
    if (this.version.peek()) {
      this.foot = foot;
      this.versionSel = list;
      this.fire('selection');
      this.drawOverlay();
      return;
    }
    // the document's selection: the effect in the constructor fires and emits when it changes; the same items again
    // do nothing (P5) unless only the participant end (its foot) changed
    const footChanged = foot !== this.foot;
    this.foot = foot;
    this.store.selection.set(list);
    if (footChanged) {
      this.fire('selection');
      this.drawOverlay();
    }
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
    if (!it || !g.type) return null;
    return opsKind(g.type)?.box(g, it, true) ?? null;
  }


  // ---- rendering --------------------------------------------------------------------------------------------------

  /** Renders the current document (no DOM work). */
  render(): Rendered {
    const v = this.version.peek();
    const doc = v?.doc ?? this.store.doc();
    const model = this.model;
    this.needKind(doc.code);
    const opts: Parameters<typeof renderDocumentWith>[4] = {};
    if (this.mode.peek() === 'view' && !this.display.peek().labels) opts.hideLabels = true;
    opts.theme = this.shownTheme();
    // a version's layers are a view override too (its Layers panel hides and shows them without writing)
    const layers = this.mode.peek() === 'view' || v ? this.visibleLayers.peek() : undefined;
    if (layers) opts.visibleLayers = layers;
    if (this.tableView && this.mode.peek() === 'edit' && !v) opts.tableView = [this.tableView];
    const r = renderDocumentWith(registeredKinds(), doc, model, this.ctx, opts);
    this.rendered = { doc, model, tooLarge: false, ...r, diagnostics: [...model.diagnostics, ...r.diagnostics] };
    return this.rendered;
  }

  /**
   * Re-renders and patches the document, then the overlay. Synchronous (gestures preview through it). While another
   * scene owns the canvas (History), the store scene only becomes dirty and repaints in full when it is back.
   */
  draw(): void {
    this.storeScene.invalidate();
  }

  /** Paints the document into the main canvas (the store scene calls it while attached). */
  paintDocument(): void {
    const r = this.render();
    const res = r.result;
    this.canvas.show({ defs: res.defs, page: pageScene(res, r.rctx), body: res.body });
    this.storeScene.bounds.set(res.bounds);
    this.decorate();
    this.drawOverlay();
    this.fire('draw');
  }

  /** Marks multi-selected items and the inline-edited item on the scene (classes only). */
  private decorate(): void {
    const body = this.dom.body;
    for (const n of Array.from(body.querySelectorAll('.selected, .text-editing'))) n.classList.remove('selected', 'text-editing');
    // one pass over the scene, however many items are selected
    const marks = new Map<string, string[]>();
    const mark = (r: ItemRef, cls: string): void => {
      const k = itemKey(r);
      marks.set(k, [...(marks.get(k) ?? []), cls]);
    };
    const sel = this.selection();
    if (sel.length > 1) for (const r of sel) mark(r, 'selected');
    if (this.inlineEditing) mark(this.inlineEditing, 'text-editing');
    if (marks.size)
      for (const n of Array.from(body.querySelectorAll('.el[data-id]'))) {
        const c = marks.get(`${n.getAttribute('data-kind')}:${n.getAttribute('data-id')}`);
        if (c) n.classList.add(...c);
      }
    this.dom.root.classList.toggle('group-edit', !!this.enteredGroup.peek() && this.mode.peek() === 'edit');
  }

  /** Adds an overlay painter; one added while a module installs is muted while the module is suspended. */
  addOverlay(p: OverlayPainter): () => void {
    const add = (): void => {
      if (this.painters.includes(p)) return;
      this.painters.push(p);
      this.painters.sort((a, b) => a.order - b.order);
    };
    const remove = (): void => {
      const i = this.painters.indexOf(p);
      if (i >= 0) this.painters.splice(i, 1);
    };
    add();
    this.track({ set: (on) => (on ? add() : remove()), dispose: remove });
    return remove;
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
    if (this.scene === this.storeScene) this.canvas.setOverlay(nodes);
    this.fire('overlay');
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
      const t = detectType(this.code);
      this.fitWhenLoaded = !!t && !editorHasKind(t);
    }
    this.fire('model');
    this.fire('panels');
  }

  /** Replaces the metadata as one history step (`mmdx-op`; a veto rolls it back). */
  setMeta(label: string, meta: DiagramMeta): void {
    this.change(label, () => this.store.meta.set(meta));
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

  setMode(m: Mode): void {
    // no Edit / View switching while History is open (§8.2)
    if (this.mode.peek() === m || this.stage.peek() !== 'document') return;
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

  // ---- diagram kinds loaded on demand -------------------------------------------------------------------------------

  /** A fit the view owes the document whose kind was still loading. */
  private fitWhenLoaded = false;

  /**
   * Loads the kinds of the code's diagram type when they are not loaded yet (T01: the editor loads types on demand):
   * meanwhile the document draws as not yet supported; once they arrive it is parsed again and redrawn.
   */
  private needKind(code: string): void {
    const t = detectType(code);
    if (!t || editorHasKind(t)) return;
    void loadEditorKind(t).then(() => {
      if (!this.host.isConnected && !this.kindWaiters.length) return;
      this.draw();
      if (this.fitWhenLoaded && this.scene === this.storeScene && !this.version.peek()) this.viewport.setBounds(this.result.result.bounds, { fit: true });
      this.fitWhenLoaded = false;
      this.fire('model');
      this.fire('panels');
      for (const f of this.kindWaiters.splice(0)) f();
    }, (e: unknown) => {
      this.toast(`Could not load the editor for this diagram type: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      for (const f of this.kindWaiters.splice(0)) f();
    });
  }

  private readonly kindWaiters: (() => void)[] = [];

  /** Resolves once the kinds of the document's diagram type are loaded (at once when they are). */
  kindsReady(): Promise<void> {
    const t = detectType(this.code);
    if (!t || editorHasKind(t)) return Promise.resolve();
    return new Promise((r) => {
      this.kindWaiters.push(r);
      this.needKind(this.code);
    });
  }

  // ---- group editing (Miro-like) ------------------------------------------------------------------------------------

  /** The group an item is directly in (null: none). */
  parentOf(it: ItemRef): string | null {
    return groupParents(this.model).get(`${it.kind}:${it.id}`) ?? null;
  }

  /** The outermost group around an item that a click selects (stops at lanes, locked groups and the entered group). */
  groupTarget(it: ItemRef, isLane: (gid: string) => boolean): string | null {
    if (it.kind !== 'node' && it.kind !== 'group' && it.kind !== 'entity') return null;
    const up = groupParents(this.model);
    let best: string | null = null;
    for (let g = this.parentOf(it), guard = 0; g && guard < 64; g = up.get(`group:${g}`) ?? null, guard++) {
      if (g === this.enteredGroup.peek() || isLane(g)) break;
      if (!this.getM('group', g).locked) best = g;
    }
    return best;
  }

  insideGroup(it: ItemRef, gid: string): boolean {
    if (it.kind === 'group' && it.id === gid) return true;
    const up = groupParents(this.model);
    for (let g = this.parentOf(it), guard = 0; g && guard < 64; g = up.get(`group:${g}`) ?? null, guard++) if (g === gid) return true;
    return false;
  }

  groupDescendants(gid: string): { nodes: string[]; groups: string[]; leaf?: ItemKind } {
    return withOps(this.model, (k, m) => k.descendants?.(m, gid)) ?? { nodes: [], groups: [] };
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
