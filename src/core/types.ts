// Shared core types: geometry, item references, diagnostics.
// L1 (core) is pure TypeScript: no DOM types, runs in Node, workers and browsers.

export interface Point {
  x: number;
  y: number;
}

/** A box given by its centre (x, y) and size — the prototype's convention for nodes and groups. */
export interface CenterBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box given by its top-left corner and size (page bounds, viewBox). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The diagram types mmdx ships (their kinds are in core/kinds and editor/kinds). */
export type BuiltinType = 'flowchart' | 'sequence' | 'er' | 'mindmap' | 'state';

/**
 * A diagram type: a built-in one or one a kind plugin registered (A11e). Open as a type; a value is checked against
 * the kind registry where it comes in (`kindInfo`, `isDiagramType`), so an unknown type reads as unsupported.
 */
export type DiagramType = BuiltinType | (string & {});

export type ItemKind =
  | 'node' | 'group' | 'edge' // flowchart (and state diagrams: states, composites, transitions)
  | 'participant' | 'message' | 'note' | 'block' | 'box' | 'activation' // sequence (notes: also state diagrams)
  | 'entity' | 'rel'; // ER

export const ITEM_KINDS: readonly ItemKind[] = [
  'node', 'group', 'edge', 'participant', 'message', 'note', 'block', 'box', 'activation', 'entity', 'rel',
];

export interface ItemRef {
  kind: ItemKind;
  id: string;
}

export type ItemKey = `${ItemKind}:${string}`;

export const itemKey = (r: ItemRef): ItemKey => `${r.kind}:${r.id}`;

export function parseItemKey(k: string): ItemRef | null {
  const i = k.indexOf(':');
  if (i < 0) return null;
  const kind = k.slice(0, i) as ItemKind;
  if (!ITEM_KINDS.includes(kind)) return null;
  return { kind, id: k.slice(i + 1) };
}

/** 0-based line and column; `endLine`/`endCol` exclusive of the column, inclusive of the line. */
export interface SourceRange {
  line: number;
  col?: number;
  endLine?: number;
  endCol?: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticFix {
  title: string;
  apply(code: string): string;
}

export interface Diagnostic {
  severity: Severity;
  /** English text; `code` is the i18n key. */
  message: string;
  /** Stable machine code, e.g. `flow.unknown-arrow`. */
  code: string;
  range?: SourceRange;
  /** Set when the diagnostic belongs to the `%%@` metadata rather than the Mermaid code. */
  source?: 'code' | 'meta';
  params?: Readonly<Record<string, string | number>>;
  fix?: DiagnosticFix;
}

/** Prototype-compatible text form: `Line N: message`. */
export function diagnosticText(d: Diagnostic): string {
  return d.range ? `Line ${d.range.line + 1}: ${d.message}` : d.message;
}

export function diag(
  severity: Severity,
  code: string,
  message: string,
  line?: number,
  extra: Partial<Pick<Diagnostic, 'params' | 'fix' | 'source'>> = {},
): Diagnostic {
  const d: Diagnostic = { severity, code, message };
  if (line !== undefined) d.range = { line };
  if (extra.params) d.params = extra.params;
  if (extra.fix) d.fix = extra.fix;
  if (extra.source) d.source = extra.source;
  return d;
}
