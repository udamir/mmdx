// The kernel's events and actions (component architecture §7.2): typed maps per product. Modules never reach into
// another module; they talk through these. Every listener and provider is a `Registration`, so the module scope that
// made it can mute it while the module is suspended and remove it on uninstall.
import type { Registration } from './module.js';

type Listener = { cb: (d: never) => void; muted: boolean };

/** Events by name (payload `void`: none). */
export class EventBus<E> {
  private readonly listeners = new Map<keyof E, Set<Listener>>();

  on<K extends keyof E>(ev: K, cb: (d: E[K]) => void): Registration {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    const l: Listener = { cb, muted: false };
    set.add(l);
    return { set: (on) => void (l.muted = !on), dispose: () => void set.delete(l) };
  }

  fire<K extends keyof E>(ev: K, d: E[K]): void {
    for (const l of [...(this.listeners.get(ev) ?? [])]) if (!l.muted) (l.cb as (d: E[K]) => void)(d);
  }
}

type Provided = { f: (...args: never[]) => unknown; owner: { readonly active: boolean } | null };

/** Actions by name; the newest provider whose owner is active answers (a suspended one gives the action back). */
export class ActionRegistry<A> {
  private readonly map = new Map<keyof A, Provided[]>();

  provide<K extends keyof A>(name: K, f: A[K], owner: { readonly active: boolean } | null): Registration {
    const p: Provided = { f: f as (...args: never[]) => unknown, owner };
    const list = this.map.get(name) ?? [];
    list.push(p);
    this.map.set(name, list);
    return {
      set: () => undefined,
      dispose: () => {
        const i = list.indexOf(p);
        if (i >= 0) list.splice(i, 1);
      },
    };
  }

  private provider(name: keyof A): Provided | undefined {
    const list = this.map.get(name) ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      if (!p.owner || p.owner.active) return p;
    }
    return undefined;
  }

  has(name: keyof A): boolean {
    return !!this.provider(name);
  }

  run<K extends keyof A>(name: K, args: unknown[]): unknown {
    const p = this.provider(name);
    return p ? (p.f as (...a: unknown[]) => unknown)(...args) : undefined;
  }
}
