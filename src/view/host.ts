// The module host of the view kernel (component architecture §7.2): installs the modules of a component in `after`
// order, re-evaluates `enabled` (and the features a module read while installing) and `when` on every refresh, and
// gives each module a Scope that records every registration — DOM, listeners, kernel events, actions, shortcuts,
// effects, computeds, contributions — so it can be suspended, resumed and uninstalled with nothing left behind.
import type { Shortcut, ShortcutRegistry } from '../ui/shortcuts.js';
import { computed, effect, signal, type ReadSignal } from '../ui/signal.js';
import { matchesWhen, orderModules, type ActionsOf, type EventsOf, type ModuleScope, type Registration, type ViewModule } from './module.js';
import type { Mode, SlotName, Stage } from './types.js';

/** What the module host needs from its kernel. */
export interface HostKernel<C> {
  /** What modules get as `scope.core` and `enabled(core)`. */
  readonly core: C;
  readonly slots: Readonly<Record<SlotName, HTMLElement>>;
  readonly shortcuts: ShortcutRegistry;
  /** Elements whose children a module may add straight (not through a slot) while installing: its scope adopts them. */
  readonly adoptFrom: readonly Element[];
  /** The main canvas's picture (`scope.canvas`). */
  canvasSvg(): Element;
  addCss(css: readonly string[]): void;
  mode(): Mode;
  stage(): Stage;
  /** Whether a feature is on, evaluated afresh (not recorded). */
  feature(name: string): boolean;
  isDestroyed(): boolean;
  /** A kernel event listener (not attributed to any module). */
  listen(ev: PropertyKey, cb: (d: never) => void): Registration;
  /** An action provider owned by a scope. */
  provide(name: PropertyKey, f: unknown, owner: { readonly active: boolean }): Registration;
}

export class ModuleHost<C> {
  /** The scope of the module being installed (or activated): registrations made on the core belong to it. */
  installing: Scope<C> | null = null;
  /** The scope whose effect or listener is running (module code after install). */
  running: Scope<C> | null = null;
  private readonly installed = new Map<string, Scope<C>>();
  private available: readonly ViewModule<C>[] = [];
  private refreshing = false;
  private again = false;

  constructor(readonly k: HostKernel<C>) {}

  use(list: readonly ViewModule<C>[]): void {
    this.available = orderModules(list);
    this.refresh();
  }

  add(list: readonly ViewModule<C>[]): () => void {
    const ids = new Set(this.available.map((m) => m.id));
    const added = list.filter((m) => !ids.has(m.id));
    this.available = orderModules([...this.available, ...added]);
    this.refresh();
    return () => {
      this.available = this.available.filter((m) => !added.includes(m));
      this.refresh();
    };
  }

  /**
   * Installs, uninstalls, suspends and resumes modules for the current options, mode and stage. Re-entrant: a refresh
   * asked for while one runs (a module changed the stage while installing or uninstalling) runs once that one ends.
   */
  refresh(): void {
    if (this.k.isDestroyed()) return;
    if (this.refreshing) {
      this.again = true;
      return;
    }
    this.refreshing = true;
    try {
      for (let n = 0; n < 8; n++) {
        this.again = false;
        this.refreshOnce();
        if (!this.again || this.k.isDestroyed()) break;
      }
    } finally {
      this.refreshing = false;
    }
  }

  private refreshOnce(): void {
    const core = this.k.core;
    const want = this.available.filter((m) => {
      try {
        return !m.enabled || m.enabled(core);
      } catch (e) {
        console.error(`[mmdx] module ${m.id}: enabled() failed`, e);
        return false;
      }
    });
    const ids = new Set(want.map((m) => m.id));
    for (const [id, s] of [...this.installed]) if (!ids.has(id) || !this.available.includes(s.module) || s.featuresChanged()) this.uninstall(id);
    for (const m of want) {
      // a module changed the mode, the stage or the set meanwhile: start over with the new state
      if (this.again || this.k.isDestroyed()) return;
      const s = this.installed.get(m.id) ?? this.install(m);
      s?.setActive(matchesWhen(m.when, this.k.mode(), this.k.stage()));
    }
  }

  scope(id: string): Scope<C> | null {
    return this.installed.get(id) ?? null;
  }

  get ids(): string[] {
    return [...this.installed.keys()];
  }

  private install(m: ViewModule<C>): Scope<C> | null {
    if (m.css) this.k.addCss(m.css);
    const scope = new Scope<C>(this, m);
    // a module whose `when` does not match installs suspended (nothing of it shows or runs until it resumes)
    scope.setActive(matchesWhen(m.when, this.k.mode(), this.k.stage()));
    try {
      this.within(scope, () => {
        const off = m.install(scope);
        if (typeof off === 'function') scope.onDispose(off);
      });
    } catch (e) {
      console.error(`[mmdx] module ${m.id} failed to install`, e);
      scope.dispose();
      return null;
    }
    this.installed.set(m.id, scope);
    return scope;
  }

  private uninstall(id: string): void {
    const s = this.installed.get(id);
    if (!s) return;
    this.installed.delete(id);
    s.dispose();
  }

  /** Uninstalls every module, last installed first. */
  clear(): void {
    for (const id of [...this.installed.keys()].reverse()) this.uninstall(id);
  }

