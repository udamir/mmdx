// Result shapes of the source-rewriting ops (§6.2). The prototype returned loose `{ code, line, from, to, map }`
// objects; each op here returns one of these. `code` is always present: an op that cannot apply returns the input
// code unchanged, plus a `reason` when the user should be told why (the editor shows it as a toast).
import type { DiagramMeta } from '../meta/types.js';
import type { ItemRef } from '../types.js';

/** A rewrite of the Mermaid code. */
export interface CodeResult {
  code: string;
}

/** A rewrite that may be refused. */
export interface RefusableResult extends CodeResult {
  /** Set when nothing changed for a reason the user should see. */
  reason?: string;
}

/** A rewrite that creates or renames an item, which the editor then selects. */
export interface SelectResult extends CodeResult {
  select?: ItemRef;
}

/** A rewrite that lands on a line the code panel scrolls to. */
export interface LineResult extends CodeResult {
  /** 0-based line of the new / moved statement. */
  line: number;
}

export interface ConnectResult extends CodeResult {
  from?: string;
  to?: string;
  line?: number;
}

export interface MoveResult extends RefusableResult {
  line?: number;
}

export interface ResizeBlockResult extends RefusableResult {
  /** Line of the block's first statement after the step (the block id is positional: find it by this line). */
  start?: number;
}

export interface ActivationResult extends RefusableResult {
  /** The participant whose process changed. */
  participant?: string;
  /** toggleActivation: true when an existing process was removed. */
  removed?: boolean;
}

export interface SwapResult extends RefusableResult {
  /** The neighbour the participant traded places with. */
  other?: string;
}

export interface CloneResult extends CodeResult {
  /** Old id → id of its copy (absent when nothing was copied). */
  map?: Record<string, string>;
}

/** A line range of the code: `start` … `end`, both inclusive (0-based). */
export interface LineSpan {
  start: number;
  end: number;
}

/** Result of an op that may change both the code and the metadata. */
export interface DocResult {
  code: string;
  meta: DiagramMeta;
  selection?: ItemRef[];
  reason?: string;
}

/** Result of an op that only changes the metadata. */
export interface MetaResult {
  meta: DiagramMeta;
  reason?: string;
}
