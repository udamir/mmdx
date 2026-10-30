// CoreContext (§5.3): everything instance-scoped that the pure core needs. No module singletons.
// This module bundles no themes; context.ts adds the built-in ones as the default registry.
import type { ThemeRegistry } from './theme/registry.js';
import { createStaticMeasurer, type TextMeasurer } from './text/measure.js';
import { DEFAULT_LINK_POLICY, type LinkPolicy } from './validate.js';

export interface CoreContext {
  themes: ThemeRegistry;
  measure: TextMeasurer;
  /** Unique per instance, so SVG <defs> ids (markers, patterns) never collide between diagrams on one page. */
  idPrefix: string;
  linkPolicy: LinkPolicy;
  locale?: string;
}

let counter = 0;
/** A short unique prefix; deterministic within one process run (ids only need to be unique on the page). */
export const nextIdPrefix = (): string => `ds${(++counter).toString(36)}-`;

/** Like createContext, with the theme registry given (no built-in themes are bundled through this path). */
export function createContextWith(opts: Partial<CoreContext> & { themes: ThemeRegistry }): CoreContext {
  const ctx: CoreContext = {
    themes: opts.themes,
    measure: opts.measure ?? createStaticMeasurer(),
    idPrefix: opts.idPrefix ?? nextIdPrefix(),
    linkPolicy: opts.linkPolicy ?? DEFAULT_LINK_POLICY,
  };
  if (opts.locale !== undefined) ctx.locale = opts.locale;
  return ctx;
}
