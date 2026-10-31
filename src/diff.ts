// mmdx/diff — defines <mmdx-diff> on import (guarded) and exports the imperative class, the history adapters and the
// diff API of the core.
import { defineDiff } from './elements/diff.js';

export {
  DiagramDiff, MmdxDiffElement, defineDiff, DIFF_VIEWS, DIFF_FILTERS,
  type DiffOptions, type DiffEventMap, type DiffViewName, type DiffFilter, type DiffPanel, type DiffMode, type DiffFeature, type DiffExportKind,
  type DiffExportOptions,
} from './elements/diff.js';
export { staticHistory, httpHistoryAdapter, contentId, type HistoryAdapter, type StaticVersion, type VersionInfo } from './adapters/history.js';
export { diffDiagrams, ignoreFacets, renderDiffToSvg, diffReport, unifiedDiff, type DiagramDiff as DiffResult, type ItemChange, type FieldChange, type ChangeFacet } from './core/diff/index.js';
export { configure, type Config } from './config.js';

defineDiff();
