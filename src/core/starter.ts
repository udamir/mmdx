// Starter sources: what a new diagram of each type starts from (the studio's New menu; hosts that create diagrams).
import { kindInfo } from './kinds/info.js';
import type { DiagramType } from './types.js';

export type StarterType = DiagramType;

/** The source a new, empty diagram of the type starts from. */
export function starterSource(type: StarterType): string {
  const s = kindInfo(type)?.starter;
  if (s === undefined) throw new Error(`Unknown diagram type "${String(type)}"`);
  return s;
}
