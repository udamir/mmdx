// The user's reduced-motion preference (read on every call: it can change while the page is open).

export const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
