// Text measurement (§7.3). Layout depends on text widths, so every environment measures through this interface:
// a canvas-backed measurer in browsers / workers (dom/measure.ts), and the static measurer below in Node.

export interface FontSpec {
  size: number;
  weight?: number | string;
  family: string;
  style?: 'normal' | 'italic';
}

export interface TextMeasurer {
  width(text: string, font: FontSpec): number;
  /** 'static' for table-based estimates (recorded as data-ds-measure on SSR output), 'canvas' for real metrics. */
  readonly kind: 'static' | 'canvas' | 'custom';
}

/** Bounded LRU used by measurers and layout caches (the prototype's caches were unbounded). */
export class Lru<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    else if (this.map.size >= this.max) {
      const first = this.map.keys().next();
      if (!first.done) this.map.delete(first.value);
    }
    this.map.set(k, v);
  }
  get size(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
}

export const fontKey = (f: FontSpec): string => `${f.style ?? 'normal'}|${f.weight ?? 400}|${f.size}|${f.family}`;

// Approximate advance widths in em for a humanist sans (close to Open Sans Regular), ASCII 32..126. Used only where
// no canvas exists (Node build-time rendering, tests); `tools/font-metrics` can replace it with exact tables.
// prettier-ignore
const ADV: readonly number[] = [
  0.26, 0.267, 0.401, 0.646, 0.572, 0.823, 0.73, 0.221, 0.296, 0.296, 0.552, 0.572, 0.245, 0.322, 0.266, 0.367,
  0.572, 0.572, 0.572, 0.572, 0.572, 0.572, 0.572, 0.572, 0.572, 0.572, 0.266, 0.266, 0.572, 0.572, 0.572, 0.429,
  0.899, 0.633, 0.648, 0.631, 0.729, 0.556, 0.516, 0.728, 0.738, 0.279, 0.267, 0.614, 0.519, 0.903, 0.754, 0.779,
  0.602, 0.779, 0.618, 0.549, 0.553, 0.728, 0.595, 0.926, 0.577, 0.56, 0.571, 0.329, 0.367, 0.329, 0.542, 0.448,
  0.577, 0.556, 0.613, 0.476, 0.613, 0.561, 0.339, 0.548, 0.614, 0.253, 0.253, 0.525, 0.253, 0.931, 0.614, 0.604,
  0.613, 0.613, 0.408, 0.477, 0.353, 0.614, 0.501, 0.778, 0.524, 0.501, 0.468, 0.379, 0.551, 0.379, 0.572,
];
const MONO = /mono|courier|consolas|menlo/i;

/** Advance-width estimate; deterministic across machines. Bold adds ~6 %; non-ASCII uses an average glyph. */
export function createStaticMeasurer(): TextMeasurer {
  const cache = new Lru<string, number>(5000);
  return {
    kind: 'static',
    width(text: string, font: FontSpec): number {
      const key = `${fontKey(font)}|${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      let em = 0;
      if (MONO.test(font.family)) em = text.length * 0.6;
      else
        for (const ch of text) {
          const c = ch.codePointAt(0) ?? 32;
          em += c >= 32 && c <= 126 ? (ADV[c - 32] ?? 0.55) : c >= 0x0400 && c <= 0x04ff ? 0.6 : c > 0x2e80 ? 1 : 0.58;
        }
      const w = Number(font.weight ?? 400) >= 600 ? em * 1.06 : em;
      const px = w * font.size;
      cache.set(key, px);
      return px;
    },
  };
}
