// Item references (X17): equality of two references and of two lists, beside core's `itemKey` (`kind:id`).
import type { ItemRef } from '../../core/types.js';

/** The same item (two absent references are the same; a participant's foot flag does not count). */
export const sameRef = (a: ItemRef | null | undefined, b: ItemRef | null | undefined): boolean => (!a && !b) || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/** The same items in the same order. */
export const sameRefs = (a: readonly ItemRef[], b: readonly ItemRef[]): boolean => a.length === b.length && a.every((r, i) => sameRef(r, b[i]));
