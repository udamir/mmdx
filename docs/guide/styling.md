# Styling

The components render in shadow DOM and need no global CSS. Restyle their chrome — toolbars, panels, menus, the zoom bar — with CSS custom properties on the element and with `::part()`. The diagrams themselves are styled by [themes](/guide/themes), not by CSS.

```css
mmdx-editor {
  --mmdx-font: Inter, system-ui, sans-serif;
  --mmdx-accent: #0b7285;
  --mmdx-radius: 6px;
}
mmdx-viewer::part(canvas) { background: transparent; }
```

## Light, dark and auto

Every element has a light and a dark chrome. The `ui` attribute picks it:

| `ui` | Chrome |
|---|---|
| `light`, `dark` | That scheme, whatever the user chose before; the toggle (when shown) still switches it for the session |
| `auto` (default) | The user's toggle when they used it (remembered per component kind), else the page |

With `auto`, the page's scheme is `data-theme="dark|light"` on `<html>` (or `data-ui`), else the OS preference (`prefers-color-scheme`). The components follow changes of both as they happen. A docs site whose dark mode is a class on `<html>` can mirror it into `data-theme`:

```ts
const sync = () => (document.documentElement.dataset.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light');
new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
sync();
```

The resolved scheme is reflected on the element as `data-ui="light|dark"`, so host CSS can target it. `mmdx-ui` `{ ui }` fires when the user toggles it. The light / dark scheme of the chrome is independent of the diagram's theme; with `theme-dark`, the diagram follows it too (see [Themes](/guide/themes#light-and-dark-pairs)).

When the host owns the scheme, set `ui` explicitly and hide the toggle: `scheme-toggle="false"` on the viewer, `features = { schemeToggle: false }` on the editor.

## Compact

`compact` switches the chrome to a smaller, icon-only variant. It is on every element:

| `compact` | Meaning |
|---|---|
| `auto` (default) | Compact while the element is narrower than 560 px or lower than 360 px |
| `true` (or the bare attribute) | Always compact |
| `false` | Never compact |

```html
<mmdx-viewer compact src="/thumb.mmdx" controls="zoom" interactive="false"></mmdx-viewer>
```

## Tokens

Every colour, font, radius and shadow of the chrome is a `--mmdx-*` custom property with a light and a dark value. Set a token on the element (or any ancestor) to override it:

| Token | Light default | Use |
|---|---|---|
| `--mmdx-font` | `Inter, 'Segoe UI', system-ui, -apple-system, sans-serif` | UI font |
| `--mmdx-mono` | `'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace` | Code font |
| `--mmdx-accent` | `#4f46e5` | Accent: active tools, primary buttons, focus ring |
| `--mmdx-accent-2` | `#eef0ff` | Accent tint: selected and hovered items |
| `--mmdx-on-accent`, `--mmdx-on-danger` | `#fff` | Text on accent and danger backgrounds |
| `--mmdx-bg` | `#eef0f3` | Canvas background behind the page |
| `--mmdx-surface`, `--mmdx-surface-2` | `#ffffff`, `#f2f3f7` | Buttons, inputs, menus; secondary surfaces |
| `--mmdx-panel` | `#ffffff` | Side panels |
| `--mmdx-float`, `--mmdx-float-2`, `--mmdx-float-line` | `#ffffff`, `#f2f3f7`, `rgba(0,0,0,.06)` | Floating bars (tool dock, zoom bar) and their outline |
| `--mmdx-border`, `--mmdx-border-2` | `#dde1e7`, `#eceef2` | Borders and separators |
| `--mmdx-text`, `--mmdx-text-2` | `#1d2330`, `#3a4152` | Text |
| `--mmdx-muted`, `--mmdx-faint` | `#6b7385`, `#b0b6c3` | Secondary and disabled text |
| `--mmdx-dots` | `#cfd4dc` | Canvas grid dots |
| `--mmdx-danger`, `--mmdx-danger-bg` | `#c62828`, `#fdecec` | Errors and destructive actions |
| `--mmdx-warn`, `--mmdx-warn-bg`, `--mmdx-warn-line` | `#8a5a00`, `#fff7e6`, `#ffe2a8` | Warnings |
| `--mmdx-ok` | `#1d8a3c` | Success |
| `--mmdx-radius`, `--mmdx-radius-sm` | `8px`, `6px` | Corner radii |
| `--mmdx-shadow`, `--mmdx-shadow-lg` | | Shadows of bars and popovers |
| `--mmdx-shadow-float`, `--mmdx-shadow-card`, `--mmdx-shadow-raised` | | Shadows of floating bars, cards and raised controls |
| `--mmdx-swatch-ring`, `--mmdx-backdrop` | | Colour swatch outline; dialog backdrop |
| `--mmdx-z-popover` | `1000` | Stacking of popovers and menus |
| `--mmdx-focus` | `0 0 0 2px var(--mmdx-accent)` | Focus ring (a box shadow) |

