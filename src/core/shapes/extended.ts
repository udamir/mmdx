// The geometry of the shapes beyond the 17 (T02.9): Mermaid's other flowchart shapes, choice and note (more.ts), the
// figures and media frames (figures.ts), each joined with its names (names.ts). core/extras.ts registers them with the
// media kit.
import { FIGURES } from './figures.js';
import { MORE } from './more.js';
import { EXTENDED_NAMES } from './names.js';
import type { ShapeDef } from './types.js';

const NAMES = new Map(EXTENDED_NAMES.map((n) => [n.id, n]));

/** The entries, in catalogue order. */
export const EXTENDED: readonly ShapeDef[] = [...MORE, ...FIGURES].map((b) => ({ ...NAMES.get(b.id)!, ...b }));
