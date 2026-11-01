# Components

Mermaid Studio ships five custom elements. Each one renders in shadow DOM, needs no global CSS and works in plain HTML or any framework that renders custom elements. Behind every element is an imperative class with the same features, for hosts where `customElements.define` is not allowed.

| Element | Import | Class | What it is for |
|---|---|---|---|
| [`<mmdx-viewer>`](/components/viewer) | `@mmdx/studio/viewer` | `DiagramViewer` | Read-only diagrams for docs and portals: pan, zoom, layers, pen, code, export, full screen, history |
| [`<mmdx-editor>`](/components/editor) | `@mmdx/studio/editor` | `DiagramEditor` | The visual editor with the code panel, properties, layers, saving through an adapter, and History |
| [`<mmdx-diff>`](/components/diff) | `@mmdx/studio/diff` | `DiagramDiff` | How a diagram changed between two versions, item by item, and its version history |
| [`<mmdx-theme-editor>`](/components/theme-editor) | `@mmdx/studio/theme-editor` | `ThemeEditor` | Edit the palette and every item type's style of diagram themes, with live previews |
| [`<mmdx-studio>`](/components/studio) | `@mmdx/studio` | `DiagramStudio` | The complete standalone app: editor, examples, file open, theme editor, versions and share links |

Try them all on one page in the [playgrounds](/components/playgrounds), in the [studio](/studio/){target="_self"}, or one by one in [Storybook](/storybook/){target="_self"}.

## How the elements behave

### Registering

Importing an element entry registers its tag once. Importing it twice is safe, and importing any entry in Node does not throw, so server-side rendering frameworks and build scripts can import them.

```ts
import '@mmdx/studio/viewer'; // defines <mmdx-viewer>
import '@mmdx/studio/editor'; // defines <mmdx-editor>
```

Each entry also exports a `define…` function that registers the element under another tag name (it does nothing when the name is taken or outside a browser): `defineViewer(name?)`, `defineEditor(name?)`, `defineDiff(name?)`, `defineThemeEditor(name?)`, `defineStudio(name?)`. The element classes are exported too: `MmdxViewerElement`, `MmdxEditorElement`, `MmdxDiffElement`, `MmdxThemeEditorElement`, `MmdxStudioElement`.

### Attributes and properties

Every attribute sets one option; object values (`source`, `adapter`, `history`, `store`, `storage`…) are properties.

