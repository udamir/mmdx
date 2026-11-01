# Component architecture: one viewer kernel, building blocks, products as scenes and modules

Design document · status: implemented through phase 4d, phase 5 in part (§12.1); review decisions in §15, every review question and answer in §16 · scope: `src/ui`, `src/dom`, `src/editor`, `src/elements`, `src/view` (new), `src/diff` (new), and three changes in `src/core` (§9)

## 1. Summary

Today the viewer, the editor and the diff are three separate implementations that happen to look alike. Each builds its own canvas, chrome, panels and menus; shared code is limited to CSS strings and a few helpers (`ui/zoom-bar.ts`, `ui/panes.ts`). As a result the diff has no theme selector or light / dark toggle (they live inside an editor module bound to `EditorCore`), the zoom bar, help popup, pen options, export menu, code view and tool bar each exist two or three times, and a fix in one component does not reach the others.

This proposal restructures the components into layers:

1. **Blocks** (`src/ui/blocks`): small, generic, host-agnostic UI pieces — zoom bar, tool dock, panel and panel stack, menus, theme menu, scheme toggle, export menu, code view, version list, change list… They take plain data, signals and callbacks, and know nothing about diagrams or editors.
2. **Canvas** (`src/dom/canvas.ts`): one diagram canvas — the SVG layers, viewport (or a static fit), keyed patching, hit testing, ink layer, linking and morphing — used by every component, including the theme editor's live preview.
3. **View kernel** (`src/view`): `ViewCore`, the shared base of every diagram component — services, the theme, the chrome scheme, the shell with named slots, the module host, actions, events, shortcuts, popovers — and the canvases. What the canvas shows comes from a pluggable **scene source** (§7.3): the viewer's text scene, the editor's store scene, or a diff scene.
4. **Products** as compositions of the kernel, a scene source and a module set:
   - `DiagramViewer` = `ViewCore` + `TextScene` + the viewer modules.
   - `DiagramEditor`: `EditorCore extends ViewCore` + `StoreScene` (the document store, selection, gestures) + the editing modules. The editor's View mode runs the same modules as the viewer.
   - `DiagramDiff` = `ViewCore` + a permanent `DiffScene` (a diff session) + the diff modules.

A feature written once as a module appears everywhere it is installed. The theme is kernel state and is not part of the document (§7.5), so every canvas, stage and panel of a component shares it. **History** is a **stage** of the viewer and the editor, orthogonal to Edit / View: opening it pushes a `DiffScene` onto the host's own canvas and shows the History, Code and Changes panels in the host's own panel stacks (§8).

Public elements and attributes stay; the next release is a breaking one (§11): `canvas.theme` leaves the `.mmdx` format, `EditorModule` takes a new shape, and History gets its own events and API.

## 2. Goals and non-goals

### Goals

