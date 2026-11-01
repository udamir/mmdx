// Motion shared by the canvas: the user's reduced-motion preference (read on every call: it can change while the page
// is open), and the length and easing of animated picture switches.

export const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Length of an animated switch between pictures (diff views, versions) and of the view gliding with it, in ms. */
export const TRANSITION_MS = 900;

/** Ease in-out (cubic) of a transition's progress 0…1. */
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
