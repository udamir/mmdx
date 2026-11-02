# Entry points

`@mmdx/studio` is split into entry points, so a page imports only what it uses: a docs page with viewers never downloads the editor, and a CI job imports the DOM-free core. This page lists every entry from the package's `exports`, what it provides and every name it exports, with links to where each is documented.

```ts
import '@mmdx/studio/viewer';                          // defines <mmdx-viewer>
import { renderToSvg } from '@mmdx/studio/core';       // DOM-free API
import { httpDocumentAdapter } from '@mmdx/studio/adapters';
```

## Overview

| Import | Provides |
|---|---|
| `@mmdx/studio/viewer` | `<mmdx-viewer>` and `DiagramViewer`: read-only diagrams for docs and portals |
| `@mmdx/studio/editor` | `<mmdx-editor>` and `DiagramEditor`: the visual editor with the code panel; document adapters |
| `@mmdx/studio/theme-editor` | `<mmdx-theme-editor>` and `ThemeEditor`: manage diagram themes; theme and storage adapters |
| `@mmdx/studio/diff` | `<mmdx-diff>` and `DiagramDiff`: how a diagram changed, and its version history; history adapters; the asynchronous diff functions |
| `@mmdx/studio` (also `@mmdx/studio/studio`) | `<mmdx-studio>` and `DiagramStudio`: the complete standalone app |
| `@mmdx/studio/core` | The pure API without DOM: parse, render to SVG, metadata, themes, diffs and diff reports (Node, workers, browsers) |
| `@mmdx/studio/adapters` | Storage, theme sources and stores, document adapters, history adapters, share links |
| `@mmdx/studio/markdown` | rehype and markdown-it plugins that turn mermaid code blocks into viewers |
| `@mmdx/studio/react` | Optional typed wrappers for React 18 and older |
| `@mmdx/studio/worker-inline` | The render worker as a string (`workerSource`) and `useInlineWorker()`, for pages that cannot start workers from URLs |
| `@mmdx/studio/themes/*` | The built-in theme files (`default-light.theme.json`, …) and their manifest `index.json` |

## Package notes

