// ViewCore (component architecture §7): the kernel every diagram component is built on — the viewer, the editor
// (EditorCore extends it) and the diff. It holds the services (context, i18n, storage, popovers, toasts, events,
// keymap), the shared state (mode, stage, chrome scheme, theme, display, panels, tool, compact), the shell with its
// named slots, the canvas area with the main canvas, the scene stack, and the module host (install, suspend, resume,
// uninstall). Products are compositions: a kernel, a scene source and a set of modules.
import { localStorageAdapter, memoryStorage, type StorageAdapter } from '../adapters/storage.js';
import type { ThemeSource } from '../adapters/themes.js';
import type { HistoryAdapter, StaticVersion } from '../adapters/history.js';
import { ensureBuiltinThemes, getShared, instanceContext } from '../config.js';
import type { CoreContext } from '../core/context.js';
import { BUILTIN_IDS } from '../core/theme/builtin-ids.js';
import type { Rect } from '../core/types.js';
import { CANVAS_CSS, DiagramCanvas, type CanvasOptions, type Insets } from '../dom/canvas.js';
import { h } from '../ui/h.js';
import { registerMessages, type I18n } from '../ui/i18n.js';
import { VIEW_MESSAGES } from '../ui/messages/view.js';
import { PopoverManager, Toaster } from '../ui/popover.js';
import { ShortcutRegistry, type Shortcut } from '../ui/shortcuts.js';
import { computed, effect, signal, untracked, type ReadSignal, type Signal } from '../ui/signal.js';
import { adoptStyles, BASE, resolveUiScheme, TOKENS, watchUiScheme } from '../ui/styles/base.js';
import { matchesWhen, orderModules, type ModuleScope, type Registration, type ViewModule } from './module.js';
import type { CanvasArea, SceneSource } from './scene.js';
import { ThemeState, type Scheme } from './theme.js';
import type { HistorySession } from './history.js';
import type { Display, DockItem, ExportFormat, Mode, PanelItem, SlotName, Stage, Tool, ViewActions, ViewEvent } from './types.js';

export type Product = 'viewer' | 'editor' | 'diff';

export interface ViewCoreOptions {
  product: Product;
  /** Storage key prefix of the per-product preferences (default: the product). */
  storageKey?: string;
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  themeSource?: ThemeSource;
  /** Chrome scheme: `light` | `dark` | `auto` (follows the page). */
  ui?: 'light' | 'dark' | 'auto';
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
}

type Listener = { cb: () => void; muted: boolean };
type Provided = { f: (...args: never[]) => unknown; scope: Scope | null };

const COMPACT_W = 560;
const COMPACT_H = 360;

/** Slots placed in the canvas area (over the canvas); the others sit in the root, beside it. */
const AREA_SLOTS: readonly SlotName[] = ['top-left', 'top-center', 'top-right', 'left-dock', 'bottom-center', 'bottom-right', 'canvas'];
const ROOT_SLOTS: readonly SlotName[] = ['left-stack', 'right-stack', 'overlay'];

export const SHELL_CSS = /* css */ `
.slot { display: contents; }
.slot-top-center { display: flex; flex-direction: column; align-items: center; gap: 8px; position: absolute; top: 12px; left: calc(50% + (var(--inset-l, 0px) - var(--inset-r, 0px)) / 2); transform: translateX(-50%); z-index: 36; pointer-events: none; max-width: calc(100% - 24px); }
.slot-top-center > * { pointer-events: auto; }
.slot-top-center { width: max-content; }
.slot-top-center > .mmdx-pill { position: static; transform: none; max-width: 100%; }
.slot-top-center:empty { display: none; }
/* the right stack keeps clear of the view params (top right) and the zoom bar (bottom right) */
.slot-right-stack > .mmdx-stack:not(.drawer) { top: 60px; bottom: 60px; }
`;

