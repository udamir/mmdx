// The extras kind (A11c): what only core's text and export functions need of a diagram type — the text outline
// (core's `outline()`) and the style lines of a portable Mermaid file. Kept apart from the view kind so the viewer's
// kind chunks never ship it; core registers every type's extras (core/kinds/all-extras.ts), the editor loads a type's
// with its kind chunk, the diff before a portable export.
import type { DiagramMeta } from '../meta/types.js';
import type { SupportedModel } from '../model.js';
import type { RenderContext } from '../render/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { DiagramType } from '../types.js';
import type { OutlineItem } from './types.js';

export interface ExtrasKind<M extends SupportedModel = SupportedModel> {
  readonly type: M['type'];
  /** The text outline (screen readers, copying). */
  outline(model: M): OutlineItem[];
  /** The `classDef` / `style` / `linkStyle` lines that make a portable Mermaid file look as mmdx draws it; none: the `%%@` lines are only removed. */
  portableStyles?(model: M, meta: DiagramMeta, theme: ResolvedTheme, ctx: RenderContext): string[];
}

export type ExtrasKinds = Partial<Record<DiagramType, ExtrasKind>>;
