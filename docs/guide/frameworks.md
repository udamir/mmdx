# Frameworks

The components are custom elements in shadow DOM, so they work in any framework that renders custom elements. Two rules cover every framework: set object values as properties, and listen to the `mmdx-*` events.

## Plain HTML

Import the entry once; it registers the element. Importing it twice is safe.

```html
<script type="module">
  import '@mmdx/studio/viewer';

  const viewer = document.querySelector('#arch');
  viewer.addEventListener('mmdx-render', (e) => console.log(e.detail.type, e.detail.durationMs));
  viewer.addEventListener('mmdx-link', (e) => {
    e.preventDefault();          // route diagram links through your router
    router.push(e.detail.href);
  });
</script>

<mmdx-viewer id="arch" src="/diagrams/arch.mmdx" controls="zoom layers fullscreen"></mmdx-viewer>
```

A viewer reads its diagram from the `source` property, the `src` attribute, or an inline `<script type="text/mermaid">` (common indentation is removed). The editor reads an inline script too when it has no `value` and no `adapter`.

## Properties and attributes

Strings, numbers and booleans have attributes (`controls`, `theme`, `fit`, `read-only`, `autosave`…). Objects and functions are properties:

| Element | Properties |
|---|---|
| `<mmdx-viewer>` | `source`, `loader`, `layers`, `history`, `fullscreen`, `storage`, `themeSource` |
| `<mmdx-editor>` | `value`, `adapter`, `features`, `history`, `panels`, `storage`, `themeSource`, `modules`, `readOnly` |
| `<mmdx-diff>` | `beforeSource`, `afterSource`, `history`, `features`, `panels`, `loader`, `storage`, `themeSource`, `ctx`, `actions` |
| `<mmdx-theme-editor>` | `store`, `source`, `storage`, `samples`, `theme` |
| `<mmdx-studio>` | `storage` |

- Properties can be set before or after the element is connected: they are kept, apply to the live component, and come back when the element is connected again.
- An attribute set later replaces a property of the same option, and the other way round. A removed attribute sets its option back to the default.
- Options read only when the component is created (`ctx`, the editor's `autosave` and `guard-unload`) warn once when changed on a live one.
- Moving an element in the DOM (re-parenting, a framework reordering a list) keeps its component as it is — the editor keeps its document, undo history, selection and an open History. An element removed for good is destroyed a microtask later, and an editor connected again starts from its last document.
- `element.instance` is the component behind the element (`DiagramViewer`, `DiagramEditor`, …), `null` while it is not connected.

## Events

Every component reports through `CustomEvent`s named `mmdx-*`, bubbling and composed, with their data in `detail`. Some are cancelable — cancel them with `preventDefault()` to take over:

| Event | Cancel it to |
|---|---|
| `mmdx-link` (viewer) | Route a diagram link yourself |
| `mmdx-save` (editor) | Save yourself instead of through the adapter |
| `mmdx-export` (editor, diff) | Upload the export instead of downloading it |
| `mmdx-op` (editor) | Reject an edit |
| `mmdx-fullscreen-request` (viewer) | Handle full screen yourself |
| `mmdx-history-restore` (editor) | Restore a version yourself |
| `mmdx-theme-save` (theme editor) | Save a theme yourself |

The [events reference](/api/events) lists every event and its detail.

## React 19

React 19 sets properties on custom elements and listens to their events natively: a prop whose name is a property of the element is set as a property, others become attributes, and `on` + the event name adds a listener.

```tsx
import '@mmdx/studio/viewer';
import '@mmdx/studio/editor';
import { httpDocumentAdapter } from '@mmdx/studio/adapters';

const adapter = httpDocumentAdapter('/api/diagrams/arch.mmdx');

export function Diagram({ source }: { source: string }) {
  return <mmdx-viewer source={source} controls="zoom fullscreen" onmmdx-render={(e: CustomEvent) => console.log(e.detail)} />;
}

export function Editor({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  return <mmdx-editor adapter={adapter} guard-unload="true" style={{ height: 640 }} onmmdx-dirty={(e: CustomEvent) => onDirty(e.detail.dirty)} />;
}
```

Keep object props stable (module scope, `useMemo`, `useRef`): a new adapter object on every render is a new adapter. Declare the tags for TypeScript (see [TypeScript](#typescript)).

## React 18 and older

React 18 passes every prop as an attribute and does not listen to custom events. `@mmdx/studio/react` has wrappers that set object props as properties and turn `onMmdx*` props into listeners:

```tsx
import React from 'react';
import '@mmdx/studio/viewer';
import { createReactWrappers } from '@mmdx/studio/react';

const { MmdxViewer } = createReactWrappers(React); // also MmdxEditor, MmdxThemeEditor, MmdxStudio, MmdxDiff

<MmdxViewer source={source} controls="zoom fullscreen" onMmdxRender={(e) => console.log(e.detail)} />;
```

- `createReactWrappers(React)` takes your React, so the package has no React dependency. Import the element entries you use as well.
- `onMmdxChange` listens to `mmdx-change`, `onMmdxThemeSaved` to `mmdx-theme-saved`, and so on.
- `source`, `loader`, `layers`, `themeSource`, `storage`, `adapter`, `features`, `panels`, `value`, `readOnly`, `store`, `modules`, `history`, `beforeSource`, `afterSource`, `ctx`, `samples` and `actions` are set as properties. Other props are attributes, camelCase turned into kebab-case (`themeDark` → `theme-dark`, `guardUnload` → `guard-unload`); `true` is an empty attribute and `false` removes it.
- The ref is the element.

The wrappers are typed loosely (the fields of `MmdxReactComponents` are `unknown`); cast them to a component type of your own in TypeScript. See [`@mmdx/studio/react`](/api/react).

## Vue

Tell the Vue compiler that `mmdx-*` tags are custom elements, in the Vite plugin options:

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';

export default {
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('mmdx-') } } })],
};
```

Then bind properties with `.prop` and listen with `@`:

```vue
<script setup lang="ts">
import '@mmdx/studio/editor';
import { httpDocumentAdapter } from '@mmdx/studio/adapters';

