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
  /** `linkStyle n interpolate basis`: the line's curve (Mermaid's curve names; T06). */
  interpolate?: string;
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
  /** The label is a Mermaid markdown string (`"`**bold**`"`): drawn with emphasis and auto-wrapped (T06). */
  md?: true;
  /** `click A "url" "tooltip"`: shown on hover (an SVG `<title>`). */
  tooltip?: string;
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
  /** The title is a Mermaid markdown string. */
  md?: true;
  /** `direction LR` inside the subgraph (the last one written), honoured by the compound layout (T07). */
  dir?: Direction;
}

/** `invisible`: Mermaid's `~~~`, a link that places its nodes and is not drawn (T06). */
export type EdgeLine = 'solid' | 'dotted' | 'thick' | 'invisible';

/** An edge's data (`e1@{ animate: true, animation: fast, curve: linear }`), typed. */
export interface FlowEdgeData {
  animate?: boolean;
  /** `fast` or `slow`. */
  animation?: string;
  /** Mermaid's curve name (`basis`, `linear`, `step`…). */
  curve?: string;
}
export type EdgeHead = 'arrow' | 'cross' | 'circle' | 'none';

export interface FlowEdge {
  /** Its own id when the code gives one (`A e1@--> B`), else `from->to`, or `from->to#n` for the n-th parallel edge. */
  id: string;
  /** The id written in the code (`e1`), when there is one: then `id` is it. */
  uid?: string;
  /** `from->to` (`#n`) when the edge has its own id: metadata written under it before is still read (T06). */
  key?: string;
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
  /** The label is a Mermaid markdown string. */
  md?: true;
  /** Its `uid@{…}` data. */
  data?: FlowEdgeData;
  /** Its `uid@{…}` blocks, with offsets. */
  blocks?: NodeDataBlock[];
}

/** Frontmatter and `%%{init}%%` settings that change what the content means (theme and look keys stay ignored). */
export interface FlowConfig {
  /** `flowchart.curve`: the default line curve. */
  curve?: string;
  /** `htmlLabels: false` (or `flowchart.htmlLabels: false`). */
  htmlLabels?: boolean;
  /** `markdownAutoWrap: false`: markdown labels break at their line breaks only. */
  markdownAutoWrap?: boolean;
  /** `flowchart.wrappingWidth`: where markdown labels and captions wrap (default 200). */
  wrappingWidth?: number;
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
  /** `title` (statement or frontmatter), drawn above the diagram. */
  title?: string;
  /** `accTitle: …` and `accDescr: …` / `accDescr { … }`: the SVG's `<title>` and `<desc>`, the component's accessible name. */
  accTitle?: string;
  accDescr?: string;
  /** Settings from the frontmatter's `config:` / `%%{init}%%` that the drawing follows. */
  config?: FlowConfig;
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
  /** The message that creates it (`create participant X` and the next message, to X): its head is drawn at that row. */
  createdBy?: string;
  /** The message that destroys it (`destroy X` and the next message, from or to X): its lifeline ends there with a cross. */
  destroyedBy?: string;
  /** `link X: Label @ url` and `links X: {"Label": "url"}`, in order (a label given again keeps its place): the participant's menu. */
  links?: SeqLink[];
  /** `properties X: {…}` as Mermaid's JSON (kept for the participant's icon, T10.2). */
  properties?: Record<string, unknown>;
}

export interface SeqLink {
  label: string;
  url: string;
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
  /** The arrow as written (`->>`, `--x`, `-|\`…; one of Mermaid's 26 arrow tokens). */
  arrow: string;
  line: 'solid' | 'dotted';
  head: MessageHead;
  both: boolean;
  /** A half arrow head (11.17+: `-|\`, `-//`…): above (`top`) or below the line, as the line runs from `from` to `to`. */
  half?: 'top' | 'bottom';
  /** The half head is a single stroke (`-\\`, `-//`), not a filled triangle. */
  stick?: true;
  /** The head is at the `from` end, pointing back at it (`/|-`, `\|-`, `//-`, `\\-` and their dotted forms). */
  reverse?: true;
  /** Central connections (`A->>()B`, `A()->>B`, `A()->>()B`): a small circle on the lifeline's centre at that end. */
  central?: 'to' | 'from' | 'both';
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
  /** Messages are numbered somewhere (an `autonumber` statement that is not `autonumber off`). */
  autonumber: boolean;
  /** Every `autonumber` statement in code order: Mermaid numbers from the first one on, and each one can stop, restart or re-step it. */
  numbering: SeqNumbering[];
  title: string;
  /** `accTitle: …` and `accDescr: …` / `accDescr { … }`: the SVG's `<title>` and `<desc>`. */
  accTitle?: string;
  accDescr?: string;
}

