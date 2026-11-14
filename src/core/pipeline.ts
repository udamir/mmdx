// Derivation pipeline (§6.4) with every diagram kind: shared by the editor, SSR (renderToSvg), the markdown plugins
// and the render worker. The viewer uses pipeline-core.ts with the kind it loaded.
import { createContext, type CoreContext } from './context.js';
import { iconNamesOf } from './icons/scan.js';
import type { IconPack } from './icons/types.js';
import type { DiagramDocument } from './meta/index.js';
import type { DiagramModel } from './model.js';
import { ALL_VIEW_KINDS } from './kinds/all.js';
import { renderDocumentWith, renderSourceWith, standaloneSvg, type Kinds, type PipelineOptions, type Rendered } from './pipeline-core.js';

export { pickTheme, renderContext, standaloneSvg, type Kinds, type PipelineOptions, type Rendered } from './pipeline-core.js';

/** Every diagram kind (registered for the generic helpers on import). */
export const ALL_KINDS: Kinds = ALL_VIEW_KINDS;

export function renderDocument(doc: DiagramDocument, model: DiagramModel, ctx: CoreContext, opts: PipelineOptions = {}): Omit<Rendered, 'doc' | 'model' | 'tooLarge'> {
  return renderDocumentWith(ALL_KINDS, doc, model, ctx, opts);
}

/** Full pipeline from source text. Never throws on bad input. */
export function renderSource(src: string, ctx: CoreContext, opts: PipelineOptions = {}): Rendered {
  return renderSourceWith(ALL_KINDS, src, ctx, opts);
}

/**
 * Build-time and server-side rendering (§5.5, §11.4): source → standalone SVG string. Uses the static text
 * measurer unless the context brings another one. The icons the source references are loaded first (T04): from
 * `iconPacks` over the context's registry, the built-in set and Font Awesome look-alikes included.
 */
export async function renderToSvg(src: string, opts: { theme?: string; ctx?: CoreContext; layers?: 'visible' | 'all'; ssr?: boolean; iconPacks?: readonly IconPack[] } = {}): Promise<string> {
  const base = opts.ctx ?? createContext();
  const ctx = opts.iconPacks?.length ? { ...base, icons: base.icons.extend(opts.iconPacks) } : base;
  await ctx.icons.preload(iconNamesOf(src, ctx.icons));
  const p: PipelineOptions = {};
  if (opts.theme) p.theme = opts.theme;
  if (opts.layers === 'all') p.allLayers = true;
  const r = renderSource(src, ctx, p);
  return standaloneSvg(r, ctx, opts.ssr ? { ssr: true } : {});
}
