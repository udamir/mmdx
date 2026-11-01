// Records keyed by names that come from documents or users: item ids, preset, palette and layer names, metadata keys.
// Mermaid accepts ids such as `__proto__`, `constructor` or `toString`. A plain `rec[id]` read then finds
// Object.prototype or one of its methods, and a write through what it found (`(rec[id] ??= {}).x = 1`) changes every
// object of the page. These helpers see own properties only and store `__proto__` as an ordinary key.

/** The record's own entry for `key`, never an inherited one. */
export function own<T>(rec: Readonly<Record<string, T>> | null | undefined, key: string): T | undefined {
  return rec != null && Object.hasOwn(rec, key) ? rec[key] : undefined;
}

/** Sets an own entry; `__proto__` becomes a plain key instead of replacing the record's prototype. */
export function setOwn<T>(rec: Record<string, T>, key: string, value: T): T {
  if (key === '__proto__') Object.defineProperty(rec, key, { value, writable: true, enumerable: true, configurable: true });
  else rec[key] = value;
  return value;
}

/** The own entry for `key`, created with `make()` when missing. */
export function ownOr<T>(rec: Record<string, T>, key: string, make: () => T): T {
  return Object.hasOwn(rec, key) ? (rec[key] as T) : setOwn(rec, key, make());
}

/** Keys a copied record must not carry: assigning them by `=` or `Object.assign` changes the target's prototype. */
export const isUnsafeKey = (key: string): boolean => key === '__proto__';
