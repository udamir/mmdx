// Types of tools/check-layers.mjs (tests/arch).
export interface ImportEdge { from: string; to: string; kind: 'value' | 'type' | 'dynamic' }
export function layerOf(file: string): [rank: number, area: string];
/** Core's sub-layer 0…9 (C0 base … C9 assembly) of a file relative to src/core/. */
export function coreLayerOf(file: string): number;
export function importEdges(root: string): ImportEdge[];
export function edgeViolation(e: ImportEdge): string | null;
export function layerViolations(root: string): string[];
/** File-level import cycles: one `a ↔ b ↔ …` key per cycle, files sorted. */
export function importCycles(root: string): string[];
export const MODULE_RULES: Record<string, RegExp>;
export function moduleViolations(root: string): string[];
export function compareBaseline(found: string[], baseline: string[]): { added: string[]; fixed: string[] };
export function readBaseline(file: string): string[];
