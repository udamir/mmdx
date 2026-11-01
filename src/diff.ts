// @mmdx/studio/diff — defines <mmdx-diff> on import (guarded) and exports the imperative class, its session, the history adapters and the part of the core's diff API that needs no diagram kind. Kinds load on demand: `diffDiagrams` and `renderDiffToSvg` are asynchronous and load the kinds of both versions first, so the entry ships no parser or renderer statically (the synchronous all-kinds `diffDiagrams` stays in `@mmdx/studio/core`).
import { defineDiff } from './elements/diff.js';

export {
  DiagramDiff, MmdxDiffElement, defineDiff, DIFF_VIEWS, DIFF_FILTERS,
  type DiffOptions, type DiffEventMap, type DiffViewName, type DiffFilter, type DiffPanel, type DiffMode, type DiffFeature, type DiffExportKind,
  type DiffExportOptions, type DiffAction, type DiffPair,
} from './elements/diff.js';
export { DiffSession, type DiffSessionOptions, type DiffSource, type DiffStatus } from './diff/session.js';
export { DiffScene, type DiffSceneOptions } from './diff/scene.js';
export { diffModules } from './diff/modules/index.js';
// the kernel types `DiagramDiff.core`, `diffModules()` and the scene expose (component architecture §11)
export type { ViewCore } from './view/core.js';
export type { ViewModule, ModuleScope } from './view/module.js';
export type { SceneSource } from './view/scene.js';
export type { Stage } from './view/types.js';
export type { DiagramCanvas } from './dom/canvas.js';
export { diffDiagrams, renderDiffToSvg } from './diff/kinds.js';
export { staticHistory, httpHistoryAdapter, contentId, type HistoryAdapter, type StaticVersion, type VersionInfo } from './adapters/history.js';
export { ignoreFacets, diffReport, unifiedDiff, type DiagramDiff as DiffResult, type ItemChange, type FieldChange, type ChangeFacet } from './core/diff/index.js';
export { configure, registerThemes, registerBuiltinThemes, type Config } from './config.js';

defineDiff();
