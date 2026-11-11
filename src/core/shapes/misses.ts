// What a render drew without because it was not loaded (A18): a shape's geometry (drawn as a rectangle,
// core/shapes/registry.ts) or the media kit (plain text, empty asset boxes, core/media/kit.ts). Apart from the
// registry so the viewer's and the diff's entries can read it without shipping any geometry (T02.9). A render is
// synchronous, so what it lacked is collected while it runs (`collectMisses`) and reported in its result
// (`RenderResult.missing`) — no global counter to compare before and after.

import type { Misses } from '../render/types.js';

export type { Misses };

/** The collections running (nested: a render inside a render counts for both). */
const collecting: Misses[] = [];

/** A shape drawn as a rectangle for want of its geometry. */
export const missShape = (): void => {
  for (const c of collecting) c.shapes = true;
};

/** Text or an asset drawn plain for want of the media kit. */
export const missMedia = (): void => {
  for (const c of collecting) c.media = true;
};

/** Runs `f` and says what it drew without (empty when nothing). */
export function collectMisses<R>(f: () => R): [R, Misses] {
  const m: Misses = {};
  collecting.push(m);
  try {
    return [f(), m];
  } finally {
    collecting.splice(collecting.lastIndexOf(m), 1);
  }
}
