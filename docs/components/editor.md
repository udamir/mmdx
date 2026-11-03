# `<mmdx-editor>`

The visual editor for flowcharts, sequence diagrams and ER diagrams. Everything done on the canvas is written back to the Mermaid code, and code edits update the canvas live; layout and looks are stored as `%%@` comment lines in the same text. It loads and saves through a document adapter (with conflict detection and live updates), or works on a value you set, and shows the document's History when you give it the versions.

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

- **Tool dock** (left): Pointer (V), Shapes (S; Table in an ER diagram), Hand (H), the pen (P), the Code (C), Properties (I) and Layers (L) panel toggles, History (⇧H), and Undo / Redo. Edit-only tools hide in View mode.
- **Code panel** (left): the Mermaid code, editable, with live parsing and its problems; the Metadata tab shows the `%%@` lines. `focusCode(line)` opens it at a line.
- **Properties** and **Layers** (right): the selected items' style, presets and stacking; the diagram's layers. In View mode the right panel is View settings.
- **Floating style toolbar** over the selection, and the **page toolbar** while the page is selected.
- **Zoom bar** (bottom right) with fit, the `?` help and full screen; **view parameters** (top right) with Export, the theme menu and the light / dark toggle.

`panels` sets which side panels are open (`{ code, properties, layers }`); the user's choice is remembered in `storage`.

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

While an ER table is edited in place: `↑` / `↓` (with `⇧` to extend) select attributes, `⌥↑` / `⌥↓` move them, `Enter` edits one (the empty row adds one), `⌘A` selects all, `Del` deletes, `Esc` clears the selection, then leaves the table. While History compares: `1`–`4` views, `J` / `K` next and previous change, `X` swaps Before and After.

## See also

- [Components overview](/components/) for the behaviour every element shares
- [Documents and adapters](/guide/documents), [Adapters](/api/adapters)
- [History](/guide/history) and [`<mmdx-diff>`](/components/diff)
- [The .mmdx format](/guide/mmdx-format), [Themes](/guide/themes), [Styling](/guide/styling)
- [Sandboxed iframes](/guide/sandboxed-iframes): `preloadedStorage`, drafts, `schemeToggle`
- [Events](/api/events), [React wrappers](/api/react)
- [Playgrounds](/components/playgrounds) and [Storybook](/storybook/){target="_self"}
