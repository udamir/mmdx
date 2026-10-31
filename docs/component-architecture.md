# Component architecture: one viewer kernel, building blocks, products as extensions

Design document · status: proposed · scope: `src/ui`, `src/dom`, `src/editor`, `src/elements` (no change to `src/core` beyond one signature)

## 1. Summary

Today the viewer, the editor and the diff are three separate implementations that happen to look alike. Each builds its own canvas, chrome, panels and menus; shared code is limited to CSS strings and a few helpers. As a result the diff has no theme selector or light / dark toggle (they live inside an editor module bound to `EditorCore`), the zoom bar, help popup, pen options, export menu, code view and tool bar each exist two or three times, and a fix in one component does not reach the others.

This proposal restructures the components into layers:

1. **Blocks** (`src/ui/blocks`): small, generic, host-agnostic UI pieces — zoom bar, tool dock, panel and panel stack, menus, theme menu, scheme toggle, export menu, code view, version list, change list… They take plain data, signals and callbacks, and know nothing about diagrams or editors.
2. **Canvas** (`src/dom/canvas.ts`): one diagram canvas — the SVG layers, viewport, keyed patching, hit testing, ink layer, linking and morphing — used by every component, including the theme editor's previews.
3. **View kernel** (`src/view`): `ViewCore`, the shared base of every diagram component — loading, kinds, themes and scheme, rendering (with the worker), the shell with named slots, the module system, actions, events, shortcuts, popovers. Every feature is a **module** installed into the kernel: zoom bar, view params (theme + light / dark), pen, export, layers, code view, history, fullscreen…
4. **Products** as extensions of the kernel:
   - `DiagramViewer` = `ViewCore` + the read-only module set (presentation chrome).
   - `DiagramEditor`: `EditorCore extends ViewCore` + the document store, selection, gestures and the editing modules. The editor's View mode *is* the viewer, by construction.
   - `DiagramDiff`: `DiffCore extends ViewCore` + version pair / history, multi-canvas (morph, side by side) and the diff modules.

A feature written once as a module appears everywhere it is installed: the theme selector arrives in the diff and the viewer simply by installing the `viewParams` module; History is one module installed in the viewer and the editor.

Public elements, classes, attributes, properties and events stay the same (§10).

## 2. Goals and non-goals

### Goals

- The editor is an extension of the viewer, and the diff is an extension of the viewer: same kernel, same canvas, same chrome, same keyboard and theming behaviour.
- Every UI piece exists once, as a block with a documented API, a story and a DOM test; products compose blocks.
- Features are modules with one contract (`ViewModule`), installable in any product that provides what they need.
- No behaviour change for users except the gaps closed by reuse: theme menu and light / dark toggle in the diff and (opt-in) the viewer, highlighted code in the diff, one pen everywhere.
- Bundle budgets kept: the viewer stays ≤ 46 kB gzip for the first diagram; modules a page does not use are not loaded.

### Non-goals

- No framework (keep `h()`, signals and shadow DOM).
- No change to the `.mmdx` format, the core renderers or the public events.
- No visual redesign: blocks reproduce today's looks (the editor's floating cards, tool dock and zoom bar are the reference).

## 3. Today

### 3.1 Inventory

| Piece | Viewer | Editor | Diff |
|---|---|---|---|
| Canvas (SVG layers + viewport + patch) | `viewer.ts` builds its own | `editor.ts` builds its own | `diff.ts` builds its own (+ morph, linking) |
| Tool bar | — (controls in the zoom bar) | `chrome/tool-dock.ts` | own `vbar` (viewer style) |
| Zoom bar + help | own bar in `viewer.ts` | `chrome/zoom-bar.ts` (help from registry) | copied markup + copied help builder |
| Theme menu, light / dark toggle | attributes only | `chrome/view-params.ts` (bound to `EditorCore`) | **missing** |
| Pen | `dom/pen.ts` + `viewer-popups.penOptions` | `dom/pen.ts` + own options in the tool dock | `diff/ink.ts` (shared strokes) + viewer `penOptions` |
| Export menu | own (`openExport`) | `chrome/document.ts` + view params | own (`openExport`) |
| Side panels | — | `panels/code-panel.ts`, `panels/right-panels.ts` (stack + splitter) | own left stack (splitter copied), own right panel |
| Read-only code | `viewer-code.ts` (highlighted) | `ui/code-editor.ts` | plain table, no highlighting |
| Theme resolution (forced, own, dark counterpart, fetch) | `viewer.ts` | `editor/core.ts` + view params | copied into `diff.ts` |
| Module system | — | `EditorModule` + `EditorCore` actions / events | ad hoc methods |
| Shortcuts | ad hoc `keydown` | `ShortcutRegistry` | `ShortcutRegistry` (own list) |

