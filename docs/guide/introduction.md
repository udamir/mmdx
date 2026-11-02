# What is Mermaid Studio?

Mermaid Studio (`@mmdx/studio`, short mmdx) is a visual editor, viewer, theme editor and visual diff for Mermaid diagrams, shipped as framework-agnostic web components. Mermaid stays the source of truth: layout and styling live in comment lines that every Mermaid renderer ignores.

## Why it exists

Mermaid is great for keeping diagrams in docs and repos, but its auto-layout and styling are hard to control. Mermaid Studio lets you lay out and style a Mermaid diagram by hand — drag boxes, route connectors, pick colours and presets — and stores the result as `%%@` comment lines appended to the same Mermaid text. The file stays valid Mermaid: GitHub, GitLab, YouTrack, Notion or any stock Mermaid renderer still draws it (with its own layout), and Mermaid Studio draws it exactly as you arranged it.

## How it works

A diagram is a Mermaid text followed by metadata lines, one per placed or styled item:

```mmdx
flowchart LR
  a[Start] --> b{Check} --> c[Done]

%% ---- diagram-studio layout (safe to keep: Mermaid ignores %% comments) ----
%%@ canvas {"v":1,"routing":"orthogonal"}
%%@ node a {"x":80,"y":60,"w":120,"h":56}
%%@ node b {"x":260,"y":60,"w":130,"h":80,"fill":"@sky"}
%%@ edge b->c {"preset":"rest"}
```

- **Structure lives in Mermaid.** Nodes, edges, participants, messages, tables and relationships are always read from the Mermaid code. Editing on the canvas writes back to the code, and editing the code updates the canvas live.
- **Metadata holds only positions and looks.** Each `%%@ <kind> <id> <JSON>` line carries the position, size, preset and style overrides of one item. Items without a line are laid out automatically and keep their place once moved.
- **Themes are separate.** Colours are stored as references to a theme palette (`@sky`), so a diagram follows theme switches, and the theme belongs to the component that shows the diagram, not to the file.

The [`.mmdx` format](/guide/mmdx-format) page describes the lines in full.

## Features

- **Three diagram types, edited visually:** flowchart, sequence diagram and ER diagram. Other Mermaid types are shown with stock Mermaid.
- **Two-way editing:** everything you do on the canvas is written back to the Mermaid code, and code edits update the canvas live.
- **Canvas tools:** drag, resize, snap, align and distribute, groups (`subgraph` / `box`), connectors with magnet points and bend points, copy / paste / duplicate, copy style, z-order, layers, undo / redo, presenting pen.
- **Styling:** a floating toolbar and a Properties panel for fill, border, text, font, shape, stacking, arrows, line shape and more; named style presets from the theme or saved per diagram.
- **Themes:** separate theme files with a colour palette, per-type styles and presets. Light and dark themes are linked, so a diagram switches with the page. See [Themes](/guide/themes).
- **Viewer for documentation:** pan, zoom, layers, full screen, export, lazy rendering, a code view, an accessible name for screen readers, and [server-side rendering](/guide/ssr) to SVG.
- **Visual diff:** how a diagram changed between two versions, item by item — Before, Merged and After on one animated canvas, or side by side — with filters for content, layout and style changes. Available as `<mmdx-diff>` for reviews and as `renderDiffToSvg()` / `diffReport()` for [CI bots](/guide/ci).
- **History:** give the editor or the viewer a diagram's versions and their History panel lists them, shows any of them as it was and compares any of them with the current one. **Restore** brings an old version back as an undoable change. See [Version history](/guide/history).
- **Theme editor:** edit the palette and every item type's style with live previews, check text contrast, import and export `.theme.json` files.
- **Export:** `.mmdx` (Mermaid + layout), portable `.mmd` (`classDef` / `linkStyle` so stock renderers keep the colours), SVG and PNG.
- **Framework-agnostic:** custom elements in shadow DOM, usable from plain HTML, React, Vue, Angular or Svelte, plus imperative classes where custom elements are not allowed. See [Frameworks](/guide/frameworks).
- **Secure by default:** diagram text and theme files are treated as untrusted input; no `innerHTML`, a link policy, size limits and a strict CSP are supported. See [Security](/guide/security).

## Try it

A live `<mmdx-viewer>` with the example's version history — pan, zoom, open the layers or the History:

<MmdxDemo example="fusion-services" history controls="zoom layers code history export theme fullscreen" />

## The five components

| Element | Class | What it is |
|---|---|---|
| [`<mmdx-viewer>`](/components/viewer) | `DiagramViewer` | Read-only diagrams for docs and portals: pan, zoom, layers, pen, code view, History, export |
| [`<mmdx-editor>`](/components/editor) | `DiagramEditor` | The visual editor with the code panel, Properties, Layers, History and saving through an adapter |
| [`<mmdx-diff>`](/components/diff) | `DiagramDiff` | How a diagram changed between two versions, and its version history |
| [`<mmdx-theme-editor>`](/components/theme-editor) | `ThemeEditor` | Manage diagram themes: palette, styles, presets, contrast checks, import and export |
| [`<mmdx-studio>`](/components/studio) | `DiagramStudio` | The complete standalone app — editor, examples, file open and theme editor |

Each element is also an imperative class you can mount on any element, for hosts where `customElements.define` is not allowed. The [components overview](/components/) compares them.

## Entry points at a glance

| Import | Provides |
|---|---|
| `@mmdx/studio/viewer` | `<mmdx-viewer>` and `DiagramViewer` |
| `@mmdx/studio/editor` | `<mmdx-editor>` and `DiagramEditor`, document adapters |
| `@mmdx/studio/theme-editor` | `<mmdx-theme-editor>` and `ThemeEditor`, theme sources and stores |
| `@mmdx/studio/diff` | `<mmdx-diff>` and `DiagramDiff`, history adapters |
| `@mmdx/studio` | `<mmdx-studio>` and `DiagramStudio` (also `@mmdx/studio/studio`) |
| `@mmdx/studio/core` | Pure API without DOM: parse, render to SVG, metadata, themes, diffs and diff reports (Node, workers, browsers) |
| `@mmdx/studio/adapters` | Storage, theme sources and stores, document adapters, history adapters, share links |
| `@mmdx/studio/markdown` | rehype and markdown-it plugins that turn ` ```mermaid ` blocks into viewers |
| `@mmdx/studio/react` | Optional wrappers for React ≤ 18 |
| `@mmdx/studio/worker-inline` | The render worker as a string, for pages that cannot start workers from URLs |
| `@mmdx/studio/themes/*` | The built-in theme files (`default-light.theme.json`, …) |

The [API reference](/api/) lists every export.

## Where to go next

- [Getting started](/guide/getting-started) — install the package and put a viewer, an editor or a diff on a page.
- [The `.mmdx` format](/guide/mmdx-format) — what the `%%@` lines hold.
- [Components](/components/) — every attribute, property, event and method.
- The [studio](/studio/){target="_self"} — the full app with the shipped examples.
