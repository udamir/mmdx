# `<mmdx-studio>`

The complete app, **Mermaid Studio**, in one element: the [editor](/components/editor), an examples gallery, opening and dropping files, the [theme editor](/components/theme-editor) in a dialog, versions you save in the browser, and share links. It is the app of the live demo; open it in the [studio](/studio/){target="_self"}.

```ts
import '@mmdx/studio'; // <mmdx-studio>, DiagramStudio, encodeHash, decodeHash
```

## Usage

```html
<script type="module">
  import '@mmdx/studio';
</script>

<mmdx-studio examples="./examples/index.json" themes="./themes/index.json" persist="local hash" style="height: 100vh"></mmdx-studio>
```

The element fills its parent's height (at least 480 px). Without custom elements, mount `DiagramStudio`:

```ts
import { DiagramStudio } from '@mmdx/studio';

const studio = new DiagramStudio(host, { examples: '/examples/index.json', persist: ['local'] });
studio.editor?.setSource(source);
studio.destroy();
```

The studio has no backend: saving downloads the file, and documents, versions, edited themes and preferences stay in browser storage. The inner editor's events are composed, so `mmdx-change`, `mmdx-dirty` and the others reach listeners on `<mmdx-studio>`; `studio.editor` is the `DiagramEditor` for anything else.

## Attributes and properties

The attributes are read when the studio is created; changing them later has no effect (a property set on a live studio warns once).

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `examples` | — | `string` | — | URL of the examples manifest. Without it, Examples shows nothing and a new studio opens a flowchart starter |
| `themes` | — | `string` | — | URL of a theme manifest (`themes/index.json`). `?themes=<url>` on the page overrides it |
| `persist` | — | `('local' \| 'hash')[]` | `local hash` | `local` keeps the last document in browser storage; `hash` keeps it in the URL (`#d=…`), which the Share button copies |
| `initial` | — | `string` | the first example | Example id to open when nothing is stored and the URL holds no diagram |
| — | `storage` | `StorageAdapter` | `localStorage` (`mmdx.` keys), else in memory | Where the document, the versions, edited themes and preferences are kept |

Read-only properties of the element: `instance` (the `DiagramStudio`, `null` while not connected) and `editor` (the inner `DiagramEditor`).

## Methods

| Method | Description |
|---|---|
| `openFiles(files: FileList \| File[]): Promise<void>` | Opens files as the Open button does: `.mmdx`, `.mmd`, `.md` (its first Mermaid block), `.txt`, and a `.json` layout sidecar merged into the diagram. Asks before discarding unsaved changes |

`DiagramStudio` (`new DiagramStudio(host, options?: StudioOptions)`) has `openFiles()`, the `editor` getter and `destroy()`.

## Events

The studio dispatches no events of its own; the inner editor's [events](/components/editor) bubble out of it. Its `mmdx-save` is handled by the studio (download and record a version) and arrives with `defaultPrevented` set.

## Top bar

| Control | What it does |
|---|---|
| **＋ New** | A new flowchart, sequence diagram or ER diagram from the starter (`starterSource(type)` from `@mmdx/studio/core`) |
| **Examples** | A gallery of the examples, two to a row, each with its thumbnail or a preview of its newest version in the current theme |
| **Open** | Opens `.mmdx`, `.mmd`, `.md`, `.txt` and `.json` files; files dropped anywhere on the studio open the same way |
| File name | The open document's name, with a dot while it has unsaved changes |
| **Edit / View / Diff** | The mode switch (below) |
| **Save version** | Records the current diagram as a version, with a message, in its history |
| **Theme editor** | Opens `<mmdx-theme-editor>` in a dialog; saved themes apply to the open diagram |
| **Plain Mermaid** | The diagram rendered by stock Mermaid, as GitHub or YouTrack show it |
| **Share** | Copies a link with the diagram in it |

Opening a document while the current one has unsaved changes asks first.

## Edit, View and Diff

The mode switch has **Edit** and **View** (the editor's modes) and **Diff**. Diff opens the editor's History on the newest change compared (the working copy, or the newest version, against the version before) and stays selected while a comparison shows; Edit or View leave it. Diff is disabled until the document has a version to compare with.

## Versions

The studio gives the editor the versions of the open diagram, so its **History** button works:

- An example's own history: the `history` file of its manifest entry. The bundled examples each come with six versions that touch every kind of change, and open at their newest version.
- The versions you record with **Save version** (with a message) or ⌘S (which also downloads the `.mmdx` file and marks the document saved). They are kept in browser storage per document, newest first, at most 30; saving the same source twice in a row records one version.

History lists your versions first, then the example's. Restore brings any of them back as an undoable change.

## Examples manifest

`examples` points at a JSON file listing the examples. Paths are relative to the manifest.

```json
{
  "examples": [
    {
      "id": "simple-flow",
      "title": "Flowchart: auto layout",
      "file": "simple-flow.mmdx",
      "tags": ["flowchart"],
      "history": "history/simple-flow.json"
    }
  ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `file` | yes | The diagram (`.mmdx` or `.mmd`); entries without it are skipped |
| `id` | no | The example's id (for `initial`); defaults to `file` |
| `title` | no | The card title; defaults to `file` |
| `tags` | no | Shown under the title |
| `thumbnail` | no | An image URL for the card; without it the newest version is rendered |
| `history` | no | A history file: `{ "versions": [{ "id", "message", "author", "date", "source" }] }`, newest first. An example with a history opens at its newest version |

A history file:

```json
{
  "versions": [
    { "id": "9fb38e6", "message": "Remove a step", "author": "Damir", "date": "2026-10-30T16:25:00.000Z", "source": "flowchart LR\n  …" },
    { "id": "d2eb0b1", "message": "Recolour a service", "author": "Priya", "date": "2026-10-28T13:08:00.000Z", "source": "flowchart LR\n  …" }
  ]
}
```

Versions without a string `id` and `source` are skipped.

## Persistence and share links

On start the studio opens, in this order: the diagram in the URL (`persist` with `hash`), the last document from browser storage (`local`), the `initial` example, the first example, or a new flowchart.

- `local` stores the open document with its name, so a reload continues where you were.
- `hash` writes the document into the URL as `#d=<data>` a moment after each change, while it fits in 8 KB; the link of a larger document is dropped from the URL.
- **Share** copies the link. A diagram too large for a link offers Download `.mmdx` or Copy source instead.
- A link whose diagram is an example (any of its versions) or this browser's own document opens as that document, with its name and history; any other opens as `shared-diagram`.

The link data is the source compressed with `deflate-raw` and encoded as base64url. `encodeHash(source)` and `decodeHash(data)` (from `@mmdx/studio` and `@mmdx/studio/adapters`) make and read it in your own pages:

```ts
import { encodeHash, decodeHash } from '@mmdx/studio';

const data = await encodeHash(source);               // null where CompressionStream is unavailable
const url = `https://example.com/studio/#d=${data}`;
const back = await decodeHash(data!);                // null for invalid data or over 1 MB
```

## Themes

The studio loads the themes of the `themes` manifest (or `?themes=<url>`) and registers them, with the built-in pair. Themes edited in its theme editor are stored in browser storage, layered over the manifest's files, and the editor redraws with them. The light / dark choice is remembered.

## See also

- [Live studio](/studio/){target="_self"}
- [`<mmdx-editor>`](/components/editor) and [`<mmdx-theme-editor>`](/components/theme-editor)
- [History](/guide/history), [Themes](/guide/themes)
- [Adapters](/api/adapters): `encodeHash`, `decodeHash`, storage
- [Components overview](/components/)
