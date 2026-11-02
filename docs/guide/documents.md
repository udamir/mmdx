# Saving documents

`<mmdx-editor>` loads and saves its document through a `DocumentAdapter` that the host provides. The adapter is three small functions; the editor handles the rest — the save flow, conflicts, live updates from other users, autosave and the unload guard.

## Two ways to connect the editor

**With an adapter**, the editor loads the document itself, saves with ⌘S / Ctrl+S or `save()`, and tracks the document's version for conflict detection:

```ts
import '@mmdx/studio/editor';
import { httpDocumentAdapter } from '@mmdx/studio/adapters';

const editor = document.querySelector('mmdx-editor')!;
editor.adapter = httpDocumentAdapter('/api/diagrams/architecture.mmdx');
editor.addEventListener('mmdx-dirty', (e) => setUnsaved(e.detail.dirty));
```

**Without an adapter**, the host owns the document: set `value` and read every change from `mmdx-change`:

```ts
editor.value = source;
editor.addEventListener('mmdx-change', (e) => store(e.detail.source));
```

`mmdx-change` `{ source, reason }` fires on every change either way; `reason` is `op` (a canvas edit), `code` (an edit in the code panel), `undo`, `redo`, `load` or `remote`.

## The DocumentAdapter interface

```ts
interface DocumentAdapter {
  load(): Promise<{ source: string; name?: string; version?: string }>;
  /** Always .mmdx content. */
  save(source: string, ctx: { version?: string }): Promise<{ version?: string } | { conflict: { source: string; version: string } }>;
  /** Live updates from the host (another tab or user). Returns an unsubscribe function. */
  subscribe?(cb: (source: string, version: string) => void): () => void;
}
```

- `load()` returns the source, optionally a file `name` (used for exports, the extension is dropped) and a `version` — an ETag, a revision number, anything the backend uses to detect concurrent saves.
- `save(source, { version })` receives the version the editor's copy is based on. It returns the new version, or `{ conflict }` with the other side's source and version when someone else saved first.
- `subscribe(cb)` is optional: call `cb(source, version)` when the document changed elsewhere.

Write your own for any backend:

```ts
import type { DocumentAdapter } from '@mmdx/studio/editor';

const adapter: DocumentAdapter = {
  load: async () => api.get(id),                                    // { source, version? }
  save: async (source, { version }) => api.put(id, source, version), // { version? } or { conflict: { source, version } }
  subscribe: (cb) => api.watch(id, (d) => cb(d.source, d.version)), // returns an unsubscribe function
};
```

`DocumentAdapter` and the built-in adapters are exported by `@mmdx/studio/editor` and `@mmdx/studio/adapters`.

## httpDocumentAdapter

`httpDocumentAdapter(url, { headers?, credentials? })` is the reference adapter for a REST endpoint:

| Step | Request | Response |
|---|---|---|
| Load | `GET url` | The body is the source; the `ETag` header is the version |
| Save | `PUT url` with the source as body, `Content-Type: text/vnd.mermaid; charset=utf-8`, and `If-Match: <version>` when the editor has one | `2xx`: saved, the `ETag` header is the new version; `412 Precondition Failed`: a conflict — the adapter loads the current document and reports it |

Requests use `credentials: 'same-origin'` unless you pass other `credentials`; `headers` are added to every request (an authorization header, for example). Any other error status rejects, and the editor reports the failure. It has no `subscribe`.

A minimal server needs to compare `If-Match` with the stored version:

```ts
// PUT /api/diagrams/:name (any framework)
const current = await db.get(name);
if (req.headers['if-match'] && req.headers['if-match'] !== current.etag) return res.status(412).end();
const etag = `"${crypto.randomUUID()}"`;
await db.put(name, { source: req.body, etag });
res.setHeader('ETag', etag).status(204).end();
```

## memoryDocumentAdapter

`memoryDocumentAdapter(source, name = 'diagram')` keeps the document in memory — for tests, demos and prototypes. Besides the adapter methods it has `current` (the saved source) and `setRemote(source)`, which simulates a change by someone else (a new version, reported to `subscribe`):

```ts
import { memoryDocumentAdapter } from '@mmdx/studio/adapters';

const adapter = memoryDocumentAdapter('flowchart LR\n  a --> b\n', 'demo');
editor.adapter = adapter;
// later: someone else saves
adapter.setRemote('flowchart LR\n  a --> b --> c\n');
```

The editors on this portal run on it:

