# `<mmdx-diff>`

How a diagram changed between two versions, item by item (not line by line). Nodes, edges, tables, participants, messages, mindmap nodes, states and transitions are matched across the versions — renamed nodes, shifted sequence messages and moved mindmap branches included — and every change is **added**, **removed** or **changed**, with each change of a kept item classified as **content** (labels, shapes, connections, attributes, message text), **layout** (positions, sizes, bend points) or **style** (colours, presets, classes, theme). Give it two versions for a merge request review, or a diagram's whole history and let the reviewer pick any two.

```ts
import '@mmdx/studio/diff'; // <mmdx-diff>, DiagramDiff, history adapters
```

<MmdxDemo kind="diff" example="production-microservices" history panels="history changes" />

## Usage

Two versions, as URLs or as sources:

::: code-group

```html [URLs]
<mmdx-diff before="/api/files/arch.mmdx?ref=main" after="/api/files/arch.mmdx?ref=feature-x" style="height: 720px"></mmdx-diff>
```

```ts [Sources]
const diff = document.querySelector('mmdx-diff')!;
await diff.compare(baseSource, headSource); // or set diff.beforeSource / diff.afterSource
```

:::

The whole history of a diagram (newest first), with the History panel to pick any two versions:

```ts
import { httpHistoryAdapter } from '@mmdx/studio/diff';

diff.history = httpHistoryAdapter('/api/diagrams/arch/versions'); // or a list: [{ id, message, author, date, source }]
diff.setAttribute('panels', 'history changes');
```

Without custom elements, mount `DiagramDiff`:

```ts
import { DiagramDiff } from '@mmdx/studio/diff';

const diff = new DiagramDiff(host, { beforeSource, afterSource, view: 'side', filters: ['added', 'removed', 'content'] });
diff.set({ view: 'merged' });
diff.destroy();
```

Recipes:

```ts
// keep the compared pair in the URL
diff.addEventListener('mmdx-version', (e) => {
  const { base, head } = e.detail;
  history.replaceState(null, '', `?base=${base}&head=${head}`);
});

// upload a change report instead of downloading it
diff.addEventListener('mmdx-export', (e) => {
  if (e.detail.kind !== 'md') return;
  e.preventDefault();
  void api.comment(mergeRequest, e.detail.data as string);
});

// content changes only, nothing dimmed
diff.setFilters(['added', 'removed', 'content'], false);
```

## Attributes and properties

