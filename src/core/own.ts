// Records keyed by names that come from documents or users: item ids, preset, palette and layer names, metadata keys.
// Mermaid accepts ids such as `__proto__`, `constructor` or `toString`. A plain `rec[id]` read then finds
// Object.prototype or one of its methods, and a write through what it found (`(rec[id] ??= {}).x = 1`) changes every
// object of the page. These helpers see own properties only and store `__proto__` as an ordinary key. Copies of
// untrusted objects drop a `__proto__` key instead (meta/sanitize.ts): assigning it by `=` or `Object.assign` would
// change the copy's prototype.

/** The record's own entry for `key`, never an inherited one. */
export const own = <T>(rec: Readonly<Record<string, T>> | null | undefined, key: string): T | undefined =>
  rec != null && Object.hasOwn(rec, key) ? rec[key] : undefined;

/** Sets an own entry; `__proto__` becomes a plain key instead of replacing the record's prototype. */
export const setOwn = <T>(rec: Record<string, T>, key: string, value: T): T =>
  key === '__proto__' ? (Object.defineProperty(rec, key, { value, writable: true, enumerable: true, configurable: true }), value) : (rec[key] = value);

/** The own entry for `key`, created with `make()` when missing. */
export const ownOr = <T>(rec: Record<string, T>, key: string, make: () => T): T => own(rec, key) ?? setOwn(rec, key, make());
