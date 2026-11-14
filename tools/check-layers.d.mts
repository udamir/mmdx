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
/** The names of ViewCore's and EditorCore's signal, list and slot members. */
export function kernelSignals(root: string): Set<string>;
/** The writes of the named signals in a module's text: `core.name.set` → count. */
export function signalWritesIn(source: string, names: ReadonlySet<string>): Map<string, number>;
/** Module files writing a kernel or editor-core signal: `file: core.name.set ×count`. */
export function signalWrites(root: string): string[];
/** Hand-kept arrays of undo functions outside reactive/owner.ts: `file: name`. */
export function manualCleanupArrays(root: string): string[];
/** Blocks missing their CSS export, story or test: `name: what`. */
export function blockContractGaps(root: string): string[];
export function compareBaseline(found: string[], baseline: string[]): { added: string[]; fixed: string[] };
export function readBaseline(file: string): string[];
