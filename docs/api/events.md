# Events

Every component reports what happens through DOM `CustomEvent`s named `mmdx-*`, dispatched on the component's element (or on the `host` element given to the imperative class). Every event bubbles and is composed, so it crosses shadow roots and one listener on a parent or on `document` sees the events of every component under it. A few are cancelable: call `preventDefault()` to take over (route a link, save or export yourself, veto an edit). This page lists every event per component with its `detail` shape, as declared in the source.

```html
<mmdx-viewer src="/diagrams/architecture.mmdx" controls="zoom fullscreen"></mmdx-viewer>

<script type="module">
  import '@mmdx/studio/viewer';

  const viewer = document.querySelector('mmdx-viewer');
  viewer.addEventListener('mmdx-render', (e) => console.log(e.detail.type, e.detail.durationMs));
  viewer.addEventListener('mmdx-link', (e) => {
    e.preventDefault(); // the diagram does not open the link
    navigate(e.detail.href); // your router
  });
  // one listener for every component on the page
  document.addEventListener('mmdx-error', (e) => console.warn(e.target, e.detail.diagnostics));
</script>
```

## Dispatch rules

- **Bubbles, composed**: every `mmdx-*` event is created as `new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable })`. `cancelable` is `false` unless the tables below say otherwise.
- **Target**: the custom element itself. `DiagramViewer`, `DiagramEditor`, `DiagramDiff` and `ThemeEditor` used without the element dispatch on the `host` element passed to their constructor. `DiffSession` dispatches nothing itself: it calls the `emit(type, detail, cancelable)` function of its options.
- **Return value**: the components check the result of `dispatchEvent()`; when a cancelable event was prevented they stop the action, as listed below.
- **Destroyed components**: the viewer, the editor and the diff emit nothing while they are being destroyed (an element removed from the page), so modules closing on the way out send no events.
- **Inside other components**: an editor inside `<mmdx-studio>` dispatches inside the studio's shadow root; listeners outside see the event retargeted to `<mmdx-studio>`, and `e.composedPath()[0]` is the inner element.

### Cancelable events

| Event | Fired by | Canceling it |
|---|---|---|
| `mmdx-link` | viewer, editor, diff (also inside History) | The link is not opened; without a cancel it opens in the link policy's `target` (default `_blank`) |
| `mmdx-fullscreen-request` | viewer, editor, diff | The full-screen button does nothing; the host handles full screen itself |
| `mmdx-save` | editor | The adapter is not called and `save()` resolves `'cancelled'`; the document stays dirty until you call `markSaved()` |
| `mmdx-op` | editor | The edit is not applied (a gesture or metadata change is rolled back) |
| `mmdx-export` | editor, diff | Nothing is downloaded; `detail.data` holds the file to upload or store |
| `mmdx-history-export` | viewer, editor (History) | As `mmdx-export` |
| `mmdx-history-restore` | editor (History) | The version is not restored and History stays open |
| `mmdx-theme-save` | theme editor | Nothing is written to the store; a toast says saving was cancelled |

## Typed listeners

The event maps are interfaces whose values are the whole `CustomEvent` types, not the details: `ViewerEventMap` from `@mmdx/studio/viewer`, `EditorEventMap` from `@mmdx/studio/editor`, `DiffEventMap` from `@mmdx/studio/diff` and `ThemeEditorEventMap` from `@mmdx/studio/theme-editor`. The package declares the tag names (`HTMLElementTagNameMap`, so `document.querySelector('mmdx-viewer')` is an `MmdxViewerElement`) but does not add the events to `HTMLElementEventMap`; a listener gets a plain `Event` until you type it:

```ts
import type { ViewerEventMap } from '@mmdx/studio/viewer';

const viewer = document.querySelector('mmdx-viewer')!;
viewer.addEventListener('mmdx-render', (e) => {
  const { bounds, type, durationMs } = (e as ViewerEventMap['mmdx-render']).detail;
});

// the detail type alone
type RenderDetail = ViewerEventMap['mmdx-render']['detail']; // { bounds: Rect; type: string | null; durationMs: number }
```

A small helper keeps the type with the event name:

