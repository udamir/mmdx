# `<mmdx-viewer>`

A read-only, interactive diagram for documentation pages and portals: pan and zoom, layers, the presenting pen, the Mermaid code, export, full screen, the light / dark toggle with a theme menu, and the diagram's history. It loads only what its controls need, renders lazily and keeps page scroll free.

```ts
import '@mmdx/studio/viewer'; // <mmdx-viewer>, DiagramViewer
```

<MmdxDemo example="production-microservices" history controls="zoom layers pen code history export theme fullscreen" />

## Usage

Give the diagram inline, as a URL or as a property:

::: code-group

```html [Inline]
<mmdx-viewer controls="zoom layers fullscreen export">
  <script type="text/mermaid">
    flowchart LR
      a[Start] --> b{Check} --> c[Done]
  </script>
</mmdx-viewer>
```

```html [URL]
<mmdx-viewer src="/diagrams/architecture.mmdx" theme-dark="auto"></mmdx-viewer>
```

```ts [Property]
const viewer = document.querySelector('mmdx-viewer')!;
viewer.source = await api.getDiagram(id);
```

:::

The source is taken in this order: the `source` property, the `src` attribute (fetched through `loader`, default `fetch`), a child `<script type="text/mermaid">` (or `text/x-mermaid`, its common indentation removed), and the `data-source` attribute. A child `<svg data-mmdx-ssr>` (written by the [Markdown plugins](/guide/markdown) or your own server rendering) shows at once and is replaced by the first client render.

Without custom elements, mount `DiagramViewer` on any element:

```ts
import { DiagramViewer } from '@mmdx/studio/viewer';

const viewer = new DiagramViewer(host, { source, controls: ['zoom', 'fullscreen'], theme: 'github-light' });
viewer.set({ controls: ['zoom', 'layers', 'export'] }); // only what changed is applied
viewer.destroy();
```

Recipes:

```html
<!-- a thumbnail: no pan, no zoom, no controls -->
<mmdx-viewer src="/diagrams/flow.mmdx" interactive="false" controls="none"></mmdx-viewer>

<!-- a fixed box the diagram fits into -->
<mmdx-viewer src="/diagrams/flow.mmdx" fit="contain" style="height: 360px"></mmdx-viewer>

<!-- the host owns light / dark: keep the theme menu, drop the toggle -->
<mmdx-viewer src="/diagrams/flow.mmdx" controls="zoom theme" ui="dark" scheme-toggle="false"></mmdx-viewer>
```

```ts
// route diagram links through your router
viewer.addEventListener('mmdx-link', (e) => {
  e.preventDefault();
  router.push(e.detail.href);
});

// show the diagram's history (newest first)
viewer.setAttribute('controls', 'zoom history');
viewer.history = httpHistoryAdapter('/api/diagrams/arch/versions'); // from '@mmdx/studio/adapters'
```

## Attributes and properties

Each attribute sets the `ViewerOptions` option of the same name in camelCase (`theme-dark` → `themeDark`, `hover-highlight` → `hoverHighlight`, `scheme-toggle` → `schemeToggle`); `new DiagramViewer(host, options)` and `viewer.set(patch)` take every option. The Property column lists the element's own properties.

