// ViewCore (component architecture §7): the kernel every diagram component is built on — the viewer, the editor
// (EditorCore extends it) and the diff. It holds the services (context, i18n, storage, popovers, toasts, events,
// keymap) and the shared state (mode, stage, chrome scheme, theme, display, panels, tool, compact), and puts together
// the shell with its named slots (shell.ts), the scene stack with the canvas area (scene.ts), the events and actions
// (bus.ts) and the module host (host.ts). Products are compositions: a kernel, a scene source and a set of modules.
import { ComponentShell } from './component-shell.js';
import { type StorageAdapter } from '../ports.js';
import { Owner } from '../reactive/owner.js';
import type { ThemeSource, HistoryAdapter, HostFullscreen } from '../ports.js';
import type { StaticVersion } from '../adapters/history.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import type { Rect } from '../core/types.js';
import { CANVAS_CSS, DiagramCanvas, type CanvasOptions, type Insets } from '../dom/canvas.js';
import { domImageSizes, onImageSize } from '../dom/image-sizes.js';
import type { StrokeStore } from '../dom/pen.js';
import { registerMessages, type I18n } from '../i18n.js';
import { VIEW_MESSAGES } from './messages.js';
import { PopoverManager, Toaster } from '../ui/kit/popover.js';
import { ShortcutRegistry } from './keymap.js';
import { batch, effect, signal, untracked, type Signal, type ReadSignal } from '../reactive/signal.js';
import { BASE, TOKENS } from '../ui/kit/base.js';
import type { HistoryHost, HistorySession } from './history.js';
import { ModuleHost, Scope } from './host.js';
import type { ModuleScope, Registration, ViewModule } from './module.js';
import { SceneStack, type CanvasArea, type SceneSource } from './scene.js';
import { createShell, SHELL_CSS, type Shell } from './shell.js';
import { themeLoader, ThemeState, type Scheme, type UiOption } from './theme.js';
import type { Display, DockItem, ExportFormat, Mode, PanelItem, SlotName, Stage, Tool, ViewActions, ViewEvents } from './types.js';


/**
 * Opens History on a component (src/diff/history.ts): the version panel, nothing picked; `compare` opens on the
 * newest change compared. `onClose` runs when it is left. `compareNewest` compares the newest change of an open one.
 */
export type HistoryOpener = (core: ViewCore, o: { onClose(): void; compare?: boolean }) => { close(): void; compareNewest(): void };

/** Loads the History code on first use (`() => import('…/diff/history.js')`): the kernel never imports the diff. */
export type HistoryLoader = () => Promise<{ openHistory: HistoryOpener }>;

export { SHELL_CSS };

export type Product = 'viewer' | 'editor' | 'diff';

export interface ViewCoreOptions {
  product: Product;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  /** The component's own icon packs, over the shared ones of `configure({ iconPacks })` (T04). */
  iconPacks?: readonly IconPack[];
  themeSource?: ThemeSource;
  /** Chrome scheme: `light` | `dark` | `auto` (the remembered toggle, else the page). */
  ui?: UiOption;
  theme?: string;
  themeDark?: string;
  /** The `compact` preset (§7.6): on, off, or automatic below a host size (default). */
  compact?: boolean | 'auto';
  /** The product's own CSS, adopted after the tokens and the base sheet. */
  css: readonly string[];
  /** The shell's root element: its class and role. */
  root: { class: string; role: 'img' | 'application' | 'group'; label?: string; roleDescription?: string };
  /** Class of the canvas area (`canvas-wrap` in the editor, `stage` in the viewer). */
  areaClass: string;
  canvas: CanvasOptions;
  initialMode?: Mode;
  /** Whether a feature is on (the viewer's `controls`, the editor's and the diff's `features`); default: all on. */
  feature?: (name: string) => boolean;
  /** Loads the History code (`() => import('…/diff/history.js')`); the History button needs it. */
  loadHistory?: HistoryLoader;
}

