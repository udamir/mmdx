// The media kit (T06): the code that draws rich labels (markdown emphasis, inline icons), icons and images — a lazy
// chunk of its own, loaded with the geometry of the shapes beyond the 17 (core/shapes/extended.ts) the first time a
// render needs it. Renderers ask for it here: when it is not loaded, the render draws plain text and empty asset boxes
// and counts a miss, and the viewer, History and the diff load it and render again (platform/kinds.ts `drawShapes`), as
// they do for the shapes. Core's kinds, the editor's flowchart and the theme editor register it statically.
import { missMedia } from '../shapes/misses.js';
import type { MEDIA_KIT } from './kit-impl.js';

export type MediaKit = typeof MEDIA_KIT;

let kit: MediaKit | null = null;

/** Makes the kit available (idempotent). */
export const registerMediaKit = (k: MediaKit): void => void (kit = k);

/** Forgets the kit (tests of the on-demand path). */
export const forgetMediaKit = (): void => void (kit = null);

/** The kit if it is loaded, without counting a miss (the editor reads labels with it; its rich types load it). */
export const loadedMediaKit = (): MediaKit | null => kit;

/** The kit, or null after counting a miss (the caller draws without it; the render runs again once it has loaded). */
export function mediaKit(): MediaKit | null {
  if (!kit) missMedia();
  return kit;
}
