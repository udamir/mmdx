# `<mmdx-theme-editor>`

Manages diagram themes: edit the colour palette and the style of every item type with live previews, check text contrast, link light and dark themes, and import and export `.theme.json` files. The baseline theme defines every style; other themes override only what differs from the theme they extend. Saved themes are validated and registered in the shared registry, so open viewers and editors redraw with them.

```ts
import 'mmdx/theme-editor'; // <mmdx-theme-editor>, ThemeEditor, theme stores and sources
```

<MmdxDemo kind="theme-editor" />

## Usage

Give it a store to read and save themes, and optionally a source of read-only themes to start from:

```ts
import 'mmdx/theme-editor';
import { fetchThemeSource, localStorageAdapter, localStorageThemeStore } from 'mmdx/theme-editor';

const base = fetchThemeSource('/themes/index.json');  // read-only themes to start from
const te = document.querySelector('mmdx-theme-editor')!;
te.store = localStorageThemeStore(localStorageAdapter(), base); // or your own ThemeStore
te.source = base;
```

```html
<mmdx-theme-editor theme="ocean" can-publish style="height: 720px"></mmdx-theme-editor>
```

Without a store it edits the built-in themes in memory. Without custom elements, mount `ThemeEditor`:

```ts
import { ThemeEditor, memoryThemeStore, BUILTIN_THEMES } from 'mmdx/theme-editor';

const te = new ThemeEditor(host, { store: memoryThemeStore(BUILTIN_THEMES), presentation: 'dialog' });
await te.ready;
te.open();
```

Recipes:

```ts
// a read-only gallery of the company's themes
te.setAttribute('can-edit', 'false');

// review every save before it is written
te.addEventListener('mmdx-theme-save', (e) => {
  if (!approved(e.detail.theme)) e.preventDefault();
});

// your own preview samples per diagram type
te.samples = { flowchart: 'flowchart LR\n  a[Order] --> b{Paid?}', er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places' };
```

## Attributes and properties

Each attribute sets the `ThemeEditorOptions` option of the same name in camelCase (`can-edit` → `canEdit`); `new ThemeEditor(host, options)` and `te.set(patch)` take every option. The Property column lists the element's own properties.

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| — | `store` | `ThemeStore` | in memory, with the built-in themes | Where themes are read and saved: `{ list, get, save, delete?, publish?, usage?, listWithUsage?, subscribe? }` |
| — | `source` | `ThemeSource` | — | Read-only themes the store's themes may extend (e.g. the shipped theme files): `{ list, get, subscribe? }` |
| `theme` | `theme` | `string` | `default-light` (the baseline) | The theme open for editing. Setting it later switches (asking about unsaved changes; if the user stays, the attribute follows the open theme). The property returns the open theme's id |
| `can-edit` | — | `boolean` | `true` | `false`: browse and export only |
| `can-publish` | — | `boolean` | `false` | Show Publish (when the store has `publish`) |
| `can-delete` | — | `boolean` | `false` | Show Delete (when the store has `delete`) |
| `presentation` | — | `'inline' \| 'dialog'` | `inline` | `inline` fills the host; `dialog` is a modal over the page with its own title bar and close button |
| `samples` | `samples` | `ThemeSamples` | built-in samples | Mermaid samples per diagram type for the preview, `{ flowchart?, sequence?, er?, mindmap?, state? }`; the attribute takes JSON |
| `ui` | — | `'light' \| 'dark' \| 'auto'` | `auto` | Chrome colour scheme |
| — | `storage` | `StorageAdapter` | `localStorage` (`mmdx.` keys), else in memory | UI preferences: `teSamples` (edited sample code), `teZoom` (tile zoom) |
| — | — | `ctx: Partial<CoreContext>` | the shared context | `ThemeEditor` option, read when it is created |

Read-only properties of the element: `instance` (the `ThemeEditor`, `null` while not connected), `dirty` (the open theme has unsaved changes) and `ready` (a promise that resolves when the theme list is loaded).

## Methods

| Method | Description |
|---|---|
| `save(): Promise<boolean>` | Validates and saves the open theme; resolves `false` when nothing was saved |
| `select(id: string): Promise<boolean>` | Opens another theme (asks about unsaved changes); resolves `false` when the user stays |
| `undo(): void`, `redo(): void` | Undo and redo edits of the open theme |
| `open(): void` | Shows the dialog (`presentation="dialog"`) |
| `close(): Promise<boolean>` | Closes the dialog after asking about unsaved changes; resolves `false` when the user stays. Inline, it resolves `true` and does nothing |

`ThemeEditor` has the same methods, and also:

| Member | Description |
|---|---|
| `set(patch: Partial<ThemeEditorOptions>): Promise<string>` | Changes options; resolves with the id of the open theme once the change is done (a `theme` asked for before the list loaded opens when it is in) |
| `select(id, { force? })` | `force: true` switches without asking |
| `discard(): void` | Drops the unsaved changes |
| `importText(text: string): Promise<boolean>` | Imports a theme file's text; an invalid file is reported and nothing is saved |
| `options: Readonly<ThemeEditorOptions>` | The current options |
| `dirty: boolean`, `themeId: string` | Unsaved changes; the id of the open theme |
| `draftTheme: ThemeFile \| null` | A copy of the theme being edited |
| `ready: Promise<void>` | Resolves when the theme list is loaded and the first theme is open |
| `ctx: CoreContext` | The core context |
| `destroy(): void` | Cancels open dialogs, stops listeners and timers, removes the DOM |

