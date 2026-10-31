// mmdx/diff — defines <mmdx-diff> on import (guarded) and exports the imperative class, its session, the history
// adapters and the diff API of the core. Diagram kinds load on demand (`renderDiffToSvg` loads the kinds of both
// versions first), so the entry ships no parser or renderer it does not need.
import { defineDiff } from './elements/diff.js';

export {
  DiagramDiff, MmdxDiffElement, defineDiff, DIFF_VIEWS, DIFF_FILTERS,
  type DiffOptions, type DiffEventMap, type DiffViewName, type DiffFilter, type DiffPanel, type DiffMode, type DiffFeature, type DiffExportKind,
  type DiffExportOptions, type DiffAction, type DiffPair,
} from './elements/diff.js';
export { DiffSession, type DiffSessionOptions, type DiffSource, type DiffStatus } from './diff/session.js';
export { renderDiffToSvg } from './diff/kinds.js';
export { staticHistory, httpHistoryAdapter, contentId, type HistoryAdapter, type StaticVersion, type VersionInfo } from './adapters/history.js';
export { diffDiagrams, ignoreFacets, diffReport, unifiedDiff, type DiagramDiff as DiffResult, type ItemChange, type FieldChange, type ChangeFacet } from './core/diff/index.js';
export { configure, type Config } from './config.js';

defineDiff();
