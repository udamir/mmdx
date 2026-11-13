// mmdx/core — the pure API (§5.5): parse, render to SVG, metadata, themes, ops. Runs in Node, workers and browsers.
// Every export is listed by name (A15): what this entry gives is what is written here, reviewed in
// tests/arch/__snapshots__/exports.txt (the names) and api-report.txt (their shapes).
export {
  type BuiltinType, type CenterBox, diag, type Diagnostic, type DiagnosticFix, diagnosticText, type DiagramType, ITEM_KINDS, itemKey,
  type ItemKey, type ItemKind, type ItemRef, parseItemKey, type Point, type Rect, type Severity, type SourceRange,
} from './core/types.js';
export {
  type AttrKey, type BaseModel, type BlockKind, type BracketSpan, type Cardinality, type DataEntry, type DataValue,
  type DiagramModel, type Direction, type EdgeHead, type EdgeLine, type Entity, type ErAttribute,
  type ErEntityStmt, type ErGroup, type ErModel, type ErRel, type FlowchartModel, type FlowConfig, type FlowEdge,
  type FlowEdgeData, type FlowGroup, type FlowLink, type FlowMention, type FlowNode, type FlowNodeData,
  type FlowStatement, isSupported, type MermaidStyle, type MessageHead, type MindmapConfig, type MindmapModel,
  type MindNode, type MindShape, type NodeDataBlock, type NodeShape, type Participant, type ParticipantShape,
  type SeqActivate, type SeqBlockElse, type SeqBlockEnd, type SeqBlockStart, type SeqBox, type SeqItem, type SeqLink,
  type SeqMessage, type SeqNote, type SeqNumbering, type SequenceModel, type StateBlock, type StateEdge,
  type StateGroup, type StateKind, type StateModel, type StateNode, type StateNote, type StateText,
  type SupportedModel, type UnsupportedModel,
} from './core/model.js';
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
export {
  safeUrl, resolveContentUrl, DEFAULT_LINK_POLICY, DEFAULT_IMAGE_POLICY,
  type LinkPolicy, type SafeUrl, type ImagePolicy, type ImageDataType, type SafeImageUrl, type UrlResolver, type ContentUrlKind,
} from './core/validate.js';
export { safeImageUrl, checkImageUrl, type ImageBlockReason } from './core/media/policy.js';
export { createIconRegistry } from './core/icons/index.js';
export { iconNamesOf } from './core/icons/scan.js';
export type { IconRegistry, IconRegistryOptions, IconPackInfo } from './core/icons/registry.js';
export type { IconPack, IconifyJSON, IconifyIcon, IconifyAlias, IconifyInfo, IconData, IconResult, IconMissing, IconForm, IconSnapshot } from './core/icons/types.js';
export { layerDefs, hiddenByLayers, DEFAULT_LAYER } from './core/layers.js';
export { starterSource, type StarterType } from './core/starter.js';
// core's outline and portable export read every type's extras kind
import './core/kinds/all-extras.js';
export { outline, summarize } from './core/outline.js';
export {
  ignoreFacets, withoutStyle, withLayoutOf, diffReport, unifiedDiff, diffWords, diffLines, mergeText, changeKey, FACETS,
  DIFF_COLORS,
  type DiagramDiff, type ItemChange, type FieldChange, type ChangeFacet, type ChangeStatus, type DiffIgnore,
  type DiffView, type VersionInfo, type ReportOptions, type UnifiedDiffOptions, type Merged,
} from './core/diff/index.js';
export { diffSvg, type DiffHide, type DiffRendered, type DiffRenderOptions, type DiffSvgOptions } from './core/diff/render.js';
export {
  diffDiagrams, renderDiff, renderDiffToSvg, diffDiagramsWithAll as diffDiagramsWith, diffModelsAll as diffModels,
  mergeDiagramsAll as mergeDiagrams, annotateAll as annotate, renderDiffWithAll as renderDiffWith,
  renderDiffToSvgWithAll as renderDiffToSvgWith,
} from './core/diff/all.js';
