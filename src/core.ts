// @mmdx/studio/core — the pure API (§5.5): parse, render to SVG, metadata, themes, ops. Runs in Node, workers and browsers.
export * from './core/types.js';
export * from './core/model.js';
export type { StyleProps, ArrowType, Routing, Side } from './core/style.js';
export { parse, detectType, cleanLabel, encodeLabel } from './core/parse/index.js';
export { splitSource, joinSource, metaToLines, checkMetaLine, pruneMeta, normalizeMeta, mergeLegacySidecar, META_HEADER, type DiagramDocument } from './core/meta/index.js';
export type { DiagramMeta, CanvasMeta, ItemMeta, LayerMeta, PageSettings } from './core/meta/types.js';
export { ThemeRegistry, BASELINE } from './core/theme/registry.js';
export { BUILTIN_THEMES, createDefaultRegistry } from './core/theme/builtin.js';
export { validateTheme, migrateTheme } from './core/theme/validate.js';
export { resolveColor, relativeColor, createColorResolver } from './core/theme/colors.js';
export type { ThemeFile, ThemeInfo, ResolvedTheme } from './core/theme/types.js';
export { createContext, type CoreContext } from './core/context.js';
export { renderSource, renderDocument, renderToSvg, standaloneSvg, ALL_KINDS, type Rendered, type PipelineOptions, type Kinds } from './core/pipeline.js';
export type { RenderResult, GeometryIndex } from './core/render/types.js';
export { serializeNode, serializeNodes, fmt } from './core/scene/serialize.js';
export type { SceneNode } from './core/scene/types.js';
export { createStaticMeasurer, type TextMeasurer, type FontSpec } from './core/text/measure.js';
export { safeUrl, DEFAULT_LINK_POLICY, type LinkPolicy, type SafeUrl } from './core/validate.js';
export { layerDefs, hiddenByLayers, DEFAULT_LAYER } from './core/layers.js';
export { outline, summarize } from './core/outline.js';
export {
  diffDiagramsWith, diffModels, ignoreFacets, withoutStyle, withLayoutOf, mergeDiagrams, diffReport, unifiedDiff,
  diffWords, diffLines, mergeText, annotate, changeKey, FACETS, DIFF_COLORS,
  type DiagramDiff, type ItemChange, type FieldChange, type ChangeFacet, type ChangeStatus, type DiffIgnore,
  type DiffView, type VersionInfo, type ReportOptions, type UnifiedDiffOptions, type Merged,
} from './core/diff/index.js';
export { renderDiffWith, renderDiffToSvgWith, diffSvg, type DiffHide, type DiffRendered, type DiffRenderOptions, type DiffSvgOptions } from './core/diff/render.js';
export { diffDiagrams, renderDiff, renderDiffToSvg } from './core/diff/all.js';
