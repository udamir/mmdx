# Adapters

`@mmdx/studio/adapters` holds the host adapters: where the components keep UI preferences (`StorageAdapter`), where they read and save themes (`ThemeSource`, `ThemeStore`), how the editor loads and saves its document (`DocumentAdapter`), where the History reads the versions of a diagram (`HistoryAdapter`), where the editor's image tool finds and uploads pictures (`ImageStore`), and what the image and link URLs in a diagram point at (`UrlResolver`). The library never talks to a backend by itself: every adapter is an object of a few async functions, and the built-in ones cover memory, `localStorage`, plain HTTP and static files. The entry defines no element and loads no diagram code.

```ts
import {
  memoryStorage, localStorageAdapter, preloadedStorage,
  memoryThemeStore, fetchThemeSource, localStorageThemeStore, isLocalEdit,
  memoryDocumentAdapter, httpDocumentAdapter,
  staticHistory, httpHistoryAdapter, contentId, memoryImageStore, httpImageStore, relativeUrlResolver,
  type StorageAdapter, type ThemeSource, type ThemeStore, type DocumentAdapter, type HistoryAdapter, type ImageStore, type UrlResolver,
} from '@mmdx/studio/adapters';
```

Some element entries re-export the adapters they use, so a page that already imports the element needs no second import:

