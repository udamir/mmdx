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
  /** 'static' for table-based estimates (recorded as data-mmdx-measure on SSR output), 'canvas' for real metrics. */
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

/** The advance of an emoji (one grapheme drawn as a colour glyph), in em. */
export const EMOJI_EM = 1.15;

/** A grapheme drawn as an emoji: an emoji-presentation character, VS16 (`❤️`) or a keycap (`1️⃣`), and no VS15. */
const EMOJI = /\p{Emoji_Presentation}|\uFE0F|\u20E3/u;
/**
 * Without `Intl.Segmenter`: an emoji sequence as one piece (a flag's pair, a pictograph or keycap base with its
 * selectors, skin tone, tags and ZWJ-joined pictographs), anything else one code point.
 */
const SEQUENCE = /\p{RI}\p{RI}|(?:\p{Extended_Pictographic}|[#*0-9])(?:[\uFE0E\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]|\u200D\p{Extended_Pictographic})*|[^]/gu;

interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}
let segmenter: GraphemeSegmenter | null | undefined;

/** Text as graphemes: `Intl.Segmenter` where it exists (Node 16+, every supported browser), else `SEQUENCE`. */
function graphemes(text: string): Iterable<string> {
  if (segmenter === undefined) {
    const S = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => GraphemeSegmenter }).Segmenter;
    segmenter = S ? new S(undefined, { granularity: 'grapheme' }) : null;
  }
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : text.match(SEQUENCE) ?? [];
}

/** One code point's advance in em (ASCII from the table; zero-width characters and variation selectors count nothing). */
function charEm(c: number): number {
  if ((c >= 0x200b && c <= 0x200d) || c === 0x2060 || (c >= 0xfe00 && c <= 0xfe0f)) return 0;
  return c >= 32 && c <= 126 ? (ADV[c - 32] ?? 0.55) : c >= 0x0400 && c <= 0x04ff ? 0.6 : c > 0x2e80 ? 1 : 0.58;
}

/** Text's advance in em: per grapheme, an emoji (with every ZWJ, selector, skin tone or tag in it) 1.15 em. */
function textEm(text: string): number {
  let em = 0;
  // ASCII has no graphemes of more than one code point that matter here (CR LF aside): the fast path
  // eslint-disable-next-line no-control-regex
  if (/^[\u0000-\u007f]*$/.test(text)) {
    for (let i = 0; i < text.length; i++) em += charEm(text.charCodeAt(i));
    return em;
  }
  for (const g of graphemes(text)) {
    if (EMOJI.test(g) && !g.includes('\uFE0E')) {
      em += EMOJI_EM;
      continue;
    }
    for (const ch of g) em += charEm(ch.codePointAt(0) ?? 32);
  }
  return em;
}

/**
 * Advance-width estimate; deterministic across machines. Bold adds ~6 %; non-ASCII uses an average glyph; zero-width
 * characters (ZWSP, ZWNJ, ZWJ, word joiner) and variation selectors count as nothing; an emoji counts 1.15 em
 * however many code points it is made of (`👨‍👩‍👧`, `👍🏽`, flags).
 */
export function createStaticMeasurer(): TextMeasurer {
  const cache = new Lru<string, number>(5000);
  return {
    kind: 'static',
    width(text: string, font: FontSpec): number {
      const key = `${fontKey(font)}|${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      let em = 0;
      if (MONO.test(font.family)) em = text.replace(/[\u200b\u200c\u200d\u2060]/g, '').length * 0.6;
      else em = textEm(text);
      const w = Number(font.weight ?? 400) >= 600 ? em * 1.06 : em;
      const px = w * font.size;
      cache.set(key, px);
      return px;
    },
  };
}