- The editor and the diff are compositions of the viewer kernel: same canvas, same chrome, same keyboard and theming behaviour.
- Every UI piece exists once, as a block with a documented API, a story and a DOM test; products compose blocks.
- Features are modules with one contract (`ViewModule`), installable in any product that provides what they need, and suspendable by the kernel without their cooperation.
- One look for the chrome everywhere (the editor's), with a global `compact` preset for small hosts (§7.6).
- Bundle budgets kept or explicitly re-set after a measured spike (§10).

### Non-goals

- No framework (keep `h()`, signals and shadow DOM).
- No visual redesign beyond the decisions of §7.6 and §8: blocks reproduce today's editor chrome (floating cards, tool dock, zoom bar, view params).
- No change to the core renderers.

### Behaviour changes (intended)

- The theme is no longer stored in diagrams (`canvas.theme` removed, §7.5); hosts set it with attributes, users pick it in the theme menu.
- The theme and the light / dark chrome scheme are independent (§7.5).
- The diff gains the theme menu, the light / dark toggle, highlighted code, view settings (layers, connector labels, hover highlight) and clickable links (click selects a change, ⌘ / Ctrl-click opens the link).
- The editor's View mode gains a read-only code panel; the viewer gains the `?` help popup.
- The viewer adopts the editor's chrome (tool dock, zoom bar, view params), with the `compact` preset on small hosts.
- History is in place (no overlay `<mmdx-diff>`), lets the user select, inspect and copy items of old versions, and emits `mmdx-history-*` events.

## 3. Today

### 3.1 Inventory

| Piece | Viewer | Editor | Diff |
|---|---|---|---|
| Canvas (SVG layers + viewport + patch) | `viewer.ts` builds its own; non-interactive viewers drop the viewport and fit through the `viewBox` | `editor.ts` builds its own | `diff.ts` builds its own (+ morph, linking) |
| Rendering | async from text, worker over 300 lines, kinds on demand, SSR adoption, Mermaid fallback | sync from `DocStore`, every kind static (gestures preview through `draw()`) | `renderDiff`, sync, three renders, every kind static |
| Tool bar | — (controls in the zoom bar) | `chrome/tool-dock.ts` | own `vbar` (viewer style) |
| Zoom bar + help | own bar in `viewer.ts`, no help | `chrome/zoom-bar.ts` + `ui/zoom-bar.ts` | `ui/zoom-bar.ts` CSS + help builder |
| Theme menu, light / dark toggle | attributes only | `chrome/view-params.ts` (bound to `EditorCore`) | **missing** |
| Theme rule | `theme` forced, else `canvas.theme`; dark counterpart only with `theme-dark` | always the counterpart of `canvas.theme` for the chrome scheme; a pick writes `canvas.theme` and flips the chrome | the newer version's `canvas.theme`; counterpart only with `theme-dark` |
| Pen | `dom/pen.ts` (own SVG over the stage) + `viewer-popups.penOptions` | `dom/pen.ts` + own options in the tool dock; strokes cleared on mode switch | `diff/ink.ts` (strokes inside each canvas) + viewer `penOptions` |
| Export menu | own (`openExport`) | `chrome/view-params.ts` + `chrome/document.ts` | own (`openExport`) |
| Side panels | — | `panels/code-panel.ts`, `panels/right-panels.ts` (stack + splitter, `ui/panes.ts`) | own left stack, own right panel (`ui/panes.ts`) |
| Read-only code | `viewer-code.ts` (highlighted, over the canvas) | `ui/code-editor.ts` (Edit mode only) | plain table, no highlighting |
| Module system | — | `EditorModule` + `EditorCore` actions / events | ad hoc methods |
| Shortcuts | ad hoc `keydown` (+ − 0 arrows p) | `ShortcutRegistry` (`editOnly` scoping) | `ShortcutRegistry` (own list) |
| History | `history-view.ts` covers the viewer with `<mmdx-diff>` (grows the host to 560 px) | same, from the tool dock | — |

### 3.2 Consequences

- Features drift: the diff lacks the theme menu and the light / dark toggle; the viewer has no help popup; three pen option UIs differ; three theme rules disagree.
- Fixes do not propagate (e.g. focus handling of re-rendered bars was fixed in the diff only).
- The History view embeds a separate `<mmdx-diff>` by tag name, so the page must load `mmdx/diff`, and a lazy import of the diff from the viewer split the shared diagram-kind code into extra chunks (+4 kB gzip on every viewer page) because the diff imports all kinds statically while the viewer loads them on demand.

### 3.3 Budgets today

Measured with `tools/size.mjs` at `713c820`:

| Entry | Size (gzip) | Budget | Headroom |
|---|---|---|---|
| viewer (first flowchart) | 45.3 kB | 46 kB | 0.7 kB |
| editor | 162.8 kB | 165 kB | 2.2 kB |
| diff | 86.5 kB | 90 kB | 3.5 kB |
| core | 52.8 kB | 55 kB | 2.2 kB |

The viewer imports none of signals, `ShortcutRegistry`, `Dialogs`, panes or the zoom bar / help today; the kernel cannot simply add them (§10).

## 4. Target architecture

```
L0  core            pure: parse, render, themes, diff engine, clipboard ops
L1  dom             patch, viewport, measure, export, morph, worker, StrokeStore     (primitives)
L2  ui/blocks       generic UI blocks (no diagram, no core knowledge)                 ← new home of all chrome
L3  dom/canvas      DiagramCanvas: layers + viewport | static fit + patch + hit test + ink + link + morph
L4  view            ViewCore (kernel) + Shell (slots) + module host + scene sources + standard modules
L5  products        Viewer · Editor (EditorCore extends ViewCore) · Diff
                    Theme editor (canvas + blocks) · Studio (shell around the editor)
```

Dependency rule: a layer imports only from layers below it. Blocks never import from `view`, `editor` or `elements`; modules never reach into another module, only through actions, events and signals of the kernel.

### 4.1 Class and component tree

```
ViewCore                                     src/view/core.ts      services and state; puts together the parts below
├─ Shell                                      src/view/shell.ts     root, slots, adopted CSS, insets, compact
├─ SceneStack                                 src/view/scene.ts     canvas area, main + extra canvases, the scene stack
├─ ModuleHost, Scope                          src/view/host.ts      install / suspend / resume / uninstall; events and actions (bus.ts)
├─ ThemeState, schemeState, themeLoader       src/view/theme.ts     theme resolution, chrome scheme, theme loading
├─ scene: SceneSource                         src/view/scene.ts     what the main canvas shows (a stack: History pushes)
│  ├─ TextScene      (viewer)                 src/view/scenes/text.ts
│  ├─ StoreScene     (editor)                 src/editor/scene.ts
│  └─ DiffScene      (diff, History)          src/diff/scene.ts     owns a DiffSession
├─ DiagramViewer   = ViewCore + TextScene + VIEWER_MODULES                     <mmdx-viewer>
├─ EditorCore extends ViewCore                src/editor/core.ts    store, selection, gestures, painters (API compatibility)
│  └─ DiagramEditor = EditorCore + StoreScene + EDITOR_MODULES                 <mmdx-editor>
└─ DiagramDiff     = ViewCore + DiffScene (pinned) + diffModules()             <mmdx-diff>

DiagramCanvas                                src/dom/canvas.ts     one per visible picture
├─ owned by ViewCore (main canvas; a second linked canvas for side by side)
└─ used by the theme editor's live preview (interactive, draft theme, no kernel)

Blocks (src/ui/blocks) — used by modules and by the theme editor / studio directly
```

Composition rather than `DiffCore extends ViewCore`: the three products render in three different ways that must all stay (§3.1), and the diff has no single source. A scene source isolates exactly that difference, and History becomes "push a `DiffScene`, pop it on Back". `EditorCore extends ViewCore` stays so that `EditorCore`'s public members keep their place.

## 5. Blocks (L2)

### 5.1 Contract

- A block is a function or a small class: `createX(props): XHandle` returning `{ el, update(props?), destroy() }`. Inputs are plain values, `Signal`s and callbacks. Signals drive state that changes often (zoom percentage, pressed tool); `update()` replaces structural props (lists, entries).
- A block never imports kernel, editor or diagram code. It may import value types it displays: `core/types`, `VersionInfo` (`adapters/history`), `ItemChange` (`core/diff`).
- Strings come in through a `t` function (`I18n['t']`); English keys live with the block (`ui/messages/blocks.ts`).
- CSS is a fragment exported by the block (`X_CSS`) and uses the `--mmdx-*` tokens directly, never the editor's alias variables (`--float`, `--ink`… from `ALIASES`, which the viewer does not load). The kernel adopts block CSS when the module that uses the block activates (§7.2), deduplicated by identity.
- Keyboard and a11y are part of the block: roving focus in toolbars, `aria-pressed`, tooltips mirroring labels, focus kept on re-render (`keepFocus()` in `ui/blocks/focus.ts`, generalising the diff's `data-f` pattern).
- Public styling hooks are kept: a block takes the `part` name its host passes (`canvas`, `toolbar`, `zoom-bar`, `diff-bar`, `panel`, `change-list`, `history`).
- Every block has a Storybook story under **Blocks/** with mock props, and a jsdom test.

### 5.2 Catalogue

| Block | Responsibility | Main props | Replaces |
|---|---|---|---|
| `IconButton`, `ToggleButton` | Icon button with tooltip, pressed state, shortcut hint | `icon, label, keys?, pressed?, disabled?, onClick` | ad hoc `btn()` in tool dock, viewer bar, diff |
| `Toolbar` | Floating bar (vertical / horizontal), separators, roving focus, tooltip side | `orientation, items[], tooltip: 'side'\|'above', compact?` | `.view-tools`, viewer `.bar`, diff `.vbar` / `.dbar` |
| `ToolDock` | The tool dock: tool group + panel toggles + undo group, options flyout slot | `groups[], flyout?, compact?` | `chrome/tool-dock.ts` DOM, diff `vbar` |
| `Segmented` | Exclusive buttons (views, compare / version tabs) with a compact `<select>` form | `options[], value, onChange, compactBelow?` | diff view buttons + select, studio mode switch |
| `Menu`, `MenuButton` | Menus with sections, checks, separators, a shortcut column; opener wiring through `PopoverManager` | `sections[], anchor` (an opener, or a point `at` for a context menu), `keys` per item | view-params menus, export menus, ⋮ menus, the editor's board menu |
| `ZoomBar` | − % + Fit, `?`, fullscreen; percentage bound to a view signal | `view: Signal<ViewState>, onZoom, onFit, help?, fullscreen?, compact?` | `chrome/zoom-bar.ts`, `ui/zoom-bar.ts`, viewer zoom controls |
| `HelpPopup` | Help dialog generated from the keymap of the active modules | `registry, title` | editor help, diff help |
| `SchemeToggle` | Light / dark chrome toggle | `scheme: Signal, onChange` | view-params `vp-mode` |
| `ThemeMenu` | "Follow light / dark" entry, then themes grouped light / dark, current ticked, "edit themes" entry | `themes: ThemeInfo[], picked: string \| null, shown, onPick, onFollow, onEdit?` | view-params theme menu |
| `ExportMenu` | Labelled `Export ▾` button (icon-only when compact) and its entries | `entries: { id, label, section?, run }[], compact?` | three export menus |
| `PenOptions` | Colours, sizes, auto erase, erase all | `pen: PenSettings` | editor flyout, viewer popup |
| `SidePanel` | Floating card: header (title or `Tabs`), close, body, resize grip | `side, title \| tabs, onClose, width: Signal` | editor code panel shell, right panel cards, diff panels |
| `PanelStack` | Column of `SidePanel`s with splitters, remembered sizes, empty-collapse, drawer form below a width | `side, panels[], storageKey, drawerBelow?` | `right-panels.ts` stack, diff left stack |
| `Tabs` | Tab list with roving focus | `tabs[], value, onChange` | code / metadata, compare / view version |
| `CodeView` | Read-only highlighted lines: plain listing, unified diff with numbers / hunks / gaps, line narrowing, copy | `lines \| ops, language: 'mermaid'\|'meta', mode: 'plain'\|'diff', select?` | `viewer-code.ts`, diff code table |
| `CodeEditor` | Editable code (exists) | as today | — |
| `VersionList` | Version rows (message, id, tags, author, age, counts) with Before / After picks | `versions, counts, mode, picked, onRow, onPick, onMore` | diff `historyRows` |
| `ChangeList` | Change rows with mark icons, kind, label; selection | `changes, selected, onSelect` | diff `changeList` |
| `FilterToggles` | Icon toggle buttons for the change kinds (Added, Removed, Content, Layout, Style), coloured, with tooltips and accessible names | `filters, value, onChange` | diff filter chips |
| `LayerList` | Layer rows (show / hide, lock, rename, delete, counts that select and highlight) | `layers, editable, onToggle, onDelete?, onCountClick?, onCountHover?…` | `panels/layers.ts` DOM, viewer layers popup |
| `Disclosure` | Collapsible section: head button (`aria-expanded`), caret, title, badge; body filled on first open | `title, open: Value<boolean>, onToggle?, fill?, badge?` | theme editor cards |
| `TileGallery` | Picture tiles as a list of buttons (selected: `aria-current`), delete buttons beside them, an add tile; roving arrow keys, Delete; one tile redrawn in place | `label, tiles[], selected, onSelect, add?, readOnly?` | theme editor style and page-preset galleries |
| `ColorPicker` | Palette swatches (`@name`), a custom colour and None in a dialog opened from a chip through `PopoverManager`, placed inside the viewport | `label, colors[], value, custom, onPick` | theme editor colour popover |
| `StyleToolbar`, `PageToolbar`, `ItemPreview`, `ShapePreview` | (exist; already generic) | as today | — |
| `Banner`, `ErrorCard`, `EmptyState`, `Toast`, `Dialog`, `Popover`, `Pill` | Messages and overlays (`Toast`, `Dialog`, `Popover` exist; `Pill` is the History "Back" pill, and the editor's problems and remote-change bars with text tools and a plain action) | | viewer error panel, diff banner / msg, editor issue / remote bars |

`ui/zoom-bar.ts` and `ui/panes.ts` are absorbed into `ZoomBar`, `HelpPopup`, `SidePanel` and `PanelStack` (`ui/panes.ts` is removed with the editor's panels in phase 5).

## 6. Canvas (L3): `DiagramCanvas`

One class for every picture of a diagram.

```ts
interface CanvasOptions {
  /** 'pan-zoom' (a Viewport) or 'static' (fit through the viewBox, no viewport; the viewer's interactive="false"). */
  interaction: 'pan-zoom' | 'static';
  wheel?: WheelMode; panOnDrag?: boolean; minK?: number; maxK?: number; pad?: number;
  insets?: () => Insets;
}
class DiagramCanvas {
  readonly el: HTMLElement;              // positioned container
  readonly svg: SVGSVGElement;           // defs + vp > [page, body, runs, overlay, ink]
  readonly view: Signal<ViewState>;      // k, tx, ty (ZoomBar, constant-size badges, pen)
  readonly viewport: Viewport | null;    // null while static
  setInteraction(i: CanvasOptions['interaction']): void;     // the viewer toggles it at runtime
  show(r: Rendered, layers?: { body?: SceneNode[]; runs?: SceneNode[]; overlay?: SceneNode[] }): void;  // keyed patch
  clear(): void;                                              // drops the patch state (a new scene owner repaints in full)
  setOverlay(nodes: SceneNode[]): void;                       // painters' output (editor handles, diff highlights)
  itemAt(target: Element): { key: string; kind: ItemKind; id: string } | null;   // data-kind / data-id / data-key
  fit(bounds?: Rect): void; focus(rect: Rect): void; zoomBy(f: number): void;
  saveView(): ViewSnapshot; restoreView(s: ViewSnapshot): void;                  // History enter / exit
  link(other: DiagramCanvas): () => void;                     // shared pan / zoom (side by side)
  attachInk(store: StrokeStore): () => void;                  // one stroke set, every canvas
  morph(states: MorphState[], index: number): Morph;          // animated states (diff)
  destroy(): void;
}
```

- A component's canvas area holds the main canvas and, when needed, a second one linked to it (side by side, also in History); both use the kernel theme.
- `StrokeStore` (in `dom/pen.ts`) holds strokes in diagram coordinates; `MagicPen` becomes "a store + input on one canvas"; strokes live in the canvas's `ink` layer for every product (the viewer's separate pen SVG and the diff's `ink.ts` go away). The store is cleared when the stage changes (§8.3), as the editor clears it on Edit / View today.
- Layer class names are unified (`page-layer`, `body-layer`, `overlay`, `ink`); the editor's `page-shadow` look moves to CSS on `page-layer`. The root's role stays per product (viewer `img` with the summary label, editor `application`, diff `application`).
- SSR adoption, `fit="none"` sizing and aspect-ratio reservation stay in `TextScene` (§7.3), not in the canvas.
- The theme editor's live preview becomes a `DiagramCanvas` (`interaction: 'pan-zoom'`, it has its own zoom) fed with renders made with the draft theme; its item tiles stay `ItemPreview`s.

## 7. View kernel (L4): `ViewCore`

### 7.1 Responsibilities

Everything that is not editing, not diffing and not a rendering strategy, extracted from `DiagramViewer`, `EditorCore` / `DiagramEditor` and `DiagramDiff`:

- **Services**: `ctx` (instance context), `i18n`, `storage`, `popovers`, `toaster`, `emit` (bubbling, composed `mmdx-*` events). Loaded on first use (§10): `dialogs`, `shortcuts` (the keymap, key routing scoped to the shadow root), panel stacks.
- **State (signals)**: `mode` (`'view'`; the editor adds `'edit'`), `stage` (`'document' | 'history'`, §8), `scheme` (chrome light / dark), `theme` (§7.5), `display` (labels, hover highlight, visible layers), `features`, `panels` (open panels by name), `tool` (hand / pen; the editor adds its tools), `compact` (§7.6).
- **Scene stack**: `scene` is the active `SceneSource`; `pushScene` / `popScene` switch what the main canvas shows (§7.3).
- **Kinds**: a `KindsProvider` given by the product — lazy (`view/kinds.ts`) for the viewer and the diff, static (`ALL_KINDS`) for the editor, whose gestures and typing need synchronous renders. The core gains `…With(kinds)` variants of the diff functions so the diff uses the loaded kinds (§9).
- **Shell**: the element's shadow root with named **slots** that modules fill:

```
┌ top-left: titles, badges ──── top-center: pill, banners, remote-change bar ──── top-right: view params ┐
│ left-stack (PanelStack)  left-dock (ToolDock)   canvas(es)                     right-stack (PanelStack) │
│                                                                                                         │
│                                bottom-center: context bar (diff bar, page bar)                          │
└───────────────────────────────────────────────────────────────────────────────────── bottom-right: ZoomBar ┘
  overlay: views that cover the component (Plain Mermaid compare, dialogs)
```

  The left dock sits to the right of the left panel stack, so the Code and History panels are at the component's edge and the tools stay next to the canvas. The canvas area is inset by the open stacks and the dock (one inset function for every product); slots that nothing fills take no room. Below a width threshold (`PanelStack.drawerBelow`), a stack opens one panel at a time as a drawer over the canvas.

### 7.2 Module contract

```ts
interface ViewModule<C extends ViewCore = ViewCore> {
  id: string;
  /** Install after these modules (ids); replaces today's reliance on list order. */
  after?: readonly string[];
  /** Active only in these modes / stages (default: all). Inactive = suspended by the kernel. */
  when?: { mode?: readonly Mode[]; stage?: readonly Stage[] };
  /** Re-evaluated when features, controls or options change; false uninstalls, true installs. */
  enabled?(core: C): boolean;
  /** Eager part: slot DOM (buttons), shortcuts, cheap listeners. Every registration goes through the scope. */
  install(scope: ModuleScope<C>): void | (() => void);
  /** Lazy part, loaded on first use (pen, view settings, code view, export, History); its CSS is adopted then. */
  load?(): Promise<{ css?: readonly string[]; activate(scope: ModuleScope<C>): void | (() => void) }>;
  css?: readonly string[];
}

interface ModuleScope<C> {
  readonly core: C;
  slot(name: SlotName): { append(el: Element): void };
  mount(parent: Element, el: Element): () => void;  // DOM placed at any time (also after install); returns an unmount
  listen(target: EventTarget, type: string, f: (ev: Event) => void): void;
  canvas(type: string, f: (ev: Event) => void): void;  // a listener on the main canvas's picture
  on<E extends keyof EventsOf<C>>(e: E, cb: (d: EventsOf<C>[E]) => void): void;
  effect(f: () => void): void;
  computed<T>(f: () => T): ReadSignal<T>;     // disposed on uninstall
  shortcut(s: Shortcut): void;                 // keymap entries, scoped by `when`
  provide<A extends keyof ActionsOf<C>>(name: A, f: ActionsOf<C>[A]): void;
  gesture(s: GestureSource): void;             // editor only
  painter(p: OverlayPainter): void;            // editor only
}
```

- The scope records every registration, so the kernel can **suspend** a module (detach its slot DOM, mute its listeners, shortcuts, gestures and painters, keep its state) when `when` no longer matches, **resume** it, and **uninstall** it with nothing left behind. No module touches `core.dom.*` or the canvas DOM directly; the module-matrix test checks that after uninstall no listener, node or registration remains.
- Actions and events are typed per product with generics (`ViewCore<Actions, Panels, Events>`, `EditorCore extends ViewCore<EditorActions, EditorPanels, EditorEvents>`), not with global declaration merging. Events are an open, typed map (`ViewEvents`: name → payload), not a closed union.
- `core.on()` / `core.provide()` called while a module installs (or its lazy part activates) belong to that module, as does DOM it adds straight to the root or the canvas area; called by module code after install they would outlive the module, so the kernel warns — modules use `scope.on()` / `scope.provide()` / `scope.mount()`.
- A lazy module's stub carries `id`, `after`, `when` and `enabled`; the real module's own `enabled` applies too once loaded. `after` naming a missing module, and cycles, are reported.
- The viewer's `controls`, the editor's `features` and the diff's `features` map to modules and are re-evaluated at runtime (the viewer's `controls` attribute can change after connect): `refreshModules()` re-runs `enabled`, and a module that read `core.feature()` while installing is installed again when one of those features changed (the zoom bar's help and full screen, the view params' toggle, theme menu and Export).

### 7.3 Scene sources

```ts
interface SceneSource {
  readonly id: string;
  /** Takes the main canvas (and may add a linked second one); paints in full. */
  attach(canvases: CanvasArea): void;
  /** Gives the canvas back; must stop painting. */
  detach(): void;
  /** Something it depends on changed (theme, display, kinds, document). Repaints only while attached. */
  invalidate(): void;
  readonly bounds: Signal<Rect | null>;
}
```

- `TextScene` (viewer): source text or `src` → async render (worker over 300 lines, kinds on demand), SSR adoption, Mermaid fallback, error card, aspect-ratio reservation.
- `StoreScene` (editor): `DocStore` → sync render (gestures preview through it), selection decorations, overlay painters.
- `DiffScene` (diff, History): a `DiffSession` (§8.1) → morph states on the main canvas, a second linked canvas for side by side, highlights and badges in the overlay layer.
- **Canvas ownership**: only the attached scene paints. `EditorCore.draw()` becomes `scene.invalidate()`, so a store change while History is open (remote update, host `setSource` or `undo()`) marks the `StoreScene` dirty without painting over the diff; it repaints in full when it is attached again.

### 7.4 Standard view modules

| Module | Slot / blocks | Viewer | Editor | Diff |
|---|---|---|---|---|
| `zoomBar` | bottom-right · `ZoomBar`, `HelpPopup` | ✓ (help popup new) | ✓ | ✓ |
| `toolDock` | left-dock · `ToolDock` | ✓ | ✓ | ✓ |
| `viewParams` | top-right · `SchemeToggle`, `ThemeMenu`, `ExportMenu` | opt-in theme menu (`controls="theme"`); Export ▾ | ✓ | ✓ (**theme selector**) |
| `pan` | left-dock · `IconButton`; Space-drag, wheel | ✓ | ✓ | ✓ |
| `pen` | left-dock + flyout · `PenOptions`, `StrokeStore` | ✓ | ✓ | ✓ (all canvases) |
| `export` | `ExportMenu`; formats contributed by modules (`exportFormats` action) | ✓ | ✓ | ✓ (+ patch, reports) |
| `fullscreen` | ZoomBar button | ✓ | ✓ | ✓ |
| `viewSettings` | right-stack side card · `LayerList`, display toggles | ✓ | View mode | ✓ (new) |
| `codeView` | left-stack · `CodeView` | ✓ | View mode (new) | — (diff has `codeDiff`) |
| `history` | left-dock button · enters / leaves the `history` stage (§8) | ✓ | ✓ (+ Restore) | — (always a diff) |
| `links` | canvas · click opens; in a `DiffScene` click selects, ⌘ / Ctrl-click opens | ✓ | View mode | ✓ (new) |
| `hoverHighlight`, `a11yLabel` | canvas | ✓ | View mode | ✓ |

Layers in the viewer and the diff are a view override (`visibleLayers`); in the editor's Edit mode the Layers panel edits the document's layer flags. `LayerList` takes `editable` for the difference.

### 7.5 Theme

The theme is **component state, not document state**.

- **Format**: `canvas.theme` is removed from the `.mmdx` format. A migration in `core/meta/migrations.ts` drops it on load (the editor's next save writes the file without it); `pickTheme` no longer reads it; the diff no longer reports theme changes (`core/diff/index.ts`). Pages that relied on a diagram's own theme set `theme` on the element, or the `theme` option of `renderToSvg` and the markdown plugins.
- **Resolution** (one `theme` signal per component): a pick the user made in this component (this session) → the host's `theme` attribute (and `theme-dark` while the chrome is dark) → the pick remembered in storage → the default, which follows the chrome scheme (Default Light / Default Dark). So after a reload the host's attribute wins over a remembered pick, and the theme menu ticks the pick only when the shown theme comes from it (`themes.picked`).
- **Chrome scheme**: an explicit `ui="light"` / `"dark"`; otherwise (`auto` or unset) the user's remembered toggle, else the page's scheme. A scheme flip that leaves the resolved theme unchanged repaints nothing.
- **Theme and scheme are independent.** The sun / moon toggle changes only the chrome. While nothing is picked, the diagram follows the scheme (default theme, or `theme` / `theme-dark`); a picked theme stays when the scheme changes. The theme menu's first entry, "Follow light / dark", clears the pick. Picking a dark theme does not switch the chrome to dark.
- **Persistence**: the pick is remembered in storage per product (`viewer.theme`, `editor.theme`, `diff.theme`), so a pick in a docs-page viewer does not change the editor. The chrome scheme is remembered per product the same way.
- **Scope**: every canvas, stage and panel of the component uses it — main and side-by-side canvases, morph states, item previews, exports. History has no theme of its own; a pick in History is the component's pick and stays after Back.

### 7.6 Chrome look and the `compact` preset

- One look everywhere: the editor's chrome (tool dock, zoom bar bottom-right, view params top-right with the light / dark toggle, theme menu and a labelled `Export ▾`). The viewer adopts it; the editor's View mode and `<mmdx-viewer>` look the same because they run the same modules.
- **Code view**: a panel in the left stack (`CodeView`), in every product.
- **Scrollbars**: every side panel (and the studio's examples gallery) scrolls with thin overlay scrollbars (`OverlayScroll`): the native ones are hidden, the thumb of the area under the pointer floats over the content while the pointer is over it, while it scrolls and while it is dragged.
- **View settings**: a side card in the right stack (display toggles and layers).
- **`compact`** (a kernel-level option, attribute `compact` on every element, automatic below a host size): the same pieces, smaller and icon-only — 32 px dock buttons, the zoom bar without labels, `Export` as an icon, view params condensed. No piece moves or merges into another.
- The prototype of these decisions: the "mmdx chrome options" design canvas (compact preset, view settings card, History placement).

## 8. History

### 8.1 Diff session

`DiffSession` holds the version source (a `HistoryAdapter`, a list, or a pair of sources), the pair or the viewed version, the filters, the rendered diff (`renderDiffWith(kinds, …)`), the change selection and the view (Before / Merged / After / Side by side). It is the model behind `DiffScene` and the diff modules:

| Diff module | Slot · blocks |
|---|---|
| `diffBar` | bottom-center · `Segmented` views, `FilterToggles` (icon buttons), dim, Changes toggle (icon with count); Restore at its end while in History in Edit mode |
| `versions` | left-stack · `VersionList` (Compare / View version tabs) |
| `codeDiff` | left-stack · `CodeView` in diff mode, narrowed to the selection |
| `changeList` | right-stack · `ChangeList` |
| `diffStage` | canvas area · morph states, linked second canvas, highlights and badges |
| `diffExport` | formats for `export` (patch, reports, images of a view) |
| `historyPill` | top-center · `Pill`: "History · v3" or the pair "v3 → Working copy", and **Back** (Esc: back to the document, the panel stays); while History shows a version or a comparison. A version viewed as it is is named here only: no title over its picture (`versionTitle: false` in the `DiffScene`; the standalone `<mmdx-diff>`, which has no pill, keeps it) |

### 8.2 History in place: the `version` and `history` stages

`stage: 'document' | 'version' | 'history'` is a second axis next to `mode: 'edit' | 'view'`; `mode` keeps its meaning (`readOnly` stays `mode === 'view'`). `core.historyOpen` is History being open (its version panel), whatever it shows; the stage is what the canvas shows.

Opening History (the History button in the tool dock, `toggleHistory()`) shows the version panel only, with the History tab, in the host's own left stack. Nothing is picked: the document stays as it is, editable in the editor. Switching between the History and Compare tabs shows nothing new. What a pick shows:

- **A version on the History tab** (the `version` stage): read-only in the host's own scene, drawn exactly as the document is (page, canvas, theme). The editor's `EditorCore.showVersion` reads and draws the version instead of the store (`version` signal: the getters, `render()` and the selection read it) and refuses every write (`applyCode`, `change`, transactions, undo / redo). The editor's dock keeps Pointer, Hand, pen, Code, Layers and History; Shapes, Properties and Undo / Redo are hidden (`.no-version`). Items can be selected (click, marquee, never moved, resized or cloned); the action bar over the selection has Copy only (`version-copy` module); the Code panel shows the version's code and metadata read-only; Layers hides and shows the version's layers in the view only (`visibleLayers`). Editing shortcuts are off unless marked `readOnly` (copy, select all, tools, panels). A viewer, which has no document scene of its own to draw a version read-only, shows it in the `DiffScene`'s History mode (the `history` stage). The current version (the top row, the document itself) cannot be picked on the History tab.
- **A version on the Compare tab** (the `history` stage): compared with the current one (the top row; the top row itself with the one before it), in a `DiffScene` pushed over the host's canvas: the diff bar, the code diff (in the Code panel's place: open stays open), Changes, view settings (the host's Layers, open as it was), the exports, the `history-pill` with the pair and the swap. The panels stay in the host's own stacks, in the same order (Code above History) and at the same widths; nothing opens or closes on the switch. The timeline's dots and Swap change the pair from there.
- Every switch between the document, a version and a comparison animates on the canvas (`transitionFrom`, `DiffScene.continueFrom`): the view stays where it is on screen (it moves with the canvas into the comparison's pane and back), items keep their place and move, the others fade; a comparison then glides to its fit.

The Back pill (top centre, "History · v3" or the pair) and Esc go back to the document: the version panel stays open. Closing the panel (its ×) hides it: a version or a comparison stays shown and the History button brings the panel back; with nothing older shown (or on Back while the panel is closed) History is left, as with `toggleHistory(false)`. **Restore this version** (Edit mode, in each older version's "⋮" menu; not for the current one) loads the version into the store as one undoable change and leaves History. Over a comparison the Layers card lists the layers only (no display settings: what is compared is drawn as it is).

- **The clipboard carries content** (§9): what was copied from an old version can be pasted into the current document, including items the current document no longer has.
- **The working copy follows the document**: an edit, a remote update, host `setSource` or `undo()` updates the "Working copy" entry and recomputes a comparison that uses it.

Leaving History: the `DiffScene` is popped if it was shown, the document is shown again (the selection, entered group and layer visibility it had are back), suspended modules resume with their state.

**Small hosts** (a docs-page viewer): the viewer grows to a minimum height (560 px) while History is open, and below the drawer width its panels open one at a time as drawers over the canvas (`PanelStack.drawerBelow`).

The session's code (diff modules and the diff part of `core`) loads on first use, through the `loadHistory` option the product gives the kernel (`() => import('…/diff/history.js')`), so the view layer never imports the diff; with kinds loaded through the provider the chunk graph stays stable, and History needs no `mmdx/diff` on the page.

### 8.3 History API and events

- `editor.historySession` / `viewer.historySession`: `null` while History is closed; while open, a `DiffSession` facade with the `<mmdx-diff>` methods — `setPair(base, head)` (a comparison), `viewVersion(id)` (a version as it is), `setView(view)`, `setFilters(filters, dim?)`, `select(key)`, `next()`, `prev()`, `pair` (all null while nothing is picked), `getDiff()` (null unless a comparison shows), `exportAs(kind, opts)`.
- `history` and `toggleHistory(on?, { compare? })` keep working; `compare` opens on the newest change compared (the studio's Diff). `mmdx-history-show` `{ shown: 'none' | 'version' | 'compare' }` tells the host what History shows (the studio's mode switch shows Diff for a comparison).
- Events on the host, separate from the host's own events: `mmdx-history-open`, `mmdx-history-close`, `mmdx-history-compare`, `mmdx-history-version`, `mmdx-history-select`, `mmdx-history-view`, `mmdx-history-mode`, `mmdx-history-filters`, `mmdx-history-export`, `mmdx-history-restore`. Errors of the session come as `mmdx-history-error`; `mmdx-render` and `mmdx-error` remain the host's own. Destroying the host while History is open closes it without giving the canvas back, repainting or emitting `mmdx-history-close`: a component being destroyed emits no events.
- `<mmdx-diff>` keeps its current event names (`mmdx-compare`, `mmdx-select`, …). `mmdx-view` `{ view, mode }` is the view (Before / Merged / After / Side by side) only; the version panel's tab and History mode (one version as it is, which needs the panel) have their own event, `mmdx-mode` `{ mode, viewOnly }` (`mmdx-history-mode` in History). Methods emit; options and attributes (`view`, `mode`, `filters`, `dim`) set the state without an event.
- `setPair` leaves History mode for Compare. Every `load()` starts a generation: a list, a page, a source, a render or a change count that arrives for an older one is dropped. While a newly viewed version loads, nothing of the previous one is shown or exported under its name.

### 8.4 `<mmdx-diff>`

`DiagramDiff` is a `ViewCore` with a pinned `DiffScene` (never popped), the diff modules (without `historyPill`) and the standard `zoomBar`, `toolDock`, `viewParams`, `pen`, `pan`, `fullscreen`, `export`, `viewSettings`, `links`. Host actions (`DiffAction`) render in the top-right slot.

## 9. Core changes

1. **Kinds in the diff**: `renderDiffWith(kinds, …)` and `diffDiagramsWith(kinds, …)`; the diff engine (`core/diff/index.ts`) and the renderer (`core/diff/render.ts`) take the kinds and import none. The all-kinds wrappers `renderDiff` / `diffDiagrams` / `renderDiffToSvg` keep their signatures and live in `core/diff/all.ts`, exported by `mmdx/core` only; `mmdx/diff` has asynchronous `diffDiagrams` and `renderDiffToSvg` that load the kinds of both versions first. The result types are in `core/diff/types.ts`, so the merged model, the annotations, the renderer and the reports import no engine (no cycle among the `core/diff` modules). A session loads the kinds of both versions before rendering (they can differ). `ui/item-preview.ts` takes a parser instead of importing every parser.
2. **Theme out of the format**: the `canvas.theme` migration, `pickTheme` without the document's theme, no theme field in the diff (§7.5).
3. **Content clipboard**: `ClipboardData` carries the copied items' code lines, metadata (looks, positions) and the edges between them, plus the source diagram type; `pasteItems` inserts them with fresh ids when they are missing from the target and refuses another diagram type. The system clipboard format (`web application/x-mmdx+json`) carries the same payload. Sequence diagrams stay refused.
4. **Nothing else**: renderers, the parser and the rest of the format are unchanged.

## 10. Bundle strategy

- **Phase 0 spike** (before any extraction): build the kernel (services, theme, scheme, shell, module host, scene stack, `DiagramCanvas`) and measure the viewer. Then decide between an eager / lazy kernel split (eager: events, i18n, storage, popovers, theme, canvas, slots; lazy: keymap and help, dialogs, panel stacks, suspension) and a higher viewer budget. The decision and its numbers are recorded here.
- `mmdx/viewer` = kernel + `TextScene` + the viewer's eager modules (`zoomBar`, `toolDock`, `links`, `hoverHighlight`, `a11y`); `pen`, `viewSettings`, `codeView`, `export`, `history` load on first use. Budget 46 kB gzip (first diagram) unless the spike re-sets it.
- `mmdx/editor` = kernel + `StoreScene` + editing modules; budget 165 kB (2.2 kB headroom today: the kernel indirection is measured per phase).
- `mmdx/diff` = kernel + `DiffScene` + diff modules + the diff part of `core`; kinds on demand. Target 60 kB.
- The size gate adds "viewer + History opened" and "editor + History opened" rows, and measures the real library build (the `vite build` of every entry at once, whose shared chunks a per-entry bundle never sees) next to the per-entry consumer bundles. It fails when History's static closure imports a chunk only the editor loads.

### 10.1 Phase-0 measurement (phase 3)

Measured with `tools/size.mjs` once the viewer and the editor ran on the kernel:

| Entry | Before | Eager kernel, every module eager | Eager kernel, viewer modules on demand | Budget set |
|---|---|---|---|---|
| viewer (first flowchart) | 45.3 kB | 74.0 kB | 53.4 kB | 55 kB (provisional) |
| editor | 162.8 kB | 173.2 kB | 173.2 kB | 176 kB (provisional) |
| diff (phase 4a) | 86.5 kB | — | 90.8 kB (renderers on demand; pen, view params, view settings on demand) | 93 kB (provisional) |
| diff (parsers and panels on demand) | 95.2 kB | — | 82.2 kB | 84 kB (provisional) |

- The viewer loads only the kernel, `TextScene`, `zoomBar`, `links` and `hoverHighlight` eagerly; `panelStacks`, `toolDock`, `pan`, `pen`, `viewSettings`, `codeView`, `viewParams`, its export formats and History load when their control is on (`lazyModule`), the help popup on first `?`. One message table per block group and inlined zoom-bar icons keep the eager chunk free of the lazy blocks' strings and icons.
- What remains is the kernel itself: `ViewCore` with the module host and scopes (≈ 3.8 kB gzip), `DiagramCanvas` (≈ 1.9 kB), the zoom bar block and module (≈ 2 kB), the keymap (≈ 0.8 kB).
- The diff missed its 60 kB target while `mmdx/diff` re-exported the synchronous `diffDiagrams` (every parser, and with `core/diff/index.ts` re-exporting the renderer every renderer too) and its panels were eager. `mmdx/diff`'s `diffDiagrams` now loads the kinds first (asynchronous, an API change; the synchronous one stays in `mmdx/core`) and the versions, code diff and change list load on demand (`lazyModule`, as the viewer's): 95.2 → 82.2 kB. The rest of the gap to 60 kB is the kernel and the diff bar (decision 19).
- The library build (`dist/`, every entry built at once; whitespace minified per chunk, gzip summed per chunk), before → after: viewer + History opened 246.5 → 122.4 kB (History imported the editor's shared chunk through the clipboard ops, statically 238.6 kB of closure; it now loads them on the first copy, 96.3 kB); editor + History opened 239.4 → 241.5 kB; diff 125.2 → 87.4 kB; diff with a flowchart and its change list 125.3 → 113.3 kB. Budgets: viewer (first flowchart) 60, viewer + History 124, editor 192, editor + History 244, diff 89, diff (first flowchart) 115, core 63 kB.
- After the kernel was split into modules (`view/host.ts`, `shell.ts`, `bus.ts`, `scene.ts`, the render worker's job queue), the UI blocks merge and the elements' shared lifecycle (`elements/base.ts`), seven rows went over by up to 1.6 kB. Compared with the eager module lists before the split (d764d22), nothing lazy became eager in the view layer: the growth is the kernel split itself (about 1 kB minified net, the module host's scopes and suspension, the shell's slots), the theme state and scene stack that left `view/core.ts` with more in them, the blocks' roving focus (`ui/blocks/focus.ts`, pulled into every entry by the kernel's `PopoverManager`, ≈ 1.8 kB minified) and grips (`ui/blocks/grip.ts`, editor and diff), larger tokens, and the element lifecycle (≈ 0.9 kB minified per entry, ≈ 0.3–0.7 kB gzip). Measured, and the budgets set to the measurement plus about 0.5 kB: consumer bundles viewer (first flowchart) 60.3 kB (budget 60.8), editor 187.7 (188.2), editor + History opened 232.5 (233), diff 84.8 (85.3); library build viewer (first flowchart) 61.5 (62), editor 194.1 (194.6), editor + History opened 245.1 (245.6), diff 90.3 (90.8). Taking roving focus out of the popover manager's eager path (loading it with the first menu) is the largest single saving left for the viewer.
- The budgets above are provisional, to keep the gate meaningful. Decision 19 is still open: split the kernel further (keymap and help, suspension, panel stacks on demand) or keep the re-set budgets.

## 11. Public API and compatibility

The next release is breaking. Its notes list:

- **Format**: `canvas.theme` is removed (§7.5); files keep loading, the field is dropped.
- **`EditorModule`** takes the `ViewModule<EditorCore>` shape (§7.2: `install(scope)`, `enabled(core)`, `css: string[]`, `when`, `after`, `load`); no adapter for the old shape. `DEFAULT_MODULES` keeps its meaning. `EditorCore.dom` is no longer a module entry point (canvas access goes through the scope and the canvas).
- **Theme behaviour**: the editor's theme menu no longer writes the document and no longer flips the chrome; the viewer and the diff follow the same rule.
- **Unchanged**: element names and attributes, the `Mode` type, `readOnly`, the imperative classes, entry points, `::part()` names (`canvas`, `toolbar`, `zoom-bar`, `diff-bar`, `panel`, `change-list`, `history`), `--mmdx-*` tokens, `<mmdx-diff>` events.
- **New**: `ViewCore`, `ViewModule`, `ModuleScope`, `SceneSource`, `VIEWER_MODULES`, `diffModules()`, `DiagramCanvas`, `DiffSession`, `DiffScene`, `Stage`, `HistorySession` (`historySession`), the `mmdx-history-*` events, `mmdx-mode`, the `compact` attribute, the viewer control `theme`. `mmdx/diff` exports `DiffSession`, `DiffScene`, `diffModules()` and the kernel types its classes expose (`ViewCore`, `ViewModule`, `ModuleScope`, `SceneSource`, `Stage`, `DiagramCanvas`, type-only); `mmdx/viewer` exports `VIEWER_MODULES`, and `mmdx/viewer` and `mmdx/editor` export `HistorySession` and the same kernel types (type-only). `mmdx/core` stays free of the DOM kernel. Blocks stay internal and become a public `mmdx/ui` entry one release later.
- **Element lifecycle** (`elements/base.ts`, every element): one property store, set before or after connect and reused whenever the component is created; properties apply live (`ViewCore.setStorage` and `setThemeSource` swap the preferences store and the theme source; the editor's `features` reinstall its modules, History's stay). A disconnect destroys the component a microtask later unless the element is connected again, so a move keeps it (the editor's document, undo, selection, open History); an editor created again starts from the last `getSource()`. An attribute change applies only its option (`undefined` when removed) and replaces a property of the same option. `instance` is `null` while the element is not connected (a change: the viewer and the editor returned `undefined`). `features` is an attribute on the editor and the diff with the syntax of the viewer's `controls`. Options read only on creation (`ctx`, `autosave`, `guard-unload`) warn once when changed live.
- **`mmdx/diff`'s `diffDiagrams` is asynchronous** (it loads the kinds of both versions); the synchronous one is in `mmdx/core`.
- **Storage keys**: the pick and the scheme move to per-product keys; panel sizes keep their keys where a `PanelStack` replaces an existing stack.
- `history-view.ts` and the tag-based embedding of `<mmdx-diff>` go away after phase 4c (§12).

## 12. Migration plan

Each phase keeps the test suite, Storybook and size gate green and ships nothing half-done.

| Phase | Work | Exit criteria |
|---|---|---|
| 0. Spikes | Kernel size spike (§10); History-in-editor spike: `StoreScene` / `DiffScene` swap on one canvas, suspension through scopes, store changes during History | Budget decision recorded; spike shows no paint-over and full state restore |
| 1. Blocks | Extract the blocks of §5.2 with stories and tests; rebuild the editor's chrome modules and the diff's chrome on them (thin wrappers); the viewer's bar on `Toolbar` + `ZoomBar` | Pixel-equivalent editor stories; the diff gains highlighted code; one pen-options UI |
| 2. Canvas | `DiagramCanvas` and `StrokeStore`; viewer, editor, diff and the theme editor's preview draw through it; `diff/ink.ts` and the viewer's pen SVG removed | Pen strokes shared across diff canvases; editor overlays unchanged |
| 3. Kernel | `ViewCore`, shell slots, scopes and `ViewModule`; scene sources (`TextScene`, `StoreScene`); `EditorCore extends ViewCore`; theme (§7.5) incl. the format migration; the diff's theme menu and toggle; the `compact` preset; the keymap table (§13) | Editor View mode and `<mmdx-viewer>` run the same modules; the viewer has the editor's look; budgets per §10 |
| 4a. Diff on modules | `DiffSession`, `DiffScene`, diff modules; `<mmdx-diff>` = kernel + pinned `DiffScene`; `…With(kinds)` in core | `<mmdx-diff>` parity, no behaviour change beyond §2; ≤ 60 kB |
| 4b. Stages | `stage` signal, suspension by `when`, scene stack, canvas ownership | Module-matrix test: enter / leave History in every mode, state identical |
| 4c. History in the editor | `history` module on the stage; read-only selection, properties and copy; content clipboard; working-copy updates; Restore; `historySession`; `mmdx-history-*` events | Studio history tests rewritten; `history-view.ts` behind a flag as fallback until parity, then removed |
| 4d. History in the viewer | Grow + drawers; no `mmdx/diff` import needed | viewer + History measured |
| 5. Clean-up | Theme editor and studio on blocks; dead CSS and helpers removed; Storybook: **Blocks/**, **Canvas**, **Products/**; README architecture section | No chrome built outside blocks (check: no `role="toolbar"`, `role="menu"` or panel markup outside `ui/blocks`) |

Phase 3 is the largest (the kernel split of `EditorCore`, ~700 lines, and `DiagramViewer`, ~900 lines); phase 4a shrinks `elements/diff.ts` (1 740 lines) into a session, a scene and modules.

### 12.1 Implementation status

| Phase | Status | Notes |
|---|---|---|
| 0 | Measured with phase 3 (§10.1) | Budgets re-set provisionally; decision 19 still open |
| 1 | Done | Every block of §5.2 with a jsdom test and a story under **Blocks/**. The products moved onto the blocks with phase 3 and 4a instead of through thin wrappers first |
| 2 | Done | `DiagramCanvas`, `StrokeStore`; the viewer's pen SVG and `diff/ink.ts` removed; the theme editor's preview is a canvas with the zoom bar block |
| 3 | Done | `ViewCore`, scopes, `ViewModule`, `lazyModule`, `TextScene`, `StoreScene`, `EditorCore extends ViewCore`, the theme rule and the `canvas.theme` migration, `compact`. The editor keeps its own Code / Properties / Layers panels in the document stage; its View mode uses its Layers card as view settings |
| 4a | Done | `<mmdx-diff>` on the kernel; 91 kB, not 60 kB (§10.1) |
| 4b | Done | Stages, suspension (including DOM a module placed while installing, gestures and painters), scene ownership; `tests/editor/stage.test.ts` |
| 4c | Done | History in the editor's own canvas and panels; working copy; Restore in each version's ⋮ menu in the History tab of the History panel, next to Compare with the previous version (rather than at the end of the diff bar); `historySession`; `mmdx-history-*`; ⌘C copies a selected change's item from Before / After. A read-only Properties card for old versions is not done |
| 4d | Done | The viewer grows to 560 px; panels become drawers below 640 px; no `mmdx/diff` needed |
| 5 | In part | Done: the studio's mode switch and New menu, the view-params bar, a **Canvas/** story, the README section. The theme editor, split into `src/theme-editor/` (a library without DOM, a draft on signals whose path setter tracks the undo patches and the changed paths, and views kept in step by effects; an edit redraws only the tiles it affects) and built on `Tabs`, `ToggleButton`, `Segmented`, `Toolbar`, `Menu` and the new `Disclosure`, `TileGallery` and `ColorPicker`. The editor's panels: Code (a `SidePanel` with a `Tabs` head; the editors stay on `ui/code-editor`), Properties and Layers (`SidePanel`s, Layers on `LayerList`) contribute to `core.panelItems` and show in two `PanelStack`s (`chrome/panes.ts`: `setPanel` typed by `PanelName`, `core.stackInsets`, sizes kept under `panes` / `layersH`, open panels under `panels`); `ui/panes.ts`, the pane widths and the editor's selector-probing insets are gone (fit uses the shell's insets). The board's right-click menu is the `Menu` block (opened at the pointer, with a shortcut column); the problems bar and the remote-change bar are `Pill`s in the `top-center` slot (the block loads on first use); Plain Mermaid and the conflict compare are `core.dialogs` (which take the kernel's `t`). The editor's document ops moved out of the panels into `editor/ops` (`doc`, `page`, `label`, `group`, `live`, `code-filter`; `relatedLines` in `core/item-lines.ts`), `properties.ts` split into `panels/inspectors/*` and `panels/props-er.ts` (loaded the first time Properties shows), and code edits and loads go through `core.applyCode` / `core.loadSource`. Open: the editor keeps its own stack module rather than the kernel's `panelStacks` (whose storage keys are per product); no drawer form for the editor's stacks yet; the group-edit bar and the floating toolbars (canvas modules) still build their own markup; the element stories keep their **Elements/** title |

## 13. Keyboard

One keymap table covers every product, mode and stage; shortcuts carry `when` (§7.2) instead of `editOnly` (which still works and means `mode: ['edit']`). The collisions resolve by stage: the editor's editing modules live in the `document` stage only, the diff modules join the editor and the viewer for the `history` stage only, so the same key never means two things at once.

| Key | Editor, document stage (Edit / View) | History stage (editor, viewer) | `<mmdx-diff>` |
|---|---|---|---|
| `V` | pointer tool (Edit) | — | History panel |
| `H` | Hand | Hand | Hand |
| `P` | pen | pen | pen |
| `C` | Code panel (Edit); code view (View, viewer) | Code diff panel | Code diff panel |
| `I` | Properties panel (Edit) | — | — |
| `L` | Layers (Edit) / view settings (View) | Changes panel | Changes panel |
| `⌘Z` | undo the document (Edit) | undo the last pen stroke | undo the last pen stroke |
| `⌘C` | copy the selection (Edit) | copy the selected change's item of that version | — |
| `⇧H` | open History | leave History | — |
| `1`–`4`, `←` `→`, `J` / `K` | — (arrows: move the selection in Edit, pan in View) | views, step views, next / previous change | the same |
| `+` `−` `0` / `F`, `?` | zoom, fit, help | the same | the same |

Esc runs one chain, first match wins: close popover → cancel gesture → drop the pen → clear the change selection → leave History (the Back pill's key, registered last).

## 14. Testing

- **Blocks**: jsdom tests per block (rendering from props, callbacks, keyboard, focus kept on update, a11y attributes, `part` names) and a Storybook story each.
- **Kernel**: install / suspend / resume / uninstall leaves no listeners, nodes or registrations; slots, insets and drawers; theme resolution matrix (attribute / `theme-dark` / pick / default × light / dark, pick kept across scheme changes); scheme switching; keymap scoping by `when`.
- **Scenes**: canvas ownership (no paint from a detached scene), store changes during History, view saved and restored.
- **Core**: the `canvas.theme` migration; `…With(kinds)`; content clipboard round trip (copy from an old version, paste into a document without the items).
- **Products**: the viewer, editor, diff and studio tests are the regression suite; tests that query internal DOM (`.dbar`, `.pane-side`, `.left-stack`, `.mmdx-history-view`) move to block-level selectors in the phase that changes that DOM. A module-matrix test installs each standard module in each product.
- **Visual**: Storybook stories per block and product, light and dark, compact and full; a Playwright pass comparing screenshots before / after each phase.
- **Size**: the gate with the new rows.

## 15. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who owns the theme? | The component (kernel), not the document: `canvas.theme` leaves the format, the diff no longer reports it. Attribute → user pick → default (§7.5). |
| 2 | Theme vs light / dark | Independent. Unpicked follows the scheme; a pick stays when the scheme changes; "Follow light / dark" clears it; a dark pick does not flip the chrome. |
| 3 | How long a pick lasts | In storage, per product. |
| 4 | Theme menu in `<mmdx-viewer>` | Opt-in with `controls="theme"`. |
| 5 | History vs Edit / View | A separate `stage` axis; `mode` unchanged; no Edit / View switching while History is open. |
| 6 | Where History is drawn | In the host's own canvas and panel stacks (no overlay, no second component); the diff is a scene pushed on the host. |
| 7 | Old versions in History | Read-only documents: select, read properties and copy from a single version or the Before / After side, not Merged. |
| 8 | Copying a deleted item | The clipboard carries content (§9). |
| 9 | Document changes during History | The working copy entry follows; comparisons recompute; the canvas stays on History. |
| 10 | Pen strokes | Cleared when the stage changes. |
| 11 | History events | `mmdx-history-*` on the host. |
| 12 | History from code | `historySession` with the `<mmdx-diff>` methods. |
| 13 | `EditorModule` compatibility | New shape in a breaking release, no adapter. |
| 14 | New features | Diff: view settings, clickable links (click selects, ⌘ / Ctrl-click opens). Editor View mode: read-only code panel. Viewer: help popup. |
| 15 | Chrome look | The editor's everywhere; Code view as a left panel; `Export ▾` top-right; view settings as a right side card. |
| 16 | Compact | A global `compact` preset: the same pieces, smaller and icon-only. |
| 17 | History controls | A Back pill top-center; Restore in the diff bar; filters as icon buttons; Code / History panels at the left edge, the tool dock to their right. |
| 18 | History in a small viewer | The viewer grows to 560 px; panels become drawers below a width threshold. |
| 19 | Viewer budget | Phase-0 spike first, then split the kernel or re-set the budget. |
| 20 | Keymap collisions | Designed as one table before phase 3 (§13). |
| 21 | When do the blocks become public? | Internal first; `mmdx/ui` one release after the refactor. |

## 16. Review questions and answers

Every question asked in the architecture review, with the answer as given and where this document applies it. Look-only questions were answered on the "mmdx chrome options" design canvas; the rest in text.

### 16.1 Earlier decisions (before the review)

| # | Question | Answer | Status |
|---|---|---|---|
| E1 | What does a theme picked in the diff change? | The theme belongs to the kernel: one theme per component, inherited by every canvas, mode and panel. | Kept and extended by R2, R5–R9 (§7.5) |
| E2 | Theme menu and light / dark toggle in `<mmdx-viewer>`? | Opt-in with `controls="theme"`; docs pages usually follow the site. | Kept (§7.4) |
| E3 | History in the editor and the viewer? | A mode of the host, drawn in the host's own canvas and panel stacks, editing suspended and restored on exit. | Kept in substance; "mode" replaced by a separate stage (R1, §8.2) |
| E4 | When do the blocks become public? | Internal first; `mmdx/ui` one release after the refactor. | Kept (§11) |

### 16.2 Kernel, History and theme

| # | Question | Answer | Applied in |
|---|---|---|---|
| R1 | How should History relate to Edit / View in the kernel? | Separate stage: `mode: 'edit' \| 'view'` unchanged, `stage: 'document' \| 'history'` added; `readOnly` stays true in History opened from View; Restore when `mode` is `edit`; Edit / View switching blocked while History is open. | §7.1, §8.2 |
| R2 | In History, with no theme picked, which theme draws the versions? | "Theme is not part of document and history! Kernel owns selected theme." | §7.5 |
| R3 | When the editor's theme menu is used during History, what happens to `canvas.theme`? | Answered by R2 and R5: the theme is never written into the document, in History or anywhere else. | §7.5, §11 |
| R4 | The viewer has 0.7 kB of its 46 kB budget left; how should the kernel fit? | Spike first, decide later: measure the kernel in a phase-0 spike, then split it into eager / lazy parts or raise the budget. | §10, §12 phase 0 |
| R5 | What happens to the theme stored in existing files (`canvas.theme`)? | Remove from the format: ignored on load, removed on the next save; the theme comes only from the component. | §7.5, §9, §11 |
| R6 | When nothing is selected yet, where does the kernel's theme come from? | Host attribute (`theme` / `theme-dark`) → the user's saved pick → the built-in default. | §7.5 |
| R7 | How long does a user's theme pick last? | Per product in storage (editor, viewer, diff), so a pick in a docs-page viewer does not change the editor's theme. | §7.5, §11 |
| R8 | If a user picks a dark theme while the chrome is light, what happens? | "Component light / dark mode and canvas theme should not be linked; canvas theme should follow default mode, but can be changed separately from component mode." | §7.5 |
| R9 | After picking GitHub Light, the user switches the component to dark: which theme does the canvas show? | Keep the pick: an explicit pick is independent of the mode; only an unpicked theme follows the mode. | §7.5 |
| R10 | How should History open in a small viewer (e.g. 700 × 300 on a docs page)? | Grow + collapse panels: the viewer grows to a minimum height (560 px) while History is open; below a width threshold the panels open one at a time as drawers. | §8.2 |
| R11 | The document changes while History is open: what happens? | "Component should have current state; on history change current state is stored; the document from history is in view mode, but it should allow to view properties, select items, copy them (open history, copy something from a previous version, close history, paste into the current document)." | §8.2 |
| R12 | In History, where can items be selected and copied? | The single version view, and the Before or After side of a comparison; not Merged. | §8.2 |
| R13 | Should the clipboard carry the content itself (code lines, looks, positions, edges between copied items)? | Yes, carry content, so a node deleted since can be pasted back. | §9 |
| R14 | The current document changes while History is open (remote update, host `setSource`, `undo()` from code): what should History do? | Update the working copy: stay in History, update the "Working copy" entry and recompute a comparison that uses it; the canvas keeps showing History until Back. | §7.3, §8.2 |
| R15 | Pen strokes: what happens when History opens or closes? | Clear on switch. | §6, §8.2 |
| R16 | How should History's events on the host be named? | `mmdx-history-*` (open, close, compare, version, select, view, filters, export, restore, error). | §8.3 |
| R17 | Should hosts control History from code? | Yes, a session object: `editor.historySession` / `viewer.historySession` with the `<mmdx-diff>` methods, null while History is closed. | §8.3 |
| R18 | `EditorModule` changes shape: what about third-party modules? | Break in a major release; no adapter. | §7.2, §11 |
| R19 | Which features should the module matrix add to products that lack them today? | All four: diff view settings, diff clickable links, a read-only code panel in the editor's View mode, the help popup in the viewer. | §2, §7.4 |
| R20 | Keys that mean different things in the editor and the diff (V, L, C, ⌘Z, History toggle): how to resolve them? | Design the keymap later: record the collisions as open and decide with a keymap table before phase 3. | §13 |
| R21 | With clickable links in the diff, does a click open the link or select the change? | Click selects; ⌘ / Ctrl-click opens. | §7.4 |

### 16.3 Chrome look

| # | Question | Answer | Applied in |
|---|---|---|---|
| L1 | The editor's View mode and `<mmdx-viewer>` look different today: which look wins? | Most modules should look the same everywhere. | §7.6 |
| L2 | Controls layout for the editor's View mode and the viewer? | The editor's look, plus a global `compact` parameter. | §7.6 |
| L3 | Compact preset: everything in one bar (A), or the same pieces smaller and icon-only (B)? | B: the same pieces, smaller. | §7.6 |
| L4 | View settings (layers, labels, hover highlight): side card or popover? | Side card in the right stack. | §7.4, §7.6 |
| L5 | Read-only code view: left panel or over the canvas? | Left panel, as in the editor and the diff. | §7.4, §7.6 |
| L6 | Export: `Export ▾` top-right or an icon in the bar? | `Export ▾` top-right, as in the editor (an icon in the `compact` preset). | §7.6 |
| L7 | History mode: where do Back and Restore live (a mode strip, the History panel header, or a pill on top)? | Back pill on top; Restore in the diff bar. | §8.1, §8.2 |
| L8 | Layout correction on the canvas | The tool dock sits after (to the right of) the Code / History panels, not before them. | §7.1, §8.2 |
| L9 | Layout correction on the canvas | The diff bar's filters are icon buttons (Added, Removed, Content, Layout, Style), not text labels. | §5.2, §8.1 |
