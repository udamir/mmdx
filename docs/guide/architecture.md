# Architecture

How Mermaid Studio is put together: a pure core that turns text into a scene, a small set of UI blocks, one canvas for every picture, and a view kernel on which the viewer, the editor and the diff are built as sets of modules.

## Layers

Each layer imports only from the layers above it in this table; `tests/arch` checks it (with a baseline of the few edges still to remove that may only shrink), and inside core the same holds for its sub-layers, from the base types up to the assembly of every kind.

| Layer | Where | What it does |
|---|---|---|
| Reactive | `src/reactive` | Signals (`signal`, `computed`, `effect`, `batch`) and `Owner`, the disposal scope every component, block and module sets things up in |
| Core | `src/core` | Parsers, layout, renderers, metadata, themes, diff — pure TypeScript, no DOM. The `@mmdx/studio/core` entry. Inside: base types, the kind contract (`core/kind`), resources (metadata, themes, shapes, icons, media), parse, layout, render, ops, diff and export, the kinds' implementations, and the assembly of every kind |
| Ports, i18n | `src/ports.ts`, `src/i18n.ts` | The host interfaces (storage, documents, themes, history, images, full screen, Mermaid) and the message catalogue — types and plain functions, no DOM |
| DOM, adapters, platform | `src/dom`, `src/adapters`, `src/platform` | The DOM patcher, viewport, pen strokes, the render worker and its client, PNG / SVG export; the built-in host adapters; `configure()`, the shared theme registry, the stock Mermaid bridge and the diagram kinds loaded on demand |
| UI | `src/ui` | `ui/kit`: primitives (elements, focus and roving, popovers, dialogs, icons, the tokens and base styles). `ui/blocks`: small UI pieces with no diagram knowledge — tool dock, zoom bar, menus, panels and panel stacks, code view, version and change lists, status box… `ui/diagram`: the widgets that know diagrams — style and page toolbars, item and shape previews, the code editor |
| Canvas | `src/dom/canvas.ts` | `DiagramCanvas`, every picture's canvas |
| Kernel | `src/view` | `ViewCore`: services, state, the shell, the keymap, the scene stack and the module host |
| Products | `src/editor`, `src/diff`, `src/theme-editor` | The editor and the diff as the kernel plus a scene and modules, and the theme editor; each with its own messages and styles |
| Elements, integrations | `src/elements`, `src/markdown`, `src/wrappers` | The five custom elements (the viewer is the kernel plus a scene), Markdown plugins, React wrappers |

## The core pipeline

Every picture — on screen, exported, server-rendered, in a diff — comes from one pipeline:

1. **Split** (`splitSource`): the source becomes a `DiagramDocument` — the Mermaid code and the parsed `%%@` metadata, validated.
2. **Parse** (`parse`): the Mermaid code becomes a model of the diagram type (flowchart, sequence, ER, mindmap, state), with diagnostics.
3. **Theme** (`pickTheme`): the theme id resolves to a theme with every colour reference resolved, plus the diagram's own palette.
4. **Render**: the model, the metadata and the theme become a scene tree — layout, styles and geometry, with a geometry index for hit testing.
5. **Output**: the scene tree is serialized to an SVG string (`standaloneSvg`, SSR, export) or patched into the DOM by keyed patching.

The pipeline never throws on bad input, and every instance-scoped thing it needs — theme registry, text measurer, link policy, id prefix — comes in through a `CoreContext`; what core keeps at module level is code registries and caches only (`tests/arch` lists each one), and what a render drew without — a shape or the media kit not loaded yet — comes back in its result (`missing`). Each diagram type's parser and renderer is a separate chunk that the viewer and the diff load on first use, and large diagrams (over 300 lines or 32 KiB) render in a module worker.

## Blocks

Blocks (`src/ui/blocks`) are the UI pieces the products share: tool dock, zoom bar, menus, theme menu, panels and panel stacks, code view, layer list, version list, change list, filter toggles, pill, status box, help popup, export menu… Each takes plain props and callbacks — what it shows comes from its host (the code view its line diff, the emoji picker its search) — knows nothing about diagrams, and exports its CSS and has a test and a story in [Storybook](/storybook/){target="_self"} (`tests/arch` checks all three). The primitives below them are in `src/ui/kit`, the widgets that do know diagrams in `src/ui/diagram`. One set of blocks is why every component has the same chrome.

## Canvas

`DiagramCanvas` (`src/dom/canvas.ts`) draws every picture: the viewer's diagram, the editor's document, each view of a diff, the panes of Side by side. It has layers, pan / zoom or a static fit, keyed patching of the scene tree, hit testing, the pen's ink, linked canvases (shared pan and zoom) and morphing between states — which is how switching Before / Merged / After, versions and comparisons animates.

## Kernel

`ViewCore` (`src/view/core.ts`) is the kernel every diagram component is built on. It holds:

