// App-level shared configuration (§8): configure() sets defaults every instance reads; each instance can override.
// This is the one deliberate shared object (§1 goal 2): read-only after creation of each instance's context.
import type { ThemeSource } from './adapters/themes.js';
import { createContextWith, type CoreContext } from './core/context-base.js';
import { ThemeRegistry } from './core/theme/registry.js';
import { BASELINE_THEME } from './core/theme/baseline.js';
import { createStaticMeasurer, type TextMeasurer } from './core/text/measure.js';
import { DEFAULT_LINK_POLICY, type LinkPolicy } from './core/validate.js';
import { createCanvasMeasurer } from './dom/measure.js';
import { createI18n, type I18n, type Messages } from './ui/i18n.js';

/** Minimal surface of stock Mermaid used by the fallback renderer and the plain-Mermaid compare view. */
export interface MermaidLike {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
}

export interface Config {
  themes?: ThemeRegistry;
  themeSource?: ThemeSource;
  measure?: TextMeasurer;
  i18n?: { locale: string; messages?: Messages };
  linkPolicy?: LinkPolicy;
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
  if (c.themeSource) s.themeSource = c.themeSource;
  if (c.mermaid) s.mermaid = c.mermaid;
  if (c.fonts) s.fonts = { ...s.fonts, ...c.fonts };
  if (c.debug !== undefined) s.debug = c.debug;
}

export function getShared(): Shared {
  return (shared ??= defaults());
}

/** A fresh CoreContext for one component instance, from the shared defaults plus overrides. */
export function instanceContext(over: Partial<CoreContext> = {}): CoreContext {
  const s = getShared();
  return createContextWith({ themes: s.themes, measure: s.measure, linkPolicy: s.linkPolicy, locale: s.i18n.locale, ...over });
}

let extras: Promise<void> | null = null;

/**
 * Registers the built-in themes besides baseline into the shared registry (loaded on demand: a page of viewers that
 * only use baseline never downloads them). Components that list themes (editor, theme editor, studio) call it on
 * start; the viewer calls it when a diagram names one of them.
 */
export function ensureBuiltinThemes(): Promise<void> {
  return (extras ??= import('./core/theme/builtin-extra.js').then(({ EXTRA_THEMES }) => {
    const reg = getShared().themes;
    for (const t of EXTRA_THEMES) if (!reg.has(t.id)) reg.register(t);
  }));
}

let mermaidQueue: Promise<unknown> = Promise.resolve();
let mermaidInstance: Promise<MermaidLike> | null = null;

/**
 * Renders with stock Mermaid through one serial queue shared by all instances (Mermaid keeps global config and
 * measures in document.body), in a detached light-DOM container, with securityLevel strict (§8.1).
 */
export function renderWithMermaid(code: string, dark: boolean): Promise<string> {
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
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
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
