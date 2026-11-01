# Architecture

How Mermaid Studio is put together: a pure core that turns text into a scene, a small set of UI blocks, one canvas for every picture, and a view kernel on which the viewer, the editor and the diff are built as sets of modules.

## Layers

| Layer | Where | What it does |
|---|---|---|
| Core | `src/core` | Parsers, layout, renderers, metadata, themes, diff — pure TypeScript, no DOM. The `@mmdx/studio/core` entry |
| DOM | `src/dom` | The DOM patcher, viewport, `DiagramCanvas`, pen strokes, the render worker and its client, PNG / SVG export |
| UI blocks | `src/ui/blocks` | Small UI pieces with no diagram knowledge: tool dock, zoom bar, menus, panels and panel stacks, code view, version and change lists… |
| Kernel | `src/view` | `ViewCore`: services, state, the shell, the scene stack and the module host |
| Products | `src/editor`, `src/diff`, `src/elements` | The viewer, the editor and the diff as the kernel plus a scene and modules; the five custom elements |
| Integrations | `src/adapters`, `src/markdown`, `src/wrappers` | Host adapters, Markdown plugins, React wrappers |

## The core pipeline

Every picture — on screen, exported, server-rendered, in a diff — comes from one pipeline:

1. **Split** (`splitSource`): the source becomes a `DiagramDocument` — the Mermaid code and the parsed `%%@` metadata, validated.
2. **Parse** (`parse`): the Mermaid code becomes a model of the diagram type (flowchart, sequence, ER), with diagnostics.
3. **Theme** (`pickTheme`): the theme id resolves to a theme with every colour reference resolved, plus the diagram's own palette.
4. **Render**: the model, the metadata and the theme become a scene tree — layout, styles and geometry, with a geometry index for hit testing.
5. **Output**: the scene tree is serialized to an SVG string (`standaloneSvg`, SSR, export) or patched into the DOM by keyed patching.

The pipeline never throws on bad input, and every instance-scoped thing it needs — theme registry, text measurer, link policy, id prefix — comes in through a `CoreContext`; there are no module singletons. Each diagram type's parser and renderer is a separate chunk that the viewer and the diff load on first use, and diagrams over 300 lines render in a module worker.

## Blocks

Blocks (`src/ui/blocks`) are the UI pieces the products share: tool dock, zoom bar, menus, theme menu, panels and panel stacks, code view, layer list, version list, change list, filter toggles, pill, help popup, export menu… Each takes plain props and callbacks, knows nothing about diagrams, and has a test and a story in [Storybook](/storybook/){target="_self"}. One set of blocks is why every component has the same chrome.

## Canvas

`DiagramCanvas` (`src/dom/canvas.ts`) draws every picture: the viewer's diagram, the editor's document, each view of a diff, the panes of Side by side. It has layers, pan / zoom or a static fit, keyed patching of the scene tree, hit testing, the pen's ink, linked canvases (shared pan and zoom) and morphing between states — which is how switching Before / Merged / After, versions and comparisons animates.

## Kernel

`ViewCore` (`src/view/core.ts`) is the kernel every diagram component is built on. It holds:

- **services**: the core context, i18n, storage, popovers, toasts, events and the keymap;
- **state** (signals): the mode (`edit` or `view`), the stage (`document`, `version` or `history`), the chrome scheme, the theme (component state: the host attribute, the user's pick, or the default following light / dark), display settings, open panels, the tool, compact;
- **the shell** (`src/view/shell.ts`): the shadow root's root element, the canvas area, and named slots that modules fill — `top-left`, `top-center`, `top-right`, `left-stack`, `left-dock`, `right-stack`, `bottom-center`, `bottom-right`, `canvas`, `overlay`;
- **the scene stack** (`src/view/scene.ts`): what the main canvas shows;
- **the module host** (`src/view/host.ts`): installs, suspends, resumes and uninstalls modules.

## Modules

Features are modules (`ViewModule`). A module installs its slot DOM, listeners, shortcuts, actions and effects through a scope that records every registration, so the kernel can suspend it (detach its DOM, mute its listeners, keep its state), resume it, and uninstall it with nothing left behind.

```ts
interface ViewModule<C> {
  id: string;
  after?: readonly string[];              // install after these modules
  when?: ModuleWhen;                      // active only in these modes / stages; otherwise suspended
  enabled?(core: C): boolean;             // re-evaluated when features, controls or options change
  install(scope: ModuleScope<C>): void | (() => void);
  load?(): Promise<{ css?: readonly string[]; activate(scope: ModuleScope<C>): void | (() => void) }>;
  css?: readonly string[];                // adopted while the module is installed
}
```

Modules never reach into one another; they talk through the kernel's typed events and actions. A module's eager part is small (a button, a shortcut); its lazy part loads on first use. That is how a viewer page ships only the zoom bar, and every other piece of the chrome loads when its control is on.

| Product | Modules |
|---|---|
| Viewer | `VIEWER_MODULES` (`@mmdx/studio/viewer`): panel stacks, zoom bar, tool dock, pan, pen, view settings, code view, view parameters, History, links, hover highlight — each enabled by a control of `controls` |
| Editor | `DEFAULT_MODULES` (`@mmdx/studio/editor`): ER table editing, canvas gestures, connectors, sequence editing, shapes, layout, panels, chrome; most are suspended outside the `document` stage |
| Diff | `diffModules(scene, …)` (`@mmdx/studio/diff`): panel stacks, the diff bar, versions, code diff, change list, zoom bar, tool dock, pan, pen, view parameters, export… |

The editor's `modules` property replaces its module list; `EditorModule` is `ViewModule<EditorCore>`.

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
- **History** runs inside the viewer and the editor: its version panel joins their panels; an old version is the editor's `version` stage (its own scene draws the version read-only, nothing writes the store); a comparison is the `history` stage, a `DiffScene` pushed onto their own canvas in their own look. Its code loads on first use.

The custom elements (`src/elements`, and `src/editor/editor.ts` for the editor) are thin wrappers around the classes: one shared lifecycle keeps the component across DOM moves, maps attributes to options, and keeps properties set before connecting.

## Folder map

| Folder | Contents |
|---|---|
| `src/core` | Parsers, layout, renderers, metadata, themes, diff — pure TypeScript, no DOM |
| `src/dom` | DOM patcher, viewport, `DiagramCanvas`, pen strokes, worker client, export |
| `src/ui` | Signals, the UI blocks (`src/ui/blocks`), toolbars, dialogs, styles and UI strings |
| `src/view` | The view kernel (`ViewCore`), module host, scene sources and the standard view modules |
| `src/diff` | The diff session, scene and modules (`<mmdx-diff>` and History) |
| `src/editor` | The editor core (on the kernel), its store scene and its feature modules |
| `src/theme-editor` | The theme editor |
| `src/elements` | The web components |
| `src/adapters`, `src/markdown`, `src/wrappers` | Host adapters, Markdown plugins, React wrappers |
| `src/*.ts` | The entry points (`viewer.ts`, `editor.ts`, `core.ts`, …) |
| `themes/` | Built-in theme files |
| `examples/` | Example diagrams and their version histories |

See [Contributing](/guide/contributing) for the rest of the repository.
