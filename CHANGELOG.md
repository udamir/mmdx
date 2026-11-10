# Changelog

All notable changes to `@mmdx/studio` (named `mmdx` before 0.3.0). The project follows [semantic versioning](https://semver.org/); below 1.0, a minor version may change public API, listed under **Changed (breaking)**.

## 0.4.0 — Mindmaps, state diagrams, icons and images

Two new diagram types, icons and images in every type but ER, an image library from the host, every Mermaid flowchart shape, and sequence and ER diagrams read and edited as Mermaid writes them.

### Added

- **Mindmaps**: drawn, edited (outline keys, folding, branch sides and colours) and compared in the viewer, the editor, `<mmdx-diff>`, History, `renderToSvg` and the markdown plugins; a `mindmap` theme section.
- **State diagrams**: composites, concurrency regions, choice, fork / join and notes, each composite laid out in its own direction; drawn, edited and compared everywhere; a `state` theme section.
- **Every Mermaid flowchart shape**: the 53 shapes of `A@{ shape: … }` and their aliases, written to the Mermaid code; the Shapes menu and the shape picker by category; connectors end on a shape's outline.
- **Icons**: icon packs (`configure({ iconPacks })`, Iconify JSON), a built-in Tabler set (`tabler:`), Font Awesome look-alikes for `fa:` names, the same packs for stock Mermaid and on the server, and the `mmdx-icons` command that builds Azure, AWS and Google Cloud packs with Mermaid Chart's names.
- **Images**: flowchart image and icon nodes (`@{ img }`, `@{ icon }`), image states with the same keys, pictures on mindmap nodes and sequence participants; the image policy (`configure({ imagePolicy })`) and `configure({ resolveUrl })`; PNG export includes remote images.
- **An image library**: the editor's `images` property takes the host's `ImageStore` (`list`, `get`, `put`, `delete`, `subscribe`; `memoryImageStore`, `httpImageStore`). The image tool has Library, Upload and URL tabs, and an image node's first toolbar item, **Change image**, offers From the library…, Upload…, By URL… and Icon….
- **Rich text labels**: markdown strings drawn with their emphasis; the toolbar's text menu sets bold, italic, underline and strikethrough.
- **Editor**: icon picker, emoji picker (`⌘;`), animated connectors (Off, Fast, Slow), Reset positions in this group.
- **Sequence diagrams**: Mermaid's 26 arrows and 8 participant types, participant link menus, icons on participants, `blockTags`, editing that keeps the code as written.
- **ER diagrams**: subgraphs, Mermaid's whole syntax, lossless relationship and alias editing.
- **Flowchart syntax**: invisible links, edge ids and animation, subgraph `direction`; files from Mermaid Chart open as they are.
- **`wheel: 'zoom'`**: the wheel zooms at the pointer (viewer, editor, `<mmdx-diff>`).
- Examples of each new type, and guide pages for flowchart content, shapes, icons, mindmaps, state, sequence and ER diagrams.

### Changed

- **Fit fills the canvas**: the diagram is zoomed to the whole canvas, under the floating panels.
- **Flowcharts with subgraphs** are laid out one container at a time, so frames no longer overlap; `%%@ canvas {"layout":"legacy"}` keeps the earlier layout for one minor release.
- **Sequence diagrams look as Mermaid draws them**: dotted messages are dashed and blocks show their kind.
- **ER diagrams are read as Mermaid reads them**, which changes what some files mean (a relationship label is one word or a quoted text).
- **An icon is an image's source**: flowchart shapes and states have no Icon button; ER diagrams draw no icons. Image sizes and Keep aspect ratio are in Properties.
- **Editing keeps the code as written**: node data, edge lengths, styles, chains, `&` groups and classes.
- **Faster on large diagrams**: zoom and pan are shown as a CSS transform; the editor loads diagram types, extra shapes and rich labels on demand.
- **Mermaid 12.2** is the development dependency; every edit is checked to parse in 12.2 and 11.17.

### Changed (breaking)

- **`<mmdx-studio>` keeps no diagram in the URL** (no `#d=…`, no Share button; `persist` takes only `local`), and `encodeHash` / `decodeHash` are removed.
- **`CoreContext` has `icons` and `imagePolicy`**: a context built by hand needs them (`createIconRegistry()`, `DEFAULT_IMAGE_POLICY`).
- **`rehypeMmdx`'s transformer returns a promise** when diagrams reference icons that are not loaded yet.
- **The model types grew**: `DiagramType` and the model and geometry unions include `mindmap` and `state`; `Kinds` is keyed by type; `NodeShape` is a shape catalogue id; `SequenceModel`, `ErModel` and `FlowchartModel` have new fields; a flowchart edge's `id` is its own id when the code gives one.

### Fixed

- ER ids Mermaid cannot read bare are written in quotes; relationship edits keep word cardinalities and aliases.
- Sequence: a rename keeps `@{…}` data and `create`; `autonumber off` and `autonumber 10 5` work.
- `@{…}` node data: a quoted `}` or `,` no longer ends it; an unknown shape name is reported.
- `classDef default` and classes on subgraphs apply; `</br>` breaks a line; `accDescr { … }` no longer becomes nodes.
- The render worker uses the component's link policy; `configure({ mermaid })` takes effect after a fallback render.

### Upgrading from 0.3

- Code that builds a `CoreContext` by hand adds `icons` and `imagePolicy`; code that switches over diagram types adds `mindmap` and `state`.
- Await `rehypeMmdx`'s transformer.
- Flowcharts with subgraphs lay out differently: positions saved in metadata stay; `layout: "legacy"` keeps the old automatic layout.

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
