# Configuration

App-level settings that every component on the page reads: `configure()` sets the shared defaults (theme registry, theme source, text measurer, UI language, link and image policies, stock Mermaid, PNG fonts), `registerThemes()` and `registerBuiltinThemes()` fill the shared theme registry, `setWorkerUrl()` decides where the render worker comes from, and `upgradeMermaidBlocks()` turns Mermaid code blocks of a rendered page into viewers.

```ts
import { configure, registerThemes, registerBuiltinThemes, setWorkerUrl, upgradeMermaidBlocks, type Config } from '@mmdx/studio/viewer';
import { fetchThemeSource } from '@mmdx/studio/adapters';

configure({
  themeSource: fetchThemeSource('/themes/index.json'),   // themes a diagram names but the page has not loaded
  i18n: { locale: 'de', messages: { 'zoom.fit': 'Einpassen' } },
  linkPolicy: { protocols: ['https:', 'mailto:'], target: '_blank' },
  fonts: { Inter: '/fonts/inter.woff2' },                 // embedded into PNG exports
  mermaid: () => import('mermaid').then((m) => m.default),
});
```

## Where to import

| Export | Entries |
|---|---|
| `configure`, `registerThemes`, `registerBuiltinThemes`, type `Config` | `@mmdx/studio/viewer`, `@mmdx/studio/editor`, `@mmdx/studio/theme-editor`, `@mmdx/studio/diff`, `@mmdx/studio` (also `@mmdx/studio/studio`) |
| `setWorkerUrl`, `upgradeMermaidBlocks` | `@mmdx/studio/viewer` |
| `useInlineWorker`, `workerSource` | `@mmdx/studio/worker-inline` (see [Inline worker](/api/worker-inline)) |

