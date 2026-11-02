---
layout: home

hero:
  name: Mermaid Studio
  text: Mermaid you can lay out by hand
  tagline: Visual editor, viewer, theme editor and visual diff for Mermaid diagrams, as framework-agnostic web components. Mermaid stays the source of truth — layout and styling live in comment lines every Mermaid renderer ignores.
  image:
    light: /logo.svg
    dark: /logo-dark.svg
    alt: Mermaid Studio
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Open the studio
      link: /studio/
      target: _self
    - theme: alt
      text: Components
      link: /components/

features:
  - icon: ✏️
    title: Two-way visual editing
    details: Drag boxes, route connectors, pick colours and presets for flowcharts, sequence and ER diagrams. Every canvas edit is written back to the Mermaid code, and code edits update the canvas live.
    link: /components/editor
    linkText: <mmdx-editor>
  - icon: 🔍
    title: A viewer for documentation
    details: Pan, zoom, layers, full screen, export, lazy rendering, a code view and an accessible text outline — plus server-side rendering to SVG and Markdown plugins.
    link: /components/viewer
    linkText: <mmdx-viewer>
  - icon: 🔀
    title: Visual diff and history
    details: See how a diagram changed item by item — Before, Merged and After on one animated canvas, or side by side — with filters for content, layout and style changes. Reports and SVGs for CI bots.
    link: /components/diff
    linkText: <mmdx-diff>
  - icon: 🎨
    title: Themes
    details: Palette-based theme files with per-type styles and presets, light / dark pairs, and a theme editor with live previews and contrast checks. Diagrams follow theme switches.
    link: /guide/themes
    linkText: Themes
  - icon: 🧩
    title: Framework-agnostic
    details: Custom elements in shadow DOM for plain HTML, React, Vue, Angular or Svelte, imperative classes where custom elements are not allowed, and a DOM-free core for Node and workers.
    link: /guide/frameworks
    linkText: Frameworks
  - icon: 🔒
    title: Secure by default
    details: Diagram text and theme files are untrusted input — no innerHTML, a link policy, size limits and a strict CSP. Hooks for sandboxed iframes.
    link: /guide/security
    linkText: Security
---

<div class="home-demo">

## Try it

The diagram below is a live `<mmdx-viewer>` with its version history: pan and zoom, open the layers, draw with the pen, or press the History button to compare versions.

<MmdxDemo example="production-microservices" history controls="zoom layers pen code history export theme fullscreen" />

```mmdx
flowchart LR
  a[Start] --> b{Check} --> c[Done]
%%@ node a {"x":40,"y":60,"w":120,"h":56}
```

A `.mmdx` file is plain Mermaid followed by `%%@` lines that hold positions and looks. GitHub, GitLab and every stock Mermaid renderer still draw it; Mermaid Studio draws it exactly as you arranged it. Read [the format](/guide/mmdx-format), or open the [studio](/studio/){target="_self"} to edit the examples.

</div>
