# Changelog

All notable changes to `@mmdx/studio` (named `mmdx` before 0.3.0). The project follows [semantic versioning](https://semver.org/); below 1.0, a minor version may change public API, listed under **Changed (breaking)**.

## Unreleased

### Added

- **Every Mermaid flowchart shape**: all 53 shapes of Mermaid 11.17's `A@{ shape: … }` and their aliases, 11.15–11.17's `datastore`, `folder`, `bucket`, `console`, `browser` and `person` included, drawn by mmdx from one shape catalogue — plus the sequence participant figures, the mindmap's default node, the state diagram's choice and note, and icon and image frames for the diagram types that use them later. A [Shapes](https://udamir.github.io/mmdx/guide/shapes) guide page lists them with previews.
- **Lossless node data**: `A@{ … }` is read like Mermaid reads it (double quotes protect `}` and `,`, blocks over several lines), every key is kept — `icon`, `img`, `w`, `h` and unknown ones — and edits rewrite only the values they change.
- **Shape name warnings**: an unknown shape name (`flow.unknown-shape`) and a name Mermaid rejects such as `lean_r` (`flow.shape-name`, with a fix that writes the short name).
- **`flow.meta-shape`**: the editor's code panel lists flowchart shapes kept only in metadata (files of 0.1–0.3), with a fix that writes them to the code.
- A Storybook story with every shape next to stock Mermaid's drawing of it.
- **Image policy**: `configure({ imagePolicy })`, the components' `ctx` and `createContext({ imagePolicy })` decide which image URLs a diagram may show — `https:` from any host by default; `http:`, embedded `data:` images (base64 PNG, JPEG, GIF, WebP, SVG or AVIF up to a size) and relative URLs only when the host enables them; `hosts` limits images to a list and `protocols: []` turns them off. A refused image is never written to the SVG: it is drawn as a placeholder and reported as an `image.blocked` warning with the reason. `checkImageUrl`, `safeImageUrl`, `DEFAULT_IMAGE_POLICY` and the `ImagePolicy` type are exported from `@mmdx/studio/core` ([Security → Image policy](https://udamir.github.io/mmdx/guide/security#image-policy)).
- **Images, inline icons and bold and italic text in the drawing**: the groundwork for image and icon nodes and Mermaid's markdown labels — images fitted into a box (contain, cover or stretch), icons inside a line of text, bold and italic words that wrap like plain text, and changed words that keep their styling in the diff. The diagram types start using them with the image and icon nodes.
- **Icon packs**: `configure({ iconPacks })` registers [Iconify JSON](https://iconify.design/docs/types/iconify-json.html) packs the way Mermaid's `registerIconPacks` takes them — `{ name, icons }` or `{ name, loader }`, the loader called once, on the first icon of the pack a diagram shows, and tried again 30 s after a failure — and the viewer, editor and diff take packs of their own (`iconPacks`). Diagrams name icons as `pack:name`: label tokens in every diagram type (`fa:fa-car Car`, `azure:computer-vision Vision`; a prefix is an icon only when its pack is registered, Font Awesome's always), icon nodes (`@{ icon: "logos:aws-ec2" }`) and mindmap `::icon(fa fa-book)`. Rendering stays synchronous: an icon still loading is an empty box of its size and the components render again when it arrives; an unknown one is a "?" placeholder with an `icon.unknown` warning. Monochrome icons take the item's colour, logos keep theirs. The diagram types draw them as they gain icon support (flowchart icon nodes and labels first).
- **A built-in icon set**: about 250 generic icons from Tabler Icons (MIT) under Tabler's own prefix, `tabler:` (people, devices, documents, data, network, security, status, time, money, communication, arrows, shapes, brands), in a chunk of its own loaded on first use (about 20 kB gzip); a host's full `tabler` pack replaces it, `configure({ builtinIcons: false })` turns it off. The licence is in `THIRD-PARTY-NOTICES`.
- **Font Awesome look-alikes**: `fa:fa-car`, `fab:fa-github` and about 350 other common Font Awesome names draw a built-in look-alike when no Font Awesome pack is registered, with an `icon.fa-fallback` note.
- **Stock Mermaid gets the same icons**: the fallback renderer and the editor's Plain Mermaid preview pass the packs, the built-in set included, to `mermaid.registerIconPacks` before rendering.
- **Icons on the server**: `renderToSvg` loads the icons a source references before it renders and takes `iconPacks`; `@mmdx/studio/core` exports `createIconRegistry` and `iconNamesOf`; the markdown plugins take `iconPacks` (the rehype plugin waits for icons a page needs) and `preloadIcons()` serves markdown-it. The render worker receives the icons it draws from the main thread.
- **`mmdx-icons`**: a command that builds an icon pack with Mermaid Chart's names (`azure:computer-vision`) from the official Azure, AWS and Google Cloud icon downloads (`npx mmdx-icons build --from <dir> --prefix azure --naming azure --out azure.json`), with naming tables per provider and an override list.
- An [Icons](https://udamir.github.io/mmdx/guide/icons) guide page, and a Storybook story of the Mermaid fallback drawing registered icons.
- **PNG export includes remote images**: each image is fetched (CORS, no credentials) and put into the PNG; one whose host does not allow it is a placeholder, with a toast and an `export.image-missing` warning.
- **The editor's insert dock**: Text (`T`), Image (`G`), Icons (`N`), Container (`B`) and Connector (`A`) join Shapes in the tool dock, each shown when the diagram type offers it — the flowchart's Text tool adds Mermaid's `text` shape, the sequence diagram's a note; the Connector tool connects a clicked source to a clicked target until Esc; the Container tool wraps the items inside a drawn frame (or the selection) in a subgraph or a box.
- **A categorised shape palette**: the Shapes menu lists every flowchart shape in Basic, Process, Technical and Annotation sections, with search over the shape's names, Mermaid names and aliases, the recently used shapes first, and Alt-click to give the selected nodes a shape; the floating toolbar's shape picker is a compact form of it.
- **Icon picker** ("Choose an icon…"): search across the registered icon packs, a chip per pack (an unloaded pack loads when chosen), recent icons, a virtualised grid and the licence on hover. From the dock it adds a flowchart icon node in Mermaid Chart's style (`n4["User"]` and `n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }`); for selected items it sets the icon — an icon node's `icon` key, a `pack:name` token at the start of any other node's label — or removes it.
- **Image tool**: an image by URL, checked live against the image policy, adds a flowchart image node (`n5@{ img: "https://…", h: 200, w: 200, pos: "b" }`) or sets a selected node's image. Pictures are never embedded: dropped, pasted or chosen files go to the host's new `uploadImage` hook (an editor option and property), with an offer to reduce pictures over 1600 px; without it they are refused with a toast.
- **Emoji picker**: a ☺ button and `⌘;` / `Ctrl+;` while editing a label on the canvas, and in the Properties label fields — groups, recents, search by CLDR name and keyword, skin tones — inserting the emoji at the caret as plain text. The data (English, from emojibase, MIT) is a lazy chunk under 30 kB gzip, built by `tools/build-emoji.mjs`.
- **Icon and image controls**: the floating toolbar's Icon button (a dot marks an item with one), an Icon & image popover and an H field for icon and image nodes, and Icon and Image sections in Properties (frame, label position, width, height, aspect lock, fit), written to the node's data in the Mermaid code.

### Changed (breaking)

- **`<mmdx-studio>` keeps no diagram in the URL**: no `#d=…` in the address bar and no Share button; `persist` takes only `local`.
- **`encodeHash` and `decodeHash` are removed** from `@mmdx/studio` and `@mmdx/studio/adapters`.
- **`Kinds` is the diagram types' view kinds by type** (`ALL_KINDS.flowchart`, …) instead of `{ parsers, renderers }`; the `…With` functions take it as before.
- **`CoreContext` has `icons`**, an icon registry (and the render context an icon lookup): `createContext()` and the components fill it; a context built by hand needs it (`createIconRegistry()`).
- **`rehypeMmdx`'s transformer returns a promise** when the page's diagrams reference icons that are not loaded yet (unified awaits it); without such icons it stays synchronous.
- **`CoreContext` has an `imagePolicy`** (and so does the render context): `createContext()` and the components fill it with `DEFAULT_IMAGE_POLICY`; a context built by hand needs it.
- **`NodeShape` is a shape catalogue id** (`ShapeId`): the 17 former names plus Mermaid's short names for the others; `queue`, which no parser produced, is gone (the name reads as the horizontal cylinder). `FlowchartModel` has `statements` (the code offsets the editing ops splice), and a node its `@{…}` data (`data`, `blocks`).

### Changed

- **The editor loads diagram types on demand**: the code of a type arrives the first time a document of that type is shown (the editor's first chunk is about 15 kB smaller); `whenLoaded()` also waits for it.
- **Each diagram type plugs in through one set of kinds** (view, diff, ops and edit), so adding a type no longer means edits all over the code base ([Contributing → Adding a diagram type](https://udamir.github.io/mmdx/guide/contributing#adding-a-diagram-type)).
- **The editor writes shapes to the Mermaid code**: the shape picker, Properties and the Shapes menu write a bracket (`A{"…"}`) or, for shapes without one, a separate `A@{ shape: lin-cyl }` statement after the graph's statements (Mermaid Chart's style), so the file shows the same shapes in stock Mermaid. Metadata `shape` is left for shapes Mermaid lacks and for nodes whose preset draws another shape. Shapes older files keep in metadata move to the code when the node is edited or through the `flow.meta-shape` fix, never on a plain save.
- **Connectors end on a shape's outline** (the slopes of a diamond or hexagon, a circle, a document's wave) instead of its box; the editor's ports and magnets and the diff's highlight frames follow the outline too.
- **Relabelling, reconnecting and deleting keep the code as written**: node data, edge lengths and styles, chains, `&` groups, `:::` classes and edge ids stay; a statement is split only where an edit breaks it apart.
- **One list of shapes**: the shape picker (now every flowchart shape, by category), Properties, the theme editor's shape tabs and the Shapes menu read the catalogue; a theme's `nodeShapes` may name a shape by any of its names (`cyl`, `lean-r`).
- **`@{ shape: f-circ }`, `sm-circ`, `fr-circ` and `lin-cyl` look like Mermaid's**: they were drawn as a plain circle or cylinder.
- **Emoji are measured as one glyph on the server**: the static measurer (SSR, `renderToSvg`, the markdown plugins) counts graphemes, so `👨‍👩‍👧`, `❤️`, `👍🏽` and flags are 1.15 em wide instead of one em per code point, and boxes with emoji no longer come out too wide. Text without emoji measures as before.
- **The shapes beyond the 17 former ones load on demand** in the viewer, History and `<mmdx-diff>`: their drawing code (about 4 kB gzip) arrives the first time a diagram shows one of them, and a page of flowcharts with the common shapes does without it; the editor loads it with its flowchart code. SSR, `renderToSvg`, the markdown plugins and the render worker draw every shape as before.

### Fixed

- An unknown `@{ shape }` name is reported instead of silently becoming a rectangle; `notch-rect` and the other hyphenated names Mermaid documents are read.
- A `}` or `,` inside a quoted `@{ label: "…" }` no longer ends the node data; single-quoted labels are read.
- Diagrams rendered in the render worker (over 300 lines) use the component's link policy instead of the default one.

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
