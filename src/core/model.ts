// Parsed diagram models (§5.2). The shapes follow the prototype parsers so the ported ops keep working: they rely on
// the 0-based source line fields (`lines`, `defLine`, `src`, `line` / `endLine`). Statements split by `;` share a line.
import type { Diagnostic, DiagramType } from './types.js';
import type { NodeDataBlock } from './parse/node-data.js';
import type { ShapeId } from './shapes/types.js';

export type { DataEntry, DataValue, NodeDataBlock } from './parse/node-data.js';

/** Style parsed from Mermaid `style` / `classDef` / `linkStyle` (already validated, see core/validate). */
export interface MermaidStyle {
  fill?: string;
  stroke?: string;
  text?: string;
  strokeWidth?: number;
  dash?: string;
  fontSize?: number;
}

export interface BaseModel {
  diagnostics: Diagnostic[];
}

// ---- flowchart --------------------------------------------------------------------------------------------------

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

/** A node's shape: a canonical id of the shape catalogue (core/shapes). */
export type NodeShape = ShapeId;

/** The node data keys Mermaid knows besides `shape` and `label` (`A@{ icon: "fa:user", form: square }`), typed. */
export interface FlowNodeData {
  labelType?: string;
  icon?: string;
  form?: string;
  pos?: string;
  img?: string;
  constraint?: string;
  w?: number;
  h?: number;
}

/** Where a node's bracket definition is in the code (`A["Label"]`): offsets of the opener, the text between and the end. */
export interface BracketSpan {
  start: number;
  /** The text between the brackets as written (quotes included). */
  text: [number, number];
  end: number;
  open: string;
  close: string;
}

/** A node as a statement mentions it: its id and everything written with it (bracket, `@{…}`, `:::class`). */
export interface FlowMention {
  id: string;
  start: number;
  end: number;
  /** End of the id itself. */
  idEnd: number;
  /** The mention defines the node (a bracket or node data). */
  def: boolean;
}

/** A link as written between two node groups: the whole token (an edge id and the label included) and the bare arrow. */
export interface FlowLink {
  start: number;
  end: number;
  /** The arrow without its label (`-->`, `-.->`, `<==>`), keeping its length and heads. */
  arrow: string;
  /** End of an edge id prefix (`e1@`), when there is one. */
  idEnd?: number;
}

/** A node statement (`A & B --> C -.-> D`): its node groups and the links between them, with code offsets. */
export interface FlowStatement {
  line: number;
  start: number;
  end: number;
  groups: FlowMention[][];
  links: FlowLink[];
}

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Classes in order of appearance (`:::c` and `class` lines). */
  classes: string[];
  /** The class given inline with `:::` on its first definition. */
  inlineClass?: string;
  style: MermaidStyle;
  parent: string | null;
  order: number;
  /** Every source line that mentions the node. */
  lines: Set<number>;
  /** Line of the first statement that gives it a label/shape (`A["…"]`), else null. */
  defLine: number | null;
  /** `click A href "…"` target, unvalidated (the renderer applies the link policy). */
  link?: string;
  /** The node data keys Mermaid knows (typed), from its `@{…}` blocks. */
  data?: FlowNodeData;
  /** Every `@{…}` block of the node, in code order, with the offsets of its entries (lossless editing). */
  blocks?: NodeDataBlock[];
  /** Its last bracket definition (the one Mermaid keeps). */
  bracket?: BracketSpan;
  /** What gave the node its shape last: a bracket or node data (absent: neither, a rectangle). */
  shapeFrom?: 'bracket' | 'data';
  /** What gave the node its label last. */
  labelFrom?: 'bracket' | 'data';
}

export interface FlowGroup {
  id: string;
  label: string;
  parent: string | null;
  /** Child node and subgraph ids, in order. */
  children: string[];
  order: number;
  /** `subgraph` line. */
  line: number;
  /** `end` line (absent for an unterminated subgraph). */
  endLine?: number;
  lines: Set<number>;
  classes?: string[];
  style?: MermaidStyle;
}

export type EdgeLine = 'solid' | 'dotted' | 'thick';
export type EdgeHead = 'arrow' | 'cross' | 'circle' | 'none';

export interface FlowEdge {
  /** `from->to`, or `from->to#n` for the n-th parallel edge. */
  id: string;
  from: string;
  to: string;
  label: string;
  line: EdgeLine;
  start: EdgeHead;
  end: EdgeHead;
  minlen: number;
  /** Position in Mermaid's link order (for `linkStyle n`). */
  index: number;
  /** Source line. */
  src: number;
  /** The statement it is written in (`model.statements`) and the link of that statement it comes from. */
  stmt?: number;
  seg?: number;
}

