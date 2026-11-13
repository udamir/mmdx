# mmdx/core

The DOM-free API: parse Mermaid code, split and join the `%%@` metadata, render a diagram to a standalone SVG string, manage themes, and compute, render and report diffs. It runs in Node 18 or newer, in workers and in browsers, and it is what the components use underneath. Every function is pure (no module state, no storage, no network); everything instance-scoped lives in a [`CoreContext`](#corecontext).

```ts
import { parse, splitSource, renderToSvg, diffDiagrams, diffReport } from 'mmdx/core';

const svg = await renderToSvg(source, { theme: 'default-dark' }); // a standalone SVG string, no DOM needed
const model = parse(splitSource(source).doc.code);                // the diagram model
const md = diffReport(diffDiagrams(before, after), { format: 'markdown' });
```

::: tip Bundle size
`mmdx/core` imports the parser and renderer of every diagram type (flowchart, sequence, ER, mindmap, state) statically. Browser code that only needs to show diagrams should use the components, which load each type on first use; [`mmdx/diff`](/api/#mmdx-studio-diff) has asynchronous versions of `diffDiagrams` and `renderDiffToSvg` that do the same.
:::

## Parsing

### `parse()`

```ts
function parse(code: string): DiagramModel
```

Parses Mermaid code (without `%%@` lines; see [`splitSource()`](#splitsource)) into a [diagram model](#diagram-models), with every supported diagram type. It never throws: problems are reported in `model.diagnostics`, and code of another type returns an `UnsupportedModel` (`type: null`) with a `type.unsupported` error and the first keyword of the code (`gantt`, `classDiagram`…) in `keyword`.

A source over 1 MB (`MAX_SOURCE_LENGTH`, in UTF-16 code units) is not parsed: the model has the right type, no items and a `doc.too-large` error. A diagram with more than 5 000 items (`MAX_ITEMS`) stops at the limit with a `doc.too-many-items` error.

```ts
const model = parse('flowchart LR\n  a[Start] --> b{Check}');
if (model.type === 'flowchart') console.log(model.nodes.size, model.edges.length); // 2 1
```

### `detectType()`

```ts
function detectType(code: string): DiagramType | null // 'flowchart' | 'sequence' | 'er' | 'mindmap' | 'state' | null
```

The diagram type from the header line, skipping blank lines, `%%` comments and leading front matter (`---` … `---`). `flowchart` and `graph` are flowcharts, `sequenceDiagram` is a sequence diagram, `erDiagram` an ER diagram, `mindmap` (any case) a mindmap, `stateDiagram` and `stateDiagram-v2` a state diagram; anything else (and a non-string) is `null`.

### `cleanLabel()`

```ts
function cleanLabel(s: string | null | undefined): string
```

A Mermaid label as written in the code → plain text. Removes the surrounding quotes (`"…"` or `'…'`) and the backticks of a markdown string, and decodes `<br>` (a line break), `#quot;`, `#<code>;` character codes and `&amp;` / `&lt;` / `&gt;` in one pass.

### `encodeLabel()`

```ts
function encodeLabel(s: string): string
```

The inverse of `cleanLabel` for writing a label back: the inside of a double-quoted label (`id["…"]`). Newlines become `<br>`, `"` becomes `#quot;`, and only text that would otherwise be decoded on the way back in is escaped, so ordinary labels stay readable. `cleanLabel('"' + encodeLabel(s) + '"') === s` for trimmed `s`.

## Documents and metadata

A `.mmdx` source is Mermaid code followed by `%%@` lines (see [The .mmdx format](/guide/mmdx-format)). These functions split a source into code and metadata, validate metadata and write it back. None of them throws.

### `DiagramDocument`

```ts
interface DiagramDocument {
  /** Mermaid only, no `%%@` lines. */
  readonly code: string;
  readonly meta: DiagramMeta;
}
```

### `splitSource()`

```ts
function splitSource(src: string): { doc: DiagramDocument; hadMeta: boolean; diagnostics: Diagnostic[] }
```

Splits a source into the Mermaid code and the parsed metadata. Every `%%@` line is validated: invalid values are dropped with a `meta.bad-value` warning; lines that cannot be used (invalid JSON, a bad id) and lines of unknown kinds are kept verbatim in `meta.unknown` and written back by [`joinSource()`](#joinsource), so a newer writer's data survives a round trip. The [`META_HEADER`](#meta-header) line is removed, trailing blank lines of the code are trimmed, and older metadata versions are migrated. `hadMeta` is true when the source had any metadata line or the header.

```ts
const { doc, diagnostics } = splitSource(source);
doc.code;               // the Mermaid code
doc.meta.nodes?.['a'];  // { x: 120, y: 80, preset: 'core' }
```

### `joinSource()`

```ts
function joinSource(doc: DiagramDocument): string
```

The inverse of `splitSource`: the code, a blank line, [`META_HEADER`](#meta-header) and the `%%@` lines from [`metaToLines()`](#metatolines), ending with a newline. A document without metadata is written as pure Mermaid.

### `metaToLines()`

```ts
function metaToLines(meta: DiagramMeta): string[]
```

Metadata as `%%@` lines, in a fixed order: `canvas` (carries the format version `v`), local style presets (`style.<kind> <name>`), then layers, groups, nodes, edges, participants, messages, notes, blocks, boxes, activations, entities and relationships, then the kept `unknown` lines. Ids with whitespace or `%` are URI-encoded. Returns `[]` when there is nothing to write, so a pure Mermaid file stays pure Mermaid.

### `checkMetaLine()`

```ts
function checkMetaLine(raw: string): MetaLineCheck | null

type MetaLineCheck =
  | { error: string; code: string }
  | { kind: string; id?: string; data: Record<string, unknown>; known: boolean; dropped: string[] };
```

Checks one metadata line, as the editor's metadata tab does while you type. Returns `null` for a blank line, a plain `%%` comment or the header; `{ error, code }` for a line that cannot be read (`meta.syntax`, `meta.bad-json`, `meta.bad-id`); otherwise the parsed line, with `known: false` for kinds this version does not know and `dropped` listing the key paths whose values failed validation.

### `pruneMeta()`

```ts
function pruneMeta(meta: DiagramMeta, ids: Partial<Record<Collection, ReadonlySet<string>>>): DiagramMeta
```

Drops the metadata of items that no longer exist. `ids` gives the ids that exist per collection (`nodes`, `edges`, `participants`…); collections without a set are left alone, and `unknown` lines stay.

### `normalizeMeta()`

```ts
function normalizeMeta(m: unknown): DiagramMeta
```

Any object → well-formed, validated `DiagramMeta` (`canvas` and `styles` are always present; invalid values are dropped).

### `mergeLegacySidecar()`

```ts
function mergeLegacySidecar(code: string, sidecarJson: string): { doc: DiagramDocument; diagnostics: Diagnostic[] }
```

Imports the legacy form: a `.mmd` file plus a `.mmd.layout.json` sidecar with the same metadata object (never written any more). The sidecar is validated like inline metadata, and its entries win over inline lines with the same id. Unknown top-level keys are ignored with a `meta.sidecar-unknown` diagnostic.

### `META_HEADER`

```ts
const META_HEADER = '%% ---- diagram-studio layout (safe to keep: Mermaid ignores %% comments) ----';
```

The comment line `joinSource` writes between the code and the `%%@` lines.

### Metadata types

The metadata of a document. `[extra: string]: unknown` index signatures mean unknown keys are kept on a round trip.

```ts
interface DiagramMeta {
  canvas: CanvasMeta;
  /** `style.<kind> <name>`: local presets per item kind (`_base` = diagram-wide base), and `style.palette`. */
  styles: Record<string, Record<string, StyleProps & Record<string, unknown>>>;
  layers?: Record<string, LayerMeta>;
  groups?: Record<string, ItemMeta>;
  nodes?: Record<string, ItemMeta>;
  edges?: Record<string, ItemMeta>;
  participants?: Record<string, ItemMeta>;
  messages?: Record<string, ItemMeta>;
  notes?: Record<string, ItemMeta>;
  blocks?: Record<string, ItemMeta>;
  boxes?: Record<string, ItemMeta>;
  activations?: Record<string, ItemMeta>;
  entities?: Record<string, ItemMeta>;
  rels?: Record<string, ItemMeta>;
  /** `%%@` lines this version does not understand, kept verbatim. */
  unknown?: string[];
}

interface PageSettings {
  background?: string;
  border?: string;
  grid?: string;
  pad?: number;
  routing?: Routing;           // 'curved' | 'orthogonal' | 'straight'
  ratio?: string;
  // sequence layout
  gap?: number;
  rowH?: number;
  mirror?: boolean;
  blockSpan?: 'full' | 'touched';
  margin?: number;
  blockTags?: boolean;         // sequence: false hides the blocks' kind tags
  mindLayout?: 'both' | 'right' | 'down'; // mindmaps: both sides of the root (default), to the right, top down
  composites?: 'single' | 'palette';      // state diagrams: composites in the theme's one style (default), or a colour each
}

interface CanvasMeta extends PageSettings {
  v?: number;                  // format version
  preset?: string;             // page preset name (`<type>.pagePresets`)
  layout?: 'legacy' | 'compound'; // flowcharts with subgraphs: `legacy` keeps the earlier auto layout (one minor release)
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  [extra: string]: unknown;
}

interface ItemMeta extends StyleProps {
  preset?: string;
  layer?: string;
  locked?: boolean;
  link?: string;
  x?: number;
  y?: number;
  // edges / relationships
  fromSide?: Side;             // 't' | 'b' | 'l' | 'r'
  toSide?: Side;
  fromAt?: number;
  toAt?: number;
  labelDx?: number;
  labelDy?: number;
  points?: [number, number][]; // bend points
  // sequence (space above); mindmap nodes (a nudge, with dx)
  dy?: number;
  // mindmap nodes
  dx?: number;
  side?: 'l' | 'r';            // a first-level branch's side of the root
  section?: number;            // 0–11: a branch colour of the theme for the node and its subtree
  collapsed?: boolean;         // folded, with a +N badge
  img?: string;                // a picture above the label (URL; '' = not chosen yet); also a state's, above its title
  imgW?: number;               // its box (one of them alone keeps the picture's aspect)
  imgH?: number;
  imgFit?: string;             // 'contain' | 'cover' | 'stretch'
  iconPos?: 'l' | 't' | 'b';   // where the label's icon is drawn: inline before the text, above, below
  iconSize?: number;
  iconColor?: string;
  // an image or icon state (the flowchart image node's keys; `w` / `h`: the picture's or the icon's size)
  icon?: string;               // the icon shown instead of a picture (`pack:name`)
  form?: 'square' | 'circle' | 'rounded'; // the icon's frame
  pos?: 't' | 'b';             // the caption above or below (default)
  constraint?: 'on' | 'off';   // the picture keeps its aspect ratio
  // entities: per-attribute highlights (color, bold, italic, underline, fontFamily, fontSize, preset)
  attrs?: Record<string, AttrHighlight>;
  [extra: string]: unknown;
}

interface LayerMeta {
  name?: string;
  hidden?: boolean;
  [extra: string]: unknown;
}
```

`StyleProps` (fill, stroke, text, font, shape, arrows, routing…) is listed on the [theme file](/api/theme-file#style-properties) page, with `ArrowType`, `Routing` and `Side`.

## Rendering

### `renderToSvg()`

```ts
function renderToSvg(src: string, opts?: {
  theme?: string;
  ctx?: CoreContext;
  layers?: 'visible' | 'all';
  ssr?: boolean;
  iconPacks?: readonly IconPack[];
}): Promise<string>
```

Build-time and server-side rendering: a source → a standalone `<svg xmlns=…>` document. It uses the static text measurer unless the context brings another one, so the output is the same on every machine. The icons the source references are loaded before it renders (see [Icons](/guide/icons#on-the-server)).

| Option | Default | Meaning |
|---|---|---|
| `theme` | Default Light | Theme id to draw with. Diagrams do not carry a theme. An id the registry does not have falls back to Default Light |
| `ctx` | `createContext()` | The context: theme registry (Default Light and Default Dark), measurer, link policy, id prefix |
| `layers` | `'visible'` | `'all'` draws items on hidden layers too |
| `iconPacks` | — | Icon packs over the context's registry for this render (the context's registry is not changed) |
| `ssr` | `false` | Marks the SVG with `data-mmdx-ssr="1"` and `data-mmdx-measure` (`static`, `canvas` or `custom`). An `<mmdx-viewer>` that has such an SVG as a direct child shows it (and takes its aspect ratio) until its own first render |

```ts
import { readFileSync } from 'node:fs';
import { renderToSvg, createContext } from 'mmdx/core';
import github from 'mmdx/themes/github-light.theme.json' with { type: 'json' };

const ctx = createContext();
ctx.themes.register(github); // themes other than Default Light / Dark are registered first
const svg = await renderToSvg(readFileSync('docs/arch.mmdx', 'utf8'), { theme: 'github-light', ctx, ssr: true });
```

Diagrams of unsupported types render as an empty page; use [`renderSource()`](#rendersource) to see the diagnostics.

### `renderSource()`

```ts
function renderSource(src: string, ctx: CoreContext, opts?: PipelineOptions): Rendered
```

The full pipeline from source text: split → parse → pick the theme → render. Never throws on bad input. Returns a [`Rendered`](#rendered) with the document, the model, the scene and every diagnostic; pass it to [`standaloneSvg()`](#standalonesvg) for the SVG string.

```ts
const ctx = createContext();
const r = renderSource(source, ctx, { theme: 'default-dark', hideLabels: true });
if (r.tooLarge) throw new Error('diagram too large');
for (const d of r.diagnostics) console.warn(diagnosticText(d));
const svg = standaloneSvg(r);
```

### `renderDocument()`

```ts
function renderDocument(doc: DiagramDocument, model: DiagramModel, ctx: CoreContext, opts?: PipelineOptions):
  Omit<Rendered, 'doc' | 'model' | 'tooLarge'>
```

Renders an already split and parsed document (for example a model you changed). The returned `diagnostics` hold only the theme diagnostics.

### `standaloneSvg()`

```ts
function standaloneSvg(r: Rendered, ctx?: CoreContext, attrs?: { ssr?: boolean }): string
```

The standalone SVG document of a rendered diagram (export, SSR), sized to the page bounds. `ssr` adds the `data-mmdx-ssr` and `data-mmdx-measure` attributes. The `ctx` argument is unused and kept for compatibility.

### `PipelineOptions`

| Field | Type | Meaning |
|---|---|---|
| `theme` | `string` | Theme to draw with (default: Default Light) |
| `visibleLayers` | `readonly string[]` | Only these layer ids are shown (overrides the stored hidden flags) |
| `hideLabels` | `boolean` | Connector labels off |
| `allLayers` | `boolean` | Ignore layers entirely (render every item) |
| `tableView` | `readonly string[]` | ER entity ids drawn as tables with an empty last row (the editor's attribute editing) |

### `Rendered`

```ts
interface Rendered {
  doc: DiagramDocument;
  model: DiagramModel;
  theme: ResolvedTheme;
  themeId: string;          // the theme actually used
  rctx: RenderContext;      // measurer, id prefix, link policy, colour resolver
  result: RenderResult;
  diagnostics: Diagnostic[]; // parser, metadata and theme diagnostics together
  tooLarge: boolean;        // the source exceeded the limits: nothing was rendered
}
```

### `RenderResult`

```ts
interface RenderResult {
  defs: SceneNode[];        // markers and patterns, ids prefixed with ctx.idPrefix
  body: SceneNode[];        // the diagram in z-order; each item is a `g` with `item` and `key` = ItemKey
  bounds: Rect;             // page bounds, after page size / ratio / minimum size
  contentBounds: Rect;      // content bounds before the page rules
  page: { background: string; grid: string | undefined; border: string | null };
  pageSettings: CanvasMeta; // effective page settings (theme < page preset < diagram)
  geom: GeometryIndex;      // geometry per item (boxes, ports, edge paths) for hit testing and overlays
  presetsUsed: Partial<Record<ItemKind, Map<string, number>>>; // preset name → item count, `(none)` for no preset
  diagnostics?: Diagnostic[]; // what the render reported (image.blocked, icon.unknown, image.size-unknown…)
  a11y?: { title?: string; desc?: string }; // the diagram's accTitle / accDescr: the standalone SVG's <title> and <desc>
  missing?: { shapes?: true; media?: true }; // what was drawn without because its chunk was not loaded (shape geometry, the media kit)
}
```

`GeometryIndex` is `FlowGeometry | SequenceGeometry | ErGeometry | MindmapGeometry | StateGeometry | { type: null }`: maps from item id to boxes (centre and size), edge geometry (ports, bend points, path data), for sequence diagrams message, activation and lifeline positions, for mindmaps each node's side, depth and section and the branch paths, for state diagrams the boxes of states, composites and notes and the transitions' geometry, and for ER diagrams the tables, the relationships and the subgraph frames (`groups`). It is advanced; see `src/core/render/types.ts`.

### `createContext()`

```ts
function createContext(opts?: Partial<CoreContext>): CoreContext
```

A fresh context. Omitted fields get defaults: `themes` a registry with the built-in themes (`createDefaultRegistry()`), `measure` the static measurer, `idPrefix` a new unique prefix, `linkPolicy` `DEFAULT_LINK_POLICY`, `imagePolicy` `DEFAULT_IMAGE_POLICY`, `icons` an icon registry with the built-in set (its decoder loads on the first lookup: `renderToSvg` waits for it; pass `createIconRegistry(packs)` for lookups that are ready at once).

### `CoreContext`

```ts
interface CoreContext {
  themes: ThemeRegistry;
  measure: TextMeasurer;
  /** Unique per instance, so SVG <defs> ids (markers, patterns) never collide between diagrams on one page. */
  idPrefix: string;
  linkPolicy: LinkPolicy;
  /** Which image URLs diagram content may use. */
  imagePolicy: ImagePolicy;
  /** The host's resolver of image and link URLs, applied before the policies check them; see UrlResolver. */
  resolveUrl?: UrlResolver;
  /** Icon packs: `pack:name` tokens, icon nodes and mindmap icons are looked up here. */
  icons: IconRegistry;
  /** Natural sizes of content images, where the host can load them (the components set the browser's); see below. */
  imageSizes?: { get(url: string): { w: number; h: number } | null | undefined };
  locale?: string;
}
```

Everything instance-scoped that the core needs; there are no module singletons. Each context also keeps a bounded cache of automatic layouts. The components build theirs from [`configure()`](/api/configuration#configure).

`imageSizes` lets a flowchart image node without `w` and `h` be drawn at its picture's size: `get` returns the size, `undefined` while it is being loaded (render again when it arrives), or `null` when it cannot be known. Without it (Node, the render worker) such images are 96 × 96 with an `image.size-unknown` note. See [Flowchart content](/guide/flowchart#image-nodes).

### `ALL_KINDS`

```ts
const ALL_KINDS: Kinds // { flowchart, sequence, er, mindmap, state }: the view kind of every diagram type
```

The view kind (parser, renderer and the rest of what drawing a diagram needs) of every diagram type, by type, for the [`…With` functions](#all-kinds-and-with-variants).

### `createStaticMeasurer()`

```ts
function createStaticMeasurer(): TextMeasurer

interface TextMeasurer {
  width(text: string, font: FontSpec): number;
  readonly kind: 'static' | 'canvas' | 'custom';
}

interface FontSpec {
  size: number;
  weight?: number | string;
  family: string;
  style?: 'normal' | 'italic';
}
```

Layout depends on text widths, so every environment measures through a `TextMeasurer`. The static one estimates advance widths from a table close to Open Sans Regular (monospace families use 0.6 em per character; bold adds about 6 %), deterministic across machines, with a bounded cache. It counts graphemes (`Intl.Segmenter`): an emoji is 1.15 em however many code points it is made of (a ZWJ family, a skin tone, a flag, a keycap), and joiners and variation selectors add nothing. In browsers the components use a canvas measurer. Pass your own (`kind: 'custom'`) in `createContext({ measure })` or [`configure({ measure })`](/api/configuration#configure) for exact metrics.

### `serializeNode()`

```ts
function serializeNode(n: SceneNode): string
function serializeNodes(ns: readonly SceneNode[]): string
```

Scene nodes → SVG markup. Renderers produce a typed scene tree (`SceneNode`: groups, shapes, text, links, marker and pattern definitions), never markup strings; this serializer is the one place where escaping happens. Attribute names come from a fixed allowlist, so no diagram text ever becomes an attribute name, and link `href`s must be [`SafeUrl`](#safeurl)s.

### `fmt()`

```ts
function fmt(v: number): string
```

Deterministic number formatting used in the SVG: one decimal, no `-0`, no exponent; non-finite numbers become `'0'`.

## Themes

Theme files and their keys are described on the [theme file](/api/theme-file) page; see also [Themes](/guide/themes).

### `ThemeRegistry`

```ts
class ThemeRegistry {
  constructor(files?: Iterable<unknown>);
  register(file: unknown): Diagnostic[];
  unregister(id: string): boolean;
  has(id: string | null | undefined): boolean;
  raw(id: string | null | undefined): ThemeFile | null;
  list(): ThemeInfo[];
  merged(id: string | null | undefined): ThemeFile | null;
  get(id: string | null | undefined): ResolvedTheme;
  mergeDraft(file: ThemeFile): ThemeFile;
  resolveDraft(file: ThemeFile): ResolvedTheme;
  onChange(cb: () => void): () => void;
}
```

Holds theme files for one context: no module state, no storage, no network. Loading themes belongs to a `ThemeSource`, browser edits to a `ThemeStore` (see [adapters](/api/adapters)); they hand files to `register`.

| Member | Meaning |
|---|---|
| `register(file)` | Validates (and migrates) a theme file and adds it, replacing one with the same id. Returns the validation diagnostics; a file that cannot be a theme (not an object, no `id`) is not added |
| `unregister(id)` | Removes a theme; true when it was registered |
| `has(id)` | Whether the id is registered. Earlier ids of the built-in themes (`studio`, `baseline`, `studio-dark`) map to the current ones; `null` means the base theme |
| `raw(id)` | The theme as registered (validated), a copy, or null |
| `list()` | `ThemeInfo` of every registered theme, the base theme first: `{ id, name, appearance, extends, version? }`; `appearance` is inherited through `extends` |
| `merged(id)` | The theme merged with what it extends, before colour references are resolved. Unknown ids fall back to the base theme. A chain that loops or runs deeper than 5 levels is cut and rooted on the base theme |
| `get(id)` | The `ResolvedTheme`, ready for rendering: inherited, every colour reference resolved, every section present. Unknown ids → the base theme. Cached until the registry changes |
| `mergeDraft(file)`, `resolveDraft(file)` | The same for a theme being edited and not registered (the theme editor's previews) |
| `onChange(cb)` | Called after every `register` / `unregister`; returns the unsubscribe function |

### `BASELINE`

```ts
const BASELINE = 'default-light';
```

The id of the base theme (Default Light). Every other theme extends it, directly or through other themes, and it is the fallback for unknown ids.

### `BUILTIN_THEMES`

```ts
const BUILTIN_THEMES: readonly ThemeFile[]
```

The house pair bundled with the core: Default Light (`default-light`) and Default Dark (`default-dark`), linked to each other. The other built-in themes are files in `mmdx/themes/*`. `registerThemes(BUILTIN_THEMES)` puts both into the components' shared registry, so they load nothing for them (see [`registerThemes()`](/api/configuration#registerthemes)).

### `createDefaultRegistry()`

```ts
function createDefaultRegistry(): ThemeRegistry
```

A new registry with `BUILTIN_THEMES` registered; what `createContext()` uses.

### `validateTheme()`

```ts
function validateTheme(input: unknown): { theme: ThemeFile | null; diagnostics: Diagnostic[] }
```

Validates and cleans a theme file. `theme` is null when the input cannot be a theme at all (not an object: `theme.not-object`; no usable `id`: `theme.missing-id`); otherwise it is a deep copy without the values that failed (each reported as a `theme.bad-value` warning), migrated to the current schema version. Every style value goes through the same validators as `%%@` metadata, fonts must be family names and palette entries colour literals; unknown keys are kept.

### `migrateTheme()`

```ts
function migrateTheme(file: ThemeFile): ThemeFile
```

Upgrades a theme file of an older `schemaVersion` to the current one. The current schema version is 1 and a file without the field is version 1, so this returns the file unchanged for now. `validateTheme` calls it.

### `resolveColor()`

```ts
function resolveColor(v: string, palette?: Palette | null, basePalette?: Palette | null): string
function resolveColor(v: unknown, palette?: Palette | null, basePalette?: Palette | null): unknown
// type Palette = Readonly<Record<string, string>>
```

Resolves a colour value against a theme palette: `@name` is the palette colour, `@name~h,s,l` the palette colour shifted in hue, saturation and lightness (`@name~=h,s,l` sets the hue instead, for greys). `basePalette` (default: `palette`) is the fallback for names the palette lacks. Values that are not references pass through; an unknown name resolves to the bare name (`@red` → `red`). See [colours](/api/theme-file#colours).

```ts
resolveColor('@sky', { sky: '#cfe8ff' });          // '#cfe8ff'
resolveColor('@sky~+0,+0,-10', { sky: '#cfe8ff' }); // the same hue, 10 points darker
resolveColor('#d4e63a', { sky: '#cfe8ff' });       // '#d4e63a'
```

### `relativeColor()`

```ts
function relativeColor(hex: string, palette?: Palette | null): string
```

Encodes a colour picked while `palette` is active so that it follows other themes: the nearest palette colour plus the shift from it (`@sand~=349.3,+53.5,-5.7`), or `@name` for an exact match. Exact in the theme it was picked in; other themes shift their own version of that colour. Returns the input for a non-hex value or an empty palette.

### `createColorResolver()`

```ts
function createColorResolver(
  theme: Pick<ResolvedTheme, 'palette' | 'basePalette'>,
  diagramPalette?: Readonly<Record<string, string>>,
): (v: unknown) => string | undefined
```

The colour resolver of one rendering: `@name` / `@name~…` against the theme palette, then the diagram's own palette (`%%@ style.palette <name> {"color":…}`), then the base palette. Literals pass through; anything that does not end up as a valid colour literal returns `undefined`.

## Links

### `safeUrl()`

```ts
function safeUrl(raw: unknown, policy?: LinkPolicy): SafeUrl | null
```

Returns the URL if its protocol is allowed by the policy or it is relative (a path, query or fragment), else null. Protocol-relative URLs (`//host`), URLs over 2 048 characters, and URLs with control characters, whitespace or backslashes (which browsers strip before the scheme, as in `java\tscript:`) are rejected outright. Renderers pass every diagram link (`click A href "…"`, `link` metadata) through it.

```ts
safeUrl('https://example.com/a');  // 'https://example.com/a'
safeUrl('javascript:alert(1)');    // null
safeUrl('/docs/arch');             // '/docs/arch'
```

### `LinkPolicy`

```ts
interface LinkPolicy {
  /** Allowed protocols, lower case with the colon. Relative URLs always pass. */
  protocols: readonly string[];
  /** `target` for opened links; the host decides. */
  target?: '_blank' | '_self' | '_top' | '_parent';
}
```

Set it per context (`createContext({ linkPolicy })`) or for every component with [`configure({ linkPolicy })`](/api/configuration#configure).

### `DEFAULT_LINK_POLICY`

```ts
const DEFAULT_LINK_POLICY: LinkPolicy = { protocols: ['https:', 'http:', 'mailto:'], target: '_blank' };
```

### `SafeUrl`

```ts
type SafeUrl = string & { readonly [SAFE_URL]: true };
```

A branded string: a URL that passed `safeUrl()`, the only kind the scene accepts for a link's `href`.

## Images

### `UrlResolver`

```ts
type ContentUrlKind = 'image' | 'link';
type UrlResolver = (url: string, kind: ContentUrlKind) => string | null | undefined;
function resolveContentUrl(raw: unknown, kind: ContentUrlKind, resolve: UrlResolver | undefined): unknown;
```

The host's resolver of the URLs diagram content points at (`CoreContext.resolveUrl`, [`configure({ resolveUrl })`](/api/configuration#resolveurl)): called with each image and link URL as written (trimmed) and its kind, it returns the URL to use, or null / undefined to keep the written one. Renderers apply it before the image policy (`checkImageUrl`) and the link policy (`safeUrl`) check the URL, so the policies see the result; the code keeps what was written. `resolveContentUrl` applies a resolver the way renderers do: the written value when there is none, it declines, it throws, or the value is not a non-empty string. See [Security](/guide/security#resolving-urls).

### `checkImageUrl()` / `safeImageUrl()`

```ts
function checkImageUrl(raw: unknown, policy?: ImagePolicy, resolve?: UrlResolver): { url: SafeImageUrl } | { reason: ImageBlockReason }
function safeImageUrl(raw: unknown, policy?: ImagePolicy, resolve?: UrlResolver): SafeImageUrl | null

type ImageBlockReason = 'invalid' | 'protocol' | 'data-off' | 'data-type' | 'data-size' | 'host' | 'relative';
```

Checks an image URL from a diagram against the image policy (default `DEFAULT_IMAGE_POLICY`): no control characters, whitespace or backslashes, at most 2 048 characters; the protocol in `protocols`; the host in `hosts` when the policy has them (no user info); a `data:` URL only as base64 of one of `dataTypes`, at most `maxDataBytes` decoded; a relative URL only with `relative: true`, never protocol-relative. With `resolve`, the URL the resolver returns for `raw` is the one checked (see [`UrlResolver`](#urlresolver)). `checkImageUrl` gives the reason of a refusal, which renderers report as the `reason` of an `image.blocked` warning; the image is then drawn as a placeholder.

```ts
safeImageUrl('https://example.com/logo.png');   // 'https://example.com/logo.png'
checkImageUrl('data:image/png;base64,iVBOR…');  // { reason: 'data-off' }
checkImageUrl('http://example.com/logo.png');   // { reason: 'protocol' }
```

### `ImagePolicy`

```ts
interface ImagePolicy {
  /** Allowed protocols; `[]` turns content images off. */
  protocols: readonly ('https:' | 'http:' | 'data:')[];
  /** With `data:` enabled: the accepted MIME types (base64 only). */
  dataTypes: readonly ImageDataType[];   // 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml' | 'image/avif'
  /** With `data:` enabled: the largest decoded image in bytes. */
  maxDataBytes: number;
  /** Host names remote images may come from; `*.example.com` matches its subdomains. Default: any host. */
  hosts?: readonly string[];
  /** Relative URLs, resolved against the page that shows the diagram. Default off. */
  relative?: boolean;
}
```

Set it per context (`createContext({ imagePolicy })`) or for every component with [`configure({ imagePolicy })`](/api/configuration#configure). See [Security](/guide/security#image-policy).

### `DEFAULT_IMAGE_POLICY`

```ts
const DEFAULT_IMAGE_POLICY: ImagePolicy = {
  protocols: ['https:'],
  dataTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'],
  maxDataBytes: 256 * 1024,
};
```

### `SafeImageUrl`

```ts
type SafeImageUrl = string & { readonly [SAFE_IMAGE_URL]: true };
```

A branded string: the only kind the scene accepts for an `<image>`'s `href` — a URL that passed `checkImageUrl()`, or an icon image mmdx built itself.

## Icons

See the [Icons](/guide/icons) guide for packs, names and the built-in set.

### `createIconRegistry()`

```ts
function createIconRegistry(packs?: readonly IconPack[], opts?: { builtin?: boolean; now?: () => number }): IconRegistry
```

An icon registry of these packs plus the built-in Tabler subset under `tabler` (`builtin: false` leaves it out), with the code that decodes icons loaded at once, so lookups of packs given with `icons` are ready synchronously. Pass it as a context's `icons` (`createContext({ icons })`).

### `IconRegistry`

| Member | Meaning |
|---|---|
| `add(packs)` | Registers packs; a pack of a registered name replaces it |
| `setBuiltin(on)` | Turns the built-in subset on or off |
| `extend(packs)` | A registry with these packs over this one's, sharing its loads and change events |
| `has(pack)` | Whether a pack of this name is registered (loaded or not): label tokens with its prefix are icons |
| `packNames()` / `packList()` | The registered packs; `packList()` with `loaded`, `failed`, `builtin` and the pack's `info` |
| `resolve(written, form?)` | The canonical `pack:name` of a reference, or null: `form` `'token'` (labels, the default), `'node'` (`@{ icon }`) or `'class'` (mindmap `::icon()`) |
| `get(name)` | `{ status: 'ready', icon, fallback? }`, `{ status: 'loading' }` or `{ status: 'missing', reason }` (`pack`, `icon`, `invalid`, `failed`); starts the loads it needs |
| `preload(names)` | Loads what these icons need; resolves when each is ready or missing |
| `load(pack)` | Loads one pack |
| `packData(pack)` | A loaded pack's Iconify JSON, else null |
| `onChange(cb)` | Called with the pack names when a load finishes or packs change; returns a remover |

### `iconNamesOf()`

```ts
function iconNamesOf(input: string | object | Iterable<string>, registry: { has(pack: string): boolean }): string[]
```

The icons a source text, a parsed model or a list of labels references, as canonical names (`fa:fa-car` → `fa:car`): what to `preload` before rendering.

### `IconPack`

```ts
interface IconPack {
  name: string;
  icons?: IconifyJSON;
  loader?: () => Promise<IconifyJSON>;
}
```

As Mermaid's `registerIconPacks` takes it. `IconifyJSON` is the subset of Iconify's format mmdx reads: `prefix`, `icons` (`body`, `width`, `height`, `left`, `top`, `rotate`, `hFlip`, `vFlip`, `hidden`), `aliases`, the default `width` / `height` / `left` / `top`, `info`, `categories`, and mmdx's `keywords` (search words per icon).

## Layers

Layers are user-defined and stored as metadata: `%%@ layer L1 {"name":"Infrastructure","hidden":true}` defines one (file order is list order), and an item joins it with `"layer":"L1"`. An item without a layer is on the Default layer. Hiding a layer hides its items and everything attached to them (connectors, messages, group contents).

### `layerDefs()`

```ts
function layerDefs(meta: DiagramMeta): LayerDef[]
// interface LayerDef extends LayerMeta { id: string; name: string; hidden: boolean }
```

The layers of a diagram: Default first (named `Default` unless `%%@ layer default` renames it), then the diagram's layers in file order, each with its name (the id when it has none) and hidden flag.

### `hiddenByLayers()`

```ts
function hiddenByLayers(model: DiagramModel, meta: DiagramMeta, visible?: readonly string[]): HiddenSets
// type HiddenSets = Partial<Record<ItemKind, ReadonlySet<string>>>
```

The items hidden directly by their layer, per item kind. `visible` (the viewer's `layers` property, `PipelineOptions.visibleLayers`) overrides the stored hidden flags: only the listed layer ids are shown. A hidden sequence box also hides its participants; renderers cascade the rest (connectors of hidden nodes and so on).

### `DEFAULT_LAYER`

```ts
const DEFAULT_LAYER = 'default';
```

## Starters and outline

### `starterSource()`

```ts
function starterSource(type: StarterType): string
// type StarterType = DiagramType
```

The source a new, empty diagram of the type starts from, as in the studio's New menu: `'flowchart TB\n'`, `'sequenceDiagram\n'`, `'erDiagram\n'`, `'mindmap\n  root((Topic))\n'` or `'stateDiagram-v2\n'`. Throws for a type no registered kind has a starter for.

### `outline()`

```ts
function outline(model: DiagramModel): OutlineItem[]
// interface OutlineItem { text: string; children?: OutlineItem[] }
```

A text alternative of the diagram, for screen readers and copying: flowchart nodes with their outgoing connections (`→ Target: label`), sequence messages, notes and blocks in order (numbered with `autonumber`), ER tables with their columns and relationships, a mindmap's tree of labels, a state diagram's states with their outgoing transitions (composites with their contents) and notes. Unsupported models give `[]`.

### `summarize()`

```ts
function summarize(model: DiagramModel): Summary

interface Summary {
  key: 'label.flowchart' | 'label.sequence' | 'label.er' | 'label.mindmap' | 'label.state' | 'label.empty' | 'label.unsupported';
  params: Record<string, number>;
}
```

The parts of a diagram's generated accessible name ("Flowchart: 12 nodes, 14 connections"): an i18n message key and its counts (`nodes` and `edges`, `participants` and `messages`, `entities` and `rels`, a mindmap's `nodes`, or a state diagram's `states` (states and composites, without start and end) and `transitions`). The components translate it with their [messages](/api/configuration#i18n).

## Diff

A semantic diff of two sources compares items, not lines. Items are matched by identity: node, group, entity and participant ids; edges and relationships by their endpoints; sequence messages, notes and blocks by aligning their content, since their ids are positions. A node renamed with the same label and shape is reported as one changed item, and its edges follow it. Every change of a kept item belongs to one facet: **content** (items, labels, shapes, connections, ER attributes, message text), **layout** (position, size, bend points, ports, label offsets, layers) or **style** (colours, fonts, presets, Mermaid classes and `style` / `classDef` / `linkStyle`).

### All kinds and `…With` variants

The diff and diff-rendering functions come in two forms:

- **All kinds**: `diffDiagrams`, `renderDiff` and `renderDiffToSvg` parse and render with every diagram type. They live in `src/core/diff/all.ts`, which imports every parser and renderer statically, and only `mmdx/core` exports them. Use them in Node, CI jobs and workers.
- **`…With`**: `diffDiagramsWith`, `renderDiffWith` and `renderDiffToSvgWith` take the diagram kinds as their first argument (view kinds by type, as in [`ALL_KINDS`](#all-kinds)). A version whose type is not in the set diffs as unsupported. The components use them with the kinds they loaded on demand, so `<mmdx-diff>` and History ship no diagram type statically. From `mmdx/core` you would normally pass `ALL_KINDS`.

In the browser, [`mmdx/diff`](/api/#mmdx-studio-diff) exports asynchronous `diffDiagrams(before, after): Promise<DiagramDiff>` and `renderDiffToSvg(before, after, options): Promise<string>`: they load the parser and renderer of both versions' types first, then behave like the functions here.

### `diffDiagrams()`

```ts
function diffDiagrams(before: string, after: string): DiagramDiff
function diffDiagramsWith(kinds: Kinds, before: string, after: string, parse?: (code: string) => DiagramModel): DiagramDiff
```

The diff of two sources (Mermaid with or without `%%@` lines). Never throws on bad input. When the two versions are different diagram types, `typeChanged` is true and the change is reported as a diagram-wide `diagram type` field. `diffDiagramsWith` parses with `kinds` (or with `parse` when given); when the type's diff is not loaded, the versions are not compared: the diff has a `diagram type` field and a `kind.not-loaded` error in `diagnostics`, not an empty change list.

```ts
const diff = diffDiagrams(before, after);
diff.counts;                                   // { added: 1, removed: 0, changed: 3, content: 2, layout: 1, style: 0 }
diff.items.filter((c) => c.status !== 'unchanged');
```

### `DiagramDiff`

```ts
interface DiagramDiff {
  type: DiagramType | null;
  /** The two versions are different diagram types (items are not compared; `doc` has a `diagram type` field). */
  typeChanged: boolean;
  items: ItemChange[];
  /** Diagram-wide changes: page settings, local presets, palette, layers, `classDef`, direction, title, autonumber. */
  doc: FieldChange[];
  counts: Record<'added' | 'removed' | 'changed', number> & Record<ChangeFacet, number>;
  /** Why the diff is incomplete: `kind.not-loaded` when the type's diff is not loaded. */
  diagnostics?: Diagnostic[];
}

interface ItemChange {
  kind: ItemKind;
  /** Id in the after version (the before id for removed items). */
  id: string;
  /** Id in the before version, when it differs (renamed node, shifted sequence message). */
  beforeId?: string;
  /** Short human-readable name of the item. */
  label: string;
  status: ChangeStatus;   // 'added' | 'removed' | 'changed' | 'unchanged'
  /** Facets with at least one change (empty for added / removed / unchanged). */
  facets: ChangeFacet[];  // 'content' | 'layout' | 'style'
  fields: FieldChange[];
}

interface FieldChange {
  facet: ChangeFacet;
  /** Human-readable field name (`label`, `position`, `fill`, `attribute email`…). */
  field: string;
  before?: unknown;
  after?: unknown;
}
```

`items` holds every item of the after version (unchanged ones included) and the removed ones. `counts` counts added, removed and changed items, and per facet the items and diagram-wide fields with a change of that facet.

### `diffModels()`

```ts
function diffModels(a: DiagramModel, b: DiagramModel, ma: DiagramMeta, mb: DiagramMeta): DiagramDiff
```

The diff of two already parsed documents (models plus metadata).

### `ignoreFacets()`

```ts
function ignoreFacets(diff: DiagramDiff, ignore: DiffIgnore): DiagramDiff
// interface DiffIgnore { content?: boolean; layout?: boolean; style?: boolean }
```

The same diff with some facets ignored: their field changes are dropped, an item whose every change was ignored becomes unchanged, and the counts are recomputed. Facets describe how a kept item changed, so added and removed items always stay.

```ts
const meaningful = ignoreFacets(diffDiagrams(before, after), { layout: true, style: true });
```

### `withoutStyle()`

```ts
function withoutStyle(source: string): string
```

The source without styling: no Mermaid classes or style statements, no presets, colours or fonts in the metadata. Positions, sizes, layers, links and the page's routing stay, so the layout does not move. Used to draw both versions unstyled when style changes are ignored.

### `withLayoutOf()`

```ts
function withLayoutOf(before: string, after: string): string
```

`before` drawn with the layout of `after` for every item both have (same id), so a comparison shows no movement, only what was added, removed or restyled. Items only in `before` keep their place. Not used for sequence diagrams, whose metadata is keyed by position.

### `mergeDiagrams()`

```ts
function mergeDiagrams(diff: DiagramDiff, a: SupportedModel, b: SupportedModel, ma: DiagramMeta, mb: DiagramMeta): Merged | null

interface Merged {
  model: SupportedModel;
  meta: DiagramMeta;
  /** `kind:id` in the merged diagram → how the item changed. Unchanged items are absent. */
  status: Map<string, ItemChange>;
}
```

The merged diagram behind the Merged view: the after version plus every removed item kept where it was, with changed text carrying word-level change marks. The renderer lays it out like any diagram, so removed items get real room. Returns null when the diagram type changed.

### `changeKey()`

```ts
function changeKey(c: Pick<ItemChange, 'kind' | 'id' | 'status'>): string
```

The key of a change everywhere in the UI and in [`Merged.status`](#mergediagrams): `kind:id` in the merged diagram, with a `~del` suffix for removed items except participants (removed messages still refer to them). `<mmdx-diff>`'s `select(key)` and `mmdx-select` event use it.

### `diffReport()`

```ts
function diffReport(diff: DiagramDiff, o: ReportOptions): string
```

A change report of a diff, for merge request descriptions and bot comments.

- `format: 'markdown'`: a `### Diagram changes` heading (with the name), the two versions, the counts, then Diagram-wide, Added, Removed and Changed sections, each changed item with its fields (`label (content): Old → New`). Diagram text is escaped, so it cannot inject Markdown.
- `format: 'json'`: `{ version: 1, type, typeChanged, counts, before?, after?, doc, items }` (pretty-printed; `items` without the unchanged ones). `version` is the report schema version.

```ts
const md = diffReport(diffDiagrams(before, after), {
  format: 'markdown',
  name: 'docs/arch.mmdx',
  before: { id: baseSha },
  after: { id: headSha, message: 'Add cache', author: 'Ann' },
  links: (c) => `https://review.example.com/arch?change=${encodeURIComponent(changeKey(c))}`,
});
```

### `ReportOptions`

| Field | Type | Meaning |
|---|---|---|
| `format` | `'json' \| 'markdown'` | Required. The report format |
| `before`, `after` | `VersionInfo` | The two versions: `{ id, message?, author?, date?, url? }`. In Markdown the id is a code span, linked when `url` is set |
| `links` | `(c: ItemChange) => string \| null` | A link of one change (e.g. into a hosted diff view); Markdown only |
| `name` | `string` | Diagram name in the Markdown title |

```ts
interface VersionInfo {
  /** Commit SHA, revision id or content hash. */
  id: string;
  message?: string;
  author?: string;
  /** ISO date. */
  date?: string;
  url?: string;
}
```

### `unifiedDiff()`

```ts
function unifiedDiff(before: string, after: string, o?: UnifiedDiffOptions): string
```

A standard unified diff (`---` / `+++` / `@@`, with `\ No newline at end of file` where needed) of two sources; it applies with `git apply` when no facet is ignored. Returns `''` when nothing changed.

| Option | Default | Meaning |
|---|---|---|
| `name` | `'diagram.mmdx'` | File name in the `--- a/…` / `+++ b/…` headers |
| `context` | `3` | Lines of context around each change |
| `part` | `'all'` | The whole file, the Mermaid `'code'` only, or the `%%@` `'meta'` only |
| `ignore` | — | `DiffIgnore`: style lines removed (`style`), the old layout replaced (`layout`) before diffing |

### `diffWords()`

```ts
function diffWords(a: string, b: string): TextOp[]
// interface TextOp { op: 'same' | 'add' | 'del'; value: string }
```

A word-level diff of two texts. Words are whitespace-separated (punctuation stays with its word); line breaks are words of their own.

### `diffLines()`

```ts
function diffLines(a: readonly string[], b: readonly string[]): LineOp[]
// interface LineOp { op: 'same' | 'add' | 'del'; text: string; a?: number; b?: number }
```

A line diff with 1-based line numbers in the before (`a`, for same and del) and after (`b`, for same and add) text.

### `mergeText()`

```ts
function mergeText(before: string, after: string): string
```

`before` → `after` as one string with the removed and added words marked by invisible marker characters (Unicode noncharacters, read only by the diff). The merged diagram carries labels marked this way; the renderer turns them into struck-out and bold runs. Returns `after` unchanged when the texts are equal.

### `annotate()`

```ts
function annotate(input: AnnotateInput, o?: AnnotateOptions): Annotated
```

Advanced: the scene layers of one view of a diff: the body with change classes and dimming, the word runs, and an overlay with highlights, badges and move arrows. [`diffSvg()`](#diffsvg) and `<mmdx-diff>` build on it.

| Input / option | Meaning |
|---|---|
| `input.view` | `'before' \| 'merged' \| 'after'` |
| `input.result` | The `RenderResult` of this view |
| `input.before` | The before `RenderResult` (move arrows of the merged view start there) |
| `input.changes` | The changes shown (filters applied), in list order |
| `input.measure` | The `TextMeasurer` |
| `o.dim` | Fade unchanged items |
| `o.highlights` | Draw highlights and badges |
| `o.colors` | `DiffColors` (default `DIFF_COLORS.light`) |
| `o.badgeScale` | Badge size factor |

Returns `{ body, runs, overlay }`, each `SceneNode[]`. It throws an error with `code` `kind.not-loaded` when the diagram type's diff is not loaded, instead of annotating nothing.

### `FACETS`

```ts
const FACETS: readonly ChangeFacet[] = ['content', 'layout', 'style'];
```

### `DIFF_COLORS`

```ts
const DIFF_COLORS: Record<'light' | 'dark', DiffColors>
// interface DiffColors { marks: Record<Mark, { c: string; bg: string }>; dim: number }
// type Mark = 'added' | 'removed' | 'content' | 'layout' | 'style'
```

The values of the `--mmdx-diff-*` tokens (the components' stylesheet is made from them), for exports and server-side rendering: a line / text colour `c` and a tinted fill `bg` per mark, and the opacity of dimmed items.

| Mark | Light `c` / `bg` | Dark `c` / `bg` |
|---|---|---|
| `added` | `#1a7f37` / `#dafbe1` | `#3fb950` / `rgba(46,160,67,.22)` |
| `removed` | `#cf222e` / `#ffebe9` | `#f85149` / `rgba(248,81,73,.22)` |
| `content` | `#b35900` / `#fff1e0` | `#e3a33b` / `rgba(227,163,59,.2)` |
| `layout` | `#0969da` / `#ddf4ff` | `#58a6ff` / `rgba(56,139,253,.2)` |
| `style` | `#8250df` / `#fbefff` | `#bc8cff` / `rgba(163,113,247,.2)` |
| `dim` | `0.28` | `0.35` |

## Diff rendering

### `renderDiffToSvg()`

```ts
function renderDiffToSvg(before: string, after: string,
  o?: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext }): Promise<string>
function renderDiffToSvgWith(kinds: Kinds, before: string, after: string,
  o?: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext }): Promise<string>
```

Server-side and build-time rendering of a diff (CI bots, merge request comments): two sources → one standalone SVG of a view, with a legend. It uses the static text measurer unless the context brings another one, and works in Node and workers. Of the `DiffRenderOptions`, it uses `theme`, `ignore` and `hide`.

```ts
import { writeFileSync } from 'node:fs';
import { renderDiffToSvg } from 'mmdx/core';

const svg = await renderDiffToSvg(before, after, { view: 'side', ignore: { layout: true }, titles: { before: 'main', after: 'feature-x' } });
writeFileSync('diff.svg', svg);
```

### `renderDiff()`

```ts
function renderDiff(before: string, after: string, ctx: CoreContext, o?: DiffRenderOptions): DiffRendered
function renderDiffWith(kinds: Kinds, before: string, after: string, ctx: CoreContext, o?: DiffRenderOptions): DiffRendered
```

Renders a diff: both versions, the merged picture and the filtered change list, in one shared coordinate space. Both versions are drawn with one theme (the `theme` option, else Default Light) for a fair comparison. Pass the result to [`diffSvg()`](#diffsvg).

```ts
interface DiffRendered {
  raw: DiagramDiff;          // the diff of the two sources as they are
  diff: DiagramDiff;         // the diff with the filters applied
  changes: ItemChange[];     // changed, added and removed items, top to bottom and left to right
  before: Rendered;
  after: Rendered;
  merged: (Rendered & { status: Merged['status'] }) | null; // null when the diagram type changed
  sources: { before: string; after: string };              // the sources as drawn (style removed, old layout replaced)
  layoutAligned: boolean;    // Layout off moved the old version onto the new layout
  bounds: Rect;              // union of the pages of every view
  themeId: string;           // the theme both versions were drawn with
}
```

### `diffSvg()`

```ts
function diffSvg(d: DiffRendered, o?: DiffSvgOptions): string
```

One view of a rendered diff as a standalone SVG document (`data-mmdx-diff` names the view). It carries a small trusted `<style>` block for the word marks.

### `DiffRenderOptions`

`PipelineOptions` (`theme`, `visibleLayers`, `hideLabels`, `allLayers`, `tableView`) plus:

| Field | Type | Meaning |
|---|---|---|
| `ignore` | `DiffIgnore` | Facets to ignore: their field changes are dropped. Layout off draws the old version on the new layout, Style off draws both unstyled |
| `hide` | `DiffHide` | `{ added?: boolean; removed?: boolean }`: added / removed items left out of the change list, the counts and the highlights |

### `DiffSvgOptions`

| Field | Default | Meaning |
|---|---|---|
| `view` | `'merged'` | `'before'`, `'merged'`, `'after'` or `'side'` (both pages next to each other). Merged falls back to after when the diagram type changed |
| `dim` | `true` | Fade unchanged items |
| `highlights` | `true` | Highlights, badges, move arrows and word marks |
| `legend` | `true` | A legend of the highlight colours with the counts under the picture |
| `scheme` | `'light'` | Highlight colours: the light or dark `DIFF_COLORS` |
| `titles` | `{ before: 'Before', after: 'After' }` | Titles over the two pages of the side-by-side view |
| `badgeScale` | `1` | Badge size factor |
| `ssr` | `false` | Adds `data-mmdx-ssr="1"` |

### `DiffHide`

```ts
interface DiffHide {
  added?: boolean;
  removed?: boolean;
}
```

## Model types

### `Diagnostic`

```ts
interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  /** English text; `code` is the i18n key. */
  message: string;
  /** Stable machine code, e.g. `flow.unknown-arrow`. */
  code: string;
  range?: SourceRange;          // { line, col?, endLine?, endCol? }, 0-based
  /** Set when the diagnostic belongs to the `%%@` metadata rather than the Mermaid code. */
  source?: 'code' | 'meta';
  params?: Readonly<Record<string, string | number>>;
  fix?: { title: string; apply(code: string): string };
}
```

Parsers, metadata and theme validation report problems as diagnostics; nothing in the core throws on bad input. `diagnosticText(d)` formats one as `Line N: message`. Components report them in `mmdx-error` events (see [Events](/api/events)).

### `Rect`

```ts
interface Point { x: number; y: number }
/** A box given by its top-left corner and size (page bounds, viewBox). */
interface Rect { x: number; y: number; w: number; h: number }
/** A box given by its centre (x, y) and size (nodes and groups). */
interface CenterBox { x: number; y: number; w: number; h: number }
```

### Item references

```ts
type BuiltinType = 'flowchart' | 'sequence' | 'er' | 'mindmap' | 'state';
type DiagramType = BuiltinType | (string & {});                           // open: a kind plugin may register more
type ItemKind =
  | 'node' | 'group' | 'edge'                                               // flowchart (mindmaps: node; state diagrams: states, composites, transitions)
  | 'participant' | 'message' | 'note' | 'block' | 'box' | 'activation'     // sequence (note: also state diagrams)
  | 'entity' | 'rel';                                                       // ER (subgraphs are 'group')
interface ItemRef { kind: ItemKind; id: string }
type ItemKey = `${ItemKind}:${string}`;                                     // 'node:a', 'edge:a->b'
```

`DiagramType` is open as a type (any string still type-checks, while editors complete the built-in names); a value is checked against the registered kinds where it comes in, so an unknown type reads as unsupported. `BuiltinType` is the five types mmdx draws itself. `ITEM_KINDS` lists every kind; `itemKey(ref)` and `parseItemKey(key)` convert between the two forms (`parseItemKey` returns null for an unknown kind).

### Diagram models

```ts
type DiagramModel = FlowchartModel | SequenceModel | ErModel | MindmapModel | StateModel | UnsupportedModel;
type SupportedModel = FlowchartModel | SequenceModel | ErModel | MindmapModel | StateModel;
const isSupported: (m: DiagramModel) => m is SupportedModel;
```

Every model has `type` and `diagnostics`. Line fields are 0-based source lines. The main shapes:

```ts
interface FlowchartModel {
  type: 'flowchart';
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodes: Map<string, FlowNode>;     // { id, label, shape, classes, style, parent, order, lines, defLine, link? }
  groups: Map<string, FlowGroup>;   // subgraphs: { id, label, parent, children, order, line, endLine?, dir?, … }
  edges: FlowEdge[];                // { id: 'a->b' or 'a->b#2', from, to, label, line, start, end, minlen, index, src }
  classDefs: Record<string, MermaidStyle>;
  linkStyles: Record<string, MermaidStyle>; // keyed by link index, or 'default'
  undefinedClasses: { cls: string; line: number }[];
  idClashes: string[];
  diagnostics: Diagnostic[];
}

interface SequenceModel {
  type: 'sequence';
  participants: Participant[];      // { id, label, kind: 'participant' | 'actor', box, shape?, created?, createdBy?, destroyedBy?, links?: { label, url }[], properties?, … }
  items: SeqItem[];                 // messages, notes, block starts / else / ends, activate / deactivate, in order
  boxes: SeqBox[];
  autonumber: boolean;              // numbered somewhere (an `autonumber` that is not `off`)
  numbering: SeqNumbering[];        // every `autonumber` statement: { line, on, start?, step? }
  title: string;
  accTitle?: string;
  accDescr?: string;
  diagnostics: Diagnostic[];
}

interface ErModel {
  type: 'er';
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  entities: Map<string, Entity>;    // { id, label, alias?, attrs: { type, name, keys: ('PK'|'FK'|'UK')[], comment }[], classes, style, parent, stmts, … }
  rels: ErRel[];                    // { id, from, to, fromCard, toCard, identifying, label, src, offsets of the statement and its tokens }
  groups: Map<string, ErGroup>;     // subgraphs: { id, label, parent, children, order, line, endLine?, dir?, classes, style, … }
  classDefs: Record<string, MermaidStyle>;
  undefinedClasses: { cls: string; line: number }[];
  headerLine: number;               // the `erDiagram` line (-1 when missing)
  title?: string;                   // frontmatter title (or a `title` statement)
  accTitle?: string;
  accDescr?: string;
  diagnostics: Diagnostic[];
}

interface MindmapModel {
  type: 'mindmap';
  root: string | null;
  nodes: Map<string, MindNode>;     // in code order: { id, written, label, md, shape, parent, children, depth, section, icon, classes, line, endLine, … }
  colorBy: 'branch' | 'depth';      // config.mindmap.colorBy
  maxNodeWidth: number;             // config.mindmap.maxNodeWidth (200)
  diagnostics: Diagnostic[];
}

interface StateModel {
  type: 'state';
  header: 'stateDiagram' | 'stateDiagram-v2'; // as written
  direction: 'TB' | 'BT' | 'LR' | 'RL';      // the top-level direction (TB without one)
  nodes: Map<string, StateNode>;    // states and pseudo-states: { id, kind, label, descriptions, texts, parent, region, classes, style, lines, defLine, order, link?, tooltip? }
  groups: Map<string, StateGroup>;  // composites: { id, label, parent, region, children, regions, dir?, blocks, line, endLine?, classes, style, link?, … }
  edges: StateEdge[];               // transitions: { id: 'a->b' or 'a->b#2', from, to, label, scope, region, src, … }
  notes: StateNote[];               // { id: 'n1', target, side: 'left' | 'right', text, line, endLine, multi, scope, region }
  classDefs: Record<string, MermaidStyle>;
  undefinedClasses: { cls: string; line: number }[];
  title?: string;                   // frontmatter title
  accTitle?: string;
  accDescr?: string;
  diagnostics: Diagnostic[];
}

interface UnsupportedModel {
  type: null;
  keyword?: string;                 // 'gantt', 'classDiagram'…
  diagnostics: Diagnostic[];
}
```

`NodeShape` is a shape id of the [shape catalogue](/guide/shapes#the-catalogue): `rect`, `rounded`, `stadium`, `subroutine`, `cylinder`, `circle`, `doublecircle`, `diamond`, `hexagon`, `parallelogram`, `parallelogram-alt`, `trapezoid`, `trapezoid-alt`, `asymmetric`, `hcyl`, `document`, `card`, Mermaid's short names for its other flowchart shapes (`lin-rect`, `notch-pent`, `bow-rect`, …), and `choice`, `note`, the figures (`actor`, `boundary`, `control`, `entity`, `collections`, `mm-default`) and the media frames `icon` and `image`. `MermaidStyle` is a validated Mermaid `style` / `classDef` / `linkStyle`: `{ fill?, stroke?, text?, strokeWidth?, dash?, fontSize?, interpolate? }` (`interpolate`: a `linkStyle`'s curve name). Sequence messages, notes and blocks get ids in source order (`m1`, `n1`, `b1`); a message keeps its `arrow` as written (one of Mermaid's 26 tokens), with `line`, `head` and `both`, and `half`, `stick`, `reverse` for half arrows and `central` (`'from' | 'to' | 'both'`) for central connections. An ER relationship's `from` or `to` may be a subgraph's id; an entity's `parent` is the subgraph it is drawn in (Mermaid's rule: the first subgraph to close that names it). A mindmap node's id is its written id when that is unique, else `mm<k>` (its place among all nodes in code order); `MindShape` is `mm-default` (no delimiters), `rect`, `rounded`, `circle`, `bang`, `cloud` or `hexagon`. A state's `kind` (`StateKind`) is `state`, `start`, `end`, `choice`, `fork` or `join`; the start and end pseudo-states are `[*]start` / `[*]end` at the top level, `X/[*]start` inside composite X and `X/2/[*]start` in its second concurrency region; `region` is 0-based. The full definitions are in `src/core/model.ts`.