export class ViewCore<A extends object = ViewActions, P extends Readonly<Record<string, boolean>> = Readonly<Record<string, boolean>>> {
  readonly product: Product;
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly ctx: CoreContext;
  readonly i18n: I18n;
  readonly storage: StorageAdapter;
  readonly popovers: PopoverManager;
  readonly toaster: Toaster;
  readonly shortcuts = new ShortcutRegistry();
  readonly themeSource: ThemeSource | undefined;

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

  // ---- state (signals)
  readonly mode: Signal<Mode>;
  readonly stage: Signal<Stage> = signal<Stage>('document');
  /** The chrome's light / dark scheme. */
  readonly scheme: Signal<Scheme>;
  readonly themes: ThemeState;
  readonly display: Signal<Display> = signal<Display>({ labels: true, hoverHighlight: true });
  /** Open panels by name. */
  readonly panels: Signal<P> = signal<P>({} as P);
  readonly tool: Signal<Tool> = signal<Tool>('hand');
  readonly compact: Signal<boolean> = signal(false);
  /** Layers shown by the host's override (viewer / diff); undefined = the document's own visibility. */
  readonly visibleLayers: Signal<readonly string[] | undefined> = signal<readonly string[] | undefined>(undefined);
  /** The document's versions (host-provided); null: no History. */
  readonly history: Signal<HistoryAdapter | readonly StaticVersion[] | null> = signal<HistoryAdapter | readonly StaticVersion[] | null>(null);
  /** History is open (the `history` stage). */
  readonly historyOpen: ReadSignal<boolean> = computed(() => this.stage() === 'history');
  /** The open History's session (the `<mmdx-diff>` methods), null while History is closed (§8.3). */
  readonly historySession: Signal<HistorySession | null> = signal<HistorySession | null>(null);
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

  protected readonly cleanups: (() => void)[] = [];
  protected readonly ac = new AbortController();
  protected destroyed = false;
  private readonly o: ViewCoreOptions;
  private readonly listeners = new Map<string, Set<Listener>>();
  /** Providers per action, newest last: a suspended or removed provider gives the action back to the one before it. */
  private readonly actionMap = new Map<keyof A, Provided[]>();
  private readonly sceneStack: SceneSource[] = [];
  private readonly extraCanvases = new Set<DiagramCanvas>();
  private readonly css: string[];
  private readonly installed = new Map<string, Installed<this>>();
  private available: readonly ViewModule<this>[] = [];
  /** The scope of the module being installed: registrations made on the core during install belong to it. */
  private installing: Scope | null = null;
  private uiOption: 'light' | 'dark' | 'auto' | undefined;
  private compactOption: boolean | 'auto';

