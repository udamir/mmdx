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
export class Scope extends Owner {
  private round: Scope | null = null;

  /** A fresh child scope for one render: the previous render's child is disposed first, the current one goes with this scope (already disposed when this scope is). */
  renew(): Scope {
    if (this.round) this.round.dispose();
    else this.add(() => this.round?.dispose());
    const next = new Scope();
    if (this.disposed) next.dispose();
    return (this.round = next);
  }
}

/** What a block's setup gives `defineBlock`: its element, how it draws its props, and the handle's other members (getters kept). */
export type BlockParts<P, H extends BlockHandle<P>> = Omit<H, keyof BlockHandle<P>> & {
  readonly el: HTMLElement;
  /** Draws the props: once at creation (no argument), then after each `update` with the props it passed. */
  render(next?: Partial<P>): void;
};

/**
 * The block handle's boilerplate in one place (X16): `props` is copied into one object the setup reads (`update` merges the next props into it, so a handler reading `p.onChange` sees the current one), `scope` owns the block's listeners and effects (`scope.renew()` for a per-render child), and `destroy` disposes the scope and removes the element. The setup's members other than `render` become the handle's; the handle type `H` comes from the factory's return type.
 */
export function defineBlock<P extends object, H extends BlockHandle<P> = BlockHandle<P>>(props: P, setup: (p: P, scope: Scope) => BlockParts<P, H>): H {
  const p = { ...props };
  const scope = new Scope();
  // the setup's object becomes the handle (its getters stay getters)
  const parts: Partial<BlockParts<P, H>> & BlockHandle<P> = Object.assign(setup(p, scope), {
    update(next?: Partial<P>) {
      Object.assign(p, next);
      render(next ?? {});
    },
    destroy() {
      scope.dispose();
      parts.el.remove();
    },
  });
  const render = parts.render!;
  delete parts.render;
  render();
  return parts as unknown as H;
}

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