Each attribute sets the `DiffOptions` option of the same name in camelCase (`theme-dark` → `themeDark`); `new DiagramDiff(host, options)` and `diff.set(patch)` take every option. The Property column lists the element's own properties.

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `before`, `after` | — | `string` | — | URLs of the two versions, fetched through `loader` |
| — | `beforeSource`, `afterSource` | `string` | — | The two versions as sources (win over the URLs) |
| — | `history` | `HistoryAdapter \| readonly StaticVersion[]` | — | A version history, newest first (`{ id, message?, author?, date?, url?, source }`); enables the History panel. Wins over the two versions |
| `base`, `head` | — | `string` | the newest two | Version ids to compare when a history is set |
| `mode` | — | `'compare' \| 'history'` | `compare` | The History panel's tab: compare two versions, or `history` (view one version as it is) |
| `view` | — | `'before' \| 'merged' \| 'after' \| 'side'` | `merged` | The view |
| `filters` | — | `DiffFilter[]` | all | Shown change kinds among `added removed content layout style`; a facet left out is ignored (Layout off draws the old version on the new layout, Style off draws both unstyled) |
| `dim` | — | `boolean` | `true` | Fade unchanged items |
| `panels` | `panels` | `DiffPanel[]` or `string` | `changes` | Open panels, any combination: `history` and `code` (stacked on the left) and `changes` (right) |
| `features` | `features` | `Partial<Record<DiffFeature, boolean>>` or `string` | all on | The parts that are on. The attribute (and a string property) lists them like the viewer's `controls` (`features="changes views filters"`, or `none`); the object turns parts off. See [Features](#features) |
| `theme` | — | `string` | Default Light / Default Dark | Both versions are drawn with the component's theme (also from the theme menu) |
| `theme-dark` | — | `string` | — | The theme while the chrome is dark; `auto` picks the dark theme linked to `theme` |
| `ui` | — | `'light' \| 'dark' \| 'auto'` | `auto` | Chrome colour scheme |
| `compact` | — | `boolean \| 'auto'` | `auto` | The compact chrome (smaller, icon-only); automatic on small hosts |
| `wheel` | — | `'always' \| 'ctrl' \| 'never'` | `always` | `always`: the wheel pans and ⌘ / Ctrl + wheel or pinch zooms; `ctrl`: only ⌘ / Ctrl + wheel zooms; `never` |
| `name` | — | `string` | `diagram` | File name stem of exports |
| `label` | — | `string` | generated | Accessible name, e.g. "Diagram diff: 2 added, 1 removed, 5 changed" |
| — | `loader` | `(url: string) => Promise<string>` | `fetch` | How `before` and `after` are fetched |
| — | `actions` | `readonly DiffAction[]` | — | Host buttons in the top right corner: `{ id, label, title?, primary?, enabled?(pair), run() }` |
| — | `storage` | `StorageAdapter` | `localStorage` (`mmdx.` keys), else in memory | Where UI preferences are kept (panels, light / dark, theme pick) |
| — | `themeSource` | `ThemeSource` | `configure({ themeSource })` | Where themes the page has not loaded come from |
| — | `ctx` | `Partial<CoreContext>` | the shared context | Read when the component is created |
| — | — | `iconPacks: IconPack[]` | — | `DiagramDiff` option: icon packs of this component over the shared ones (see [Icons](/guide/icons#registering-packs)); read when it is created |

Read-only property of the element: `instance` (the `DiagramDiff`, `null` while not connected).

## Methods

| Method | Description |
|---|---|
| `compare(before: string, after: string): Promise<void>` | Compares two sources (drops a history) |
| `setHistory(history: HistoryAdapter \| readonly StaticVersion[]): Promise<void>` | Shows a version history |
| `setPair(baseId: string, headId: string): void` | Compares two versions of the history by id |
| `viewVersion(id: string): void` | Shows one version as it is (History mode) |
| `setView(view: DiffViewName): void` | `before`, `merged`, `after` or `side` |
| `setFilters(filters: readonly DiffFilter[], dim?: boolean): void` | Shown change kinds, and Dim |
| `select(key: string \| null): void` | Selects a change by key (`kind:id`, e.g. `node:api`) and brings it into view; `null` clears the selection |
| `next(): void`, `prev(): void` | Selects the next or previous change |
| `fit(): void` | Fits the view |
| `zoomTo(k: number): void` | Sets the zoom factor |
| `getDiff(): DiffResult \| null` | The diff with the filters applied; `null` before the first comparison |
| `exportAs(kind: DiffExportKind, options?: DiffExportOptions): Promise<void>` | Builds an export and offers it with the cancelable `mmdx-export`, else downloads it |
| `toSvg(options?: DiffExportOptions): string` | A standalone SVG of a view (default: the current one) |
| `toPng(options?: DiffExportOptions): Promise<Blob>` | A PNG of a view |

`DiffExportOptions`: `view` (the view of an image), `version` (`'before' \| 'after' \| 'viewed'`: which version a source export writes; default after, or the viewed one), `highlights`, `legend`, `scale` (PNG, 1–4, default 2), `scheme` (`'light' \| 'dark'`), `filtered` (reports and patches with the filters applied, default `true`).

`DiagramDiff` has the same methods, and also:

| Member | Description |
|---|---|
| `set(patch: Partial<DiffOptions>): void` | Updates options; reloads or re-renders as needed |
| `options: Readonly<DiffOptions>` | The current options |
| `pair: DiffPair` | `{ base, head, viewing }`: the compared versions and the version shown as it is |
| `filters: DiffFilter[]` | The shown change kinds |
| `diagnostics: readonly Diagnostic[]` | Diagnostics of the last comparison |
| `session: DiffSession` | The model behind the component: versions, pair, filters, the rendered diff, the selection (advanced) |
| `core: ViewCore`, `ctx: CoreContext` | The view kernel and the core context (advanced) |
| `destroy(): void` | Removes the component |

## Events

All events bubble and are composed. Types: `DiffEventMap`.

| Event | Detail | Cancelable | When |
|---|---|---|---|
| `mmdx-compare` | `{ counts, typeChanged: boolean, base: string \| null, head: string \| null }` | no | After every comparison; `counts` has `added`, `removed`, `changed`, `content`, `layout`, `style` |
| `mmdx-select` | `{ key: string \| null, change: ItemChange \| null }` | no | A change was selected or the selection cleared |
| `mmdx-view` | `{ view: DiffViewName, mode: DiffMode }` | no | The user or `setView()` changed the view |
| `mmdx-mode` | `{ mode: DiffMode, viewOnly: boolean }` | no | The History panel's tab changed, or History mode (one version as it is) started or ended |
| `mmdx-filters` | `{ filters: DiffFilter[], dim: boolean }` | no | Filters or Dim changed |
| `mmdx-version` | `{ base: string \| null, head: string \| null, viewing?: string }` | no | Another pair or version shows (sync your URL) |
| `mmdx-export` | `{ kind: DiffExportKind, name: string, data: string \| Blob }` | yes | Before an export downloads. Cancel it to upload instead |
| `mmdx-render` | `{ bounds: Rect, type: string \| null, durationMs: number }` | no | After each render |
| `mmdx-error` | `{ diagnostics: Diagnostic[] }` | no | A version failed to load, or either version has parse warnings or errors (or names a missing theme) |
| `mmdx-link` | `{ href: string, id: string \| null }` | yes | A link is ⌘ / Ctrl-clicked (a plain click selects the change) |
| `mmdx-fullscreen-request` | `{ enter: boolean }` | yes | Before the full-screen button enters or leaves full screen |
| `mmdx-fullscreen` | `{ active: boolean }` | no | Full screen started or ended |
| `mmdx-ui` | `{ ui: 'light' \| 'dark' }` | no | The user switched the light / dark toggle |

Options and attributes set the view, mode and filters without an event; the events report what the user (or a method) did.

## Views

<MmdxDemo kind="diff" sample="sequence" view="side" height="480px" />

- **Before**: the old version, with its removed and changed items highlighted.
- **Merged**: the new version plus every removed item kept where it was, removed words struck out and added words in bold, and an arrow from the old place of each moved item.
- **After**: the new version, with its added and changed items highlighted.
- **Side by side**: two canvases, panned and zoomed together.

Switching between Before, Merged and After animates: moved items glide, colours blend and changed text flips; switching to another pair or version animates the same way, and the view glides to the new fit. Colour is never the only signal: removed items are dashed, badges carry `+ − C L S`, and text changes are struck out or bold. The diff draws flowchart, sequence, ER, mindmap and state diagrams; for other types (and a change of diagram type) it opens the code diff.

### Mindmaps

A mindmap's nodes are matched by their written id, then by their place in the tree (the path of labels from the root and the rank among siblings with the same label), then by label and matched parent, then by label alone, so a branch moved under another parent is one node that moved, not a removal and an addition. A new parent (`parent`) and a new place among the siblings (`order`) are layout changes, as are `side`, `dx` / `dy` and `collapsed`; the label, the shape, the `::icon()` and a metadata image are content; `:::` classes and metadata looks are style; Colours by branch or by depth is a change of the whole page. The merged picture keeps removed nodes under their old parent at their old place and marks renamed labels word by word; a moved node is drawn in its new place, without an arrow from the old one. See [Mindmaps](/guide/mindmap#history-and-diff).

### State diagrams

States and composites are matched by id, and a removed and an added state with the same title and kind are one renamed state, whose transitions and notes follow it; transitions are matched by their ends (through renames), then in order among parallel ones; notes by their state and side, then in order, and a note that only changed sides is one that moved. The start and end pseudo-states (`[*]start`, `X/[*]end`…) are matched by id. A state or composite moved into another composite or concurrency region is a layout change, as are a composite's `direction` and number of regions, a note's side and the top-level `direction`; a title, a description row, a kind (state, choice, fork, join), a transition label, a note's text and a `click` link are content; classes, `style`, `classDef` and metadata looks are style. The merged picture keeps a removed state inside its old composite and region, a removed composite with its contents, and marks changed text word by word. See [State diagrams](/guide/state#history-and-diff).

## Filters

The bottom bar has the views (icon buttons), a filter for each kind of change the comparison has (with its count), Dim and, at its right end, the change list toggle.

| Filter | Off means |
|---|---|
| `added` | Items only in the new version (green, `+`) are left out of the highlights and the change list |
| `removed` | Items only in the old version (red, dashed, `−`) are left out of the highlights and the change list |
| `content` | Changed content of kept items (amber, `C`: labels, shapes, connections, attributes, message text) is ignored |
| `layout` | Position, size, bend points, ports and layers (blue, `L`) are ignored: the old version is drawn on the new layout |
| `style` | Colours, fonts, presets, classes and theme (purple, `S`) are ignored: both versions are drawn unstyled |

Dim fades every unchanged item.

## Panels

- **History** (left, `V`): every version, newest first, paged when the adapter pages. The Compare tab picks the Before and After versions; the History tab shows one version as it is (`mode="history"`, `viewVersion(id)`).
- **Code** (left, `C`): the unified diff of the Mermaid code and of the `%%@` metadata, in the Mermaid and Metadata tabs, narrowed to the lines of the selected change and without the facets filtered out.
- **Change list** (right, `L`): every change; click one to select it and zoom to it.
- **Layers**: the diagram's layers to show or hide. What is compared is always drawn as it is (no display settings).

Code and History stack on the left (Code on top, a splitter between them), so all three panels can be open at once. Panels resize and remember their sizes. The left tool dock has Pan, the pen (strokes show in every view), the panel toggles and Export.

## Features

`features` turns parts off. The object form only needs the parts to turn off; the attribute and the string form list the parts that are on.

| Key | Turns on |
|---|---|
| `history` | The History panel and its button |
| `code` | The code diff panel |
| `changes` | The change list |
| `views` | The view buttons and the `1`–`4` keys |
| `filters` | The filter toggles and Dim |
| `pen` | The pen |
| `export` | Export |
| `help` | The `?` help |
| `fullscreen` | The full-screen button |
| `select` | Selecting a change by clicking its item |
| `theme` | The theme menu |
| `scheme` | The light / dark toggle |
| `layers` | The Layers panel |

## History

With a `history`, the History panel lists the versions. History adapters come from `@mmdx/studio/diff` and `@mmdx/studio/adapters`:

- `staticHistory(versions)`: a list held in memory (a plain list given as `history` works the same way).
- `httpHistoryAdapter(url, init?)`: `GET url` returns `{ versions: [{ id, message, author, date }], next? }` newest first (`next` pages with `?cursor=`), and `GET url/<id>` returns the source of one version.

For GitLab, GitHub or any backend, write the two calls against their commits and raw file APIs:

```ts
import type { HistoryAdapter } from '@mmdx/studio/diff';

const adapter: HistoryAdapter = {
  list: async (cursor) => ({ versions: await commitsOf('docs/arch.mmdx', cursor) }), // [{ id: sha, message, author, date }]
  load: async (sha) => rawFile('docs/arch.mmdx', sha),
  subscribe: (cb) => onPush(cb), // optional: a new version was saved
};
```

The component never writes history. The same History runs inside the [editor](/components/editor) and the [viewer](/components/viewer). See [History](/guide/history).

## Exports

Export (the tool dock) and `exportAs(kind, options)`:

| Kind | File |
|---|---|
| `png`, `svg` | The current view, with a legend |
| `mmdx`, `mmd` | Either version as `.mmdx`, or as portable `.mmd` |
| `diff` | A unified patch (applies with `git apply`) |
| `md` | A change report in Markdown, for merge request descriptions |
| `json` | The change report as JSON |

Every export fires the cancelable `mmdx-export` first. For CI bots without a browser, `renderDiffToSvg()` and `diffReport()` produce the same pictures and reports; see [CI](/guide/ci).

## Keyboard shortcuts

While the focus is inside the diff:

| Keys | Action |
|---|---|
| `1` `2` `3` `4` | Before, Merged, After, Side by side |
| `←` `→` | Step Before ↔ Merged ↔ After |
| `J`, `K` | Next, previous change |
| `V`, `C`, `L` | History, Code and change list panels |
| `H`, `P` | Pan, pen |
| `⌘Z` | Undo the last pen stroke |
| `F`, `0` | Fit |
| `+` / `=`, `-` | Zoom in, zoom out |
| `?` | Shortcuts and hints |
| `Esc` | Stop the pen, close the help, clear the selection |

## See also

- [Components overview](/components/) for the behaviour every element shares
- [History](/guide/history), [CI](/guide/ci) and the [core diff API](/api/core)
- [Adapters](/api/adapters), [Events](/api/events)
- [Styling](/guide/styling): the `--mmdx-diff-*` tokens and parts
- [Playgrounds](/components/playgrounds) and [Storybook](/storybook/){target="_self"}