| Attribute | Property | Type | Default | Description |
|---|---|---|---|---|
| `src` | — | `string` | — | URL of the diagram, fetched through `loader`. Also names exports (`architecture.mmdx` → `architecture.svg`) |
| — | `source` | `string` | — | The diagram source; wins over `src` and the inline script |
| — | `loader` | `(url: string) => Promise<string>` | `fetch` | How `src` is fetched (auth headers, a host API) |
| `theme` | — | `string` | Default Light / Default Dark | The diagram theme; without it the theme follows the chrome. Diagrams do not carry a theme |
| `theme-dark` | — | `string` | — | The theme while the chrome is dark; `auto` picks the dark theme linked to `theme` |
| `fit` | — | `'width' \| 'contain' \| 'none'` | `width` (`contain` for `DiagramViewer`) | `width`: the diagram fills the width and the height follows; `contain`: it fits a box whose height you set; `none`: natural size |
| `controls` | — | `ViewerControl[]` | `zoom fullscreen` | Any of `zoom layers pen code history export theme fullscreen`, space-separated, or `none`. Change it with the attribute or `setControls(list)`; the chrome is re-evaluated in place |
| `interactive` | — | `boolean` | `true` | `false` turns off pan, zoom, the zoom bar's zoom buttons, help and the pen (thumbnails, print) |
| `lazy` | — | `boolean` | `true` | Render when the viewer comes within 300 px of the viewport; the box keeps the diagram's aspect ratio meanwhile |
| `wheel` | — | `'ctrl' \| 'always' \| 'never'` | `ctrl` | `ctrl`: only ⌘ / Ctrl + wheel (or a trackpad pinch) zooms, so page scroll is never trapped; `always`: the wheel pans and ⌘ / Ctrl + wheel zooms; `never`: the wheel is ignored |
| `fallback` | — | `'mermaid' \| 'source' \| 'error'` | `mermaid` | For diagram types mmdx does not draw: stock Mermaid (needs `mermaid`), the source text, or an error card |
| — | `layers` | `readonly string[]` | from metadata | Ids of the visible layers |
| `labels` | — | `boolean` | `true` | Show connector labels |
| `hover-highlight` | — | `boolean` | `true` | Highlight the connected items of the item under the pointer |
| `label` | — | `string` | generated | Accessible name, e.g. "Flowchart: 12 nodes, 14 connections" |
| `ui` | — | `'light' \| 'dark' \| 'auto'` | `auto` | Chrome colour scheme |
| `scheme-toggle` | — | `boolean` | `true` | With the `theme` control: the light / dark toggle next to the theme menu. `false` keeps the menu and hides the toggle, for hosts that set `ui` themselves |
| `compact` | — | `boolean \| 'auto'` | `auto` | The compact chrome (smaller, icon-only); automatic on small hosts |
| — | `history` | `HistoryAdapter \| readonly StaticVersion[]` | — | The diagram's versions, newest first (`[{ id, message?, author?, date?, source }]`). With the `history` control, a History button shows how the diagram changed |
| — | `fullscreen` | `HostFullscreen` | — | The host page's full screen `{ available(), enter(), exit(), active?() }`, used when the browser's full screen is unavailable |
| — | `storage` | `StorageAdapter` | `localStorage` (`mmdx.` keys), else in memory | Where UI preferences are kept (theme pick, light / dark, panels) |
| — | `themeSource` | `ThemeSource` | `configure({ themeSource })` | Where themes the page has not loaded come from |
| — | — | `ctx: Partial<CoreContext>` | the shared context | `DiagramViewer` option only, read when the viewer is created |
| — | — | `rehydrate: 'auto' \| 'adopt'` | — | `DiagramViewer` option, deprecated and ignored: server-rendered SVG is always replaced by the first client render |

