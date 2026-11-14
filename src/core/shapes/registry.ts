// Shape lookup by name (T02): the 17 shapes every renderer draws are here from the start; the names of the rest
// (core/shapes/names.ts) register with the flowchart parser, so parsing and its diagnostics know every Mermaid shape
// name, and their geometry (core/shapes/extended.ts) where it is needed: statically with every kind (core, SSR, the
// worker, the editor's flowchart, the theme editor), on demand in the viewer and the diff the first time a render draws
// one of those shapes (T02.9). So a viewer of sequence or ER diagrams ships neither, and a page of plain flowcharts no
// geometry beyond the 17. A name resolves through the canonical id, Mermaid's shortName, its aliases and the legacy
// names mmdx reads.
import { BASE } from './base.js';
import { missShape } from './misses.js';
import type { ShapeDef, ShapeId, ShapeNames } from './types.js';

interface Named {
  names: ShapeNames;
  /** Mermaid accepts the name in `@{ shape: … }`. */
  ok: boolean;
}

// A Map, not an object: `@{ shape: constructor }` must not find Object.prototype members.
const NAMES = new Map<string, Named>();
const NAMED: ShapeNames[] = [];
const BY_ID = new Map<string, ShapeDef>();

/** Adds shapes' names to the lookup (a name already taken keeps its first owner). */
export function registerShapeNames(entries: readonly ShapeNames[]): void {
  const name = (n: string, names: ShapeNames, ok: boolean): void => {
    if (!NAMES.has(n)) NAMES.set(n, { names, ok });
  };
  for (const s of entries) if (!NAMED.some((x) => x.id === s.id)) NAMED.push(s);
  for (const s of entries) name(s.id, s, s.id === s.mermaid || s.aliases.includes(s.id));
  for (const s of entries) if (s.mermaid) name(s.mermaid, s, true);
  for (const s of entries) for (const a of s.aliases) name(a, s, true);
  for (const s of entries) for (const a of s.legacy ?? []) name(a, s, false);
}

/** Adds shapes with their geometry (an id already drawn keeps its first entry). */
export function registerShapes(defs: readonly ShapeDef[]): void {
  registerShapeNames(defs);
  for (const def of defs) if (!BY_ID.has(def.id)) BY_ID.set(def.id, def);
}

registerShapes(BASE);
const RECT = BY_ID.get('rect')!;

/** Forgets the geometry of every shape beyond the 17 (tests of on-demand loading start from those). */
export function forgetShapes(): void {
  for (const id of [...BY_ID.keys()]) if (!BASE.some((d) => d.id === id)) BY_ID.delete(id);
}

/** The names of a name (id, shortName, alias or legacy name) and whether Mermaid accepts that name; undefined when unknown. */
export const resolveShape = (n: string | undefined): Named | undefined => (n ? NAMES.get(n) : undefined);

/** Every shape's names, in catalogue order (the parser's bracket forms). */
export const namedShapes = (): readonly ShapeNames[] => NAMED;

/**
 * The entry of a name, the rectangle for an unknown one (drawing never fails on a name) and for a known one whose
 * geometry is not loaded — which core/shapes/misses.ts counts, so the viewer can load it and draw again.
 */
export function shapeDef(n: string | undefined): ShapeDef {
  const r = resolveShape(n);
  if (!r) return RECT;
  const def = BY_ID.get(r.names.id);
  if (def) return def;
  missShape();
  return RECT;
}

/** The canonical id of a name (undefined when unknown). */
export const shapeIdOf = (n: string | undefined): ShapeId | undefined => resolveShape(n)?.names.id;

/** The entry of a canonical id, when its geometry is loaded. */
export const shapeById = (id: string): ShapeDef | undefined => BY_ID.get(id);

/** The entry of a name, when it is known and its geometry is loaded. */
export const knownShape = (n: string | undefined): ShapeDef | undefined => {
  const r = resolveShape(n);
  return r && BY_ID.get(r.names.id);
};

/**
 * A theme's per-shape styles (`flowchart.nodeShapes`) keyed by canonical id: a theme file may name a shape by its
 * id or by any name the catalogue knows (`cyl`, `lean-r`); the canonical id's own key wins.
 */
export function byShapeId<T>(rec: Readonly<Record<string, T>> | undefined): Record<string, T> | undefined {
  if (!rec) return rec;
  const out: Record<string, T> = Object.create(null) as Record<string, T>;
  for (const [k, v] of Object.entries(rec)) {
    const id = shapeIdOf(k) ?? k;
    if (!(id in out) || k === id) out[id] = v;
  }
  return out;
}