  constructor(host: HTMLElement, o: ViewCoreOptions) {
    registerMessages(VIEW_MESSAGES);
    this.o = o;
    this.product = o.product;
    this.host = host;
    const shared = getShared();
    this.i18n = shared.i18n;
    this.storage = o.storage ?? (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());
    this.ctx = instanceContext(o.ctx);
    this.themeSource = o.themeSource;
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.css = [TOKENS, BASE, SHELL_CSS, CANVAS_CSS, ...o.css];
    this.adopt();

    // ---- shell
    this.area = h('div', { class: `${o.areaClass} mmdx-area` });
    const mk = (name: SlotName): HTMLElement => h('div', { class: `slot slot-${name}`, dataset: { slot: name } });
    const slots = {} as Record<SlotName, HTMLElement>;
    for (const n of [...AREA_SLOTS, ...ROOT_SLOTS]) slots[n] = mk(n);
    this.slots = slots;
    this.live = h('div', { class: 'mmdx-sr', 'aria-live': 'polite' });
    this.root = h('div', { class: o.root.class, role: o.root.role, tabindex: '0' }, this.area, slots['left-stack'], slots['right-stack'], slots.overlay, this.live);
    if (o.root.label) this.root.setAttribute('aria-label', o.root.label);
    if (o.root.roleDescription) this.root.setAttribute('aria-roledescription', o.root.roleDescription);
    this.shadow.append(this.root);
    this.canvas = new DiagramCanvas(this.area, { ...o.canvas, insets: o.canvas.insets ?? (() => this.insets()) });
    for (const n of AREA_SLOTS) this.area.append(slots[n]);
    const area = this.area, main = this.canvas;
    this.canvasArea = {
      el: area,
      main,
      createCanvas: (parent, opts = {}) => {
        const c = new DiagramCanvas(parent ?? area, { ...o.canvas, insets: o.canvas.insets ?? (() => this.insets()), ...opts });
        this.extraCanvases.add(c);
        const destroy = c.destroy.bind(c);
        c.destroy = () => {
          this.extraCanvases.delete(c);
          destroy();
        };
        return c;
      },
      restoreMain: () => {
        if (main.svg.parentNode !== area) area.prepend(main.svg);
      },
    };
    this.popovers = new PopoverManager(this.shadow);
    this.toaster = new Toaster(this.root);
    this.cleanups.push(() => this.toaster.destroy(), () => this.popovers.close());

    // ---- state
    this.mode = signal<Mode>(o.initialMode ?? 'view');
    this.uiOption = o.ui;
    this.scheme = signal<Scheme>(this.resolveScheme());
    this.themes = new ThemeState({ registry: this.ctx.themes, storage: this.storage, product: o.storageKey ?? o.product, scheme: this.scheme, theme: o.theme, themeDark: o.themeDark });
    this.compactOption = o.compact ?? 'auto';
    this.cleanups.push(watchUiScheme(() => this.applyScheme()));
    this.cleanups.push(this.ctx.themes.onChange(() => {
      if (this.destroyed) return;
      this.themes.themesChanged();
    }));
    // the scheme and the theme reach every canvas through the attached scene
    let first = true;
    this.cleanups.push(effect(() => {
      const s = this.scheme();
      this.themes.current();
      this.host.setAttribute('data-ui', s);
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        this.fire('theme');
        this.invalidate();
      });
    }));
    this.cleanups.push(effect(() => {
      const c = this.compact();
      this.root.classList.toggle('compact', c);
    }));
    this.cleanups.push(effect(() => {
      const m = this.mode(), st = this.stage();
      untracked(() => this.refreshModules());
      this.root.dataset['mode'] = m;
      this.root.dataset['stage'] = st;
    }));
    this.watchCompact();
    this.wireKeys();
  }

  /** Whether a feature is on (`controls` / `features` of the product). */
  feature(name: string): boolean {
    return this.o.feature ? this.o.feature(name) : true;
  }

  // ---- styles -----------------------------------------------------------------------------------------------------

  /** Adds CSS to the shadow root (deduplicated by identity). */
  addCss(css: readonly string[]): void {
    let changed = false;
    for (const c of css)
      if (c && !this.css.includes(c)) {
        this.css.push(c);
        changed = true;
      }
    if (changed) this.adopt();
  }

  /** `<style>` elements of engines without adopted stylesheets (each sheet once; removed on destroy). */
  private readonly styleEls = new Map<string, HTMLStyleElement>();

  private adopt(): void {
    const root = this.shadow;
    if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in root && 'replaceSync' in CSSStyleSheet.prototype) {
      adoptStyles(root, this.css);
      return;
    }
    for (const c of this.css) {
      if (this.styleEls.has(c)) continue;
      const el = document.createElement('style');
      el.textContent = c;
      root.append(el);
      this.styleEls.set(c, el);
    }
  }

  // ---- events -----------------------------------------------------------------------------------------------------

  /** Listens to a kernel event; returns a remover. Registered during a module's install, it belongs to the module. */
  on(ev: ViewEvent | (string & {}), cb: () => void): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    const l: Listener = { cb, muted: false };
    set.add(l);
    const off = (): void => void set.delete(l);
    this.installing?.register({ set: (on) => void (l.muted = !on), dispose: off });
    return off;
  }

  fire(ev: ViewEvent | (string & {})): void {
    for (const l of [...(this.listeners.get(ev) ?? [])]) if (!l.muted) l.cb();
  }

  /** Dispatches a DOM event from the host (`mmdx-*`, bubbling, composed). Returns false when a cancelable one was prevented. */
  emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  toast(msg: string, opts: { error?: boolean } = {}): void {
    this.toaster.show(msg, opts);
  }

  // ---- actions ----------------------------------------------------------------------------------------------------

  /** Provides a named action; a provider registered during a module's install is muted while the module is suspended. */
  provide<K extends keyof A>(name: K, f: A[K]): () => void {
    const p: Provided = { f: f as (...args: never[]) => unknown, scope: this.installing };
    const list = this.actionMap.get(name) ?? [];
    list.push(p);
    this.actionMap.set(name, list);
    const off = (): void => {
      const i = list.indexOf(p);
      if (i >= 0) list.splice(i, 1);
    };
    this.installing?.register({ set: () => undefined, dispose: off });
    return off;
  }

  /** The newest provider of an action whose module is active. */
  private provider(name: keyof A): Provided | undefined {
    const list = this.actionMap.get(name) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      if (!p.scope || p.scope.active) return p;
    }
    return undefined;
  }

  has(name: keyof A): boolean {
    return !!this.provider(name);
  }

  run<K extends keyof A>(name: K, ...args: A[K] extends (...a: infer P) => unknown ? P : never): (A[K] extends (...a: never[]) => infer R ? R : never) | undefined {
    const p = this.provider(name);
    return p ? (p.f as (...a: unknown[]) => never)(...args) : undefined;
  }

  // ---- scenes -----------------------------------------------------------------------------------------------------

  /** The attached scene (what the main canvas shows). */
  get scene(): SceneSource | null {
    return this.sceneStack[this.sceneStack.length - 1] ?? null;
  }

  /** Makes `s` what the canvas shows; the scene underneath is detached (and repaints in full when it is back). */
  pushScene(s: SceneSource): void {
    this.scene?.detach();
    this.sceneStack.push(s);
    s.attach(this.canvasArea);
    this.fire('draw');
  }

  /** Gives the canvas back to the scene underneath. */
  popScene(): SceneSource | null {
    const s = this.sceneStack.pop() ?? null;
    s?.detach();
    for (const c of [...this.extraCanvases]) c.destroy();
    this.canvasArea.restoreMain();
    this.scene?.attach(this.canvasArea);
    this.fire('draw');
    return s;
  }

  /** Something every scene depends on changed (theme, display, kinds): the attached scene repaints. */
  invalidate(): void {
    for (const s of this.sceneStack) s.invalidate();
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
    if (this.ctx.themes.has(id)) return Promise.resolve(true);
    if (BUILTIN_IDS.includes(id)) return ensureBuiltinThemes().then(() => this.ctx.themes.has(id));
    return this.fetchTheme(id);
  }

  private readonly fetched = new Set<string>();

  private async fetchTheme(id: string): Promise<boolean> {
    const src = this.themeSource ?? getShared().themeSource;
    if (!src || this.fetched.has(id)) return this.ctx.themes.has(id);
    this.fetched.add(id);
    try {
      const file = await src.get(id);
      if (this.destroyed) return false;
      this.ctx.themes.register(file);
      // a theme that extends another unknown theme pulls that one in too
      if (file.extends && !this.ctx.themes.has(file.extends)) await this.ensureTheme(file.extends);
      return true;
    } catch {
      // missing or private theme: the diagram stays on baseline with an info diagnostic
      return false;
    }
  }

  /** Sets the chrome scheme option (`ui`): explicit light / dark, or `auto` (the remembered choice, else the page). */
  setUi(ui: 'light' | 'dark' | 'auto' | undefined): void {
    this.uiOption = ui;
    this.applyScheme();
  }

  /** The user toggles the chrome scheme: remembered per product, the theme is not touched. */
  chooseScheme(s: Scheme): void {
    this.storage.set(`${this.o.storageKey ?? this.product}.ui`, s);
    this.uiOption = s;
    this.applyScheme();
    this.emit('mmdx-ui', { ui: s });
  }

  private resolveScheme(): Scheme {
    const ui = this.uiOption;
    if (ui === 'light' || ui === 'dark') return ui;
    const stored = this.storage.get<string>(`${this.o.storageKey ?? this.product}.ui`);
    if (ui === undefined && (stored === 'light' || stored === 'dark')) return stored;
    return resolveUiScheme(null);
  }

  private applyScheme(): void {
    this.scheme.set(this.resolveScheme());
  }

  // ---- compact ----------------------------------------------------------------------------------------------------

  setCompact(c: boolean | 'auto'): void {
    this.compactOption = c;
    this.syncCompact();
  }

  private syncCompact(): void {
    if (this.compactOption !== 'auto') {
      this.compact.set(this.compactOption);
      return;
    }
    const r = this.host.getBoundingClientRect();
    this.compact.set(!!r.width && (r.width < COMPACT_W || r.height < COMPACT_H));
  }

  private watchCompact(): void {
    if (typeof ResizeObserver === 'undefined') {
      this.syncCompact();
      return;
    }
    const ro = new ResizeObserver(() => this.syncCompact());
    ro.observe(this.host);
    this.cleanups.push(() => ro.disconnect());
    this.syncCompact();
  }

  // ---- layout -----------------------------------------------------------------------------------------------------

  /**
   * Insets of the canvas area that fit() keeps clear: the open panel stacks and the tool dock. Measured from the
   * layout boxes (offsets), not the painted ones, so a panel still sliding in counts where it will be.
   */
  insets(): Insets {
    const w = this.root.clientWidth;
    const shown = (slot: HTMLElement): HTMLElement[] =>
      [...slot.children].filter((e): e is HTMLElement => e instanceof HTMLElement && !e.hidden && !!e.offsetParent && !e.classList.contains('drawer') && (!e.classList.contains('mmdx-stack') || e.classList.contains('open')));
    let l = 0, r = 0;
    for (const e of [...shown(this.slots['left-stack']), ...shown(this.slots['left-dock'])]) l = Math.max(l, e.offsetLeft + e.offsetWidth);
    for (const e of shown(this.slots['right-stack'])) if (w) r = Math.max(r, w - e.offsetLeft);
    return { left: l + 8, right: r + 8, top: 56, bottom: 56 };
  }

  // ---- keyboard ---------------------------------------------------------------------------------------------------

  private wireKeys(): void {
    this.root.addEventListener('keydown', (ev) => {
      this.shortcuts.handle(ev, { mode: this.mode.peek(), stage: this.stage.peek() });
    }, { signal: this.ac.signal });
  }

  // ---- modules ----------------------------------------------------------------------------------------------------

  /** Installs modules (ordered by `after`); `enabled` and `when` are re-evaluated by `refreshModules()`. */
  useModules(list: readonly ViewModule<this>[]): void {
    this.available = orderModules(list);
    this.refreshModules();
  }

  /** Adds modules to the installed set (e.g. History's, for the `history` stage); returns a remover. */
  addModules(list: readonly ViewModule<this>[]): () => void {
    const ids = new Set(this.available.map((m) => m.id));
    const added = list.filter((m) => !ids.has(m.id));
    this.available = orderModules([...this.available, ...added]);
    this.refreshModules();
    return () => {
      this.available = this.available.filter((m) => !added.includes(m));
      this.refreshModules();
    };
  }

  /** Installs, uninstalls, suspends and resumes modules for the current options, mode and stage. */
  refreshModules(): void {
    if (this.destroyed) return;
    const mode = this.mode.peek(), stage = this.stage.peek();
    const want = this.available.filter((m) => {
      try {
        return !m.enabled || m.enabled(this);
      } catch (e) {
        console.error(`[mmdx] module ${m.id}: enabled() failed`, e);
        return false;
      }
    });
    const ids = new Set(want.map((m) => m.id));
    for (const [id, inst] of [...this.installed]) if (!ids.has(id) || !this.available.includes(inst.module)) this.uninstall(id);
    for (const m of want) {
      const inst = this.installed.get(m.id) ?? this.installModule(m);
      if (!inst) continue;
      inst.scope.setActive(matchesWhen(m.when, mode, stage));
    }
  }

  /** The scope of an installed module (tests, debugging). */
  moduleScope(id: string): ModuleScope<this> | null {
    return this.installed.get(id)?.scope ?? null;
  }

  /** Ids of the installed modules, in install order. */
  get moduleIds(): string[] {
    return [...this.installed.keys()];
  }

  private installModule(m: ViewModule<this>): Installed<this> | null {
    if (m.css) this.addCss(m.css);
    const scope = new Scope(this as unknown as ViewCore<object, Readonly<Record<string, boolean>>>, m as ViewModule<never>);
    const prev = this.installing;
    const prevHook = this.shortcuts.hook;
    this.installing = scope;
    this.shortcuts.hook = (s, remove) => scope.wrapShortcut(s, remove);
    // DOM a module puts straight into the root or the canvas area while installing (not through a slot) is still its
    // own: it is detached while the module is suspended (records taken synchronously, nothing waits for the observer)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => undefined) : null;
    mo?.observe(this.root, { childList: true });
    mo?.observe(this.area, { childList: true });
    try {
      const off = m.install(scope);
      if (typeof off === 'function') scope.onDispose(off);
      for (const r of mo?.takeRecords() ?? [])
        for (const n of r.addedNodes) if (n instanceof Element && n.parentNode === r.target && !n.classList.contains('slot')) scope.adopt(n);
    } catch (e) {
      console.error(`[mmdx] module ${m.id} failed to install`, e);
      scope.dispose();
      return null;
    } finally {
      mo?.disconnect();
      this.installing = prev;
      this.shortcuts.hook = prevHook;
    }
    const inst: Installed<this> = { module: m, scope: scope as unknown as Installed<this>['scope'] };
    this.installed.set(m.id, inst);
    return inst;
  }

  private uninstall(id: string): void {
    const inst = this.installed.get(id);
    if (!inst) return;
    this.installed.delete(id);
    inst.scope.dispose();
  }

  /** Runs `f` with registrations attributed to a module's scope (lazy parts, late registrations). */
  inScope(scope: ModuleScope<this>, f: () => void): void {
    const prev = this.installing, prevHook = this.shortcuts.hook;
    const s = scope as unknown as Scope;
    this.installing = s;
    this.shortcuts.hook = (x, remove) => s.wrapShortcut(x, remove);
    try {
      f();
    } finally {
      this.installing = prev;
      this.shortcuts.hook = prevHook;
    }
  }

  /** Attributes a registration made outside install (e.g. a gesture source) to the installing module, if any. */
  protected track(r: Registration): void {
    this.installing?.register(r);
  }

  /** The scope of the module being installed (null outside install). */
  protected get installingScope(): ModuleScope<this> | null {
    return this.installing as ModuleScope<this> | null;
  }

  // ---- lifecycle --------------------------------------------------------------------------------------------------

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    for (const id of [...this.installed.keys()].reverse()) this.uninstall(id);
    for (const s of this.sceneStack.splice(0).reverse()) {
      s.detach();
      s.destroy?.();
    }
    for (const c of [...this.extraCanvases]) c.destroy();
    this.canvas.destroy();
    for (const c of this.cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (e) {
        console.error('[mmdx] cleanup failed', e);
      }
    }
    this.root.remove();
    for (const el of this.styleEls.values()) el.remove();
    this.styleEls.clear();
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}

