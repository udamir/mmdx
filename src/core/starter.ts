// Starter sources: what a new diagram of each type starts from (the studio's New menu; hosts that create diagrams).
import { KIND_INFO } from './kinds/info.js';
import type { DiagramType } from './types.js';

export type StarterType = DiagramType;

/** The source a new, empty diagram of the type starts from. */
export function starterSource(type: StarterType): string {
  const s = Object.hasOwn(KIND_INFO, type) ? KIND_INFO[type].starter : undefined;
  if (s === undefined) throw new Error(`Unknown diagram type "${String(type)}"`);
  return s;
}
