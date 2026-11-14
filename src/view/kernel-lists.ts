// The kernel's contribution lists and one-value slots (A7, BUG-015): what the tool dock, the Export menu, the view
// params and the panel stacks render (dockItems, exportFormats, paramItems, panelItems) and what one module fills (the
// dock's flyout, the pen's strokes). Everyone reads them as signals; only a module's scope writes them (contribute,
// contributeAll, claim), which takes its entries out while the module is suspended and on uninstall.
import { signal, type ReadSignal, type Signal } from '../reactive/signal.js';

declare const LIST: unique symbol;
declare const SLOT: unique symbol;

/** A kernel list: read-only, written through `scope.contribute` / `scope.contributeAll`. */
export interface KernelList<T> extends ReadSignal<readonly T[]> {
  readonly [LIST]: T;
}

/** A kernel slot: read-only, filled through `scope.claim`. */
export interface KernelSlot<T> extends ReadSignal<T | null> {
  readonly [SLOT]: T;
}

export const kernelList = <T>(): KernelList<T> => signal<readonly T[]>([]) as unknown as KernelList<T>;

export const kernelSlot = <T>(): KernelSlot<T> => signal<T | null>(null) as unknown as KernelSlot<T>;

/** The signal behind a list: the module host's, for a scope's contribute and contributeAll. */
export const listWriter = <T>(l: KernelList<T>): Signal<readonly T[]> => l as unknown as Signal<readonly T[]>;

/** The signal behind a slot: the module host's, for a scope's claim. */
export const slotWriter = <T>(s: KernelSlot<T>): Signal<T | null> => s as unknown as Signal<T | null>;