interface Installed<C> {
  module: ViewModule<C>;
  scope: Scope & ModuleScope<C>;
}

/** The registrations of one module: muted while suspended, removed on uninstall. */
class Scope implements ModuleScope<never> {
  private readonly regs: Registration[] = [];
  private readonly disposers: (() => void)[] = [];
  private readonly mounts: { el: Element; parent: Element; marker: Comment | null }[] = [];
  private readonly activeSig = signal(true);
  private loaded: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly kernel: ViewCore<object, Readonly<Record<string, boolean>>>, private readonly m: ViewModule<never>) {}

  get core(): never {
    return this.kernel as never;
  }

  get id(): string {
    return this.m.id;
  }

  get active(): boolean {
    return this.activeSig.peek();
  }

  setActive(on: boolean): void {
    if (this.disposed || this.activeSig.peek() === on) return;
    // DOM first (a resumed module's effects may measure it)
    for (const m of this.mounts) {
      if (on && m.marker) {
        m.marker.replaceWith(m.el);
        m.marker = null;
      } else if (!on && !m.marker && m.el.parentNode) {
        m.marker = document.createComment(this.m.id);
        m.el.replaceWith(m.marker);
      }
    }
    for (const r of this.regs) r.set(on);
    this.activeSig.set(on);
  }

  slot(name: SlotName): { append(...els: (Element | null | undefined | false)[]): void } {
    const parent = this.kernel.slots[name];
    return { append: (...els) => els.forEach((el) => el && this.mount(parent, el)) };
  }

  /** Takes an element the module already placed (detached while suspended, removed on uninstall). */
  adopt(el: Element): void {
    if (!el.parentNode || this.mounts.some((m) => m.el === el)) return;
    this.mounts.push({ el, parent: el.parentNode as Element, marker: null });
  }

  mount(parent: Element, el: Element): void {
    if (this.active) parent.append(el);
    else {
      const marker = document.createComment(this.m.id);
      parent.append(marker);
      this.mounts.push({ el, parent, marker });
      return;
    }
    this.mounts.push({ el, parent, marker: null });
  }

  listen(target: EventTarget, type: string, f: (ev: never) => void, opts: AddEventListenerOptions = {}): void {
    const wrapped = (ev: Event): void => {
      if (this.active) f(ev as never);
    };
    target.addEventListener(type, wrapped, opts);
    this.disposers.push(() => target.removeEventListener(type, wrapped, opts));
  }

  effect(f: () => void | (() => void)): void {
    this.disposers.push(effect(() => {
      if (!this.activeSig()) return;
      return f();
    }));
  }

  shortcut(...s: Shortcut[]): void {
    this.kernel.inScope(this as never, () => void this.kernel.shortcuts.add(...s));
  }

  wrapShortcut(s: Shortcut, remove: () => void): Shortcut {
    const own = s.active;
    const out: Shortcut = { ...s, active: () => this.active && (!own || own()) };
    this.disposers.push(() => {
      remove();
      this.kernel.shortcuts.remove(out);
    });
    return out;
  }

  contribute<T>(list: { peek(): readonly T[]; set(v: readonly T[]): void }, item: T): void {
    const add = (): void => {
      if (!list.peek().includes(item)) list.set([...list.peek(), item]);
    };
    const remove = (): void => {
      if (list.peek().includes(item)) list.set(list.peek().filter((x) => x !== item));
    };
    if (this.active) add();
    this.register({ set: (on) => (on ? add() : remove()), dispose: remove });
  }

  register(r: Registration): void {
    this.regs.push(r);
    if (!this.active) r.set(false);
  }

  onDispose(f: () => void): void {
    this.disposers.push(f);
  }

  load(): Promise<void> {
    if (!this.m.load) return Promise.resolve();
    this.loaded ??= this.m.load().then((part) => {
      if (this.disposed) return;
      if (part.css) this.kernel.addCss(part.css);
      this.kernel.inScope(this as never, () => {
        const off = part.activate(this as never);
        if (typeof off === 'function') this.onDispose(off);
      });
    });
    return this.loaded;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.disposers.splice(0).reverse()) {
      try {
        f();
      } catch (e) {
        console.error(`[mmdx] module ${this.m.id}: cleanup failed`, e);
      }
    }
    for (const r of this.regs.splice(0)) r.dispose();
    for (const m of this.mounts.splice(0)) {
      m.el.remove();
      m.marker?.remove();
    }
  }
}
