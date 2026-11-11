// Mindmap presets (T08), apart from the renderer so the ops kind and the editor do not load it: the theme's
// `mindmap.nodePresets` with the diagram's own `style.node` presets over them, and the preset a node is drawn with —
// its metadata's, else the first of its `:::` classes that names a preset (Mermaid's classes need the page's CSS; mmdx
// maps them to presets, as the flowchart does).
import type { DiagramMeta } from '../../meta/types.js';
import type { MindNode } from '../../model.js';
import type { StyleProps } from '../../style.js';
import type { ResolvedTheme } from '../../theme/types.js';
import { presetOf, presets } from '../../render/common.js';

export interface MindPresets {
  node: Record<string, StyleProps>;
}

export const mindPresets = (T: ResolvedTheme, meta: DiagramMeta): MindPresets => ({ node: presets(T.mindmap.nodePresets, meta.styles['node']) });

/** The preset a node is drawn with ('' for none). */
export function mindPreset(n: MindNode, meta: DiagramMeta, P: MindPresets): string {
  const own = meta.nodes?.[n.id]?.preset;
  if (typeof own === 'string' && own) return own;
  return n.classes.find((c) => presetOf(P.node, c)) ?? '';
}
