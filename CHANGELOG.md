# Changelog

All notable changes to `mmdx` (published as `@mmdx/studio` in 0.3.0). The project follows [semantic versioning](https://semver.org/); below 1.0, a minor version may change public API, listed under **Changed (breaking)**.

## 0.4.0 — 2026-11-14

Mindmaps, state diagrams, icons and images; the package is `mmdx`.

### Added

- Mindmaps and state diagrams in every component.
- All Mermaid flowchart shapes.
- Icons: icon packs, a built-in Tabler set, Font Awesome look-alikes.
- Images: image and icon nodes in flowcharts, state diagrams, mindmaps and sequence diagrams, and an image library from the host (`images`, `ImageStore`).
- Rich text labels, an emoji picker and animated connectors in the editor.
- Mermaid's full sequence and ER syntax, including ER subgraphs.
- Pinch to zoom on touch screens, and `wheel: 'zoom'`.
- Editor modules for hosts: `EditorModuleApi`, `EditorEventMap` and a guide, [Extending the editor](https://udamir.github.io/mmdx/guide/editor-modules).

### Changed

- Flowchart subgraphs no longer overlap (`layout: "legacy"` keeps the old layout).
- Sequence and ER diagrams are read and drawn as Mermaid does.
- Edits keep the Mermaid code as written.
- Faster on large diagrams: zoom, pan, dragging, diffs and History.
- Diff badges and legends show icons instead of letters.

### Changed (breaking)

- The package is `mmdx`: `@mmdx/studio/viewer` is `mmdx/viewer`, and so on.
- Stock Mermaid is not bundled: a bundled app passes `configure({ mermaid: () => import('mermaid') })`.
- The studio no longer keeps the diagram in the URL; `encodeHash` and `decodeHash` are removed.
- `CoreContext` needs `icons` and `imagePolicy`; `rehypeMmdx` may return a promise; model types include `mindmap` and `state`, and `DiagramType` is open.
- `EditorCore` is no longer exported; kernel types (`ViewCore`, `ViewActions`, `ViewEvents`, `ViewModule`) are trimmed and read-only to modules; `DiffSession` has one `shown` model.
- Removed: `ViewerOptions.rehydrate`, `Config.debug`, the editor actions `toggleHelp`, `editTable`, `gotoMetaLine`, `unlockAll`, `pasteStyle`, and the message key `te.inheritFont`.
- Editor panel storage keys changed: remembered panel sizes reset once.

### Fixed

- Long lines and statements no longer freeze the parsers.
- Mermaid syntax: quoted ER ids, `autonumber` options, quoted `}` in node data, `classDef default`, `</br>`.
- The diff reports changes it missed and ignores key order.
- The React wrapper passes `className`, `aria-*` and `data-*`.

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
