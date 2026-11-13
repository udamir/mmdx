// The module contract (component architecture §7.2). A feature is a module: it installs slot DOM, listeners,
// shortcuts, actions (and in the editor gestures and overlay painters) through a scope that records every
// registration, so the kernel can suspend it when its `when` no longer matches (detach its DOM, mute its listeners,
// shortcuts, actions, gestures and painters, keep its state), resume it, and uninstall it with nothing left behind.
import type { Shortcut } from '../ui/kit/keys.js';
import type { ReadSignal } from '../reactive/signal.js';
import type { KernelList, KernelSlot } from './kernel-lists.js';
import type { Mode, SlotName, Stage } from './types.js';

export interface ModuleWhen {
  mode?: readonly Mode[];
  stage?: readonly Stage[];
  /**
   * Installed only while the document is of one of these diagram types (A11d: a kind's own gestures and panels; a
   * lazy module's code loads then). Read from the core's `docType`; a product without one installs the module.
   */
  kind?: readonly string[];
}

/** The action map of a kernel type (`ViewCore<Actions, …>`). */
export type ActionsOf<C> = C extends { readonly $actions: infer A } ? A : never;
/** The event map of a kernel type (`ViewCore<…, Events>`). */
export type EventsOf<C> = C extends { readonly $events: infer E } ? E : never;
/** The gesture sources a core takes (the editor's; `never` for a core without them). */
export type GestureOf<C> = C extends { addGestureSource(s: infer S): () => void } ? S : never;
/** The overlay painters a core takes (the editor's; `never` for a core without them). */
export type PainterOf<C> = C extends { addOverlay(p: infer P): () => void } ? P : never;

export interface ViewModule<C = unknown> {
  id: string;
  /** Ids of modules this one replaces while it is offered (an added set's module over the product's). */
  replaces?: readonly string[];
  /** Install after these modules (ids); replaces reliance on list order. */
  after?: readonly string[];
  /** Active only in these modes / stages (default: all). Inactive = suspended by the kernel. */
  when?: ModuleWhen;
  /**
   * Re-evaluated when features, controls or options change (`refreshModules()`); false uninstalls, true installs. A
   * module that read `core.feature()` while installing is installed again when one of those features changed.
   */
  enabled?: (core: C) => boolean;
  /** Eager part: slot DOM (buttons), shortcuts, cheap listeners. Every registration goes through the scope. */
  // properties, not methods (A6): a module of one product's core is not accepted where another's is wanted
  install: (scope: ModuleScope<C>) => void | (() => void);
  /** Lazy part, loaded on first use (`scope.load()`); its CSS is adopted then. */
  load?(): Promise<{ css?: readonly string[]; activate(scope: ModuleScope<C>): void | (() => void) }>;
  /** Scoped CSS adopted into the component's shadow root while the module is installed. */
  css?: readonly string[];
}

/** One registration a scope can mute and unmute (suspend / resume) and remove (uninstall). */
export interface Registration {
  /** Turns the registration on (`true`) or off; idempotent. */
  set(on: boolean): void;
  /** Removes it for good. */
  dispose(): void;
}

