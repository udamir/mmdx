# `<mmdx-diff>` — diagram history and diff component

Design document · status: proposed · prototype: `apps/studio-site/diff.html` (branch `feature/visual-editor`)

## 1. Summary

`<mmdx-diff>` is a fifth web component next to `<mmdx-viewer>`, `<mmdx-editor>`, `<mmdx-theme-editor>` and `<mmdx-studio>`. It shows how a Mermaid / `.mmdx` diagram changed between two versions, and lets a reviewer browse the version history of a diagram. Its main job is to make a merge-request review of a diagram fast: a reviewer sees at a glance what was added, removed and changed, can hide the noise they do not care about (layout or style), can step through every change, and can read the matching lines of the source.

The component is built from what the prototype validated and from the existing architecture: the pure core (`src/core`), the DOM layer (`src/dom`), the shared UI kit (`src/ui`) and the element conventions of the viewer and the editor. It supports the light and dark chrome schemes, diagram themes (including light / dark counterparts and custom themes), and exports the diff as images, sources and reports.

## 2. Goals and non-goals

### Goals

- Show the difference between two versions of one diagram for the three supported types (flowchart, sequence, ER), with a semantic diff (items, not text lines).
- Classify every change as **added**, **removed** or **changed**, and every change of a kept item into **content**, **layout** or **style** facets that can be filtered out independently.
- Four views: **Before**, **Merged**, **After** (one canvas, animated transitions) and **Side by side**.
- Word-level text changes (labels, messages, notes, ER attributes) in the merged picture.
- A change list, a code / metadata diff narrowed to the selected item, and a version history with view and compare modes.
- Light / dark chrome, diagram themes with automatic dark counterparts, host restyling through `--ds-*` tokens and `::part()`.
- Export: SVG and PNG of any view (with or without highlights and ink), `.mmdx` / portable `.mmd` of a version, a unified source diff, a JSON change report and a Markdown summary for MR descriptions and bot comments.
- Server-side rendering of a diff to SVG (`mmdx/core`) for CI bots, with no DOM.
- Same security model, CSP, size discipline and accessibility bar as the other components.

### Non-goals

- Three-way merge or conflict resolution (the editor keeps its conflict dialog; it may embed `<mmdx-diff>` to show the two sides, see §15).
- Editing in the diff view (it is read-only; "open in editor" is a host action).
- Diffing diagram types the core does not parse (gantt, class, …): they get a source-only diff (§12.4).
- Storing history: the component reads versions through an adapter; it never writes.

## 3. Background

### 3.1 What the prototype validated

The prototype (`apps/studio-site/diff.html`, `apps/studio-site/diff/*`) went through several rounds of user feedback. The final UX that this design adopts:

| Area | Final prototype decision |
|---|---|
| Views | Before (old version, its removed and changed items highlighted), Merged (overlay), After (new version, added and changed items highlighted), Side by side. Before / Merged / After share one canvas and animate between each other. Swipe and onion skin were dropped. |
| Merged picture | The new version plus every removed item kept at its old place (removed ER rows and sequence messages get real room), text changes marked word by word (removed words struck out in red, added words green and bold, a highlighter run behind each), an arrow from the old place of each moved item. |
| Filters | Added, Removed, Content, Layout, Style as coloured icons with counts, plus Dim unchanged, all in the bottom bar. Content only covers changed content of kept items; it never hides added or removed items. Style off draws both versions unstyled; Layout off draws the old version on the new layout. |
| Left tool panel | Viewer bar style, vertical: Pan, Magic pen, History, Code diff, Change list. |
| Zoom bar | Unchanged viewer / editor zoom bar (−, +, Fit) plus a `?` help button; the help popup replaces every inline hint. |
| Change list (right) | One row per change with the filter icon(s) of that change, the item kind and its name. Selecting only selects and zooms; it does not expand details. |
| Code panel (left) | Code / Metadata tabs; a unified line diff without the filtered-out facets; while an item is selected it narrows to that item's lines ("Lines of …", Show all). |
| History panel (left) | History / Compare tabs in the panel header. Rows: line 1 commit message; line 2 id, author, age and, right-aligned, `+added −removed ~changed`. History mode views one version plainly (no diff controls). Compare mode has Before / After buttons per row; one version cannot be both sides. |
| Pen | The viewer's magic pen (colours, sizes, auto erase 5 s / 10 s / keep, erase all); strokes live in diagram coordinates and show in every view and pane. |

### 3.2 What exists today

- `src/core/diff` (added with the prototype): `diffDiagrams`, `diffModels`, `ignoreFacets`, `lcs`, `withoutStyle`, `withLayoutOf`, typed `DiagramDiff` / `ItemChange` / `FieldChange`. Pure, tested (`tests/core/diff`), not yet exported from `mmdx/core`.
- `apps/studio-site/diff/merge.ts`: the merged model (after + removed items + word marks) — prototype code, depends on the `diff` npm package.
- Rendering: `renderSource` / `renderDocument` / `standaloneSvg` (core), the keyed DOM patcher (`dom/patch.ts`), `Viewport` (`dom/viewport.ts`), magic pen (`dom/pen.ts`), PNG export (`dom/export.ts`).
- Chrome: tokens and `data-ui` scheme (`ui/styles/base.ts`), popovers / toasts, i18n, signals, shortcut registry, the editor's floating panes (`editor/modules/chrome/panes.ts`), zoom bar and help (`editor/modules/chrome/zoom-bar.ts`).
- Themes: registry with validation, light / dark counterparts (`core/theme/pairs.ts`), `theme-dark="auto"` in the viewer.

## 4. Use cases

