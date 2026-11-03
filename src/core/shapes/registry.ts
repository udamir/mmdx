// Shape lookup by name (T02): the 17 shapes every renderer draws are here from the start; the rest of the catalogue
// (core/shapes/catalog.ts) registers itself when a kind that draws them loads (the flowchart), so a viewer showing only
// sequence or ER diagrams does not ship Mermaid's flowchart geometry. A name resolves through the canonical id,
// Mermaid's shortName, its aliases and the legacy names mmdx reads.
import { BASE } from './base.js';
import type { ShapeDef, ShapeId } from './types.js';

interface Named {
  def: ShapeDef;
  /** Mermaid accepts the name in `@{ shape: … }`. */
  ok: boolean;
}

// A Map, not an object: `@{ shape: constructor }` must not find Object.prototype members.
const NAMES = new Map<string, Named>();
const BY_ID = new Map<string, ShapeDef>();

/** Adds shapes to the lookup (an id or name already taken keeps its first owner). */
export function registerShapes(defs: readonly ShapeDef[]): void {
  const name = (n: string, def: ShapeDef, ok: boolean): void => {
    if (!NAMES.has(n)) NAMES.set(n, { def, ok });
  };
  for (const def of defs) if (!BY_ID.has(def.id)) BY_ID.set(def.id, def);
  for (const def of defs) name(def.id, def, def.id === def.mermaid || def.aliases.includes(def.id));
  for (const def of defs) if (def.mermaid) name(def.mermaid, def, true);
  for (const def of defs) for (const a of def.aliases) name(a, def, true);
  for (const def of defs) for (const a of def.legacy ?? []) name(a, def, false);
}

registerShapes(BASE);
const RECT = BY_ID.get('rect')!;

/** The entry a name stands for (id, shortName, alias or legacy name) and whether Mermaid accepts that name; undefined when unknown. */
export const resolveShape = (n: string | undefined): Named | undefined => (n ? NAMES.get(n) : undefined);

/** The entry of a name, the rectangle for an unknown one (drawing never fails on a name). */
export const shapeDef = (n: string | undefined): ShapeDef => resolveShape(n)?.def ?? RECT;

/** The canonical id of a name (undefined when unknown). */
export const shapeIdOf = (n: string | undefined): ShapeId | undefined => resolveShape(n)?.def.id;

/** The entry of a canonical id. */
export const shapeById = (id: string): ShapeDef | undefined => BY_ID.get(id);