Read-only properties of the element: `instance` (the `DiagramViewer`, `null` while not connected), `diagnostics` (the last render's `Diagnostic[]`) and `historySession` (while History is open).

## Methods

| Method | Description |
|---|---|
| `fit(): void` | Fits the diagram into the view |
| `zoomTo(k: number): void` | Sets the zoom factor (`1` is 100 %) |
| `reload(): Promise<void>` | Fetches `src` again (after the file changed) |
| `setControls(list: readonly ViewerControl[] \| undefined): void` | Changes the controls at run time, like the `controls` attribute; `undefined` restores the default |
| `setLayers(ids: readonly string[] \| undefined): void` | Shows only these layers; `undefined` restores the diagram's own visibility |
| `toSvg(): string` | A standalone SVG document of what is shown (visible layers, label setting); empty before the first render |
| `toPng(opts?: { scale?: number }): Promise<Blob>` | A PNG of what is shown, `scale` 2 by default. Fonts not registered with `configure({ fonts })` are reported with `mmdx-error`. Rejects before the first render or while not connected |
| `toggleHistory(on?: boolean, opts?: { compare?: boolean }): void` | Opens or closes History; `compare` opens it on the newest change compared |

`DiagramViewer` has the same methods, and also:

| Member | Description |
|---|---|
| `set(patch: Partial<ViewerOptions>): void` | Updates options; only what changed is applied (a key set to `undefined` goes back to its default). Re-renders, re-fetches or re-evaluates the controls as needed; History, the pen's strokes and the user's light / dark choice stay |
| `options: Readonly<ViewerOptions>` | The current options |
| `diagnostics: readonly Diagnostic[]` | The last render's diagnostics |
| `sourceText: string \| null` | The source shown |
| `fileName: string` | The file name stem of exports (from `src`, else `diagram`) |
| `historySession: HistorySession \| null` | The open History's session: `setPair`, `viewVersion`, `setView`, `setFilters`, `select`, `next`, `prev`, `pair`, `getDiff`, `exportAs`, `close` (the [`<mmdx-diff>`](/components/diff) methods) |
| `core: ViewCore`, `ctx: CoreContext` | The view kernel and the core context (advanced) |
| `destroy(): void` | Stops rendering and loading and removes the component |

## Events

All events bubble and are composed. Types: `ViewerEventMap`.

| Event | Detail | Cancelable | When |
|---|---|---|---|
| `mmdx-render` | `{ bounds: Rect, type: string \| null, durationMs: number }` | no | After each render; `type` is `null` for a stock Mermaid fallback |
| `mmdx-error` | `{ diagnostics: Diagnostic[] }` | no | Parse warnings and errors of a render, a failed `src` fetch, a missing theme, fonts not embedded into a PNG |
| `mmdx-link` | `{ href: string, id: string \| null }` | yes | A link in the diagram is clicked (not after a drag, not with the pen). Cancel it to route the link yourself; otherwise it opens per the link policy |
| `mmdx-fullscreen-request` | `{ enter: boolean }` | yes | Before the full-screen button enters or leaves full screen. Cancel it to handle full screen yourself |
| `mmdx-fullscreen` | `{ active: boolean }` | no | Full screen started or ended |
| `mmdx-ui` | `{ ui: 'light' \| 'dark' }` | no | The user switched the light / dark toggle |
| `mmdx-history-open`, `mmdx-history-close` | `{}` | no | History opened or closed |
| `mmdx-history-show` | `{ shown: 'none' \| 'version' \| 'compare' }` | no | What History shows changed |
| `mmdx-history-compare`, `-version`, `-select`, `-view`, `-mode`, `-filters`, `-error` | as `<mmdx-diff>`'s `mmdx-compare`, `mmdx-version`… | no | The History panel's comparison, as on [`<mmdx-diff>`](/components/diff) |
| `mmdx-history-export` | `{ kind, name, data }` | yes | An export from History; cancel it to upload instead of downloading |

## Controls and chrome

The viewer has the editor's chrome. Each piece is behind a control of `controls`, and only the zoom bar loads with the viewer; every other piece loads the first time its control is on. On a docs page the chrome shows while the pointer or the focus is in the viewer.

| Control | Adds |
|---|---|
| `zoom` | The zoom bar (bottom right): zoom out, zoom level, zoom in, fit, and the `?` help popup |
| `fullscreen` | The full-screen button on the zoom bar (also shows the zoom bar without the help) |
| `layers` | The View settings panel: the diagram's layers to show or hide, connector labels and hover highlight |
| `pen` | The presenting pen in the tool dock (strokes fade away), with the Hand tool next to it |
| `code` | The code panel: the diagram's Mermaid code without the layout metadata and styles, highlighted, with a Copy button. `list` is an alias |
| `history` | The History button in the tool dock (with a `history`) |
| `export` | Export in the view parameters (top right): SVG, PNG and the source as `.mmdx` |
| `theme` | The light / dark toggle and the theme menu in the view parameters (`scheme-toggle="false"` hides the toggle) |

The tool dock (left) shows when `pen`, `code`, `layers` or `history` is on. With `interactive="false"`, zoom, help and the pen are off.

## Full screen

The full-screen button puts the viewer itself into the browser's full screen. Where that is unavailable (a sandboxed iframe without `allowfullscreen`), give the viewer the host page's full screen through the `fullscreen` property (type `HostFullscreen`):

```ts
import type { HostFullscreen } from '@mmdx/studio/viewer';

viewer.fullscreen = {
  available: () => true,
  enter: () => host.enterModal(),
  exit: () => host.exitModal(),
  active: () => host.isModal(), // optional: the host can leave full screen by itself
} satisfies HostFullscreen;
```

The button then shows and calls `enter()` / `exit()` within the click, and the viewer fills its frame while the host shows it full screen (`data-fullscreen` on the element). `active()` is read on the next click and when the window resizes. `mmdx-fullscreen-request` comes first and is cancelable. See [Sandboxed iframes](/guide/sandboxed-iframes).

## History

With `controls` including `history` and a `history` property, the tool dock gets a History button (⇧H). It works as in the [editor](/components/editor), without editing and Restore: the History tab shows any version as it was (in the diff's canvas), and the Compare tab compares any version with the current one (Before, Merged, After, Side by side, filters, the change list, the code diff). Every switch animates. Back (the pill at the top, or Esc) returns to the current version. History's code loads on first use; no `@mmdx/studio/diff` import is needed. See [History](/guide/history).

## Lazy rendering and workers

- With `lazy` (the default) the viewer renders when it comes near the viewport, and reserves the diagram's aspect ratio meanwhile, so the page does not jump.
- Each diagram type's parser and renderer load on first use.
- Diagrams over 300 lines render in a module worker. `setWorkerUrl(url)` (exported by `@mmdx/studio/viewer`) lets a strict-CSP host serve the worker file itself; `useInlineWorker()` from [`@mmdx/studio/worker-inline`](/api/worker-inline) starts it from a `blob:` URL where workers cannot start from URLs. Without a worker, diagrams render on the main thread.
- A render that takes too long in the worker shows an error card instead of blocking the page.

## Fallback and errors

Flowcharts, sequence diagrams and ER diagrams are drawn by mmdx. Other Mermaid types follow `fallback`: `mermaid` renders them with stock Mermaid (an optional peer dependency, loaded lazily; configure it with `configure({ mermaid })`), `source` shows the text, `error` shows the error card. A source that cannot be parsed shows a compact error card with the diagnostics, the source with the bad lines marked, and a Copy button; it never throws into the page.

## Keyboard shortcuts

While the viewer has focus:

| Keys | Action | Needs |
|---|---|---|
| `+` / `=`, `-` | Zoom in, zoom out | `zoom` or `fullscreen` |
| `F`, `0` | Fit | `zoom` or `fullscreen` |
| Arrows | Pan | `zoom` or `fullscreen` |
| `?` | Shortcuts and hints | `zoom` |
| `P` | Pen on / off | `pen` |
| `H` | Hand (pan) | `pen` |
| `C` | Code panel | `code` |
| `L` | View settings | `layers` |
| `⇧H` | History | `history` |
| `1` `2` `3` `4`, `J` / `K` | While History compares: Before, Merged, After, Side by side; next and previous change | `history` |
| `X` | Swap Before and After (Compare) | `history` |
| `⌘C` | Copy the selected item of the version shown | `history` |
| `Esc` | Close the help, stop the pen, leave History | |

## See also

- [Components overview](/components/) for the behaviour every element shares
- [Markdown](/guide/markdown): ` ```mermaid ` blocks as viewers, `upgradeMermaidBlocks(root)`
- [Server-side rendering](/guide/ssr) and [`renderToSvg`](/api/core)
- [Themes](/guide/themes), [Styling](/guide/styling), [Sandboxed iframes](/guide/sandboxed-iframes)
- [Events](/api/events), [Adapters](/api/adapters)
- [Playgrounds](/components/playgrounds) and [Storybook](/storybook/){target="_self"}
