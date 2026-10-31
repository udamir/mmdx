// The module contract (component architecture §7.2). A feature is a module: it installs slot DOM, listeners,
// shortcuts, actions (and in the editor gestures and overlay painters) through a scope that records every
// registration, so the kernel can suspend it when its `when` no longer matches (detach its DOM, mute its listeners,
// shortcuts, actions, gestures and painters, keep its state), resume it, and uninstall it with nothing left behind.
import type { Shortcut } from '../ui/shortcuts.js';
import type { Mode, SlotName, Stage } from './types.js';

/** What a module needs from its host (ViewCore implements it; kept structural to avoid an import cycle). */
export interface ModuleHostCore {
  readonly mode: { peek(): Mode };
  readonly stage: { peek(): Stage };
}

export interface ModuleWhen {
  mode?: readonly Mode[];
  stage?: readonly Stage[];
}

export interface ViewModule<C = unknown> {
  id: string;
  /** Install after these modules (ids); replaces reliance on list order. */
  after?: readonly string[];
  /** Active only in these modes / stages (default: all). Inactive = suspended by the kernel. */
  when?: ModuleWhen;
  /** Re-evaluated when features, controls or options change; false uninstalls, true installs. */
  enabled?(core: C): boolean;
  /** Eager part: slot DOM (buttons), shortcuts, cheap listeners. Every registration goes through the scope. */
  install(scope: ModuleScope<C>): void | (() => void);
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
  slot(name: SlotName): { append(...els: (Element | null | undefined | false)[]): void };
  /** Adds an element to a parent the module owns the placement of (detached while suspended). */
  mount(parent: Element, el: Element): void;
  /** A muted-while-suspended listener on a DOM target, removed on uninstall. */
  listen<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, f: (ev: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  /** Runs `f` now and whenever a signal it reads changes, while active (re-run on resume). */
  effect(f: () => void | (() => void)): void;
  shortcut(...s: Shortcut[]): void;
  /** Adds an item to a list the kernel renders (dock buttons, export formats, panels); removed while suspended. */
  contribute<T>(list: { peek(): readonly T[]; set(v: readonly T[]): void }, item: T): void;
  /** A registration made by the core (an event listener, an action, a gesture source…), muted while suspended. */
  register(r: Registration): void;
  /** A cleanup run on uninstall. */
  onDispose(f: () => void): void;
  /** Loads the module's lazy part (once) and activates it in this scope. */
  load(): Promise<void>;
}

/** Orders modules so each one comes after the modules it names in `after` (stable otherwise). */
export function orderModules<M extends { id: string; after?: readonly string[] }>(list: readonly M[]): M[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  const out: M[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: M): void => {
    const s = state.get(m.id);
    if (s === 'done' || s === 'visiting') return; // a cycle keeps list order
    state.set(m.id, 'visiting');
    for (const dep of m.after ?? []) {
      const d = byId.get(dep);
      if (d) visit(d);
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
 * `when` and `enabled`; the real module's `install` runs in the same scope once its chunk arrived.
 */
export function lazyModule<C>(stub: Omit<ViewModule<C>, 'install' | 'load' | 'css'>, load: () => Promise<ViewModule<C>>): ViewModule<C> {
  return {
    ...stub,
    install(scope) {
      void scope.load();
    },
    load: async () => {
      const real = await load();
      return { css: real.css ?? [], activate: (scope) => real.install(scope) };
    },
  };
}
