// App-level shared configuration (§8): configure() sets defaults every instance reads; each instance can override.
// This is the one deliberate shared object (§1 goal 2): read-only after creation of each instance's context. The
// themes every component lists are in platform/themes.ts, the stock Mermaid bridge in platform/mermaid.ts.
import type { ThemeSource, MermaidLike } from '../ports.js';
import { createContextWith, type CoreContext } from '../core/context-base.js';
import { IconRegistry } from '../core/icons/registry.js';
import type { IconPack } from '../core/icons/types.js';
import { ThemeRegistry } from '../core/theme/registry.js';
import { BASELINE_THEME } from '../core/theme/baseline.js';
import { createStaticMeasurer, type TextMeasurer } from '../core/text/measure.js';
import { DEFAULT_IMAGE_POLICY, DEFAULT_LINK_POLICY, type ImagePolicy, type LinkPolicy, type UrlResolver } from '../core/validate.js';
import { createCanvasMeasurer } from '../dom/measure.js';
import { createI18n, type I18n, type Messages } from '../i18n.js';

export interface Config {
  themes?: ThemeRegistry;
  themeSource?: ThemeSource;
  measure?: TextMeasurer;
  i18n?: { locale: string; messages?: Messages };
  linkPolicy?: LinkPolicy;
  /** Which image URLs diagrams may show (T03): `https:` only by default; `http:` and `data:` can be enabled. */
  imagePolicy?: ImagePolicy;
  /**
   * Resolves the URLs diagrams point at — images and links — before the image and link policies check them: return
   * the URL to use (a relative path made absolute, an attachment's name made its download URL), or null / undefined to
   * use the URL as written. The diagram's code keeps what was written.
   */
  resolveUrl?: UrlResolver;
  /**
   * Icon packs (T04), as Mermaid's `registerIconPacks` takes them: `{ name, icons }` or `{ name, loader }` (called on the
   * first icon of the pack a diagram shows). Merged across calls; a pack of a registered name replaces it. Stock
   * Mermaid (the fallback renderer) receives the same packs.
   */
  iconPacks?: IconPack[];
  /** The built-in Tabler subset under `tabler` (default true); a host's own `tabler` pack replaces it. */
  builtinIcons?: boolean;
  /**
   * A Mermaid instance, or a loader (`() => import('mermaid')` in a bundled app); default: `mermaid` imported at run
   * time where it resolves (Node, an import map).
   */
  mermaid?: MermaidLike | (() => Promise<MermaidLike>);
  /** Font files for PNG export (§7.4): family name → URL or bytes. */
  fonts?: Record<string, string | ArrayBuffer>;
}

interface Shared {
  themes: ThemeRegistry;
  measure: TextMeasurer;
  i18n: I18n;
  linkPolicy: LinkPolicy;
  imagePolicy: ImagePolicy;
  resolveUrl: UrlResolver | undefined;
  icons: IconRegistry;
  themeSource: ThemeSource | undefined;
  mermaid: Config['mermaid'];
  fonts: Record<string, string | ArrayBuffer>;
}

let shared: Shared | null = null;

function defaults(): Shared {
  return {
    themes: new ThemeRegistry([BASELINE_THEME]),
    measure: createCanvasMeasurer() ?? createStaticMeasurer(),
    i18n: createI18n(),
    linkPolicy: DEFAULT_LINK_POLICY,
    imagePolicy: DEFAULT_IMAGE_POLICY,
    resolveUrl: undefined,
    icons: new IconRegistry(),
    themeSource: undefined,
    mermaid: undefined,
    fonts: {},
  };
}

/** Sets app-level defaults. Call before creating elements; later calls apply to instances created afterwards. */
export function configure(c: Config): void {
  const s = getShared();
  if (c.themes) s.themes = c.themes;
  if (c.measure) s.measure = c.measure;
  if (c.i18n) s.i18n = createI18n(c.i18n.locale, c.i18n.messages);
  if (c.linkPolicy) s.linkPolicy = c.linkPolicy;
  if (c.imagePolicy) s.imagePolicy = c.imagePolicy;
  if (c.resolveUrl) s.resolveUrl = c.resolveUrl;
  if (c.iconPacks) s.icons.add(c.iconPacks);
  if (c.builtinIcons !== undefined) s.icons.setBuiltin(c.builtinIcons);
  if (c.themeSource) s.themeSource = c.themeSource;
  // the next fallback render uses it, also after an earlier render loaded another Mermaid (platform/mermaid.ts)
  if (c.mermaid) s.mermaid = c.mermaid;
  if (c.fonts) s.fonts = { ...s.fonts, ...c.fonts };
}

export function getShared(): Shared {
  return (shared ??= defaults());
}

/**
 * A fresh CoreContext for one component instance, from the shared defaults plus overrides. A component's own icon
 * packs extend the shared registry (its loads are shared; its packs win over shared ones of the same name).
 */
export function instanceContext(over: Partial<CoreContext> = {}, iconPacks?: readonly IconPack[]): CoreContext {
  const s = getShared();
  const icons = over.icons ?? (iconPacks?.length ? s.icons.extend(iconPacks) : s.icons);
  return createContextWith({
    themes: s.themes, measure: s.measure, linkPolicy: s.linkPolicy, imagePolicy: s.imagePolicy, locale: s.i18n.locale,
    ...(s.resolveUrl ? { resolveUrl: s.resolveUrl } : {}), ...over, icons,
  });
}