- **ESM only.** The package is ES modules (ES2022) with TypeScript declarations for every entry. It has no runtime dependencies.
- **Mermaid is an optional peer.** `mermaid` (version 10 or newer) is loaded lazily, only for diagram types mmdx does not draw itself and for the "Plain Mermaid" preview. Install it when you need those, or pass an instance with [`configure({ mermaid })`](/api/configuration).
- **Element entries define their tag on import.** `@mmdx/studio/viewer`, `/editor`, `/theme-editor`, `/diff` and `@mmdx/studio` (`/studio`) call their `define…()` function when imported, so they are marked as side effects in `package.json`. The definition is guarded: importing an entry twice is safe, and importing any entry in Node does not throw (no `customElements` there), so server-side rendering frameworks can import them. The `define…(name)` functions take another tag name, to define the element under a name of your own. The element classes are added to `HTMLElementTagNameMap`, so `document.querySelector('mmdx-editor')` is typed.
- **The other entries have no side effects**: `/core`, `/adapters`, `/markdown`, `/react` and `/worker-inline` define nothing on import.
- **Diagram types load on demand.** The components load each diagram type's parser and renderer on first use, as chunks next to the entry; `@mmdx/studio/core` includes all of them statically.
- **Theme files.** `@mmdx/studio/themes/<id>.theme.json` are the built-in themes as JSON (Default Light and Dark, GitHub Light and Dark, Catppuccin Latte and Mocha, Rosé Pine Dawn, Dracula), and `@mmdx/studio/themes/index.json` is their manifest for [`fetchThemeSource()`](/api/adapters#fetchthemesource). Import them into your bundle and register them with [`registerThemes()`](/api/configuration), or serve the folder. The file format is on the [theme file](/api/theme-file) page.

```ts
import github from '@mmdx/studio/themes/github-light.theme.json';
import { registerThemes } from '@mmdx/studio/viewer';

registerThemes([github]);
```

## Exports by entry

The element classes, their options, methods and attributes are documented on the component pages; events of every component are on the [Events](/api/events) page.

### `@mmdx/studio/viewer`

| Group | Exports | Documented in |
|---|---|---|
| Elements and classes | `MmdxViewerElement` (`<mmdx-viewer>`), `DiagramViewer` | [Viewer](/components/viewer) |
| Functions | `defineViewer(name?)` | [Viewer](/components/viewer) |
| | `configure`, `registerThemes`, `registerBuiltinThemes`, `setWorkerUrl` | [Configuration](/api/configuration) |
| | `upgradeMermaidBlocks` | [Configuration](/api/configuration), [Markdown](/api/markdown) |
| Constants | `VIEWER_MODULES` (the viewer's modules, advanced) | [Viewer](/components/viewer) |
| Types | `ViewerOptions`, `ViewerControl`, `ViewerEventMap`, `HostFullscreen` | [Viewer](/components/viewer), [Events](/api/events) |
| | `Config` | [Configuration](/api/configuration) |
| | `HistorySession` | [History](/guide/history) |
| | `ViewCore`, `ViewModule`, `ModuleScope`, `SceneSource`, `Stage`, `DiagramCanvas` (the component kernel, advanced) | [Components](/components/) |

### `@mmdx/studio/editor`

| Group | Exports | Documented in |
|---|---|---|
| Elements and classes | `MmdxEditorElement` (`<mmdx-editor>`), `DiagramEditor`, `EditorCore` (the editor's kernel, advanced) | [Editor](/components/editor) |
| Functions | `defineEditor(name?)` | [Editor](/components/editor) |
| | `configure`, `registerThemes`, `registerBuiltinThemes` | [Configuration](/api/configuration) |
| | `memoryDocumentAdapter`, `httpDocumentAdapter` | [Adapters](/api/adapters#documents) |
| Constants | `DEFAULT_FEATURES`, `DEFAULT_MODULES` | [Editor](/components/editor) |
| Types | `EditorOptions`, `EditorFeatures`, `SaveOutcome`, `SetSourceOptions` | [Editor](/components/editor) |
| | `DocumentAdapter`, `LoadResult`, `DocumentSaveResult` | [Adapters](/api/adapters#documents) |
| | `Config` | [Configuration](/api/configuration) |
| | `HistorySession` | [History](/guide/history) |
| | `EditorModule`, `Gesture`, `GestureSource`, `OverlayPainter`, `ViewCore`, `ViewModule`, `ModuleScope`, `SceneSource`, `Stage`, `DiagramCanvas` (custom editor modules, advanced) | [Editor](/components/editor) |

The editor does not export the history adapters; import them from `@mmdx/studio/adapters` or `@mmdx/studio/diff` (History's code itself loads on first use either way).

### `@mmdx/studio/theme-editor`

| Group | Exports | Documented in |
|---|---|---|
| Elements and classes | `MmdxThemeEditorElement` (`<mmdx-theme-editor>`), `ThemeEditor` | [Theme editor](/components/theme-editor) |
| Functions | `defineThemeEditor(name?)` | [Theme editor](/components/theme-editor) |
| | `contrastRatio(a, b)`: the WCAG contrast ratio of two `#hex` colours (1 to 21), or `null` when either is not one | — |
| | `configure`, `registerThemes`, `registerBuiltinThemes` | [Configuration](/api/configuration) |
| | `memoryThemeStore`, `fetchThemeSource`, `localStorageThemeStore`, `isLocalEdit` | [Adapters](/api/adapters#themes) |
| | `memoryStorage`, `localStorageAdapter`, `preloadedStorage` | [Adapters](/api/adapters#storage) |
| Constants | `BUILTIN_THEMES` | [Core](/api/core#builtin-themes) |
| Types | `ThemeEditorOptions`, `ThemeEditorEventMap`, `ThemeSamples` | [Theme editor](/components/theme-editor), [Events](/api/events) |
| | `ThemeSource`, `ThemeStore`, `SaveResult`, `StorageAdapter`, `PreloadedStorageOptions` | [Adapters](/api/adapters) |
| | `ThemeFile`, `ThemeInfo` | [Theme file](/api/theme-file) |
| | `Config` | [Configuration](/api/configuration) |

### `@mmdx/studio/diff`

| Group | Exports | Documented in |
|---|---|---|
| Elements and classes | `MmdxDiffElement` (`<mmdx-diff>`), `DiagramDiff` | [Diff](/components/diff) |
| | `DiffSession`, `DiffScene` (the diff's state and scene, also behind History; advanced) | [Diff](/components/diff) |
| Functions | `defineDiff(name?)`, `diffModules(scene, { actions })` (advanced) | [Diff](/components/diff) |
| | `diffDiagrams(before, after)`: `Promise<DiffResult>` | [below](#asynchronous-diff-functions) |
| | `renderDiffToSvg(before, after, options)`: `Promise<string>` | [below](#asynchronous-diff-functions) |
| | `ignoreFacets`, `diffReport`, `unifiedDiff` | [Core](/api/core#diff) |
| | `staticHistory`, `httpHistoryAdapter`, `contentId` | [Adapters](/api/adapters#history) |
| | `configure`, `registerThemes`, `registerBuiltinThemes` | [Configuration](/api/configuration) |
| Constants | `DIFF_VIEWS` (`before`, `merged`, `after`, `side`), `DIFF_FILTERS` (`added`, `removed`, `content`, `layout`, `style`) | [Diff](/components/diff) |
| Types | `DiffOptions`, `DiffEventMap`, `DiffViewName`, `DiffFilter`, `DiffPanel`, `DiffMode`, `DiffFeature`, `DiffExportKind`, `DiffExportOptions`, `DiffAction`, `DiffPair` | [Diff](/components/diff), [Events](/api/events) |
| | `DiffSessionOptions`, `DiffSource`, `DiffStatus`, `DiffSceneOptions` (advanced) | [Diff](/components/diff) |
| | `DiffResult` (the core's `DiagramDiff` result type, renamed because `DiagramDiff` is the component class here), `ItemChange`, `FieldChange`, `ChangeFacet` | [Core](/api/core#diagramdiff) |
| | `HistoryAdapter`, `StaticVersion`, `VersionInfo` | [Adapters](/api/adapters#history) |
| | `Config` | [Configuration](/api/configuration) |
| | `ViewCore`, `ViewModule`, `ModuleScope`, `SceneSource`, `Stage`, `DiagramCanvas` (the component kernel, advanced) | [Components](/components/) |

#### Asynchronous diff functions

The diff entry ships no diagram parser or renderer statically. Its `diffDiagrams` and `renderDiffToSvg` load the kinds of both versions first, then work like the synchronous [`diffDiagrams()`](/api/core#diffdiagrams) and [`renderDiffToSvg()`](/api/core#renderdifftosvg) of `@mmdx/studio/core`, which include every kind.

```ts
import { diffDiagrams, diffReport } from '@mmdx/studio/diff';

const diff = await diffDiagrams(before, after); // never rejects on bad input
const md = diffReport(diff, { format: 'markdown' });
```

### `@mmdx/studio`

The package root and `@mmdx/studio/studio` are the same entry.

| Group | Exports | Documented in |
|---|---|---|
| Elements and classes | `MmdxStudioElement` (`<mmdx-studio>`), `DiagramStudio` | [Studio](/components/studio) |
| Functions | `defineStudio(name?)` | [Studio](/components/studio) |
| | `encodeHash`, `decodeHash` | [Adapters](/api/adapters#share-links) |
| | `configure`, `registerThemes`, `registerBuiltinThemes` | [Configuration](/api/configuration) |
| Types | `StudioOptions`, `ExampleInfo` | [Studio](/components/studio) |
| | `Config` | [Configuration](/api/configuration) |

### `@mmdx/studio/core`

Every export is documented on the [core](/api/core) page.

| Group | Exports |
|---|---|
| Parsing | [`parse`](/api/core#parse), [`detectType`](/api/core#detecttype), [`cleanLabel`](/api/core#cleanlabel), [`encodeLabel`](/api/core#encodelabel) |
| Documents and metadata | [`splitSource`](/api/core#splitsource), [`joinSource`](/api/core#joinsource), [`metaToLines`](/api/core#metatolines), [`checkMetaLine`](/api/core#checkmetaline), [`pruneMeta`](/api/core#prunemeta), [`normalizeMeta`](/api/core#normalizemeta), [`mergeLegacySidecar`](/api/core#mergelegacysidecar), [`META_HEADER`](/api/core#meta-header) |
| Rendering | [`createContext`](/api/core#createcontext), [`renderSource`](/api/core#rendersource), [`renderDocument`](/api/core#renderdocument), [`renderToSvg`](/api/core#rendertosvg), [`standaloneSvg`](/api/core#standalonesvg), [`ALL_KINDS`](/api/core#all-kinds), [`serializeNode`, `serializeNodes`](/api/core#serializenode), [`fmt`](/api/core#fmt), [`createStaticMeasurer`](/api/core#createstaticmeasurer) |
| Themes | [`ThemeRegistry`](/api/core#themeregistry), [`BASELINE`](/api/core#baseline), [`BUILTIN_THEMES`](/api/core#builtin-themes), [`createDefaultRegistry`](/api/core#createdefaultregistry), [`validateTheme`](/api/core#validatetheme), [`migrateTheme`](/api/core#migratetheme), [`resolveColor`](/api/core#resolvecolor), [`relativeColor`](/api/core#relativecolor), [`createColorResolver`](/api/core#createcolorresolver) |
| Links | [`safeUrl`](/api/core#safeurl), [`DEFAULT_LINK_POLICY`](/api/core#default-link-policy) |
| Layers | [`layerDefs`](/api/core#layerdefs), [`hiddenByLayers`](/api/core#hiddenbylayers), [`DEFAULT_LAYER`](/api/core#default-layer) |
| Starters and outline | [`starterSource`](/api/core#startersource), [`outline`](/api/core#outline), [`summarize`](/api/core#summarize) |
| Diff | [`diffDiagrams`](/api/core#diffdiagrams), `diffDiagramsWith`, [`diffModels`](/api/core#diffmodels), [`ignoreFacets`](/api/core#ignorefacets), [`withoutStyle`](/api/core#withoutstyle), [`withLayoutOf`](/api/core#withlayoutof), [`mergeDiagrams`](/api/core#mergediagrams), [`diffReport`](/api/core#diffreport), [`unifiedDiff`](/api/core#unifieddiff), [`diffWords`](/api/core#diffwords), [`diffLines`](/api/core#difflines), [`mergeText`](/api/core#mergetext), [`annotate`](/api/core#annotate), [`changeKey`](/api/core#changekey), [`FACETS`](/api/core#facets), [`DIFF_COLORS`](/api/core#diff-colors) |
| Diff rendering | [`renderDiff`, `renderDiffWith`](/api/core#renderdiff), [`renderDiffToSvg`, `renderDiffToSvgWith`](/api/core#renderdifftosvg), [`diffSvg`](/api/core#diffsvg) |
| Model helpers | `ITEM_KINDS`, `itemKey`, `parseItemKey`, `diagnosticText`, `diag`, `isSupported` ([model types](/api/core#model-types)) |
| Types | [`DiagramDocument`](/api/core#diagramdocument), `DiagramMeta`, `CanvasMeta`, `ItemMeta`, `LayerMeta`, `PageSettings` ([metadata types](/api/core#metadata-types)); [`CoreContext`](/api/core#corecontext), [`PipelineOptions`](/api/core#pipelineoptions), [`Rendered`](/api/core#rendered), `Kinds`, [`RenderResult`](/api/core#renderresult), `GeometryIndex`, `SceneNode`, `TextMeasurer`, `FontSpec`; `ThemeFile`, `ThemeInfo`, `ResolvedTheme`; `StyleProps`, `ArrowType`, `Routing`, `Side` ([theme file](/api/theme-file)); [`LinkPolicy`](/api/core#linkpolicy), [`SafeUrl`](/api/core#safeurl); `StarterType`; [`DiagramDiff`, `ItemChange`, `FieldChange`](/api/core#diagramdiff), `ChangeFacet`, `ChangeStatus`, `DiffIgnore`, `DiffView`, `VersionInfo`, [`ReportOptions`](/api/core#reportoptions), `UnifiedDiffOptions`, `Merged`, [`DiffRenderOptions`](/api/core#diffrenderoptions), [`DiffSvgOptions`](/api/core#diffsvgoptions), [`DiffHide`](/api/core#diffhide), `DiffRendered`; the model types `Diagnostic`, `Rect`, `Point`, `CenterBox`, `ItemRef`, `ItemKey`, `ItemKind`, `DiagramType`, `SourceRange`, `Severity`, `DiagnosticFix`, `DiagramModel`, `SupportedModel`, `FlowchartModel`, `SequenceModel`, `ErModel`, `UnsupportedModel` and their item types ([model types](/api/core#model-types)) |

### `@mmdx/studio/adapters`

Every export is documented on the [adapters](/api/adapters) page.

| Group | Exports |
|---|---|
| Storage | [`memoryStorage`](/api/adapters#memorystorage), [`localStorageAdapter`](/api/adapters#localstorageadapter), [`preloadedStorage`](/api/adapters#preloadedstorage); types [`StorageAdapter`](/api/adapters#storageadapter), [`PreloadedStorageOptions`](/api/adapters#preloadedstorageoptions) |
| Themes | [`memoryThemeStore`](/api/adapters#memorythemestore), [`fetchThemeSource`](/api/adapters#fetchthemesource), [`localStorageThemeStore`](/api/adapters#localstoragethemestore), [`isLocalEdit`](/api/adapters#islocaledit); types [`ThemeSource`](/api/adapters#themesource), [`ThemeStore`](/api/adapters#themestore), [`SaveResult`](/api/adapters#saveresult) |
| Documents | [`memoryDocumentAdapter`](/api/adapters#memorydocumentadapter), [`httpDocumentAdapter`](/api/adapters#httpdocumentadapter); types [`DocumentAdapter`](/api/adapters#documentadapter), [`LoadResult`](/api/adapters#loadresult), [`DocumentSaveResult`](/api/adapters#documentsaveresult) |
| History | [`staticHistory`](/api/adapters#statichistory), [`httpHistoryAdapter`](/api/adapters#httphistoryadapter), [`contentId`](/api/adapters#contentid); types [`HistoryAdapter`](/api/adapters#historyadapter), [`StaticVersion`](/api/adapters#staticversion), [`VersionInfo`](/api/adapters#versioninfo) |
| Share links | [`encodeHash`](/api/adapters#encodehash), [`decodeHash`](/api/adapters#decodehash) |

### `@mmdx/studio/markdown`

Build-time plugins (Node) that turn mermaid code blocks into `<mmdx-viewer>` elements with a pre-rendered SVG inside. See the [markdown](/api/markdown) page.

| Group | Exports |
|---|---|
| Functions | `rehypeMmdx`, `markdownItMmdx`, `diagramHtml`, `scriptSafe` |
| Types | `MmdxMarkdownOptions` |

The run-time helper `upgradeMermaidBlocks` comes from `@mmdx/studio/viewer`.

### `@mmdx/studio/react`

Typed wrappers for React 18 and older; import the element entries you use as well. See the [React](/api/react) page.

| Group | Exports |
|---|---|
| Functions | `createReactWrappers(React)` |
| Types | `MmdxReactComponents` |

### `@mmdx/studio/worker-inline`

The render worker as one classic script, for pages that cannot start module workers from URLs (sandboxed iframes with an opaque origin). See the [worker-inline](/api/worker-inline) page.

| Group | Exports |
|---|---|
| Functions | `useInlineWorker()` |
| Constants | `workerSource` |

### `@mmdx/studio/themes/*`

JSON files, not code: `default-light.theme.json`, `default-dark.theme.json`, `github-light.theme.json`, `github-dark.theme.json`, `catppuccin-latte.theme.json`, `catppuccin-mocha.theme.json`, `rose-pine-dawn.theme.json`, `dracula.theme.json`, and the manifest `index.json`. See the [theme file](/api/theme-file) page.