export interface FlowchartModel extends BaseModel {
  type: 'flowchart';
  direction: Direction;
  nodes: Map<string, FlowNode>;
  groups: Map<string, FlowGroup>;
  edges: FlowEdge[];
  classDefs: Record<string, MermaidStyle>;
  /** Keyed by link index as a string, or `default`. */
  linkStyles: Record<string, MermaidStyle>;
  /** `:::c` / `class` uses whose class has no classDef (may still be a theme preset; the editor checks). */
  undefinedClasses: { cls: string; line: number }[];
  /** Ids used both by a subgraph and by a real node definition (Mermaid fails on these). */
  idClashes: string[];
  /** The node statements, with the offsets the ops splice (T02.5). */
  statements: FlowStatement[];
}

// ---- sequence ---------------------------------------------------------------------------------------------------

export type ParticipantShape = 'box' | 'rounded' | 'stadium' | 'actor' | 'database' | 'queue' | string;

export interface Participant {
  id: string;
  label: string;
  kind: 'participant' | 'actor';
  /** Box id (`box1`…) or null. */
  box: string | null;
  lines: Set<number>;
  defLine?: number;
  /** From `@{ "type": "…" }`. */
  shape?: ParticipantShape;
  /** Declared with `create`. */
  created?: boolean;
}

export interface SeqBox {
  id: string;
  color: string | null;
  label: string;
  members: string[];
  line: number;
  endLine?: number;
}

export type BlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect';
export type MessageHead = 'arrow' | 'cross' | 'async' | 'open';

export interface SeqMessage {
  kind: 'message';
  id: string;
  from: string;
  to: string;
  text: string;
  line: 'solid' | 'dotted';
  head: MessageHead;
  both: boolean;
  activate: boolean;
  deactivate: boolean;
  src: number;
}

export interface SeqNote {
  kind: 'note';
  id: string;
  pos: 'left of' | 'right of' | 'over';
  targets: string[];
  text: string;
  src: number;
}

export interface SeqBlockStart {
  kind: 'blockStart';
  id: string;
  block: BlockKind;
  label: string;
  /** `rect <colour>` (validated) or null. */
  color: string | null;
  src: number;
  /** Lines of the block's own statements: start, every else/and/option, end. */
  lines: number[];
}

export interface SeqBlockElse {
  kind: 'blockElse';
  id: string;
  label: string;
  src: number;
}

export interface SeqBlockEnd {
  kind: 'blockEnd';
  id: string;
  src: number;
}

export interface SeqActivate {
  kind: 'activate' | 'deactivate';
  who: string;
  src: number;
}

export type SeqItem = SeqMessage | SeqNote | SeqBlockStart | SeqBlockElse | SeqBlockEnd | SeqActivate;

export interface SequenceModel extends BaseModel {
  type: 'sequence';
  participants: Participant[];
  items: SeqItem[];
  boxes: SeqBox[];
  autonumber: boolean;
  title: string;
}

// ---- ER ---------------------------------------------------------------------------------------------------------

export type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'one-many';
export type AttrKey = 'PK' | 'FK' | 'UK';

export interface ErAttribute {
  type: string;
  name: string;
  keys: AttrKey[];
  comment: string;
}

export interface Entity {
  id: string;
  label: string;
  attrs: ErAttribute[];
  order: number;
  lines: Set<number>;
  defLine?: number;
  endLine?: number;
}

export interface ErRel {
  id: string;
  from: string;
  to: string;
  fromCard: Cardinality;
  toCard: Cardinality;
  identifying: boolean;
  label: string;
  src: number;
}

export interface ErModel extends BaseModel {
  type: 'er';
  direction: Direction;
  entities: Map<string, Entity>;
  rels: ErRel[];
}

// ---- unsupported ------------------------------------------------------------------------------------------------

export interface UnsupportedModel extends BaseModel {
  type: null;
  /** The first keyword of the code (`gantt`, `classDiagram`…), if any. */
  keyword?: string;
}

export type DiagramModel = FlowchartModel | SequenceModel | ErModel | UnsupportedModel;
export type SupportedModel = FlowchartModel | SequenceModel | ErModel;

export const isSupported = (m: DiagramModel): m is SupportedModel => m.type !== null;
export type { DiagramType };
