// The block contract (component architecture §5.1): small, host-agnostic UI pieces that take plain values, signals
// and callbacks, and know nothing about diagrams, editors or the kernel. A block is created by a `createX(props)`
// function returning a handle; its CSS is a fragment the host adopts (deduplicated by identity), written against the
// `--mmdx-*` tokens only.
import { isMac, type I18n } from '../../i18n.js';
import { Owner } from '../../reactive/owner.js';
import { formatKeys } from '../kit/keys.js';
import { type ReadSignal } from '../../reactive/signal.js';

/** The translation function every block takes its strings through. */
export type Translate = I18n['t'];

/** A value a block reads: a plain value, or a signal it follows. */
export type Value<T> = T | ReadSignal<T>;

/** Reads a plain value or a signal (tracked inside an effect). */
export const read = <T>(v: Value<T>): T => (typeof v === 'function' ? (v as ReadSignal<T>)() : v);

export interface BlockHandle<P> {
  readonly el: HTMLElement;
  /** Replaces structural props (lists, entries); state that changes often comes in through signals. */
  update(props?: Partial<P>): void;
  destroy(): void;
}

/** Bookkeeping of one block instance: its listeners, effects and cleanups, all released by `dispose()` (an Owner). */
export class Scope extends Owner {}

/** Tooltip text with a shortcut hint: `Hand (H)`; `format` defaults to the registry's `formatKeys` (platform symbols). */
export const tipText = (label: string, keys?: string, format: (k: string) => string = formatKeys): string => (keys ? `${label} (${format(keys)})` : label);

/**
 * `aria-keyshortcuts` value from a registry key: `mod+z` → `Meta+z` on Apple platforms, `Control+z` elsewhere; named
 * keys take their `KeyboardEvent.key` names (`escape` → `Escape`, `arrowup` → `ArrowUp`); alternatives
 * (`['delete', 'mod+x']`) are joined by a space.
 */
export const ariaKeys = (keys: string | readonly string[]): string =>
  (typeof keys === 'string' ? [keys] : keys).map((k) => k.split('+').map((p) =>
    p === 'mod' ? (isMac() ? 'Meta' : 'Control') : p === 'ctrl' ? 'Control' : p.length > 1 ? p.replace(/^(arrow)?(.)/, (_, a?: string, c = '') => (a ? 'Arrow' : '') + c.toUpperCase()) : p).join('+')).join(' ');