### 3.2 Consequences

- Features drift: the diff lacks the theme menu and the light / dark toggle; the viewer has no help popup; three pen option UIs differ.
- Fixes do not propagate (e.g. focus handling of re-rendered bars was fixed in the diff only).
- The History view had to embed a separate `<mmdx-diff>` element by tag name, and a lazy import of the diff from the viewer split the shared diagram-kind code into extra chunks (+4 kB gzip on every viewer page) because the diff imports all kinds statically (`pipeline.ts` `ALL_KINDS`) while the viewer loads them on demand.

## 4. Target architecture

```
L0  core            pure: parse, render, themes, diff engine                         (unchanged)
L1  dom             patch, viewport, measure, export, morph, worker, StrokeStore     (primitives)
L2  ui/blocks       generic UI blocks (no diagram, no core knowledge)                 ← new home of all chrome
L3  dom/canvas      DiagramCanvas: layers + viewport + patch + hit test + ink + link + morph
L4  view            ViewCore (kernel) + Shell (slots) + ViewModule system + standard view modules
L5  products        Viewer · Editor (EditorCore extends ViewCore) · Diff (DiffCore extends ViewCore)
                    Theme editor (canvases + blocks) · Studio (shell around the editor)
```

Dependency rule: a layer imports only from layers below it. Blocks never import from `view`, `editor` or `elements`; modules never reach into another module, only through actions and signals of the kernel.

### 4.1 Class and component tree

```
ViewCore                                   src/view/core.ts
├─ DiagramViewer   (ViewCore + VIEWER_MODULES)                     <mmdx-viewer>
├─ EditorCore extends ViewCore              src/editor/core.ts
│  └─ DiagramEditor (EditorCore + EDITOR_MODULES)                  <mmdx-editor>
└─ DiffCore extends ViewCore                src/diff/core.ts
   └─ DiagramDiff  (DiffCore + DIFF_MODULES)                       <mmdx-diff>

DiagramCanvas                              src/dom/canvas.ts   one per visible picture
├─ used by ViewCore (main canvas), DiffCore (morph canvas / two linked canvases)
└─ used by the theme editor previews (static canvases, no kernel)

Blocks (src/ui/blocks) — used by modules and by the theme editor / studio directly
```

## 5. Blocks (L2)

### 5.1 Contract