export class ViewCore<A extends object = ViewActions, P extends Readonly<Record<string, boolean>> = Readonly<Record<string, boolean>>, E extends ViewEvents = ViewEvents> {
  /** The action and event maps, for typing modules (`ActionsOf`, `EventsOf`); no value at run time. */
  declare readonly $actions: A;
  declare readonly $events: E;

  readonly product: Product;
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly ctx: CoreContext;
  readonly i18n: I18n;
  /** UI preferences; reads and writes reach the adapter set last (`setStorage`). */
  readonly storage: StorageAdapter;
  readonly popovers: PopoverManager;
  readonly toaster: Toaster;
  readonly shortcuts = new ShortcutRegistry();
  /** Loads the History code; null: no History in this component. */
  readonly loadHistory: HistoryLoader | null;
  /** What the product offers History (its own version scene, Restore, clipboard); null: History brings its scene. */
  historyHost: HistoryHost | null = null;

  // ---- shell
  /** The root element inside the shadow root. */
  readonly root: HTMLElement;
  /** The canvas area: the canvases and the chrome that floats over them. */
  readonly area: HTMLElement;
  readonly slots: Readonly<Record<SlotName, HTMLElement>>;
  /** Polite live region. */
  readonly live: HTMLElement;
  readonly canvas: DiagramCanvas;
  readonly canvasArea: CanvasArea;

  // ---- state (signals): read here, written through the kernel's methods (A7: setMode, setStage, setDisplay,
  // setPanel, setTool, setVisibleLayers, setHostOptions, setHistoryState) or a module's scope (contribute, claim)
  protected readonly modeState: Signal<Mode>;
  readonly mode: ReadSignal<Mode>;
  protected readonly stageState: Signal<Stage> = signal<Stage>('document');
  readonly stage: ReadSignal<Stage> = this.stageState;
  /** The chrome's light / dark scheme. */
  readonly scheme: ReadSignal<Scheme>;
  readonly themes: ThemeState;
  protected readonly displayState: Signal<Display> = signal<Display>({ labels: true, hoverHighlight: true, animate: true });
  readonly display: ReadSignal<Display> = this.displayState;
  /** Open panels by name. */
  protected readonly panelsState: Signal<P> = signal<P>({} as P);
  readonly panels: ReadSignal<P> = this.panelsState;
  protected readonly toolState: Signal<Tool> = signal<Tool>('hand');
  readonly tool: ReadSignal<Tool> = this.toolState;
  readonly compact: Signal<boolean>;
  /** What the open panel stacks take from the canvas area (`--inset-l` / `--inset-r`); null: the product's CSS decides. */
  readonly stackInsets: Signal<{ left: number; right: number } | null>;
  /** Layers shown by the host's override (viewer / diff); undefined = the document's own visibility. */
  protected readonly visibleLayersState = signal<readonly string[] | undefined>(undefined);
  readonly visibleLayers: ReadSignal<readonly string[] | undefined> = this.visibleLayersState;
  /** The document's versions (host-provided); null: no History. */
  private readonly historyState = signal<HistoryAdapter | readonly StaticVersion[] | null>(null);
  readonly history: ReadSignal<HistoryAdapter | readonly StaticVersion[] | null> = this.historyState;
  /** History is open: its version panel, whatever it shows (set by History, `setHistoryState`). */
  private readonly historyOpenState = signal(false);
  readonly historyOpen: ReadSignal<boolean> = this.historyOpenState;
  /** The open History's session (the `<mmdx-diff>` methods), null while History is closed (§8.3). */
  private readonly historySessionState = signal<HistorySession | null>(null);
  readonly historySession: ReadSignal<HistorySession | null> = this.historySessionState;
  /** The pen's strokes (claimed by the pen module), painted into every canvas the scenes add. */
  readonly strokes: Signal<StrokeStore | null> = signal<StrokeStore | null>(null);
  /** The host's full screen, used by the zoom bar when the browser's is unavailable (sandboxed iframes); null: none. */
  private readonly hostFullscreenState = signal<HostFullscreen | null>(null);
  readonly hostFullscreen: ReadSignal<HostFullscreen | null> = this.hostFullscreenState;
  /** Buttons of the tool dock, contributed by modules. */
  readonly dockItems: Signal<readonly DockItem[]> = signal<readonly DockItem[]>([]);
  /** Entries of the Export menu, contributed by modules. */
  readonly exportFormats: Signal<readonly ExportFormat[]> = signal<readonly ExportFormat[]>([]);
  /** The options flyout to the right of the tool dock (e.g. the pen options); null hides it. */
  readonly dockFlyout: Signal<HTMLElement | null> = signal<HTMLElement | null>(null);
  /** Controls of the view-params bar (top right) after the built-in ones, contributed by modules. */
  readonly paramItems: Signal<readonly DockItem[]> = signal<readonly DockItem[]>([]);
  /** Side panels of the left and right stacks, contributed by modules. */
  readonly panelItems: Signal<readonly PanelItem[]> = signal<readonly PanelItem[]>([]);

