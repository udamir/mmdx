// CoreContext (§5.3): everything instance-scoped that the pure core needs. No module singletons.
// This module bundles no themes; context.ts adds the built-in ones as the default registry.
import { IconRegistry } from './icons/registry.js';
import type { ThemeRegistry } from './theme/registry.js';
import type { RenderContext } from './render/types.js';
import { createStaticMeasurer } from './text/measure.js';
import { DEFAULT_IMAGE_POLICY, DEFAULT_LINK_POLICY, type UrlResolver } from './validate.js';

/**
 * One component instance's context (A18: what it shares with a render is RenderContext's, picked from there, so the
 * two are typed once): the measurer, the ids' prefix, the policies, the URL resolver and image sizes, plus its theme
 * registry, icon registry and locale.
 */
export interface CoreContext extends Pick<RenderContext, 'measure' | 'idPrefix' | 'linkPolicy' | 'imagePolicy' | 'imageSizes'> {
  themes: ThemeRegistry;
  /**
   * Icon packs (T04): `pack:name` label tokens, icon nodes and mindmap icons are looked up here. Components share the
   * registry of `configure({ iconPacks })` (or extend it with their own packs); SSR builds one with `createIconRegistry`.
   */
  icons: IconRegistry;
  /**
   * The host's resolver of content URLs (images and links): what a relative (or any) URL written in a diagram points
   * at, before the image and link policies check it. Functions do not reach the render worker: with a resolver, every
   * diagram renders on the main thread.
   */
  resolveUrl?: UrlResolver;
  locale?: string;
}

let counter = 0;
/** A short unique prefix; deterministic within one process run (ids only need to be unique on the page). */
export const nextIdPrefix = (): string => `mmdx${(++counter).toString(36)}-`;

/** Like createContext, with the theme registry given (no built-in themes are bundled through this path). */
export function createContextWith(opts: Partial<CoreContext> & { themes: ThemeRegistry }): CoreContext {
  const ctx: CoreContext = {
    themes: opts.themes,
    measure: opts.measure ?? createStaticMeasurer(),
    idPrefix: opts.idPrefix ?? nextIdPrefix(),
    linkPolicy: opts.linkPolicy ?? DEFAULT_LINK_POLICY,
    imagePolicy: opts.imagePolicy ?? DEFAULT_IMAGE_POLICY,
    // the built-in set only; the code that decodes icons loads on the first lookup (renderToSvg and the markdown
    // plugins wait for it: `preload`), `createIconRegistry` has it at once
    icons: opts.icons ?? new IconRegistry(),
  };
  if (opts.locale !== undefined) ctx.locale = opts.locale;
  if (opts.resolveUrl) ctx.resolveUrl = opts.resolveUrl;
  return ctx;
}