/** One `autonumber` statement: `autonumber`, `autonumber 10`, `autonumber 10 5` or `autonumber off`. */
export interface SeqNumbering {
  line: number;
  on: boolean;
  start?: number;
  step?: number;
}

// ---- ER ---------------------------------------------------------------------------------------------------------

export type Cardinality = 'zero-one' | 'one' | 'zero-many' | 'one-many';
export type AttrKey = 'PK' | 'FK' | 'UK';

export interface ErAttribute {
  /** As written, with Mermaid's optional mark (`string?`, 11.16+). */
  type: string;
  name: string;
  keys: AttrKey[];
  comment: string;
}

/** A statement that writes an entity on its own (`A`, `A["Alias"]:::c`, `A { … }`), with its code offsets. */
export interface ErEntityStmt {
  line: number;
  endLine: number;
  start: number;
  end: number;
  /** It has a `{ … }` block. */
  block: boolean;
  /** Offsets of the id as written (quotes included), of the alias with its brackets and of the block from `{` to after `}`. */
  nameAt: [number, number];
  aliasAt?: [number, number];
  blockAt?: [number, number];
}

export interface Entity {
  id: string;
  /** The alias, else the id. */
  label: string;
  /** The alias as Mermaid keeps it (the first one written): a markdown text (`**bold**`, `*italic*`; T11). */
  alias?: string;
  attrs: ErAttribute[];
  order: number;
  lines: Set<number>;
  /** The last `{ … }` block: its first and its `}` line. */
  defLine?: number;
  endLine?: number;
  /** Classes in order (`:::a,b`, `class A c`). */
  classes: string[];
  /** `style A …` lines. */
  style: MermaidStyle;
  /** The subgraph it is drawn in (Mermaid: the first subgraph to close that mentions it), null at the top level. */
  parent: string | null;
  /** Its own statements (not relationships), in code order. */
  stmts: ErEntityStmt[];
}

export interface ErRel {
  /** `from--to`, or `from--to#n` for the n-th relationship between the same ends. */
  id: string;
  /** An entity's id, or a subgraph's (a relationship to a subgraph ends on its frame). */
  from: string;
  to: string;
  fromCard: Cardinality;
  toCard: Cardinality;
  identifying: boolean;
  label: string;
  /** Source line. */
  src: number;
  /** Offsets of the statement, of each end as written (quotes included), of the three relationship tokens and of the label. */
  start: number;
  end: number;
  fromAt: [number, number];
  toAt: [number, number];
  fromCardAt: [number, number];
  lineAt: [number, number];
  toCardAt: [number, number];
  /** The label token (absent: Mermaid's required `: label` is missing). */
  labelAt?: [number, number];
}

/** A `subgraph` (Mermaid 11.17+). */
export interface ErGroup {
  id: string;
  /** The title (`subgraph S [Title words]`), else the id. */
  label: string;
  parent: string | null;
  /** Its entities and subgraphs, in Mermaid's member order. */
  children: string[];
  order: number;
  /** `subgraph` line and `end` line (absent: never closed). */
  line: number;
  endLine?: number;
  /** Offsets: `subgraph` … after `end` (the end of the code when never closed). */
  start: number;
  end: number;
  /** Offsets of the id as written and of the header's end (after the id, or the `]` of the title). */
  idAt: [number, number];
  headEnd: number;
  lines: Set<number>;
  classes: string[];
  style: MermaidStyle;
  /** `direction LR` inside it (the last one written). */
  dir?: Direction;
}

