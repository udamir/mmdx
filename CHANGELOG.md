# Changelog

All notable changes to `mmdx` (published as `@mmdx/studio` from 0.3.0 to 0.4.0). The project follows [semantic versioning](https://semver.org/); below 1.0, a minor version may change public API, listed under **Changed (breaking)**.

## 0.5.0 — 2026-11-14

The codebase audit: correctness and safety fixes, faster large documents, and the layers the components are built on.

### Added

- Editor modules: `scope.gesture`, `scope.painter`, `scope.area`, `scope.slot(name).mount`, listener options on `scope.canvas`, `when: { kind }` and `replaces`; `EditorModuleApi.docType`. A guide: [Extending the editor](https://udamir.github.io/mmdx/guide/editor-modules).
- `EditorEventMap`, the typed DOM events of `<mmdx-editor>`.
- `ThemeStore.listWithUsage?()`, an optional bulk read for the theme library.
- Pinch to zoom and pan on touch screens.
- A `doc.too-complex` error for a line or statement too long to read.
- `<mmdx-diff>` has the multi-link menu on ⌘-click.

### Changed

- Diff badges, the exported diff legend and the diff filters show icons instead of the letters `+ − C L S`.
- Exported dark diffs use the screen's translucent tints.
- `export.font-missing` is one `warning` with `params.fonts` in every component.
- Export names drop a URL's query and hash.
- `whenLoaded()` also waits for the editor modules of the document's type.
- `mmdx-selection` fires on every selection change (undo, redo, load), never on construction.
- `mmdx-history-version` of a viewer's version has `base` and `head` null; `<mmdx-diff>`'s `mmdx-view` names the tab.
- The viewer's root is a `group` labelled by the diagram; the `<svg>` is the `img`.
- `wheel` and `ui` are validated on the viewer and the diff.
- Fit keeps clear of the open panels and the tool dock.
- The editor's View mode follows links like the viewer.
- Editing keeps blank lines in moved blocks; "Convert to icon node" writes `form: "square"`; tab-indented blocks ungroup by one tab.
- ER highlights check `italic`, `fontFamily`, `fontSize` and `preset`; page colours resolve palette references.
- The diff reports subgraph class changes.
- Faster on large documents: dragging, code highlighting, diffs, the Order slider and History.
- Sources over 32 KiB render in the worker too.
- Library chunks are named after their diagram type.
- The viewer is about 10 kB gzip larger; the editor's base is smaller, the ER and sequence editing load with their type.

### Changed (breaking)

- The package is `mmdx` again: `@mmdx/studio/viewer` is `mmdx/viewer`, and so on; the root is the studio entry.
- Stock Mermaid is not bundled: a bundled app passes `configure({ mermaid: () => import('mermaid') })`.
- `ViewerOptions.rehydrate` and `Config.debug` are removed.
- The editor actions `toggleHelp`, `editTable`, `gotoMetaLine`, `unlockAll`, `pasteStyle` and `openIconPicker` are removed.
- `mmdx/editor` no longer exports `EditorCore`; modules see the core as `EditorModuleApi`.
- `DiffSession` has one `shown` model: `show(shown)` replaces `mode`, `versionsShown`, `setMode`, `applyMode` and `setVersionsShown`.
- Kernel state is read-only to modules: `ViewCore`'s lists are `KernelList` / `KernelSlot`, its signals `ReadSignal`s with owner setters; `DiagramEditor.core`'s services are getters.
- `ViewActions` and `ViewEvents` are trimmed; the editor's events moved to `EditorEvents`.
- `ViewModule`'s `install` and `enabled` are properties; a repeated module id is reported.
- `DiagramType` is open; `BuiltinType` names the five built-in types.
- Message keys renamed: `palette.cat.*`, `image.*`, `group.resetPositions`, `group.resetNone`; `te.inheritFont` removed.
- Editor panels: View mode shows View settings and Code view; panel storage keys changed (sizes reset once).
- React wrapper: a prop is set as a property when the element has that property.

### Fixed

- Long lines and statements no longer freeze the parsers or overflow the stack.
- `<!--` and `<script` in an inline source no longer break the page.
- A Markdown change report links versions only as the link policy allows.
- `configure({ mermaid: () => import('mermaid') })` works (the module's default export is used).
- Apps build without `mermaid` installed.
- Reset style, Style off and Auto layout keep pictures, frames, layers and mindmap offsets.
- Without styling, no mindmap node or sequence message is lost.
- State diagrams and mindmaps no longer get flowchart presets; Save as preset refuses `_base`.
- The portable export includes `_base` and per-shape styles.
- The diff reports picture, icon, frame, animation and curve changes, ignores key order, and errors when its type is not loaded.
- Paste style paints the whole selection; Space in a `<select>` no longer pans.
- A sequence diagram reads its frontmatter and widens for its title.
- 4- and 8-digit hex colours.
- Dropping an image on the studio no longer opens it as the document.
- `<mmdx-studio>` attributes changed after creation apply; properties set before definition are kept.
- React wrapper: `className`, `htmlFor`, `tabIndex`, `aria-*` and `data-*` are passed; removed props reset.
- Storage, labels, `interactive`, the pen's auto-erase and the theme editor's A4 preset.
- Listener leaks in History, the shape palette and menus.
- Untranslated strings in the toolbar, the canvas and History.

## 0.4.0 — 2026-11-10

Mindmaps, state diagrams, icons and images.

### Added

- Mindmaps and state diagrams in every component.
- All Mermaid flowchart shapes.
- Icons: icon packs, a built-in Tabler set, Font Awesome look-alikes.
- Images: image and icon nodes in flowcharts, state diagrams, mindmaps and sequence diagrams, with the same keys and editing.
- Image library from the host: the `images` property (`ImageStore`). The toolbar's Change image opens the image tool with Library, Upload, URL and Icon tabs.
- Rich text labels, an emoji picker and animated connectors in the editor.
- Mermaid's full sequence and ER syntax, including ER subgraphs.
- `wheel: 'zoom'`.

### Changed

- Fit fills the whole canvas.
- Flowchart subgraphs no longer overlap (`layout: "legacy"` keeps the old layout).
- Sequence and ER diagrams are read and drawn as Mermaid does.
- An icon is an image's source: no Icon buttons; ER diagrams have no icons.
- Edits keep the Mermaid code as written.
- Faster zoom and pan on large diagrams.

### Changed (breaking)

- The studio no longer keeps the diagram in the URL; `encodeHash` and `decodeHash` are removed.
- `CoreContext` needs `icons` and `imagePolicy`.
- `rehypeMmdx` may return a promise.
- Model types include `mindmap` and `state`.

### Fixed

- Quoting of ER ids, `autonumber` options, quoted `}` in node data, `classDef default`, `</br>`.

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