```ts
import type { DiffEventMap } from '@mmdx/studio/diff';

const onDiff = <K extends keyof DiffEventMap>(target: EventTarget, type: K, f: (e: DiffEventMap[K]) => void): void =>
  target.addEventListener(type, f as EventListener);

onDiff(document.querySelector('mmdx-diff')!, 'mmdx-compare', (e) => console.log(e.detail.counts.added));
```

::: details Typing every element's events at once
Merge the maps into `HTMLElementEventMap` in a declaration file of your app. The maps share their common events (`mmdx-render`, `mmdx-error`, `mmdx-link`, `mmdx-fullscreen`, `mmdx-ui`) with identical types, so they combine:

```ts
// mmdx-events.d.ts
import type { ViewerEventMap } from '@mmdx/studio/viewer';
import type { DiffEventMap } from '@mmdx/studio/diff';
import type { ThemeEditorEventMap } from '@mmdx/studio/theme-editor';

declare global {
  interface HTMLElementEventMap extends ViewerEventMap, DiffEventMap, ThemeEditorEventMap {}
}
```

Then `viewer.addEventListener('mmdx-render', (e) => e.detail.durationMs)` is typed without a cast. `EditorEventMap` does not merge with `DiffEventMap` (their `mmdx-export` details differ); type the editor's listeners with it directly, e.g. `(e as EditorEventMap['mmdx-dirty']).detail.dirty`.
:::

## `<mmdx-viewer>`

