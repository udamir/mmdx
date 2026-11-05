# Browser support and limits

What the components need from the browser and from Node, how they degrade where a feature is missing, and the known limitations of this version.

## Browsers

Current Chrome, Edge and Firefox, and Safari 16.4 or newer. The components need ES2022, custom elements and constructable stylesheets.

| Environment | Supported |
|---|---|
| Chrome, Edge, Firefox | Current versions |
| Safari (macOS, iOS) | 16.4 or newer |
| Node (`@mmdx/studio/core`, `@mmdx/studio/markdown`) | 18 or newer |
| Workers | `@mmdx/studio/core` runs in workers |

The package is ESM only and has no runtime dependencies; `mermaid` (≥ 10) is an optional peer dependency, loaded lazily for diagram types mmdx does not draw.

## Graceful degradation

| Missing | What happens |
|---|---|
| Module workers (CSP without `worker-src`, `file://`, sandboxed iframes) | Diagrams over 300 lines render on the main thread; `useInlineWorker()` starts the worker from a `blob:` URL where URL workers fail |
| `IntersectionObserver` | Viewers render at once instead of when scrolled near |
| `adoptedStyleSheets` | Styles go into `<style>` elements in the shadow root |
| `localStorage` (private mode, sandboxed iframes, quota errors) | UI preferences are kept in memory |
| The Fullscreen API (`allowfullscreen` missing) | The viewer's full-screen button shows only with a host [`fullscreen`](/guide/sandboxed-iframes#full-screen) handler |
| `mermaid` not installed | Diagram types mmdx does not draw show an error card with their source (`fallback="source"` shows the source only) |
| JavaScript | Server-rendered SVG inside `<mmdx-viewer>` stays readable and printable (see [SSR](/guide/ssr)) |

## Accessibility

- Each viewer has an accessible name generated from the diagram ("Flowchart: 12 nodes, 14 connections"), or the one given in `label`; the diff's name carries the change counts.
- Toolbars, menus and lists use roving focus and can be driven by the keyboard; every component lists its shortcuts under `?`.
- The viewer's code view (`controls="code"`) is a text alternative: the diagram's Mermaid code, readable by screen readers.
- Colour is never the only signal in the diff: removed items are dashed, badges carry `+ − C L S`, and text changes are struck out or bold.
- Animations stop under `prefers-reduced-motion: reduce`.

## Known limitations

- The Mermaid parsers cover the commonly used subset of flowchart, sequence and ER syntax and the whole mindmap and state diagram syntax; other diagram types fall back to stock Mermaid.
- Connectors are routed between ports (curved, orthogonal or straight) through optional bend points; there is no obstacle avoidance.
- A sequence diagram's layout follows its message order; metadata can shift participants and add vertical space.
- PNG export uses fonts installed locally unless they are registered with `configure({ fonts })`.
- The diff draws flowchart, sequence, ER, mindmap and state diagrams; for other types (and a change of diagram type) it shows the code diff. It runs on the main thread, also for large diagrams, and it never writes history: the studio keeps the versions you save in browser storage, and hosts provide history through an adapter.
- Text measured on the server (`createStaticMeasurer`) is an estimate; the browser re-renders with real font metrics.

## Limits

A diagram's Mermaid code may be up to 1 048 576 characters and 5 000 items, and a render in the worker may take up to 2 s. See [Security](/guide/security#limits).
