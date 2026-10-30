// Build-time integration (§11.4): remark/rehype and markdown-it plugins. For each ```mermaid block of a supported
// type they emit <mmdx-viewer> with the pre-rendered SVG (works with no JS: readable, printable) and the source for
// hydration; unsupported types get the source only and the viewer falls back to stock Mermaid.
// No dependency on unified or markdown-it: the plugins are typed structurally.
import { createContext, type CoreContext } from '../core/context.js';
import { detectType } from '../core/parse/index.js';
import { renderSource, standaloneSvg } from '../core/pipeline.js';
import { escAttr } from '../core/scene/serialize.js';
import type { ThemeFile } from '../core/theme/types.js';

export interface MmdxMarkdownOptions {
  /** Force a theme for every diagram (default: each diagram's own, then baseline). */
  theme?: string;
  /** `theme-dark` attribute for the viewers. */
  themeDark?: string;
  /** Pre-render supported diagrams to SVG (default true). */
  prerender?: boolean;
  /** Extra themes (e.g. the portal's) to register before rendering. */
  themes?: readonly ThemeFile[];
  /** Viewer attributes added to every element (`controls`, `fit`…). */
  attrs?: Record<string, string>;
  ctx?: CoreContext;
}

/** Text safe inside <script type="text/mermaid">: only `</script` needs breaking; the viewer reverses it. */
export const scriptSafe = (s: string): string => s.replace(/<\/(script)/gi, '<\\/$1');

/** The HTML for one diagram: `<mmdx-viewer …><svg data-ds-ssr …/><script type="text/mermaid">…</script></mmdx-viewer>`. */
export function diagramHtml(source: string, opts: MmdxMarkdownOptions = {}, ctx: CoreContext = opts.ctx ?? createContext()): string {
  const attrs: Record<string, string> = { ...(opts.attrs ?? {}) };
  if (opts.theme) attrs['theme'] = opts.theme;
  if (opts.themeDark) attrs['theme-dark'] = opts.themeDark;
  let svg = '';
  if (opts.prerender !== false && detectType(source)) {
    const p: { theme?: string } = {};
    if (opts.theme) p.theme = opts.theme;
    const r = renderSource(source, ctx, p);
    if (r.model.type && !r.tooLarge) {
      svg = standaloneSvg(r, ctx, { ssr: true });
      const b = r.result.bounds;
      attrs['style'] = `aspect-ratio:${Math.round(b.w)} / ${Math.round(b.h)}`;
    }
  }
  const a = Object.entries(attrs).map(([k, v]) => ` ${k.replace(/[^\w-]/g, '')}="${escAttr(v)}"`).join('');
  return `<mmdx-viewer${a}>${svg}<script type="text/mermaid">${scriptSafe(source)}</script></mmdx-viewer>`;
}

function setup(opts: MmdxMarkdownOptions): CoreContext {
  const ctx = opts.ctx ?? createContext();
  for (const t of opts.themes ?? []) ctx.themes.register(t);
  return ctx;
}

// ---- rehype (hast) ----------------------------------------------------------------------------------------------

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const textOf = (n: HastNode): string => (n.type === 'text' ? n.value ?? '' : (n.children ?? []).map(textOf).join(''));

const isMermaidCode = (n: HastNode): boolean => {
  const cls = n.properties?.['className'];
  const list = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? cls.split(/\s+/) : [];
  return n.tagName === 'code' && list.some((c) => c === 'language-mermaid' || c === 'lang-mermaid');
};

/** rehype plugin: `rehypePlugins: [[rehypeMmdx, { theme: 'github-light' }]]`. Replaces `pre > code.language-mermaid`. */
export function rehypeMmdx(opts: MmdxMarkdownOptions = {}): (tree: HastNode) => void {
  const ctx = setup(opts);
  return (tree) => {
    const visit = (node: HastNode): void => {
      const kids = node.children;
      if (!kids) return;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i]!;
        const code = k.tagName === 'pre' ? k.children?.find(isMermaidCode) : undefined;
        if (code) kids[i] = { type: 'raw', value: diagramHtml(textOf(code).replace(/\n$/, ''), opts, ctx) };
        else visit(k);
      }
    };
    visit(tree);
  };
}

// ---- markdown-it ------------------------------------------------------------------------------------------------

interface MdToken {
  info: string;
  content: string;
}
interface MarkdownIt {
  renderer: { rules: Record<string, ((tokens: MdToken[], idx: number, ...rest: unknown[]) => string) | undefined> };
}

/** markdown-it plugin: `md.use(markdownItMmdx, { theme: 'github-light' })`. */
export function markdownItMmdx(md: MarkdownIt, opts: MmdxMarkdownOptions = {}): void {
  const ctx = setup(opts);
  const prev = md.renderer.rules['fence'];
  md.renderer.rules['fence'] = (tokens, idx, ...rest) => {
    const t = tokens[idx]!;
    if (t.info.trim().split(/\s+/)[0] === 'mermaid') return diagramHtml(t.content.replace(/\n$/, ''), opts, ctx);
    return prev ? prev(tokens, idx, ...rest) : `<pre><code>${escAttr(t.content)}</code></pre>`;
  };
}
