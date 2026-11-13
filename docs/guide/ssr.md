# Server-side rendering

`mmdx/core` renders diagrams to SVG without a DOM — in Node, in workers, at build time. Pages can ship the rendered SVG, readable and printable without JavaScript, and let `<mmdx-viewer>` take over once it loads.

## renderToSvg

`renderToSvg(source, options)` is the one-call API: a source in, a standalone SVG document (`<svg xmlns=…>`) out.

```ts
import { renderToSvg } from 'mmdx/core';

const svg = await renderToSvg(source, { theme: 'default-dark' }); // a standalone SVG string, no DOM needed
```

| Option | Default | Meaning |
|---|---|---|
| `theme` | `default-light` | The theme to draw with; it must be registered in the context (see [Themes](#themes)) |
| `layers` | `'visible'` | `'visible'`: hidden layers stay hidden; `'all'`: every item is drawn |
| `ssr` | `false` | Mark the SVG for hydration by `<mmdx-viewer>` (`data-mmdx-ssr`, and `data-mmdx-measure` with how text was measured) |
| `ctx` | `createContext()` | The context: theme registry, text measurer, link policy, icon registry, id prefix |
| `iconPacks` | — | Icon packs for this render, over the context's registry (see [Icons](/guide/icons#on-the-server)) |

The icons the source references (label tokens, icon nodes, mindmap icons) are loaded before it renders: the built-in set, Font Awesome look-alikes and the packs of `iconPacks` and `ctx.icons`. `renderSource` with your own context draws what is loaded; `ctx.icons.preload(iconNamesOf(source, ctx.icons))` loads the rest first.

It never throws on bad input: a source it cannot parse renders what it can, and a source over the [limits](/guide/security#limits) renders nothing.

```ts
import { writeFile } from 'node:fs/promises';
import { renderToSvg } from 'mmdx/core';

const source = `flowchart LR
  a[Start] --> b{Check} --> c[Done]
`;
await writeFile('diagram.svg', await renderToSvg(source));
```

## renderSource and standaloneSvg

When you need more than the string — diagnostics, the diagram type, its size — run the pipeline in two steps:

```ts
import { createContext, renderSource, standaloneSvg } from 'mmdx/core';

const ctx = createContext();
const r = renderSource(source, ctx, { theme: 'default-light' });

if (r.tooLarge) throw new Error('diagram over the limits');
for (const d of r.diagnostics) console.warn(`${d.severity} ${d.code}: ${d.message}`);
console.log(r.model.type, r.result.bounds); // 'flowchart', { x, y, w, h }

const svg = standaloneSvg(r, ctx, { ssr: true });
```

`renderSource(source, ctx, options)` returns a `Rendered`: the split document (`doc.code`, `doc.meta`), the parsed `model`, the resolved `theme` and `themeId`, the render `result` (with its `bounds`), every `diagnostics` (parser, metadata and theme) and `tooLarge`. Its options:

| Option | Meaning |
|---|---|
| `theme` | The theme id (default Default Light) |
| `visibleLayers` | Only these layers are shown (overrides the stored hidden flags) |
| `allLayers` | Ignore layers entirely: render every item |
| `hideLabels` | Connector labels off |

`standaloneSvg(rendered, ctx?, { ssr? })` serializes the result. `renderDocument(doc, model, ctx, options)` renders a document you split and parsed yourself (`splitSource`, `parse`).

## createContext

A `CoreContext` holds everything instance-scoped the core needs; there are no module singletons.

```ts
import { createContext, createStaticMeasurer, DEFAULT_LINK_POLICY } from 'mmdx/core';

const ctx = createContext({
  measure: createStaticMeasurer(),                       // the default
  linkPolicy: { ...DEFAULT_LINK_POLICY, target: '_self' },
});
```

| Field | Default | Meaning |
|---|---|---|
| `themes` | a registry with Default Light and Default Dark | The `ThemeRegistry` themes are looked up in |
| `measure` | `createStaticMeasurer()` | How text is measured for layout (an emoji counts as one 1.15 em glyph, however many code points it has) |
| `linkPolicy` | `DEFAULT_LINK_POLICY` | Allowed link protocols and the link target |
| `imagePolicy` | `DEFAULT_IMAGE_POLICY` | Which image URLs diagrams may show (`https:` only by default). The SVG keeps the URLs as they are and the server fetches nothing; a refused image is a placeholder with an `image.blocked` warning. See [Security](/guide/security#image-policy) |
| `idPrefix` | a unique prefix | Prefix of SVG `<defs>` ids, so ids never collide between diagrams on one page |
| `locale` | — | The locale |

Reuse one context for many diagrams: it caches layouts and text widths.

## Themes

The default context knows Default Light and Default Dark. Register any other theme file in its registry before rendering with it:

```ts
import { createContext, renderToSvg } from 'mmdx/core';
import githubDark from 'mmdx/themes/github-dark.theme.json' with { type: 'json' };

const ctx = createContext();
const diagnostics = ctx.themes.register(githubDark); // validated; invalid values are dropped
const svg = await renderToSvg(source, { theme: 'github-dark', ctx });
```

A theme the registry does not have is reported as an info diagnostic (`theme.missing`) and Default Light is used. The theme files are plain JSON in `node_modules/mmdx/themes/`; read them with `fs` where JSON imports are not available.

## Measuring text in Node

Layout depends on text widths. In a browser the components measure with a canvas; where there is no canvas, `createStaticMeasurer()` estimates widths from a table of advance widths for a humanist sans (close to Open Sans), so output is deterministic across machines. Bold adds about 6 %, monospace families count 0.6 em per character, and zero-width characters count as nothing.

Text in fonts much wider or narrower than that can come out a little tight or loose. Bring your own measurer for exact widths — any object with `width(text, font)` and a `kind`:

```ts
import { createContext, type TextMeasurer } from 'mmdx/core';

const measure: TextMeasurer = {
  kind: 'custom',
  width: (text, font) => myFontLib.measure(text, font.family, font.size, font.weight), // px
};
const ctx = createContext({ measure });
```

The SVG records how it was measured (`data-mmdx-measure="static"` with `ssr: true`); a viewer that hydrates it re-renders with real metrics in the browser.

## Hydration by `<mmdx-viewer>`

A viewer with an SVG marked with `data-mmdx-ssr` as a direct child shows that SVG while it loads, reserving its aspect ratio from the SVG's `viewBox`, and replaces it with its own rendering on the first client render. The source must be there too — an inline script, `src` or the `source` property:

```html
<mmdx-viewer controls="zoom fullscreen" style="aspect-ratio: 640 / 220">
  <svg data-mmdx-ssr="1" data-mmdx-measure="static" viewBox="0 0 640 220" …>…</svg>
  <script type="text/mermaid">
flowchart LR
  a[Start] --> b{Check} --> c[Done]
  </script>
</mmdx-viewer>
```

Without JavaScript the page shows the SVG; once `mmdx/viewer` loads, the diagram becomes interactive. `diagramHtml(source, options)` from `mmdx/markdown` writes exactly this markup — the pre-rendered SVG, an `aspect-ratio` style and the source — for any template engine:

```ts
import { diagramHtml } from 'mmdx/markdown';

const html = diagramHtml(source, { attrs: { controls: 'zoom fullscreen' }, themeDark: 'auto' });
```

Diagram types mmdx does not draw get the source only, and the viewer falls back to stock Mermaid in the browser. The Markdown plugins use `diagramHtml` for every ` ```mermaid ` block; see [Markdown and docs sites](/guide/markdown).

## Importing element entries in Node

Importing any entry in Node does not throw: the element classes fall back to a plain base class where `HTMLElement` does not exist, and the tags are defined only where `customElements` exists. Server-side rendering frameworks (Next.js, Nuxt, SvelteKit, Astro…) can import `mmdx/viewer` in shared code; the element upgrades in the browser. Only `mmdx/core` (and `mmdx/markdown`, built on it) renders anything on the server.

## Diffs on the server

`renderDiffToSvg(before, after, options)` renders a diff the same way, for CI bots and merge request comments; `ssr: true` marks it like a diagram. See [Reviewing changes in CI](/guide/ci).
