// Icons for SSR and Node (T04 §4.1): a registry whose decoder is loaded with it, so a lookup of a loaded pack is
// ready at once; `mmdx/core` exports it. Components use the shared registry of `configure({ iconPacks })`.
import { ICON_DECODER } from './decode.js';
import { IconRegistry, type IconRegistryOptions } from './registry.js';
import type { IconPack } from './types.js';

/** A registry of these packs plus the built-in Tabler subset (`builtin: false` leaves it out). */
export function createIconRegistry(packs: readonly IconPack[] = [], o: Omit<IconRegistryOptions, 'decoder'> = {}): IconRegistry {
  return new IconRegistry(packs, { ...o, decoder: ICON_DECODER });
}
