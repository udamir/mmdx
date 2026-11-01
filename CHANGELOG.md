# Changelog

All notable changes to `mmdx`. The project follows [semantic versioning](https://semver.org/); while it is below 1.0, a minor version may change public API, and such changes are listed under **Changed (breaking)**.

## 0.2.0 — History and diff

How a diagram changed, at a glance: the editor and the viewer get a History of the diagram, a new `<mmdx-diff>` component compares any two versions, and a DOM-free diff API serves CI bots. Every component now shares one look: the editor's tool dock, zoom bar, panels and theme menu.

### Added

- **`<mmdx-diff>` and `DiagramDiff`** (`mmdx/diff`): compares two versions of a flowchart, sequence or ER diagram item by item. Views: Before, Merged and After on one animated canvas, and Side by side with linked pan and zoom. The Merged view keeps removed items where they were, marks text changes word by word and draws an arrow from the old place of every moved item. Switching views, pairs or versions animates: moved items glide, new ones fade in, gone ones fade out, and the view glides to the new fit.
- **Change filters**: hide added or removed items, and ignore content, layout or style changes (Layout off draws the old version on the new layout, Style off draws both versions unstyled); Dim fades everything that did not change.
- **Diff panels**: the Code panel (the Mermaid code and the `%%@` metadata as a unified diff, narrowed to the selected change, in the editor's code style) and the version history stacked on the left, the change list on the right, and Layers; any combination can be open, and panels resize and remember their sizes.
- **Review tools**: J / K through the changes, the magic pen with strokes shared by every view, the zoom bar and help popup, full screen, keyboard shortcuts, links (a click selects the change, ⌘ / Ctrl-click opens the link), and light and dark chrome with `--mmdx-diff-*` tokens.
- **Export from the diff**: PNG and SVG of the current view with a legend, either version as `.mmdx` or portable `.mmd`, a unified patch (applies with `git apply`), and a change report in Markdown or JSON. `mmdx-export` is cancelable so hosts can upload instead of downloading.
- **History adapters** (`mmdx/diff`, `mmdx/adapters`): `staticHistory(versions)` and `httpHistoryAdapter(url)` (paged with `next` / `?cursor=`); write your own `{ list, load }` for GitLab, GitHub or any backend.
- **History in the editor**: give `<mmdx-editor>` a `history` (a `HistoryAdapter` or a list of versions) and its tool dock gets a History button (⇧H). It opens the version panel next to the Code panel, with the current version selected, and the diagram stays editable. On the History tab, an older version shows read-only, drawn by the editor itself: items can be selected and copied (paste them into the document later), Code and Layers stay, and Export exports that version. On the Compare tab, a version is compared with the current one on the editor's own canvas, with the panels kept as they were. Back (the pill at the top, Esc) returns to the current version; **Restore this version** (Edit mode) opens an older version as an undoable change. The working copy follows the document. No `mmdx/diff` is needed on the page: History's code loads on first use.
- **History in the viewer**: `controls="history"` with a `history` property: the same History, without editing and Restore.
- History events `mmdx-history-open`, `-close`, `-show`, `-compare`, `-version`, `-select`, `-view`, `-filters`, `-export`, `-restore`, `-error`; `editor.historySession` / `viewer.historySession` give the `<mmdx-diff>` methods while History is open; `toggleHistory(on?, { compare? })`.
- **Studio**: the editor gets the open document's versions — the example's bundled history and the versions recorded with **Save version** or ⌘S (browser storage, per document). **Diff** in the mode switch compares the newest change. Examples show a preview of each diagram, and a shared link to an example opens that example with its history.
- **Example histories**: every bundled example ships six versions (`examples/history/*.json`) covering added, removed and changed items across content, layout and style for flowchart, sequence and ER diagrams. Examples are `.mmdx` files and open at their newest version.
- **Core diff API** (`mmdx/core`): `diffDiagrams`, `diffModels`, `ignoreFacets`, `withoutStyle`, `withLayoutOf`, `mergeDiagrams`, `renderDiff`, `renderDiffToSvg` (any view, side by side with titles, SSR-ready), `diffSvg`, `diffReport` (Markdown / JSON), `unifiedDiff`, `diffWords`, `diffLines`, `mergeText`, `annotate`, `DIFF_COLORS`, and their types. The library still has no runtime dependencies.
- **The theme menu everywhere**: the editor, the diff and (with `controls="theme"`) the viewer have the light / dark toggle and a theme menu whose first entry, **Follow light / dark**, drops the pick. A pick is remembered per component kind.
- **The viewer has the editor's chrome**: tool dock, zoom bar with the `?` help popup, view parameters with `Export ▾`; the code view and view settings are side panels. Only the zoom bar loads with the viewer; every other piece loads when its control is on.
- A `compact` attribute on every element: the same chrome, smaller and icon-only (automatic on small hosts). `<mmdx-editor>` takes `theme`, `theme-dark` and `compact` attributes.
- A `features` attribute on `<mmdx-editor>` and `<mmdx-diff>`: the parts that are on, space-separated like the viewer's `controls` (`none` turns all off); the `features` property also takes that string.
- **The clipboard carries content**: a copied item can be pasted into a document that no longer has it (fresh ids, the source's looks).
- **Elements survive a move**: re-parenting an element (or a framework reordering a list) keeps its component, so the editor keeps its document, undo history, selection and an open History. Properties set before or after connecting are kept and apply to the live component; an editor removed for good and connected again starts from its last document.
- Panels and popups scroll with a thin scrollbar over their content.
- React wrapper `MmdxDiff` from `createReactWrappers(React)`. `mmdx/viewer` exports `VIEWER_MODULES`; `mmdx/viewer` and `mmdx/editor` export the `HistorySession` type.

### Changed

- The editor's ⋯ menu (Open…, Auto layout) is gone from its view parameters; hosts offer opening files and Auto layout where they want through the `openFiles` and `autoLayout` actions.
- The examples manifest entries may name a `history` file.

### Changed (breaking)

- **`canvas.theme` left the `.mmdx` format.** The theme belongs to the component: the host's `theme` / `theme-dark` attributes, else the user's pick, else Default Light or Default Dark following the chrome's light / dark scheme. Files that name a theme keep loading; the field is dropped and the next save writes the file without it. `pickTheme` and `renderToSvg` use the `theme` option only.
- **Theme and light / dark are independent**: the toggle changes the chrome only; picking a theme never writes the document and never flips the chrome.
- **`EditorModule`** is `ViewModule<EditorCore>`: `install(scope)` (the core is `scope.core`; the cleanup it returns still runs), `enabled(core)`, `css: string[]`, optional `when`, `after` and `load`.
- Remembered preferences move to per-component keys (`editor.ui`, `viewer.theme`, `diff.panels`, …).
- **`element.instance` is `null` while the element is not connected**, on every element; after a removal the component is destroyed a microtask later unless the element is connected again.
- Attributes apply one option each: a removed attribute sets its option back to the default, and an attribute set after a property of the same option replaces it. `<mmdx-viewer>` no longer writes `fit="width"` onto the host (`width` stays the default). `guard-unload="false"` turns the editor's unload guard off. Options read only on creation (`ctx`, the editor's `autosave` and `guard-unload`) warn once when changed on a live component.

### Upgrading from 0.1

- Set the theme on the element (`theme`, `theme-dark`) or through the `theme` option of `renderToSvg` and the markdown plugins where pages relied on a diagram's own theme.
- Rewrite custom editor modules as `{ id, install(scope) { const core = scope.core; … } }`.
- Remembered UI preferences (panels, light / dark, theme) start from their defaults once.
- Check for `element.instance === null` instead of `undefined`.

## 0.1.0 — Mermaid Studio

First release: `<mmdx-viewer>`, `<mmdx-editor>`, `<mmdx-theme-editor>`, `<mmdx-studio>`, the `.mmdx` format, themes, `mmdx/core` with server-side rendering, Markdown plugins and React wrappers.
