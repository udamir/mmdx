// The module host of the view kernel (component architecture §7.2): installs the modules of a component in `after`
// order, re-evaluates `enabled` (and the features a module read while installing) and `when` on every refresh, and
// gives each module a Scope that records every registration — DOM, listeners, kernel events, actions, shortcuts,
// effects, computeds, contributions — so it can be suspended, resumed and uninstalled with nothing left behind. It
// holds the kernel's events and actions, which the kernel types per product (bus.ts).
import type { Shortcut } from '../ui/kit/keys.js';
import type { ShortcutRegistry } from './keymap.js';
import { Owner } from '../reactive/owner.js';
import { computed, effect, signal, type ReadSignal } from '../reactive/signal.js';
import { actionRegistry, eventBus } from './bus.js';
import { matchesWhen, orderModules, type ActionsOf, type EventsOf, type GestureOf, type ModuleScope, type PainterOf, type Registration, type ViewModule } from './module.js';
import type { Mode, SlotName, Stage } from './types.js';

/** What the module host needs from its kernel (ViewCore). */
export interface HostCore {
  readonly slots: Readonly<Record<SlotName, HTMLElement>>;
  readonly shortcuts: ShortcutRegistry;
  /** Modules may add children straight to these (not through a slot) while installing: their scope adopts them. */
  readonly root: HTMLElement;
  readonly area: HTMLElement;
  /** The main canvas (`scope.canvas` listens on its picture). */
  readonly canvas: { readonly svg: Element };
  readonly mode: ReadSignal<Mode>;
  readonly stage: ReadSignal<Stage>;
  readonly isDestroyed: boolean;
  addCss(css: readonly string[]): void;
  removeCss(css: readonly string[]): void;
  /** Whether a feature is on (outside install, nothing is recorded). */
  feature(name: string): boolean;
}

export class ModuleHost<C extends HostCore> {
  readonly bus = eventBus<Record<PropertyKey, unknown>>();
  readonly actions = actionRegistry<Record<PropertyKey, unknown>>();
  /** The scope of the module being installed (or activated): registrations made on the core belong to it. */
  installing: Scope<C> | null = null;
  /** The scope whose effect or listener is running (module code after install). */
  running: Scope<C> | null = null;
  private readonly installed = new Map<string, Scope<C>>();
  private available: readonly ViewModule<C>[] = [];
  /** The product's modules (`use`) and the sets added on top of them (`add`, e.g. History's), kept apart. */
  private base: readonly ViewModule<C>[] = [];
  private added: (readonly ViewModule<C>[])[] = [];
  private refreshing = false;
  private again = false;

  constructor(readonly core: C) {}

  /** Replaces the product's modules; the sets added with `add` stay. */
  use(list: readonly ViewModule<C>[]): void {
    this.base = list;
    this.order();
  }

  add(list: readonly ViewModule<C>[]): () => void {
    const added = [...list];
    this.added.push(added);
    this.order();
    return () => {
      this.added = this.added.filter((l) => l !== added);
      this.order();
    };
  }

  /**
   * The modules on offer: the product's, then each added set. A module's `replaces` takes the modules of those ids
   * out of the sets before it (History's layers-only view settings over the viewer's); otherwise an id offered twice
   * is a mistake: the first stays and the other is reported (B43: it was dropped silently).
   */
  private order(): void {
    const sets = [this.base, ...this.added];
    const out: ViewModule<C>[] = [];
    for (const set of sets) {
      const gone = new Set(set.flatMap((m) => m.replaces ?? []));
      for (let i = out.length - 1; i >= 0; i--) if (gone.has(out[i]!.id)) out.splice(i, 1);
      for (const m of set) {
        if (out.some((x) => x.id === m.id)) console.warn(`[mmdx] module ${m.id} is offered twice: the first is kept (declare \`replaces\` to replace it)`);
        else out.push(m);
      }
    }
    this.available = orderModules(out);
    this.refresh();
  }

