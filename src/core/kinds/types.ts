// The kind descriptor (T01): one object per diagram type with everything the generic code needs from that type, so
// nothing outside the type's own files branches on `model.type`. A view kind is what drawing a diagram needs (the
// viewer, the diff, SSR); the editor adds an ops kind (core/kinds/ops-types.ts) and an edit kind (editor/kinds).
import type { SupportedModel } from '../model.js';
import type { RenderEnv, SubResult } from '../render/common.js';
import type { DiagramType } from '../types.js';

export interface ViewKind<M extends SupportedModel = SupportedModel> {
  readonly type: M['type'];
  /** Never throws on any input. */
  parse(code: string): M;
  /** The model of a source over the size limit: the right type, no items. */
  empty(): M;
  render(model: M, env: RenderEnv): SubResult;
}

/** The diagram types a pipeline can handle (the viewer: the ones it loaded; core: all of them). */
export type Kinds = Partial<Record<DiagramType, ViewKind>>;
