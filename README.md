<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
    <img src="brand/logo.svg" alt="Diagram Studio" width="120">
  </picture>
</p>

<h1 align="center">Diagram Studio (mmdx)</h1>

<p align="center">Visual editor, viewer, theme editor and visual diff for Mermaid diagrams, as framework-agnostic web components.<br>Mermaid stays the source of truth — layout and styling live in comment lines every Mermaid renderer ignores.</p>

<p align="center">
  <a href="https://github.com/udamir/mmdx/actions/workflows/ci.yml"><img src="https://github.com/udamir/mmdx/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/mmdx"><img src="https://img.shields.io/npm/v/mmdx.svg" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

<p align="center"><a href="https://udamir.github.io/mmdx/"><b>Live demo</b></a></p>

<p align="center"><a href="https://udamir.github.io/mmdx/"><img src=".github/screenshot.webp" alt="Diagram Studio editing an ER diagram of an archive database in the dark theme" width="900"></a></p>

---

## Why

Mermaid is great for keeping diagrams in docs and repos, but its auto-layout and styling are hard to control. Diagram Studio lets you lay out and style a Mermaid diagram by hand — drag boxes, route connectors, pick colours and presets — and stores the result as `%%@` comment lines appended to the same Mermaid text. The file stays valid Mermaid: GitHub, GitLab, YouTrack, Notion or any stock Mermaid renderer still draws it (with its own layout), and Diagram Studio draws it exactly as you arranged it.

## Features

- **Three diagram types, edited visually:** flowchart, sequence diagram and ER diagram. Other Mermaid types are shown with stock Mermaid.
- **Two-way editing:** everything you do on the canvas is written back to the Mermaid code, and code edits update the canvas live. Structure (nodes, edges, participants, tables) always lives in Mermaid; metadata holds only positions and looks.
- **Canvas tools:** drag, resize, snap, align and distribute, groups (`subgraph` / `box`), connectors with magnet points and bend points, copy / paste / duplicate, copy style, z-order, layers, undo / redo, presenting pen.
- **Styling:** a floating toolbar and a Properties panel for fill, border, text, font, shape, stacking, arrows, line shape and more; named style presets from the theme or saved per diagram.
- **Themes:** separate theme files with a colour palette, per-type styles and presets. Colours are stored as palette references, so a diagram follows theme switches. Light and dark themes are linked, so a diagram switches with the page.
- **Viewer for documentation:** pan, zoom, layers, full screen, export, lazy rendering, a text outline for screen readers, and server-side rendering to SVG.
- **History and diff:** see how a diagram changed between two versions — Before, Merged (removed items kept in place, text changes marked word by word, arrows for moved items) and After on one animated canvas, or side by side — filter out layout or style noise, step through every change with its source lines, and browse a diagram's version history. Built into the studio, available as `<mmdx-diff>` for merge request reviews, and as `renderDiffToSvg()` / `diffReport()` for CI bots.
- **Theme editor:** edit the palette and every item type's style with live previews, check text contrast, import and export `.theme.json` files.
- **Export:** `.mmdx` (Mermaid + layout), portable `.mmd` (`classDef` / `linkStyle` so stock renderers keep the colours), SVG and PNG.
- **Framework-agnostic:** custom elements in shadow DOM, usable from plain HTML, React, Vue, Angular or Svelte, plus imperative classes where custom elements are not allowed.
- **Secure by default:** diagram text and theme files are treated as untrusted input; no `innerHTML`, a link policy, size limits and a strict CSP are supported.

## Install

```bash
npm install mmdx
# optional: only needed for diagram types mmdx does not draw itself, and the "Plain Mermaid" preview
npm install mermaid
```

The package is ESM only (ES2022). It has no runtime dependencies; `mermaid` (≥ 10) is an optional peer dependency loaded lazily.

## Quick start

### Show a diagram

```html
<script type="module">
  import 'mmdx/viewer';
</script>

<mmdx-viewer controls="zoom layers fullscreen export">
  <script type="text/mermaid">
    flowchart LR
      a[Start] --> b{Check} --> c[Done]
  </script>
</mmdx-viewer>

<!-- or load a file -->
<mmdx-viewer src="/diagrams/architecture.mmdx" theme-dark="auto"></mmdx-viewer>
```