- A block is a function or a small class: `createX(props): XHandle` returning `{ el, update(props?), destroy() }`. Inputs are plain values, `Signal`s and callbacks; it never imports kernel, editor or diagram types (only `core/types` value types where a block shows them, e.g. a version row).
- Strings come in through a `t` function (`I18n['t']`); English keys live with the block (`ui/messages/blocks.ts`).
- CSS is a fragment exported by the block (`X_CSS`); the kernel adopts the CSS of the blocks its modules use (`ViewModule.css` lists them), so a page ships only what it shows.
- Keyboard and a11y are part of the block: roving focus in toolbars, `aria-pressed`, tooltips mirroring labels, focus kept on re-render (the `data-f` pattern of the diff becomes `keepFocus()` in `ui/blocks/focus.ts`).
- Every block has a Storybook story under **Blocks/** with mock props, and a jsdom test.

### 5.2 Catalogue

| Block | Responsibility | Main props | Replaces |
|---|---|---|---|
| `IconButton`, `ToggleButton` | Icon button with tooltip, pressed state, shortcut hint | `icon, label, keys?, pressed?, disabled?, onClick` | ad hoc `btn()` in tool dock, viewer bar, diff |
| `Toolbar` | Floating bar (vertical / horizontal), separators, roving focus, tooltip side | `orientation, items[], tooltip: 'side'\|'above'` | `.view-tools`, viewer `.bar`, diff `.vbar` / `.dbar` |
| `ToolDock` | The editor's left dock: tool group + panel toggles + undo group, options flyout slot | `groups[], flyout?` | `chrome/tool-dock.ts` DOM, diff `vbar` |
| `Segmented` | Exclusive buttons (views, edit / view, history / compare tabs) with a compact `<select>` form | `options[], value, onChange, compactBelow?` | diff view buttons + select, studio mode switch |
| `Menu`, `MenuButton` | Menus with sections, checks, separators; opener wiring through `PopoverManager` | `sections[], anchor` | view-params menus, export menus, ⋯ menus |
| `ZoomBar` | − % + Fit, `?`, fullscreen; percentage bound to a view signal | `view: Signal<ViewState>, onZoom, onFit, help?, fullscreen?` | `chrome/zoom-bar.ts` DOM, viewer zoom controls, diff copy |
| `HelpPopup` | Help dialog generated from a `ShortcutRegistry` (+ hint rows) | `registry, title, editing` | editor help, diff help |
| `SchemeToggle` | Light / dark chrome toggle | `scheme: Signal, onChange` | view-params `vp-mode` |
| `ThemeMenu` | Diagram themes grouped light / dark, current ticked, "edit themes" entry | `themes: ThemeInfo[], current, onPick, onEdit?` | view-params theme menu |
| `ExportMenu` | Export entries from a list of formats with labels and runners | `entries: { id, label, run }[]` | three export menus |
| `PenOptions` | Colours, sizes, auto erase, erase all | `pen: PenSettings` | editor flyout, viewer popup |
| `SidePanel` | Floating card: header (title or `Tabs`), close, body, resize grip | `side, title \| tabs, onClose, width: Signal` | editor code panel shell, right panel cards, diff panels |
| `PanelStack` | Column of `SidePanel`s with splitters, remembered sizes, empty-collapse | `side, panels[], storageKey` | `right-panels.ts` stack, diff left stack |
| `Tabs` | Tab list with roving focus | `tabs[], value, onChange` | code / metadata, history / compare |
| `CodeView` | Read-only highlighted lines: plain listing, unified diff with numbers / hunks / gaps, line narrowing, copy | `lines \| ops, language: 'mermaid'\|'meta', mode: 'plain'\|'diff', select?` | `viewer-code.ts`, diff code table |
| `CodeEditor` | Editable code (exists) | as today | — |
| `VersionList` | Version rows (message, id, tags, author, age, counts) with optional Before / After picks | `versions, counts, mode, picked, onRow, onPick, onMore` | diff `historyRows` |
| `ChangeList` | Change rows with mark icons, kind, label; selection | `changes, selected, onSelect` | diff `changeList` |
| `LayerList` | Layers rows (show / hide, lock, rename, counts) | `layers, onToggle…` | `panels/layers.ts` DOM |
| `StyleToolbar`, `PageToolbar`, `ItemPreview`, `ShapePreview` | (exist; already generic) | as today | — |
| `Banner`, `ErrorCard`, `EmptyState`, `Toast`, `Dialog`, `Popover` | Messages and overlays (`Toast`, `Dialog`, `Popover` exist) | | viewer error panel, diff banner / msg |

## 6. Canvas (L3): `DiagramCanvas`

One class for every picture of a diagram.

```ts
interface CanvasOptions {
  wheel?: WheelMode; panOnDrag?: boolean; minK?: number; maxK?: number; pad?: number;
  insets?: () => Insets; interactive?: boolean; reducedMotion?: () => boolean;
}
class DiagramCanvas {
  readonly el: HTMLElement;          // positioned container
  readonly svg: SVGSVGElement;       // defs + vp > [page, body, runs, overlay, ink]
  readonly view: Signal<ViewState>;  // k, tx, ty (drives ZoomBar, badges' constant size, pen)
  readonly viewport: Viewport;
  show(r: Rendered, layers?: { body?: SceneNode[]; runs?: SceneNode[]; overlay?: SceneNode[] }): void;  // keyed patch
  setOverlay(nodes: SceneNode[]): void;          // painters' output (editor handles, diff highlights)
  itemAt(target: Element): { key: string; kind: ItemKind; id: string } | null;   // data-kind / data-id / data-key
  fit(bounds?: Rect): void; focus(rect: Rect): void; zoomBy(f: number): void;
  link(other: DiagramCanvas): () => void;       // shared pan / zoom (side by side)
  attachInk(store: StrokeStore): () => void;    // one stroke set, every canvas
  morph(states: MorphState[], index: number): Morph;   // animated states (diff)
  destroy(): void;
}
```

- `StrokeStore` (in `dom/pen.ts`) holds strokes in diagram coordinates; `MagicPen` becomes "a store + input on one canvas". The viewer and editor use one canvas, the diff two or one morphing canvas; strokes appear in all of them (the diff's `ink.ts` disappears).
- The theme editor's previews become static `DiagramCanvas`es (`interactive: false`) instead of hand-patched SVGs.

## 7. View kernel (L4): `ViewCore`

### 7.1 Responsibilities

Everything that is not editing and not diffing, extracted from `DiagramViewer`, `EditorCore` / `DiagramEditor` and `DiagramDiff`:

- **Services**: `ctx` (instance context), `i18n`, `storage`, `dialogs`, `popovers`, `toaster`, `shortcuts` (with key routing scoped to the shadow root), `emit` (bubbling, composed `mmdx-*` events).
- **State (signals)**: `source`, `rendered` (computed through the pipeline, worker over 300 lines), `scheme` (`ui`), `themeId` (forced → own → dark counterpart, missing themes fetched through `themeSource`), `display` (labels, hover highlight, visible layers), `features`, `panels` (open panels by name), `tool` (pan / pen; the editor adds its tools).
- **Kinds**: loaded on demand (`elements/kinds.ts`) for every product; the core gains `renderDiff(…, kinds)` so the diff uses the same loaded kinds instead of `ALL_KINDS` (this also removes the chunk fragmentation of §3.2).
- **Shell**: the element's shadow root with named **slots** that modules fill:

```
┌ top-left: titles, badges ─────────────────────────────── top-right: view params ┐
│ left-stack (PanelStack)  left-dock (ToolDock)   canvas(es)     right-stack (PanelStack) │
│                                                                                 │
│                      bottom-center: context bar (diff bar, page bar)            │
└───────────────────────────────────────────────────────────── bottom-right: ZoomBar ┘
  overlay: views that cover the component (History, code view, Plain Mermaid compare)
```

  The canvas area is inset by the open stacks (one inset function for every product); slots that nothing fills take no room.
- **Module system**: one contract for every product.

```ts
interface ViewModule<C extends ViewCore = ViewCore> {
  id: string;
  /** CSS of the module and of the blocks it uses. */
  css?: readonly string[];
  /** Which products / features it applies to. */
  enabled?(core: C): boolean;
  install(core: C): () => void;
}
```

  Modules talk through `core.provide(name, fn)` / `core.run(name, …)` / `core.has(name)` (the editor's existing action registry, generalised and typed per product via declaration merging), `core.on(event)` / `core.fire(event)`, and signals.

### 7.2 Standard view modules (installed by any product that wants them)

| Module | Slot / blocks | Viewer | Editor | Diff |
|---|---|---|---|---|
| `zoomBar` | bottom-right · `ZoomBar`, `HelpPopup` | ✓ (compact preset) | ✓ | ✓ |
| `viewParams` | top-right · `SchemeToggle`, `ThemeMenu`, `ExportMenu` button | opt-in (`controls="theme"`) | ✓ | ✓ (**theme selector**) |
| `pan` | left-dock · `IconButton`; Space-drag, wheel | implicit | ✓ | ✓ |
| `pen` | left-dock + flyout · `PenOptions`, `StrokeStore` | ✓ | ✓ | ✓ (all canvases) |
| `export` | `ExportMenu`; formats contributed by other modules (`core.provide('exportFormats')`) | ✓ | ✓ | ✓ (+ patch, reports) |
| `fullscreen` | ZoomBar button | ✓ | ✓ | ✓ |
| `viewSettings` | layers, labels, hover · `LayerList`, `Menu` | ✓ | View mode | ✓ |
| `codeView` | overlay or left-stack · `CodeView` | ✓ | View mode | — (diff has `codeDiff`) |
| `history` | left-dock button + overlay · runs a `DiffCore` in the overlay slot with the host's ctx, theme and scheme | ✓ | ✓ (+ Restore) | — (it is the diff) |
| `links`, `hoverHighlight`, `a11yLabel` | canvas | ✓ | View mode | ✓ |

### 7.3 Products

**Viewer** — `ViewCore` + `zoomBar` (compact: zoom + control buttons in one bar, as today), `pen`, `viewSettings`, `codeView`, `export`, `fullscreen`, `history`, `links`, `hoverHighlight`; presentation options stay on the viewer (`fit`, `lazy`, SSR adoption, `interactive`). `controls` maps to modules.

**Editor** — `EditorCore extends ViewCore` adds `DocStore`, selection, gestures and overlay painters, edit / view mode, the editing tools. Its modules are today's modules re-based on blocks: canvas (select, structure, inline edit, paint, empty), connect, sequence, shapes, er-table, panels (`codePanel` in left-stack, `properties` and `layers` in right-stack), toolbars, document commands. View mode switches the module set's visibility to the viewer's — the editor in View mode and `<mmdx-viewer>` behave the same because they run the same modules.

**Diff** — `DiffCore extends ViewCore` adds the version source (pair or `HistoryAdapter`), `renderDiff` with filters, the change selection and multi-canvas staging (one morphing canvas, or two linked canvases). Modules: `diffBar` (bottom-center · `Segmented` views, filter toggles, dim, changes toggle), `changeList` (right-stack · `ChangeList`), `codeDiff` (left-stack · `CodeView` in diff mode), `versions` (left-stack · `VersionList`, compare / history), `morph`, `diffExport` (formats for `export`), `hostActions` (Restore / Back when embedded). It also installs the standard `zoomBar`, `viewParams`, `pen`, `pan`, `fullscreen`. The theme picked in the diff applies to the comparison only (open question 1).

**History in viewer and editor** — the `history` module opens a `DiffCore` in the host's overlay slot, sharing the host's `ctx`, theme, scheme and storage; no second custom element, no tag lookup. Its code (the diff modules and `core/diff`) loads on first use; with kinds loaded through `loadKind` the chunk graph stays stable (§3.2).

**Theme editor** — previews become `DiagramCanvas`es; its toolbars and menus use blocks. **Studio** — the top bar uses `Toolbar`, `Segmented`, `Menu`; it keeps feeding the editor its history.

## 8. Target file tree

```
src/
  core/                      (unchanged; renderDiff takes kinds)
  dom/
    canvas.ts                DiagramCanvas
    pen.ts                   StrokeStore + MagicPen input
    morph.ts, patch.ts, viewport.ts, measure.ts, export.ts, worker-*.ts
  ui/
    blocks/                  icon-button, toolbar, tool-dock, segmented, menu, zoom-bar, help-popup, scheme-toggle,
                             theme-menu, export-menu, pen-options, side-panel, panel-stack, tabs, code-view,
                             version-list, change-list, layer-list, banner, error-card, empty-state, focus
    code-editor.ts, style-toolbar.ts, page-toolbar.ts, item-preview.ts, shape-preview.ts, popover.ts, dialog.ts,
    signal.ts, shortcuts.ts, i18n.ts, h.ts, icons.ts, logo.ts
    messages/                blocks.ts, view.ts, editor.ts, diff.ts, …
    styles/                  tokens + per-product layout only
  view/
    core.ts                  ViewCore
    shell.ts                 slots, insets
    module.ts                ViewModule
    modules/                 zoom-bar, view-params, pan, pen, export, fullscreen, view-settings, code-view,
                             history, links, hover-highlight, a11y
  editor/
    core.ts                  EditorCore extends ViewCore
    store.ts
    modules/                 canvas/*, connect, sequence, shapes, er-table, panels/*, toolbars, document
  diff/
    core.ts                  DiffCore extends ViewCore
    modules/                 diff-bar, change-list, code-diff, versions, morph, diff-export, host-actions
  elements/
    viewer.ts, editor.ts, diff.ts, theme-editor.ts, studio.ts   (thin: element ↔ options ↔ product class)
```

## 9. Bundle strategy

- `mmdx/viewer` = kernel + canvas + the viewer's eager modules (`zoomBar`, `links`, `hoverHighlight`, `a11y`); `pen`, `viewSettings`, `codeView`, `export`, `history` load on first use, as today. Budget 46 kB gzip (first diagram).
- `mmdx/editor` = kernel + canvas + editing modules; budget 165 kB.
- `mmdx/diff` = kernel + canvas + diff modules + `core/diff`; kinds on demand. Expected to drop well below the current 86.5 kB (the kinds move out of the first view); target 60 kB (the diff design's budget).
- The size gate adds "viewer + History opened" and "editor + History opened" rows so lazy features are measured too.

## 10. Public API compatibility

- Unchanged: element names, attributes, properties, methods and `mmdx-*` events of the viewer, editor, theme editor, studio and diff; the imperative classes `DiagramViewer`, `DiagramEditor`, `DiagramDiff`; entry points.
- `EditorModule` stays as an alias of `ViewModule<EditorCore>`; `DEFAULT_MODULES` keeps its meaning. New: `ViewCore`, `ViewModule`, `VIEWER_MODULES`, `DIFF_MODULES`, `DiagramCanvas`, and the blocks under `mmdx/ui` (a new entry, optional for hosts that build their own chrome).
- `history-view.ts` and the tag-based embedding of `<mmdx-diff>` go away; `editor.history` / `viewer.history` keep working, and History no longer needs the page to load `mmdx/diff`.
- New viewer control `theme` (the view params: light / dark and theme menu).

## 11. Migration plan

Each phase keeps the test suite, Storybook and size gate green and ships nothing half-done; behaviour changes are listed explicitly.

| Phase | Work | Exit criteria |
|---|---|---|
| 1. Blocks | Extract `IconButton`, `Toolbar`, `ToolDock`, `Segmented`, `Menu`, `ZoomBar`, `HelpPopup`, `SchemeToggle`, `ThemeMenu`, `ExportMenu`, `PenOptions`, `SidePanel`, `PanelStack`, `Tabs`, `CodeView`, `VersionList`, `ChangeList` with stories and tests. Rebuild the editor's chrome modules and the diff's chrome on them (thin wrappers); the viewer's bar on `Toolbar` + `ZoomBar`. | Pixel-equivalent Storybook stories for the editor; the diff gains the theme menu, the light / dark toggle and highlighted code; three pen-option UIs become one. |
| 2. Canvas | `DiagramCanvas` and `StrokeStore`; viewer, editor, diff and theme editor previews draw through it; `diff/ink.ts` removed. | Pen strokes shared across diff canvases via the store; editor overlays unchanged. |
| 3. Kernel | `ViewCore`, shell slots and `ViewModule` extracted from `EditorCore` and `DiagramViewer`; the viewer becomes `ViewCore` + modules; `EditorCore extends ViewCore`; theme / scheme / kinds / worker logic exists once. | Editor View mode and `<mmdx-viewer>` run the same modules; viewer budget kept. |
| 4. Diff | `DiffCore extends ViewCore` with the diff modules; `renderDiff(…, kinds)`; the `history` module runs a `DiffCore` in the overlay slot; `history-view.ts` removed. | History needs no `mmdx/diff` import; diff budget ≤ 60 kB; viewer + History measured. |
| 5. Clean-up | Theme editor and studio on blocks; dead CSS and helpers removed; Storybook reorganised: **Blocks/**, **Canvas**, **Products/** (Viewer, Editor, Diff, Theme editor, Studio) with the module matrix as controls; docs (README architecture section, `mmdx/ui` reference). | No duplicated chrome left (checked by a lint rule: products may not create toolbars / menus / panels except through blocks). |

Estimated size: phases 1 and 2 are mechanical (mostly moves with adapters); phase 3 is the largest (the kernel split of `EditorCore`, ~700 lines, and `DiagramViewer`, ~900 lines); phase 4 shrinks `elements/diff.ts` (1 740 lines) into a core and modules.

## 12. Testing

- **Blocks**: jsdom tests per block (rendering from props, callbacks, keyboard, focus kept on update, a11y attributes) and a Storybook story each.
- **Kernel**: module install / uninstall leaves no listeners; slots and insets; theme resolution matrix (forced / own / dark counterpart / missing); scheme switching; shortcut scoping.
- **Products**: the existing viewer, editor, diff, studio tests keep passing unchanged (they are the regression suite); a module-matrix test installs each standard module in each product.
- **Visual**: Storybook stories per block and product, light and dark; a Playwright pass over the products' stories comparing screenshots before / after each phase.
- **Size**: the gate with the new rows.

## 13. Risks

- **Kernel split of the editor**: `EditorCore` mixes view and edit concerns; the split must keep every module's access paths. Mitigation: phase 3 starts by moving members with re-exports, then narrows types.
- **Viewer size**: the kernel must not pull editor-only code. Mitigation: the kernel holds only what the viewer needs today; size rows per phase.
- **Look drift**: blocks must reproduce the editor's chrome exactly. Mitigation: blocks are extracted from the editor's DOM and CSS, not re-designed; screenshot comparison.
- **Two diff entry points** (embedded `DiffCore` in History vs `<mmdx-diff>`): both are `DiffCore`; the element is a thin shell.

## 14. Open questions

1. A theme picked in the diff: only for the comparison (proposal), or written into the host's view (the editor's theme menu changes the diagram's `canvas.theme`)?
2. Should `<mmdx-viewer>` show the view params by default (theme menu, light / dark), or only with `controls="theme"` (proposal: opt-in, docs pages usually follow the site)?
3. History as an overlay over the host (proposal, as today) or as a mode of the host's own canvas (the diff's states drawn into the editor's canvas)? The overlay keeps the editor's state untouched; a mode would avoid a second canvas.
4. Publish the blocks as `mmdx/ui` now, or keep them internal until their APIs settle (proposal: internal in 0.3, public in 0.4)?
