// The kernel's events and actions (component architecture §7.2): typed maps per product. Modules never reach into
// another module; they talk through these. Every listener and provider is a `Registration`, so the module scope that
// made it can mute it while the module is suspended and remove it on uninstall.
import type { Registration } from './module.js';

/** Events by name (payload `void`: none). */
export interface EventBus<E> {
  on<K extends keyof E>(ev: K, cb: (d: E[K]) => void): Registration;
  fire<K extends keyof E>(ev: K, d: E[K]): void;
}

export function eventBus<E>(): EventBus<E> {
  type Listener = { cb: (d: never) => void; muted: boolean };
  const listeners = new Map<keyof E, Set<Listener>>();
  return {
    on(ev, cb) {
      let set = listeners.get(ev);
      if (!set) listeners.set(ev, (set = new Set()));
      const l: Listener = { cb, muted: false };
      set.add(l);
      return { set: (on) => void (l.muted = !on), dispose: () => void set.delete(l) };
    },
    fire(ev, d) {
      for (const l of [...(listeners.get(ev) ?? [])]) if (!l.muted) (l.cb as (d: unknown) => void)(d);
    },
  };
}

/** Actions by name; the newest provider whose owner is active answers (a suspended one gives the action back). */
export interface ActionRegistry<A> {
  provide<K extends keyof A>(name: K, f: A[K], owner: { readonly active: boolean } | null): Registration;
  has(name: keyof A): boolean;
  run(name: keyof A, args: unknown[]): unknown;
}

export function actionRegistry<A>(): ActionRegistry<A> {
  type Provided = { f: unknown; owner: { readonly active: boolean } | null };
  const map = new Map<keyof A, Provided[]>();
  const provider = (name: keyof A): Provided | undefined => {
    const list = map.get(name) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      if (!p.owner || p.owner.active) return p;
    }
    return undefined;
  };
  return {
    provide(name, f, owner) {
      const p: Provided = { f, owner };
      const list = map.get(name) ?? [];
      list.push(p);
      map.set(name, list);
      return {
        set: () => undefined,
        dispose: () => {
          const i = list.indexOf(p);
          if (i >= 0) list.splice(i, 1);
        },
      };
    },
    has: (name) => !!provider(name),
    run(name, args) {
      const p = provider(name);
      return p ? (p.f as (...a: unknown[]) => unknown)(...args) : undefined;
    },
  };
}
