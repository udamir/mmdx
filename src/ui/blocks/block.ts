// The block contract (component architecture §5.1): small, host-agnostic UI pieces that take plain values, signals
// and callbacks, and know nothing about diagrams, editors or the kernel. A block is created by a `createX(props)`
// function returning a handle; its CSS is a fragment the host adopts (deduplicated by identity), written against the
// `--mmdx-*` tokens only.
import type { I18n } from '../i18n.js';
import { effect, type ReadSignal } from '../signal.js';

/** The translation function every block takes its strings through. */
export type Translate = I18n['t'];

/** A value a block reads: a plain value, or a signal it follows. */
export type Value<T> = T | ReadSignal<T>;

/** Reads a plain value or a signal (tracked inside an effect). */
export const read = <T>(v: Value<T>): T => (typeof v === 'function' ? (v as ReadSignal<T>)() : v);

export const isSignal = <T>(v: Value<T>): v is ReadSignal<T> => typeof v === 'function';

export interface BlockHandle<P> {
  readonly el: HTMLElement;
  /** Replaces structural props (lists, entries); state that changes often comes in through signals. */
  update(props?: Partial<P>): void;
  destroy(): void;
}

/**
 * Bookkeeping of one block instance: listeners on an AbortController, signal effects, and cleanups, all released by
 * `dispose()`.
 */
export class Scope {
  private readonly ac = new AbortController();
  private readonly offs: (() => void)[] = [];

  get signal(): AbortSignal {
    return this.ac.signal;
  }

  on<K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, f: (ev: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions = {}): void {
    el.addEventListener(type, f as EventListener, { ...opts, signal: this.ac.signal });
  }

  /** Runs `f` now and whenever a signal it reads changes. */
  effect(f: () => void): void {
    this.offs.push(effect(f));
  }

  add(off: () => void): void {
    this.offs.push(off);
  }

  dispose(): void {
    this.ac.abort();
    for (const off of this.offs.splice(0).reverse()) off();
  }
}

/** Tooltip text with a shortcut hint: `Hand (H)`. */
export const tipText = (label: string, keys?: string, format?: (k: string) => string): string => (keys ? `${label} (${format ? format(keys) : keys})` : label);

/** `aria-keyshortcuts` value from a registry key (`mod+z` → `Control+z`). */
export const ariaKeys = (keys: string): string =>
  keys.split('+').map((p) => (p === 'mod' ? 'Control' : p.length > 1 ? p[0]!.toUpperCase() + p.slice(1) : p)).join('+');
