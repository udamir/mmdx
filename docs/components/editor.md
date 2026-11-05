# `<mmdx-editor>`

The visual editor for flowcharts, sequence diagrams, ER diagrams, mindmaps and state diagrams. Everything done on the canvas is written back to the Mermaid code, and code edits update the canvas live; layout and looks are stored as `%%@` comment lines in the same text. It loads and saves through a document adapter (with conflict detection and live updates), or works on a value you set, and shows the document's History when you give it the versions.

```ts
import '@mmdx/studio/editor'; // <mmdx-editor>, DiagramEditor
```

<MmdxDemo kind="editor" example="simple-flow" history />

## Usage

With an adapter, the editor loads the document, saves it with the Save button and ⌘S, detects conflicts and applies remote updates:

```ts
import '@mmdx/studio/editor';
import { httpDocumentAdapter } from '@mmdx/studio/adapters';

const editor = document.querySelector('mmdx-editor')!;
editor.adapter = httpDocumentAdapter('/api/diagrams/architecture.mmdx'); // GET / PUT with If-Match
editor.addEventListener('mmdx-dirty', (e) => setUnsaved(e.detail.dirty));
```

```html
<mmdx-editor guard-unload style="height: 640px"></mmdx-editor>
```

Without an adapter, set `value` (or a child `<script type="text/mermaid">`) and read changes from `mmdx-change`:

```ts
editor.value = 'flowchart LR\n  a --> b';
editor.addEventListener('mmdx-change', (e) => store.save(e.detail.source));
```

Write your own adapter for any backend:

```ts
import type { DocumentAdapter } from '@mmdx/studio/editor';

const adapter: DocumentAdapter = {
  load: async () => api.get(id),                                     // { source, name?, version? }
  save: async (source, { version }) => api.put(id, source, version), // { version? } or { conflict: { source, version } }
  subscribe: (cb) => api.watch(id, cb),                              // optional: (source, version) => void; returns an unsubscribe
};
```

The built-in adapters are `httpDocumentAdapter(url)` and `memoryDocumentAdapter(source, name)` (from `@mmdx/studio/editor` and `@mmdx/studio/adapters`). Without custom elements, mount `DiagramEditor`:

```ts
import { DiagramEditor } from '@mmdx/studio/editor';

const editor = new DiagramEditor(host, { value: source, features: { pen: false }, name: 'architecture' });
editor.setSource(next, { history: 'push' });
editor.destroy();
```

Recipes:

```ts
// save yourself instead of through an adapter
editor.addEventListener('mmdx-save', async (e) => {
  e.preventDefault();
  await api.put(id, e.detail.source);
  editor.instance?.markSaved(e.detail.source);
});

// restore a draft as unsaved, undoable changes once the adapter's document is in
await editor.whenLoaded();
if (draft) editor.setSource(draft, { history: 'push', markSaved: false });

// a reduced editor: canvas and code only
editor.setAttribute('features', 'code-panel help');
```

## Attributes and properties