| ID | Who | Scenario |
|---|---|---|
| D1 | Reviewer | Opens a merge request that changes `architecture.mmdx`; the host page (GitLab / GitHub app, internal portal) shows `<mmdx-diff>` with the target-branch and MR-branch files. They switch Style off, step through changes with J / K, read the code lines of each, and circle something with the pen to screenshot it into a comment. |
| D2 | Author | Before requesting a review, opens the history of the diagram and compares their branch with the version from a week ago. |
| D3 | Docs reader | On a documentation portal, opens "History" of a diagram embedded in a page, views an older version, and copies its link. |
| D4 | CI bot | On every MR that touches `*.mmdx`, renders the merged diff to SVG / PNG and a Markdown summary with `renderDiffToSvg` and `diffReport`, and posts them as an MR comment. |
| D5 | Editor user | Gets a save conflict in `<mmdx-editor>`; the "Compare" choice shows the two sides in an embedded diff instead of two `<pre>` blocks. |

## 5. Concepts

- **Version** — one source of the diagram plus metadata: `id` (commit SHA, revision id or a content hash), `message`, `author`, `date`, optional `url`. A **history** is an ordered list of versions, newest first in the UI.
- **Before / After** — the two versions being compared (`base` / `head` in API terms). In History mode only one version is shown.
- **Change** — an item that was added, removed or changed (`ItemChange`), or a diagram-wide change (`FieldChange` in `diff.doc`: theme, page, local presets, classDef, direction, layers).
- **Facet** — what kind of change a field change is: `content`, `layout` or `style` (`FACETS`). Facets apply to changed items only; added / removed items have their own filters.
- **Change key** — a stable id of a change in the merged picture: `kind:id` for kept and added items, `kind:id~del` for removed ones (participants keep their id, see §7.3).
- **Views** — `before`, `merged`, `after`, `side`. The first three are states of one canvas; `side` shows two linked canvases.
- **Filters** — `added`, `removed` (hide those items), `content`, `layout`, `style` (ignore those facets), and `dim` (fade unchanged items).

## 6. Architecture

### 6.1 Layers and modules

```
mmdx/core (pure, no DOM, no dependencies)
  core/diff/index.ts        semantic diff (exists): diffDiagrams, diffModels, ignoreFacets, lcs, FACETS, types
  core/diff/transform.ts    withoutStyle, withLayoutOf (exists)
  core/diff/text.ts         NEW  word and line diff (Myers), mergeText, change marks
  core/diff/merge.ts        NEW  merged model (moved from apps/studio-site/diff/merge.ts)
  core/diff/annotate.ts     NEW  highlight / badge / move-arrow scene nodes from geometry
  core/diff/report.ts       NEW  JSON, Markdown and unified-diff reports
  core/diff/render.ts       NEW  renderDiff (before / merged / after scenes) + renderDiffToSvg (SSR)

mmdx/dom
  dom/morph.ts              NEW  state transitions on keyed DOM (from prototype morph.ts)
  dom/pen.ts                EXTEND  shared stroke store so several layers mirror one set of strokes
  dom/viewport.ts           EXTEND  linked viewports (side by side)

mmdx/ui
  ui/panes.ts               NEW  floating side panels, slide + resize (extracted from editor chrome/panes.ts)
  ui/zoom-bar.ts            NEW  zoom bar + help popup (extracted from editor chrome/zoom-bar.ts)
  ui/styles/diff.ts         NEW  diff chrome CSS and diff colour tokens
  ui/messages/diff.ts       NEW  i18n strings

elements
  elements/diff.ts          NEW  DiagramDiff (imperative) + MmdxDiffElement + defineDiff
  elements/diff/*.ts        NEW  feature modules: canvas, diff-bar, tool-panel, changes, code, history, export, help

adapters
  adapters/history.ts       NEW  HistoryAdapter, staticHistory, httpHistoryAdapter

entry
  src/diff.ts               NEW  mmdx/diff: defines <mmdx-diff>, exports the class, configure, adapters
```

The editor and the diff share `ui/panes.ts` and `ui/zoom-bar.ts`: the editor modules become thin wrappers so the two components look and behave the same (one of the explicit asks of the prototype review: "sidebars like in the editor", "zoom panel not modified").

### 6.2 Dependency decision: text diff

The prototype uses the `diff` npm package (`diffArrays` over words and lines). The library promises **no runtime dependencies** (README) and `mmdx/core` has a 45 kB budget. Decision: implement a small Myers O(ND) diff in `core/diff/text.ts` (≈ 100 lines) with the same tokenisation as the prototype (whitespace-separated words, line breaks as tokens), and keep `diff` as a dev dependency used by the tests to cross-check results on fixtures. Alternative considered: depend on `diff` from `mmdx/diff` only (+≈ 9 kB gz, tree-shaken); rejected to keep the no-dependency promise and SSR in workers simple. `lcs` (already in core) stays for item alignment.

### 6.3 Data flow

```
sources (before, after) ──► splitSource ─► parse ─► diffModels ─► DiagramDiff (raw)
                                                       │
            filters (ignore facets, hide added/removed) ▼
                                                 DiagramDiff (filtered)
                                                       │
transforms (withoutStyle if style off, withLayoutOf if layout off)
                                                       ▼
          renderDocument(before) · renderDocument(merged model) · renderDocument(after)
                                                       │
            annotate(geometry, changes, view) ─► overlay scene nodes (highlights, badges, arrows)
                                                       ▼
                       keyed DOM patch per canvas  ·  standaloneSvg for export / SSR
```

