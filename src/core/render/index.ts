// Render entry points with every supported diagram type (dispatch.ts holds the page logic and the SVG export).
import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import type { ResolvedTheme } from '../theme/types.js';
import { renderWith, type RendererSet } from './dispatch.js';
import { renderER } from './er.js';
import { renderFlowchart } from './flowchart.js';
import { renderSequence } from './sequence.js';
import type { RenderContext, RenderOptions, RenderResult } from './types.js';

export { effectivePage, fitPage, gridPattern, isClear, MIN_PAGE, pageBounds, pagePresets, pageScene, ratioOf } from './page.js';
export { edgePreset, flowPresets, groupPreset, nodePreset, presetShape } from './flowchart.js';
export { participantPresetShape, seqPresets } from './sequence.js';
export { erPresets } from './er.js';
export { LINK_COLOR, mergeStyle, pickStyle } from './common.js';
export { exportScene, renderSvgString, renderWith, type ExportScene, type RendererSet, type SvgStringOptions, type TypeRenderer } from './dispatch.js';

export const ALL_RENDERERS: RendererSet = { flowchart: renderFlowchart, sequence: renderSequence, er: renderER };

export function render(model: DiagramModel, meta: DiagramMeta, theme: ResolvedTheme, ctx: RenderContext, opts: RenderOptions = {}): RenderResult {
  return renderWith(ALL_RENDERERS, model, meta, theme, ctx, opts);
}
