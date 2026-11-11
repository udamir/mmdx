# Migrating to 0.5

0.5 is the codebase audit's release: fixes, faster hot paths, and the layers the components are built on. Most hosts change nothing. This page lists everything a host can notice, with what to do.

## Changes that need an edit

### Stock Mermaid is no longer bundled automatically

`configure({ mermaid })` used to default to bundling the `mermaid` package when it was installed. The default is now a run-time import, which works in Node and with import maps. A bundled app that shows stock Mermaid (the "Plain Mermaid" view, the fallback for unsupported diagrams) passes the import itself:

```ts
import { configure } from '@mmdx/studio/viewer';

configure({ mermaid: () => import('mermaid') });
```

### `EditorCore` is no longer exported

`@mmdx/studio/editor` stops exporting `EditorCore`. A host's editor module is typed with `EditorModule`, whose scope's `core` is an `EditorModuleApi`: the document and its changes, the selection, the view, the canvas hooks, the kernel's state, events and actions. `editor.core` keeps its type, so `editor.core.run(…)` is unchanged. See [Extending the editor](./editor-modules).

```ts
// before
import type { EditorCore } from '@mmdx/studio/editor';
const mine: ViewModule<EditorCore> = { /* … */ };

// after
import type { EditorModule } from '@mmdx/studio/editor';
const mine: EditorModule = { /* … */ };
```

### Removed options and actions

| Removed | Was | Instead |
|---|---|---|
| `ViewerOptions.rehydrate`, `Config.debug` | ignored | drop them |
| actions `toggleHelp`, `editTable`, `gotoMetaLine`, `unlockAll`, `pasteStyle` | not reachable from the UI's own paths | the `?` key, the ER table's double-click, the problems list, the ⋮ menu and ⌘⌥V stay |

## Changes a host may notice

| Change | What to check |
|---|---|
| React wrapper: a prop is set as a property when the element has that property | Documented props behave the same; an undocumented object prop now reaches the element as a property |
| `mmdx-error` for a PNG drawn with local fonts (`export.font-missing`) is a `warning` with `params.fonts` in every component (the viewer sent an `info` with another message; the diff sent nothing) | A host that filtered on the severity or the message |
| Export names drop a URL's query and hash (`flow.mmd?v=2` → `flow`), and `.json` and `.markdown` like the other document extensions | A host that relied on the old file names |
| `whenLoaded()` also waits for the editor modules a document's type loads (the ER table editing, the sequence gestures load with their type now) | Nothing, unless a host timed something against it |
| ER attribute highlights in `%%@` metadata: `italic`, `fontFamily`, `fontSize` and `preset` are checked like `color`, `bold` and `underline` (a bad value is dropped and reported) | Hand-written metadata with invalid values |
| The page's `background`, `border`, `grid` and an item's `iconColor` resolve palette references (`@accent`) like the other colours | Themes or metadata that used a palette reference there and relied on it being ignored |

## New in 0.5

- Editor modules: `scope.gesture(source)` and `scope.painter(painter)`, `EditorModuleApi.docType`, `when: { kind: [...] }` (installed only for those diagram types), `scope.canvas(type, f, options)`.
- [Extending the editor](./editor-modules), a guide to host modules.
- The editor's first chunk is about 16 kB smaller (gzip): the ER table editing and the sequence gestures load with their diagram type.