const adapter = httpDocumentAdapter('/api/diagrams/arch.mmdx');
const dirty = defineModel<boolean>('dirty');
</script>

<template>
  <mmdx-editor :adapter.prop="adapter" theme-dark="auto" style="height: 640px" @mmdx-dirty="dirty = $event.detail.dirty" />
</template>
```

Vue sets a bound value as a property when the element has that property; `.prop` makes it explicit, which also works before the element is defined.

## Angular

Allow custom elements in the component (or module) with `CUSTOM_ELEMENTS_SCHEMA`, import the entry, and use property and event bindings:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, input } from '@angular/core';
import '@mmdx/studio/viewer';

@Component({
  selector: 'app-diagram',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<mmdx-viewer [source]="source()" controls="zoom fullscreen" (mmdx-render)="rendered($event)"></mmdx-viewer>`,
})
export class DiagramComponent {
  source = input.required<string>();
  rendered(e: Event) {
    console.log((e as CustomEvent).detail);
  }
}
```

`[source]` sets the property; `[attr.theme]` sets an attribute from a binding.

## Svelte

Svelte sets a prop as a property when the element has that property (import the entry before the component mounts), otherwise as an attribute. Listen to events through the element:

```svelte
<script>
  import { onMount } from 'svelte';
  import '@mmdx/studio/viewer';

  export let source;
  let viewer;

  onMount(() => {
    const onRender = (e) => console.log(e.detail);
    viewer.addEventListener('mmdx-render', onRender);
    return () => viewer.removeEventListener('mmdx-render', onRender);
  });
</script>

<mmdx-viewer bind:this={viewer} {source} controls="zoom fullscreen"></mmdx-viewer>
```

## Server-side rendering frameworks

Importing any entry in Node does not throw, so Next.js, Nuxt, SvelteKit, Angular SSR and Astro can import the entries in shared code; the tags are defined in the browser only. The server renders the empty element, and the browser draws the diagram. For a picture in the server HTML, pre-render it with [`diagramHtml` or `renderToSvg`](/guide/ssr).

## Without custom elements

Each element is also an imperative class you can mount on any element, for hosts where `customElements.define` is not allowed (or a framework wrapper you write yourself):

```ts
import { DiagramViewer } from '@mmdx/studio/viewer';

const viewer = new DiagramViewer(hostElement, { source, controls: ['zoom', 'fullscreen'] });
viewer.set({ theme: 'default-dark' }); // change options later
viewer.destroy();                      // when done
```

| Class | Entry |
|---|---|
| `DiagramViewer` | `@mmdx/studio/viewer` |
| `DiagramEditor` | `@mmdx/studio/editor` |
| `DiagramDiff` | `@mmdx/studio/diff` |
| `ThemeEditor` | `@mmdx/studio/theme-editor` |
| `DiagramStudio` | `@mmdx/studio` |

The constructors take the host element and the options object (`ViewerOptions`, `EditorOptions`, …): the same options as the element's attributes and properties, camelCase. Importing the entry still registers its tag; `defineViewer(name?)`, `defineEditor(name?)` and the other `define*` functions register a tag under another name.

## TypeScript

The element entries add their tags to `HTMLElementTagNameMap`, so `document.querySelector('mmdx-editor')` and `document.createElement('mmdx-viewer')` are typed as `MmdxEditorElement` and `MmdxViewerElement`, with their properties and methods.

The events are `CustomEvent`s that are not declared on `HTMLElementEventMap`, so a listener receives an `Event`. The entries export event maps to cast with — `ViewerEventMap` (`@mmdx/studio/viewer`), `DiffEventMap` (`@mmdx/studio/diff`), `ThemeEditorEventMap` (`@mmdx/studio/theme-editor`):

```ts
import type { ViewerEventMap } from '@mmdx/studio/viewer';

const viewer = document.querySelector('mmdx-viewer')!;
viewer.addEventListener('mmdx-render', (e) => {
  const { bounds, type, durationMs } = (e as ViewerEventMap['mmdx-render']).detail;
});
editor.addEventListener('mmdx-dirty', (e) => setUnsaved((e as CustomEvent<{ dirty: boolean }>).detail.dirty));
```

The examples in this guide leave the cast out for brevity.

For JSX (React 19 and other JSX setups), declare the tags you use:

```ts
// mmdx.d.ts
import type * as React from 'react';
import type { MmdxViewerElement } from '@mmdx/studio/viewer';
import type { MmdxEditorElement } from '@mmdx/studio/editor';

type Props<E> = Partial<Omit<E, keyof HTMLElement>> & React.HTMLAttributes<E> & { [attr: string]: unknown };

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'mmdx-viewer': Props<MmdxViewerElement>;
      'mmdx-editor': Props<MmdxEditorElement>;
    }
  }
}
```
