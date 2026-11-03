// The geometry of the shapes beyond the 17 (T02.9): Mermaid's other flowchart shapes, choice and note (more.ts), the
// figures and media frames (figures.ts), each joined with its names (names.ts). Every kind registers it statically
// (core/kinds/all.ts, the catalogue the editor's flowchart and the theme editor read); the viewer and the diff load
// this module the first time a render draws one of these shapes (view/kinds.ts).
import { FIGURES } from './figures.js';
import { MORE } from './more.js';
import { EXTENDED_NAMES } from './names.js';
import { registerShapes } from './registry.js';
import type { ShapeDef } from './types.js';

const NAMES = new Map(EXTENDED_NAMES.map((n) => [n.id, n]));

/** The entries, in catalogue order. */
export const EXTENDED: readonly ShapeDef[] = [...MORE, ...FIGURES].map((b) => ({ ...NAMES.get(b.id)!, ...b }));

/** Makes the shapes drawable (idempotent). */
export function registerExtendedShapes(): void {
  registerShapes(EXTENDED);
}
