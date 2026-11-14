// Derivation pipeline (§6.4): source → split → parse → theme → render, for a given set of diagram kinds (parsers +
// renderers). pipeline.ts binds it to every kind; the viewer binds it to the kind it loaded (§R5).
import type { CoreContext } from './context-base.js';
import { hiddenByLayers } from './layers.js';
import { splitSource, type DiagramDocument } from './meta/index.js';
import type { DiagramModel } from './model.js';
import type { Kinds } from './kind/types.js';
import { parseWith } from './parse/dispatch.js';
import { TOO_BIG_CODES } from './parse/limits.js';
import { renderSvgString, renderWith } from './render/dispatch.js';
import type { RenderContext, RenderResult } from './render/types.js';
import { createColorResolver, diagramPaletteOf } from './theme/colors.js';
import { BASELINE } from './theme/registry.js';
import type { ResolvedTheme } from './theme/types.js';
import { Lru } from './text/measure.js';
import type { Diagnostic, Point } from './types.js';

export type { Kinds } from './kind/types.js';

export interface PipelineOptions {
  /** Theme to draw with (default: baseline). Diagrams do not carry a theme: the host or the user picks it. */
  theme?: string;
  /** Only these layers are shown (overrides the stored hidden flags). */
  visibleLayers?: readonly string[];
  /** Connector labels off (View settings → Display). */
  hideLabels?: boolean;
  /** Ignore layers entirely (render every item). */
  allLayers?: boolean;
  /** ER tables drawn as editable tables (see RenderOptions.tableView). */
  tableView?: readonly string[];
}

export interface Rendered {
  doc: DiagramDocument;
  model: DiagramModel;
  theme: ResolvedTheme;
  themeId: string;
  rctx: RenderContext;
  result: RenderResult;
  /** Parser, metadata and theme diagnostics together. */
  diagnostics: Diagnostic[];
  /** The source exceeded the limits (§12): nothing was rendered. */
  tooLarge: boolean;
}

const layoutCaches = new WeakMap<CoreContext, Lru<string, Map<string, Point>>>();
/** The last colour resolver per instance: kept while the theme and the diagram palette stay (a drag renders often). */
const resolvers = new WeakMap<CoreContext, { theme: ResolvedTheme; palette: string; color: RenderContext['color'] }>();

/** The render context for one theme and diagram palette, with the instance's bounded layout cache. */
export function renderContext(ctx: CoreContext, theme: ResolvedTheme, doc: DiagramDocument): RenderContext {
  let cache = layoutCaches.get(ctx);
  if (!cache) layoutCaches.set(ctx, (cache = new Lru(64, 8192)));
  // resolved themes are not changed in place (the registry makes a new one), so the object tells a theme apart
  const palette = diagramPaletteOf(doc.meta.styles), key = JSON.stringify(palette);
  let c = resolvers.get(ctx);
  if (c?.theme !== theme || c.palette !== key) resolvers.set(ctx, (c = { theme, palette: key, color: createColorResolver(theme, palette) }));
  const r: RenderContext = {
    measure: ctx.measure,
    idPrefix: ctx.idPrefix,
    linkPolicy: ctx.linkPolicy,
    imagePolicy: ctx.imagePolicy,
    icons: ctx.icons,
    color: c.color,
    layoutCache: cache,
  };
  if (ctx.imageSizes) r.imageSizes = ctx.imageSizes;
  if (ctx.resolveUrl) r.resolveUrl = ctx.resolveUrl;
  return r;
}

/** Picks the theme: the given one, else baseline; reports a theme the registry does not have. */
export function pickTheme(ctx: CoreContext, _doc: DiagramDocument, forced?: string): { id: string; theme: ResolvedTheme; diagnostics: Diagnostic[] } {
  const want = forced ?? BASELINE;
  const diagnostics: Diagnostic[] = [];
  if (!ctx.themes.has(want))
    diagnostics.push({ severity: 'info', code: 'theme.missing', message: `Theme "${want}" is not available; using Baseline`, source: 'meta', params: { theme: want } });
  const id = ctx.themes.has(want) ? want : BASELINE;
  return { id, theme: ctx.themes.get(id), diagnostics };
}

export function renderDocumentWith(kinds: Kinds, doc: DiagramDocument, model: DiagramModel, ctx: CoreContext, opts: PipelineOptions = {}): Omit<Rendered, 'doc' | 'model' | 'tooLarge'> {
  const picked = pickTheme(ctx, doc, opts.theme);
  const rctx = renderContext(ctx, picked.theme, doc);
  const hidden = opts.allLayers ? {} : hiddenByLayers(model, doc.meta, opts.visibleLayers);
  const ropts: Parameters<typeof renderWith>[5] = { hidden };
  if (opts.hideLabels) ropts.hideLabels = true;
  if (opts.tableView?.length) ropts.tableView = opts.tableView;
  const result = renderWith(kinds, model, doc.meta, picked.theme, rctx, ropts);
  return { theme: picked.theme, themeId: picked.id, rctx, result, diagnostics: [...picked.diagnostics, ...(result.diagnostics ?? [])] };
}

/** Full pipeline from source text. Never throws on bad input. `parse` reads the code (a caller's memo: a diff parses each version once). */
export function renderSourceWith(kinds: Kinds, src: string, ctx: CoreContext, opts: PipelineOptions = {}, parse: (code: string) => DiagramModel = (c) => parseWith(c, kinds)): Rendered {
  const split = splitSource(src);
  const model = parse(split.doc.code);
  const tooLarge = model.diagnostics.some((d) => TOO_BIG_CODES.has(d.code));
  const r = renderDocumentWith(kinds, split.doc, model, ctx, opts);
  return {
    doc: split.doc,
    model,
    tooLarge,
    ...r,
    diagnostics: [...model.diagnostics, ...split.diagnostics, ...r.diagnostics],
  };
}

/** Standalone `<svg xmlns=…>` document of a rendered diagram (export, SSR). */
export function standaloneSvg(r: Rendered, _ctx?: CoreContext, attrs: { ssr?: boolean } = {}): string {
  return renderSvgString(r.result, r.rctx, attrs);
}
