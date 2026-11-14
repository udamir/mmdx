// A string matched literally inside a RegExp (an id written into a pattern): one escaping for the parsers and the ops.

/** `s` with every RegExp syntax character escaped. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
