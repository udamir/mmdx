// What every bundle knows about each diagram type without loading it (T01 kind descriptor, layer 1): the header that
// detects it, the source a new diagram starts from, and its names. The parser, the renderer and the rest of a type
// live in its view kind (core/kinds/<type>.ts) and edit kind (editor/kinds/<type>.ts), loaded on demand. The English
// names the chooser and the studio show are in names.ts (only those UIs load them).
import type { DiagramType } from '../types.js';

export interface KindInfo {
  readonly type: DiagramType;
  /** Matches the header line (the first line that is not blank, a `%%` comment or front matter). */
  readonly header: RegExp;
  /** The source a new, empty diagram of the type starts from. */
  readonly starter: string;
  /** i18n key of the type's name (`type.flowchart`). */
  readonly label: string;
  /**
   * The type has Mermaid style statements (`classDef`, `class`, `style`, `linkStyle`) and `:::` class shorthands, so
   * "without styling" (strip-styles.ts) removes them; elsewhere such words are text (a mindmap node "class notes").
   */
  readonly styleStatements: boolean;
}

/** Every diagram type, in the order the UI lists them. */
export const KIND_INFO: Readonly<Record<DiagramType, KindInfo>> = {
  flowchart: { type: 'flowchart', header: /^(flowchart|graph)\b/i, starter: 'flowchart TB\n', label: 'type.flowchart', styleStatements: true },
  sequence: { type: 'sequence', header: /^sequenceDiagram\b/, starter: 'sequenceDiagram\n', label: 'type.sequence', styleStatements: false },
  er: { type: 'er', header: /^erDiagram\b/, starter: 'erDiagram\n', label: 'type.er', styleStatements: true },
  mindmap: { type: 'mindmap', header: /^mindmap\b/i, starter: 'mindmap\n  root((Topic))\n', label: 'type.mindmap', styleStatements: false },
  // both headers read the same (Mermaid 11.17 and 12.2 draw them alike); new diagrams take the v2 header (T09 Q1)
  state: { type: 'state', header: /^stateDiagram(?:-v2)?\b/, starter: 'stateDiagram-v2\n', label: 'type.state', styleStatements: true },
};

/** The diagram types, in UI order. */
export const DIAGRAM_TYPES: readonly DiagramType[] = Object.values(KIND_INFO).map((k) => k.type);

/** The type a header line starts, or null. */
export const typeOfHeader = (line: string): DiagramType | null => DIAGRAM_TYPES.find((t) => KIND_INFO[t].header.test(line)) ?? null;

/** Is this trimmed code line a diagram header? */
export const isHeaderLine = (line: string): boolean => typeOfHeader(line) !== null;
