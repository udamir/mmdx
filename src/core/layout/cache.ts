// The layout caches' keys and values: short digests for the keys (a key stays short however large its layout input,
// P6), and the values (X21) — positions as a Map<string, Point>, with a layout's further point lists (a tree's contour,
// a compound scope's edge hints) under keys no item id can have, so one cache holds every layout's results.
import type { Point } from '../types.js';

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

/** The prefix of a packed list's keys (`\u0000<list>.<point>`); an item id never starts with it. */
const LIST = '\u0000';

/** Positions and point lists as one cache value. */
export function pack(pos: ReadonlyMap<string, Point>, lists: Iterable<readonly [number, readonly Point[]]>): Map<string, Point> {
  const out = new Map(pos);
  for (const [k, pts] of lists) pts.forEach((p, j) => out.set(`${LIST}${k}.${j}`, p));
  return out;
}

/** A cache value's positions and point lists (`pack` undone). */
export function unpack(m: ReadonlyMap<string, Point>): { pos: Map<string, Point>; lists: Map<number, Point[]> } {
  const pos = new Map<string, Point>(), lists = new Map<number, Point[]>();
  for (const [key, p] of m) {
    if (!key.startsWith(LIST)) {
      pos.set(key, p);
      continue;
    }
    const [k, j] = key.slice(LIST.length).split('.').map(Number) as [number, number];
    let L = lists.get(k);
    if (!L) lists.set(k, (L = []));
    L[j] = p;
  }
  return { pos, lists };
}
