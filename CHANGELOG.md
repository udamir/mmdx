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
- **Image in the editor's tool dock** (`G`), beside Shapes, shown when the diagram type takes images. Text, icons, containers and connectors have no dock tools: they are made where you work — the Shapes menu's text block, the floating toolbar's and Properties' Icon, ⌘G, a node's connection handles.
- **The Shapes menu as Mermaid Chart lays it out**: the flowchart's shapes in Basic, Process and Technical, each once, six to a row, every section open without a scrollbar, no search field and no recently used row (the shapes Mermaid Chart lacks end the Technical section; the text block is a "T"); click or drag to add, Alt-click to give the selected nodes a shape. The floating toolbar's shape picker shows the same list, with the stacked style below it.
- **Icon picker** ("Choose an icon…"): search across the registered icon packs, a chip per pack (an unloaded pack loads when chosen), recent icons, a virtualised grid and the licence on hover. It sets the selected items' icon — an icon node's `icon` key, a `pack:name` token at the start of any other node's label — or removes it.
- **Image tool**: an image by URL, checked live against the image policy, adds a flowchart image node (`n5@{ img: "https://…", h: 200, w: 200, pos: "b" }`) or sets a selected node's image. Pictures are never embedded: dropped, pasted or chosen files go to the host's new `uploadImage` hook (an editor option and property), with an offer to reduce pictures over 1600 px; without it they are refused with a toast.
- **Emoji picker**: a ☺ button and `⌘;` / `Ctrl+;` while editing a label on the canvas, and in the Properties label fields — groups, recents, search by CLDR name and keyword, skin tones — inserting the emoji at the caret as plain text. The data (English, from emojibase, MIT) is a lazy chunk under 30 kB gzip, built by `tools/build-emoji.mjs`.
- **Icon and image controls**: the floating toolbar's Icon button (a dot marks an item with one), an Icon & image popover and an H field for icon and image nodes, and Icon and Image sections in Properties (frame, label position, width, height, aspect lock, fit), written to the node's data in the Mermaid code.
- **Flowchart icon and image nodes are drawn**: `@{ icon, form, label, pos, h, w }` as the icon in its frame (none, square, circle, rounded — painted with the node's fill and stroke, the icon in the code's stroke colour) with its caption above or below, sized as Mermaid sizes it; `@{ img, label, pos, w, h, constraint }` as the picture, at its own size when `w` and `h` are not given (the viewer and the editor lay the diagram out again once the browser knows it; 96 × 96 with an `image.size-unknown` note where it cannot), with the aspect lock and the layout metadata's `imgFit`. The selection box holds the asset and the caption; connectors end on the asset. See [Flowchart content](https://udamir.github.io/mmdx/guide/flowchart).
- **Icons in flowchart labels**: `fa:fa-car Car`, `fab:fa-github` and tokens of any registered pack are drawn as icons in node and edge labels and subgraph titles.
- **Markdown labels**: flowchart labels written as markdown strings (`` "`**bold** *italic*`" ``) are drawn with their emphasis and line breaks and wrap by themselves at 200 px (`markdownAutoWrap: false` and `flowchart.wrappingWidth` in the frontmatter change that). In the editor, Bold and Italic above the label being edited (`⌘B`, `⌘I`) wrap the selected words in `**` / `*`, and **Make rich text** turns a plain label into a markdown string.
- **More of Mermaid's flowchart syntax**: invisible links (`~~~`, layout only); edge ids (`A e1@--> B`, which become the edge's metadata id) and edge data — `animate` and `animation` (dashes flowing along the line, still in exports, stopped by reduced motion and by the new **Animate edges** view setting) and `curve`; `linkStyle … color` (the label's colour) and `interpolate`; the frontmatter's `flowchart.curve`; `classDef default`; several classes (`class a,b c1,c2`, `A:::c1:::c2`); classes on subgraphs; `click … "tooltip"` as a hover tooltip; the `title` drawn above the diagram; `accTitle` and `accDescr` (also the `accDescr { … }` block) as the SVG's `<title>` and `<desc>` and the viewer's accessible name and description; a repeated `subgraph X` adds to the first, as in Mermaid 12.1.
- **Files from Mermaid Chart** open as they are (node data in separate statements, `@{ shape: text}`, `style` on icon nodes, `layout: fixed` kept and ignored) and stay unchanged until edited.
- **Editing icon and image nodes**: the resize handle sizes the icon or picture and writes `h` / `w` into its node data; **Convert to icon node** (toolbar popover and Properties) makes a label's leading icon the node's.
- Two examples: Architecture with icons and Icons, images and rich labels.
- **Subgraph `direction`**: `direction LR` inside a flowchart subgraph lays out its contents that way, as Mermaid honours it (not when a link from outside reaches a node inside); it was read and ignored.
- **Reset positions in this group**: a subgraph's ⋮ menu, its right-click menu and Properties forget the hand-placed positions inside that subgraph only, and auto layout arranges its contents again while the subgraph keeps its place.
- **`canvas.layout: "legacy"`** (`%%@ canvas {"layout":"legacy"}`) keeps the earlier automatic layout of flowcharts with subgraphs, for one minor release.
- **Mindmaps**, a fourth diagram type drawn by mmdx: the viewer, the editor, `<mmdx-diff>`, History, `renderToSvg`, SSR and the markdown plugins draw Mermaid mindmaps instead of handing them to stock Mermaid (the viewer and the diff load their code the first time a page shows one). A [Mindmaps](https://udamir.github.io/mmdx/guide/mindmap) guide page describes them.
- **Mindmap syntax as Mermaid reads it** (11.17 and 12.2): indentation counted in characters (a tab is one), one root, `id[text]` and bare lines, quoted and markdown text over several lines, the seven shapes (default, `[ ]`, `( )`, `(( ))`, `)) ((`, `) (`, <code v-pre>{{ }}</code>, with the lexer's `id(text(` cloud and `(-text-)` default), `::icon(…)` and `:::classes` on the next line, comments; frontmatter `config.mindmap.colorBy` (`branch` / `depth`) and `maxNodeWidth` are read. Problems are reported as `mm.header`, `mm.syntax`, `mm.second-root`, `mm.dangling` (errors, as Mermaid fails on them), `mm.classdef` (a `classDef` or `style` line, which Mermaid draws as a node) and `mm.icon-not-drawn` (stock Mermaid does not draw `::icon()`; mmdx does).
- **A tidy-tree mindmap layout**: deterministic, never overlapping, the first-level branches split between the root's two sides by the height of their subtrees (clockwise in code order), or all to the right, or top down (`canvas.mindLayout`: `both`, `right`, `down`, and page presets of the same names); each subtree's layout is cached, so an edit lays out its own branch and its ancestors. It differs from stock Mermaid's force layout on purpose: a map keeps its shape while it is edited.
- **Mindmap drawing**: the root in the theme's look, default nodes as a label over an underline in the branch colour, shaped nodes filled with it, branches as curves tapering 11 / 8 / 5 / 3 px; colours by first-level branch (Mermaid's sections) or by depth; every label read as markdown (bold, italic, icon tokens) and wrapped at `maxNodeWidth`; `::icon()` drawn above the label; `:::class` drawn with the preset of that name; a folded branch with a +N badge.
- **Mindmap metadata**: `%%@ node <id>` lines with `side` (a first-level branch's side of the root), `dx` / `dy` (a nudge of a node and its subtree), `collapsed` (a folded branch), `section` (one of the theme's twelve branch colours), `img` (a picture above the label, through the image policy) and the usual style keys. A node without an id of its own (a bare line, brackets only, a repeated id) is `mm<k>` by its place in the code, and the editor carries its metadata along when lines move.
- **A `mindmap` theme section** in the eight built-in themes — `root`, `node`, `nodeShapes`, `nodePresets` (`idea`, `urgent`, `done`, `question`, `muted`, `plain`), `branch`, `sections` (`"0"`…`"11"`, palette references, so every theme recolours them) and `pagePresets` (`both`, `right`, `down`) — validated like the others and in the theme JSON schema. The theme editor has a Mindmap gallery (Root, Node, Branch, Sections, Page) and a Mindmap preview tab.
- **Mindmap editing**: outline keys — `Tab` adds a child, `Enter` a sibling, `⇧Tab` / `⌥←` and `⌥→` move a node out and in, `⌥↑` / `⌥↓` (and `⌘[` / `⌘]`) trade it with a sibling, the arrows walk the tree, `F2` edits, `Space` folds, `⇧Del` deletes a node and keeps its children; a `+` handle and a fold chevron on the selected node, the +N badge unfolds; dragging re-parents, reorders (with an insertion line) or moves a first-level branch to the other side of the root, Alt-drag copies; `⌘C` / `⌘V` / `⌘D` on branches (written ids made unique); pasting indented text, a Markdown list or a Mermaid mindmap onto a node makes a subtree. The Shapes menu and the shape picker write Mermaid's seven shapes in the code; icons are written as label tokens (`fa:fa-book Book`, which stock Mermaid draws), replacing an `::icon()` line; images go to metadata `img`. Page properties set Colours (by branch, or by depth in the frontmatter) and the layout. A new mindmap starts from `root((Topic))`, from the Mindmap card of the "Start a diagram" chooser or the studio's New menu.
- **Mindmaps in the diff and History**: nodes matched by written id, place in the tree, label and parent, then label; a new parent or sibling order is a layout change, label, shape, icon and picture are content, classes and looks are style; the merged picture keeps removed nodes in their old place and marks renamed labels word by word.
- The viewer's accessible name of a mindmap is "Mindmap: N nodes" (`label.mindmap`), and `outline()` gives its tree. New strings: `label.mindmap`, `type.mindmap`, `group.noMindmap`, `tools.mindShapes`, `tb.orderMind`, `page.mindLayout`, `page.colorBy`, `page.colorByBranch`, `page.colorByDepth`, `te.mindmap`, `te.item.root`, `te.item.branch`, `te.item.section`.
- Two examples: Mindmap: Product launch and Mindmap: Study notes, with their version histories.

### Changed (breaking)

- **`<mmdx-studio>` keeps no diagram in the URL**: no `#d=…` in the address bar and no Share button; `persist` takes only `local`.
- **`encodeHash` and `decodeHash` are removed** from `@mmdx/studio` and `@mmdx/studio/adapters`.
- **`Kinds` is the diagram types' view kinds by type** (`ALL_KINDS.flowchart`, …) instead of `{ parsers, renderers }`; the `…With` functions take it as before.
- **`CoreContext` has `icons`**, an icon registry (and the render context an icon lookup): `createContext()` and the components fill it; a context built by hand needs it (`createIconRegistry()`).
- **`rehypeMmdx`'s transformer returns a promise** when the page's diagrams reference icons that are not loaded yet (unified awaits it); without such icons it stays synchronous.
- **`CoreContext` has an `imagePolicy`** (and so does the render context): `createContext()` and the components fill it with `DEFAULT_IMAGE_POLICY`; a context built by hand needs it.
- **`NodeShape` is a shape catalogue id** (`ShapeId`): the 17 former names plus Mermaid's short names for the others; `queue`, which no parser produced, is gone (the name reads as the horizontal cylinder). `FlowchartModel` has `statements` (the code offsets the editing ops splice), and a node its `@{…}` data (`data`, `blocks`).
- **`DiagramType`, `DiagramModel`, `SupportedModel` and `GeometryIndex` include mindmaps** (`'mindmap'`, `MindmapModel`, `MindmapGeometry`), `ResolvedTheme` has a `mindmap` section and `Summary.key` can be `label.mindmap`: code that switches over every diagram type needs a mindmap case.
- **A flowchart edge's `id` is its own id when the code gives it one** (`A e1@--> B` is `e1`; `key` keeps `A->B`), and `EdgeLine` has `invisible` (`~~~`). A node with `icon` or `img` data has the shape `icon` or `image`, as Mermaid draws it.

### Changed

- **Automatic layout of flowcharts with subgraphs**: each subgraph is laid out as a container of its own and moves as one box, so subgraph frames no longer overlap each other or other nodes, nested subgraphs sit inside their parents with room for their titles, connectors go around subgraphs that hold neither of their ends, and a link to a subgraph ends on its frame (it went to the subgraph's first node). Plain Mermaid files with subgraphs, and nodes added later to diagrams laid out by hand, are placed differently than before; diagrams whose nodes all have stored positions look the same. In a diagram with some hand-placed items, new items go below the hand-placed ones of their own subgraph rather than below the whole diagram. `%%@ canvas {"layout":"legacy"}` keeps the earlier layout for one minor release.
- **The editor loads diagram types on demand**: the code of a type arrives the first time a document of that type is shown (the editor's first chunk is about 15 kB smaller); `whenLoaded()` also waits for it.
- **Each diagram type plugs in through one set of kinds** (view, diff, ops and edit), so adding a type no longer means edits all over the code base ([Contributing → Adding a diagram type](https://udamir.github.io/mmdx/guide/contributing#adding-a-diagram-type)). The edit kind gained `imageInMeta` (a type without image syntax keeps pictures in metadata) and `pageOptions` (page settings a type writes its own way, as Page properties selects), and item previews can differ per diagram type (`previewKind`).
- **Deleting in the editor carries positional metadata over**: the metadata of items numbered by their place in the code (mindmap nodes without an id) follows them when a deletion renumbers them.
- **The editor writes shapes to the Mermaid code**: the shape picker, Properties and the Shapes menu write a bracket (`A{"…"}`) or, for shapes without one, a separate `A@{ shape: lin-cyl }` statement after the graph's statements (Mermaid Chart's style), so the file shows the same shapes in stock Mermaid. Metadata `shape` is left for shapes Mermaid lacks and for nodes whose preset draws another shape. Shapes older files keep in metadata move to the code when the node is edited or through the `flow.meta-shape` fix, never on a plain save.
- **Connectors end on a shape's outline** (the slopes of a diamond or hexagon, a circle, a document's wave) instead of its box; the editor's ports and magnets and the diff's highlight frames follow the outline too.
- **Relabelling, reconnecting and deleting keep the code as written**: node data, edge lengths and styles, chains, `&` groups, `:::` classes and edge ids stay; a statement is split only where an edit breaks it apart.
- **One list of shapes**: the shape picker (now every flowchart shape, by category), Properties, the theme editor's shape tabs and the Shapes menu read the catalogue; a theme's `nodeShapes` may name a shape by any of its names (`cyl`, `lean-r`).
- **`@{ shape: f-circ }`, `sm-circ`, `fr-circ` and `lin-cyl` look like Mermaid's**: they were drawn as a plain circle or cylinder.
- **Emoji are measured as one glyph on the server**: the static measurer (SSR, `renderToSvg`, the markdown plugins) counts graphemes, so `👨‍👩‍👧`, `❤️`, `👍🏽` and flags are 1.15 em wide instead of one em per code point, and boxes with emoji no longer come out too wide. Text without emoji measures as before.
- **The shapes beyond the 17 former ones load on demand** in the viewer, History and `<mmdx-diff>`: their drawing code (about 4 kB gzip) arrives the first time a diagram shows one of them, and a page of flowcharts with the common shapes does without it; the editor loads it with its flowchart code. SSR, `renderToSvg`, the markdown plugins and the render worker draw every shape as before.
- **Flowchart links have Mermaid's length**: `---`, `===`, `-.-`, `-.->` and labelled links (`-- a -->`) were one rank too long, so automatic layouts of diagrams with them change (the dashes, equals or dots beyond the shortest form count, as in Mermaid).
- **Markdown strings are no longer reported** as shown as plain text (`flow.markdown-label` is gone), nor edge ids and edge data as unsupported (`flow.edge-id`).
- **The code that draws rich labels, icons and images loads on demand** in the viewer, History and `<mmdx-diff>`, with the shapes beyond the 17, the first time a diagram needs it; the editor, SSR, `renderToSvg`, the markdown plugins and the render worker have it at once.
- A `title` statement in a flowchart is drawn but reported (`flow.title-statement`: stock Mermaid fails on it), with a fix that moves it to the frontmatter.

### Fixed

- An unknown `@{ shape }` name is reported instead of silently becoming a rectangle; `notch-rect` and the other hyphenated names Mermaid documents are read.
- A `}` or `,` inside a quoted `@{ label: "…" }` no longer ends the node data; single-quoted labels are read.
- Diagrams rendered in the render worker (over 300 lines) use the component's link policy instead of the default one.
- A flowchart's `accDescr { … }` block no longer turns its lines into nodes, and the target of a `~~~` link is no longer lost.
- `classDef default` and classes on subgraphs are applied; `stroke-dasharray: none` clears a dash.
- `</br>` breaks a line in labels, as `<br>` does.
- Giving a label to a node defined only by its node data no longer writes it into the frontmatter.

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