export interface ModuleScope<C = unknown> {
  readonly core: C;
  readonly id: string;
  /** True while the module is active (not suspended). */
  readonly active: boolean;
  /** Appends DOM to a named slot; detached while suspended. */
  slot(name: SlotName): {
    append(...els: (Element | null | undefined | false)[]): void;
    /** Places one element, for one the module shows and takes away repeatedly; returns its unmount (`mount`). */
    mount(el: Element): () => void;
  };
  /**
   * Places an element into a parent (at any time, also after install): detached while suspended, removed on
   * uninstall. Returns an unmount (removes it now and forgets it), for elements a module creates and drops repeatedly.
   */
  mount(parent: Element, el: Element): () => void;
  /** A muted-while-suspended listener on a DOM target, removed on uninstall. */
  listen<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, f: (ev: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, f: (ev: Event) => void, opts?: AddEventListenerOptions): void;
  /** A listener on the canvas area (every canvas of the scene shown and the chrome over them), muted while suspended, removed on uninstall. */
  area<K extends keyof HTMLElementEventMap>(type: K, f: (ev: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  /** A listener on the main canvas's picture (`<svg>`), muted while suspended, removed on uninstall. */
  canvas<K extends keyof SVGElementEventMap>(type: K, f: (ev: SVGElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  /** A kernel event listener, muted while suspended, removed on uninstall. */
  on<K extends keyof EventsOf<C>>(ev: K, cb: (d: EventsOf<C>[K]) => void): void;
  /** Provides an action: muted while suspended (the previous provider answers), removed on uninstall. */
  provide<K extends keyof ActionsOf<C>>(name: K, f: ActionsOf<C>[K]): void;
  /** Provides an action that answers only when no other provider does (a fallback; removed on uninstall). */
  provideDefault<K extends keyof ActionsOf<C>>(name: K, f: ActionsOf<C>[K]): void;
  /** Runs `f` now and whenever a signal it reads changes, while active (re-run on resume). */
  effect(f: () => void | (() => void)): void;
  /** A computed value disposed on uninstall. */
  computed<T>(f: () => T): ReadSignal<T>;
  shortcut(...s: Shortcut[]): void;
  /** A gesture source of the core (the editor's pointer gestures), muted while suspended, removed on uninstall. */
  gesture(s: GestureOf<C>): void;
  /** An overlay painter of the core (the editor's handles and marks), muted while suspended, removed on uninstall. */
  painter(p: PainterOf<C>): void;
  /** Adds an item to a list the kernel renders (dock buttons, export formats, panels); removed while suspended. */
  contribute<T>(list: KernelList<T>, item: T): void;
  /** The module's entries in a kernel list, replaced as a whole (`set`); out while suspended, removed on uninstall. */
  contributeAll<T>(list: KernelList<T>): { set(items: readonly T[]): void };
  /**
   * A one-value kernel slot (the dock's flyout, the pen's strokes) the module fills (`set`; null gives it back):
   * cleared while the module is suspended and on uninstall, when it still holds the module's value (A7).
   */
  claim<T>(slot: KernelSlot<T>): { set(v: T | null): void };
  /** A registration made by the core (an event listener, an action, a gesture source…), muted while suspended. */
  register(r: Registration): void;
  /** A cleanup run on uninstall. */
  onDispose(f: () => void): void;
  /** Loads the module's lazy part (once) and activates it in this scope. */
  load(): Promise<void>;
}

/**
 * Orders modules so each one comes after the modules it names in `after` (stable otherwise). A cycle keeps list
 * order; `after` naming a module not in the list is ignored. Both are reported, as they are mistakes of a module set.
 */
export function orderModules<M extends { id: string; after?: readonly string[] }>(list: readonly M[], warn: (msg: string) => void = (m) => console.warn(`[mmdx] ${m}`)): M[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  const out: M[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: M): void => {
    const s = state.get(m.id);
    if (s === 'done') return;
    if (s === 'visiting') {
      warn(`${m.id}: "after" cycle`);
      return;
    }
    state.set(m.id, 'visiting');
    for (const dep of m.after ?? []) {
      const d = byId.get(dep);
      if (d) visit(d);
      else warn(`${m.id}: "after" ${dep} missing`);
    }
    state.set(m.id, 'done');
    out.push(m);
  };
  for (const m of list) visit(m);
  return out;
}

export const matchesWhen = (w: ModuleWhen | undefined, mode: Mode, stage: Stage): boolean =>
  (!w?.mode || w.mode.includes(mode)) && (!w?.stage || w.stage.includes(stage));

/**
 * A module whose code loads on first install (component architecture §10): the stub carries the id, ordering,
 * `when` and `enabled`, which the kernel needs before the chunk arrives (the stub's `when` and `after` are the ones
 * that apply); the real module's `install` runs in the same scope once its chunk arrived, and its own `enabled`
 * applies too from then on.
 */
export function lazyModule<C>(stub: Omit<ViewModule<C>, 'install' | 'load' | 'css'>, load: () => Promise<ViewModule<C>>): ViewModule<C> {
  let real: ViewModule<C> | null = null;
  return {
    ...stub,
    enabled: (core) => (stub.enabled?.(core) ?? true) && (real?.enabled?.(core) ?? true),
    install(scope) {
      scope.load().catch((e: unknown) => console.error(`[mmdx] module ${stub.id} failed to load`, e));
    },
    load: async () => {
      const m = (real = await load());
      return { css: m.css ?? [], activate: (scope) => m.install(scope) };
    },
  };
}