The dark values live in `src/ui/kit/base.ts`. A token set on the element applies to both schemes; to set a value for one scheme only, target the resolved scheme:

```css
mmdx-viewer { --mmdx-accent: #0b7285; }
mmdx-viewer[data-ui='dark'] { --mmdx-accent: #66d9e8; }
```

### Code colours

Components that show code (the editor's code panel, the viewer's code view, the diff's code diff) colour Mermaid and metadata tokens with `--mmdx-code-*` tokens, light and dark: `--mmdx-code-kw` (keywords), `--mmdx-code-arrow` (arrows and cardinalities), `--mmdx-code-str` (strings), `--mmdx-code-label` (labels), `--mmdx-code-text`, `--mmdx-code-cls` (classes), `--mmdx-code-dir` (directions and positions), `--mmdx-code-key` (metadata keys), `--mmdx-code-punct`, `--mmdx-code-comment`, `--mmdx-code-meta` (the `%%@` lines) and `--mmdx-code-fold`.

### Diff colours

The diff's highlight colours are tokens too, with light and dark values:

| Token | Light default | Marks |
|---|---|---|
| `--mmdx-diff-add`, `--mmdx-diff-add-bg` | `#1a7f37`, `#dafbe1` | Added items |
| `--mmdx-diff-del`, `--mmdx-diff-del-bg` | `#cf222e`, `#ffebe9` | Removed items |
| `--mmdx-diff-content`, `--mmdx-diff-content-bg` | `#b35900`, `#fff1e0` | Content changes |
| `--mmdx-diff-layout`, `--mmdx-diff-layout-bg` | `#0969da`, `#ddf4ff` | Layout changes |
| `--mmdx-diff-style`, `--mmdx-diff-style-bg` | `#8250df`, `#fbefff` | Style changes |
| `--mmdx-diff-run-ins`, `--mmdx-diff-run-del` | `#aff5b4`, `#ffd2cf` | Inserted and deleted words |
| `--mmdx-diff-dim` | `.28` | Opacity of unchanged items while Dim is on |
| `--mmdx-diff-tip`, `--mmdx-diff-tip-ink` | `#1d2330`, `#fff` | Tooltips over changes |

They apply to `<mmdx-diff>` and to History in the editor and the viewer. Colour is never the only signal: removed items are dashed, badges carry an icon per kind of change (plus, minus, a pen for content, arrows for layout, a brush for style), and text changes are struck out or bold. Exported diff SVGs (`renderDiffToSvg`, `scheme: 'light' | 'dark'`) use the same colours, from `DIFF_COLORS` in `@mmdx/studio/core`.

## Parts

Parts expose elements inside the shadow root to `::part()`:

| Part | Element |
|---|---|
| `canvas` | The diagram canvas (the SVG of the viewer and the editor, the stage of the diff) |
| `toolbar` | Toolbars: the tool dock, the editor's floating style toolbar, the studio's top bar |
| `zoom-bar` | The zoom bar, bottom right |
| `panel` | Side panels and panel stacks (code, properties, layers, the diff's panels), the theme editor's dialog |
| `code` | The code view inside a panel |
| `diff-bar` | The diff's bottom bar: views, filters, Dim, the change list toggle |
| `change-list` | The diff's list of changes |
| `history` | The version panel (together with `panel`) |

```css
/* a borderless canvas on a docs page */
mmdx-viewer::part(canvas) { background: transparent; }

/* a quieter diff bar */
mmdx-diff::part(diff-bar) { box-shadow: none; border: 1px solid var(--mmdx-border); }
```

## Size

The viewer sizes itself: with `fit="width"` (the default) it takes the width of its container and a height that follows the diagram's aspect ratio, reserved before it renders, so the page does not jump. `fit="contain"` fits the diagram into a box you size, `fit="none"` shows it at its natural size. The editor, the diff, the theme editor and the studio fill their box: give them a height.

```css
mmdx-editor { display: block; height: 640px; }
mmdx-diff { display: block; height: 72vh; }
```