### Edit a diagram

```ts
import 'mmdx/editor';
import { httpDocumentAdapter } from 'mmdx/adapters';

const editor = document.querySelector('mmdx-editor')!;
editor.adapter = httpDocumentAdapter('/api/diagrams/architecture.mmdx'); // load + save with If-Match conflict detection
editor.addEventListener('mmdx-dirty', (e) => setUnsaved(e.detail.dirty));
```

```html
<mmdx-editor guard-unload style="height: 640px"></mmdx-editor>
```

Without an adapter, set `editor.value = source` and read changes from the `mmdx-change` event.

### Review a change

```html
<script type="module">
  import 'mmdx/diff';
</script>

<mmdx-diff before="/api/files/arch.mmdx?ref=main" after="/api/files/arch.mmdx?ref=feature-x" style="height: 720px"></mmdx-diff>
```

Or give it the whole history of a diagram (newest first) and let the reviewer pick any two versions:

```ts
import { httpHistoryAdapter } from 'mmdx/diff';

const diff = document.querySelector('mmdx-diff')!;
diff.history = httpHistoryAdapter('/api/diagrams/arch/versions'); // or a list: [{ id, message, author, date, source }]
```

### Render on the server or at build time

```ts
import { renderToSvg } from 'mmdx/core';

const svg = await renderToSvg(source, { theme: 'default-dark' }); // a standalone SVG string, no DOM needed
```

A diff renders the same way, for example in a CI job that comments on merge requests touching `*.mmdx`:

```ts
import { diffDiagrams, diffReport, renderDiffToSvg } from 'mmdx/core';

const svg = await renderDiffToSvg(before, after, { view: 'merged', ignore: { layout: true } });
const md = diffReport(diffDiagrams(before, after), { format: 'markdown', before: { id: baseSha }, after: { id: headSha } });
```

## Entry points

