// Adversarial sources for the parsers (B1–B3, G13): long lines, unclosed strings and blocks, long notes, repeated
// statements that a regex would re-read. Each case builds a source of about `n` characters; the same `n` gives the
// same source every run (a seeded generator, no dependency). Tests assert the parsers stay linear on them (time(4n)
// over time(n)), never throw, and stop with `doc.too-complex` past the limits.

export interface AdversarialCase {
  name: string;
  /** Builds a source of about `n` characters. */
  make(n: number): string;
}

const rep = (unit: string, n: number): string => unit.repeat(Math.max(1, Math.ceil(n / unit.length)));

/** A seeded run of the given characters (the same text for the same seed and length). */
export function noise(chars: string, n: number, seed = 7): string {
  let s = seed, out = '';
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += chars[s % chars.length];
  }
  return out;
}

export const ADVERSARIAL: readonly AdversarialCase[] = [
  // B1: the `.*direction\s+TB` rules were tried at every token of a long line
  { name: 'ER: one long line of words', make: (n) => `erDiagram\n${rep('a ', n)}\n` },
  { name: 'ER: a long line with direction words', make: (n) => `erDiagram\n${rep('direction x ', n)}\n` },
  { name: 'ER: a long attribute block line', make: (n) => `erDiagram\nA {\n${rep('int a ', n)}\n}\n` },
  { name: 'state: one long line of words', make: (n) => `stateDiagram-v2\n${rep('a ', n)}\n` },
  { name: 'state: a long line with direction words', make: (n) => `stateDiagram-v2\n${rep('direction x ', n)}\n` },
  { name: 'state: composites on one line', make: (n) => `stateDiagram-v2\n${rep('state a{', n)}\n` },
  { name: 'state: fork words on one line', make: (n) => `stateDiagram-v2\n${rep('state a <<fork ', n)}\n` },
  { name: 'state: random tokens', make: (n) => `stateDiagram-v2\n${noise('ab {}[*]-><: \n', n)}\n` },
  { name: 'ER: random tokens', make: (n) => `erDiagram\n${noise('ab {}|o-.:" \n', n)}\n` },
  { name: 'mindmap: one long line', make: (n) => `mindmap\n  root\n    ${rep('a ', n)}\n` },
  { name: 'mindmap: deep nesting', make: (n) => `mindmap\n${Array.from({ length: Math.min(2000, n / 40) }, (_, i) => `${' '.repeat(i % 200)}n${i}`).join('\n')}\n` },
  // B2: a statement left open was re-scanned in full after every line appended to it
  { name: 'flowchart: unclosed markdown string', make: (n) => `flowchart TD\n  A["\`x\n${rep('some words\n', n)}` },
  { name: 'flowchart: unclosed node data', make: (n) => `flowchart TD\n  A@{ label: x\n${rep('some words\n', n)}` },
  { name: 'flowchart: unclosed accDescr', make: (n) => `flowchart TD\n  accDescr {\n${rep('some words\n', n)}` },
  { name: 'sequence: unclosed accDescr', make: (n) => `sequenceDiagram\n  accDescr {\n${rep('some words\n', n)}` },
  { name: 'flowchart: one long line', make: (n) => `flowchart TD\n  ${rep('A-->B ', n)}\n` },
  { name: 'sequence: one long message', make: (n) => `sequenceDiagram\n  A->>B: ${rep('x ', n)}\n` },
  // B3: a long multi-line note (a spread over its lines threw)
  { name: 'state: a long note', make: (n) => `stateDiagram-v2\nnote left of A\n${rep('  x\n', n)}end note\n` },
];

/**
 * Cases a limit stops: they finish quickly with `doc.too-complex` instead of reading the source in quadratic time.
 * `n` is the size to try (large enough to cross the limit).
 */
export const OVER_LIMIT: readonly (AdversarialCase & { n: number })[] = [
  // every unclosed multi-line note read on to the end of the source
  { name: 'state: many unclosed notes', n: 400_000, make: (n) => `stateDiagram-v2\n${rep('note left of a\n', n)}` },
  // a statement joined over lines is capped at MAX_STATEMENT_LENGTH
  { name: 'flowchart: a markdown string over 64 KiB of lines', n: 100_000, make: (n) => `flowchart TD\n  A["\`x\n${rep('some words\n', n)}` },
  { name: 'sequence: an accDescr over 64 KiB of lines', n: 100_000, make: (n) => `sequenceDiagram\n  accDescr {\n${rep('some words\n', n)}` },
];
