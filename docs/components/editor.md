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
| `wheel` | — | `'always' \| 'zoom' \| 'ctrl' \| 'never'` | `always` | The mouse wheel on the canvas: `always` pans (⌘ / Ctrl + wheel or a pinch zooms); `zoom` zooms at the pointer (Shift + wheel and a sideways scroll pan); `ctrl` and `never` as in the viewer |
| — | `modules` | `readonly EditorModule[]` | `DEFAULT_MODULES` | The editor's feature modules (advanced: add or replace modules; a host's module is typed with `EditorModule`, whose scope's `core` is an `EditorModuleApi`) |
| — | `themeSource` | `ThemeSource` | `configure({ themeSource })` | Where themes the page has not loaded come from |
| — | — | `toolbar: 'floating' \| 'none'` | `floating` | `DiagramEditor` option, read when the editor is created; `none` turns off the floating style toolbar |
| — | — | `ctx: Partial<CoreContext>` | the shared context | `DiagramEditor` option, read when the editor is created |
| — | — | `iconPacks: IconPack[]` | — | `DiagramEditor` option: icon packs of this editor over the shared ones (see [Icons](/guide/icons#registering-packs)); read when the editor is created |
| — | `images` | [`ImageStore`](/api/adapters#images) or `null` | `null` | The host's image store: the image tool's **Library** tab lists its pictures, and uploads (the **Upload** tab, a picture pasted or dropped on the canvas) are put into it, before `uploadImage` |
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
| `core`, `store: DocStore` | The editor core and the document store (advanced; a module sees the core as `EditorModuleApi`) |
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

In a flowchart, an icon is not a shape and not an action on other shapes: it is the source of an image node, instead of a picture. Add an image node from the dock's **Image** (below), then change its image with the floating toolbar's first item, **Change image**: the image tool, with four tabs — **Library**, **Upload** and **URL** for a picture, and **Icon**, a search over the registered icons (small tiles, no pack filters); the picture gives way to the chosen icon, and a picture from any other tab replaces the icon. An icon node's tool opens on its Icon tab. Properties' Image section opens the same tool on one tab (**Library…**, **Upload…**, **URL…**, **Icon…**). An icon node is written in Mermaid Chart's style — the label in its bracket, the node data in a statement of its own (`n4["User"]` and `n4@{ icon: "tabler:user", form: "square", h: 60, pos: "b" }`). Other flowchart shapes have no icon control; an icon token a label already starts with (`fa:fa-car Car`) is still drawn, and Properties offers **Convert to icon node** for it.

Next to Change image, the toolbar's **settings** of an image node depend on its source: an icon's frame (none, square, circle, rounded) or a picture's fit, and the label's position (above or below) — all written to its node data. Sizes and **Keep aspect ratio** are set in Properties; the lock is on for every new picture (`constraint: "on"`, written, since Mermaid's default is off). Dragging the resize handle sizes the icon or picture (an icon stays square, a picture with the lock keeps its aspect) and writes `h` and `w` into the node data when you let go, so stock Mermaid draws it the same size. Properties notes when a label's icon is drawn by mmdx only (stock Mermaid draws Font Awesome tokens and shows other packs' as text). Images work the same way in state diagrams, mindmaps and sequence diagrams, whose code has no image syntax: an image item there keeps the same keys in its metadata (see [Images](#images)), and no item has an Icon button — an icon is an image's source. ER tables have no images or icons. What mmdx draws for icon and image nodes is described in [Flowchart content](/guide/flowchart).

### Images

Images are always referenced by URL; the editor never embeds a file into the diagram.

Drag the dock's **Image** button onto the canvas — or click it, or press `G`, for the middle of the canvas — and an image item with the placeholder (a dashed frame with a mountain glyph) is added and selected: in a flowchart `n5["Image"]` and `n5@{ img: "", h: 200, w: 200, pos: "b", constraint: "on" }`, which stock Mermaid reads too; in a state diagram, a mindmap and a sequence diagram an image state, child node or participant with the same keys in its metadata (`{"img":"","w":200,"h":200,"pos":"b","constraint":"on"}`). An empty URL draws the placeholder without a warning. Change it afterwards with the floating toolbar's **Change image** — the image tool's **Library**, **Upload**, **URL** and **Icon** tabs — or Properties' image buttons: **Change image** (or **Set image** on an item without one; a picture or an icon makes it an image or icon item) and **Remove image**.

The image tool has these tabs, each where the host provides it, and an **Icon** tab (the icon picker) for an image node, whose image may be an icon:

- **Library**: the pictures of the host's image store (the `images` property, an [`ImageStore`](/api/adapters#images)), newest first, as a grid of thumbnails with a search by name and **Load more** for the next page. A click uses the picture: the image references its record's `url`. A picture the image policy refuses is dimmed and says why. The library follows the store's `subscribe`.
- **Upload**: a dropped file, a pasted picture (⌘V, in the tool or on the canvas) or a chosen file (PNG, JPEG, GIF, WebP, SVG, AVIF) is put into the image store (`put`), and the image references the stored picture's `url`; without a store, the `uploadImage` hook uploads it and the image references the URL it returns. A picture over 1600 px on its longer side is offered **Reduce to 1600 px** first (re-encoded in the browser). Without either, there is no Upload tab and a pasted or dropped picture is refused with a toast.
- **URL**: always there. It is checked while you type against the [image policy](/guide/security#image-policy) (`https:` from any host by default), with the reason when it is refused ("Only https images are allowed here").

The store decides what a picture is referenced by: a plain URL, or a reference of its own (`asset:42`) that the host's [`resolveUrl`](/guide/configuration) maps to a URL when the diagram is drawn, so the diagram keeps the reference and the store can move its files.

```ts
import { httpImageStore } from '@mmdx/studio/adapters';

editor.images = httpImageStore('/api/images'); // GET (list), GET /<id>, POST (multipart), DELETE /<id>
```

Without a library, the `uploadImage` hook alone gives the Upload tab:

```ts
editor.uploadImage = async (file) => {
  const res = await fetch('/api/uploads', { method: 'POST', body: file });
  if (!res.ok) throw new Error(`upload failed (${res.status})`); // shown as a toast
  return { url: (await res.json()).url };
};
```

From the dock, an image adds a flowchart **image node** whose caption is the file name: `n5["team photo"]` and `n5@{ img: "https://…", h: 200, w: 200, pos: "b", constraint: "on" }`. With an image node selected (the toolbar's **Change image**, or Properties), the tool replaces its picture, and **Remove image** takes it away. The toolbar's settings set the caption's position and the fit (contain, cover, stretch; kept in the layout metadata, as Mermaid has no such key); Properties also sets the width and height and **Keep aspect ratio** (`constraint: "on"`).

Pictures kept in metadata (a mindmap node's or a state's `img`) and catalogue shapes kept in metadata (`shape`) have no Mermaid syntax, so **Export → Portable Mermaid (.mmd)** leaves them out; the editor says so in a toast after the export and in a line of the **Plain Mermaid** dialog, for example "1 image and 2 shapes are mmdx-only and are not in the portable file". Icon tokens are code and stay in the portable file.

### Markdown labels

Flowchart and mindmap labels are rich text: a Mermaid markdown string (`` A["`**Bold** text`"] ``) is drawn with its emphasis, underline (`<u>…</u>`) and strikethrough (`<s>…</s>`), and edited with its marks as typed. The floating toolbar's **B** opens the text format menu — bold, italic, underline, strikethrough (`⌘B`, `⌘I`, `⌘U`, `⇧⌘X` in the text box) — which formats the selected words, or takes the format off them again; with no words selected, or the label not being edited, it formats the whole text (a label made bold by its style reads as bold, and Bold then turns the style off). While some words are selected, the font, size, alignment, link and text colour are off, as Mermaid styles those only for a whole label. A plain label is written as a markdown string once it has formatting; an edit without formatting keeps it plain. Labels of the other diagram types keep Bold as a switch of the item's style. See [Flowchart content → Markdown labels](/guide/flowchart#markdown-labels).

### Animated connectors

A flowchart connector can be animated as Mermaid animates it, with dashes flowing along the line: **Animation** in the floating toolbar's line popover and in Properties is Off, Fast or Slow. Fast writes `animate: true` and Slow `animation: slow` into the edge's data; a connector written without an id gets one first (`A e1@--> B`, then `e1@{ animate: true }`), and one edge of an `&` group is written as a statement of its own. Off takes the keys out again, with the data statement when nothing else is in it. The **Animate edges** view setting stops the motion on screen; exports draw still dashes.

### Emoji

While you edit a label on the canvas, `⌘;` / `Ctrl+;` opens the emoji picker under the text box (the label fields of the Properties panel have a ☺ button for it): the emoji by group, recently used ones, search by name and keyword, and a skin tone. A chosen emoji goes in at the caret as plain text, so it shows wherever the diagram does; the picker stays open for more. The emoji data (English) loads the first time the picker opens.

## Sequence diagrams

Participants, messages, notes, blocks, boxes and processes are selected, styled and layered like other items; what they are and where they stand in the order is written to the Mermaid code ([Sequence diagrams → Editing](/guide/sequence#editing)).

| Gesture | Code |
|---|---|
| Shapes menu (`S`): Participant, Actor, Database | `participant P1` / `actor Actor1` / `participant P1@{ "type": "database" }` before the participant right of the drop point |
| Toolbar shape picker on a participant: Participant, Actor, Boundary, Control, Entity, Database, Collections, Queue | The type in the code: `actor` / `participant` as the keyword, the others as `@{ "type": … }` (Rounded and Stadium: metadata `shape`) |
| Shapes menu: Note, dropped next to a participant | `Note over P1: note` after the message above the drop |
| Shapes menu: Loop, Alternative, Optional, Parallel, Critical region, Break, Highlight, dropped on a message | `loop`, `alt`, `opt`, `par`, `critical`, `break` or `rect` … `end` around it, or around the selected messages |
| Drag from a lifeline's circle | Sideways: `A->>B: …` (back to the same lifeline: a message to itself); up or down: a process (`+` / `-`, or `activate` / `deactivate`) |
| Drag a message's end circle | Up or down to another message: a process between the two; sideways to another lifeline: that end re-attached there |
| Floating toolbar: arrow popover | One of Mermaid's ten arrows, solid (`->>`, `->`, `-x`, `-)`, `<<->>`) or dotted (`-->>`, `-->`, `--x`, `--)`, `<<-->>`); only the token changes |
| Floating toolbar: Reverse | The message's ends swapped; refused for a message to itself or where processes would no longer balance |
| Floating toolbar of a note: left of, right of, over (also Properties: Note placement) | `note left of A`, `note right of A`, `note over A` |
| Floating toolbar of an `alt`, `par` or `critical` block: Add branch, Delete the last branch | `else`, `and` or `option` at the end of the block; the last branch removed with its statements |
| Properties of such a block: Branch conditions, Add branch, Delete branch | Each branch's condition in place; a new branch; one branch with its statements |
| Double-click, `Enter` or Properties text | A participant's alias (`as …`, or `@{ "alias" }` when that is in use), a message's or note's text, a block's condition (not a `rect`'s: its argument is its colour), a box's title |
| ◀ ▶ over a selected participant | The participant moved left or right in the code |
| `⌘G`, Ungroup | `box` … `end` around the selected participants, or removed |

## ER diagrams

Tables, relationships and subgraphs are edited like flowchart nodes, edges and subgraphs — moved, resized, routed, styled and layered with positions and looks in the metadata — while their content is written to the Mermaid code, splicing only what changes ([ER diagrams → Editing](/guide/er#editing)).

| Gesture | Code |
|---|---|
| Shapes menu (`S`): Table, with a table preset | `ENTITY_1 { string id PK }` at the end of the code, or before the `end` of the subgraph under the drop point |
| Double-click a table's attributes | The attributes as rows on the canvas: double-click or `Enter` edits a row (`type name PK (comment)`), typing into the empty last row adds one, clearing a row deletes it, dragging rows or `⌥↑` / `⌥↓` reorders them |
| Properties of a table: Attributes | The same lines, one per attribute, each with a style popup for its look (metadata highlights) |
| Connection handles of a table or subgraph | `A \|\|--o{ B : ""` at the end of the code |
| Dragging a relationship's end to another table | Only that id rewritten |
| Properties of a relationship: cardinalities, Identifying, label | The token that changes, in the form written there (words stay words, symbols stay symbols) |
| Double-click, `Enter` or Properties text | A table's alias where Mermaid reads it (classes and block kept), a relationship's label, a subgraph's title; ids and texts quoted where Mermaid needs it |
| `⌘G` | `subgraph group1 ["Group"]` … `end` around the selected tables and subgraphs of one scope, at the first selected item |
| Ungroup (`⇧⌘G`), `Del` on a subgraph | The frame removed, its contents kept (relationships to the subgraph itself removed) |
| Properties of a subgraph: Direction | `direction LR` in its block (none: as the diagram, Mermaid's default) |
| `Del` / `⌫` on a table | Its statements and relationships; a table that lived only in a removed relationship stays declared there |
| `⌘C` / `⌘V`, `⌘D`, Alt-drag | Copies of tables with new ids and the relationships between them, in the same subgraph |

The page's Direction writes the top-level `direction` line. A `:::class` with no `classDef` and no table or group preset of that name is listed in Problems.

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
- **Text**: the text is written in the node's own delimiters, and quoted only when it needs it (`["a (b)"]`); a bare node whose new text cannot stand alone is written in Mermaid's other form of the default shape, `(-"…"-)`. Every mindmap label is drawn as markdown; the text format menu works as for [flowchart labels](#markdown-labels) and writes a markdown string.
- **Shapes**: the Shapes menu lists Mermaid's seven mindmap shapes and adds a node of that shape as a child of the selected node (else of the node nearest the drop, else the root; an empty map gets its root). The toolbar's shape picker writes the delimiters of those seven; any other shape of the catalogue is kept in the layout metadata and drawn by mmdx only.
- **Images**: the Image tool adds a node with a picture, and **Change image** gives a node a picture or an icon, as a flowchart image node — in its metadata (Mermaid's mindmap has no image syntax). Nodes have no Icon button; `::icon()` lines and label tokens already written are still drawn.
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

A state's image works as a flowchart image node's, in metadata: the Image button adds a state titled "Image" with the placeholder picture (`img: ""`, 200 × 200, caption below, the aspect kept), and the toolbar's **Change image** gives it a picture or an icon (`icon`), its settings the icon's frame or the picture's fit and the caption's side, Properties its size and **Keep aspect ratio**; a plain state has no Icon button; the toolbar's shape picker keeps a catalogue shape in metadata `shape` (mmdx only). The page's Direction writes the top-level `direction` line, and the page presets include **Coloured composites** (`composites: "palette"`). A `:::class` with no `classDef` and no preset of that name is listed in Problems.

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
| `⌘B`, `⌘I`, `⌘U`, `⇧⌘X` | Bold, italic, underline, strikethrough of the selected words (the whole text when none is selected), while editing a flowchart or mindmap label |
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