| Import | Provides |
|---|---|
| `mmdx/viewer` | `<mmdx-viewer>` and `DiagramViewer` — read-only diagrams for docs and portals |
| `mmdx/editor` | `<mmdx-editor>` and `DiagramEditor` — the visual editor with the code panel |
| `mmdx/theme-editor` | `<mmdx-theme-editor>` and `ThemeEditor` — manage diagram themes |
| `mmdx/diff` | `<mmdx-diff>` and `DiagramDiff` — how a diagram changed, and its version history; history adapters |
| `mmdx/studio` | `<mmdx-studio>` and `DiagramStudio` — the complete standalone app (the live demo) |
| `mmdx/core` | Pure API without DOM: parse, render to SVG, metadata, themes, diffs and diff reports (Node, workers, browsers) |
| `mmdx/adapters` | Storage, theme sources and stores, document adapters, history adapters, share links |
| `mmdx/markdown` | rehype and markdown-it plugins that turn ` ```mermaid ` blocks into viewers |
| `mmdx/react` | Optional typed wrappers for React ≤ 18 |
| `mmdx/themes/*` | The built-in theme files (`default-light.theme.json`, …) |

Importing an element entry registers its tag once (importing it twice is safe), and importing any entry in Node does not throw, so server-side rendering frameworks can import them. Each element is also an imperative class you can mount on any element, for hosts where `customElements.define` is not allowed:

```ts
import { DiagramViewer } from 'mmdx/viewer';
const viewer = new DiagramViewer(hostElement, { source, controls: ['zoom', 'fullscreen'] });
```

## Components

### `<mmdx-viewer>`

| Attribute / property | Default | Meaning |
|---|---|---|
| `src` / `source` (property) / inline `<script type="text/mermaid">` | — | The diagram. `src` is fetched through `loader` (property, default `fetch`) |
| `theme` | the diagram's own | Forces a theme over the diagram's `canvas.theme` |
| `theme-dark` | — | Theme used on dark pages; `auto` picks the dark theme linked to the diagram's theme |
| `fit` | `width` | `width` (height follows), `contain` (fit a fixed box) or `none` (natural size) |
| `controls` | `zoom fullscreen` | Any of `zoom layers pen code export fullscreen`, or `none` |
| `interactive` | `true` | `false` turns off pan and zoom (thumbnails, print) |
| `lazy` | `true` | Render when scrolled near; the box keeps the diagram's aspect ratio meanwhile |
| `wheel` | `ctrl` | `ctrl`: only ⌘/Ctrl+wheel zooms, so page scroll is never trapped; `always`; `never` |
| `fallback` | `mermaid` | For unsupported types: stock Mermaid, `source` or `error` |
| `layers` (property) | from metadata | Visible layer ids |
| `labels`, `hover-highlight` | `true` | Show connector labels; highlight connected items on hover |
| `label` | generated | Accessible name, e.g. "Flowchart: 12 nodes, 14 connections" |
| `ui` | `auto` | Chrome colour scheme: `light`, `dark` or `auto` |

Events (bubbling, composed): `mmdx-render` `{ bounds, type, durationMs }`, `mmdx-error` `{ diagnostics }`, `mmdx-link` `{ href, id }` (cancelable, to route links through your router), `mmdx-fullscreen` `{ active }`. Methods: `fit()`, `zoomTo(k)`, `reload()`, `toSvg()`, `toPng({ scale })`, `setLayers(ids)`.

Keyboard, while the viewer has focus: `+` / `-` zoom, `F` or `0` fits, arrows pan, `P` toggles the pen, `Esc` stops it. `controls="code"` adds a code view: the diagram's Mermaid code without the layout metadata and styles, highlighted, with a Copy button.

Each diagram type's parser and renderer load on first use, and diagrams over 300 lines render in a module worker (`setWorkerUrl(url)` lets a strict-CSP host serve the worker file).

### `<mmdx-editor>`

| Attribute / property | Default | Meaning |
|---|---|---|
| `adapter` (property) | — | `DocumentAdapter` `{ load, save, subscribe? }`: Save button, ⌘S, conflict dialog, live updates |
| `value` (property) | — | The source when there is no adapter |
| `read-only` | `false` | View mode only |
| `features` (property) | all on | Turn parts off: `codePanel`, `properties`, `layers`, `pen`, `styleToolbar`, `export`, `themePicker`, `help`, … |
| `panels` (property) | remembered | Which side panels are open: `{ code, properties, layers }` |
| `storage` (property) | `localStorage` (`mmdx.` keys) | Where UI preferences are kept; never the document |
| `autosave` | off | Debounced save through the adapter, in ms |
| `guard-unload` | off | Ask before leaving the page with unsaved changes |
| `name` | `diagram` | File name for exports |

Events: `mmdx-change` `{ source, reason }`, `mmdx-dirty` `{ dirty }`, `mmdx-save` (cancelable, to save yourself), `mmdx-saved`, `mmdx-conflict`, `mmdx-op` (cancelable, every edit), `mmdx-selection`, `mmdx-export` (cancelable), `mmdx-edit-themes`, `mmdx-ui`, `mmdx-error`. Methods: `getSource()`, `setSource(src, { history: 'reset' | 'push' })`, `save()`, `undo()`, `redo()`, `select(items)`, `focusCode(line)`, `exportAs('mmdx' | 'mmd' | 'svg' | 'png')`, `fit()`.

Saving: `mmdx-save` → `adapter.save(source, { version })` → `mmdx-saved`; when the adapter reports a conflict, a dialog offers to keep yours, take theirs or compare both. Remote updates from `adapter.subscribe` apply directly (and can be undone) while the editor has no unsaved changes; otherwise a bar offers *Reload* or *Keep mine*.

Shortcuts work while focus is inside the editor: `V` `H` `S` `P` `C` `I` `L` switch tools and panels, `F` fits, `?` lists every shortcut, Space+drag pans, ⌘Z / ⇧⌘Z undo and redo, ⌘A / ⌘C / ⌘V / ⌘D select all, copy, paste and duplicate, ⌘⌥C / ⌘⌥V copy and paste a style, ⌘G / ⇧⌘G group and ungroup, ⌘[ / ⌘] change the order, Del deletes, arrows move by 1 px (Shift: 10 px), Enter edits text, Esc goes back. On Windows and Linux use Ctrl for ⌘.

Built-in adapters (`mmdx/adapters`): `httpDocumentAdapter(url)` (GET / PUT with ETags) and `memoryDocumentAdapter(source, name)`. Write your own for any backend:

```ts
const adapter: DocumentAdapter = {
  load: async () => api.get(id),                                    // { source, version? }
  save: async (source, { version }) => api.put(id, source, version), // { version? } or { conflict: { source, version } }
};
```

### `<mmdx-theme-editor>`

```ts
import 'mmdx/theme-editor';
import { fetchThemeSource, localStorageAdapter, localStorageThemeStore } from 'mmdx/theme-editor';

const base = fetchThemeSource('/themes/index.json');  // read-only themes to start from
const te = document.querySelector('mmdx-theme-editor')!;
te.store = localStorageThemeStore(localStorageAdapter(), base); // or your own ThemeStore: list, get, save, delete?, publish?
te.source = base;
```

Attributes: `theme`, `can-edit`, `can-publish`, `can-delete`, `presentation="inline | dialog"`, `ui`. Events: `mmdx-theme-save` (cancelable), `mmdx-theme-saved`, `mmdx-theme-dirty`, `mmdx-theme-select`, `mmdx-theme-close`. Saved themes are validated and registered in the shared registry, so open viewers and editors redraw with them.

### `<mmdx-diff>`

How a diagram changed between two versions, item by item (not line by line): nodes, edges, tables, participants and messages are matched across the versions — renamed nodes and shifted sequence messages included — and every change is **added**, **removed** or **changed**, with each change of a kept item classified as **content** (labels, shapes, connections, attributes, message text), **layout** (positions, sizes, bend points) or **style** (colours, presets, classes, theme).

| Attribute / property | Default | Meaning |
|---|---|---|
| `before`, `after` / `beforeSource`, `afterSource` (properties) | — | The two versions: URLs fetched through `loader` (property, default `fetch`), or sources |
| `history` (property) | — | A `HistoryAdapter` or a list of versions `{ id, message, author?, date?, url?, source }`; enables the History panel |
| `base`, `head` | the newest two | Version ids to compare when a history is set |
| `mode` | `compare` | History panel tab: `compare` two versions, or `history` (view one version as it is) |
| `view` | `merged` | `before`, `merged`, `after` or `side` |
| `filters` | all | Shown change kinds among `added removed content layout style`; a facet left out is ignored (Layout off draws the old version on the new layout, Style off draws both unstyled) |
| `dim` | `true` | Fade unchanged items |
| `panels` | `changes` | Open panels: `history` or `code` (left, one at a time) and `changes` (right) |
| `features` (property) | all on | Turn parts off: `history`, `code`, `changes`, `views`, `filters`, `pen`, `export`, `help`, `fullscreen`, `select` |
| `theme`, `theme-dark` | the after version's own | Both versions are drawn with one theme; `theme-dark="auto"` picks its dark counterpart on dark pages |
| `ui` | `auto` | Chrome colour scheme: `light`, `dark` or `auto` |
| `wheel` | `always` | `always`: the wheel pans and ⌘ / Ctrl + wheel or pinch zooms; `ctrl`: only ⌘ / Ctrl + wheel zooms; `never` |
| `name` | `diagram` | File name stem of exports |
| `label` | generated | Accessible name, e.g. "Diagram diff: 2 added, 1 removed, 5 changed" |

The views: **Before** (the old version with its removed and changed items highlighted), **Merged** (the new version plus every removed item kept where it was, removed words struck out and added words in bold, an arrow from the old place of each moved item), **After**, and **Side by side** (two canvases panned and zoomed together). Switching between Before, Merged and After animates: moved items glide, colours blend and changed text flips. The left tool panel has Pan, the magic pen (strokes show in every view), the History and Code panels, the change list and Export; the bottom bar has the views, the five filters with their counts, and Dim. The code panel shows the unified diff of the Mermaid code and of the `%%@` metadata, and narrows to the lines of the selected change.

Events (bubbling, composed): `mmdx-compare` `{ counts, typeChanged, base, head }` after every comparison, `mmdx-select` `{ key, change }`, `mmdx-view` `{ view, mode }`, `mmdx-filters` `{ filters, dim }`, `mmdx-version` `{ base, head, viewing? }` (sync your URL), `mmdx-export` `{ kind, name, data }` (cancelable, to upload instead of downloading), `mmdx-render`, `mmdx-error`, `mmdx-fullscreen`. Methods: `compare(before, after)`, `setHistory(adapterOrList)`, `setPair(baseId, headId)`, `viewVersion(id)`, `setView(view)`, `setFilters(filters, dim?)`, `select(key)`, `next()`, `prev()`, `fit()`, `zoomTo(k)`, `getDiff()`, `exportAs('png' | 'svg' | 'mmdx' | 'mmd' | 'diff' | 'md' | 'json', options)`, `toSvg(options)`, `toPng(options)`.

Exports: a PNG or SVG of the current view (with a legend), either version as `.mmdx` or portable `.mmd`, a unified patch (`.diff`, applies with `git apply`), and a change report in Markdown (for merge request descriptions) or JSON.

Shortcuts, while focus is inside the diff: `1` `2` `3` `4` views, `←` `→` step Before ↔ Merged ↔ After, `J` / `K` next and previous change, `V` `C` `L` the History, Code and change list panels, `H` pan, `P` pen, `⌘Z` undo a stroke, `F` fit, `+` / `-` zoom, `?` help, `Esc` back.

History adapters (`mmdx/diff`, `mmdx/adapters`): `staticHistory(versions)`, and `httpHistoryAdapter(url)` — `GET url` returns `{ versions: [{ id, message, author, date }], next? }` newest first (`next` pages with `?cursor=`), and `GET url/<id>` returns the source of one version. For GitLab or GitHub, write the two calls against their commits and raw file APIs:

```ts
const adapter: HistoryAdapter = {
  list: async (cursor) => ({ versions: await commitsOf('docs/arch.mmdx', cursor) }), // [{ id: sha, message, author, date }]
  load: async (sha) => rawFile('docs/arch.mmdx', sha),
};
```

### `<mmdx-studio>`

The complete app — editor, examples, file open, theme editor, share links and the diagram's history — in one element:

```html
<mmdx-studio examples="./examples/index.json" themes="./themes/index.json" persist="local hash"></mmdx-studio>
```

`persist="local"` keeps the last document in browser storage; `persist="hash"` keeps it in the URL, which the Share button copies.

The **History** mode (next to Edit and View) shows the versions of the open diagram in `<mmdx-diff>`: an example's own history (the `history` file of its manifest entry, `{ versions: [{ id, message, author, date, source }] }` newest first), the versions you record with **Save version** or ⌘S (kept in browser storage, per document), and the working copy when it differs from the newest version. Compare any two, view one as it is, and **Restore this version** to open it in the editor (undo brings the previous diagram back). The bundled examples each come with six versions that touch every kind of change.

## The `.mmdx` format

A `.mmdx` file is a Mermaid diagram followed by `%%@` lines, one per styled or placed item. Each line is `%%@ <kind> <id> <JSON>`:

| Line | Holds |
|---|---|
| `%%@ canvas {…}` | Theme, page size and proportions, page background, routing default |
| `%%@ node <id>`, `group <id>`, `edge <from>-><to>` | Flowchart item position, size, preset and style overrides |
| `%%@ participant <id>`, `message m1`, `note n1`, `block b1`, `activation B:1` | Sequence diagram items |
| `%%@ entity <name>`, `rel <A>--<B>` | ER tables and relationships |
| `%%@ style.<kind> <name> {…}` | A style preset defined in this diagram |
| `%%@ layer <id> {"name":…,"hidden":…}` | A user-defined layer |

Messages, notes and blocks are numbered in source order; repeated edges get `#2`, `#3`. Items without a position are laid out automatically and keep their place once moved.

A style is resolved in this order, later wins: the theme's base style → the shape's default → the preset (from metadata or a Mermaid class such as `A:::core`) → Mermaid `classDef` / `style` / `linkStyle` → the item's own metadata.

Plain `.mmd` files open too (they simply have no `%%@` lines), and **Export → portable Mermaid** writes a `.mmd` with generated `classDef` / `linkStyle` lines, so stock renderers show the colours.

## Themes

A theme is a JSON file with a colour palette, the default style of every item type, named presets and page settings. Only the base theme defines everything; other themes `extend` it and store only what they change.

```json
{
  "id": "ocean",
  "name": "Ocean",
  "extends": "default-light",
  "appearance": "light",
  "counterpart": "ocean-dark",
  "palette": { "sky": "#cfe8ff", "ink": "#0b2545" },
  "flowchart": { "node": { "radius": 12 }, "nodePresets": { "core": { "fill": "@sky" } } }
}
```

Built-in themes, as light / dark pairs:

| Light | Dark |
|---|---|
| Default Light (`default-light`) | Default Dark (`default-dark`) |
| GitHub Light (`github-light`) | GitHub Dark (`github-dark`) |
| Catppuccin Latte (`catppuccin-latte`) | Catppuccin Mocha (`catppuccin-mocha`) |
| Rosé Pine Dawn (`rose-pine-dawn`) | Dracula (`dracula`) |

Default Light and Default Dark are bundled; the others are loaded from `mmdx/themes/*` or any manifest you point `configure({ themeSource })` at. Colours in diagrams are stored as palette references (`@sky`) or as a palette colour plus a shift (`@sand~=349.3,+53.5,-5.7`), so a diagram restyles itself when its theme changes. 

| Theme key | Holds |
|---|---|
| `id`, `name`, `extends` | Identity and the theme it builds on (`default-light` when omitted) |
| `appearance`, `counterpart` | `light` or `dark`, and the linked theme of the other appearance |
| `palette`, `font` | Named colours (`"sky": "#cfe8ff"`, referenced as `@sky`) and the font stack |
| `canvas` | Page padding, background, grid and border |
| `flowchart` | `node`, `group`, `edge`, their `…Presets`, `nodeShapes` (per-shape defaults) and `pagePresets` |
| `sequence` | `participant`, `message`, `note`, `block`, `box`, `lifeline`, `activation`, their `…Presets`, `participantShapes`, `layout` and `pagePresets` |
| `er` | `entity`, `rel`, their `…Presets` and `pagePresets` |

Every theme names a linked theme of the other appearance (`counterpart`), and the editor's light / dark toggle shows a diagram in the linked theme of its own; a theme without a link falls back to Default Light ↔ Default Dark. This is a display choice: the file keeps its theme. Theme files are validated when loaded or saved, and invalid values are dropped with a diagnostic.

## Configuration

```ts
import { configure } from 'mmdx/viewer'; // also exported by the editor, theme editor and studio entries
import { fetchThemeSource } from 'mmdx/adapters';

configure({
  themeSource: fetchThemeSource('/themes/index.json'),   // themes a diagram names but the page has not loaded
  i18n: { locale: 'de', messages: { 'zoom.fit': 'Einpassen' } },
  linkPolicy: { protocols: ['https:', 'mailto:'], target: '_blank' },
  fonts: { Inter: '/fonts/inter.woff2' },                 // embedded into PNG exports
  mermaid: () => import('mermaid').then((m) => m.default),
});
```

## Markdown and documentation sites

```ts
import { rehypeMmdx, markdownItMmdx } from 'mmdx/markdown';

// unified / rehype (Astro, Docusaurus, VitePress…)
rehypePlugins: [[rehypeMmdx, { themeDark: 'auto' }]]
// markdown-it
md.use(markdownItMmdx, { attrs: { controls: 'zoom fullscreen' } });
```

Each ` ```mermaid ` block becomes an `<mmdx-viewer>` with a pre-rendered SVG inside, so pages are readable and printable without JavaScript, and become interactive when `mmdx/viewer` loads. For pages rendered at run time, call `upgradeMermaidBlocks(root)` from `mmdx/viewer`.

## Frameworks

The elements work in any framework that renders custom elements. Set object values (`source`, `adapter`, `features`, `store`) as properties and listen to the `mmdx-*` events. React 19 handles both natively; for React 18 and older, use the typed wrappers:

```tsx
import React from 'react';
import 'mmdx/viewer';
import { createReactWrappers } from 'mmdx/react';

const { MmdxViewer } = createReactWrappers(React); // also MmdxEditor, MmdxThemeEditor, MmdxStudio, MmdxDiff

<MmdxViewer source={source} controls="zoom fullscreen" onMmdxRender={(e) => console.log(e.detail)} />;
```

## Styling

The components render in shadow DOM and need no global CSS. Restyle the chrome with CSS custom properties on the element and with parts:

```css
mmdx-editor {
  --mmdx-font: Inter, system-ui, sans-serif;
  --mmdx-accent: #0b7285;
  --mmdx-radius: 6px;
}
mmdx-viewer::part(canvas) { background: transparent; }
```

Tokens include `--mmdx-font`, `--mmdx-accent`, `--mmdx-surface`, `--mmdx-surface-2`, `--mmdx-border`, `--mmdx-text`, `--mmdx-radius`, `--mmdx-shadow` and `--mmdx-z-popover`; parts include `canvas`, `toolbar` and `zoom-bar`. The diff's highlight colours are tokens too, with light and dark values: `--mmdx-diff-add`, `--mmdx-diff-del`, `--mmdx-diff-content`, `--mmdx-diff-layout`, `--mmdx-diff-style` (each with a `-bg` tint) and `--mmdx-diff-dim`; its parts add `diff-bar`, `panel`, `change-list` and `history`. Colour is never the only signal: removed items are dashed, badges carry `+ − C L S`, and text changes are struck out or bold. The `ui` attribute switches the chrome between light and dark, or follows the page and the OS (`auto`).

## Security

Diagram sources, metadata and theme files are treated as untrusted. Every style value is validated when parsed, the SVG is built through a single escaping serializer with an attribute allowlist, the DOM is never patched with `innerHTML`, and links go through the link policy (`javascript:` and protocol-relative URLs are rejected). Limits: 1 MB of source, 5 000 items and a 2 s render timeout in the worker. The components run under this CSP:

```
script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:
```

## Browser support

Current Chrome, Edge and Firefox, and Safari 16.4 or newer (the components need ES2022, custom elements and constructable stylesheets). `mmdx/core` runs in Node 18 or newer.

## Known limitations

- The Mermaid parsers cover the commonly used subset of flowchart, sequence and ER syntax; other diagram types fall back to stock Mermaid.
- Connectors are routed between ports (curved, orthogonal or straight) through optional bend points; there is no obstacle avoidance.
- A sequence diagram's layout follows its message order; metadata can shift participants and add vertical space.
- PNG export uses fonts installed locally unless they are registered with `configure({ fonts })`.
- The diff draws flowchart, sequence and ER diagrams; for other types (and a change of diagram type) it shows the code diff. It runs on the main thread, also for large diagrams, and it never writes history: the studio keeps the versions you save in browser storage, and hosts provide history through an adapter.

## Development

```bash
pnpm install        # the repository uses pnpm (corepack enable picks the pinned version)
pnpm dev            # the studio (with History) and one demo page per component at http://localhost:8790
pnpm storybook      # every component and feature as stories at http://localhost:6006
pnpm test           # unit, geometry and golden SVG snapshots, security and DOM tests (Vitest + jsdom)
pnpm typecheck      # strict TypeScript, plus a DOM-free check of src/core
pnpm build          # library (dist/), type declarations (dist/types) and the demo site
pnpm build:storybook  # static Storybook in storybook-static/
pnpm size           # gzip size budgets per entry point
```

| Folder | Contents |
|---|---|
| `src/core` | Parsers, layout, renderers, metadata, themes — pure TypeScript, no DOM |
| `src/dom` | DOM patcher, viewport, pen, worker client, export |
| `src/ui` | Signals, toolbars, dialogs, styles and UI strings |
| `src/editor` | The editor core and its feature modules |
| `src/elements` | The five web components |
| `src/adapters`, `src/markdown`, `src/wrappers` | Host adapters, Markdown plugins, React wrappers |
| `themes/` | Built-in theme files (`node tools/build-themes.mjs` regenerates the generated ones) |
| `examples/` | Example diagrams used by the studio and the golden tests, and their version histories (`examples/history`) |
| `apps/studio-site/` | The demo site deployed to GitHub Pages |
| `stories/`, `.storybook/` | Storybook: the elements (the diff included), the UI pieces with mock APIs, core rendering and the semantic diff |
| `docs/` | Design documents and the release notes (`CHANGELOG.md` at the root) |
| `brand/` | Logo files |

Pull requests are welcome. Please run `pnpm typecheck` and `pnpm test` before opening one; CI also checks the build and the size budgets.

## License

[MIT](LICENSE)
