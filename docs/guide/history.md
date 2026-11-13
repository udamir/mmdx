# Version history

Give the editor, the viewer or the diff a diagram's versions and they show its history: a version panel that lists them, any version as it was, and any version compared with the current one in the visual diff. The components never write history; where the versions come from — a Git history, your backend's revisions, or snapshots you keep — is up to the host.

## Giving a component its versions

Every component takes the same thing in its `history` property: a `HistoryAdapter`, or a plain list of versions with their sources, newest first.

```ts
import { httpHistoryAdapter } from '@mmdx/studio/diff';

editor.history = httpHistoryAdapter('/api/diagrams/arch/versions'); // or a list, or your own { list, load }

viewer.history = [
  { id: 'v3', message: 'Add the cache', author: 'Ann', date: '2026-10-02T09:12:00Z', source: v3 },
  { id: 'v2', message: 'Split the API', author: 'Bob', date: '2026-09-21T15:40:00Z', source: v2 },
  { id: 'v1', message: 'First draft', source: v1 },
];
```

| Component | How History shows |
|---|---|
| `<mmdx-editor>` | With a `history`, the tool dock gets a History button (⇧H) |
| `<mmdx-viewer>` | With a `history` and the `history` control (`controls="… history"`) |
| `<mmdx-diff>` | With a `history`, the History panel lists the versions and the reviewer picks any two |

History's code loads on first use; no `@mmdx/studio/diff` import is needed on a page with only viewers or editors. Press the History button of this viewer:

<MmdxDemo example="docker-deploy-sequence" history controls="zoom history code fullscreen" />

## The HistoryAdapter interface

```ts
interface HistoryAdapter {
  /** Newest first. May page: pass `next` from the previous page as `cursor`. */
  list(cursor?: string): Promise<{ versions: VersionInfo[]; next?: string }>;
  /** The source of one version (untrusted: validated like any source). */
  load(id: string): Promise<string>;
  /** Calls `cb` when the history changed (a new version was saved); returns an unsubscribe. */
  subscribe?(cb: () => void): () => void;
}

interface VersionInfo {
  id: string;       // commit SHA, revision id or content hash
  message?: string;
  author?: string;
  date?: string;    // ISO date
  url?: string;
}
```

The components list the versions and load the sources of the versions they show, when they show them. `HistoryAdapter`, `staticHistory`, `httpHistoryAdapter` and `contentId` come from `@mmdx/studio/diff` and `@mmdx/studio/adapters`.

## staticHistory

`staticHistory(versions)` serves a list held in memory — each version is a `VersionInfo` plus its `source`. The versions may be in any order: they are listed newest first by date when every one has a date, else as given. A plain list given to `history` is wrapped in `staticHistory` for you.

```ts
import { staticHistory } from '@mmdx/studio/adapters';

diff.history = staticHistory(snapshots.map((s) => ({ id: s.id, date: s.savedAt, message: s.note, source: s.text })));
```

`contentId(text)` returns a short, stable hash of a text (7 hex digits), an id for versions that have none.

## httpHistoryAdapter

`httpHistoryAdapter(url, init?)` reads a history from two endpoints:

| Request | Response |
|---|---|
| `GET url` | `{ "versions": [{ "id", "message", "author", "date", "url" }], "next": "…" }` newest first (or a plain array of versions) |
| `GET url?cursor=<next>` | The next page; `next` is absent on the last page |
| `GET url/<id>` | The source text of one version |

```json
{
  "versions": [
    { "id": "9f2c1e7", "message": "Add the cache", "author": "Ann", "date": "2026-10-02T09:12:00Z" },
    { "id": "4b8d0a2", "message": "Split the API", "author": "Bob", "date": "2026-09-21T15:40:00Z" }
  ],
  "next": "page-2"
}
```

Requests use `credentials: 'same-origin'`, overridden by `init` (a `RequestInit`, for headers). Records from the server are untrusted: only `id` and the known string fields are kept, and an error status rejects.

## GitHub and GitLab

For a file in a Git repository, write the two calls against the host's commits and raw file APIs. GitHub:

```ts
import type { HistoryAdapter } from '@mmdx/studio/diff';

const repo = 'acme/platform';
const path = 'docs/arch.mmdx';
const gh = (url: string, accept = 'application/vnd.github+json') =>
  fetch(`https://api.github.com/repos/${repo}${url}`, { headers: { Accept: accept, Authorization: `Bearer ${token}` } });

interface Commit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } };
}

