// Owner (A3): one place that owns what a component, block or module set up — effects, computeds, DOM listeners and
// any other undo function — and lets it all go at once. Disposal runs in reverse order of setup; a cleanup that throws
// is reported and does not stop the others. What is added after dispose() runs at once (a late async step).
import { computed, effect, type Computed } from './signal.js';

export class Owner {
  /** @param name what a failed cleanup's report names */
  constructor(private readonly name = 'owner') {}

  private readonly ac = new AbortController();
  private readonly offs: (() => void)[] = [];
  private gone = false;

  /** Aborted on dispose: pass it to `addEventListener` or `fetch`. */
  get signal(): AbortSignal {
    return this.ac.signal;
  }

  get disposed(): boolean {
    return this.gone;
  }

  /** Runs `off` on dispose (at once when already disposed). */
  add(off: () => void): void {
    if (this.gone) off();
    else this.offs.push(off);
  }

  /** Runs `f` now and whenever a signal it reads changes, until dispose; a function it returns runs before the next run. */
  effect(f: () => unknown): void {
    this.add(effect(() => {
      const r = f();
      return typeof r === 'function' ? (r as () => void) : undefined;
    }));
  }

  /** A computed value disposed with the owner. */
  computed<T>(f: () => T): Computed<T> {
    const c = computed(f);
    this.add(c.dispose);
    return c;
  }

  /** A DOM listener removed on dispose. */
  on<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, f: (ev: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions = {}): void {
    target.addEventListener(type, f as EventListener, { ...opts, signal: this.ac.signal });
  }

  dispose(): void {
    if (this.gone) return;
    this.gone = true;
    this.ac.abort();
    for (const off of this.offs.splice(0).reverse()) {
      try {
        off();
      } catch (e) {
        console.error(`[mmdx] ${this.name}: cleanup failed`, e);
      }
    }
  }
}
