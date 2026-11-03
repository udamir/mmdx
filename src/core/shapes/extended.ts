// The geometry of the shapes beyond the 17 (T02.9): Mermaid's other flowchart shapes, choice and note (more.ts), the
// figures and media frames (figures.ts), each joined with its names (names.ts); and the media kit (T06: rich labels,
// icons, images; core/media/kit.ts), which renders need on the same occasions. Every kind registers them statically
// (core/kinds/all.ts, the catalogue the editor's flowchart and the theme editor read); the viewer and the diff load
// this module the first time a render draws one of these shapes or needs the kit (view/kinds.ts).
import { FIGURES } from './figures.js';
import { MORE } from './more.js';
import { EXTENDED_NAMES } from './names.js';
import { registerShapes } from './registry.js';
import { registerMediaKit } from '../media/kit.js';
import { MEDIA_KIT } from '../media/kit-impl.js';
import type { ShapeDef } from './types.js';

const NAMES = new Map(EXTENDED_NAMES.map((n) => [n.id, n]));

/** The entries, in catalogue order. */
export const EXTENDED: readonly ShapeDef[] = [...MORE, ...FIGURES].map((b) => ({ ...NAMES.get(b.id)!, ...b }));

/** Makes the shapes drawable (idempotent). */
export function registerExtendedShapes(): void {
  registerShapes(EXTENDED);
  registerMediaKit(MEDIA_KIT);
}