export const githubHistory: HistoryAdapter = {
  async list(cursor) {
    const page = Number(cursor ?? '1');
    const commits = (await (await gh(`/commits?path=${encodeURIComponent(path)}&per_page=30&page=${page}`)).json()) as Commit[];
    const versions = commits.map((c) => ({
      id: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
    return commits.length === 30 ? { versions, next: String(page + 1) } : { versions };
  },
  async load(sha) {
    return (await gh(`/contents/${path}?ref=${sha}`, 'application/vnd.github.raw+json')).text();
  },
};
```

GitLab:

```ts
const project = encodeURIComponent('acme/platform');
const file = encodeURIComponent('docs/arch.mmdx');
const gl = (url: string) => fetch(`https://gitlab.com/api/v4/projects/${project}${url}`, { headers: { 'PRIVATE-TOKEN': token } });

export const gitlabHistory: HistoryAdapter = {
  async list(cursor) {
    const r = await gl(`/repository/commits?path=${file}&per_page=30&page=${cursor ?? '1'}`);
    const commits = (await r.json()) as { id: string; title: string; author_name: string; created_at: string; web_url: string }[];
    const next = r.headers.get('X-Next-Page');
    const versions = commits.map((c) => ({ id: c.id, message: c.title, author: c.author_name, date: c.created_at, url: c.web_url }));
    return next ? { versions, next } : { versions };
  },
  async load(sha) {
    return (await gl(`/repository/files/${file}/raw?ref=${sha}`)).text();
  },
};
```

Keep tokens on a server you control when the page is public: proxy the two calls through your backend and use `httpHistoryAdapter` against it.

## History in the editor

With a `history`, the History button of the tool dock (⇧H) opens the version panel next to the Code panel — the versions you give it, plus the working copy when it differs from the newest one (it follows the document). Opening it changes nothing else: the current version is selected and the diagram stays editable.

- **History tab**: pick an older version and the editor shows it as it was, drawn exactly like the document (page, canvas, theme) but read-only: Shapes, Properties and Undo / Redo leave the dock, Code and Layers stay (read-only), items can be selected and the bar over them has **Copy** (⌘C; paste into the document later), and Export exports that version (its id in the file name). Picking the current version again brings editing back.
- **Compare tab**: pick a version and it is compared with the current one (Before, Merged, After, Side by side, filters, change list, code diff in the Code panel's place), on the editor's own canvas and page; the timeline's dots and Swap change the pair. Switching tabs alone shows nothing new, and the panels stay as they were.
- Every switch — document, version, comparison — animates from where things are on screen.
- **Back** (the pill at the top, or Esc) returns to the current version and keeps the panel; closing the panel only hides it while a version or comparison shows (the History button brings it back), and leaves History otherwise.
- **Restore this version** (Edit mode, in an older version's ⋯ menu) opens it in the editor as an undoable change. It fires `mmdx-history-restore` `{ id, source }` first, which is cancelable.

<MmdxDemo kind="editor" example="production-microservices" history />

## History in the viewer

The viewer's `history` control does the same without editing, Restore or the read-only editor: a version shows in the diff's canvas.

```html
<mmdx-viewer src="/diagrams/arch.mmdx" controls="zoom history fullscreen"></mmdx-viewer>
<script type="module">
  import '@mmdx/studio/viewer';
  import { httpHistoryAdapter } from '@mmdx/studio/adapters';
  document.querySelector('mmdx-viewer').history = httpHistoryAdapter('/api/diagrams/arch/versions');
</script>
```

## History in the diff

`<mmdx-diff>` with a `history` has a History panel with two tabs: **Compare** two versions (`base` and `head` attributes, default the newest two) and **History** (view one version as it is; `mode="history"`). Methods: `setHistory(adapterOrList)`, `setPair(baseId, headId)`, `viewVersion(id)`. `mmdx-version` `{ base, head, viewing? }` fires on every change of the pair or the viewed version, to keep your URL in sync:

```ts
diff.history = httpHistoryAdapter('/api/diagrams/arch/versions');
diff.addEventListener('mmdx-version', (e) => {
  const { base, head } = e.detail;
  window.history.replaceState(null, '', `?base=${base}&head=${head}`);
});
```

<MmdxDemo kind="diff" example="simple-flow" history />

## Opening History from code

`toggleHistory(on?, { compare? })` on the editor and the viewer opens or closes History; `compare: true` opens it on the newest change compared. While it is open, `historySession` gives the `<mmdx-diff>` methods over what it shows (`null` while History is closed):

```ts
editor.toggleHistory(true, { compare: true });
const session = editor.historySession!;
session.setView('side');                  // 'before' | 'merged' | 'after' | 'side'
session.setFilters(['added', 'removed', 'content']); // layout and style changes ignored
session.next();                           // select the next change
console.log(session.pair, session.getDiff()?.counts);
session.close();
```

`HistorySession` has `setPair`, `viewVersion`, `setView`, `setFilters`, `select`, `next`, `prev`, `pair` (all `null` while nothing older is picked), `getDiff()`, `exportAs(kind, options?)` and `close()`.

## Events

History in the editor and the viewer reports through `mmdx-history-*` events (bubbling, composed):

| Event | Detail | When |
|---|---|---|
| `mmdx-history-open`, `mmdx-history-close` | — | History opens or is left |
| `mmdx-history-show` | `{ shown: 'none' \| 'version' \| 'compare' }` | What the canvas shows changes |
| `mmdx-history-version` | `{ base, head, viewing? }` | A version or pair is picked |
| `mmdx-history-compare` | as `<mmdx-diff>`'s `mmdx-compare` | A comparison is ready |
| `mmdx-history-select`, `-view`, `-mode`, `-filters`, `-export` | as `<mmdx-diff>`'s `mmdx-select`, `mmdx-view`, `mmdx-mode`, `mmdx-filters`, `mmdx-export` | The reviewer selects a change, switches the view or the tab, changes the filters or exports |
| `mmdx-history-restore` | `{ id, source }` (cancelable) | Restore this version, in the editor |
| `mmdx-history-error` | `{ diagnostics }` | A version could not be loaded |

The [events reference](/api/events) lists every event of every component.

## The studio's history

`<mmdx-studio>` keeps history itself: an example's own history (the `history` file of its manifest entry, `{ versions: [{ id, message, author, date, source }] }` newest first) and the versions you record with **Save version** or ⌘S, kept in browser storage per document. Its **Diff** mode opens the editor's History on the newest change compared. See [`<mmdx-studio>`](/components/studio).
