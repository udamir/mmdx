// Short digests for the layout caches' keys: a key stays short however large its layout input (P6).

/** A 64-bit FNV-1a digest of a string (two 32-bit halves), with the length: a collision needs both to match. */
export function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + '.' + s.length.toString(36);
}