Each attribute sets the `EditorOptions` option of the same name in camelCase (`read-only` → `readOnly`, `guard-unload` → `guardUnload`, `theme-dark` → `themeDark`); `new DiagramEditor(host, options)` takes every option. The Property column lists the element's own properties.

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| — | `adapter` | `DocumentAdapter` | — | `{ load, save, subscribe? }`: the Save button, ⌘S, the conflict dialog and live updates. Setting another adapter loads its document |
| — | `value` | `string` | `''` | The source when there is no adapter. Reading it returns the current source |
| `read-only` | `readOnly` | `boolean` | `false` | View mode only: no editing, links open on click |
| `features` | `features` | `Partial<EditorFeatures>` or `string` | all on except `open` | The parts that are on. The attribute (and a string property) lists them like the viewer's `controls` (`features="pen code-panel layers"`, or `none`); the object turns parts off. See [Features](#features) |
| — | `history` | `HistoryAdapter \| readonly StaticVersion[] \| null` | — | The document's versions, newest first (`[{ id, message?, author?, date?, source }]`): the tool dock gets a History button |
| — | `panels` | `{ code?, properties?, layers? }` | remembered, else all open | Which side panels are open |
| — | `storage` | `StorageAdapter` | `localStorage` (`mmdx.` keys), else in memory | Where UI preferences are kept (panels, light / dark, theme pick); never the document. `memoryStorage()`, `localStorageAdapter()` and `preloadedStorage(read, write)` come from `@mmdx/studio/adapters` |
| `autosave` | — | `number \| false` | off | Debounced save through the adapter, in ms (`autosave` without a number: 1500, `false`: off). Read when the editor is created |
| `guard-unload` | — | `boolean` | `false` | Ask before leaving the page with unsaved changes. Read when the editor is created |
| `name` | — | `string` | `diagram` | File name stem of exports; an adapter's `load()` result may set it with `name` |
| `theme` | — | `string` | Default Light / Default Dark | The diagram theme (the user's pick in the theme menu wins while the page is open) |
| `theme-dark` | — | `string` | — | The theme while the chrome is dark; `auto` picks the dark theme linked to `theme` |
| `ui` | — | `'light' \| 'dark' \| 'auto'` | `auto` | Chrome colour scheme |
| `compact` | — | `boolean \| 'auto'` | `auto` | The compact chrome (smaller, icon-only); automatic on small hosts |
| — | `modules` | `readonly EditorModule[]` | `DEFAULT_MODULES` | The editor's feature modules (advanced: add or replace modules) |
| — | `themeSource` | `ThemeSource` | `configure({ themeSource })` | Where themes the page has not loaded come from |
| — | — | `toolbar: 'floating' \| 'none'` | `floating` | `DiagramEditor` option, read when the editor is created; `none` turns off the floating style toolbar |
| — | — | `ctx: Partial<CoreContext>` | the shared context | `DiagramEditor` option, read when the editor is created |
| — | — | `iconPacks: IconPack[]` | — | `DiagramEditor` option: icon packs of this editor over the shared ones (see [Icons](/guide/icons#registering-packs)); read when the editor is created |
| — | `uploadImage` | `(file: File) => Promise<{ url: string }>` or `null` | `null` | Uploads a picture dropped, pasted or chosen in the image tool and returns the URL the image references (throw to refuse: the message shows as a toast). Without it images are added by URL only. See [Images](#images) |

Read-only properties of the element: `instance` (the `DiagramEditor`, `null` while not connected), `dirty` (unsaved changes) and `historySession` (while History is open).

## Methods

| Method | Description |
|---|---|
| `getSource(): string` | The current source (Mermaid with its `%%@` lines) |
| `setSource(src: string, opts?: SetSourceOptions): void` | Replaces the document. `history`: `'reset'` (default, a new undo history) or `'push'` (an undoable change); `fit` (default `true`): fit the view to it; `markSaved` (default `true`): `false` keeps it as unsaved changes. A gesture in flight is cancelled first. Before the element is connected, the source becomes its initial value |
| `whenLoaded(): Promise<void>` | Resolves once the document is in: at once without an adapter, else when the adapter's latest load finished (after `mmdx-load`), and once the editor code of the document's diagram type has loaded (each type loads on demand, the first time a document of that type is shown); rejects when that load failed or the element is not connected |
| `save(): Promise<SaveOutcome>` | Saves through the adapter: `'saved'`, `'cancelled'` (`mmdx-save` was cancelled), `'conflict'`, `'failed'` or `'no-adapter'` |
| `undo(): void`, `redo(): void` | Undo and redo; a gesture in flight is cancelled first |
| `select(items: ItemRef[]): void` | Selects items, e.g. `[{ kind: 'node', id: 'api' }]` |
| `focusCode(line: number): void` | Opens the Code panel at a 1-based line of the Mermaid code |
| `exportAs(kind: 'mmdx' \| 'mmd' \| 'svg' \| 'png'): Promise<void>` | Exports (fires the cancelable `mmdx-export`, then downloads) |
| `fit(): void` | Fits the diagram into the view |
| `plainMermaid(): Promise<void>` | Shows the diagram rendered by stock Mermaid (what GitHub or YouTrack show) in a dialog; needs `mermaid` |
| `toggleHistory(on?: boolean, opts?: { compare?: boolean }): void` | Opens or closes History (with a `history`); `compare` opens it on the newest change compared |

`DiagramEditor` has the same methods, and also:

| Member | Description |
|---|---|
| `adapter`, `history`, `readOnly` | Get and set, as on the element |
| `setMode(mode: 'edit' \| 'view'): void` | Switches between Edit and View mode |
| `markSaved(source?: string): void` | Marks the current source (or `source`) as saved: `dirty` is false until the document changes again |
| `dirty: boolean` | Unsaved changes |
| `fileName: string` | Get and set the base name of exports |
| `theme: string` | The id of the theme the diagram is shown in (the host's, the user's pick or the default) |
| `redraw(): void` | Repaints the document and the panels (after a theme was edited elsewhere) |
| `setUi(ui: 'light' \| 'dark' \| 'auto'): void` | Sets the chrome scheme |
| `historySession: HistorySession \| null` | The open History's session (the `<mmdx-diff>` methods) |
| `core: EditorCore`, `store: DocStore` | The editor core and the document store (advanced) |
| `destroy(): void` | Cancels the autosave, unsubscribes from the adapter and removes the component |

## Events

All events bubble and are composed.

| Event | Detail | Cancelable | When |
|---|---|---|---|
| `mmdx-load` | `{ source: string, version: string \| null }` | no | The adapter's document is in (after every load from the adapter) |
| `mmdx-change` | `{ source: string, reason: 'op' \| 'code' \| 'undo' \| 'redo' \| 'load' \| 'remote' }` | no | The document changed |
| `mmdx-dirty` | `{ dirty: boolean }` | no | After every change, with the unsaved state |
| `mmdx-op` | `{ type: string, code?: string }` | yes | Before every edit is committed (`code`: the new Mermaid code, when it changes). Cancel it to veto the edit; it is rolled back |
| `mmdx-selection` | `{ items: ItemRef[] }` | no | The selection changed |
| `mmdx-save` | `{ source: string }` | yes | Save was asked for (button, ⌘S, `save()`, autosave). Cancel it to save yourself |
| `mmdx-saved` | `{ source: string, version?: string }` | no | The adapter saved the document |
| `mmdx-conflict` | `{ mine: string, theirs: string, version: string }` | no | The adapter reported a conflict; the conflict dialog opens |
| `mmdx-export` | `{ kind, name: string, data: string \| Blob, type: string }` | yes | Before an export downloads. Cancel it to upload instead |
| `mmdx-link` | `{ href: string, id: string \| null }` | yes | A link is clicked in View mode. Cancel it to route the link yourself |
| `mmdx-ui` | `{ ui: 'light' \| 'dark' }` | no | The user switched the light / dark toggle |
| `mmdx-fullscreen-request` | `{ enter: boolean }` | yes | Before the full-screen button enters or leaves full screen |
| `mmdx-fullscreen` | `{ active: boolean }` | no | Full screen started or ended |
| `mmdx-error` | `{ diagnostics: Diagnostic[] }` | no | A load, save or export failed, or fonts were not embedded into a PNG |
| `mmdx-history-open`, `mmdx-history-close` | `{}` | no | History opened or closed |
| `mmdx-history-show` | `{ shown: 'none' \| 'version' \| 'compare' }` | no | What History shows changed |
| `mmdx-history-compare`, `-version`, `-select`, `-view`, `-mode`, `-filters`, `-error` | as `<mmdx-diff>`'s `mmdx-compare`, `mmdx-version`… | no | The History panel's comparison, as on [`<mmdx-diff>`](/components/diff) |
| `mmdx-history-export` | `{ kind, name, data }` | yes | An export from a comparison |
| `mmdx-history-restore` | `{ id: string, source: string }` | yes | Before **Restore this version** replaces the document |

## Features

`features` turns parts of the editor on and off. The object form is merged with the defaults, so it only needs the parts to turn off (or `open` to turn on); the attribute and the string form list the parts that are on, in kebab-case or camelCase (`code-panel` or `codePanel`), and everything not listed is off (`exportFormats` keeps its default). Changing features reinstalls the modules in place; an open History stays.

```ts
editor.features = { pen: false, export: false };   // all on except these
editor.features = 'code-panel properties layers';  // only these
```

| Key | Default | Turns on |
|---|---|---|
| `codePanel` | `true` | The Code panel (left), with the Mermaid code and its problems |
| `metadataTab` | `true` | The Metadata tab of the Code panel (the `%%@` lines) |
| `properties` | `true` | The Properties panel (right): fill, border, text, font, shape, arrows, line shape, presets… |
| `layers` | `true` | The Layers panel (right; View settings in View mode) |
| `pen` | `true` | The presenting pen |
| `copyStyle` | `true` | Copy and paste a style (⌘⌥C / ⌘⌥V) |
| `styleToolbar` | `true` | The floating style toolbar over the selection |
| `pageToolbar` | `true` | The page toolbar, shown while the page is selected |
| `autoLayout` | `true` | The `autoLayout` action: forget the manual positions of the whole diagram (hosts offer it through `editor.instance.core.run('autoLayout')`) |
| `plainMermaid` | `true` | `plainMermaid()`: the diagram rendered by stock Mermaid in a dialog |
| `open` | `false` | Opening files: dropping `.mmdx`, `.mmd`, `.md` (its first Mermaid block), `.txt` or a `.json` layout sidecar on the canvas, and the `openFiles` action |
| `themePicker` | `true` | The theme menu in the view parameters |
| `schemeToggle` | `true` | The light / dark toggle next to the theme menu; turn it off when the host sets `ui` |
| `export` | `true` | Export in the view parameters, and `exportAs()` |
| `exportFormats` | `['mmdx', 'mmd', 'svg', 'png']` | The export formats offered (object form only) |
| `help` | `true` | The `?` help button and popup |
| `fullscreen` | `true` | The full-screen button on the zoom bar |
| `history` | `true` | The History button (shown when the editor has a `history`) |

## Panels and tools

- **Tool dock** (left): Pointer (V), the [insert dock](#insert-dock) — Shapes (S; Table in an ER diagram) and Image (G) — Hand (H), the pen (P), the Code (C), Properties (I) and Layers (L) panel toggles, History (⇧H), and Undo / Redo. Edit-only tools hide in View mode.
- **Code panel** (left): the Mermaid code, editable, with live parsing and its problems; the Metadata tab shows the `%%@` lines. `focusCode(line)` opens it at a line.
- **Properties** and **Layers** (right): the selected items' style, presets and stacking; the diagram's layers. In View mode the right panel is View settings.
- **Floating style toolbar** over the selection, and the **page toolbar** while the page is selected.
- **Zoom bar** (bottom right) with fit, the `?` help and full screen; **view parameters** (top right) with Export, the theme menu and the light / dark toggle.

`panels` sets which side panels are open (`{ code, properties, layers }`); the user's choice is remembered in `storage`.

## Auto layout

Items without a stored position are placed by the automatic layout. In a flowchart, each subgraph is laid out as a container of its own: its contents in the subgraph's own `direction` (as Mermaid honours it — not when a link from outside reaches a node inside), then the subgraph moves as one box in its parent, so subgraphs never overlap and connectors do not cross a subgraph that holds neither of their ends (they go around it). A connector to a subgraph ends on its frame.

Moving an item by hand pins the auto-placed ones where they are and stores their positions, and from then on the diagram keeps them. When some items have stored positions and others do not, the rules apply per subgraph:

- A subgraph whose contents are all auto-placed is laid out as a unit, wherever it is.
- A subgraph with hand-placed contents keeps them; its new, auto-placed items go below them, and its frame grows around everything inside.
- A subgraph with a fixed frame (resized by hand) keeps its frame, and its contents are laid out inside it.

**Auto layout** (the `autoLayout` action) forgets every position of the diagram. **Reset positions in this group** — in a subgraph's ⋮ menu on the floating toolbar, its right-click menu and its Properties — forgets the positions inside one subgraph only (its nodes, nested subgraphs and the bend points of the connectors inside), and the layout arranges its contents again; the subgraph keeps its place (its top-left is stored, as `x` / `y` without a size), and everything outside it stays as it is. It is greyed out when nothing inside the subgraph has a stored position. Both are one undo step.

Files laid out before the compound layout can keep the earlier layout for one more minor release: `%%@ canvas {"layout":"legacy"}` (see [the .mmdx format](/guide/mmdx-format#line-kinds)).

## Insert dock

The tools below Pointer add things to the diagram. Each diagram type offers what it can hold; a button it does not offer is hidden.

| Button | Key | Does | Flowchart | Sequence | ER | Mindmap | State diagram |
|---|---|---|---|---|---|---|---|
| Shapes | `S` | The [shape palette](#shapes) | Every Mermaid shape, by section | Participants, notes, blocks | Table presets | The 7 mindmap shapes, as a child of the selected node | State, start, end, choice, fork, join, composite state, note |
| Image | `G` | Drag it onto the canvas (or click it: the middle) for an [image](#images) with the placeholder | An image node | — | — | A node with a picture (metadata `img`) | A state with a picture (metadata `img`) |

Everything else is made where you work, without a dock tool: a text block is a shape of the Shapes menu (the "T"), an icon is set on the selected items from the floating toolbar or Properties ([icons](#icons)), a container wraps the selection with ⌘G, and a connector is drawn from a node's connection handles. The tooltips and the `?` popup show the keys. The pickers load the first time one opens.

### Shapes

The palette lists the flowchart's shapes as Mermaid Chart lays them out — Basic, Process and Technical, six to a row, each shape once — as previews drawn by the shape catalogue, with a tooltip naming the shape and its Mermaid name, or "mmdx only". The shapes Mermaid Chart lacks (`datastore`, `folder`, `bucket`, `console`, `browser`, `person`, the mindmap's `cloud` and `bang`, `note`, `choice`) end the Technical section. Every section is open at once, without a scrollbar; there is no search field and no recently used row.

Click a shape to add it in the middle of the canvas, or drag it where it goes (into a subgraph to put it there). With nodes selected, **Alt-click** gives them that shape instead of adding a node. A new shape takes the default style; give it a preset afterwards from the floating toolbar or Properties. The floating toolbar's shape picker shows the same list, with the stacked style (single, stacked, double) below it; **Reset style** (⋮) clears it with the item's other style values. See [Shapes](/guide/shapes) for how shapes are written to the code.

### Icons

**Choose an icon…** searches every registered icon pack — the built-in Tabler set, and the packs your page registers (`configure({ iconPacks })`, see [Icons](/guide/icons)). A chip per pack narrows the search; a pack that is registered but not loaded yet loads when you choose its chip. Recently used icons come first; hovering or focusing an icon shows its name and its pack's licence. While only the built-in set is registered, a hint says that more packs can be added.

The picker opens from the floating toolbar's **Icon** button (the first one; a dot marks an item with an icon) or the Properties panel, and sets the selected items' icon: an icon node's `icon` key, and on any other node a `pack:name` token at the start of its label (`fa:fa-car Car`, `azure:computer-vision Vision`), replacing the one it has. **Remove icon** takes it away. An icon node is written in Mermaid Chart's style — the label in its bracket, the node data in a statement of its own (`n4["User"]` and `n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }`); **Convert to icon node** makes one from a node whose label starts with an icon.

For an icon node, the toolbar's **Icon & image** popover and the Properties panel set the label's position (above or below), the frame (none, square, circle, rounded), the width, and the toolbar's **H** field its height — all written to its node data. Dragging the resize handle of an icon or image node sizes its icon or picture (an icon stays square, an image with **Keep aspect ratio** keeps its aspect) and writes `h` and `w` into its node data when you let go, so stock Mermaid draws it the same size. A node whose label starts with an icon token has **Convert to icon node** in the popover and in Properties: the icon becomes the node's and the rest of the label its caption. Properties notes when a label's icon is drawn by mmdx only (stock Mermaid draws Font Awesome tokens and shows other packs' as text). In a mindmap, the icon is a label token at the start of the node's text, which replaces an `::icon()` line the node has (see [Mindmaps](/guide/mindmap#icons)); in a state diagram, it is a token at the start of the state's title (`state "fa:fa-car Car" as Car`). Sequence, ER and the other types get their icon items in later releases; their items show no Icon button until then. What mmdx draws for icon and image nodes is described in [Flowchart content](/guide/flowchart).

### Images

Images are always referenced by URL; the editor never embeds a file into the diagram.

Drag the dock's **Image** button onto the canvas — or click it, or press `G`, for the middle of the canvas — and an image item with the placeholder (a dashed frame with a mountain glyph) is added and selected: in a flowchart `n5["Image"]` and `n5@{ img: "", h: 200, w: 200, pos: "b" }`, which stock Mermaid reads too; in a mindmap a child node with an empty metadata `img`; in a state diagram a state titled "Image" with an empty metadata `img`. An empty URL draws the placeholder without a warning. Choose the picture afterwards with the floating toolbar's image control or the Properties panel's **Image URL**.

- The image tool's **URL** field is checked while you type against the [image policy](/guide/security#image-policy) (`https:` from any host by default), with the reason when it is refused ("Only https images are allowed here").
- With an `uploadImage` hook, the tool also takes a dropped file, a pasted picture (⌘V, in the tool or on the canvas) and a file input (PNG, JPEG, GIF, WebP, SVG, AVIF); the hook uploads it and the image references the URL it returns. A picture over 1600 px on its longer side is offered **Reduce to 1600 px** first (re-encoded in the browser). Without the hook, the drop zone is hidden and a pasted or dropped picture is refused with a toast.

```ts
editor.uploadImage = async (file) => {
  const res = await fetch('/api/uploads', { method: 'POST', body: file });
  if (!res.ok) throw new Error(`upload failed (${res.status})`); // shown as a toast
  return { url: (await res.json()).url };
};
```

From the dock, an image adds a flowchart **image node** whose caption is the file name: `n5["team photo"]` and `n5@{ img: "https://…", h: 200, w: 200, pos: "b" }`. With a node selected (the toolbar's Icon & image popover, or Properties), the tool sets or replaces its image — a node without one becomes an image node — and **Remove image** takes it away. The popover and Properties set the caption's position, width and height, **Keep aspect ratio** (`constraint: "on"`) and the fit (contain, cover, stretch; kept in the layout metadata, as Mermaid has no such key).

### Markdown labels

A flowchart label written as a Mermaid markdown string (`` A["`**Bold** text`"] ``) is drawn with its emphasis and edited with its `**` and `*` as typed: above the text box on the canvas, **B** and **I** (`⌘B`, `⌘I`) wrap the selected words in `**` or `*`, or take them off again. A plain label has **Make rich text** there instead: the label is then written as a markdown string, and B and I appear. The floating toolbar's Bold styles a whole plain label, in the layout metadata, as before. See [Flowchart content → Markdown labels](/guide/flowchart#markdown-labels).

### Emoji

While you edit a label on the canvas, the ☺ button at the end of the text box (or `⌘;` / `Ctrl+;`) opens the emoji picker: the emoji by group, recently used ones, search by name and keyword, and a skin tone. A chosen emoji goes in at the caret as plain text, so it shows wherever the diagram does; the picker stays open for more. The label fields of the Properties panel have the same button. The emoji data (English) loads the first time the picker opens.

## Mindmaps

A mindmap is edited like an outline: the structure is the indentation of the Mermaid code, and every gesture below rewrites those lines (re-indented in the file's own step, two spaces by default). Node positions are not stored; the tree is laid out again after every change ([Mindmaps → Layout](/guide/mindmap#layout)). There are no connectors, containers or routing.

| Keys | Action |
|---|---|
| `Tab` | Add a child to the selected node and edit its text |
| `Enter` | Add a sibling after the selected node (on the root: a child) and edit its text |
| `⇧Tab`, `⌥←` | Move the node out of its parent: it follows the parent, and its later siblings stay where they are |
| `⌥→` | Move the node under the sibling above it, as its last child |
| `⌥↑`, `⌥↓` (also `⌘[`, `⌘]`) | Trade places with the previous or next sibling, with their subtrees |
| Arrows | Select the parent, the first child or a sibling, following the side the node grows on |
| `F2`, double-click | Edit the node's text |
| `Space` | Fold or unfold the selected branch (Space + drag still pans) |
| `Del` / `⌫` | Delete the node with its subtree |
| `⇧Del` / `⇧⌫` | Delete the node and lift its children one level (the root only when it has one child, which becomes the root) |
| `⌘C`, `⌘V` | Copy branches (not the root); paste them as children of the selected node (else of the root) |
| `⌘D` | Duplicate the selected branches next to the originals |

- **Handles**: the selected node has a `+` on its outer side, which adds a child, and, when it has children, a chevron beside it that folds or unfolds the branch. A folded branch shows a +N badge with the number of hidden nodes; clicking it unfolds the branch. Folding is stored (metadata `collapsed`), so a viewer opens the map folded the same way.
- **Dragging**: drop a node onto another to make it its last child, or between two siblings to put it there (a line shows where). A first-level branch dropped on the other side of the root moves to that side (metadata `side`). Alt-drag drops a copy. The root does not move.
- **Text**: the text is written in the node's own delimiters, and quoted only when it needs it (`["a (b)"]`); a bare node whose new text cannot stand alone is written in Mermaid's other form of the default shape, `(-"…"-)`. Every mindmap label is drawn as markdown; Bold, Italic and **Make rich text** above the text box work as for [flowchart labels](#markdown-labels) and write a markdown string.
- **Shapes**: the Shapes menu lists Mermaid's seven mindmap shapes and adds a node of that shape as a child of the selected node (else of the node nearest the drop, else the root; an empty map gets its root). The toolbar's shape picker writes the delimiters of those seven; any other shape of the catalogue is kept in the layout metadata and drawn by mmdx only.
- **Icons and images**: the Icons tool adds a node with an icon token at the start of its text (`fa:fa-book New idea`), or sets the icon of the selected node; the Image tool adds a node with a picture, or sets the selected node's, in metadata `img` (Mermaid's mindmap has no image syntax).
- **Copies**: duplicated and pasted branches get new written ids where theirs are taken (`api` becomes `api_2`), and duplicates keep their originals' looks. Pasting indented text, a Markdown list (`-`, `*`, `+`, `1.`) or a Mermaid mindmap onto a selected node adds it as a subtree of that node: one node per line of text or list item, a pasted mindmap's nodes as they are written.
- **Page**: in the page's Properties, **Colours** colours by branch (Mermaid's default) or by depth, written as `config.mindmap.colorBy: depth` into the frontmatter and removed again for by branch; **Mindmap → Layout** puts the branches on both sides of the root, to the right of it, or top down (`mindLayout`, also set by the page presets).

The order slider of the floating toolbar moves a node among its siblings ("first", "last"). Grouping is refused ("A mindmap has branches, not groups").

## State diagrams

States, composites, transitions and notes are edited like flowchart nodes, subgraphs, edges and notes — selected, moved, resized, routed, styled and layered the same way, with positions and looks in the metadata — while everything structural is written to the Mermaid code in the scope Mermaid's rules need ([State diagrams → Editing](/guide/state#editing)).

| Gesture | Code |
|---|---|
| Shapes menu (`S`): State, Choice, Fork, Join, dropped or clicked | `s1`, `state choice1 <<choice>>`, `state fork1 <<fork>>`, `state join1 <<join>>` at the end of the composite and region under the drop point (else the top level) |
| Shapes menu: Start, dropped next to a state | `[*] --> s` in that state's scope; refused where the scope has a start ("This scope has a start already", which is selected) |
| Shapes menu: End, dropped next to a state | `s --> [*]`; refused without a state near the drop ("An end needs a state before it") |
| Shapes menu: Note, dropped next to a state or composite | `note left of s : Note` or `note right of s : Note`, the side from the drop position |
| Shapes menu: Composite state | `state Group1 {` around a new state `}` |
| Connection handles of a state or composite | `a --> b`, in the composite (and region) both ends share, else at the top level; into a start, out of an end, or a composite's start or end to a state outside it is refused with the reason |
| Dragging a transition's end to another state | The end rewritten in place (label and `:::class` kept), or the line moved to the scope the new ends share |
| Double-click, `Enter` or Properties text | A title in the form in use (`state "Text" as id`, `id : text`; a new one as `state "Text" as id`), `a --> b : label`, a note's text on one line or up to `end note` |
| Properties: Kind | State, Choice, Fork, Join: the `state id <<…>>` line before the state's first mention, or removed |
| Properties: Description rows | One `id : row` line per row, after the title (a state without a title gets `state "id" as id` first) |
| Properties of a composite: Direction, Add region | `direction LR` as the block's first line (none: Mermaid's top to bottom); `--` and a new state at the end of the block |
| Properties of a note: Side | `note left of` / `note right of` |
| `⌘G` | `state Group1 {` … `}` around the selected states of one scope, with their transitions among them |
| Ungroup (`⇧⌘G`) | The block lines removed; with an inner start or end it asks first ("Ungroup the composite?"), then rewires the transitions into and out of the composite to the states inside |
| `Del` / `⌫` | A state with its texts, transitions, notes, link and style lines (the other ends stay); a composite with states asks: Cancel, Keep contents, Delete with contents |
| `⌘C` / `⌘V`, `⌘D`, Alt-drag | Copies of states and composites with new ids, what they hold and the transitions between the copies |

The icon picker writes a label token at the start of a state's title; the Image button adds a state titled "Image", and the image control sets the selected state's picture, both in metadata `img`; the toolbar's shape picker keeps a catalogue shape in metadata `shape` (mmdx only). The page's Direction writes the top-level `direction` line, and the page presets include **Coloured composites** (`composites: "palette"`). A `:::class` with no `classDef` and no preset of that name is listed in Problems.

## Saving

`mmdx-save` (cancelable) → `adapter.save(source, { version })` → `mmdx-saved`. The adapter returns the new `version`, or `{ conflict: { source, version } }` when someone else saved first: `mmdx-conflict` fires and a dialog offers **Keep mine** (overwrites theirs), **Take theirs** (an undoable change) or **View both** to compare. A failed save shows a toast and fires `mmdx-error`.

With `autosave`, every edit schedules a save after that many milliseconds of quiet; a save waits while a gesture is in progress. Remote updates from `adapter.subscribe` apply directly (as an undoable change) while the editor has no unsaved changes; otherwise a bar offers **Reload** or **Keep mine**. An update that arrives during a drag waits for the drag to end.

Without an adapter, `save()` still fires `mmdx-save`; handle it, save yourself, and call `editor.instance.markSaved()`.

## History

With a `history`, the History button of the tool dock (⇧H) opens the version panel next to the Code panel — the versions you give it, plus the working copy when it differs from the newest one (it follows the document). Opening it changes nothing else: the current version is selected and the diagram stays editable.

- **History tab**: pick an older version and the editor shows it as it was, drawn exactly like the document (page, canvas, theme) but read-only: Shapes, Properties and Undo / Redo leave the dock, Code and Layers stay (read-only), items can be selected and the bar over them has **Copy** (⌘C; paste into the document later), and Export exports that version (its id in the file name). Picking the current version again brings editing back.
- **Compare tab**: pick a version and it is compared with the current one (Before, Merged, After, Side by side, filters, change list, code diff in the Code panel's place), on the editor's own canvas and page; the timeline's dots and Swap (X) change the pair. Switching tabs alone shows nothing new, and the panels stay as they were.
- Every switch — document, version, comparison — animates from where things are on screen.
- **Back** (the pill at the top, or Esc) returns to the current version and keeps the panel; closing the panel only hides it while a version or comparison shows (the History button brings it back), and leaves History otherwise.
- **Restore this version** (Edit mode, in an older version's ⋯ menu) opens it in the editor as an undoable change, after the cancelable `mmdx-history-restore`.

History's code loads on first use; no `@mmdx/studio/diff` import is needed. `historySession` gives the `<mmdx-diff>` methods while it is open (`pair` is all `null` while nothing older is picked). Where the versions come from is up to the host — a Git history, your backend's revisions, or snapshots you keep:

```ts
import { httpHistoryAdapter } from '@mmdx/studio/adapters';

editor.history = httpHistoryAdapter('/api/diagrams/arch/versions'); // or a list, or your own { list, load }
```

See [History](/guide/history).

## Read-only

`read-only` (or `readOnly = true`, or `setMode('view')` on `DiagramEditor`) switches to View mode: the canvas pans on drag, arrows pan, links open on click, edit-only tools and shortcuts are gone, the Code panel is hidden and the right panel shows View settings.

## Keyboard shortcuts

Shortcuts work while the focus is inside the editor; `?` lists those that apply right now. On Windows and Linux use Ctrl for ⌘.

| Keys | Action |
|---|---|
| `V`, `H`, `S`, `P` | Pointer, Hand, Shapes menu, pen |
| `G` | Image ([insert dock](#insert-dock)) |
| `⌘;` | Emoji, while editing text |
| `⌘B`, `⌘I` | Bold, italic of the selected words, while editing a markdown label |
| `C`, `I`, `L`, `⇧H` | Code, Properties, Layers panels; History |
| `F`, `0` | Fit |
| `+` / `=`, `-` | Zoom in, zoom out |
| Space + drag | Pan |
| `?` | Shortcuts and hints |
| `⌘Z`, `⇧⌘Z` / `⌘Y` | Undo, redo |
| `⌘S` | Save |
| `⌘A`, `⌘C`, `⌘V`, `⌘D` | Select all, copy, paste (at the pointer), duplicate |
| `⌘⌥C`, `⌘⌥V` | Copy style, paste style |
| `⌘G`, `⇧⌘G` | Group, ungroup |
| `⌘[`, `⌘]` | Move back, forward in the code order |
| `Del` / `⌫` | Delete |
| Arrows, `⇧` + arrows | Move the selection by 1 px, 10 px (View mode: pan) |
| `Tab`, `⇧Tab` | Select the next, previous item |
| `Enter` | Edit the selected item's text |
| `⇧F10`, context menu key | Open the context menu |
| Shift-click, Shift-drag | Add to the selection |
| Alt-drag | Drag a copy; Alt while dragging: no snapping |
| `Esc` | Back one level: cancel a drag, stop a tool, clear the selection, leave a group or History |

In a mindmap, `Tab`, `Enter`, the arrows, `F2`, `Space`, `⇧Del`, `⌘V` and `⌘D` act on the tree instead, and `⌥` + arrows move nodes: see [Mindmaps](#mindmaps). In a state diagram the general keys apply; `S` opens the menu of states, `⌘G` / `⇧⌘G` make and unwrap composites, and `Del` on a composite with states asks first: see [State diagrams](#state-diagrams). While an ER table is edited in place: `↑` / `↓` (with `⇧` to extend) select attributes, `⌥↑` / `⌥↓` move them, `Enter` edits one (the empty row adds one), `⌘A` selects all, `Del` deletes, `Esc` clears the selection, then leaves the table. While History compares: `1`–`4` views, `J` / `K` next and previous change, `X` swaps Before and After.

## See also

- [Components overview](/components/) for the behaviour every element shares
- [Documents and adapters](/guide/documents), [Adapters](/api/adapters)
- [History](/guide/history) and [`<mmdx-diff>`](/components/diff)
- [The .mmdx format](/guide/mmdx-format), [Themes](/guide/themes), [Styling](/guide/styling)
- [Sandboxed iframes](/guide/sandboxed-iframes): `preloadedStorage`, drafts, `schemeToggle`
- [Events](/api/events), [React wrappers](/api/react)
- [Playgrounds](/components/playgrounds) and [Storybook](/storybook/){target="_self"}