## Events

All events bubble and are composed. Types: `ThemeEditorEventMap`.

| Event | Detail | Cancelable | When |
|---|---|---|---|
| `mmdx-theme-save` | `{ theme: ThemeFile }` | yes | Before a validated theme is written to the store. Cancel it to stop the save |
| `mmdx-theme-saved` | `{ theme: ThemeFile, version: string }` | no | The store saved the theme; it is registered in the shared registry |
| `mmdx-theme-dirty` | `{ id: string, dirty: boolean }` | no | The open theme became dirty or clean |
| `mmdx-theme-select` | `{ id: string }` | no | Another theme was opened |
| `mmdx-theme-close` | `{ id: string }` | no | The dialog was closed |

## Layout

- **Theme list** (left): Baseline first, then the store's and the source's themes, tagged when edited on top of a theme file, not exported, or used by diagrams (from `store.listWithUsage` in one read when the store has it, else `store.usage`). **+ New theme** starts a theme that overrides nothing; the ⋯ menu has Duplicate, Import…, Export, Discard changes, Revert to file, Publish and Delete, as the permissions and the store allow.
- **Main column**: the palette, then a gallery per diagram type (flowchart, sequence, ER, mindmap, state) with a tile for every item style, shape default, preset and page preset. The mindmap gallery has Root, Node, Branch (the width of a first-level branch), Sections (branch colours: one tile per section, with its fill, text and branch colour) and Page. The state diagram gallery has State (with its presets), Start, End, Choice, Fork / join, Composite state (with its presets), Composite colours (one tile per colour of the Coloured composites page preset), Note, Transition (each with its presets) and Page. Selecting a tile shows its properties and the floating style toolbar.
- **Preview** (right): a sample diagram rendered with the theme being edited, one tab per diagram type (Flowchart, Sequence, ER, Mindmap, State); the sample code can be edited and reset.

Edits change a draft: tiles and the preview follow after a short pause, unsaved changes are marked, and Save writes the theme.

## Store and source

The `store` reads, saves and optionally deletes and publishes themes; the `source` adds read-only themes that store themes can extend. A store theme that changes a source theme is tagged as edited, and Revert to file (when the store has `delete`) drops the changes. Built-in helpers (also in `mmdx/adapters`):

| Helper | What it is |
|---|---|
| `memoryThemeStore(initial?)` | Themes in memory (the default, with `BUILTIN_THEMES`) |
| `localStorageThemeStore(storage, base?, key?)` | Themes edited in this browser, layered over a `base` source (key `themes`) |
| `fetchThemeSource(manifestUrl, init?)` | Read-only themes from a manifest such as `themes/index.json` |

`store.save(theme, { version })` returns `{ version }`, or `{ conflict: theirs }` when the theme changed since it was read: a dialog then offers **Overwrite**, **Reload** (take theirs) or **Cancel**. Linking a light and a dark theme (`counterpart`) is kept mutual: the newly linked theme links back, and a theme that linked here before is unlinked, each saved through the store.

## Permissions

| Attribute | Off (default for publish and delete) |
|---|---|
| `can-edit` | Read-only: no New, Duplicate, Import, Save or edits; Export still works |
| `can-publish` | No Publish. On, Publish saves the theme first, then calls `store.publish(id)` |
| `can-delete` | No Delete. On, Delete is offered for the store's own themes (not the baseline, not a source theme) when the store has `delete` |

Permissions only shape the UI; enforce them in your store as well.

## Presentation

`presentation="inline"` (the default) fills the host element, which needs a height. `presentation="dialog"` shows a modal over the page with a title bar and a close button: `open()` shows it, `close()`, the close button, a click outside and Esc ask about unsaved changes and then close it with `mmdx-theme-close`.

## Validation and contrast

Theme files are validated when they are saved and imported: invalid values are reported per field and nothing is saved, and an invalid import lists the values to fix in the file. Each box-like style tile checks the contrast of its text on its fill and warns below 4.5:1 (WCAG AA). `contrastRatio(a, b)` is exported for your own checks. See the [theme file reference](/api/theme-file).

## Keyboard shortcuts

While the focus is inside the theme editor (keys never reach the page behind it):

| Keys | Action |
|---|---|
| `⌘S` | Save |
| `⌘Z`, `⇧⌘Z` / `⌘Y` | Undo, redo |
| `Esc` | Close the colour picker or menu, then the style toolbar's popover, then deselect the tile, then close the dialog |

## See also

- [Components overview](/components/) for the behaviour every element shares
- [Themes](/guide/themes) and the [theme file reference](/api/theme-file)
- [Adapters](/api/adapters), [Configuration](/guide/configuration)
- [Events](/api/events)
- [Playgrounds](/components/playgrounds) and [Storybook](/storybook/){target="_self"}