- Properties can be set before or after the element is connected: they are kept, apply to the live component, and come back when the element is connected again.
- An attribute set later replaces a property of the same option, and the other way round.
- A removed attribute sets its option back to the default.
- Options read only when the component is created (`ctx`, the editor's `autosave` and `guard-unload`, every option of `<mmdx-studio>`) warn once in the console when changed on a live one; the next component created uses the new value.

```ts
const viewer = document.querySelector('mmdx-viewer')!;
viewer.source = 'flowchart LR\n  a --> b';       // a property
viewer.setAttribute('theme', 'github-light');     // an attribute
viewer.removeAttribute('theme');                  // back to the default theme
```

::: tip Set properties on upgraded elements
A property set on an element before its entry was imported lands on the plain element and is not seen by the component. Import the entry first, or wait for `customElements.whenDefined('mmdx-viewer')` before setting properties on elements created earlier.
:::

### Moving and removing

Moving an element in the DOM (re-parenting, a framework reordering a list) keeps its component as it is: the editor keeps its document, undo history, selection and an open History. An element removed for good is destroyed a microtask later, unless it is connected again by then. An editor connected again after that starts from its last document.

### `element.instance`

`element.instance` is the component behind the element (`DiagramViewer`, `DiagramEditor`, `DiagramDiff`, `ThemeEditor` or `DiagramStudio`), and `null` while the element is not connected. Use it for what the element does not expose itself, such as `editor.instance.markSaved()` or `diff.instance.session`.

### `ctx`

`ctx` (a `Partial<CoreContext>`) gives a component its own core context instead of the shared one set with `configure()`. It is read when the component is created. The imperative classes take it as an option; `<mmdx-diff>` also has a `ctx` property. Most hosts never set it; see [Configuration](/guide/configuration).

## Imperative classes

Each element is also a class you mount on any element. The constructor takes the host element and the options (the same names as the element's properties, attributes in camelCase), creates a shadow root on the host and starts the component. Call `destroy()` when you are done: it stops its listeners and timers and removes what it added to the DOM.

```ts
import { DiagramViewer } from '@mmdx/studio/viewer';

const viewer = new DiagramViewer(hostElement, { source, controls: ['zoom', 'fullscreen'] });
viewer.set({ theme: 'dracula' }); // change options later
viewer.destroy();
```

| Class | Constructor | Changing options |
|---|---|---|
| `DiagramViewer` | `new DiagramViewer(host, options?: ViewerOptions)` | `set(patch)`; an option set to `undefined` goes back to its default |
| `DiagramEditor` | `new DiagramEditor(host, options?: EditorOptions)` | The setters (`adapter`, `history`, `readOnly`, `fileName`), `setSource()`, `setMode()`, `setUi()` |
| `DiagramDiff` | `new DiagramDiff(host, options?: DiffOptions)` | `set(patch)`, `compare()`, `setHistory()` |
| `ThemeEditor` | `new ThemeEditor(host, options?: ThemeEditorOptions)` | `set(patch)` (resolves with the id of the open theme) |
| `DiagramStudio` | `new DiagramStudio(host, options?: StudioOptions)` | Options are read when it is created |

`DiagramViewer`, `DiagramEditor` and `DiagramDiff` expose their view kernel as `core` (a `ViewCore`; `EditorCore` for the editor) for modules and advanced integrations; see [Architecture](/guide/architecture).

## Common attributes

The viewer, the editor and the diff share these attributes:

| Attribute | Values | Default | Meaning |
|---|---|---|---|
| `theme` | a theme id | Default Light / Default Dark | The diagram theme. Without it, the theme follows the chrome (Default Light, Default Dark). A theme the user picks in the theme menu wins while the page is open; a pick remembered from an earlier visit comes after the attribute. Diagrams do not carry a theme |
| `theme-dark` | a theme id, or `auto` | — | The theme used while the chrome is dark; `auto` picks the dark theme linked to `theme` (its `counterpart`) |
| `ui` | `light`, `dark`, `auto` | `auto` | The chrome's colour scheme; `auto` follows the user's remembered choice (the light / dark toggle), else the page (`data-theme` or `data-ui` on `<html>`), else the OS |
| `compact` | `true`, `false`, `auto` | `auto` | The compact chrome: the same pieces, smaller and icon-only. `auto` turns it on for small hosts |

`<mmdx-theme-editor>` has `ui` too; its `theme` attribute is the theme being edited. `<mmdx-studio>` keeps the user's light / dark choice itself. See [Themes](/guide/themes) and [Styling](/guide/styling).

## Events

Every component reports what happens through DOM events:

- Names start with `mmdx-` (`mmdx-render`, `mmdx-change`, `mmdx-theme-saved`, `mmdx-history-open`…).
- Each is a `CustomEvent` dispatched on the element (or on the host of an imperative class), with `bubbles: true` and `composed: true`, so it crosses shadow roots and can be handled further up the page.
- The `detail` carries the data; the types are `ViewerEventMap`, `DiffEventMap` and `ThemeEditorEventMap`.
- Some are cancelable: `preventDefault()` stops what would happen next. `mmdx-link` (open a link: route it yourself), `mmdx-fullscreen-request`, `mmdx-save` (save yourself), `mmdx-op` (veto an edit), `mmdx-export` (upload instead of downloading), `mmdx-theme-save`, `mmdx-history-export` and `mmdx-history-restore`.

```ts
viewer.addEventListener('mmdx-link', (e) => {
  e.preventDefault();
  router.push(e.detail.href);
});
```

Every event of every component is listed in [Events](/api/events).

## Keyboard shortcuts

Shortcuts belong to the component: each one handles key presses from inside its own shadow root only, so they work while the focus is in the component and never take keys from the page or from another component. One table per component drives the key handling, the `?` help popup and the accessibility hints, so the help always lists what works right now (in the current mode, and while History shows a version or a comparison). Letter keys are ignored while you type in a text field; `mod` is ⌘ on macOS and Ctrl on Windows and Linux. Esc goes back one level at a time: it stops a gesture or a tool, closes a popup, clears a selection, then leaves a group or History.

## See also

- [Getting started](/guide/getting-started)
- [Frameworks](/guide/frameworks) and the [React wrappers](/api/react)
- [Embedding in sandboxed iframes](/guide/sandboxed-iframes)
- [Events](/api/events)
- [Playgrounds](/components/playgrounds)