  /**
   * Installs, uninstalls, suspends and resumes modules for the current options, mode and stage. Re-entrant: a refresh
   * asked for while one runs (a module changed the stage while installing or uninstalling) runs once that one ends.
   */
  refresh(): void {
    if (this.core.isDestroyed) return;
    if (this.refreshing) {
      this.again = true;
      return;
    }
    this.refreshing = true;
    try {
      for (let n = 0; n < 8; n++) {
        this.again = false;
        this.refreshOnce();
        if (!this.again || this.core.isDestroyed) break;
      }
    } finally {
      this.refreshing = false;
    }
  }

  private refreshOnce(): void {
    const core = this.core;
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
      if (this.again || core.isDestroyed) return;
      (this.installed.get(m.id) ?? this.install(m))?.setActive(this.matches(m));
    }
  }

  scope(id: string): Scope<C> | null {
    return this.installed.get(id) ?? null;
  }

  get ids(): string[] {
    return [...this.installed.keys()];
  }

  private matches(m: ViewModule<C>): boolean {
    return matchesWhen(m.when, this.core.mode.peek(), this.core.stage.peek());
  }

  private install(m: ViewModule<C>): Scope<C> | null {
    if (m.css) this.core.addCss(m.css);
    const scope = new Scope<C>(this, m);
    // a module whose `when` does not match installs suspended (nothing of it shows or runs until it resumes)
    scope.setActive(this.matches(m));
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
    // its sheets go with it (one another module still uses stays)
    if (s.module.css) this.core.removeCss(s.module.css);
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
    const keys = this.core.shortcuts;
    const prev = this.installing, prevHook = keys.hook;
    this.installing = scope;
    keys.hook = (s, remove) => scope.wrapShortcut(s, remove);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => undefined) : null;
    for (const el of [this.core.root, this.core.area]) mo?.observe(el, { childList: true });
    try {
      f();
    } finally {
      for (const r of mo?.takeRecords() ?? [])
        for (const n of r.addedNodes) if (n instanceof Element && n.parentNode === r.target && !n.classList.contains('slot')) scope.adopt(n);
      mo?.disconnect();
      this.installing = prev;
      keys.hook = prevHook;
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
export class Scope<C extends HostCore> implements ModuleScope<C> {
  private readonly regs: Registration[] = [];
  /** What the module set up through this scope, let go on uninstall. */
  private readonly owner: Owner;
  private readonly mounts: { el: Element; parent: Element; marker: Comment | null }[] = [];
  private readonly activeSig = signal(true);
  /** Features read while installing, with the value they had (a change installs the module again). */
  private readonly features = new Map<string, boolean>();
  private loaded: Promise<void> | null = null;
  private disposed = false;

  readonly core: C;

  constructor(private readonly host: ModuleHost<C>, readonly module: ViewModule<C>) {
    this.core = host.core;
    this.owner = new Owner(`module ${module.id}`);
  }

  get id(): string {
    return this.module.id;
  }

  get active(): boolean {
    return this.activeSig.peek();
  }

  noteFeature(name: string, on: boolean): void {
    if (!this.features.has(name)) this.features.set(name, on);
  }

  featuresChanged(): boolean {
    for (const [name, on] of this.features) if (this.core.feature(name) !== on) return true;
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
    const parent = this.core.slots[name];
    return { append: (...els) => els.forEach((el) => el && void this.mount(parent, el)) };
  }

  /** Takes an element the module already placed (detached while suspended, removed on uninstall). */
  adopt(el: Element): void {
    if (!el.parentNode || this.mounts.some((m) => m.el === el)) return;
    this.mounts.push({ el, parent: el.parentNode as Element, marker: null });
  }

  mount(parent: Element, el: Element): () => void {
    if (this.disposed) return () => undefined;
    const m = { el, parent, marker: this.active ? null : document.createComment(this.id) };
    parent.append(m.marker ?? el);
    this.mounts.push(m);
    return () => {
      const i = this.mounts.indexOf(m);
      if (i >= 0) this.mounts.splice(i, 1);
      m.el.remove();
      m.marker?.remove();
    };
  }

  listen(target: EventTarget, type: string, f: (ev: never) => void, opts: AddEventListenerOptions = {}): void {
    const wrapped = (ev: Event): void => {
      if (this.active) this.host.run(this, () => f(ev as never));
    };
    target.addEventListener(type, wrapped, opts);
    this.owner.add(() => target.removeEventListener(type, wrapped, opts));
  }

  canvas(type: string, f: (ev: never) => void): void {
    this.listen(this.core.canvas.svg, type, f);
  }

  on<K extends keyof EventsOf<C>>(ev: K, cb: (d: EventsOf<C>[K]) => void): void {
    this.register(this.host.bus.on(ev, (d) => this.host.run(this, () => cb(d as EventsOf<C>[K]))));
  }

  provide<K extends keyof ActionsOf<C>>(name: K, f: ActionsOf<C>[K]): void {
    this.register(this.host.actions.provide(name, f, this));
  }

  provideDefault<K extends keyof ActionsOf<C>>(name: K, f: ActionsOf<C>[K]): void {
    this.register(this.host.actions.provide(name, f, this, true));
  }

  effect(f: () => void | (() => void)): void {
    this.owner.add(effect(() => {
      if (!this.activeSig()) return;
      return this.host.run(this, f);
    }));
  }

  computed<T>(f: () => T): ReadSignal<T> {
    const c = computed(f);
    this.owner.add(c.dispose);
    return c;
  }

  shortcut(...s: Shortcut[]): void {
    this.host.within(this, () => void this.core.shortcuts.add(...s));
  }

  wrapShortcut(s: Shortcut, remove: () => void): Shortcut {
    const own = s.active;
    const out: Shortcut = { ...s, active: () => this.active && (!own || own()) };
    this.owner.add(() => {
      remove();
      this.core.shortcuts.remove(out);
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

  contributeAll<T>(list: { peek(): readonly T[]; set(v: readonly T[]): void }): { set(items: readonly T[]): void } {
    let mine: readonly T[] = [];
    const put = (next: readonly T[]): void => {
      const others = list.peek().filter((x) => !mine.includes(x));
      list.set([...others, ...next]);
    };
    this.register({ set: (on) => put(on ? mine : []), dispose: () => put([]) });
    return {
      set: (items) => {
        // the old entries out, the new ones in (only while active; a resume puts them back)
        put(this.active ? items : []);
        mine = items;
      },
    };
  }

  claim<T>(slot: { peek(): T | null; set(v: T | null): void }): { set(v: T | null): void } {
    let mine: T | null = null;
    const show = (on: boolean): void => {
      if (on && mine !== null) slot.set(mine);
      else if (!on && mine !== null && slot.peek() === mine) slot.set(null);
    };
    this.register({ set: show, dispose: () => show(false) });
    return {
      set: (v) => {
        const prev = mine;
        mine = v;
        if (!this.active) return;
        if (v !== null) slot.set(v);
        else if (prev !== null && slot.peek() === prev) slot.set(null);
      },
    };
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

  gesture(s: GestureOf<C>): void {
    this.onDispose((this.core as unknown as { addGestureSource(s: GestureOf<C>): () => void }).addGestureSource(s));
  }

  painter(p: PainterOf<C>): void {
    this.onDispose((this.core as unknown as { addOverlay(p: PainterOf<C>): () => void }).addOverlay(p));
  }

  onDispose(f: () => void): void {
    if (this.disposed) f();
    else this.owner.add(f);
  }

  /** Loads and activates the lazy part once; a failed load is not kept (the next call tries again). */
  load(): Promise<void> {
    const load = this.module.load;
    if (!load) return Promise.resolve();
    this.loaded ??= load().then((part) => {
      if (this.disposed) return;
      if (part.css) {
        const css = part.css;
        this.core.addCss(css);
        this.onDispose(() => this.core.removeCss(css));
      }
      this.host.within(this, () => {
        const off = part.activate(this);
        if (typeof off === 'function') this.onDispose(off);
      });
    }, (e: unknown) => {
      this.loaded = null;
      throw e;
    });
    return this.loaded;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    for (const r of this.regs.splice(0)) r.dispose();
    for (const m of this.mounts.splice(0)) {
      m.el.remove();
      m.marker?.remove();
    }
  }
}