Derived state is computed with the existing signals (`ui/signal.ts`): `sources`, `filters`, `themeId` and `scheme` are signals; `rawDiff`, `diff`, `renders` and `changes` are `computed`; the canvases, lists and panels are `effect`s. A version pair's raw diff and renders are cached in a bounded LRU (`core/text/measure.ts` `Lru`), keyed by the two version ids (or content hashes) plus theme and filters, so switching back and forth in the history is instant.

### 6.4 Work off the main thread

Like the viewer, sources over 300 lines (either side) are diffed and rendered in the render worker (`dom/render-worker.ts` gains `diff` and `renderDiff` messages). The worker returns the scenes and the `DiagramDiff` (plain data; `Set`s in models are not sent — the worker sends the model-free result). The 2 s render timeout and 1 MB / 5 000-item limits apply per version.

## 7. Core design

### 7.1 Semantic diff (exists, to be exported)

`diffModels(a, b, metaA, metaB)` matches items by identity: node, group, entity and participant ids; edges and relationships by endpoints (with parallel-edge order); sequence messages, notes and blocks by content alignment (`lcs` on a content key, then similar items paired inside gaps), because their ids are positions. A node removed and added with the same label and shape is a rename (one changed item with an `id` field change, edges follow it). Every field change gets a facet; metadata keys map to facets by a fixed table (`x y w h points fromSide toSide fromAt toAt labelDx labelDy dy layer` → layout; `link` → content; `locked` ignored; everything else → style).

`ignoreFacets(diff, { content?, layout?, style? })` drops ignored field changes; a changed item whose every change was ignored becomes unchanged. Added and removed items always stay (the Content filter covers changed content only — a deliberate prototype decision).

Export from `mmdx/core`: `diffDiagrams`, `diffModels`, `ignoreFacets`, `withoutStyle`, `withLayoutOf`, `mergeDiagrams`, `renderDiff`, `renderDiffToSvg`, `diffReport`, and the types.

### 7.2 Word and line diff (`core/diff/text.ts`)

```ts
export type TextOp = { op: 'same' | 'add' | 'del'; value: string };
export function diffWords(a: string, b: string): TextOp[];      // whole words; "\n" is a token
export function diffLines(a: readonly string[], b: readonly string[]): LineOp[];
export function mergeText(before: string, after: string): string; // with change marks, see 7.3
export const MARK = { DEL_OPEN: '​', DEL_CLOSE: '‌', INS_OPEN: '‍', INS_CLOSE: '⁠' } as const;
export function splitMarks(s: string): { text: string; mark: 'ins' | 'del' | null }[];
export const stripMarks = (s: string) => string;
```