<MmdxDemo kind="editor" example="simple-flow" />

## The save flow

`save()` (also ⌘S / Ctrl+S in the editor) runs:

1. `mmdx-save` `{ source }` — cancelable. Cancel it to save yourself; the adapter is then not called.
2. `adapter.save(source, { version })`.
3. On success, the editor marks the source as saved, keeps the new version and fires `mmdx-saved` `{ source, version }`.
4. On a conflict, `mmdx-conflict` `{ mine, theirs, version }` fires and a dialog asks what to do (below).
5. On an error, a toast shows it and `mmdx-error` fires with a `save.failed` diagnostic.

`save()` resolves to an outcome: `'saved'`, `'cancelled'`, `'conflict'`, `'failed'` or `'no-adapter'`. A save started while another one runs returns the running one.

```ts
const outcome = await editor.save();
if (outcome === 'conflict') notify('Someone else saved this diagram');
```

## Conflicts

When the adapter reports a conflict, a dialog — *Someone else saved this diagram* — offers three choices:

- **Keep mine** saves your version again over theirs (based on their version).
- **Take theirs** replaces your document with theirs, as an undoable change.
- **View both** shows the two sources side by side, then *Keep mine* or *Take theirs*.

Closing the dialog keeps your unsaved changes as they are.

## Remote updates

When the adapter has `subscribe`, a change made elsewhere arrives while the editor is open:

- with no unsaved changes, it applies directly, as an undoable change (the view does not move);
- with unsaved changes, a bar — *Changed by someone else* — offers **Reload** (take theirs, as an undoable change) or **Keep mine** (with a versioned backend, your next save then meets the conflict dialog);
- during a drag or another edit in progress, it waits until the edit ends.

## Dirty state and the unload guard

The editor tracks whether its document differs from the saved one: `editor.dirty`, and `mmdx-dirty` `{ dirty }` on every change. `guard-unload` asks the browser to confirm leaving the page while there are unsaved changes:

```html
<mmdx-editor guard-unload></mmdx-editor>
```

It is opt-in, since single-page apps usually guard their own navigation.

## Autosave

`autosave` saves through the adapter a while after the last edit (debounced), in milliseconds; without a value it waits 1500 ms:

```html
<mmdx-editor autosave="3000"></mmdx-editor>
```

Only edits trigger it (loads and remote updates do not), and it waits while a drag or another edit is in progress. `autosave` and `guard-unload` are read when the editor is created; changing them on a live editor warns once.

## Loading

When an adapter is set, the editor loads its document. `mmdx-load` `{ source, version }` fires once it is in. A failed load shows a toast and fires `mmdx-error` with a `load.failed` diagnostic. `whenLoaded()` resolves once the adapter's document is in and rejects when the load failed (it rejects at once while the element is not connected):

```ts
editor.adapter = adapter;
await editor.whenLoaded();
editor.focusCode(1);
```

Setting another adapter loads its document; the old adapter's subscription ends.

## Drafts

`setSource(src, options)` replaces the document. Its options make it restore an unsaved draft — for example, one the host kept from an earlier session:

| Option | Default | Meaning |
|---|---|---|
| `history` | `'reset'` | `'reset'`: a new undo history; `'push'`: an undoable change |
| `fit` | `true` | Fit the view to the new document |
| `markSaved` | `true` | `false` keeps the new source as unsaved changes |

```ts
editor.adapter = adapter;
editor.storage = storage;
await editor.whenLoaded(); // the adapter's document is in, so the load cannot overwrite the draft
if (draft) editor.setSource(draft, { history: 'push', markSaved: false });
```

With `{ history: 'push', markSaved: false }` the draft shows as unsaved changes, and the user can undo back to the saved document. Keep the draft up to date from `mmdx-change`, and drop it on `mmdx-saved`:

```ts
editor.addEventListener('mmdx-change', (e) => {
  if (e.detail.reason !== 'load') host.saveDraft(e.detail.source);
});
editor.addEventListener('mmdx-saved', () => host.dropDraft());
```

## Read-only and exports

`read-only` opens the editor in View mode only. `name` sets the file name of exports (default `diagram`, or the adapter's `name`). `exportAs('mmdx' | 'mmd' | 'svg' | 'png')` exports the document; the `mmdx-export` event is cancelable, to upload instead of downloading.

See [`<mmdx-editor>`](/components/editor) for every attribute, event and method, and [Version history](/guide/history) for versions and Restore.