export interface ErModel extends BaseModel {
  type: 'er';
  direction: Direction;
  /** Line of the last top-level `direction`, if any. */
  dirLine?: number;
  entities: Map<string, Entity>;
  rels: ErRel[];
  groups: Map<string, ErGroup>;
  classDefs: Record<string, MermaidStyle>;
  /** `:::c` / `class` uses whose class has no classDef (may still be a theme preset). */
  undefinedClasses: { cls: string; line: number }[];
  /** 0-based line of the `erDiagram` header (-1 when missing). */
  headerLine: number;
  /** The frontmatter's `title` (or a `title` statement), drawn above the diagram. */
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

// ---- mindmap ----------------------------------------------------------------------------------------------------

/** A mindmap node's shape as the code gives it: Mermaid's seven (the default is the underlined label). */
export type MindShape = 'mm-default' | 'rect' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon';

export interface MindNode {
  /** The written id when it is unique, else a positional `mm<k>` (k: the node's place in the code, 1-based). */
  id: string;
  /** The id as written (`id[text]`); null for a bare line or a bracket without an id. */
  written: string | null;
  label: string;
  /** The text is a markdown string (`"`…`"`). */
  md: boolean;
  shape: MindShape;
  /** The delimiters as written (`((`, `))`; empty for a bare line) and how the text is quoted. */
  open: string;
  close: string;
  quote: 'none' | 'str' | 'md';
  parent: string | null;
  children: string[];
  /** 0 for the root. */
  depth: number;
  /** Mermaid's section: -1 for the root, the first-level branch's index % 11 below it. */
  section: number;
  /** `::icon(fa fa-book)` as written (Mermaid parses but does not draw it). */
  icon: string | null;
  /** `:::a b` classes (the theme's presets of those names). */
  classes: string[];
  /** 0-based line of the node; `endLine` also covers its `::icon` / `:::` lines (and a quoted text over several lines). */
  line: number;
  endLine: number;
  /** The indentation as written (Mermaid counts characters: a tab is one) and its length. */
  indentText: string;
  indent: number;
  /** Offsets of the node statement in the code (after the indentation … after the closing delimiter). */
  start: number;
  end: number;
}

/** Settings of the frontmatter's `config.mindmap` / `%%{init}%%` that change the drawing. */
export interface MindmapConfig {
  /** Mermaid 12.2: colour by first-level branch (default) or by depth. */
  colorBy?: 'branch' | 'depth';
  /** Where labels wrap (default 200). */
  maxNodeWidth?: number;
}

export interface MindmapModel extends BaseModel {
  type: 'mindmap';
  root: string | null;
  /** Every node, in code order. */
  nodes: Map<string, MindNode>;
  colorBy: 'branch' | 'depth';
  maxNodeWidth: number;
  /** Settings as written (the editor writes `colorBy` back only when it differs from the default). */
  config: MindmapConfig;
  /** 0-based line of the `mindmap` header (-1 when missing). */
  header: number;
  /** The file's indentation step (detected; 2 spaces by default) for written lines. */
  indentUnit: string;
}

// ---- state diagram ----------------------------------------------------------------------------------------------

/** What a state is: Mermaid's default state, the pseudo-states `[*]` (start, end), or `<<choice>>` / `<<fork>>` / `<<join>>`. */
export type StateKind = 'state' | 'start' | 'end' | 'choice' | 'fork' | 'join';

/** One text a statement gives a state (its title or a description row), where it is written. */
export interface StateText {
  text: string;
  /** `state "Text" as id` (`as`), or `id : text` (`colon`). */
  form: 'as' | 'colon';
  line: number;
  /** Offsets of the text as written (inside the quotes; after the colon, trimmed). */
  start: number;
  end: number;
}

export interface StateNode {
  /**
   * The id as written; the pseudo-states `[*]` are `[*]start` / `[*]end` at the top level and `<composite>/[*]start`
   * inside a composite (`<composite>/<n>/[*]start` in its n-th concurrency region, n ≥ 2): an id the code gives cannot
   * hold `[*]`, so they never collide with states.
   */
  id: string;
  kind: StateKind;
  /** The title: the first text the code gives (`state "Text" as id`, `id : text`), else the id; empty for pseudo-states. */
  label: string;
  /** The description rows after the title (Mermaid's "rect with title"). */
  descriptions: string[];
  /** Every text the code gives the state, in code order (the title first). */
  texts: StateText[];
  /** The composite the state is drawn in (Mermaid: the last composite that mentions it), null at the top level. */
  parent: string | null;
  /** Its concurrency region in the parent (0-based). */
  region: number;
  /** Classes in order (`:::c`, `class a c`). */
  classes: string[];
  /** `style id …` lines. */
  style: MermaidStyle;
  /** Every line that mentions the state. */
  lines: Set<number>;
  /** Its own statement (`state x <<choice>>`, `state "T" as x`, the first `x : t`), else null (only mentioned in transitions). */
  defLine: number | null;
  /** Its place in code order (first mention). */
  order: number;
  /** `click id "url"` / `click id href "url"`, unvalidated (the renderer applies the link policy). */
  link?: string;
  tooltip?: string;
}

/** A `state X { … }` block of a composite (a composite can be written in several). */
export interface StateBlock {
  line: number;
  /** The `}` line (absent: never closed). */
  endLine?: number;
  /** Offsets: the `state` keyword … after the `}`. */
  start: number;
  end: number;
  /** `--` lines in it. */
  dividers: number[];
}

export interface StateGroup {
  id: string;
  /** The title (`state "Title" as X {`, or one `X : title` line), else the id. */
  label: string;
  texts: StateText[];
  parent: string | null;
  region: number;
  /** Direct children (states and composites), in code order. */
  children: string[];
  order: number;
  /** The first block's `state` line and `}` line. */
  line: number;
  endLine?: number;
  blocks: StateBlock[];
  /** `direction LR` written in it (the last one); absent: Mermaid lays it out top to bottom. */
  dir?: Direction;
  /** Concurrency regions (`--` separates them; 1 without). */
  regions: number;
  lines: Set<number>;
  classes: string[];
  style: MermaidStyle;
  link?: string;
  tooltip?: string;
}

export interface StateEdge {
  /** `from->to`, or `from->to#n` for the n-th transition between the same ends (as flowchart edges). */
  id: string;
  from: string;
  to: string;
  label: string;
  /** Source line. */
  src: number;
  /** Position among the transitions. */
  index: number;
  /** The composite and region it is written in (null: the top level). */
  scope: string | null;
  region: number;
  /** Offsets of the statement, of each end as written and of the label (`: text`, colon included). */
  start: number;
  end: number;
  fromAt: [number, number];
  toAt: [number, number];
  labelAt?: [number, number];
}

export interface StateNote {
  /** `n1`, `n2`… in code order. */
  id: string;
  target: string;
  side: 'left' | 'right';
  text: string;
  /** `note … : text` on one line, or the `note …` line to `end note`. */
  line: number;
  endLine: number;
  multi: boolean;
  /** The composite and region it is written in. */
  scope: string | null;
  region: number;
}

export interface StateModel extends BaseModel {
  type: 'state';
  /** The header as written (kept when the editor writes). */
  header: 'stateDiagram' | 'stateDiagram-v2';
  /** 0-based line of the header. */
  headerLine: number;
  /** The top-level direction (the last top-level `direction`; TB without). */
  direction: Direction;
  /** Line of the last top-level `direction`, if any. */
  dirLine?: number;
  nodes: Map<string, StateNode>;
  groups: Map<string, StateGroup>;
  edges: StateEdge[];
  notes: StateNote[];
  classDefs: Record<string, MermaidStyle>;
  /** `classDef` lines by class. */
  classDefLines: Record<string, number>;
  /** `:::c` / `class` uses whose class has no classDef (may still be a theme preset). */
  undefinedClasses: { cls: string; line: number }[];
  /** Frontmatter `title`, drawn above the diagram. */
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

// ---- unsupported ------------------------------------------------------------------------------------------------

export interface UnsupportedModel extends BaseModel {
  type: null;
  /** The first keyword of the code (`gantt`, `classDiagram`…), if any. */
  keyword?: string;
}

export type DiagramModel = FlowchartModel | SequenceModel | ErModel | MindmapModel | StateModel | UnsupportedModel;
export type SupportedModel = FlowchartModel | SequenceModel | ErModel | MindmapModel | StateModel;

export const isSupported = (m: DiagramModel): m is SupportedModel => m.type !== null;
export type { DiagramType };
