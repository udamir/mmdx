// The count of shapes drawn as a rectangle because their geometry was not loaded (core/shapes/registry.ts), apart from
// the registry so the viewer's and the diff's entries can read it without shipping any geometry (T02.9).
let misses = 0;

/** Counts a shape drawn as a rectangle for want of its geometry. */
export const missShape = (): void => void misses++;

/** How many shapes were drawn as a rectangle for want of their geometry so far (a render compares it before and after). */
export const shapeMisses = (): number => misses;