  /**
   * Runs `f` with the registrations made on the core attributed to `scope` (install, lazy parts, late
   * registrations). DOM it puts straight into the root or the canvas area (not through a slot) is the module's own
   * too: detached while suspended (records taken synchronously, nothing waits for the observer).
   */
  within(scope: Scope<C>, f: () => void): void {
    const prev = this.installing, prevHook = this.k.shortcuts.hook;
    this.installing = scope;
    this.k.shortcuts.hook = (s, remove) => scope.wrapShortcut(s, remove);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => undefined) : null;
    for (const el of this.k.adoptFrom) mo?.observe(el, { childList: true });
    try {
      f();
    } finally {
      for (const r of mo?.takeRecords() ?? [])
        for (const n of r.addedNodes) if (n instanceof Element && n.parentNode === r.target && !n.classList.contains('slot')) scope.adopt(n);
      mo?.disconnect();
      this.installing = prev;
      this.k.shortcuts.hook = prevHook;
    }
  }

  /** Runs module code (an effect, a listener) of `scope`, so registrations it makes on the core can be told apart. */
  run<T>(scope: Scope<C>, f: () => T): T {
    const prev = this.running;
    this.running = scope;
    try {
      return f();
    } finally {
      this.running = prev;
    }
  }
}

/** The registrations of one module: muted while suspended, removed on uninstall. */
export class Scope<C> implements ModuleScope<C> {
  private readonly regs: Registration[] = [];
  private readonly disposers: (() => void)[] = [];
  private readonly mounts: { el: Element; parent: Element; marker: Comment | null }[] = [];
  private readonly activeSig = signal(true);
  /** Features read while installing, with the value they had (a change installs the module again). */
  private readonly features = new Map<string, boolean>();
  private loaded: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly host: ModuleHost<C>, readonly module: ViewModule<C>) {}

  get core(): C {
    return this.host.k.core;
  }

  get id(): string {
    return this.module.id;
  }

  get active(): boolean {
    return this.activeSig.peek();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  noteFeature(name: string, on: boolean): void {
    if (!this.features.has(name)) this.features.set(name, on);
  }

  featuresChanged(): boolean {
    for (const [name, on] of this.features) if (this.host.k.feature(name) !== on) return true;
    return false;
  }

  setActive(on: boolean): void {
    if (this.disposed || this.activeSig.peek() === on) return;
    // DOM first (a resumed module's effects may measure it)
    for (const m of this.mounts) {
      if (on && m.marker) {
        m.marker.replaceWith(m.el);
        m.marker = null;
      } else if (!on && !m.marker && m.el.parentNode) {
        m.marker = document.createComment(this.id);
        m.el.replaceWith(m.marker);
      }
    }
    for (const r of this.regs) r.set(on);
    this.activeSig.set(on);
  }

  slot(name: SlotName): { append(...els: (Element | null | undefined | false)[]): void } {
    const parent = this.host.k.slots[name];
    return { append: (...els) => els.forEach((el) => el && this.mount(parent, el)) };
  }

  /** Takes an element the module already placed (detached while suspended, removed on uninstall). */
  adopt(el: Element): void {
    if (!el.parentNode || this.mounts.some((m) => m.el === el)) return;
    this.mounts.push({ el, parent: el.parentNode as Element, marker: null });
  }

  mount(parent: Element, el: Element): void {
    if (this.disposed) return;
    if (this.active) {
      parent.append(el);
      this.mounts.push({ el, parent, marker: null });
      return;
    }
    const marker = document.createComment(this.id);
    parent.append(marker);
    this.mounts.push({ el, parent, marker });
  }

  listen(target: EventTarget, type: string, f: (ev: never) => void, opts: AddEventListenerOptions = {}): void {
    const wrapped = (ev: Event): void => {
      if (this.active) this.host.run(this, () => f(ev as never));
    };
    target.addEventListener(type, wrapped, opts);
    this.disposers.push(() => target.removeEventListener(type, wrapped, opts));
  }

  canvas(type: string, f: (ev: never) => void): void {
    this.listen(this.host.k.canvasSvg(), type, f);
  }

  on<K extends keyof EventsOf<C>>(ev: K, cb: (d: EventsOf<C>[K]) => void): void {
    this.register(this.host.k.listen(ev, (d) => this.host.run(this, () => cb(d))));
  }

  provide<K extends keyof ActionsOf<C>>(name: K, f: ActionsOf<C>[K]): void {
    this.register(this.host.k.provide(name, f, this));
  }

  effect(f: () => void | (() => void)): void {
    this.disposers.push(effect(() => {
      if (!this.activeSig()) return;
      return this.host.run(this, f);
    }));
  }

  computed<T>(f: () => T): ReadSignal<T> {
    const c = computed(f);
    this.disposers.push(c.dispose);
    return c;
  }

  shortcut(...s: Shortcut[]): void {
    this.host.within(this, () => void this.host.k.shortcuts.add(...s));
  }

  wrapShortcut(s: Shortcut, remove: () => void): Shortcut {
    const own = s.active;
    const out: Shortcut = { ...s, active: () => this.active && (!own || own()) };
    this.disposers.push(() => {
      remove();
      this.host.k.shortcuts.remove(out);
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
    // registered after uninstall (a late async step): removed at once
    if (this.disposed) {
      r.dispose();
      return;
    }
    this.regs.push(r);
    if (!this.active) r.set(false);
  }

  onDispose(f: () => void): void {
    if (this.disposed) f();
    else this.disposers.push(f);
  }

  load(): Promise<void> {
    const load = this.module.load;
    if (!load) return Promise.resolve();
    this.loaded ??= load().then((part) => {
      if (this.disposed) return;
      if (part.css) this.host.k.addCss(part.css);
      this.host.within(this, () => {
        const off = part.activate(this);
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
        console.error(`[mmdx] module ${this.id}: cleanup failed`, e);
      }
    }
    for (const r of this.regs.splice(0)) r.dispose();
    for (const m of this.mounts.splice(0)) {
      m.el.remove();
      m.marker?.remove();
    }
  }
}
