# Changelog

All notable changes to `@mmdx/studio` (named `mmdx` before 0.3.0). The project follows [semantic versioning](https://semver.org/); below 1.0, a minor version may change public API, listed under **Changed (breaking)**.

## Unreleased

### Added

- **Every Mermaid flowchart shape**: all 53 shapes of Mermaid 11.17's `A@{ shape: … }` and their aliases, 11.15–11.17's `datastore`, `folder`, `bucket`, `console`, `browser` and `person` included, drawn by mmdx from one shape catalogue — plus the sequence participant figures, the mindmap's default node, the state diagram's choice and note, and icon and image frames for the diagram types that use them later. A [Shapes](https://udamir.github.io/mmdx/guide/shapes) guide page lists them with previews.
- **Lossless node data**: `A@{ … }` is read like Mermaid reads it (double quotes protect `}` and `,`, blocks over several lines), every key is kept — `icon`, `img`, `w`, `h` and unknown ones — and edits rewrite only the values they change.
- **Shape name warnings**: an unknown shape name (`flow.unknown-shape`) and a name Mermaid rejects such as `lean_r` (`flow.shape-name`, with a fix that writes the short name).
- **`flow.meta-shape`**: the editor's code panel lists flowchart shapes kept only in metadata (files of 0.1–0.3), with a fix that writes them to the code.
- A Storybook story with every shape next to stock Mermaid's drawing of it.

### Changed (breaking)

- **`<mmdx-studio>` keeps no diagram in the URL**: no `#d=…` in the address bar and no Share button; `persist` takes only `local`.
- **`encodeHash` and `decodeHash` are removed** from `@mmdx/studio` and `@mmdx/studio/adapters`.
- **`Kinds` is the diagram types' view kinds by type** (`ALL_KINDS.flowchart`, …) instead of `{ parsers, renderers }`; the `…With` functions take it as before.
- **`NodeShape` is a shape catalogue id** (`ShapeId`): the 17 former names plus Mermaid's short names for the others; `queue`, which no parser produced, is gone (the name reads as the horizontal cylinder). `FlowchartModel` has `statements` (the code offsets the editing ops splice), and a node its `@{…}` data (`data`, `blocks`).

### Changed

- **The editor loads diagram types on demand**: the code of a type arrives the first time a document of that type is shown (the editor's first chunk is about 15 kB smaller); `whenLoaded()` also waits for it.
- **Each diagram type plugs in through one set of kinds** (view, diff, ops and edit), so adding a type no longer means edits all over the code base ([Contributing → Adding a diagram type](https://udamir.github.io/mmdx/guide/contributing#adding-a-diagram-type)).
- **The editor writes shapes to the Mermaid code**: the shape picker, Properties and the Shapes menu write a bracket (`A{"…"}`) or, for shapes without one, a separate `A@{ shape: lin-cyl }` statement after the graph's statements (Mermaid Chart's style), so the file shows the same shapes in stock Mermaid. Metadata `shape` is left for shapes Mermaid lacks and for nodes whose preset draws another shape. Shapes older files keep in metadata move to the code when the node is edited or through the `flow.meta-shape` fix, never on a plain save.
- **Connectors end on a shape's outline** (the slopes of a diamond or hexagon, a circle, a document's wave) instead of its box; the editor's ports and magnets and the diff's highlight frames follow the outline too.
- **Relabelling, reconnecting and deleting keep the code as written**: node data, edge lengths and styles, chains, `&` groups, `:::` classes and edge ids stay; a statement is split only where an edit breaks it apart.
- **One list of shapes**: the shape picker (now every flowchart shape, by category), Properties, the theme editor's shape tabs and the Shapes menu read the catalogue; a theme's `nodeShapes` may name a shape by any of its names (`cyl`, `lean-r`).
- **`@{ shape: f-circ }`, `sm-circ`, `fr-circ` and `lin-cyl` look like Mermaid's**: they were drawn as a plain circle or cylinder.

### Fixed

- An unknown `@{ shape }` name is reported instead of silently becoming a rectangle; `notch-rect` and the other hyphenated names Mermaid documents are read.
- A `}` or `,` inside a quoted `@{ label: "…" }` no longer ends the node data; single-quoted labels are read.

## 0.3.0 — Hooks for sandboxed hosts

Hooks for hosts that embed mmdx in sandboxed iframes (no `allowfullscreen`, no `localStorage`, no fetches, no module workers from URLs).

### Added

- **Host full screen** for the viewer: a `fullscreen` property (`HostFullscreen`) and a cancelable `mmdx-fullscreen-request` event; `setControls()` changes the controls at run time.
- **`preloadedStorage(read, write)`**: a `StorageAdapter` over an async key-value store.
- **`registerThemes(files)`** and **`registerBuiltinThemes()`**: register bundled theme files without fetching.
- **`starterSource(type)`**: the starting source of a new flowchart, sequence or ER diagram.
- **`@mmdx/studio/worker-inline`**: `useInlineWorker()` starts the render worker from a `blob:` URL; `setWorkerUrl` takes the worker type.
- **Editor**: `setSource` passes `fit` and `markSaved` through (restore a draft as unsaved changes); `whenLoaded()` and the `mmdx-load` event.
- **Hide the light / dark toggle** and keep the theme menu: the editor's `schemeToggle` feature, the viewer's `scheme-toggle` attribute.
- **Documentation portal** at [udamir.github.io/mmdx](https://udamir.github.io/mmdx/), with the studio demo at `/studio/` and Storybook at `/storybook/`.

### Changed

- **The package is `@mmdx/studio`** (`mmdx` cannot be published). Entries keep their paths (`@mmdx/studio/viewer`, …); the root is the studio entry.

### Fixed

- Apps that bundle mmdx build: the library's asset URLs are relative.
- Emoji and Persian or Indic text keep their joiners (ZWJ, ZWNJ).
- Long runs of spaces no longer freeze the editor or the parser.
- A node named `__v0`, `__v1`… is laid out like any other node.
- Diff change badges sit beside the item instead of covering it.
- Side by side in the editor's History is drawn like the editor.

## 0.2.0 — History and diff

The editor and the viewer get a History of the diagram, `<mmdx-diff>` compares any two versions, and a DOM-free diff API serves CI bots. Every component shares the editor's chrome.

### Added

- **`<mmdx-diff>` and `DiagramDiff`**: Before, Merged, After and Side by side views of two versions, with change filters, Code, history, change list and Layers panels, review tools and exports (PNG, SVG, `.mmdx`, patch, Markdown or JSON report).
- **History in the editor and the viewer**: a `history` property adds a History button to view, compare and (in the editor) restore older versions; `mmdx-history-*` events and `historySession`.
- **History adapters**: `staticHistory(versions)` and `httpHistoryAdapter(url)`.
- **Core diff API** (`@mmdx/studio/core`): `diffDiagrams`, `renderDiffToSvg`, `diffReport`, `unifiedDiff` and more.
- **Studio**: document versions (Save version, ⌘S), Diff mode, example previews and example histories.
- **The theme menu everywhere**, the editor's chrome in the viewer, and `compact` and `features` attributes.
- The clipboard carries content between documents; elements keep their state when moved in the DOM.
- React wrapper `MmdxDiff`.

### Changed

- The editor's ⋯ menu is gone; hosts use the `openFiles` and `autoLayout` actions.

### Changed (breaking)

- **`canvas.theme` left the `.mmdx` format**: the theme comes from the component (`theme` / `theme-dark`, the user's pick, or the default pair).
- Theme and light / dark are independent.
- `EditorModule` is `ViewModule<EditorCore>` (`install(scope)`).
- Remembered preferences use per-component keys.
- `element.instance` is `null` while the element is not connected.
- An attribute applies one option; removing it restores the default.

### Upgrading from 0.1

- Set the theme on the element or through the `theme` option of `renderToSvg` and the markdown plugins.
- Rewrite custom editor modules as `{ id, install(scope) { const core = scope.core; … } }`.
- Check for `element.instance === null` instead of `undefined`.

## 0.1.0 — Mermaid Studio

First release: `<mmdx-viewer>`, `<mmdx-editor>`, `<mmdx-theme-editor>`, `<mmdx-studio>`, the `.mmdx` format, themes, `@mmdx/studio/core` with server-side rendering, Markdown plugins and React wrappers.
