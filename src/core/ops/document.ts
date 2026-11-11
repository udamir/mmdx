// The document as a whole (R9, task 5.7): a new diagram or a type switch, the direction (rows 52, 85), page settings
// (rows 63, 64, 86), and positional metadata following code changes.
import { KIND_INFO } from '../kinds/info.js';
import type { DiagramMeta } from '../meta/types.js';
import type { Direction, DiagramModel } from '../model.js';
import { withOps } from '../kinds/registry.js';
import { pagePresets } from '../render/page.js';
import type { ResolvedTheme } from '../theme/types.js';
import { type DiagramType } from '../types.js';
import { cloneMeta } from './meta-util.js';
import type { CodeResult, MetaResult } from './types.js';


// ---- diagram type, direction, autonumber (rows 52, 85) ------------------------------------------------------------

/**
 * Type switch: Mermaid diagram types cannot be converted into each other, so another type starts a new diagram
 * (the editor confirms first, and resets the file name and view). Returns the new document.
 */
export function newDiagram(type: DiagramType): { code: string; meta: DiagramMeta } {
  return { code: KIND_INFO[type].starter, meta: { canvas: {}, styles: {} } };
}

/** Empty Mermaid (no header): the chosen type is written as the first line; theme and layout settings stay. */
export function startDiagram(code: string, type: DiagramType): CodeResult {
  return { code: KIND_INFO[type].starter + code.replace(/^\s+/, '') };
}

/**
 * Direction: the flowchart header (`flowchart LR`), or an ER diagram's `direction LR` line (rewritten, or added
 * after the header). Sequence diagrams have none.
 */
export function setDirection(code: string, model: DiagramModel, dir: Direction): CodeResult {
  return withOps(model, (k, m) => k.setDirection?.(code, m, dir)) ?? { code };
}


// ---- page settings (rows 63, 64, 86) ------------------------------------------------------------------------------

/**
 * Sets a page value. The value the page would have anyway (the page preset's, else `dflt`) is not stored — but a
 * value different from the preset's is, even "free" / "curved" (otherwise the preset would win).
 */
export function setPage(meta: DiagramMeta, theme: ResolvedTheme, type: DiagramType | null, k: string, v: unknown, dflt?: unknown): MetaResult {
  const out = cloneMeta(meta);
  const name = out.canvas.preset;
  const presets = type ? pagePresets(theme, type) : {};
  const preset = typeof name === 'string' && Object.hasOwn(presets, name) ? (presets[name] as Record<string, unknown>) : undefined;
  const base = preset?.[k] ?? dflt;
  if (v === undefined || v === base) delete out.canvas[k];
  else out.canvas[k] = v;
  return { meta: out };
}

/** Chooses the page preset ('' / null: none). */
export function setPagePreset(meta: DiagramMeta, id: string | null): MetaResult {
  const out = cloneMeta(meta);
  if (id) out.canvas.preset = id;
  else delete out.canvas.preset;
  return { meta: out };
}

// ---- positional ids follow code changes ----------------------------------------------------------------------------

/** Metadata carried over to new positional ids after a code change (types with stable ids: unchanged). */
export function remapMeta(oldModel: DiagramModel, oldCode: string, model: DiagramModel, newCode: string, meta: DiagramMeta): DiagramMeta {
  if (!model.type || model.type !== oldModel.type) return meta;
  return withOps(model, (k, m) => k.remapMeta?.(meta, oldModel as typeof m, oldCode, m, newCode)) ?? meta;
}
