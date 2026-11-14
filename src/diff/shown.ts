// What a diff shows (A13c): nothing, one version as it is, or a comparison of two — one model instead of the pair,
// the viewed version and the mode read together at each use.
export type Shown =
  | { kind: 'none' }
  /** One version as it is (`id` null while none is picked yet). */
  | { kind: 'version'; id: string | null }
  | { kind: 'compare'; base: string; head: string };

