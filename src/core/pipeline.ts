// Derivation pipeline (§6.4) with every diagram kind: shared by the editor, SSR (renderToSvg), the markdown plugins
// and the render worker. The viewer uses pipeline-core.ts with the kind it loaded.
import { createContext, type CoreContext } from './context.js';
import type { DiagramDocument } from './meta/index.js';
import type { DiagramModel } from './model.js';
import { ALL_PARSERS } from './parse/index.js';
import { renderDocumentWith, renderSourceWith, standaloneSvg, type Kinds, type PipelineOptions, type Rendered } from './pipeline-core.js';
import { ALL_RENDERERS } from './render/index.js';

export { pickTheme, renderContext, standaloneSvg, type Kinds, type PipelineOptions, type Rendered } from './pipeline-core.js';

export const ALL_KINDS: Kinds = { parsers: ALL_PARSERS, renderers: ALL_RENDERERS };

export function renderDocument(doc: DiagramDocument, model: DiagramModel, ctx: CoreContext, opts: PipelineOptions = {}): Omit<Rendered, 'doc' | 'model' | 'tooLarge'> {
  return renderDocumentWith(ALL_KINDS, doc, model, ctx, opts);
}

/** Full pipeline from source text. Never throws on bad input. */
export function renderSource(src: string, ctx: CoreContext, opts: PipelineOptions = {}): Rendered {
  return renderSourceWith(ALL_KINDS, src, ctx, opts);
}

/**
 * Build-time and server-side rendering (§5.5, §11.4): source → standalone SVG string. Uses the static text
 * measurer unless the context brings another one.
 */
export async function renderToSvg(src: string, opts: { theme?: string; ctx?: CoreContext; layers?: 'visible' | 'all'; ssr?: boolean } = {}): Promise<string> {
  const ctx = opts.ctx ?? createContext();
  const p: PipelineOptions = {};
  if (opts.theme) p.theme = opts.theme;
  if (opts.layers === 'all') p.allLayers = true;
  const r = renderSource(src, ctx, p);
  return standaloneSvg(r, ctx, opts.ssr ? { ssr: true } : {});
}