| Entry | Re-exports |
|---|---|
| `@mmdx/studio/adapters` | Everything on this page |
| `@mmdx/studio/editor` | The [document adapters](#documents): `DocumentAdapter`, `LoadResult`, `DocumentSaveResult`, `memoryDocumentAdapter`, `httpDocumentAdapter` |
| `@mmdx/studio/theme-editor` | The [theme](#themes) and [storage](#storage) adapters (all of them), plus the `ThemeFile` and `ThemeInfo` types |
| `@mmdx/studio/diff` | `staticHistory`, `httpHistoryAdapter`, `contentId`, `HistoryAdapter`, `StaticVersion`, `VersionInfo` |

## Storage

A `StorageAdapter` keeps UI preferences: panel sizes and visibility, the picked theme per component kind, the pen settings, the theme editor's samples and zoom, and in `<mmdx-studio>` the last document and the saved versions. It never holds the document of `<mmdx-editor>`. Every element takes one as its `storage` property; the default is `localStorageAdapter()` when `localStorage` exists, else `memoryStorage()`.

### `StorageAdapter`

```ts
interface StorageAdapter {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}
```

| Member | Description |
|---|---|
| `get(key)` | The stored value, or `undefined` when there is none. Synchronous: the components read preferences while they build their UI |
| `set(key, value)` | Stores a JSON-serialisable value |
| `remove(key)` | Drops the key |

The interface is synchronous. For an async store (a host's storage API), wrap it with [`preloadedStorage()`](#preloadedstorage).

### `memoryStorage()`

```ts
function memoryStorage(initial?: Record<string, unknown>): StorageAdapter
```

In-memory storage for tests, sandboxed iframes and hosts that persist nothing; preferences last for the page's life. Values are stored as JSON, so `get` returns a copy and a later change of a stored object is not seen. `initial` seeds the keys.

```ts
viewer.storage = memoryStorage({ panels: { code: true } });
```

### `localStorageAdapter()`

```ts
function localStorageAdapter(namespace?: string): StorageAdapter
```

`localStorage` under a key prefix, `mmdx.` by default (the key `ui` is stored as `mmdx.ui`). Values are stored as JSON. When `localStorage` is unavailable (private mode, sandboxed iframes) it returns a `memoryStorage()`; when a single call throws (a quota error), that call falls back to memory.

```ts
editor.storage = localStorageAdapter('docs-site.'); // keeps this site's keys apart from other mmdx pages on the origin
```

### `preloadedStorage()`

```ts
function preloadedStorage(
  read: () => Promise<Record<string, unknown>>,
  write: (key: string, value: unknown | undefined) => Promise<void>,
  opts?: PreloadedStorageOptions,
): Promise<StorageAdapter>
```

The synchronous `StorageAdapter` over an async key-value store, for hosts without `localStorage` (a sandboxed iframe that has the host's storage API). It awaits `read()` once, then serves reads from memory and writes each change through in the background; `remove(key)` writes `undefined`. Writes of one key reach the store in order. A failed write is ignored, or reported to `onError`, and the value stays in memory. The returned promise rejects when `read()` rejects.

```ts
const storage = await preloadedStorage(
  () => host.storage.getAll(),
  (key, value) => host.storage.set(key, value),
  { onError: (e, key) => console.warn(`mmdx: could not store ${key}`, e) },
);
viewer.storage = storage;
editor.storage = storage;
```

See [Embedding in sandboxed iframes](/guide/sandboxed-iframes) for the other host hooks.

### `PreloadedStorageOptions`

```ts
interface PreloadedStorageOptions {
  onError?: (error: unknown, key: string) => void;
}
```

| Field | Type | Description |
|---|---|---|
| `onError` | `(error: unknown, key: string) => void` | Called with a write that failed (the value stays in memory). Default: failed writes are ignored. An error thrown by `onError` itself does not stop later writes |

### Custom storage

Any object with the three methods works. A storage that keeps preferences for the browser tab only:

```ts
import type { StorageAdapter } from '@mmdx/studio/adapters';

const sessionPrefs: StorageAdapter = {
  get: (key) => {
    const raw = sessionStorage.getItem(`prefs.${key}`);
    return raw === null ? undefined : JSON.parse(raw);
  },
  set: (key, value) => sessionStorage.setItem(`prefs.${key}`, JSON.stringify(value)),
  remove: (key) => sessionStorage.removeItem(`prefs.${key}`),
};
```

## Themes

Viewers, editors and the theme editor read themes from a `ThemeSource`; the theme editor saves through a `ThemeStore`. A viewer or editor asks its source (its `themeSource` property, else `configure({ themeSource })`) only for a theme a diagram or attribute names that is not registered yet, with `get(id)`; a theme that extends another unknown theme pulls that one in too, and a missing theme leaves the diagram on the base theme with a diagnostic. The theme editor lists every theme of its `store` and its `source`. The adapters do not validate theme files: the components validate them when they register them, and the theme editor before it saves. See [Themes](/guide/themes) and the [theme file reference](/api/theme-file).

### `ThemeSource`

```ts
interface ThemeSource {
  list(): Promise<ThemeInfo[]>;
  get(id: string): Promise<ThemeFile>;
  subscribe?(cb: () => void): () => void;
}
```

| Member | Description |
|---|---|
| `list()` | The themes the source has, as `ThemeInfo` (below) |
| `get(id)` | The theme file with that id; rejects when there is none |
| `subscribe(cb)` | Optional. Calls `cb` when the themes changed; returns an unsubscribe function. The theme editor re-reads its store's list on every call |

`ThemeInfo` (exported by `@mmdx/studio/core` and `@mmdx/studio/theme-editor`) is the summary `list()` returns:

```ts
interface ThemeInfo {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  extends: string | null;
  version?: string;
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Theme id |
| `name` | `string` | Display name (the built-in adapters use the id when the file has no `name`) |
| `appearance` | `'light' \| 'dark'` | The theme's appearance |
| `extends` | `string \| null` | The theme it builds on: `null` for the base theme `default-light`, else the file's `extends` or `default-light` |
| `version` | `string` | Optional. The store's version of the theme; the theme editor sends it back to `save` to detect a concurrent edit |

### `ThemeStore`

```ts
interface ThemeStore extends ThemeSource {
  save(theme: ThemeFile, opts: { version?: string }): Promise<SaveResult>;
  delete?(id: string): Promise<void>;
  publish?(id: string): Promise<void>;
  usage?(id: string): Promise<number>;
}
```

| Member | Description |
|---|---|
| `list()`, `get(id)`, `subscribe(cb)` | As in `ThemeSource` |
| `save(theme, opts)` | Writes the whole theme file. `opts.version` is the version the editor started from (from `list()` or the last save); it is absent for a new theme and when the user chose *Overwrite*. Resolves with the new version or a conflict ([`SaveResult`](#saveresult)); a rejection shows as a save error |
| `delete(id)` | Optional. Removes the theme. The theme editor's *Delete* needs it (and `can-delete`), and so does *Revert*, which deletes the store's copy of a theme that also exists in the source |
| `publish(id)` | Optional. The theme editor shows *Publish* when it exists and `can-publish` is set; unsaved changes are saved first |
| `usage(id)` | Optional. The number of diagrams that use the theme, when the host can tell; the theme list shows it |

When `save` reports a conflict, the theme editor asks whether to *Load theirs* (the conflicting file replaces the draft), *Overwrite* (saves again without a version) or cancel. Before every save it fires the cancelable `mmdx-theme-save` event; see [`<mmdx-theme-editor>`](/components/theme-editor).

### `SaveResult`

```ts
type SaveResult = { version: string } | { conflict: ThemeFile };
```

| Shape | Meaning |
|---|---|
| `{ version }` | Saved; `version` is the theme's new version |
| `{ conflict }` | Not saved: the theme changed since `opts.version`; `conflict` is the stored file |

### `memoryThemeStore()`

```ts
function memoryThemeStore(initial?: readonly ThemeFile[]): ThemeStore
```

Themes held in memory: the default store of `<mmdx-theme-editor>` (seeded with the built-in themes) and of tests. Versions are counters starting at `"1"`; `save` with an `opts.version` that is not the current one returns `{ conflict }`, and `save` without a version overwrites. It has `delete` and `subscribe` (called after every save and delete), but no `publish` or `usage`. Files are copied in and out.

```ts
import { memoryThemeStore, BUILTIN_THEMES } from '@mmdx/studio/theme-editor';

te.store = memoryThemeStore([...BUILTIN_THEMES, oceanTheme]);
```

### `fetchThemeSource()`

```ts
function fetchThemeSource(manifestUrl: string, init?: RequestInit): ThemeSource
```

Read-only themes from a manifest. The manifest lists theme files, resolved relative to the manifest URL (which is itself resolved against the page URL):

```json
{
  "themes": [
    "default-light.theme.json",
    "default-dark.theme.json",
    "github-light.theme.json",
    "github-dark.theme.json"
  ]
}
```

The manifest and every file are fetched once, on the first `list()` or `get()`, and cached; `get` returns a copy. `init` is passed to every `fetch` and defaults to `{ credentials: 'same-origin' }`. A manifest that fails (an HTTP error status, a network error) rejects the call, and the next call tries again. A theme file that answers with an HTTP error status is skipped, and so is a file without a string `id`. The source has no `subscribe`.

```ts
import { configure } from '@mmdx/studio/viewer';
import { fetchThemeSource } from '@mmdx/studio/adapters';

configure({ themeSource: fetchThemeSource('/themes/index.json') });
```

The package ships the built-in themes with such a manifest in `@mmdx/studio/themes/`. In a sandboxed iframe without relative `fetch`, register theme files from your bundle with `registerThemes(files)` instead; see [Embedding in sandboxed iframes](/guide/sandboxed-iframes).

### `localStorageThemeStore()`

```ts
function localStorageThemeStore(storage: StorageAdapter, base?: ThemeSource, key?: string): ThemeStore
```

Themes edited in this browser, layered over a read-only source: the store `<mmdx-studio>` uses. The edited files are kept as one object under `key` (default `themes`, so `mmdx.themes` with `localStorageAdapter()`) of `storage`.

- `list()` gives the `base` themes in their order, each replaced by its browser edit when there is one, then the themes that exist only in the browser. A `base` whose `list()` fails counts as empty.
- `get(id)` returns the browser edit, else `base.get(id)`.
- `save(theme)` stores the whole file and returns `{ version: String(Date.now()) }`. It ignores `opts.version` and never reports a conflict.
- `delete(id)` drops the browser edit: a theme that exists in `base` reverts to the source file, one that does not is gone.
- `subscribe(cb)` calls `cb` after every save and delete in this store, and, while it has subscribers, when `base` reports a change. It does not see writes from other tabs.

```ts
import { fetchThemeSource, localStorageAdapter, localStorageThemeStore } from '@mmdx/studio/theme-editor';

const base = fetchThemeSource('/themes/index.json'); // read-only themes to start from
te.store = localStorageThemeStore(localStorageAdapter(), base);
te.source = base;
```

### `isLocalEdit()`

```ts
function isLocalEdit(store: ThemeStore, source: ThemeSource | undefined, id: string): Promise<boolean>
```

True when the theme `id` in `store` differs from the same theme in `source`: a theme edited in the browser on top of a source file. It compares the two files as JSON (so key order counts) and resolves `false` when `source` is undefined or either `get` fails.

```ts
if (await isLocalEdit(store, base, 'github-light')) showBadge('edited in this browser');
```

### Custom theme store

A store over a REST backend, with the theme's ETag as its version:

```ts
import type { ThemeStore, ThemeFile } from '@mmdx/studio/theme-editor';

const api = '/api/themes';
const store: ThemeStore = {
  async list() {
    const r = await fetch(api);
    return r.json(); // [{ id, name, appearance, extends, version }]
  },
  async get(id) {
    const r = await fetch(`${api}/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  async save(theme, { version }) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (version) headers['If-Match'] = version;
    const r = await fetch(`${api}/${encodeURIComponent(theme.id)}`, { method: 'PUT', headers, body: JSON.stringify(theme) });
    if (r.status === 412) return { conflict: (await (await fetch(`${api}/${encodeURIComponent(theme.id)}`)).json()) as ThemeFile };
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { version: r.headers.get('ETag') ?? String(Date.now()) };
  },
  async delete(id) {
    await fetch(`${api}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
```

::: tip
Return `version` from `list()`: the theme editor takes the version it sends to `save` from there (and from the last save), so a store that leaves it out gets no conflict detection.
:::

## Documents

A `DocumentAdapter` is how `<mmdx-editor>` loads and saves its document. Set it as the editor's `adapter` property; without one, set `editor.value` and read changes from `mmdx-change`. See [Documents](/guide/documents) and [`<mmdx-editor>`](/components/editor).

### `DocumentAdapter`

```ts
interface DocumentAdapter {
  load(): Promise<LoadResult>;
  save(source: string, ctx: { version?: string }): Promise<DocumentSaveResult>;
  subscribe?(cb: (source: string, version: string) => void): () => void;
}
```

| Member | Description |
|---|---|
| `load()` | The document, its name and its version. Called when the adapter is set |
| `save(source, ctx)` | Writes the document. `source` is always `.mmdx` content (see [The .mmdx format](/guide/mmdx-format)). `ctx.version` is the version the editor last loaded or saved, absent when it knows none. Resolves with the new version or a conflict; a rejection is a failed save |
| `subscribe(cb)` | Optional. Live updates from the host (another tab or user): call `cb(source, version)` when the document changed elsewhere. Returns an unsubscribe function |

### `LoadResult`

```ts
interface LoadResult {
  source: string;
  name?: string;
  version?: string;
}
```

| Field | Type | Description |
|---|---|---|
| `source` | `string` | The document (`.mmdx` or plain Mermaid) |
| `name` | `string` | Optional. The file name; the editor drops a `.mmdx`, `.mmd`, `.md` or `.txt` extension and uses it as the export name |
| `version` | `string` | Optional. An opaque version (an ETag, a revision id) passed back to `save` |

### `DocumentSaveResult`

```ts
type DocumentSaveResult = { version?: string } | { conflict: { source: string; version: string } };
```

| Shape | Meaning |
|---|---|
| `{ version? }` | Saved. `version` is the new version; without one the editor keeps the version it had |
| `{ conflict: { source, version } }` | Not saved: someone else saved first. `source` and `version` are the stored document |

### How the editor uses it

- **Load**: setting `adapter` calls `load()` right away. The source replaces the document (the undo history starts over), `version` and `name` are kept, `subscribe` is called, and `mmdx-load` `{ source, version }` fires. A failed load shows a toast, fires `mmdx-error` (code `load.failed`) and rejects `whenLoaded()`. Setting another adapter unsubscribes from the old one and forgets its version.
- **Save** (the Save button, ⌘S, `save()`, or `autosave` after edits): `mmdx-save` `{ source }` fires first and is cancelable (to save yourself). Then `save(source, { version })`; on success the document is marked saved and `mmdx-saved` `{ source, version }` fires. A rejection shows a toast and fires `mmdx-error` (code `save.failed`). `save()` resolves with `'saved'`, `'cancelled'`, `'conflict'`, `'failed'` or `'no-adapter'`; calls while a save runs share it.
- **Conflict**: `mmdx-conflict` `{ mine, theirs, version }` fires and a dialog offers *Keep mine* (saves again with the conflicting version, overwriting theirs), *Take theirs* (their source replaces the document as an undoable change) or *View both* (both sources side by side, then keep mine or take theirs).
- **Remote updates** from `subscribe`: a source equal to the current one only updates the version. While the editor has no unsaved changes, the update applies directly as an undoable change. Otherwise a bar offers *Reload* or *Keep mine*; with *Keep mine* the editor keeps its old version, so the next save runs into the conflict check. During a drag or an open transaction the update waits until the edit ends.

### `memoryDocumentAdapter()`

```ts
function memoryDocumentAdapter(initial: string, name?: string): DocumentAdapter & {
  readonly current: string;
  setRemote(src: string): void;
}
```

A document held in memory, for tests and demos. `name` defaults to `diagram`. Versions are counters starting at `"1"`; `save` with a `ctx.version` that is not the current one returns a conflict with the stored document, and `save` without a version overwrites. Two extras:

| Member | Description |
|---|---|
| `current` | The stored source (what the last save wrote) |
| `setRemote(src)` | Simulates an edit elsewhere: stores `src`, bumps the version and calls the `subscribe` callbacks. A save that follows with the old version gets a conflict |

```ts
import { memoryDocumentAdapter } from '@mmdx/studio/editor';

const doc = memoryDocumentAdapter('flowchart TD\n  A --> B', 'demo');
editor.adapter = doc;
setTimeout(() => doc.setRemote('flowchart TD\n  A --> C'), 5000); // the editor applies it, or shows the Reload bar
```

### `httpDocumentAdapter()`

```ts
function httpDocumentAdapter(url: string, init?: {
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}): DocumentAdapter
```

The reference HTTP adapter: `GET` loads, `PUT` saves with `If-Match`, and `412` means someone else saved first. `credentials` defaults to `'same-origin'`; `headers` are added to every request (and may override the `Content-Type`).

| Step | Request | Response the adapter expects |
|---|---|---|
| Load | `GET url` | `2xx` with the source as the body; the `ETag` header, when present, becomes the version. Any other status rejects with `Load failed: HTTP <status>` |
| Save | `PUT url`, body: the source, `Content-Type: text/vnd.mermaid; charset=utf-8`, `If-Match: <version>` when the editor has a version | `2xx`: saved; the `ETag` header, when present, is the new version |
| Conflict | the `PUT` answered `412 Precondition Failed` | The adapter loads `url` again and returns `{ conflict }` with that source and its `ETag` (an empty string when there is none) |
| Error | any other status of the `PUT` | Rejects with `Save failed: HTTP <status>` (a failed save in the editor) |

The adapter has no `subscribe` and returns no `name`. Only `412` is a conflict: a server that answers a stale write with `409 Conflict` makes the save fail instead. The `ETag` is passed back as is, so a weak `W/"…"` tag must be one your server accepts in `If-Match`.

```ts
import { httpDocumentAdapter } from '@mmdx/studio/editor';

editor.adapter = httpDocumentAdapter('/api/diagrams/architecture.mmdx', {
  headers: { Authorization: `Bearer ${token}` },
});
```

The exchange, as `curl` calls a server must answer:

```bash
# load: the ETag is the version
curl -i https://example.com/api/diagrams/architecture.mmdx
# HTTP/1.1 200 OK
# ETag: "v7"

# save: 2xx with the new ETag, or 412 when the stored version is no longer "v7"
curl -i -X PUT https://example.com/api/diagrams/architecture.mmdx \
  -H 'Content-Type: text/vnd.mermaid; charset=utf-8' \
  -H 'If-Match: "v7"' \
  --data-binary @architecture.mmdx
```

### Custom document adapter

Write your own for any backend. `save` returns `{ conflict }` instead of throwing when the stored version moved on; `subscribe` pushes changes made elsewhere:

```ts
import type { DocumentAdapter } from '@mmdx/studio/editor';

const adapter: DocumentAdapter = {
  async load() {
    const d = await api.get(id); // { source, name, revision }
    return { source: d.source, name: d.name, version: String(d.revision) };
  },
  async save(source, { version }) {
    const r = await api.put(id, source, version);
    if (r.stale) return { conflict: { source: r.current.source, version: String(r.current.revision) } };
    return { version: String(r.revision) };
  },
  subscribe(cb) {
    const events = new EventSource(`/api/diagrams/${id}/events`);
    events.onmessage = (e) => {
      const d = JSON.parse(e.data);
      cb(d.source, String(d.revision));
    };
    return () => events.close();
  },
};
editor.adapter = adapter;
```

## History

A `HistoryAdapter` is where the History reads the versions of a diagram: `<mmdx-diff>`, and the History of `<mmdx-editor>` and `<mmdx-viewer>`. Each takes it as its `history` property, or a plain list of versions with their sources (see [`StaticVersion`](#staticversion)). The components never write history; they list versions (newest first, optionally paged) and load the source of the ones they show. See [History](/guide/history) and [`<mmdx-diff>`](/components/diff).

### `HistoryAdapter`

```ts
interface HistoryAdapter {
  list(cursor?: string): Promise<{ versions: VersionInfo[]; next?: string }>;
  load(id: string): Promise<string>;
  subscribe?(cb: () => void): () => void;
}
```

| Member | Description |
|---|---|
| `list(cursor?)` | Versions, newest first. May page: return `next`, and the component passes it back as `cursor` for the next, older page when the list scrolls that far or a comparison needs the version before. Versions whose id is already listed are dropped |
| `load(id)` | The source of one version. The source is untrusted and validated like any other. Sources are cached per id while the history is open, so a version's source must not change |
| `subscribe(cb)` | Optional. Call `cb` when the history changed (a new version was saved); the component reads the first page again and keeps the older pages it loaded. Returns an unsubscribe function |

### `VersionInfo`

```ts
interface VersionInfo {
  id: string;
  message?: string;
  author?: string;
  date?: string;
  url?: string;
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Commit SHA, revision id or content hash |
| `message` | `string` | Optional. Commit message or version label |
| `author` | `string` | Optional. Who saved the version |
| `date` | `string` | Optional. ISO date |
| `url` | `string` | Optional. A link to the version in the host (a commit page) |

`VersionInfo` is also the `before` / `after` of the change report (`diffReport`); see [Core](/api/core).

### `StaticVersion`

```ts
type StaticVersion = VersionInfo & { source: string };
```

A version with its source, for [`staticHistory()`](#statichistory). The components' `history` property accepts a list of them directly.

### `contentId()`

```ts
function contentId(text: string): string
```

The FNV-1a hash of a text as 7 hex digits: a stable id for versions that have none (pasted text, two plain sources). The same text always gives the same id.

```ts
const v: StaticVersion = { id: contentId(source), message: 'Draft', date: new Date().toISOString(), source };
```

### `staticHistory()`

```ts
function staticHistory(versions: readonly StaticVersion[]): HistoryAdapter
```

A history held in memory. `versions` may be in any order: when every one has a date that parses, they are listed newest first by date, else in the order given. One page, no `subscribe`; `load` of an unknown id rejects with `Unknown version <id>`. Passing a list to a `history` property does the same.

```ts
import { staticHistory } from '@mmdx/studio/diff';

diff.history = staticHistory([
  { id: 'a1', message: 'First draft', author: 'Ann', date: '2026-10-01T09:00:00Z', source: v1 },
  { id: 'b2', message: 'Add cache', author: 'Ben', date: '2026-10-03T14:30:00Z', source: v2 },
]);
```

### `httpHistoryAdapter()`

```ts
function httpHistoryAdapter(url: string, init?: RequestInit): HistoryAdapter
```

A history behind HTTP. Trailing slashes of `url` are dropped. Every request is a `GET` with `credentials: 'same-origin'`, overridden by `init` (headers, credentials, a signal); a non-`2xx` status rejects with `HTTP <status>`.

| Call | Request | Response |
|---|---|---|
| `list()` | `GET url` | JSON: `{ "versions": [...], "next": "..." }` newest first, or a plain array of versions |
| `list(cursor)` | `GET url?cursor=<cursor>` (`&cursor=` when `url` has a query string) | The next, older page, same shape |
| `load(id)` | `GET url/<id>` (the id URL-encoded) | The source text of that version |

The response is untrusted: entries without a string `id` are dropped, and only the string fields `id`, `message`, `author`, `date` and `url` are kept. `next` is used when it is a string; a plain array is one page. The adapter has no `subscribe`.

```json
{
  "versions": [
    { "id": "9f2c1e7", "message": "Add cache layer", "author": "Ben", "date": "2026-10-03T14:30:00Z", "url": "https://git.example.com/arch/commit/9f2c1e7" },
    { "id": "41ab0d3", "message": "First draft", "author": "Ann", "date": "2026-10-01T09:00:00Z" }
  ],
  "next": "41ab0d3"
}
```

```ts
import { httpHistoryAdapter } from '@mmdx/studio/diff';

editor.history = httpHistoryAdapter('/api/diagrams/arch/versions', { headers: { Authorization: `Bearer ${token}` } });
```

::: warning
`load(id)` appends `/<id>` to the whole `url`, query string included. Keep the history URL free of a query string, or write your own adapter.
:::

### Custom history adapter

For Git hosting, write the two calls against the commits and raw file APIs. A GitHub history of one file, paged by page number:

```ts
import type { HistoryAdapter } from '@mmdx/studio/diff';

const repo = 'acme/docs', path = 'diagrams/arch.mmdx';
const history: HistoryAdapter = {
  async list(cursor) {
    const page = Number(cursor ?? 1);
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=30&page=${page}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const commits = await r.json();
    return {
      versions: commits.map((c: any) => ({
        id: c.sha,
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      })),
      ...(commits.length === 30 ? { next: String(page + 1) } : {}),
    };
  },
  async load(sha) {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  },
};
diff.history = history;
```

## Images

An `ImageStore` is the host's image library: `<mmdx-editor>` takes it as its `images` property (the `images` option of `DiagramEditor`). The image tool's **Library** tab lists its pictures, and the **Upload** tab and a picture pasted or dropped on the canvas put files into it; the toolbar's **Change image** and the Properties panel open the tool on either, or on **URL**. A diagram never embeds a file: an image references the picture's `url`, which the [image policy](/guide/security#image-policy) checks like any image URL. See [Images](/components/editor#images).

### `ImageStore`

```ts
interface ImageStore {
  list(o?: { cursor?: string; query?: string }): Promise<{ images: ImageInfo[]; next?: string }>;
  get(id: string): Promise<ImageInfo>;
  put(file: Blob, o?: { name?: string }): Promise<ImageInfo>;
  delete?(id: string): Promise<void>;
  subscribe?(cb: () => void): () => void;
}
```

| Member | Description |
|---|---|
| `list(o?)` | Pictures, newest first. May page: return `next`, and the library passes it back as `cursor` for **Load more**. `query` is what the library's search holds (a name); a store may ignore it |
| `get(id)` | One picture's record |
| `put(file, o?)` | Stores a file (`o.name`: its file name) and resolves to its record; the image then references its `url`. Throw to refuse the file: the message is shown in the tool |
| `delete(id)` | Optional. Removes a picture from the store; diagrams that reference it keep the reference |
| `subscribe(cb)` | Optional. Call `cb` when the store changed elsewhere; an open library reads its first page again. Returns an unsubscribe function |

### `ImageInfo`

```ts
interface ImageInfo {
  id: string;
  url: string;
  thumb?: string;
  name?: string;
  w?: number;
  h?: number;
  type?: string;
  size?: number;
  date?: string;
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string` | The picture's id in the store |
| `url` | `string` | What a diagram references: a URL, or a reference of the store's own (`asset:42`) that a [`UrlResolver`](#urlresolver) maps to a URL when the diagram is drawn |
| `thumb` | `string` | Optional. A small version for the library's grid, loaded as is (default: `url`, through the resolver) |
| `name` | `string` | Optional. The file name or a title, shown and searched in the library |
| `w`, `h` | `number` | Optional. The pixel size |
| `type`, `size` | `string`, `number` | Optional. The MIME type and the size in bytes |
| `date` | `string` | Optional. ISO date of the upload |

### `memoryImageStore()`

```ts
function memoryImageStore(initial?: readonly ImageInfo[], o?: { url?: (file: Blob, id: string) => string | Promise<string>; pageSize?: number }): ImageStore
```

A store held in memory, for demos and tests: `initial` pictures, newest first; files put are added in front with the ids `img-1`, `img-2`…; `list` pages by `pageSize` (default 50) and filters by name. A put file is referenced by a `data:` URL of it unless `o.url` gives another reference — allow `data:` in the image policy for the default.

### `httpImageStore()`

```ts
function httpImageStore(url: string, init?: RequestInit): ImageStore
```

A store behind HTTP:

| Call | Request | Response |
|---|---|---|
| `list` | `GET url`, with `?cursor=…` for the next page and `?query=…` to filter | `{ images: ImageInfo[], next? }`, or a plain array |
| `get` | `GET url/<id>` | An `ImageInfo` |
| `put` | `POST url` with a multipart form: `file`, `name` | The stored picture's `ImageInfo` |
| `delete` | `DELETE url/<id>` | Any 2xx |

`init` is merged into every request (headers, credentials; `same-origin` credentials by default). Records are untrusted: only the known fields of the right type are kept, and a record without a string `id` and `url` is dropped.

## URLs

### `UrlResolver`

```ts
type UrlResolver = (url: string, kind: 'image' | 'link') => string | null | undefined;
```

What the URLs written in a diagram point at, set with [`configure({ resolveUrl })`](/api/configuration#resolveurl) or a component's `ctx`: called with each image and link URL as written, it returns the URL to use, or null / undefined to keep the written one. The image and link policies check the result; the diagram's code keeps what was written. A wrapper writes its own when its URLs mean something of its own — an issue tracker's attachments, for instance:

```ts
configure({
  resolveUrl: (url, kind) => (kind === 'image' && !/^[a-z][a-z0-9+.-]*:|^[/#]/i.test(url) ? `${issueUrl}/attachments/${encodeURIComponent(url)}` : null),
});
```

See [Security → Resolving URLs](/guide/security#resolving-urls).

### `relativeUrlResolver()`

```ts
function relativeUrlResolver(base: string | URL): UrlResolver
```

A resolver that makes relative image and link URLs (`img/logo.png`, `../guide.md`, `/files/a.png`) absolute against `base`, the folder of the document the diagram comes from; URLs with a scheme, protocol-relative ones (`//host/…`) and fragments (`#part`) stay as written, and so does a URL the base cannot resolve.

```ts
import { configure } from '@mmdx/studio/viewer';
import { relativeUrlResolver } from '@mmdx/studio/adapters';

configure({ resolveUrl: relativeUrlResolver(new URL('./diagrams/', location.href)) });
```