Typed by `ViewerEventMap` (`@mmdx/studio/viewer`). The History events are listed [below](#history-events).

| Event | Detail | Cancelable | Bubbles / composed | When |
|---|---|---|---|---|
| `mmdx-render` | `{ bounds: Rect; type: string \| null; durationMs: number }` | no | yes | After every render: the first one and each re-render (new `source` or `src`, theme, layers, labels). With the stock Mermaid fallback, `type` is `null`, `bounds` all `0` and `durationMs` `0` |
| `mmdx-error` | `{ diagnostics: Diagnostic[] }` | no | yes | A render reports warnings or errors (`info` diagnostics are left out, except `theme.missing`); a render fails and the error panel shows (e.g. `load.failed` when `src` cannot be fetched); `toPng()` drew with local fonts (`export.font-missing`, `warning`: one diagnostic, the families in `params.fonts`) or left out remote images (`export.image-missing`, `warning`) |
| `mmdx-link` | `{ href: string; id: string \| null }` | yes | yes | A click on a link in the diagram (not the end of a pan, not with the pen). `id` is the item's id |
| `mmdx-fullscreen-request` | `{ enter: boolean }` | yes | yes | The full-screen button is pressed, before anything happens; `enter` is `true` when it would enter full screen |
| `mmdx-fullscreen` | `{ active: boolean }` | no | yes | Full screen started or ended (the browser's, or the host's through the `fullscreen` property) |
| `mmdx-ui` | `{ ui: 'light' \| 'dark' }` | no | yes | The user picked light or dark with the scheme toggle (`controls` with `theme`); not when the `ui` attribute changes |
| `mmdx-history-open` | `Record<string, never>` | no | yes | History opened (`history` control) |
| `mmdx-history-close` | `Record<string, never>` | no | yes | History closed |

## `<mmdx-editor>`

Typed by `EditorEventMap` (`@mmdx/studio/editor`), which also declares the History events listed [below](#history-events). It sends no `mmdx-render`. `ItemRef` and `Diagnostic` come from `@mmdx/studio/core`.

| Event | Detail | Cancelable | Bubbles / composed | When |
|---|---|---|---|---|
| `mmdx-load` | `{ source: string; version: string \| null }` | no | yes | The adapter's document is in, after every load from the `adapter` (`whenLoaded()` resolves then) |
| `mmdx-change` | `{ source: string; reason: 'op' \| 'code' \| 'undo' \| 'redo' \| 'load' \| 'remote' }` | no | yes | The document changed. `op`: an edit; `code`: typed in the code panel; `undo` / `redo`; `load`: the adapter's load, `setSource()` with the default `history: 'reset'`, an opened file; `remote`: an update from `adapter.subscribe`, `setSource(src, { history: 'push' })`, a restored version |
| `mmdx-dirty` | `{ dirty: boolean }` | no | yes | Right after every `mmdx-change`, with the current state. Saving (`mmdx-saved`, `markSaved()`) clears `dirty` without this event |
| `mmdx-save` | `{ source: string }` | yes | yes | Before saving: Save button, ⌘S, `save()`, autosave. Fires without an adapter too (`save()` then resolves `'no-adapter'`), so a host can save itself |
| `mmdx-saved` | `{ source: string; version: string \| undefined }` | no | yes | The adapter saved; `version` is the adapter's new version |
| `mmdx-conflict` | `{ mine: string; theirs: string; version: string }` | no | yes | The adapter reported a conflict on save, before the dialog that offers Keep mine, Take theirs or View both |
| `mmdx-op` | `{ type: string; code?: string }` | yes | yes | Before every edit is committed: a gesture, a metadata change (styles, positions), a code rewrite (`code` is the new Mermaid code; `type: 'code.replace'` from the code panel), an opened file (`type: 'doc.open'`). `type` is the operation's label. Not for undo, redo or `setSource()` |
| `mmdx-selection` | `{ items: ItemRef[] }` | no | yes | The document's selection changed, however it changed (canvas, `select(items)`, undo, redo, a load), once per change and not when the editor is created; not while History shows an old version |
| `mmdx-export` | `{ kind: 'mmdx' \| 'mmd' \| 'svg' \| 'png'; name: string; data: string \| Blob; type: string }` | yes | yes | An export is built (menu or `exportAs(kind)`), before the download. `type` is the MIME type |
| `mmdx-link` | `{ href: string; id: string \| null }` | yes | yes | A click on a link or a linked item in View mode |
| `mmdx-fullscreen-request` | `{ enter: boolean }` | yes | yes | As on the viewer |
| `mmdx-fullscreen` | `{ active: boolean }` | no | yes | As on the viewer |
| `mmdx-ui` | `{ ui: 'light' \| 'dark' }` | no | yes | The user picked light or dark with the scheme toggle |
| `mmdx-error` | `{ diagnostics: Diagnostic[] }` | no | yes | The adapter's load failed (`load.failed`), a save failed (`save.failed`), an export failed (`export.failed`), a PNG export used local fonts (`export.font-missing`, `warning`: one diagnostic, the families in `params.fonts`) or left out remote images whose host does not allow CORS (`export.image-missing`, `warning`) |

Saving runs `mmdx-save` → `adapter.save(source, { version })` → `mmdx-saved`, or `mmdx-conflict` and the dialog, or `mmdx-error` when the adapter throws.

::: tip Unsaved state
`mmdx-dirty` follows the changes, not the saves. To show an unsaved marker, set it from `mmdx-dirty` and clear it on `mmdx-saved` (or read `editor.dirty` in both).
:::

## History events

History runs inside `<mmdx-viewer>` (the `history` control) and `<mmdx-editor>` (the `history` property). Its version panel and diff send the `<mmdx-diff>` events under History names: `mmdx-compare` becomes `mmdx-history-compare`, and so on (the session's `mmdx-render` is not passed on). History adds `open`, `close`, `show`, `mode` and `restore`. `mmdx-link` and the full-screen events keep their names. The details match `DiffEventMap` (`DiffEventMap['mmdx-compare']['detail']` types `mmdx-history-compare`); `ViewerEventMap` and `EditorEventMap` declare `mmdx-history-open`, `mmdx-history-close`, `mmdx-history-show`, `mmdx-history-version`, `mmdx-history-restore` and `mmdx-history-error`.

| Event | Detail | Cancelable | Bubbles / composed | When |
|---|---|---|---|---|
| `mmdx-history-open` | `Record<string, never>` | no | yes | History opened (the History button, ⇧H, `toggleHistory(true)`) |
| `mmdx-history-close` | `Record<string, never>` | no | yes | History closed; not when the component is destroyed |
| `mmdx-history-show` | `{ shown: 'none' \| 'version' \| 'compare' }` | no | yes | When History opens and whenever what it shows changes: nothing older, a version as it is, a comparison |
| `mmdx-history-compare` | `{ counts: DiffResult['counts']; typeChanged: boolean; base: string \| null; head: string \| null }` | no | yes | A comparison was rendered |
| `mmdx-history-version` | `{ base: string \| null; head: string \| null; viewing?: string }` | no | yes | The compared pair changed, or a version is shown as it is (`viewing`; `base` and `head` are `null` then) |
| `mmdx-history-select` | `{ key: string \| null; change: ItemChange \| null }` | no | yes | A change was selected or the selection cleared |
| `mmdx-history-view` | `{ view: DiffViewName; mode: DiffMode }` | no | yes | Before, Merged, After or Side by side was picked |
| `mmdx-history-mode` | `{ mode: DiffMode; viewOnly: boolean }` | no | yes | The version panel's tab changed, or one version as it is started or ended |
| `mmdx-history-filters` | `{ filters: DiffFilter[]; dim: boolean }` | no | yes | The change filters or dimming changed |
| `mmdx-history-export` | `{ kind: DiffExportKind; name: string; data: string \| Blob }` | yes | yes | A History export is built, before the download |
| `mmdx-history-restore` | `{ id: string; source: string }` | yes | yes | Restore this version (editor, Edit mode), before the editor loads it as an undoable change |
| `mmdx-history-error` | `{ diagnostics: Diagnostic[] }` | no | yes | A version or a page of the history could not be loaded (`load.failed`), or a compared version has render warnings |

See [History](/guide/history) for what the panel does.

## `<mmdx-diff>`

Typed by `DiffEventMap` (`@mmdx/studio/diff`, which also exports `DiffResult`, `ItemChange`, `DiffViewName`, `DiffMode`, `DiffFilter` and `DiffExportKind`). `DiffResult['counts']` has a number per status and facet: `added`, `removed`, `changed`, `content`, `layout`, `style`.

| Event | Detail | Cancelable | Bubbles / composed | When |
|---|---|---|---|---|
| `mmdx-compare` | `{ counts: DiffResult['counts']; typeChanged: boolean; base: string \| null; head: string \| null }` | no | yes | After every comparison is rendered; `base` and `head` are the version ids |
| `mmdx-select` | `{ key: string \| null; change: ItemChange \| null }` | no | yes | A change was selected or the selection cleared (click, `select(key)`, `next()`, `prev()`) |
| `mmdx-view` | `{ view: DiffViewName; mode: DiffMode }` | no | yes | The shown view changed (`'before' \| 'merged' \| 'after' \| 'side'`, the bar or `setView()`) |
| `mmdx-mode` | `{ mode: DiffMode; viewOnly: boolean }` | no | yes | The version panel's tab changed (`'compare' \| 'history'`), or History mode (one version as it is) started or ended |
| `mmdx-filters` | `{ filters: DiffFilter[]; dim: boolean }` | no | yes | The shown change kinds or dimming changed (`setFilters()`, the filter toggles) |
| `mmdx-version` | `{ base: string \| null; head: string \| null; viewing?: string }` | no | yes | The compared pair changed (`setPair()`, the timeline) or a version is viewed as it is (`viewVersion(id)`, with `viewing`); sync your URL here |
| `mmdx-export` | `{ kind: DiffExportKind; name: string; data: string \| Blob }` | yes | yes | An export is built (`exportAs()` or the menu), before the download |
| `mmdx-render` | `{ bounds: Rect; type: string \| null; durationMs: number }` | no | yes | After every render; `bounds` of the diff (of the viewed version in History mode), `type` of the After version |
| `mmdx-error` | `{ diagnostics: Diagnostic[] }` | no | yes | Render warnings or errors of either version (`info` left out, except `theme.missing`); a version or a page of the history could not be loaded (`load.failed`); `toPng()` used local fonts (`export.font-missing`, `warning`) or left out remote images (`export.image-missing`, `warning`) |
| `mmdx-fullscreen` | `{ active: boolean }` | no | yes | Full screen started or ended |
| `mmdx-fullscreen-request` | `{ enter: boolean }` | yes | yes | The full-screen button is pressed, before anything happens (dispatched by the shared zoom bar; not declared in `DiffEventMap`) |
| `mmdx-link` | `{ href: string; id: string \| null }` | yes | yes | ⌘ / Ctrl + click on a link in the diagram |
| `mmdx-ui` | `{ ui: 'light' \| 'dark' }` | no | yes | The user picked light or dark with the scheme toggle |

## `<mmdx-theme-editor>`

Typed by `ThemeEditorEventMap` (`@mmdx/studio/theme-editor`, which also exports `ThemeFile`). The theme editor sends no `mmdx-error` or `mmdx-ui`.

| Event | Detail | Cancelable | Bubbles / composed | When |
|---|---|---|---|---|
| `mmdx-theme-save` | `{ theme: ThemeFile }` | yes | yes | A validated theme is about to be written to the store (`detail.theme` is a copy) |
| `mmdx-theme-saved` | `{ theme: ThemeFile; version: string }` | no | yes | The store saved the theme (`version` from the store); it is registered in the shared registry, so open viewers and editors redraw with it |
| `mmdx-theme-dirty` | `{ id: string; dirty: boolean }` | no | yes | The draft became dirty or clean |
| `mmdx-theme-select` | `{ id: string }` | no | yes | A theme was opened, including the first one when the library loads |
| `mmdx-theme-close` | `{ id: string }` | no | yes | The dialog presentation closed (after the unsaved-changes question) |

A store conflict on save opens a dialog (Cancel, Reload, Overwrite) instead of an event.

## `<mmdx-studio>`

The studio dispatches no events of its own and re-dispatches none. Its `<mmdx-editor>` and the theme editor dialog live in its shadow root, and their composed events reach the `<mmdx-studio>` element and the page (retargeted: `e.target` is the studio). The studio listens to its editor itself:

- `mmdx-save`: it calls `preventDefault()`, downloads the `.mmdx` file, records a version and marks the document saved. A listener on the studio sees `defaultPrevented: true`.
- `mmdx-change` and `mmdx-dirty`: it keeps the document as its `persist` option says (browser storage) and marks the file name unsaved.
- `mmdx-history-show` and `mmdx-history-close`: the Edit / View / Diff switch follows what History shows.
- `mmdx-ui`: it remembers the light / dark choice for the whole studio.
- `mmdx-theme-saved` (from the theme editor dialog): the editor redraws.

## `Diagnostic`

`mmdx-error` and `mmdx-history-error` carry `Diagnostic` objects from `@mmdx/studio/core` (see [`Diagnostic`](/api/core#diagnostic)):

```ts
interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  /** English text; `code` is the i18n key. */
  message: string;
  /** Stable machine code, e.g. `flow.unknown-arrow`. */
  code: string;
  range?: SourceRange;
  /** Set when the diagnostic belongs to the `%%@` metadata rather than the Mermaid code. */
  source?: 'code' | 'meta';
  params?: Readonly<Record<string, string | number>>;
  fix?: DiagnosticFix;
}
```

Besides the parser's and renderer's codes (the renderer's `image.blocked`: an image the [image policy](/guide/security#image-policy) refused, with its `reason` in `params`), the components send `load.failed`, `save.failed`, `export.failed`, `export.font-missing`, `export.image-missing`, `doc.too-large` (a render in the worker took too long), `mermaid.failed` (the stock Mermaid fallback failed) and `theme.missing`. Switch on `code`, not on `message`.

## React wrappers

The wrappers of `@mmdx/studio/react` (React 18 and older) map every `onMmdx*` prop to an event listener on the element: the part after `on` goes from PascalCase to kebab case, so `onMmdxRender` listens to `mmdx-render`, `onMmdxFullscreenRequest` to `mmdx-fullscreen-request`, `onMmdxThemeSaved` to `mmdx-theme-saved` and `onMmdxHistoryOpen` to `mmdx-history-open`. Any `mmdx-*` event works this way, including the bubbling events of inner components. One listener per event type calls the handler of the latest render (it is re-attached only when the set of `onMmdx…` props changes, and removed on unmount), so inline functions are fine. The handler type is `(ev: CustomEvent) => void`; cast to an event map entry for a typed `detail`:

```tsx
import React from 'react';
import '@mmdx/studio/viewer';
import type { ViewerEventMap } from '@mmdx/studio/viewer';
import { createReactWrappers } from '@mmdx/studio/react';

const { MmdxViewer } = createReactWrappers(React);

<MmdxViewer
  src="/diagrams/architecture.mmdx"
  onMmdxRender={(e: ViewerEventMap['mmdx-render']) => console.log(e.detail.durationMs)}
  onMmdxLink={(e: ViewerEventMap['mmdx-link']) => {
    e.preventDefault();
    navigate(e.detail.href);
  }}
/>;
```

See [React](/api/react) for the wrappers and [Frameworks](/guide/frameworks) for React 19 and other frameworks.