  /** What the kernel set up (effects, listeners, subscriptions), let go on destroy. */
  protected readonly owner = new Owner('kernel');
  protected readonly ac = new AbortController();
  protected destroyed = false;
  private readonly o: ViewCoreOptions;
  private readonly shell: Shell;
  /** The shadow root, i18n, context, storage, popovers, dialogs, scheme and events (A8: shared with the theme editor and the studio). */
  private readonly component: ComponentShell;
  private readonly scenes: SceneStack;
  private readonly modules: ModuleHost<this> = new ModuleHost<this>(this);
  private readonly loadTheme: (id: string) => Promise<boolean>;
  private source: ThemeSource | undefined;

  constructor(host: HTMLElement, o: ViewCoreOptions) {
    registerMessages(VIEW_MESSAGES);
    this.o = o;
    this.product = o.product;
    this.host = host;
    // the shadow root, i18n, context, storage, popovers, dialogs, scheme and events every component has (A8)
    const component = (this.component = new ComponentShell(host, { product: o.product, storage: o.storage, ctx: o.ctx, iconPacks: o.iconPacks, ui: o.ui }));
    this.i18n = component.i18n;
    this.storage = component.storage;
    this.ctx = component.ctx;
    this.source = o.themeSource;
    this.loadHistory = o.loadHistory ?? null;
    this.shadow = component.shadow;

    // ---- shell, canvas area, scenes
    const shell = (this.shell = createShell(host, this.shadow, { root: o.root, areaClass: o.areaClass, css: [TOKENS, BASE, SHELL_CSS, CANVAS_CSS, ...o.css], compact: o.compact ?? 'auto' }));
    this.root = shell.root;
    this.area = shell.area;
    this.slots = shell.slots;
    this.live = shell.live;
    this.compact = shell.compact;
    this.stackInsets = shell.stackInsets;
    // fit() uses the whole canvas: the panels float over it, so the diagram is as large as the window allows
    // pan and zoom fire `view` in every product, as documented (B45: only the editor fired it)
    const canvasOptions = (): CanvasOptions => ({
      ...o.canvas,
      onView: (v) => {
        o.canvas.onView?.(v);
        this.modules.bus.fire('view', undefined);
      },
    });
    this.canvas = new DiagramCanvas(this.area, canvasOptions());
    shell.placeAreaSlots();
    this.scenes = new SceneStack(this.area, this.canvas, canvasOptions, () => this.modules.bus.fire('draw', undefined));
    this.canvasArea = this.scenes.area;
    this.popovers = component.popovers;
    this.toaster = new Toaster(this.root);
    this.owner.add(() => this.toaster.destroy());

    // ---- state
    this.modeState = signal<Mode>(o.initialMode ?? 'view');
    this.mode = this.modeState;
    this.scheme = component.scheme;
    this.themes = new ThemeState({ registry: this.ctx.themes, storage: this.storage, product: o.product, scheme: this.scheme, theme: o.theme, themeDark: o.themeDark });
    this.loadTheme = themeLoader(this.ctx.themes, () => this.source, () => !this.destroyed);
    // an icon pack (or the icon code) finished loading: what was drawn as an empty box or a placeholder can show now
    this.owner.add(this.ctx.icons.onChange(() => {
      if (!this.destroyed) this.invalidate();
    }));
    // an image node without a size is drawn at its picture's size once the browser has loaded it (T06): once more
    this.ctx.imageSizes ??= domImageSizes;
    this.owner.add(onImageSize(() => {
      if (!this.destroyed) this.invalidate();
    }));
    // the display settings the picture shows (the labels, the visible layers) repaint it; the hover highlight and the
    // animation change no picture (P20: every writer called invalidate, whatever it changed)
    const shows = (): string => `${this.display().labels}|${JSON.stringify(this.visibleLayers() ?? null)}`;
    let painted = untracked(shows);
    this.owner.add(effect(() => {
      const now = shows();
      if (now === painted) return;
      painted = now;
      untracked(() => this.invalidate());
    }));
    // animated edges (`e1@{ animate: true }`) move unless the view settings turn them off (or the system asks for less motion)
    this.owner.add(effect(() => void (this.root.dataset['edgeAnim'] = this.display().animate ? 'on' : 'off')));
    this.owner.add(this.ctx.themes.onChange(() => {
      if (this.destroyed) return;
      this.themes.themesChanged();
    }));
    this.owner.add(effect(() => void this.host.setAttribute('data-ui', this.scheme())));
    // the theme reaches every canvas through the attached scene; a scheme flip that keeps the theme repaints nothing
    let shown = `${this.themes.current.peek()}#${this.themes.rev.peek()}`;
    this.owner.add(effect(() => {
      const now = `${this.themes.current()}#${this.themes.rev()}`;
      if (now === shown) return;
      shown = now;
      untracked(() => {
        this.modules.bus.fire('theme', undefined);
        this.invalidate();
      });
    }));
    this.owner.add(effect(() => {
      const m = this.mode(), st = this.stage();
      untracked(() => this.refreshModules());
      this.root.dataset['mode'] = m;
      this.root.dataset['stage'] = st;
    }));
    this.root.addEventListener('keydown', (ev) => {
      this.shortcuts.handle(ev, { mode: this.mode.peek(), stage: this.stage.peek() });
    }, { signal: this.ac.signal });
  }

