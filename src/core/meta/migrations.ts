// Metadata format migrations (§5.4). A file without `"v"` in `%%@ canvas` is v1, the prototype format.
// `migrate` brings metadata read at any older version up to META_VERSION; data from a newer version is left alone
// (its unknown keys and kinds are kept on round-trip anyway).
import { isColorValue } from '../validate.js';
import { META_VERSION } from './types.js';
import type { CanvasMeta, DiagramMeta } from './types.js';

/** Steps that turn metadata of version `n` into version `n + 1`. None yet: v1 is the current format. */
const UPGRADES: Readonly<Record<number, (m: DiagramMeta) => DiagramMeta>> = {};

export function migrate(meta: DiagramMeta, fromVersion: number): DiagramMeta {
  if (!Number.isFinite(fromVersion) || fromVersion > META_VERSION) return meta;
  let m = fromVersion <= 1 ? legacyV1(meta) : meta;
  for (let v = Math.max(1, Math.floor(fromVersion)); v < META_VERSION; v++) m = UPGRADES[v]?.(m) ?? m;
  return m;
}

/**
 * v1 keys the prototype wrote but never read: `canvas.frame` / `frameColor` (tools/build-examples.mjs).
 * They become `border` at the same place in the object, so the canvas line keeps its key order:
 * `frame: false` → `"none"`, `frame: true` → `frameColor` when it is a colour, else the palette's `@frame`.
 * An explicit `border` wins.
 */
function legacyV1(meta: DiagramMeta): DiagramMeta {
  const c = meta.canvas;
  if (!('frame' in c) && !('frameColor' in c)) return meta;
  const hasBorder = c.border !== undefined;
  const border = c['frame'] === false ? 'none' : isColorValue(c['frameColor']) ? c['frameColor'] : c['frame'] ? '@frame' : undefined;
  const canvas: CanvasMeta = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'frame' || k === 'frameColor') {
      if (!hasBorder && border !== undefined && canvas.border === undefined) canvas.border = border;
      continue;
    }
    canvas[k] = v;
  }
  return { ...meta, canvas };
}