Every entry re-exports the same functions over one shared configuration object, so `configure()` imported from the viewer entry also configures an editor on the same page, as long as both come from the same copy of the package. The types `Config` refers to come from other entries: `ThemeRegistry`, `TextMeasurer`, `LinkPolicy`, `ImagePolicy`, `createStaticMeasurer`, `DEFAULT_LINK_POLICY`, `DEFAULT_IMAGE_POLICY` and `BUILTIN_THEMES` from `@mmdx/studio/core` (see [Core](/api/core)), `ThemeSource` and `fetchThemeSource` from `@mmdx/studio/adapters` (see [Adapters](/api/adapters#fetchthemesource)).

## Shared configuration

### `configure()`

```ts
function configure(c: Config): void;
```

Sets app-level defaults. Only the fields you pass change; the others keep their current value, so several calls add up. `fonts` is merged with the fonts given before; every other field replaces the previous value (`i18n` replaces the whole catalog: a second call with other `messages` drops the first call's).

Call it before creating elements. Most values are copied into a component when it is created, so a later call applies to components created afterwards; a few are read each time they are used:

| Field | Read |
|---|---|
| `themes`, `measure`, `linkPolicy`, `imagePolicy` | When a component is created (they form its core context) |
| `i18n` | When a component is created |
| `themeSource` | Each time a component needs a theme that is not registered |
| `mermaid` | On the first render with stock Mermaid; later changes have no effect |
| `fonts` | On each PNG export |
| `debug` | Not read in this version |

A component can override the shared values for itself: the `ctx` option of the viewer, editor, theme editor and diff takes a `Partial<CoreContext>` (`themes`, `measure`, `linkPolicy`, `imagePolicy`, `locale`, `idPrefix`), and the `themeSource` property of `<mmdx-viewer>` and `<mmdx-diff>` takes precedence over the shared `themeSource`. `ctx` is read only when the component is created.

### `Config`

```ts
interface Config {
  themes?: ThemeRegistry;
  themeSource?: ThemeSource;
  measure?: TextMeasurer;
  i18n?: { locale: string; messages?: Messages };
  linkPolicy?: LinkPolicy;
  /** Which image URLs diagrams may show: `https:` only by default; `http:` and `data:` can be enabled. */
  imagePolicy?: ImagePolicy;
  /** A Mermaid instance, or a loader; default: `import('mermaid')` when installed. */
  mermaid?: MermaidLike | (() => Promise<MermaidLike>);
  /** Font files for PNG export: family name → URL or bytes. */
  fonts?: Record<string, string | ArrayBuffer>;
  /** Logs ops and exposes getState() (dev). */
  debug?: boolean;
}
```

| Field | Type | Default |
|---|---|---|
| `themes` | [`ThemeRegistry`](/api/core#themeregistry) | A registry with Default Light (`default-light`) only; Default Dark is added on demand |
| `themeSource` | `ThemeSource` ([adapters](/api/adapters#fetchthemesource)) | None: themes that are not registered stay unknown |
| `measure` | [`TextMeasurer`](/api/core#createstaticmeasurer) | A canvas measurer, or the static measurer where no 2D canvas works (jsdom) |
| `i18n` | `{ locale: string; messages?: Messages }` | `locale: 'en'`, the bundled English strings |
| `linkPolicy` | [`LinkPolicy`](/api/core#linkpolicy) | `{ protocols: ['https:', 'http:', 'mailto:'], target: '_blank' }` |
| `imagePolicy` | [`ImagePolicy`](/api/core#imagepolicy) | `DEFAULT_IMAGE_POLICY`: `https:` from any host; no `data:`, `http:` or relative URLs |
| `mermaid` | `MermaidLike \| (() => Promise<MermaidLike>)` | `import('mermaid')` (the optional peer dependency) |
| `fonts` | `Record<string, string \| ArrayBuffer>` | `{}` |
| `debug` | `boolean` | `false` |

#### `themes`

The shared [`ThemeRegistry`](/api/core#themeregistry) that components created afterwards render with and whose themes their menus list. The default registry holds only Default Light; `registerThemes()` and the on-demand loading of Default Dark register into whichever registry is shared at that moment. When you pass your own registry, pass it before any component starts and include the built-in themes ([`createDefaultRegistry()`](/api/core#createdefaultregistry) from `@mmdx/studio/core` holds both): Default Dark is registered on demand only once per page.

#### `themeSource`

Where themes come from that a diagram or the host names but the page has not registered (`ThemeSource`: `list()`, `get(id)`, optional `subscribe(cb)`). `fetchThemeSource(manifestUrl)` from `@mmdx/studio/adapters` reads a manifest and fetches theme files next to it. A component asks the source when it needs an unregistered theme; a theme that `extends` another unknown theme pulls that one in too. A theme the source does not have, or that fails to load, leaves the diagram on the base theme with an info diagnostic. Built-in theme ids are never fetched from the source. A component's own `themeSource` property wins over this one. Do not set a source that fetches in a sandboxed iframe; use `registerThemes()` there (see [Sandboxed iframes](/guide/sandboxed-iframes)).

#### `measure`

The [`TextMeasurer`](/api/core#createstaticmeasurer) used for layout (`width(text, font)` and a `kind` of `'static'`, `'canvas'` or `'custom'`). Layout depends on text widths, so the default is a canvas measurer with a bounded cache; where no working 2D canvas exists (jsdom, locked-down environments) it is the table-based [`createStaticMeasurer()`](/api/core#createstaticmeasurer). Diagrams rendered in the render worker are measured by the worker's own canvas measurer (`OffscreenCanvas`), not by this one.

#### `i18n`

The UI language: `locale` (a BCP 47 tag) and an optional catalog of `messages` (key → text) that overrides the bundled English. See [Internationalization](#internationalization).

#### `linkPolicy`

Which link URLs a diagram may carry and how they open ([`LinkPolicy`](/api/core#linkpolicy)): `protocols` lists the allowed protocols in lower case with the colon (relative URLs always pass), `target` is the `target` for opened links (`'_blank'`, `'_self'`, `'_top'` or `'_parent'`; `_blank` when omitted). A link the policy rejects is not rendered as a link.

#### `imagePolicy`

Which image URLs a diagram may show ([`ImagePolicy`](/api/core#imagepolicy)): `protocols` (`'https:'`, `'http:'`, `'data:'`; `[]` turns images off), `hosts` (an allow-list of host names, `*.example.com` for subdomains), `relative` (allow relative URLs), and for `data:` URLs `dataTypes` and `maxDataBytes`. An image the policy refuses is drawn as a placeholder and reported as an `image.blocked` warning. Icons are drawn by mmdx itself and do not go through it. Diagrams rendered in the render worker use the component's policy. See [Security](/guide/security#image-policy).

#### `mermaid`

The stock Mermaid used for diagram types mmdx does not draw itself (the viewer's `fallback="mermaid"`, the default) and for the editor's Plain Mermaid preview. Pass a `MermaidLike` instance or a loader that resolves to one; without it, the first such render runs `import('mermaid')`, which needs the optional `mermaid` package installed. The instance is resolved once per page, on first use. Renders go through one queue shared by all components (Mermaid keeps global configuration), in a detached container, with `securityLevel: 'strict'` and Mermaid's `dark` or `default` theme following the component's scheme.

#### `fonts`

Font files embedded into PNG exports, keyed by font family name: a URL (fetched at export time) or the font's bytes. An export embeds the families the SVG uses and finds here; generic families (`sans-serif`, `system-ui`…) are skipped, and families without a source, with a name outside letters, digits, spaces, `.`, `_` and `-`, or whose file fails to load are left to the machine's local fonts. Fonts from several `configure()` calls are merged.

#### `debug`

Declared for development (logging operations and exposing a state getter). In this version the flag is stored but no component reads it.

### `MermaidLike`

```ts
interface MermaidLike {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
}
```

The minimal surface of stock Mermaid used by the fallback renderer and the plain-Mermaid compare view; the default export of the `mermaid` package (version 10 or newer) satisfies it. The type is not exported by name: it is the type of `Config['mermaid']`.

## Theme registration

### `registerThemes()`

```ts
function registerThemes(themes: Iterable<unknown>): Diagnostic[];
```

Registers theme files into the shared registry every component reads (the theme menus list them), with no loading: themes bundled by the host, for pages that cannot fetch theme files (sandboxed iframes). A file with the id of a registered theme replaces it. Each file is validated; the function returns the validation diagnostics ([`Diagnostic`](/api/core#diagnostic)), and invalid values are dropped.

```ts
import { registerThemes } from '@mmdx/studio/viewer';
import { BUILTIN_THEMES } from '@mmdx/studio/core';
import github from '@mmdx/studio/themes/github-light.theme.json';

const diagnostics = registerThemes([...BUILTIN_THEMES, github]);
```

After `registerThemes(BUILTIN_THEMES)` the components load nothing for the built-in themes.

### `registerBuiltinThemes()`

```ts
function registerBuiltinThemes(): Promise<void>;
```

Registers every built-in theme into the shared registry and resolves once they are there. Default Light (`default-light`) is part of every component; Default Dark (`default-dark`) loads as a chunk of the library on first use. The components call the same function themselves: the editor, theme editor and studio when they start (they list themes), the viewer when a diagram names a built-in theme that is not registered yet (it waits for it instead of showing the base theme first). So a page of viewers that only use Default Light never downloads Default Dark.

Nothing loads when both built-in themes are registered already (for example after `registerThemes(BUILTIN_THEMES)`); the promise then resolves at once. The load runs once per page: later calls return the same promise, and a theme registered under a built-in id before the chunk arrives is not replaced.

## Render worker

The viewer renders diagrams with more than 300 source lines (`WORKER_THRESHOLD_LINES`) in a render worker, so parsing and layout do not block the page; smaller diagrams render on the main thread. One worker serves every viewer on the page. Jobs run one at a time, in order; a job's 2 s timeout starts when the worker takes it, and a viewer's newer job replaces its older one still waiting. A job that times out restarts the worker and is reported as too large (the viewer shows "Rendering this diagram took too long"); the jobs behind it run in the new worker.

When workers are unavailable (no `Worker`, a CSP without `worker-src`, `file://`, a worker that fails to start), every diagram renders on the main thread from then on; the job that was running when the worker failed renders on the main thread too. The editor and the diff always render on the main thread.

By default the worker is a module worker started from the library's own file (`dist/assets/render-worker-….js`, found relative to the chunk that starts it, so apps that bundle mmdx with Vite or Rollup resolve and emit it).

### `setWorkerUrl()`

```ts
function setWorkerUrl(url: URL | string, opts?: { type?: WorkerType }): void;
```

Starts the render worker from `url` instead of the library's file. Hosts with a strict CSP can serve the worker file themselves (`worker-src 'self'`). `type` is the worker type: `'module'` (the default) or `'classic'`; `'classic'` is for the `blob:` URL of the [inline worker](/api/worker-inline)'s source, for pages that cannot start module workers.

```ts
import { setWorkerUrl } from '@mmdx/studio/viewer';

setWorkerUrl('/static/mmdx-render-worker.js');
```

Each call terminates the current worker and clears an earlier failure, so the next large diagram tries the new URL; a job in flight in the old worker renders on the main thread. Call it once at startup, before the first large diagram. If the new worker fails to start, diagrams fall back to the main thread as above.

::: tip
In a sandboxed iframe with an opaque origin, module workers from URLs fail. Use `useInlineWorker()` from [`@mmdx/studio/worker-inline`](/api/worker-inline), which calls `setWorkerUrl(blobUrl, { type: 'classic' })` for you.
:::

## Markdown upgrade

### `upgradeMermaidBlocks()`

```ts
function upgradeMermaidBlocks(
  root?: ParentNode,
  opts?: Partial<Pick<ViewerOptions, 'theme' | 'themeDark' | 'controls' | 'fit'>> & { tag?: string },
): HTMLElement[];
```

The run-time upgrade for pages whose Markdown is rendered by a CMS or a client-side renderer: finds Mermaid code blocks under `root` (default `document`) and replaces each with a viewer element. Returns the new elements, in document order.

It selects `pre > code.language-mermaid`, `pre > code.lang-mermaid` and `pre.mermaid`, and replaces the whole `pre`. The code is read through `textContent` and handed to the element's `source` property, never as HTML.

| Option | Type | Effect |
|---|---|---|
| `theme` | `string` | Sets the `theme` attribute |
| `themeDark` | `string` | Sets the `theme-dark` attribute (`'auto'` uses each theme's counterpart) |
| `controls` | `readonly ViewerControl[]` | Sets the `controls` attribute (space-separated); an empty list writes `none` |
| `fit` | `'contain' \| 'width' \| 'none'` | Sets the `fit` attribute |
| `tag` | `string` | The element to create (default `mmdx-viewer`); `<mmdx-viewer>` is defined first when it is the tag |

```ts
import { upgradeMermaidBlocks } from '@mmdx/studio/viewer';

const viewers = upgradeMermaidBlocks(document.querySelector('article')!, { themeDark: 'auto', controls: ['zoom', 'fullscreen'] });
```

Use `tag` for a custom element of your own that takes a `source` property. For Markdown rendered at build time, the [Markdown plugins](/api/markdown) emit pre-rendered viewers instead (see [Markdown and docs sites](/guide/markdown)).

## Internationalization

Every UI string goes through a translation function with a key and optional parameters. English is bundled; a host adds a catalog with `configure({ i18n })`:

```ts
configure({
  i18n: {
    locale: 'de',
    messages: {
      'zoom.in': 'Vergrößern',
      'zoom.out': 'Verkleinern',
      'zoom.fit': 'Einpassen',
      'label.flowchart': 'Flussdiagramm: {nodes} Knoten, {edges} Verbindungen',
    },
  },
});
```

### Locale

`locale` (default `'en'`) is passed to each component's core context and formats relative dates in version lists ("2 days ago") through `Intl.RelativeTimeFormat`. It does not select a catalog: the texts come only from `messages`.

### Messages

`messages` is a flat `Record<string, string>` of key → text (the `Messages` type, not exported by name). A key resolves in this order:

1. the host's `messages`;
2. the bundled English base strings (the viewer's);
3. the English strings of components loaded later (editor, theme editor, toolbars, diff, History), registered when a component or block is first used, so a page with only viewers ships only the viewer's strings;
4. the key itself.

So a catalog may translate any subset of keys; missing keys show in English. The catalog is read when a component is created: configure the language before creating components.

### Parameters

Texts may contain `{name}` placeholders, replaced by the parameter of that name (`'{n} items'`). A placeholder without a matching parameter stays as written. There is no plural or select syntax: texts that depend on a count come as separate keys, chosen by the component (`code.lines1` / `code.linesN`, `problems.count1` / `problems.countN`). Keep the placeholders when you translate a text.

### Message keys

Every key with its English text, grouped by the component that registers it. A key that two tables share is listed once (the texts are the same).

::: details Viewer base strings (42 keys)

Bundled with every component (`src/ui/i18n.ts`): zoom, full screen, view settings, pen, export, code view, errors and the diagram's accessible label.

| Key | English |
|---|---|
| `zoom.in` | Zoom in |
| `zoom.out` | Zoom out |
| `zoom.fit` | Fit to view |
| `zoom.fitShort` | Fit |
| `fullscreen.enter` | Full screen |
| `fullscreen.exit` | Close full screen |
| `fullscreen.failed` | Full screen is not available here |
| `layers.title` | View settings |
| `layers.layers` | Layers |
| `layers.display` | Display |
| `layers.labels` | Connector labels |
| `layers.hover` | Hover highlight |
| `layers.show` | Show layer |
| `layers.hide` | Hide layer |
| `layers.default` | Default |
| `pen.title` | Magic pen (P) |
| `pen.erase` | Erase all strokes |
| `pen.fade` | Auto erase |
| `pen.keep` | Keep |
| `export.title` | Export |
| `export.svg` | SVG image |
| `export.png` | PNG image (2×) |
| `export.mmdx` | Styled Mermaid (.mmdx) |
| `export.mmd` | Portable Mermaid (.mmd) |
| `codeView.show` | Show Mermaid code |
| `codeView.hide` | Show diagram |
| `codeView.label` | Mermaid code |
| `codeView.copy` | Copy |
| `codeView.copied` | Copied |
| `error.title` | This diagram cannot be shown |
| `error.copy` | Copy source |
| `error.copied` | Copied |
| `error.tooLarge` | Diagram too large |
| `error.unsupported` | Unsupported diagram type |
| `label.flowchart` | `Flowchart: {nodes} nodes, {edges} connections` |
| `label.sequence` | `Sequence diagram: {participants} participants, {messages} messages` |
| `label.er` | `ER diagram: {entities} tables, {rels} relationships` |
| `label.empty` | Empty diagram |
| `label.unsupported` | Diagram |
| `help.title` | Shortcuts |
| `history.open` | History |
| `loading` | Loading diagram… |

:::

::: details View kernel (20 keys)

Registered by every component with a canvas (`src/ui/messages/view.ts`): the tool dock, shortcuts help and view settings.

| Key | English |
|---|---|
| `tools.title` | Tools |
| `tools.hand` | Hand — drag to move around |
| `tools.pen` | Magic pen — draw; strokes are not saved |
| `tools.viewSettings` | View settings — layers and display |
| `tools.codeView` | Mermaid code — show or hide the code panel |
| `tools.versions` | History — the versions of this diagram and what changed |
| `help.tools` | Tools |
| `help.view` | View |
| `help.toggle` | Shortcuts and hints |
| `help.escClose` | Close this help |
| `help.hand` | Hand (pan) |
| `help.pen` | Pen — draw, fades away |
| `help.escTool` | Back to the default tool |
| `help.pan` | Move around |
| `help.viewSettings` | View settings |
| `help.codeView` | Mermaid code panel |
| `help.history` | History of this diagram (when it has one) |
| `viewParams.title` | View |
| `export.failed` | `{kind} export failed: {msg}` |
| `panel.close` | Close |

:::

::: details UI blocks (79 keys)

Registered by each block when it is created (`src/ui/messages/blocks*.ts`): pen options, zoom bar, help popup, theme menu, export menu, panels, layer list, code view, version list, change list and filter toggles.

| Key | English |
|---|---|
| `pen.options` | Pen options |
| `pen.colorNamed` | `Pen colour: {name}` |
| `pen.size` | `Thickness {n}px` |
| `pen.fadeAfter` | `Auto erase strokes {s} seconds after drawing` |
| `zoom.bar` | Zoom |
| `zoom.level` | Zoom level |
| `help.button` | Shortcuts and hints |
| `help.close` | Close |
| `ui.appearance` | Appearance |
| `ui.light` | Light |
| `ui.dark` | Dark |
| `theme.menu` | Diagram theme |
| `theme.current` | `Diagram theme: {name}` |
| `theme.light` | Light themes |
| `theme.dark` | Dark themes |
| `theme.follow` | Follow light / dark |
| `theme.edit` | Edit themes… |
| `export.tip` | Export the diagram |
| `panes.resize` | Drag to resize · double-click to reset |
| `layers.rename` | Layer name |
| `layers.countLabel` | `{n} items` |
| `layers.lock` | Lock layer |
| `layers.unlock` | Unlock layer |
| `layers.select` | Select the items on this layer |
| `layers.selectN` | `Select the {n} items on {name}` |
| `layers.highlight` | Highlight the items on this layer |
| `layers.delete` | Delete layer (its items move to Default) |
| `diff.filters` | Change filters |
| `diff.filter.name` | `{label} ({n})` |
| `diff.filter.tip` | `{label} · {n} — click to {action}` |
| `diff.filter.hide` | hide |
| `diff.filter.show` | show |
| `diff.panel.changes` | Changes |
| `diff.panel.docWide` | `Diagram-wide ({n})` |
| `diff.empty.noChanges` | No changes with the current filters. |
| `diff.kind.node` | node |
| `diff.kind.group` | group |
| `diff.kind.edge` | edge |
| `diff.kind.participant` | participant |
| `diff.kind.message` | message |
| `diff.kind.note` | note |
| `diff.kind.block` | block |
| `diff.kind.box` | box |
| `diff.kind.entity` | table |
| `diff.kind.rel` | relation |
| `diff.status.added` | added |
| `diff.status.removed` | removed |
| `diff.status.changed` | `{facets} changed` |
| `diff.status.changedFields` | `{facets} changed ({fields})` |
| `diff.announce` | `{kind} {name}: {what}` |
| `diff.panel.linesOf` | Lines of |
| `diff.panel.showAll` | Show all |
| `diff.panel.showAllTip` | Show the whole file |
| `diff.panel.lines` | lines |
| `diff.panel.unchanged` | `⋯ {n} unchanged lines` |
| `diff.panel.notesTip` | Switched-off facets are left out of the diff |
| `diff.empty.noLines` | No code lines for this item (it lives in the metadata). |
| `diff.empty.noMeta` | No metadata lines for this item. |
| `diff.empty.noDiff` | No differences with the current filters. |
| `diff.panel.history` | History |
| `diff.panel.compare` | Compare |
| `diff.history.current` | current |
| `diff.history.initial` | initial |
| `diff.history.noChanges` | no changes |
| `diff.history.before` | Before |
| `diff.history.after` | After |
| `diff.history.beforeShort` | B |
| `diff.history.afterShort` | A |
| `diff.history.useAsBefore` | `Use {id} as before` |
| `diff.history.useAsAfter` | `Use {id} as after` |
| `diff.history.sameBefore` | `{id} is already the before version` |
| `diff.history.sameAfter` | `{id} is already the after version` |
| `diff.history.swapBefore` | `{id} is the before version: swap Before and After` |
| `diff.history.swapAfter` | `{id} is the after version: swap Before and After` |
| `diff.history.compareWith` | `Compare {id} with the version before it` |
| `diff.history.view` | `View {id}` |
| `diff.history.more` | Load older versions |
| `diff.history.actions` | `Actions for {id}` |
| `diff.history.comparePrev` | Compare with the previous version |

:::

::: details Dialogs (3 keys)

The in-component confirmation and name dialogs (`src/ui/dialog.ts`).

| Key | English |
|---|---|
| `dialog.ok` | OK |
| `dialog.cancel` | Cancel |
| `dialog.enterName` | Enter a name |

:::

::: details Editor (303 keys)

Registered by `<mmdx-editor>` (`src/ui/messages/editor.ts`): code panel, problems, properties, attributes, page settings, presets and document commands.

| Key | English |
|---|---|
| `code.panel` | Mermaid code |
| `code.tabMermaid` | Mermaid |
| `code.tabMetadata` | Metadata |
| `code.close` | Close panel |
| `code.editorLabel` | Mermaid code |
| `code.metaEditorLabel` | Metadata (%%@ lines) |
| `code.clearFilter` | Clear filter (Esc) |
| `code.filterPlaceholder` | Filter Mermaid — text or element id (select on canvas) |
| `code.filterLabel` | Filter the Mermaid code |
| `code.metaFilterPlaceholder` | Filter metadata — text or element id |
| `code.metaFilterLabel` | Filter the metadata |
| `code.showAll` | Show all |
| `code.showing` | `Showing {n} of {total} lines — edits go into the full file` |
| `code.metaShowing` | `Showing {n} of {total} lines — edits go into the full metadata` |
| `code.noMatch` | No lines match |
| `code.lines1` | `{n} line` |
| `code.linesN` | `{n} lines` |
| `code.keepHidden` | Keep the "%% - N hidden" lines — they stand for the parts of the file that are filtered out. |
| `code.keepHiddenMeta` | Keep the "%% - N hidden" lines — they stand for the parts of the metadata that are filtered out. |
| `problems.title` | Problems |
| `problems.hide` | Hide problems |
| `problems.show` | Show problems |
| `problems.metaTag` | metadata |
| `problems.goto` | `Go to line {line}` |
| `problems.gotoMeta` | `Go to metadata line {line}` |
| `problems.fix` | `Fix: {label}` |
| `problems.fixRename` | `Rename subgraph "{id}" → "{newId}"` |
| `problems.fixLabel` | Fix id clash |
| `problems.renamed` | `Subgraph renamed to "{id}" — its title is unchanged` |
| `problems.undefinedClass` | `class "{cls}" is not defined — no classDef or style preset with this name` |
| `problems.count1` | `{n} problem` |
| `problems.countN` | `{n} problems` |
| `problems.inCode` | in the Mermaid code |
| `problems.inMeta` | in the metadata |
| `problems.inBoth` | in the Mermaid code and metadata |
| `problems.lineN` | `line {line}` |
| `problems.openCode` | Open code |
| `props.title` | Properties |
| `props.close` | Close Properties |
| `props.diagram` | Diagram |
| `props.nothingSelected` | Nothing selected — page settings. Click an element to style it. |
| `props.noDiagram` | Not a flowchart, sequence or ER diagram. |
| `props.text` | Text |
| `props.titleText` | Title |
| `props.label` | Label |
| `props.name` | Name |
| `props.condition` | Condition |
| `props.textHint` | Enter to apply |
| `props.textMultiHint` | Text (Enter = new line, ⌘/Ctrl+Enter = apply) |
| `props.layer` | Layer |
| `props.mixed` | mixed |
| `props.stylePreset` | Style preset |
| `props.appearance` | Appearance |
| `props.geometry` | `Position & geometry` |
| `props.resetField` | Reset to inherited |
| `props.inherit` | inherit |
| `props.yes` | yes |
| `props.no` | no |
| `props.fixedFrame` | Fixed frame |
| `props.fixedOn` | manual size (lane) |
| `props.fixedOff` | fits its content |
| `props.resetAll` | Reset all overrides |
| `props.resetLabel` | Reset label offset |
| `props.attributes` | `Attributes · {n}` |
| `props.attributesLabel` | Attributes |
| `props.cardinality` | Cardinality |
| `props.side` | `{id} side` |
| `props.identifying` | Identifying |
| `props.solidLine` | solid line |
| `props.activationHint` | Drag its top or bottom handle to another message to start or end the process there. |
| `props.removeProcess` | Remove process |
| `props.bulkTitle` | `{n} {kind} selected` |
| `props.bulkHint` | Changes apply to all of them. Values that differ show as mixed. |
| `props.kinds.node` | nodes |
| `props.kinds.group` | groups |
| `props.kinds.edge` | connectors |
| `props.kinds.participant` | participants |
| `props.kinds.message` | messages |
| `props.kinds.note` | notes |
| `props.kinds.block` | blocks |
| `props.kinds.box` | boxes |
| `props.kinds.activation` | processes |
| `props.kinds.entity` | tables |
| `props.kinds.rel` | relationships |
| `props.multiTitle` | `{n} items selected` |
| `props.group` | Group (⌘G) |
| `props.groupTip` | Group the selection |
| `props.delete` | Delete |
| `props.showProcess` | Show as process |
| `props.showProcessOn` | `Show as process on {p}` |
| `props.removeProcessOn` | `Remove process on {p}` |
| `props.showProcessTip` | Activation bar between the two messages (+/− in Mermaid) |
| `props.multiHint` | Style all of them at once with the floating toolbar. Drag any of them to move the whole selection. |
| `props.editor` | Editor |
| `props.snap` | Snap grid |
| `props.metaHint` | Positions, sizes and style overrides are written as metadata. Mermaid text stays clean and renders anywhere. |
| `attr.type` | Type |
| `attr.name` | Name |
| `attr.nameComment` | Name (comment) |
| `attr.key` | Key |
| `attr.comment` | Comment |
| `attr.color` | Text colour |
| `attr.colorSet` | `Text colour {color} · double-click to clear` |
| `attr.bold` | Bold |
| `attr.underline` | Underline |
| `attr.remove` | Remove attribute |
| `attr.add` | `+ Attribute` |
| `attr.hint` | One line per attribute: type name PK (comment) — Mermaid. Aa sets how it looks (metadata). |
| `attr.line` | `Attribute {n}` |
| `attr.style` | Style |
| `attr.styleOf` | `Style of {name}` |
| `attr.preset` | Preset |
| `attr.textStyle` | Text |
| `attr.italic` | Italic |
| `attr.font` | Font |
| `attr.themeFont` | Theme font |
| `attr.size` | Size |
| `attr.sizeAuto` | auto |
| `attr.colorInherit` | Colour of the table |
| `card.zero-one` | zero or one |
| `card.one` | exactly one |
| `card.zero-many` | zero or more |
| `card.one-many` | one or more |
| `type.flowchart` | Flowchart |
| `type.sequence` | Sequence diagram |
| `type.er` | ER diagram |
| `type.empty` | Empty |
| `type.unsupported` | `Unsupported: {kw}` |
| `type.switchTitle` | `Start a new {type}?` |
| `type.switchMsg` | It replaces the current diagram — Mermaid diagram types cannot be converted into each other. |
| `type.switchOk` | Start new |
| `dir.TB` | Top → bottom |
| `dir.LR` | Left → right |
| `dir.BT` | Bottom → top |
| `dir.RL` | Right → left |
| `ratio.square` | 1 : 1 (square) |
| `ratio.a4l` | A4 landscape |
| `ratio.a4p` | A4 portrait |
| `page.title` | Page |
| `page.type` | Diagram type |
| `page.direction` | Direction |
| `page.numbers` | Message numbers |
| `page.numbersOff` | Off |
| `page.numbersOn` | Numbered (autonumber) |
| `page.preset` | Page preset |
| `page.presetNone` | None — theme defaults |
| `page.size` | Size |
| `page.pageSize` | Page size |
| `page.fit` | Fit content |
| `page.custom` | Custom |
| `page.proportions` | Proportions |
| `page.free` | Free |
| `page.customRatio` | Custom… |
| `page.ratioW` | Proportion width |
| `page.ratioH` | Proportion height |
| `page.wh` | W × H |
| `page.width` | Page width |
| `page.height` | Page height |
| `page.fitsContent` | Fits the content — switch to Custom to set it |
| `page.lock` | Lock proportions |
| `page.unlock` | Unlock proportions |
| `page.seqLayout` | Sequence layout |
| `page.badgeTip` | `{type} — click for the page settings (type, preset, background, size…)` |
| `presets.default` | default |
| `presets.auto` | auto |
| `presets.autoArrow` | `auto → {name}` |
| `presets.shapeDefault` | `{shape} default` |
| `presets.tip` | `Style preset "{name}"` |
| `presets.tipLocal` | `Style preset "{name}" (this diagram)` |
| `presets.tipAuto` | Automatic: from the Mermaid class / shape |
| `presets.tipDefault` | The default style |
| `presets.tipModified` | modified on this item (Save as preset keeps it as a preset) |
| `presets.thisDiagram` | This diagram |
| `presets.saveTitle` | Save as preset |
| `presets.saveLabel` | Name of the new preset (stored in this diagram) |
| `presets.saveOk` | Save |
| `presets.saveTip` | Save as preset — this item's look becomes a preset of this diagram (stored in the Mermaid file) |
| `presets.saveTipOff` | Save as preset — restyle the item first |
| `presets.reset` | Reset |
| `presets.resetTip` | Reset — drop this item's own changes, back to its preset |
| `presets.resetTipOff` | Reset — nothing changed on this item |
| `presets.updateTip` | `Update “{name}” with this item's changes (every item using it changes)` |
| `presets.needName` | Enter a name |
| `presets.taken` | `There already is a preset "{name}"` |
| `presets.saved` | `Preset "{name}" saved in this diagram` |
| `presets.updated` | `Preset "{name}" updated` |
| `presets.deleteTip` | Delete this preset from the diagram |
| `presets.deleteTitle` | Delete preset |
| `presets.deleteMsg` | `Delete the preset "{name}"?` |
| `presets.deleteUsers1` | `Delete the preset "{name}"? {n} item using it goes back to the default style.` |
| `presets.deleteUsersN` | `Delete the preset "{name}"? {n} items using it go back to the default style.` |
| `presets.delete` | Delete |
| `layers.close` | Close Layers |
| `layers.closeView` | Close View settings |
| `layers.new` | `+ New layer` |
| `layers.newTip` | New layer (takes the selected items) |
| `layers.hiddenSuffix` | (hidden) |
| `layers.hoverConnections` | Highlight connections on hover |
| `layers.created` | `Layer {n} created` |
| `layers.created1` | `Layer {n} created with {count} selected item` |
| `layers.createdN` | `Layer {n} created with {count} selected items` |
| `layers.createdRename` | `Layer {n} created — rename it in the Layers panel` |
| `layers.moved` | `Moved to "{name}"` |
| `layers.movedHidden` | `Moved to "{name}" (hidden layer)` |
| `palette.removed` | Colour removed from this diagram’s palette — items using it keep the colour |
| `order.selectOne` | Select one item to move it |
| `order.back` | back |
| `order.front` | front |
| `order.earlier` | earlier |
| `order.later` | later |
| `order.left` | left |
| `order.right` | right |
| `group.noEr` | Mermaid ER diagrams have no groups |
| `group.selectBoxes` | Select boxes or groups to group |
| `group.selectParticipants` | Select participants to group them into a box |
| `group.alreadyBoxed` | A participant is already in a box — ungroup it first |
| `tools.pointer` | `Select & edit` |
| `tools.shapes` | Shapes — drag onto the canvas or click to add |
| `tools.table` | Table — drag onto the canvas or click to add |
| `tools.code` | Mermaid code — show or hide the left panel |
| `tools.props` | Properties — show or hide the Properties panel |
| `tools.layers` | Layers — show or hide the Layers panel |
| `tools.history` | History |
| `history.restored` | `Restored {id} — undo brings the previous diagram back` |
| `tools.undo` | Undo |
| `tools.redo` | Redo |
| `tools.undoLabel` | `Undo {label}` |
| `tools.redoLabel` | `Redo {label}` |
| `help.pointer` | Pointer |
| `help.code` | Mermaid code panel |
| `help.props` | Properties panel |
| `help.layers` | Layers panel (View settings in View mode) |
| `export.mmdxTip` | Mermaid with the layout and styles as %%@ lines — opens in this editor with everything kept |
| `export.mmdTip` | Plain Mermaid with classDef / linkStyle colours — renders in YouTrack, GitHub, … |
| `export.pngTip` | At 2× resolution |
| `more.title` | More |
| `more.open` | Open… |
| `more.openTip` | Open .mmdx / .mmd / .md / .txt (+ .layout.json) |
| `more.autoLayout` | Auto layout |
| `more.autoLayoutTip` | Forget manual positions of the whole diagram |
| `more.plain` | Plain Mermaid |
| `more.plainTip` | Render with stock Mermaid (what YouTrack / GitHub show) |
| `plain.title` | Plain Mermaid render |
| `plain.close` | Close |
| `plain.rendering` | Rendering with stock Mermaid… |
| `plain.badSvg` | Mermaid returned no SVG |
| `plain.note` | Same file rendered by stock Mermaid — what YouTrack / GitHub show without the studio. Colours come from generated classDef / linkStyle (Portable export); positions are Mermaid’s own. |
| `plain.failed` | `Mermaid could not render this source: {msg}` |
| `auto.done` | Manual positions removed (styles kept) |
| `auto.nothing` | Nothing to reset — the diagram is laid out automatically |
| `open.layout` | `Loaded layout {name}` |
| `open.failed` | `Could not open the file: {msg}` |
| `history.editCode` | Edit code |
| `history.editMeta` | Edit metadata |
| `history.style` | Style |
| `history.page` | Page |
| `history.text` | Edit text |
| `history.attributes` | Attributes |
| `history.attrAdd` | Add attribute |
| `history.attrEdit` | Edit attribute |
| `history.attrDelete` | Delete attributes |
| `history.attrMove` | Move attributes |
| `history.attrStyle` | Attribute style |
| `table.deleted` | `Deleted {n} attribute(s) — ⌘/Ctrl+Z to undo` |
| `table.placeholder` | type name PK (comment) |
| `table.newAttr` | New attribute |
| `table.editAttr` | Attribute |
| `table.badAttr` | `Write an attribute as: type name [PK\|FK\|UK] (comment)` |
| `attrPreset.none` | Plain |
| `attrPreset.key` | Key |
| `attrPreset.foreign` | Foreign key |
| `attrPreset.important` | Important |
| `attrPreset.muted` | Muted |
| `attrPreset.note` | Note |
| `history.relationship` | Relationship |
| `history.layer` | Move to layer |
| `history.newLayer` | New layer |
| `history.renameLayer` | Rename layer |
| `history.deleteLayer` | Delete layer |
| `history.hideLayer` | Hide layer |
| `history.showLayer` | Show layer |
| `history.preset` | Preset |
| `history.savePreset` | Save preset |
| `history.updatePreset` | Update preset |
| `history.deletePreset` | Delete preset |
| `history.resetStyle` | Reset style |
| `history.resetAll` | Reset overrides |
| `history.resetLabel` | Reset label offset |
| `history.resetCurve` | Reset curve |
| `history.frame` | Fixed frame |
| `history.pagePreset` | Page preset |
| `history.pageSize` | Page size |
| `history.pageRatio` | Proportions |
| `history.direction` | Direction |
| `history.autonumber` | Message numbers |
| `history.newDiagram` | New diagram |
| `history.theme` | Theme |
| `history.order` | Move in order |
| `history.paletteAdd` | Add colour |
| `history.paletteRemove` | Remove colour |
| `history.autoLayout` | Auto layout |
| `history.lock` | Lock |
| `history.unlock` | Unlock |

:::

::: details Style toolbar and page toolbar (173 keys)

Registered by the editor and the theme editor (`src/ui/messages/toolbar.ts`): keys `tb.*` (style toolbar) and `ptb.*` (page toolbar).

| Key | English |
|---|---|
| `tb.label` | Style |
| `tb.shapeStack` | `Shape & stacked style` |
| `tb.stack` | Stacked style |
| `tb.font` | Font |
| `tb.fontSize` | Font size |
| `tb.larger` | Larger |
| `tb.smaller` | Smaller |
| `tb.bold` | Bold |
| `tb.textPos` | Text position |
| `tb.wrap` | Word wrap |
| `tb.wrapTip` | Word wrap — break the text into lines that fit the shape (resize it to set the width) |
| `tb.link` | Link |
| `tb.textColor` | Text colour |
| `tb.border` | Border |
| `tb.fill` | Fill colour |
| `tb.line` | Line |
| `tb.arrows` | Arrow heads |
| `tb.routing` | Line shape |
| `tb.unlock` | Unlock position |
| `tb.lock` | Lock position |
| `tb.paint` | Copy style — then click another item (Shift-click for several, Esc to stop) |
| `tb.group` | `Group ({keys})` |
| `tb.arrange` | `Align & distribute` |
| `tb.activationRemove` | `Remove the process (activation) on {p}` |
| `tb.activationAdd` | `Show as process on {p} — activation bar (+/− in Mermaid)` |
| `tb.editGroupDone` | Finish editing the group (Esc) |
| `tb.editGroup` | Edit group — fade everything else; move, resize and style the items inside (or double-click the group) |
| `tb.ungroup` | `Ungroup ({keys}) — keeps the contents` |
| `tb.delete` | `Delete ({keys}) — removes it from the Mermaid code` |
| `tb.orderSeq` | `Order in the Mermaid code — earlier / later ({keys})` |
| `tb.order` | `Order in the Mermaid code — send backward / bring forward ({keys})` |
| `tb.layer` | Layer — move to another layer |
| `tb.presets` | Style presets |
| `tb.reset` | Back to the inherited style |
| `tb.resetNone` | Nothing changed here |
| `tb.more` | More |
| `tb.shape` | Shape |
| `tb.single` | Single |
| `tb.stacked` | Stacked |
| `tb.double` | Double |
| `tb.usePreset` | Use style preset |
| `tb.alignH` | `Align {v}` |
| `tb.alignV` | `Vertical {v}` |
| `tb.pos.left` | left |
| `tb.pos.center` | center |
| `tb.pos.right` | right |
| `tb.pos.top` | top |
| `tb.pos.middle` | middle |
| `tb.pos.bottom` | bottom |
| `tb.zindex` | Change z-index |
| `tb.zindexN` | `Change z-index: {n}` |
| `tb.orderNone` | Nothing to reorder it with here — it is the only item in its container. |
| `tb.arrange.left` | Align left |
| `tb.arrange.hcenter` | Align centers horizontally |
| `tb.arrange.right` | Align right |
| `tb.arrange.top` | Align top |
| `tb.arrange.vcenter` | Align centers vertically |
| `tb.arrange.bottom` | Align bottom |
| `tb.arrange.hdist` | Distribute horizontally |
| `tb.arrange.vdist` | Distribute vertically |
| `tb.arrange.need3` | `{title} — select 3 or more items` |
| `tb.moveLayer` | Move to layer |
| `tb.hidden` | hidden |
| `tb.newLayer` | `+ New layer` |
| `tb.themeFontNamed` | `Theme font ({name})` |
| `tb.saveLink` | Save link (Enter) |
| `tb.removeLink` | Remove link |
| `tb.linkLabel` | Link (opens in View mode) |
| `tb.opacity` | Opacity |
| `tb.thickness` | Thickness |
| `tb.corners` | Rounded corners |
| `tb.arrowHead` | Arrow head |
| `tb.start` | Start |
| `tb.end` | End |
| `tb.mermaidArrows` | Use Mermaid arrows |
| `tb.arrow.none` | none |
| `tb.arrow.open` | open |
| `tb.arrow.filled` | filled |
| `tb.arrow.arrow` | arrow |
| `tb.arrow.circle` | circle |
| `tb.arrow.dot` | dot |
| `tb.arrow.cross` | cross |
| `tb.routing.curved` | curved |
| `tb.routing.orthogonal` | right angles |
| `tb.routing.straight` | straight |
| `tb.curvature` | Curvature |
| `tb.resetCurve` | Reset curve |
| `tb.resetCurveNone` | The line has no bend points or curvature change |
| `tb.resetCurveOne` | Remove the bend point and the curvature change |
| `tb.resetCurveMany` | `Remove the {n} bend points and the curvature change` |
| `tb.resetCurveCurve` | Remove the bend points and the curvature change |
| `tb.copy` | Copy |
| `tb.duplicate` | Duplicate |
| `tb.deleteItem` | Delete |
| `tb.savePreset` | Save as preset |
| `tb.resetStyle` | Reset style |
| `tb.allProps` | All properties… |
| `tb.themePalette` | Theme palette |
| `tb.none` | None |
| `tb.customColor` | Custom colour… (adapts to other themes) |
| `tb.thisDiagram` | This diagram |
| `tb.localColor` | `{value} — this diagram's colour (Alt-click or Delete removes it)` |
| `tb.addColor` | Add a colour to this diagram's palette (not the theme) |
| `tb.dash.solid` | solid |
| `tb.dash.dashed` | dashed |
| `tb.dash.dotted` | dotted |
| `tb.selection` | `{n} selected — choose which types stay selected` |
| `tb.selTypes` | Selected types |
| `tb.selLast` | At least one type stays selected |
| `tb.kind.node` | Nodes |
| `tb.kind.group` | Groups |
| `tb.kind.edge` | Connectors |
| `tb.kind.participant` | Participants |
| `tb.kind.message` | Messages |
| `tb.kind.note` | Notes |
| `tb.kind.block` | Blocks |
| `tb.kind.box` | Boxes |
| `tb.kind.activation` | Processes |
| `tb.kind.entity` | Tables |
| `tb.kind.rel` | Relationships |
| `tb.kind.attr` | Attributes |
| `tb.italic` | Italic |
| `tb.underline` | Underline |
| `tb.tableStyle` | Table style — layout and columns |
| `tb.layout` | Layout |
| `tb.layout.compact` | Compact |
| `tb.layout.table` | Table |
| `tb.showTypes` | Show types |
| `tb.showComments` | Show comments |
| `tb.pkUnderline` | Underline primary keys |
| `ptb.label` | Page |
| `ptb.diagram` | Diagram |
| `ptb.type` | `Diagram type — {label}` |
| `ptb.direction` | `Direction — {label}` |
| `ptb.preset` | `Page preset — {label}` |
| `ptb.presetNone` | none (theme defaults) |
| `ptb.background` | Page background — transparent by default |
| `ptb.border` | Page border — transparent (none) by default |
| `ptb.sizeCustom` | Page size — custom |
| `ptb.sizeFit` | Page size — fits the content |
| `ptb.ratio` | `Proportions — {label}` |
| `ptb.free` | free |
| `ptb.lines` | `Lines — {label}` |
| `ptb.routing.curved` | Curved |
| `ptb.routing.orthogonal` | Right angles |
| `ptb.routing.straight` | Straight |
| `ptb.gapN` | `Participant gap — {n}px` |
| `ptb.rowHN` | `Row height — {n}px` |
| `ptb.blockSpanTouched` | Block width — only its participants |
| `ptb.blockSpanFull` | Block width — full width |
| `ptb.mirror` | Participants also at the bottom |
| `ptb.autonumber` | Number the messages (autonumber) |
| `ptb.on` | on |
| `ptb.off` | off |
| `ptb.typeLabel` | Diagram type |
| `ptb.directionLabel` | Direction |
| `ptb.presetLabel` | Page preset — from the theme |
| `ptb.presetNoneLong` | None — theme defaults |
| `ptb.sizeLabel` | Page size |
| `ptb.fitContent` | Fit content |
| `ptb.customSize` | Custom size |
| `ptb.ratioLabel` | Proportions |
| `ptb.freeLabel` | Free |
| `ptb.linesLabel` | Lines |
| `ptb.gap` | Participant gap |
| `ptb.rowH` | Row height |
| `ptb.blockSpan` | Block width |
| `ptb.fullWidth` | Full width |
| `ptb.onlyParticipants` | Only its participants |
| `ptb.borderColour` | Border colour |
| `ptb.backgroundColour` | Background colour |
| `ptb.transparent` | Transparent |
| `ptb.themeDefault` | Theme default |

:::

::: details Theme editor (152 keys)

Registered by `<mmdx-theme-editor>` (`src/ui/messages/theme-editor.ts`): keys `te.*`.

| Key | English |
|---|---|
| `te.title` | Themes |
| `te.sub` | Baseline styles for every item type + themes that override them. Save to keep them; export to share. |
| `te.close` | Close (Esc) |
| `te.loading` | Loading themes… |
| `te.list` | Theme library |
| `te.tag.edited` | edited |
| `te.tag.notExported` | not exported |
| `te.tag.used` | `used by {n} diagrams` |
| `te.new` | `+ New theme` |
| `te.newTitle` | A theme that starts as the baseline; change only what should differ |
| `te.duplicate` | Duplicate |
| `te.duplicateTitle` | Copy the selected theme |
| `te.import` | Import… |
| `te.importTitle` | Load a .theme.json file |
| `te.export` | Export |
| `te.exportTitle` | Download the selected theme as a .theme.json file (put it into themes/ and themes/index.json) |
| `te.discard` | Discard changes |
| `te.discardTitle` | Go back to the last saved version |
| `te.revert` | Revert to file |
| `te.revertTitle` | Drop the changes made on top of the theme file |
| `te.delete` | Delete |
| `te.deleteTitle` | Delete this theme |
| `te.publish` | Publish |
| `te.publishTitle` | Publish the saved theme |
| `te.published` | `Published "{name}"` |
| `te.more` | More |
| `te.listActions` | Theme actions |
| `te.changes` | Changes |
| `te.revertFailed` | `Could not revert: {msg}` |
| `te.deleteFailed` | `Could not delete: {msg}` |
| `te.nameTitle` | Theme name |
| `te.nameDefault` | My theme |
| `te.copyName` | `{name} copy` |
| `te.unsavedTitle` | Unsaved changes |
| `te.saveChanges` | `Save the changes to "{name}"?` |
| `te.save` | Save |
| `te.dontSave` | Don't save |
| `te.cancel` | Cancel |
| `te.discardQ` | `Discard the unsaved changes to "{name}"?` |
| `te.revertQ` | `Discard the changes made to "{name}" on top of the theme file?` |
| `te.deleteQ` | `Delete "{name}"?` |
| `te.deleteMsg` | Diagrams that use it fall back to Baseline. |
| `te.deletePresetQ` | `Delete preset "{name}"?` |
| `te.presetName` | Preset name (used as a Mermaid class, e.g. "core") |
| `te.pagePresetName` | Page preset name |
| `te.presetExists` | A preset with this name exists |
| `te.exportQ` | `Export "{name}"` |
| `te.exportMsg` | The theme has unsaved changes. |
| `te.saveExport` | Save and export |
| `te.exportDraft` | Export with the changes |
| `te.invalidTitle` | Not a valid theme file |
| `te.invalidJson` | `Not JSON: {msg}` |
| `te.importErrors` | Nothing was imported. Fix these values in the file: |
| `te.saveErrorsTitle` | The theme cannot be saved |
| `te.saveErrors` | Fix these values before saving: |
| `te.conflictTitle` | The theme was changed elsewhere |
| `te.conflictMsg` | `"{name}" was saved by someone else since it was opened here.` |
| `te.overwrite` | Overwrite |
| `te.reload` | Load theirs |
| `te.saved` | `Saved "{name}"` |
| `te.saveFailed` | `Could not save: {msg}` |
| `te.saveCancelled` | Saving was cancelled |
| `te.readOnly` | Read only |
| `te.preview` | Preview |
| `te.previewSize` | Preview size |
| `te.smaller` | Smaller |
| `te.bigger` | Bigger |
| `te.undo` | `Undo ({keys})` |
| `te.redo` | `Redo ({keys})` |
| `te.saveBtn` | Save |
| `te.saveTitle` | `Save the theme ({keys}) — then diagrams use it` |
| `te.unsaved` | Unsaved changes |
| `te.themeName` | Theme name |
| `te.palette` | Colour palette |
| `te.paletteHintBase` | Styles refer to these colours, so changing one recolours everything that uses it. Click a colour to change it; + adds one. |
| `te.paletteHintTheme` | Click a colour to override it in this theme (ringed = changed; × goes back to the baseline). |
| `te.page` | `Appearance, font & page` |
| `te.changed` | `{n} changed` |
| `te.colorTitle` | `{name}: {value}` |
| `te.colorChanged` | `{name}: {value} (baseline {base})` |
| `te.colorBack` | Back to the baseline colour |
| `te.colorRemove` | Remove from the palette (styles using it keep its current colour) |
| `te.addColor` | Add a colour |
| `te.appearance` | Appearance |
| `te.light` | Light |
| `te.dark` | Dark |
| `te.font` | Font |
| `te.inheritFont` | `inherit ({name})` |
| `te.pageBg` | Page background |
| `te.pageBorder` | Page border |
| `te.grid` | Grid colour |
| `te.default` | Default |
| `te.shapeDefault` | `{shape} — default` |
| `te.addPreset` | `+ Preset` |
| `te.addPresetTitle` | A named style items can use (Mermaid class A:::name or the Style preset of an item) |
| `te.deletePreset` | Delete this preset |
| `te.shapePresets` | `{label} — {n} presets` |
| `te.lowContrast` | `Low contrast: text on fill is {ratio}:1 (WCAG AA needs 4.5:1)` |
| `te.allProps` | `All properties — {name}` |
| `te.inherit` | Inherit |
| `te.inheritOpt` | inherit |
| `te.inheritOptV` | `inherit ({v})` |
| `te.inheritedV` | `inherited ({v})` |
| `te.yes` | yes |
| `te.no` | no |
| `te.none` | None |
| `te.custom` | custom |
| `te.paletteTitle` | Palette |
| `te.chooseColor` | `Choose a colour for {field}` |
| `te.pageCard` | Page |
| `te.pageHint` | Page presets for this diagram type, chosen per diagram (Page → preset). Empty values use the theme page. |
| `te.ppLabel` | Label |
| `te.ppBackground` | Background |
| `te.ppGrid` | Grid colour |
| `te.ppBorder` | Border |
| `te.ppRouting` | Lines |
| `te.ppRatio` | Proportions |
| `te.ppPad` | Padding |
| `te.ppGap` | Participant gap |
| `te.ppRowH` | Row height |
| `te.ppMirror` | Participants at the bottom |
| `te.ppFree` | free |
| `te.flowchart` | Flowchart |
| `te.sequence` | Sequence |
| `te.er` | ER |
| `te.code` | `</> Code` |
| `te.codeTitle` | Edit the sample diagram in Mermaid |
| `te.resetSample` | Reset sample |
| `te.previewHint` | Sample diagram rendered with this theme. Saved themes also apply to open diagrams that use them. |
| `te.previewErr` | `Preview: {msg}` |
| `te.notDiagram` | not a flowchart, sequence or ER diagram |
| `te.sampleCode` | Sample diagram (Mermaid) |
| `te.samplePreview` | Sample diagram |
| `te.section.flowchart` | Flowchart |
| `te.section.sequence` | Sequence |
| `te.section.er` | ER diagram |
| `te.item.node` | Node |
| `te.item.group` | Group (subgraph) |
| `te.item.edge` | Connector |
| `te.item.participant` | Participant |
| `te.item.message` | Message |
| `te.item.note` | Note |
| `te.item.block` | Block (loop / alt / opt) |
| `te.item.box` | Box (participant group) |
| `te.item.lifeline` | Lifeline |
| `te.item.activation` | Activation (process) |
| `te.item.entity` | Table |
| `te.item.rel` | Relationship |
| `te.counterpart` | Linked theme |
| `te.counterpartNone` | None — the house theme is used |
| `te.counterpartHint` | `Shown instead of this theme when the UI switches to {other}. Saving links it back.` |
| `te.counterpartMissing` | Not linked: in the other UI mode diagrams show Default Light / Default Dark. |

:::

::: details Diff (56 keys)

Registered by `<mmdx-diff>` and History (`src/ui/messages/diff.ts`): views, filters, panels, exports and keys.

| Key | English |
|---|---|
| `diff.label` | `Diagram diff: {added} added, {removed} removed, {changed} changed` |
| `diff.labelVersion` | `Diagram version {id}` |
| `diff.view.before` | Before |
| `diff.view.merged` | Merged |
| `diff.view.after` | After |
| `diff.view.side` | Side by side |
| `diff.view.beforeHelp` | The old version, with its removed and changed items highlighted |
| `diff.view.mergedHelp` | One overlay: the new version with removed items kept in place, text changes marked word by word and an arrow from the old place of every moved item |
| `diff.view.afterHelp` | The new version, with its added and changed items highlighted |
| `diff.view.sideHelp` | Before and after next to each other, panned and zoomed together |
| `diff.view.step` | Step between Before, Merged and After: moved items glide, colours blend and changed text flips |
| `diff.views` | Views |
| `diff.filter.added` | Added |
| `diff.filter.removed` | Removed |
| `diff.filter.content` | Content |
| `diff.filter.layout` | Layout |
| `diff.filter.style` | Style |
| `diff.filter.dim` | Dim unchanged items |
| `diff.filter.addedHelp` | Items only in the new version (green, +) |
| `diff.filter.removedHelp` | Items only in the old version (red, dashed, −) |
| `diff.filter.contentHelp` | Changed content of kept items: labels, shapes, connections, attributes, message text (amber, C) |
| `diff.filter.layoutHelp` | Position, size, bend points, ports, layers (blue, L). Off: the old version is drawn on the new layout |
| `diff.filter.styleHelp` | Colours, fonts, presets, classes, theme (purple, S). Off: both versions are drawn unstyled |
| `diff.tool.history` | History |
| `diff.tool.code` | Code diff |
| `diff.tool.changes` | Change list |
| `diff.panel.code` | Mermaid |
| `diff.panel.meta` | Metadata |
| `diff.panel.hide` | Hide |
| `diff.panel.styleRemoved` | style removed |
| `diff.panel.layoutReplaced` | old layout replaced by the new one |
| `diff.history.loading` | Loading history… |
| `diff.history.failed` | Could not load the history |
| `diff.history.retry` | Retry |
| `diff.empty.nothing` | Nothing to compare yet. |
| `diff.banner.typeChanged` | The diagram type changed: only Before and After can be shown. |
| `diff.banner.unsupported` | This diagram type cannot be compared visually; the code diff shows the changes. |
| `diff.export.image` | Image of this view (PNG) |
| `diff.export.svg` | SVG of this view |
| `diff.export.before` | Before source (.mmdx) |
| `diff.export.after` | After source (.mmdx) |
| `diff.export.version` | This version (.mmdx) |
| `diff.export.portable` | Portable Mermaid (.mmd) |
| `diff.export.patch` | Patch (.diff) |
| `diff.export.markdown` | Report (Markdown) |
| `diff.export.json` | Report (JSON) |
| `diff.help.views` | Views (bottom panel) |
| `diff.help.filters` | Change filters (bottom panel) |
| `diff.help.panels` | Panels |
| `diff.help.canvas` | Canvas |
| `diff.help.history` | History (left): every version, newest first. History views one version as it is; Compare picks the Before and After versions |
| `diff.help.code` | Code diff (left): Mermaid code and %%@ metadata, without the facets you switched off; narrows to the selected change |
| `diff.help.changes` | Change list (right): every change; click one to select it and zoom to it |
| `diff.help.step` | Next / previous change |
| `diff.help.escSelection` | Clear the selection |
| `diff.help.undo` | Undo the last stroke |

:::

::: details History in place (12 keys)

Registered when History opens in the viewer or the editor (`src/diff/history.ts`).

| Key | English |
|---|---|
| `history.working` | Working copy (not saved as a version) |
| `history.workingShort` | Working copy |
| `history.back` | Back to the current version |
| `history.swap` | Swap Before and After |
| `history.label` | History |
| `history.pill` | `History · {what}` |
| `history.restore` | Restore this version |
| `history.restoreId` | `Restore {id}` |
| `history.restoreTip` | Open the shown version in the editor (undo brings the current diagram back) |
| `history.copied` | `Copied {label} from {id}` |
| `history.copyNothing` | Select an item on Before or After to copy it |
| `history.copyHelp` | Copy the selected item of this version (paste it after Back) |

:::