  /** Whether a feature is on (`controls` / `features` of the product). Read while installing, it is the module's: a change installs the module again. */
  feature(name: string): boolean {
    const on = this.o.feature ? this.o.feature(name) : true;
    this.modules.installing?.noteFeature(name, on);
    return on;
  }

  // ---- styles -----------------------------------------------------------------------------------------------------

  /** Adds CSS to the shadow root (deduplicated by identity). */
  removeCss(css: readonly string[]): void {
    this.shell.removeCss(css);
  }

  addCss(css: readonly string[]): void {
    this.shell.addCss(css);
  }

  // ---- events -----------------------------------------------------------------------------------------------------

  /** Listens to a kernel event; returns a remover. Registered during a module's install, it belongs to the module. */
  on<K extends keyof E>(ev: K, cb: (d: E[K]) => void): () => void {
    const r = this.modules.bus.on(ev, cb as (d: unknown) => void);
    this.attribute(r, 'on');
    return () => r.dispose();
  }

  fire<K extends keyof E>(ev: K, ...d: E[K] extends void ? [] : [E[K]]): void {
    this.modules.bus.fire(ev, d[0]);
  }

  /**
   * Dispatches a DOM event from the host (`mmdx-*`, bubbling, composed). Returns false when a cancelable one was
   * prevented. A component being destroyed emits nothing (its modules closing on the way out are not user actions).
   */
  emit(type: string, detail: unknown, cancelable = false): boolean {
    if (this.destroyed) return true;
    return this.component.emit(type, detail, cancelable);
  }

