// App-level shared configuration (§8): configure() sets defaults every instance reads; each instance can override.
// This is the one deliberate shared object (§1 goal 2): read-only after creation of each instance's context.
import type { ThemeSource } from './adapters/themes.js';
import { createContextWith, type CoreContext } from './core/context-base.js';
import { IconRegistry } from './core/icons/registry.js';
import type { IconPack } from './core/icons/types.js';
import { ThemeRegistry } from './core/theme/registry.js';
import { BASELINE_THEME } from './core/theme/baseline.js';
import { BUILTIN_IDS } from './core/theme/builtin-ids.js';
import type { Diagnostic } from './core/types.js';
import { createStaticMeasurer, type TextMeasurer } from './core/text/measure.js';
import { DEFAULT_IMAGE_POLICY, DEFAULT_LINK_POLICY, type ImagePolicy, type LinkPolicy, type UrlResolver } from './core/validate.js';
import { createCanvasMeasurer } from './dom/measure.js';
import { createI18n, type I18n, type Messages } from './ui/i18n.js';

/** Minimal surface of stock Mermaid used by the fallback renderer and the plain-Mermaid compare view. */
export interface MermaidLike {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
  /** Mermaid 11.1+: the icon packs `fa:` tokens, icon nodes and architecture diagrams draw from (T04: mmdx forwards its packs). */
  registerIconPacks?(packs: { name: string; icons?: unknown; loader?: () => Promise<unknown> }[]): void;
}

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
  /** A Mermaid instance, or a loader; default: `import('mermaid')` when installed. */
  mermaid?: MermaidLike | (() => Promise<MermaidLike>);
  /** Font files for PNG export (§7.4): family name → URL or bytes. */
  fonts?: Record<string, string | ArrayBuffer>;
  /** Logs ops and exposes getState() (dev). */
  debug?: boolean;
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
  debug: boolean;
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
    debug: false,
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
  if (c.mermaid) {
    s.mermaid = c.mermaid;
    // the next fallback render uses it, also after an earlier render loaded another Mermaid
    mermaidInstance = null;
    mermaidIcons = '';
  }
  if (c.fonts) s.fonts = { ...s.fonts, ...c.fonts };
  if (c.debug !== undefined) s.debug = c.debug;
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

/**
 * Registers theme files into the shared registry every component reads (the theme menus list them), with no loading:
 * themes bundled by the host (`import github from '@mmdx/studio/themes/github-light.theme.json'`), for pages that cannot fetch
 * theme files (sandboxed iframes). A file with the id of a registered theme replaces it. Returns the validation
 * diagnostics (invalid values are dropped).
 */
export function registerThemes(themes: Iterable<unknown>): Diagnostic[] {
  const reg = getShared().themes;
  const out: Diagnostic[] = [];
  for (const t of themes) out.push(...reg.register(t));
  return out;
}

let extras: Promise<void> | null = null;

/**
 * Registers the built-in themes besides baseline into the shared registry (loaded on demand: a page of viewers that
 * only use baseline never downloads them). Components that list themes (editor, theme editor, studio) call it on
 * start; the viewer calls it when a diagram names one of them. Nothing loads when they are registered already
 * (`registerThemes(BUILTIN_THEMES)`).
 */
export function ensureBuiltinThemes(): Promise<void> {
  if (!extras && BUILTIN_IDS.every((id) => getShared().themes.has(id))) return Promise.resolve();
  return (extras ??= import('./core/theme/builtin-extra.js').then(({ EXTRA_THEMES }) => {
    const reg = getShared().themes;
    for (const t of EXTRA_THEMES) if (!reg.has(t.id)) reg.register(t);
  }));
}

/** Registers every built-in theme (`ensureBuiltinThemes`): resolves once they are in the shared registry. */
export const registerBuiltinThemes = (): Promise<void> => ensureBuiltinThemes();

let mermaidQueue: Promise<unknown> = Promise.resolve();
let mermaidInstance: Promise<MermaidLike> | null = null;

/** The icon packs Mermaid has (Mermaid keeps one global set): registered again when another set is due. */
let mermaidIcons = '';

/**
 * Renders with stock Mermaid through one serial queue shared by all instances (Mermaid keeps global config and
 * measures in document.body), in a detached light-DOM container, with securityLevel strict (§8.1). Mermaid receives
 * the component's icon packs first (`registerIconPacks`, the built-in set under `tabler` included), sharing the
 * registry's loads, so its `fa:` tokens and icon nodes draw from the same packs.
 */
export function renderWithMermaid(code: string, dark: boolean, icons: IconRegistry = getShared().icons): Promise<string> {
  const s = getShared();
  mermaidInstance ??= (async () => {
    const m = s.mermaid;
    if (typeof m === 'function') return m();
    if (m) return m;
    const mod = (await import(/* @vite-ignore */ 'mermaid')) as { default: MermaidLike };
    return mod.default;
  })();
  const job = mermaidQueue.then(async () => {
    const mermaid = await mermaidInstance!;
    if (mermaid.registerIconPacks && icons.key !== mermaidIcons) {
      const packs = icons.mermaidPacks();
      if (packs.length) mermaid.registerIconPacks(packs);
      mermaidIcons = icons.key;
    }
    // theme, look and layout given explicitly: Mermaid 12 changed their defaults (redux-color, neo, ELK), and the
    // fallback should look like mmdx's light or dark scheme whichever Mermaid the host installed (10 to 12)
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', look: 'classic', layout: 'dagre' });
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
    document.body.append(box);
    try {
      const { svg } = await mermaid.render(`mmdx-m${Math.random().toString(36).slice(2)}`, code, box);
      return svg;
    } finally {
      box.remove();
    }
  });
  mermaidQueue = job.catch(() => undefined);
  return job;
}