- **the component shell** (`src/view/component-shell.ts`), which the theme editor and the studio use too: the shadow root, the core context, i18n, storage (replaceable at run time), popovers, dialogs, the chrome scheme remembered per product, and the component's DOM events;
- **services**: toasts and the keymap (`src/view/keymap.ts`);
- **state** (read-only signals): the mode (`edit` or `view`), the stage (`document`, `version` or `history`), the chrome scheme, the theme (component state: the host attribute, the user's pick, or the default following light / dark), display settings, open panels, the tool, compact, the layers shown, the host's history and full screen. Only the kernel writes them, through its methods — `setMode`, `setStage`, `setDisplay`, `setPanel`, `setTool`, `setVisibleLayers`, `setHostOptions` — and a module through its scope (below);
- **the shell** (`src/view/shell.ts`): the shadow root's root element, the canvas area, and named slots that modules fill — `top-left`, `top-center`, `top-right`, `left-stack`, `left-dock`, `right-stack`, `bottom-center`, `bottom-right`, `canvas`, `overlay`;
- **the scene stack** (`src/view/scene.ts`): what the main canvas shows;
- **the module host** (`src/view/host.ts`): installs, suspends, resumes and uninstalls modules.

## Modules

Features are modules (`ViewModule`). A module installs its slot DOM, listeners, shortcuts, actions and effects through a scope that records every registration, so the kernel can suspend it (detach its DOM, mute its listeners, keep its state), resume it, and uninstall it with nothing left behind.

```ts
interface ViewModule<C> {
  id: string;
  replaces?: readonly string[];           // modules of these ids are out while this one is offered
  after?: readonly string[];              // install after these modules
  when?: ModuleWhen;                      // active only in these modes / stages; otherwise suspended
  enabled?: (core: C) => boolean;         // re-evaluated when features, controls or options change
  install: (scope: ModuleScope<C>) => void | (() => void);
  load?(): Promise<{ css?: readonly string[]; activate(scope: ModuleScope<C>): void | (() => void) }>;
  css?: readonly string[];                // adopted while the module is installed, given back on uninstall
}
```

Modules never reach into one another; they talk through the kernel's typed events and actions — the events every product fires (`ViewEvents`), plus a product's own (the editor's `EditorEvents`: mode, tool, model, selection, overlay); `tests/arch` checks that each one is fired and heard, and that each action is provided and asked for. Through its scope a module adds to the kernel's lists (`contribute`, `contributeAll`), fills a one-value slot such as the dock's flyout (`claim`), and provides actions — `provideDefault` for one that answers only when no other module does. An id offered twice is reported; an added set takes another module's place only by saying so (`replaces`). A module's eager part is small (a button, a shortcut); its lazy part loads on first use. That is how a viewer page ships only the zoom bar, and every other piece of the chrome loads when its control is on.

| Product | Modules |
|---|---|
| Viewer | `VIEWER_MODULES` (`@mmdx/studio/viewer`): panel stacks, zoom bar, tool dock, pan, pen, view settings, code view, view parameters, History, links, hover highlight — each enabled by a control of `controls` |
| Editor | `DEFAULT_MODULES` (`@mmdx/studio/editor`): ER table editing, canvas gestures, connectors, sequence editing, shapes, layout, panels, chrome; most are suspended outside the `document` stage |
| Diff | `diffModules(scene, …)` (`@mmdx/studio/diff`): panel stacks, the diff bar, versions, code diff, change list, zoom bar, tool dock, pan, pen, view parameters, export… |

The editor's `modules` property replaces its module list. A host's module is an `EditorModule` (`ViewModule<EditorModuleApi>`): its scope's `core` is the editor core as modules see it — the document and its edits, the selection, the view, the kernel's state, events and actions, the overlay and gesture hooks. The core itself (`EditorCore`) is internal.

## Scenes

A scene source paints the canvas area while it is attached and gives it back when detached; only the attached scene paints. The kernel keeps them in a stack:

| Scene | Product | Source |
|---|---|---|
| `TextScene` (`src/view/scenes/text.ts`) | Viewer | Source text → asynchronous render (the worker over 300 lines, kinds loaded on demand), server-rendered SVG adoption, the Mermaid fallback, the error card |
| `StoreScene` (`src/editor/scene.ts`) | Editor | The document store → a synchronous render, the selection and the overlay painters |
| `DiffScene` (`src/diff/scene.ts`) | Diff, History | A `DiffSession` → Before, Merged and After as morph states of the main canvas, Side by side as a second, linked canvas |

History pushes a `DiffScene` over the document's scene and pops it on Back; the document scene keeps its state meanwhile.

## Products

- **The viewer** is the kernel with a `TextScene` and `VIEWER_MODULES`.
- **The editor**'s `EditorCore` extends the kernel with a document store (`DocStore`: source snapshots, the derived model, undo history with transactions), a `StoreScene`, gestures and overlay painters.
- **`<mmdx-diff>`** is the kernel with a `DiffScene` over a `DiffSession` (the version source, the pair, filters, the rendered diff, the selection and the view).
- **History** runs inside the viewer and the editor: its version panel joins their panels; an old version is the editor's `version` stage (its own scene draws the version read-only, nothing writes the store); a comparison is the `history` stage, a `DiffScene` pushed onto their own canvas in their own look. What a product offers it — its own version scene, Restore, an item clipboard — is the `HistoryHost` port (`src/view/history.ts`), which the editor sets; the viewer has none and History brings its own scene. Its code loads on first use.
- **The theme editor and the studio** are built on the component shell, without a scene kernel: the theme editor draws its previews itself, the studio hosts an editor.

The custom elements (`src/elements`) are thin wrappers around the classes: one shared lifecycle keeps the component across DOM moves, maps attributes to options from each element's `schema` (the observed attributes follow from it), applies the options every kernel shares in one place, and keeps properties set before connecting. Each element's DOM events are typed (`ViewerEventMap`, `EditorEventMap`, `DiffEventMap`, `ThemeEditorEventMap`; History's in `HistoryEventMap`).

## Diagram kinds

Each diagram type (flowchart, sequence, ER, mindmap, state) plugs in through its **kinds**: objects with everything the generic code needs from that type, so nothing outside the type's own files branches on the type (a test, `tests/arch/no-kind-branches.test.ts`, keeps it that way).

| Kind | Where | Loaded by | Holds |
|---|---|---|---|
| Info | `src/core/kinds/info.ts` | every bundle | The header that detects the type, the source a new diagram starts from, the name's i18n key |
| View kind | `src/core/kinds/<type>.ts` | the viewer and the diff on demand, core statically | Parser, renderer, the items and their containers and connectors (layers), hover frames, the accessible name |
| Diff kind | `src/core/kinds/<type>-diff.ts` | the diff and History on demand, core statically | Item changes, the merged picture, highlight shapes, code lines |
| Ops kind | `src/core/kinds/<type>-ops.ts` | the editor | Code order, positional ids and their metadata, the clipboard, presets, geometry lookups, the code filter's search, the styles the code gives |
| Edit kind | `src/editor/kinds/<type>.ts` | the editor | Item text, delete, group, connect, the Shapes menu and drop placement, page settings, the code panel's fixes |

A type's per-type code stays in its own files (`parse/<type>.ts`, `render/<type>.ts`, `ops/<type>.ts`, `diff/<type>.ts`, its editor module); the kinds bring it together. The kinds' contract (what each kind holds) is in `src/core/kind`. Loaded kinds are registered (`src/core/kinds/registry.ts`, `src/editor/kinds/registry.ts`), and the generic helpers find a model's kind there: a model only exists once its type's parser ran, so a missing kind is a bug and the lookup fails closed (`requireKind`; the diff reports it as `kind.not-loaded`). Where each type's view and diff kinds are is one manifest, `KIND_MODULES` in `src/platform/kinds.ts`, whose loaders share one load in flight per chunk.

The editor loads a type's view, ops and edit kinds in one chunk the first time a document of that type is shown (`src/editor/kinds/loader.ts`): an editor of flowcharts never downloads the sequence and ER code. The document draws once they arrive, and `whenLoaded()` waits for them.

## Folder map

| Folder | Contents |
|---|---|
| `src/reactive` | Signals and `Owner` |
| `src/core` | Parsers, layout, renderers, metadata, themes, diff — pure TypeScript, no DOM; `core/kind` holds the kinds' contract |
| `src/ports.ts`, `src/i18n.ts` | Host interfaces; the message catalogue |
| `src/platform` | `configure()`, the shared themes, the stock Mermaid bridge, the kinds loaded on demand |
| `src/dom` | DOM patcher, viewport, `DiagramCanvas`, pen strokes, worker client, export |
| `src/ui` | `ui/kit` (primitives, tokens), `ui/blocks` (the shared UI blocks), `ui/diagram` (toolbars, previews, the code editor), and the blocks' strings |
| `src/view` | The view kernel (`ViewCore`), keymap, module host, scene sources, the standard view modules, the viewer's messages and styles |
| `src/diff` | The diff session, scene and modules (`<mmdx-diff>` and History), its messages and styles |
| `src/editor` | The editor core (on the kernel), its store scene and its feature modules, its messages and styles |
| `src/theme-editor` | The theme editor, its messages and styles |
| `src/elements` | The web components |
| `src/adapters`, `src/markdown`, `src/wrappers` | Host adapters, Markdown plugins, React wrappers |
| `src/*.ts` | The entry points (`viewer.ts`, `editor.ts`, `core.ts`, …) |
| `themes/` | Built-in theme files (the two core bundles are generated into `src/core/theme/data` by `tools/build-theme-data.mjs`) |
| `examples/` | Example diagrams and their version histories |

See [Contributing](/guide/contributing) for the rest of the repository.
