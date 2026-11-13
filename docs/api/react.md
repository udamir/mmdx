# mmdx/react

Optional React wrappers for React 18 and older, which pass every prop to a custom element as an attribute and do not listen to custom events. The wrappers set object values as properties and wire `onMmdx…` props to the `mmdx-*` events. They hold no logic and have no React dependency: you pass your React in. React 19 handles properties and custom events natively, so there the elements can be used directly (see [React 19](#react-19)).

```tsx
import React from 'react';
import 'mmdx/viewer';
import { createReactWrappers } from 'mmdx/react';

const { MmdxViewer } = createReactWrappers(React); // also MmdxEditor, MmdxThemeEditor, MmdxStudio, MmdxDiff

<MmdxViewer source={source} controls="zoom fullscreen" onMmdxRender={(e) => console.log(e.detail)} />;
```

::: warning Import the element entries
`mmdx/react` does not define any element. Import the entry of each element you render (`mmdx/viewer`, `mmdx/editor`, `mmdx/diff`, …; see [Entry points](/api/)) before the components mount, so that properties land on the defined element.
:::

## Functions

### `createReactWrappers()`

```ts
function createReactWrappers(React: ReactLike): MmdxReactComponents;

interface ReactLike {
  createElement(type: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
  forwardRef<P>(render: (props: P, ref: unknown) => unknown): unknown;
  useRef<T>(v: T | null): { current: T | null };
  useLayoutEffect(f: () => void | (() => void), deps?: unknown[]): void;
  useImperativeHandle(ref: unknown, init: () => unknown, deps?: unknown[]): void;
}
```

Builds one component per element from the React you pass (`createElement`, `forwardRef`, `useRef`, `useLayoutEffect` and `useImperativeHandle` are all it uses). Call it once, at module level, and export the components you need.

## Types

### `MmdxReactComponents`

```ts
interface MmdxReactComponents {
  MmdxViewer: unknown;
  MmdxEditor: unknown;
  MmdxThemeEditor: unknown;
  MmdxStudio: unknown;
  MmdxDiff: unknown;
}
```

| Component | Element | Element entry | Attributes, properties and events |
| --- | --- | --- | --- |
| `MmdxViewer` | `<mmdx-viewer>` | `mmdx/viewer` | [Viewer](/components/viewer) |
| `MmdxEditor` | `<mmdx-editor>` | `mmdx/editor` | [Editor](/components/editor) |
| `MmdxThemeEditor` | `<mmdx-theme-editor>` | `mmdx/theme-editor` | [Theme editor](/components/theme-editor) |
| `MmdxStudio` | `<mmdx-studio>` | `mmdx/studio` | [Studio](/components/studio) |
| `MmdxDiff` | `<mmdx-diff>` | `mmdx/diff` | [Diff](/components/diff) |

The components accept the element's attributes, properties and events as props (see [Props](#props)); the package declares no per-component prop types, and each component is typed `unknown`. In TypeScript, cast the result once to a React component type. With `@types/react` 19, the `React` argument also needs a cast, because its `forwardRef` signature does not match `ReactLike`:

```tsx
// mmdx-react.ts
import * as React from 'react';
import 'mmdx/viewer';
import 'mmdx/editor';
import 'mmdx/diff';
import { createReactWrappers, type MmdxReactComponents } from 'mmdx/react';

type MmdxProps = Record<string, unknown> & { children?: React.ReactNode };
type MmdxComponent = React.ForwardRefExoticComponent<MmdxProps & React.RefAttributes<HTMLElement>>;

export const { MmdxViewer, MmdxEditor, MmdxDiff } = createReactWrappers(React as never) as unknown as Record<keyof MmdxReactComponents, MmdxComponent>;
```

## Props

### Properties

A prop is set as a property of the element when the element has a property of that name: every property with a setter on the element's class (`source`, `adapter`, `storage`, `history`, `images`, `fullscreen`, …; see its component page), so a property added to an element needs no change of the wrapper. Before the element is defined, every object or function value is set as a property. The wrapper assigns them after every render, in a layout effect, and only when the value differs (`!==`) from the element's current one, so pass stable objects (`useMemo`, module constants) for adapters and stores. A property prop left out of a later render is reset to `undefined`.

### Attributes

Every other prop becomes an attribute, with its name converted from camelCase to kebab-case: `themeDark` → `theme-dark`, `hoverHighlight` → `hover-highlight`, `guardUnload` → `guard-unload`. Kebab-case names (`theme-dark`, `aria-label`, `data-*`) pass unchanged, and React's names of standard attributes are mapped (`className` → `class`, `htmlFor` → `for`, `tabIndex` → `tabindex`). `true` sets an empty attribute, `false` leaves it out, and other values are passed to React as they are. `style` stays an object, as for any React element.

### Events

A prop named `onMmdx` followed by a capital letter, with a function value, becomes an event listener. The name after `on` is converted to kebab-case: `onMmdxChange` → `mmdx-change`, `onMmdxThemeSaved` → `mmdx-theme-saved`, `onMmdxFullscreenRequest` → `mmdx-fullscreen-request`. The listener receives the `CustomEvent`; its `detail` is listed under [Events](/api/events). One listener per event type calls the handler of the latest render, so inline functions are fine; listeners are added and removed only when the set of `onMmdx…` props changes, and on unmount.

### Refs and children

Each component forwards its `ref` to the element itself (an `HTMLElement`), for the element's methods and for setting properties yourself. `children` are passed to the element unchanged, for example an inline `<script type="text/mermaid">` for the viewer.

```tsx
const viewer = useRef<HTMLElement>(null);

useEffect(() => {
  const el = viewer.current as (HTMLElement & { fullscreen?: unknown }) | null;
  if (el) el.fullscreen = { available: () => true, enter: () => host.enterFullscreen(), exit: () => host.exitFullscreen() };
}, []);

<MmdxViewer ref={viewer} source={source} controls="zoom fullscreen" />;
```

## Examples

### Viewer

```tsx
import { MmdxViewer } from './mmdx-react';

export function Diagram({ source }: { source: string }) {
  return (
    <MmdxViewer
      source={source}
      themeDark="auto"
      controls="zoom fullscreen"
      onMmdxRender={(e: CustomEvent) => console.log('rendered', e.detail.type)}
      onMmdxError={(e: CustomEvent) => console.warn(e.detail.diagnostics)}
    />
  );
}
```

### Editor

```tsx
import { useMemo } from 'react';
import { httpDocumentAdapter } from 'mmdx/adapters';
import { MmdxEditor } from './mmdx-react';

export function DiagramEditor({ url }: { url: string }) {
  const adapter = useMemo(() => httpDocumentAdapter(url), [url]);
  return (
    <MmdxEditor
      adapter={adapter}
      style={{ height: 600 }}
      onMmdxChange={(e: CustomEvent) => console.log(e.detail.source, e.detail.reason)}
      onMmdxSaved={(e: CustomEvent) => console.log('saved', e.detail.version)}
    />
  );
}
```

### Diff

```tsx
import { MmdxDiff } from './mmdx-react';

export function DiagramDiff({ before, after }: { before: string; after: string }) {
  return <MmdxDiff beforeSource={before} afterSource={after} style={{ height: 600 }} />;
}
```

## React 19

### Elements in JSX

React 19 sets a prop as a property when the element has a property of that name, as an attribute otherwise, and listens to a custom event for a function prop named `on` plus the event name. Use the elements directly, with the same rule about importing the element entries first:

```tsx
import 'mmdx/viewer';

export function Diagram({ source }: { source: string }) {
  return (
    <mmdx-viewer
      source={source}
      theme-dark="auto"
      controls="zoom fullscreen"
      onmmdx-render={(e: CustomEvent) => console.log(e.detail)}
    />
  );
}
```

### TypeScript

The package does not declare the elements in `JSX.IntrinsicElements`. Add a declaration to your project, loose or as strict as you like:

```ts
// mmdx-jsx.d.ts
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type MmdxElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { [prop: string]: unknown };

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'mmdx-viewer': MmdxElementProps;
      'mmdx-editor': MmdxElementProps;
      'mmdx-diff': MmdxElementProps;
      'mmdx-theme-editor': MmdxElementProps;
      'mmdx-studio': MmdxElementProps;
    }
  }
}
```

The element classes (`MmdxViewerElement` from `mmdx/viewer`, and the others from their entries) are registered in `HTMLElementTagNameMap`, so `document.querySelector('mmdx-viewer')` and `document.createElement('mmdx-viewer')` are typed.