  toast(msg: string, opts: { error?: boolean } = {}): void {
    this.toaster.show(msg, opts);
  }

  // ---- actions ----------------------------------------------------------------------------------------------------

  /** Provides a named action; a provider registered during a module's install is muted while the module is suspended. */
  provide<K extends keyof A>(name: K, f: A[K]): () => void {
    const r = this.modules.actions.provide(name, f, this.modules.installing);
    this.attribute(r, 'provide');
    return () => r.dispose();
  }

  /** Provides an action that answers only when no other provider does (a module's fallback). */
  provideDefault<K extends keyof A>(name: K, f: A[K]): () => void {
    const r = this.modules.actions.provide(name, f, this.modules.installing, true);
    this.attribute(r, 'provide');
    return () => r.dispose();
  }

  has(name: keyof A): boolean {
    return this.modules.actions.has(name);
  }

  run<K extends keyof A>(name: K, ...args: A[K] extends (...a: infer P) => unknown ? P : never): (A[K] extends (...a: never[]) => infer R ? R : never) | undefined {
    return this.modules.actions.run(name, args) as (A[K] extends (...a: never[]) => infer R ? R : never) | undefined;
  }

  /** A registration made on the core belongs to the module installing; made by module code after install, it is reported. */
  private attribute(r: Registration, what: 'on' | 'provide'): void {
    const s = this.modules.installing;
    if (s) s.register(r);
    else if (this.modules.running) console.warn(`[mmdx] ${this.modules.running.id}: use scope.${what}()`);
  }

  // ---- scenes -----------------------------------------------------------------------------------------------------

  /** The attached scene (what the main canvas shows). */
  get scene(): SceneSource | null {
    return this.scenes.top;
  }

  /** Makes `s` what the canvas shows; the scene underneath is detached (and repaints in full when it is back). */
  pushScene(s: SceneSource): void {
    this.scenes.push(s);
  }

  /** Gives the canvas back to the scene underneath (nothing repaints while the component is destroyed). */
  popScene(): SceneSource | null {
    return this.scenes.pop(!this.destroyed);
  }

  /** Something every scene depends on changed (theme, display, kinds): the attached scene repaints. */
  invalidate(): void {
    this.scenes.invalidate();
  }

  /** The bounds of what the main canvas shows. */
  contentBounds(): Rect | null {
    return this.scene?.bounds.peek() ?? null;
  }

  // ---- theme and scheme -------------------------------------------------------------------------------------------

  /** The theme every canvas draws with (component state, §7.5). */
  shownTheme(): string {
    return this.themes.current.peek();
  }

  /** Loads the theme when it is not registered yet (built-ins on demand, others through the theme source). */
  ensureTheme(id: string): Promise<boolean> {
    return this.loadTheme(id);
  }

  /** Sets the chrome scheme option (`ui`): explicit light / dark, or `auto` (the remembered choice, else the page). */
  setUi(ui: UiOption | undefined): void {
    this.component.setUi(ui);
  }

  /** The user toggles the chrome scheme: remembered per product, the theme is not touched. */
  chooseScheme(s: Scheme): void {
    this.component.chooseScheme(s);
    this.emit('mmdx-ui', { ui: s });
  }

  /** Where unregistered themes are loaded from (default: the shared `configure({ themeSource })`). */
  get themeSource(): ThemeSource | undefined {
    return this.source;
  }

  /** Changes the theme source; the shown theme is loaded through it when it is not registered yet. */
  setThemeSource(s: ThemeSource | undefined): void {
    this.source = s;
    void this.ensureTheme(this.shownTheme());
  }

