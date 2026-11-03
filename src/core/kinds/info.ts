// What every bundle knows about each diagram type without loading it (T01 kind descriptor, layer 1): the header that
// detects it, the source a new diagram starts from, and its names. The parser, the renderer and the rest of a type
// live in its view kind (core/kinds/<type>.ts) and edit kind (editor/kinds/<type>.ts), loaded on demand.
import type { DiagramType } from '../types.js';

export interface KindInfo {
  readonly type: DiagramType;
  /** Matches the header line (the first line that is not blank, a `%%` comment or front matter). */
  readonly header: RegExp;
  /** The source a new, empty diagram of the type starts from. */
  readonly starter: string;
  /** i18n key of the type's name (`type.flowchart`). */
  readonly label: string;
  /** Short English name (the editor's "Start a diagram" cards). */
  readonly name: string;
  /** Full English name (the studio's New menu). */
  readonly title: string;
  /** One line about what the type draws (the "Start a diagram" cards). */
  readonly blurb: string;
}

/** Every diagram type, in the order the UI lists them. */
export const KIND_INFO: Readonly<Record<DiagramType, KindInfo>> = {
  flowchart: {
    type: 'flowchart', header: /^(flowchart|graph)\b/i, starter: 'flowchart TB\n', label: 'type.flowchart',
    name: 'Flowchart', title: 'Flowchart', blurb: 'Boxes, decisions, groups and arrows',
  },
  sequence: {
    type: 'sequence', header: /^sequenceDiagram\b/, starter: 'sequenceDiagram\n', label: 'type.sequence',
    name: 'Sequence', title: 'Sequence diagram', blurb: 'Participants and the messages between them',
  },
  er: {
    type: 'er', header: /^erDiagram\b/, starter: 'erDiagram\n', label: 'type.er',
    name: 'ER diagram', title: 'Entity–relationship (ER) diagram', blurb: 'Tables, columns and relationships',
  },
};

/** The diagram types, in UI order. */
export const DIAGRAM_TYPES: readonly DiagramType[] = Object.values(KIND_INFO).map((k) => k.type);

/** The type a header line starts, or null. */
export const typeOfHeader = (line: string): DiagramType | null => DIAGRAM_TYPES.find((t) => KIND_INFO[t].header.test(line)) ?? null;

/** Is this trimmed code line a diagram header? */
export const isHeaderLine = (line: string): boolean => typeOfHeader(line) !== null;
