// The kind descriptor (T01): one object per diagram type with everything the generic code needs from that type, so
// nothing outside the type's own files branches on `model.type`. A view kind is what drawing a diagram needs (the
// viewer, the diff, SSR); the editor adds an ops kind (core/kinds/ops-types.ts) and an edit kind (editor/kinds).
import type { DiagramMeta } from '../meta/types.js';
import type { SupportedModel } from '../model.js';
import type { RenderEnv, SubResult } from '../render/common.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { DiagramType, ItemKind, ItemRef } from '../types.js';

/** Style presets by name. */
export type Presets = Record<string, StyleProps>;

export interface ViewKind<M extends SupportedModel = SupportedModel> {
  readonly type: M['type'];
  /** Never throws on any input. */
  parse(code: string): M;
  /** The model of a source over the size limit: the right type, no items. */
  empty(): M;
  render(model: M, env: RenderEnv): SubResult;

  // ---- styles ----
  /** The theme's presets plus the diagram's own, for each item kind of the type. */
  presets(theme: ResolvedTheme, meta: DiagramMeta): Partial<Record<ItemKind, Presets>>;
  /**
   * The preset an item is drawn with when it is derived from its Mermaid code (classes, shape, line style): the
   * item's own preset first, as the renderer does. Undefined for kinds whose preset is only their own.
   */
  codePreset?(model: M, meta: DiagramMeta, theme: ResolvedTheme, ref: ItemRef): string | undefined;
  /** The shape the Mermaid code gives an item (undefined: none, the theme decides). */
  codeShape?(model: M, ref: ItemRef): string | undefined;
  /** The link the Mermaid code gives an item (`click`). */
  codeLink?(model: M, ref: ItemRef): string | undefined;
  /** The arrow heads the Mermaid code gives a connector (null: not a connector with heads). */
  codeEnds?(model: M, ref: ItemRef): { start: string; end: string } | null;
}

/** The diagram types a pipeline can handle (the viewer: the ones it loaded; core: all of them). */
export type Kinds = Partial<Record<DiagramType, ViewKind>>;