Words are whitespace-separated with punctuation kept on the word (so `/networks/{name}` stays one token — the prototype found that jsdiff's default word diff split it badly). A removed run followed by an added run is separated by one space.

### 7.3 Merged model (`core/diff/merge.ts`)

`mergeDiagrams(diff, a, b, metaA, metaB): Merged | null` builds a renderable model: the after model plus every removed item, and changed text carrying change marks. Rules (from the prototype, all covered by tests):

- Flowchart: removed nodes / groups / edges are added with id `id~del`, their old metadata (position) carried over; removed edges are re-pointed to the merged ids of their ends (renames followed); removed groups keep their removed children. Changed labels of nodes, groups and edges are `mergeText(old, new)`. `classDefs` are merged (old first) so removed items keep their classes.
- ER: changed entities get a merged attribute list: the after order, removed attributes put back after their previous neighbour (removed rows first, then added ones, like a text diff), changed types / keys / comments marked; removed entities and relationships are added with `~del`.
- Sequence: removed messages and notes are inserted right after the nearest earlier item both versions share (so they keep their row instead of overlapping), with activations switched off; removed participants are inserted at their old index and keep their id (removed messages refer to them); changed message / note / block texts are marked.
- Removed blocks are not re-inserted (they would re-nest the diagram); they appear in the change list only.
- Returns `null` when the diagram type changed (the views then fall back to before / after only).

`Merged.status` maps merged keys (`kind:id`) to changes; the change key used everywhere in the UI is this merged key.

**Marks inside the scene.** The prototype kept the zero-width marks inside label strings and rewrote `<tspan>`s in the DOM afterwards. Production keeps the marks in the model (they survive wrapping, since wrap splits on spaces) but handles them in exactly two places: the text measurers treat the four mark characters as zero width (the static measurer currently counts non-ASCII as an average glyph — fix), and the scene serializer and the DOM patcher split a marked `TextLine` into runs, emitting `<tspan class="dx-ins">` / `<tspan class="dx-del">` (class tokens chosen by the code, never by content; `class` is already allowlisted). No `innerHTML` and no post-processing pass, so SSR and export get the same output as the screen.

### 7.4 Annotations (`core/diff/annotate.ts`)

```ts
export interface AnnotateOptions { view: 'before' | 'merged' | 'after'; dim: boolean; badgeScale?: number }
export function annotate(r: RenderResult, changes: readonly ItemChange[], before: RenderResult | null, o: AnnotateOptions): {
  overlay: SceneNode[];      // highlight outlines / connector strokes / badges / move arrows / highlighter runs
  dim: ReadonlySet<string>;  // item keys to fade
};
```

Shapes come from the geometry index (`GeometryIndex`): centre boxes for nodes, groups, entities, participants, notes and blocks; edge / relation paths and label boxes; message spans. Overlay rules per view: Before marks removed (dashed) and changed items; After marks added and changed items; Merged marks everything, fades removed items (60 %) and adds an arrow from the old centre (before geometry) to the new one for every item with a `position` change. Badge text: `+`, `−`, or the facet initials (`C`, `L`, `S`). Highlighter runs need text extents: core computes them from the measurer (run widths along the wrapped line), so they work in SSR too (the prototype used `getBBox`).

On screen, badges keep a constant screen size (scale `1 / k` from the viewport); in exports they use `badgeScale` derived from the export scale.

### 7.5 Rendering API (`core/diff/render.ts`)

```ts
export interface DiffRenderOptions extends PipelineOptions {
  ignore?: DiffIgnore; hide?: { added?: boolean; removed?: boolean };
  view?: 'before' | 'merged' | 'after' | 'side'; dim?: boolean; highlights?: boolean;
}
export function renderDiff(before: string, after: string, ctx: CoreContext, o?: DiffRenderOptions): DiffRendered;
export async function renderDiffToSvg(before: string, after: string, o?: DiffRenderOptions & { theme?: string; ssr?: boolean }): Promise<string>;
```

`DiffRendered` holds the raw and filtered diff, the three `Rendered` results (before, merged, after; merged may be null), the transformed sources (for the code panel) and the union page bounds, so all views share one coordinate space. `side` in `renderDiffToSvg` composes the two pages next to each other with titles in one standalone SVG.

### 7.6 Reports (`core/diff/report.ts`)

```ts
export function diffReport(diff: DiagramDiff, o: { format: 'json' | 'markdown'; before?: VersionInfo; after?: VersionInfo; links?: (c: ItemChange) => string | null }): string;
export function unifiedDiff(before: string, after: string, o?: { name?: string; context?: number; part?: 'all' | 'code' | 'meta'; ignore?: DiffIgnore }): string;
```

Markdown lists counts and, grouped by status, each change with its fields `before → after` (escaped; colours shown as code spans). JSON is the `DiagramDiff` with a schema version. `unifiedDiff` produces a standard patch (`---` / `+++` / `@@`) of the transformed sources, usable by `git apply` when no facet is ignored.

## 8. Component API

### 8.1 Element and imperative class

```html
<script type="module">import 'mmdx/diff';</script>

<!-- two versions -->
<mmdx-diff before="/api/files/arch.mmdx?ref=main" after="/api/files/arch.mmdx?ref=feature-x"
           view="merged" filters="added removed content layout" theme-dark="auto" style="height: 720px"></mmdx-diff>

<!-- a history -->
<mmdx-diff panels="history changes" mode="compare"></mmdx-diff>
<script type="module">
  const d = document.querySelector('mmdx-diff');
  d.history = httpHistoryAdapter('/api/diagrams/arch/versions'); // or a static list
</script>
```

```ts
import { DiagramDiff } from 'mmdx/diff';
const diff = new DiagramDiff(host, { before, after, view: 'side', ignore: { style: true } });
```

### 8.2 Attributes and properties

| Attribute / property | Default | Meaning |
|---|---|---|
| `before`, `after` / `beforeSource`, `afterSource` (properties) | — | The two versions to compare: URLs fetched through `loader`, or sources. |
| `history` (property) | — | `HistoryAdapter` or `Version[]`; enables the History panel. Without it, before / after are a two-version history. |
| `base`, `head` | previous, newest | Version ids to compare when a history is set. |
| `mode` | `compare` | History panel tab: `compare` or `history` (view one version plainly). |
| `view` | `merged` | `before`, `merged`, `after` or `side`. |
| `filters` | `added removed content layout style` | Shown change kinds; e.g. `added removed content` = ignore layout and style. |
| `dim` | `true` | Fade unchanged items. |
| `panels` | `changes` | Open side panels: any of `history`, `code`, `changes` (`history` and `code` share the left side; the last one wins). |
| `features` (property) | all on | Turn parts off: `history`, `code`, `changes`, `views`, `filters`, `pen`, `export`, `help`, `fullscreen`, `select`. |
| `theme`, `theme-dark` | the after version's own | Same semantics as the viewer: forced theme, theme on dark pages, `auto` = counterpart. |
| `ui` | `auto` | Chrome scheme: `light`, `dark` or `auto`. |
| `fit`, `wheel`, `interactive`, `lazy` | as viewer | Same semantics as the viewer. |
| `name` | `diagram` | File name stem for exports. |
| `loader`, `storage`, `ctx`, `themeSource` (properties) | as viewer | Same as the viewer. |
| `label` | generated | Accessible name, e.g. "Diagram diff: 2 added, 2 removed, 8 changed". |

### 8.3 Events

All bubble and are composed, like the other components.

| Event | Detail | Notes |
|---|---|---|
| `ds-diff` | `{ counts, typeChanged, base, head }` | After every (re)computation. |
| `ds-select` | `{ key, change \| null }` | Change list / canvas selection. |
| `ds-view` | `{ view, mode }` | View or history mode switched. |
| `ds-filters` | `{ filters, dim }` | Filter change. |
| `ds-version` | `{ base, head, viewing? }` | Compare pair or viewed version changed; hosts sync the URL. |
| `ds-export` | `{ kind, name, data }` | Cancelable: host saves the file itself (as in the editor). |
| `ds-render`, `ds-error`, `ds-link`, `ds-fullscreen` | as viewer | |

### 8.4 Methods

`compare(before, after)`, `setHistory(adapterOrList)`, `setPair(baseId, headId)`, `viewVersion(id)`, `setView(view)`, `setFilters(filters)`, `select(key | null)`, `next()`, `prev()`, `fit()`, `zoomTo(k)`, `getDiff()` (the filtered `DiagramDiff`), `exportAs(kind, options)`, `toSvg(options)`, `toPng(options)`, `destroy()`.

### 8.5 History adapter

```ts
export interface VersionInfo { id: string; message: string; author?: string; date?: string; url?: string }
export interface HistoryAdapter {
  /** Newest first. May page: `cursor` from the previous page. */
  list(cursor?: string): Promise<{ versions: VersionInfo[]; next?: string }>;
  /** The source of one version (untrusted, validated like any source). */
  load(id: string): Promise<string>;
  subscribe?(cb: () => void): () => void;
}
export function staticHistory(versions: (VersionInfo & { source: string })[]): HistoryAdapter;
export function httpHistoryAdapter(url: string, init?: RequestInit): HistoryAdapter; // GET url → list, GET url/:id → source
```

Per-version change counts in the history list (`+2 −1 ~5`) are computed lazily for visible rows, in idle time (`requestIdleCallback`, worker for large sources), and cached by version id; rows show a skeleton until ready. GitLab / GitHub adapters are recipes in the docs, not built in (auth and API differences belong to the host).

## 9. UX specification

### 9.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ left sidebar ─┐                                         ┌─ right sidebar ─┐ │
│ │ History|Compare│  ┌───┐                                   │ Changes       × │ │
│ │  or            │  │ ✋ │   canvas (one or two panes)        │ ⊞ node  Tracing │ │
│ │ Code|Metadata  │  │ ✎ │                                   │ ⊟ node  Desktop │ │
│ │                │  │ ⏱ │                                   │ T node  LB (L7) │ │
│ │                │  │ </>│                                  │ …               │ │
│ │                │  │ ☰ │                                   └─────────────────┘ │
│ └────────────────┘  └───┘   [Before|Merged|After|Side] ⊞⊟T✥◎ ◐   [− + Fit ?]│
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Left tool panel** (viewer bar style, vertical, centred on the left edge of the canvas area): Pan (H), Magic pen (P), History (V), Code diff (C), Change list (L). Icon buttons with hover tooltips; pressed state uses `--ds-accent-2` / `--ds-accent`. The pen opens the viewer's pen options popup next to the panel.
- **Bottom diff bar** (same bar style, horizontal, centred at the bottom): views Before / Merged / After / Side by side (1–4), then the five filter icons (coloured like their highlights, count badge, struck out when off), then Dim. Tooltips above the buttons. Hidden in History mode.
- **Zoom bar** (bottom right): exactly the editor / viewer zoom bar plus `?`. The help popup lists views, filters, panels and shortcuts, generated from the shortcut registry, as in the editor.
- **Side panels**: the editor's floating cards (14 px radius, shadow, slide in / out, resize by the inner edge, double-click resets, widths remembered in `storage`). The canvas area is inset by the open panels (`Viewport.insets`) so nothing is hidden behind them. History and Code share the left slot.

### 9.2 Views

| View | Canvas | Highlights |
|---|---|---|
| Before | old version | removed (dashed red), changed (facet colour) |
| Merged | merged model | all; removed items faded; word marks; move arrows |
| After | new version | added (green), changed (facet colour) |
| Side by side | old + new, linked pan / zoom | as Before (left) and After (right); pane titles show version id, author, age |

Switching between Before, Merged and After animates (`dom/morph.ts`): items are paired by change key; paired items with the same structure tween geometry, path data and colours; changed text flips (scale-Y out / in); items only one side has fade; the highlight layers cross-fade. Duration 900 ms, ease-in-out; with `prefers-reduced-motion` the switch is instant. ← / → step between the three. The diagram-type-changed case shows Before and After only.

### 9.3 Change list

One row per change, ordered by position in the drawing (top to bottom, left to right): filter icon(s) (added, removed, or one per changed facet), kind (`node`, `edge`, `table`, `relation`, `participant`, `message`, `note`, `block`) and name (struck out when removed). Tooltip: the changed field names. Diagram-wide changes come first in a collapsible "Diagram-wide" group with their `before → after` values (colour swatches for colours). Click selects (canvas highlight pulses, view zooms to the item if it is off screen); click again deselects. J / K step through the list; Esc clears. No inline expansion (prototype decision); details live in the code panel and in the tooltip.

### 9.4 Code panel

Tabs **Code** (Mermaid only) and **Metadata** (`%%@` lines, normalised with `metaToLines` so ordering noise disappears). Unified diff with old / new line numbers, hunks with three lines of context, collapsed unchanged runs that expand on click. Ignored facets are left out (style lines and style metadata when Style is off; old layout replaced when Layout is off), with a small note in the header. With a selected change the diff narrows to that item: on Code, the lines that define or mention it on either side (a node's lines include its edges; an entity's whole block; a block's start / else / end lines); on Metadata, its `%%@` line(s); a "Lines of {item} · Show all" bar restores the full file; gaps between non-adjacent lines are shown as `⋯` rows. In History mode the panel shows the viewed version's plain source.

### 9.5 History panel

Tabs **History** and **Compare** in the panel header. Rows, newest first:

```
Change column type ×2, add column, relabel relation            [Before] [After]
dfafecc current  Priya 8 hours ago                                  +2 −1 ~4
```

- Line 1: commit message (one line, ellipsis). Line 2: id (monospace), `current` tag on the newest, author, relative age, and right-aligned coloured `+added −removed ~changed` (or `initial`).
- **History**: click a row to view that version plainly (standard viewer rendering, no highlights, no diff bar, no change list). The canvas title shows id, message, author and age. The selected row has a tinted background (no accent line).
- **Compare**: each row has Before and After buttons; the chosen rows are tinted red / green. A version cannot be both sides (the other button is disabled with a tooltip). Clicking a row compares it with the version before it; the first version becomes Before.
- Long histories page through `HistoryAdapter.list(cursor)` with infinite scroll; counts compute lazily.

### 9.6 Keyboard

| Keys | Action |
|---|---|
| 1 2 3 4 | Before, Merged, After, Side by side |
| ← → | Step Before ↔ Merged ↔ After |
| J K | Next / previous change |
| H P | Pan, Magic pen |
| V C L | History, Code diff, Change list panels |
| F, + / − | Fit, zoom |
| ⌘Z | Undo the last pen stroke |
| ? | Help |
| Esc | Close help → stop the pen → clear the selection |

Shortcuts are registered in the shortcut registry (`ui/shortcuts.ts`) and only act while focus is inside the component (as in the editor), never on text inputs.

### 9.7 Responsive behaviour

Below 720 px the side panels become full-height overlays (one at a time) and the bottom bar collapses the four view buttons into a select; below 480 px Side by side stacks vertically. Touch: pan with one finger, pinch to zoom (existing viewport), long-press shows tooltips.

### 9.8 Empty, error and loading states

No changes ("No changes with the current filters" in the list; an unobtrusive toast on the canvas when everything is filtered out). Type changed (banner; views limited to Before / After; code panel still diffs). Unsupported diagram type (source-only diff, §12.4). Parse errors on a side (the viewer's error card for that side; the diff still shows the other one). Loading (skeleton canvas, history rows with skeleton counts). Adapter failures raise `ds-error` and a toast with Retry.

## 10. Theming, dark mode and colours

### 10.1 Chrome scheme

The element follows the existing pattern: `ui="light|dark|auto"`, `auto` resolved by `resolveUiScheme` (page `data-theme` / `data-ui`, then `prefers-color-scheme`), updated by `watchUiScheme`, reflected as `data-ui` on the host, all chrome colours from `--ds-*` tokens (`ui/styles/base.ts`). The prototype hard-coded light colours in page CSS; production moves every colour into tokens.

### 10.2 Diff colour tokens

New tokens in `TOKENS` (light) and the dark block. Colour is never the only signal: removed outlines are dashed, badges carry `+ − C L S`, word marks use strike-through and bold.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ds-diff-add` | `#1a7f37` | `#3fb950` | added outlines, inserted words, count badges |
| `--ds-diff-add-bg` | `#dafbe1` | `rgba(46,160,67,.22)` | added fills, highlighter |
| `--ds-diff-del` | `#cf222e` | `#f85149` | removed outlines (dashed), deleted words |
| `--ds-diff-del-bg` | `#ffebe9` | `rgba(248,81,73,.22)` | removed fills, highlighter |
| `--ds-diff-content` | `#b35900` | `#e3a33b` | content facet |
| `--ds-diff-content-bg` | `#fff1e0` | `rgba(227,163,59,.2)` | |
| `--ds-diff-layout` | `#0969da` | `#58a6ff` | layout facet, move arrows |
| `--ds-diff-layout-bg` | `#ddf4ff` | `rgba(56,139,253,.2)` | |
| `--ds-diff-style` | `#8250df` | `#bc8cff` | style facet |
| `--ds-diff-style-bg` | `#fbefff` | `rgba(163,113,247,.2)` | |
| `--ds-diff-dim` | `.28` | `.35` | opacity of unchanged items |

Blending: in light mode highlight fills and highlighter runs use `mix-blend-mode: multiply` (they tint without washing out text — a prototype fix); in dark mode multiply would darken a dark canvas, so they use the translucent `-bg` colours with `normal` blending and the outline at full opacity. Hosts override any token on the element (`mmdx-diff { --ds-diff-add: … }`).

### 10.3 Diagram themes

- Both versions are rendered with **one** theme so the comparison is fair: the forced `theme` attribute, else the after version's `canvas.theme`, else baseline. A theme change between versions is reported as a diagram-wide style change.
- Dark pages: `theme-dark` as in the viewer; `auto` picks the counterpart of the chosen theme (`counterpartTheme`), loading the built-in dark themes first when needed.
- **Style off** renders both versions with `withoutStyle` (no classes, presets, colours or theme from the sources) in the selected theme's base styles.
- Word marks and badges sit on top of diagram colours, so their legibility does not depend on the theme: marked text gets a page-colour halo (`paint-order: stroke`, the renderer's `paper` colour, as edge labels already do), and highlight colours come from the diff tokens, not from the theme palette.
- Optional (phase 4): a theme file may define a `diff` block (`{ add, del, content, layout, style }`, palette references allowed) validated by `validateTheme`; when present it overrides the tokens inside the canvas so a branded theme can tune its diff colours. The theme editor gets a "Diff" preview tab.

### 10.4 Parts

`::part(canvas)`, `::part(toolbar)` (left panel), `::part(diff-bar)`, `::part(zoom-bar)`, `::part(panel)` (each side panel), `::part(change-list)`, `::part(history)`.

## 11. Export

### 11.1 Formats

| Kind | Content | Built by |
|---|---|---|
| `svg` | The current view (or a chosen one) as a standalone SVG: page, diagram, highlights, optional ink and legend; Side by side composes two titled pages. | `renderDiffToSvg` / `standaloneSvg` + `annotate` |
| `png` | Same, rasterised with fonts inlined (`svgToPng`, `configure({ fonts })`), scale 1–4, background from the page or transparent. | `dom/export.ts` |
| `mmdx` | The before, after or viewed version source as stored. | adapter / sources |
| `mmd` | Portable Mermaid of a version (`classDef` / `linkStyle`). | `core/export/portable.ts` |
| `diff` | Unified source diff (`--- a/name.mmdx` / `+++ b/name.mmdx`), whole file or code / meta part, filters applied or not. | `unifiedDiff` |
| `json` | Change report (`DiagramDiff` + version infos, schema-versioned). | `diffReport` |
| `md` | Markdown summary for MR descriptions and bot comments, optionally with links per change. | `diffReport` |

### 11.2 Options and UI

`exportAs(kind, { view?, version?: 'before' | 'after' | 'viewed', highlights?: boolean, ink?: boolean, legend?: boolean, scale?: number, background?: 'page' | 'transparent', scheme?: 'light' | 'dark', theme?: string, filtered?: boolean })`. The export menu (in the left panel's overflow or a download button in the zoom bar group, decided in design review) offers the common presets: "Image of this view (PNG)", "SVG", "Before / After source", "Patch (.diff)", "Report (Markdown)", "Report (JSON)". File names: `{name}-{baseId}..{headId}-{view}.{ext}`. `ds-export` is cancelable so hosts can upload instead of downloading. A legend (filter colours and badge letters, plus version ids) is added to image exports by default because the exported picture leaves the component's help behind.

### 11.3 SSR / CI

```ts
import { renderDiffToSvg, diffReport, diffDiagrams } from 'mmdx/core';
const svg = await renderDiffToSvg(before, after, { view: 'merged', theme: 'github-light', ignore: { layout: true } });
const md = diffReport(diffDiagrams(before, after), { format: 'markdown', before: { id: baseSha }, after: { id: headSha } });
```

Works in Node 18+ and workers (static measurer, no DOM). `ssr: true` marks the SVG for hydration, so `<mmdx-diff>` adopts a server-rendered merged view without re-rendering until the user interacts (as the viewer does).

## 12. Behaviour details and edge cases

### 12.1 Identity and renames

Nodes: rename detection by unique `(label, shape)` match between removed and added sets. ER entities and sequence participants: same rule on `(label, attribute names)` / `(label, kind)` (not in the prototype yet). Below a confidence threshold the pair stays added + removed. Sequence messages are aligned by content; an edited message whose endpoints changed is added + removed.

### 12.2 Layout without metadata

Plain Mermaid (no `%%@` lines) is auto-laid out per version, so adding a node can move others. Moves without metadata changes are not reported as layout changes (they are not the author's edits); the morph still animates the visual movement, which makes the effect visible without listing it.

### 12.3 Large diagrams

Prototype data points: the 60-table ER sample with 57 changes and the 70-node flowchart with 64 changes stay interactive. Production adds: worker diffing and rendering over 300 lines, lazily rendering Before / After the first time they are shown (Merged first), virtualised change list over 500 rows, and lazy history counts.

### 12.4 Unsupported types and type changes

For types the core does not parse, the component shows the code panel only (line diff), with "Plain Mermaid" previews of both sides through the optional `mermaid` peer, as the viewer's fallback does. When the type changed between versions, the diff lists the type change, Merged is disabled and Before / After render their own types.

### 12.5 Metadata-only and unknown lines

Unknown `%%@` lines (`meta.unknown`) are compared as text and shown in the Metadata tab; a change in them is a diagram-wide change "unknown metadata".

## 13. Accessibility

- The canvas has `role="img"` and a generated label with counts; a visually hidden live region announces the selected change ("Node Load Balancer (L7): content changed, label Load Balancer → Load Balancer (L7)"), so the change list doubles as the text alternative of the picture.
- Every tool and filter is a real `<button>` with `aria-pressed`; tooltips mirror `aria-label`; the bars are `role="toolbar"` with roving focus (arrow keys) like the editor's tool dock.
- History rows are a listbox in History mode and rows with two toggle buttons in Compare mode; the disabled side has an explanation (`aria-describedby`).
- Focus is never trapped; Esc closes popovers; the help popup is a labelled dialog.
- Contrast: all diff tokens meet 3:1 against `--ds-surface` for graphics and 4.5:1 for text in both schemes (checked in tests with the existing contrast helper of the theme editor).
- `prefers-reduced-motion` turns off morph, panel slides and pen fade animations.

## 14. Security

Unchanged model: every source (both sides, every history version, adapter output) is untrusted and validated by the parsers and `sanitizeMeta`; the scene goes through the escaping serializer and the attribute allowlist; diff marks become `<tspan>` elements with fixed class tokens, never markup; no `innerHTML` anywhere (the prototype used `DOMParser` + `importNode` for speed; production uses the keyed patcher); links follow the link policy; size limits apply per version; the component runs under the documented CSP. Export of sources writes the original text, never the merged model (marks are stripped if anything model-derived is exported).

## 15. Integrations

- **Editor conflict dialog**: "Compare" opens an embedded `DiagramDiff` (Side by side, Mine vs Theirs) instead of two `<pre>` blocks.
- **Editor / studio history**: when a `DocumentAdapter` also implements `HistoryAdapter`, the editor gets a History panel (same module) and the studio shows a "History" action.
- **Markdown**: an optional fence ` ```mermaid-diff ` with two sources separated by a `%% ----- after -----` line becomes `<mmdx-diff>` through the rehype / markdown-it plugins, with a pre-rendered merged SVG.
- **React**: `createReactWrappers` gains `MmdxDiff` with typed `onDsSelect`, `onDsVersion`, …
- **CI**: an example GitHub Action / GitLab job in the docs that comments the merged PNG and the Markdown report on MRs touching `*.mmdx`.

## 16. Packaging and budgets

- Entry `mmdx/diff` (`src/diff.ts`), `sideEffects` updated, `exports` map entry, types in `dist/types/diff.d.ts`.
- Budget (size gate in `tools/size.mjs`): `diff (first view)` ≤ 60 kB gzip — static imports plus the first diagram kind's parser / renderer (prototype page today: ≈ 58 kB gzip including the `diff` package and all kinds). Lazy chunks: morph, code panel, history panel, export, pen.
- `mmdx/core` stays within 45 kB with the diff engine (≈ 6 kB) because kinds are already split; `renderDiffToSvg` lives in `pipeline.ts` (all kinds), like `renderToSvg`.

## 17. Testing

| Level | What |
|---|---|
| Unit (core) | diff engine per type (exists, extend), renames, `ignoreFacets`, transforms, Myers word / line diff vs `diff` package on fixtures, `mergeDiagrams` (exists for the prototype, move), `annotate` shapes, reports (snapshot), `unifiedDiff` round-trip through `git apply` in CI. |
| Golden SVG | `renderDiffToSvg` for every sample pair and view, light and dark theme, with and without filters (same harness as `tests/core/render/golden.test.ts`). |
| DOM (jsdom) | element attributes / properties / events, filter and view state, change selection, code-panel narrowing, history modes and the before ≠ after rule, export events. |
| Browser (Playwright) | the demo page: morph transitions end in the right state, reduced motion, pen strokes mirrored, panels resize, keyboard map, screenshots in light / dark. |
| Accessibility | axe on the demo, focus order, contrast of diff tokens. |
| Performance | diff + render time budgets for the many-changes samples (flowchart 70 nodes, ER 60 tables, sequence 60 messages). |
| Size | `pnpm size` gate for `mmdx/diff` and `mmdx/core`. |

The sample generator (`apps/studio-site/diff-samples/generate.ts`) stays as the fixture source: seeded edits through the editor's own ops, few / medium / many changes per type, with multi-version histories.

## 18. Delivery plan

| Phase | Scope | Exit criteria |
|---|---|---|
| 1. Core | export diff engine; `text.ts` (Myers); move `merge.ts`; `annotate.ts`; `renderDiff` / `renderDiffToSvg`; marks in measurers, serializer and patcher; reports | unit + golden tests green; core budget kept |
| 2. Element MVP | `<mmdx-diff>` with before / after inputs, four views, morph, filters, change list, zoom bar + help, light / dark tokens | DOM + Playwright tests; `mmdx/diff` budget |
| 3. Panels | shared `ui/panes.ts`; code panel with selection narrowing; history panel + `HistoryAdapter`; pen with shared strokes | prototype parity |
| 4. Export and themes | export menu and formats; legend; theme `diff` block; theme editor preview; dark-mode contrast pass | export tests; a11y contrast checks |
| 5. Integrations | editor conflict dialog; editor / studio history; markdown fence; React wrapper; CI recipe | docs and examples published |

## 19. Open questions

1. Default view: Merged (prototype default) or Side by side for first-time users? Proposal: Merged, remembered per user in `storage`.
2. Export entry point: a download button in the left panel, an overflow menu, or in the zoom bar group? (The zoom bar must stay visually unchanged; adding a separate button group next to it is acceptable.)
3. Should Layout off also hide arrows for auto-layout moves in plain Mermaid (§12.2)? Proposal: yes, arrows only for metadata moves.
4. Rename detection for ER entities and participants: threshold and UI for "matched by content" (the prototype showed it as a hint; the new change list has no inline details — tooltip?).
5. Versions without ids (pasted text): content hash as id (prototype) — acceptable for links?
6. Theme `diff` block: worth the validation and theme-editor work in phase 4, or tokens only?

## Appendix A. Prototype → production map

| Prototype | Production |
|---|---|
| `src/core/diff/index.ts`, `transform.ts` | same files, exported from `mmdx/core` |
| `apps/studio-site/diff/merge.ts` (`diff` package) | `src/core/diff/merge.ts` + `text.ts` (Myers, no dependency) |
| `diff/decorate.ts` (DOM tspan rewrite, `getBBox` runs) | marks handled in measurers / serializer / patcher; runs in `annotate.ts` |
| `diff/canvas.ts` `SharedView` (viewBox) | `dom/viewport.ts` `Viewport` (+ linking) |
| `diff/canvas.ts` highlights / moves | `core/diff/annotate.ts` (scene nodes) |
| `diff/morph.ts` | `dom/morph.ts` (on keyed DOM, reduced-motion aware) |
| `diff/ink.ts` | `dom/pen.ts` with a shared stroke store |
| `diff/textdiff.ts` | `core/diff/text.ts` `diffLines` + `hunks` |
| `diff/main.ts` panels / bars / help | `elements/diff/*` modules + shared `ui/panes.ts`, `ui/zoom-bar.ts` |
| `diff.html` page CSS (light only) | `ui/styles/diff.ts` with `--ds-*` and `--ds-diff-*` tokens (light + dark) |
| `diff-samples/*` + `generate.ts` | test fixtures and demo data |

## Appendix B. i18n keys (new)

`diff.view.before`, `diff.view.merged`, `diff.view.after`, `diff.view.side`, `diff.filter.added`, `diff.filter.removed`, `diff.filter.content`, `diff.filter.layout`, `diff.filter.style`, `diff.filter.dim`, `diff.filter.tip` (`{label} · {n} — click to {action}`), `diff.tool.history`, `diff.tool.code`, `diff.tool.changes`, `diff.panel.history`, `diff.panel.compare`, `diff.panel.code`, `diff.panel.meta`, `diff.panel.changes`, `diff.panel.linesOf`, `diff.panel.showAll`, `diff.history.current`, `diff.history.initial`, `diff.history.before`, `diff.history.after`, `diff.history.sameVersion`, `diff.empty.noChanges`, `diff.empty.noLines`, `diff.banner.typeChanged`, `diff.export.*`, `diff.help.*`, `diff.label` (`Diagram diff: {added} added, {removed} removed, {changed} changed`).
