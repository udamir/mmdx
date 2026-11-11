// Types of tools/check-layers.mjs (tests/arch).
export interface ImportEdge { from: string; to: string; kind: 'value' | 'type' | 'dynamic' }
export function layerOf(file: string): [rank: number, area: string];
export function importEdges(root: string): ImportEdge[];
export function edgeViolation(e: ImportEdge): string | null;
export function layerViolations(root: string): string[];
export const MODULE_RULES: Record<string, RegExp>;
export function moduleViolations(root: string): string[];
export function compareBaseline(found: string[], baseline: string[]): { added: string[]; fixed: string[] };
export function readBaseline(file: string): string[];