  /** Changes where UI preferences live: the remembered scheme and theme pick are read from it again. */
  setStorage(s: StorageAdapter | undefined): void {
    this.component.setStorage(s);
    this.themes.reload();
  }

  // ---- layout -----------------------------------------------------------------------------------------------------

  setCompact(c: boolean | 'auto'): void {
    this.shell.setCompact(c);
  }

  /** Insets of the canvas area covered by the open panel stacks and the tool dock (the diff's panes keep clear of them). */
  insets(): Insets {
    return this.shell.insets();
  }

  // ---- modules ----------------------------------------------------------------------------------------------------

  /** Installs modules (ordered by `after`); `enabled` and `when` are re-evaluated by `refreshModules()`. */
  useModules(list: readonly ViewModule<this>[]): void {
    this.modules.use(list);
  }

  /** Adds modules to the installed set (e.g. History's, for the `history` stage); returns a remover. */
  addModules(list: readonly ViewModule<this>[]): () => void {
    return this.modules.add(list);
  }

  /** Installs, uninstalls, suspends and resumes modules for the current features, options, mode and stage. */
  refreshModules(): void {
    this.modules.refresh();
  }

  /** The scope of an installed module (tests, debugging). */
  moduleScope(id: string): ModuleScope<this> | null {
    return this.modules.scope(id);
  }

  /** Ids of the installed modules, in install order. */
  get moduleIds(): string[] {
    return this.modules.ids;
  }

  /** Runs `f` with registrations attributed to a module's scope (lazy parts, late registrations). */
  inScope(scope: ModuleScope<this>, f: () => void): void {
    if (scope instanceof Scope) this.modules.within(scope, f);
    else f();
  }

  /** Attributes a registration made outside install (e.g. a gesture source) to the installing module, if any. */
  protected track(r: Registration): void {
    this.modules.installing?.register(r);
  }

  // ---- lifecycle --------------------------------------------------------------------------------------------------

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    this.modules.clear();
    this.scenes.destroy();
    this.owner.dispose();
    this.shell.destroy();
    this.component.destroy();
  }

  // ---- owners of the state (A7) ----------------------------------------------------------------------------------

  setMode(m: Mode): void {
    this.modeState.set(m);
  }

  /** Shows a stage of the component (History drives it: `version`, `history`; `document` is back). */
  setStage(st: Stage): void {
    this.stageState.set(st);
  }

  /** The display settings (labels, hover highlight, animation); the picture repaints itself where they show. */
  setDisplay(patch: Partial<Display>): void {
    this.displayState.set({ ...this.displayState.peek(), ...patch });
  }

  /** Opens or closes a panel (the stack modules only render what is open). */
  setPanel(name: keyof P & string, open: boolean): void {
    this.setPanels({ [name]: open } as Partial<P>);
  }

  setPanels(patch: Partial<P>): void {
    this.panelsState.set({ ...this.panelsState.peek(), ...patch });
  }

  setTool(t: Tool): void {
    this.toolState.set(t);
  }

  /** The host's layer override (undefined: the document's own visibility). */
  setVisibleLayers(ids: readonly string[] | undefined): void {
    this.visibleLayersState.set(ids);
  }

  /** What the host page gives the component: its versions (History) and its full screen. */
  setHostOptions(o: { history?: HistoryAdapter | readonly StaticVersion[] | null; fullscreen?: HostFullscreen | null }): void {
    if (o.history !== undefined) this.historyState.set(o.history);
    if (o.fullscreen !== undefined) this.hostFullscreenState.set(o.fullscreen);
  }

  /** History says whether it is open and which session it shows (src/diff/history.ts). */
  setHistoryState(open: boolean, session: HistorySession | null): void {
    batch(() => {
      this.historyOpenState.set(open);
      this.historySessionState.set(session);
    });
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}

