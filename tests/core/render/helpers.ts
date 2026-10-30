// Shared fixtures for the render tests: examples, built-in themes and the production pipeline.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitSource } from '../../../src/core/meta/index.js';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import type { DiagramModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';
import { render, renderSvgString } from '../../../src/core/render/index.js';
import type { RenderContext, RenderOptions, RenderResult } from '../../../src/core/render/types.js';
import { ThemeRegistry } from '../../../src/core/theme/registry.js';
import { createColorResolver, diagramPaletteOf } from '../../../src/core/theme/colors.js';
import type { ResolvedTheme } from '../../../src/core/theme/types.js';
import { createStaticMeasurer, type TextMeasurer } from '../../../src/core/text/measure.js';
import { DEFAULT_LINK_POLICY } from '../../../src/core/validate.js';

const ROOT = join(__dirname, '../../..');

export const EXAMPLES: { name: string; src: string }[] = readdirSync(join(ROOT, 'examples'))
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((name) => ({ name, src: readFileSync(join(ROOT, 'examples', name), 'utf8') }));

/** The built-in themes, from the manifest (themes/index.json). */
const THEME_FILES = (JSON.parse(readFileSync(join(ROOT, 'themes', 'index.json'), 'utf8')) as { themes: string[] }).themes
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'themes', f), 'utf8')) as { id: string });

export const THEME_IDS: string[] = THEME_FILES.map((t) => t.id);

export const registry = new ThemeRegistry(THEME_FILES);

export function makeCtx(theme: ResolvedTheme, meta: DiagramMeta, o: { measure?: TextMeasurer; idPrefix?: string } = {}): RenderContext {
  return {
    measure: o.measure ?? createStaticMeasurer(),
    idPrefix: o.idPrefix ?? 't-',
    linkPolicy: DEFAULT_LINK_POLICY,
    color: createColorResolver(theme, diagramPaletteOf(meta.styles)),
  };
}

export interface ProdRender {
  model: DiagramModel;
  meta: DiagramMeta;
  theme: ResolvedTheme;
  ctx: RenderContext;
  result: RenderResult;
  svg: string;
}

export function renderProd(
  src: string,
  themeId?: string,
  o: { measure?: TextMeasurer; idPrefix?: string; opts?: RenderOptions; layoutCache?: RenderContext['layoutCache'] } = {},
): ProdRender {
  const { doc } = splitSource(src);
  const model = parse(doc.code);
  const theme = registry.get(themeId ?? (typeof doc.meta.canvas.theme === 'string' ? doc.meta.canvas.theme : 'default-light'));
  const ctx = makeCtx(theme, doc.meta, o);
  if (o.layoutCache) ctx.layoutCache = o.layoutCache;
  const result = render(model, doc.meta, theme, ctx, o.opts ?? {});
  return { model, meta: doc.meta, theme, ctx, result, svg: renderSvgString(result, ctx) };
}
