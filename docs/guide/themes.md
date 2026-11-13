# Themes

A theme is a JSON file with a colour palette, the default style of every item type, named presets and page settings. Diagrams refer to the palette by name, so the same diagram restyles itself when the theme changes, and light and dark themes are linked so a diagram follows the page's light / dark mode.

## A theme file

Only the base theme (Default Light) defines everything; other themes `extend` it and store only what they change:

```json
{
  "id": "ocean",
  "name": "Ocean",
  "extends": "default-light",
  "appearance": "light",
  "counterpart": "ocean-dark",
  "palette": { "sky": "#cfe8ff", "ink": "#0b2545" },
  "flowchart": { "node": { "radius": 12 }, "nodePresets": { "core": { "fill": "@sky" } } }
}
```

| Theme key | Holds |
|---|---|
| `id`, `name`, `extends` | Identity and the theme it builds on (`default-light` when omitted) |
| `appearance`, `counterpart` | `light` or `dark`, and the linked theme of the other appearance |
| `palette`, `font` | Named colours (`"sky": "#cfe8ff"`, referenced as `@sky`) and the font stack |
| `canvas` | Page padding, background, grid and border |
| `flowchart` | `node`, `group`, `edge`, their `…Presets`, `nodeShapes` (per-shape defaults) and `pagePresets` |
| `sequence` | `participant`, `message`, `note`, `block`, `box`, `lifeline`, `activation`, their `…Presets`, `participantShapes`, `layout` and `pagePresets` |
| `er` | `entity`, `rel`, their `…Presets` and `pagePresets` |
| `mindmap` | `root`, `node` and `nodePresets`, `nodeShapes`, `branch`, `sections` (the section colours) and `pagePresets` |
| `state` | `node`, `composite`, `transition`, `note`, their `…Presets`, `start`, `end`, `choice`, `fork`, `nodeShapes`, `compositeColors` and `pagePresets` |

The [theme file reference](/api/theme-file) lists every key.

## Extends

A theme names the theme it builds on in `extends` (`default-light` when omitted). Its values are merged over that theme's, section by section, so a theme that only changes a few colours and a radius is a few lines long. A component that loads a theme whose base it does not have loads the base too (see [Theme sources](#theme-sources)).

## Palette references

Colours in themes and diagrams are usually references to the palette, not literal colours:

| Value | Meaning |
|---|---|
| `"#d4e63a"` | A literal colour — the same in every theme |
| `"@sky"` | The palette colour `sky` — each theme has its own |
| `"@sand~=349.3,+53.5,-5.7"`, `"@lime~+12,-5,+8"` | A palette colour shifted by hue, saturation and lightness; the same shift is applied to every theme's colour of that name (`=` sets the hue instead of shifting it, for greys) |

When a user picks a colour in the editor, it is stored as the nearest palette colour plus a shift, so it follows theme switches too. A name the theme does not have falls back to the base theme's palette. A diagram can add its own palette colours (`%%@ style.palette <name> {"color":"#…"}`).

`@mmdx/studio/core` exposes the same resolution: `resolveColor(value, palette)` and `relativeColor(hex, palette)`.

## Light and dark pairs

Every theme has an `appearance` (`light` or `dark`) and names the linked theme of the other appearance in `counterpart`. When a component's chrome is dark and its `theme-dark` is `auto`, it shows the counterpart of its `theme`. A theme without a usable link falls back to the house pair, Default Light and Default Dark.

```html
<!-- GitHub Light on a light page, GitHub Dark on a dark one -->
<mmdx-viewer src="/arch.mmdx" theme="github-light" theme-dark="auto"></mmdx-viewer>

<!-- a fixed dark theme while the chrome is dark -->
<mmdx-viewer src="/arch.mmdx" theme="github-light" theme-dark="dracula"></mmdx-viewer>
```

## Built-in themes

| Light | Dark |
|---|---|
| Default Light (`default-light`) | Default Dark (`default-dark`) |
| GitHub Light (`github-light`) | GitHub Dark (`github-dark`) |
| Catppuccin Latte (`catppuccin-latte`) | Catppuccin Mocha (`catppuccin-mocha`) |
| Rosé Pine Dawn (`rose-pine-dawn`) | Dracula (`dracula`) |

Default Light and Default Dark are bundled: Default Light is part of every component, Default Dark loads as a chunk of the library on first use. The others are files in `@mmdx/studio/themes/*` (`github-light.theme.json`, …, with a manifest `index.json`); load them through a [theme source](#theme-sources) or [register](#registering-themes) them. The ids `studio`, `baseline` and `studio-dark` of earlier versions are still accepted.

The `theme` control adds the light / dark toggle and the theme menu to a viewer; switch between the registered themes here (this page registers only the bundled pair):

<MmdxDemo example="microservice-patterns" controls="zoom theme" />

## How a component picks its theme

A diagram does not carry a theme: the theme belongs to the component that shows it. Each component resolves it in this order:

1. a theme the user picked in this component's theme menu during this session;
2. the host's `theme` attribute — and while the chrome is dark, `theme-dark` (`auto`: the counterpart of `theme`; a `theme` that is already dark stays);
3. the user's pick remembered in the component's storage, per component kind (`viewer.theme`, `editor.theme`, `diff.theme`);
4. Default Light or Default Dark, following the chrome's light / dark scheme.

The light / dark toggle only changes the chrome (see [`ui`](/guide/styling#light-dark-and-auto)); a picked theme stays. The first entry of the theme menu, **Follow light / dark**, drops the pick. Picking a theme never writes the document.

The viewer shows the theme menu with `controls="theme"`; the editor and the diff show it by default. Hosts that set `ui` themselves can hide the light / dark toggle and keep the menu: `scheme-toggle="false"` on the viewer, the `schemeToggle` feature on the editor.

## Theme sources

A component looks up a theme id in the shared registry. A built-in id loads on demand. Any other id is loaded through a `ThemeSource` — the component's `themeSource` property, else the one set with `configure({ themeSource })` — and registered; a theme that extends another unknown theme pulls that one in too. When no source has the theme, the diagram is drawn with Default Light and the component reports an info diagnostic (`theme.missing`).

```ts
import { configure } from '@mmdx/studio/viewer';
import { fetchThemeSource } from '@mmdx/studio/adapters';

// a manifest { "themes": ["default-light.theme.json", …] }, files resolved relative to it
configure({ themeSource: fetchThemeSource('/themes/index.json') });
```

To serve the built-in theme files, copy `node_modules/@mmdx/studio/themes/` to your site (the folder has an `index.json` manifest). A `ThemeSource` is `{ list(), get(id), subscribe?(cb) }`; write your own for any backend. `@mmdx/studio/adapters` has `fetchThemeSource(manifestUrl)`, `memoryThemeStore(themes)` and `localStorageThemeStore(storage, base?)`.

## Registering themes

`registerThemes(files)` registers theme files into the shared registry every component reads, with no fetch; the theme menus list them. It is exported by every element entry and returns the validation diagnostics. Import the files you want from `@mmdx/studio/themes/*`:

```ts
import { registerThemes } from '@mmdx/studio/viewer';
import { BUILTIN_THEMES } from '@mmdx/studio/core';
import github from '@mmdx/studio/themes/github-light.theme.json';
import githubDark from '@mmdx/studio/themes/github-dark.theme.json';

registerThemes([...BUILTIN_THEMES, github, githubDark]);
```

After `registerThemes(BUILTIN_THEMES)` the components load nothing for Default Light and Default Dark. `registerBuiltinThemes()` resolves once both are registered. A file with the id of a registered theme replaces it, and open components redraw. This is the way to go in [sandboxed iframes](/guide/sandboxed-iframes), where a `themeSource` that fetches does not work.

In Node, `renderToSvg` and the Markdown plugins use their own context; register extra themes there (see [Server-side rendering](/guide/ssr#themes)).

## Validation

Theme files are untrusted input. They are validated when loaded, registered or saved, and invalid values are dropped with a diagnostic; the rest of the file still applies. `validateTheme(file)` and `migrateTheme(file)` from `@mmdx/studio/core` run the same checks.

## The theme editor

`<mmdx-theme-editor>` edits the palette and every item type's style with live previews, checks text contrast, and imports and exports `.theme.json` files. It reads from a `ThemeSource` and saves through a `ThemeStore` (`list`, `get`, `save`, `delete?`, `publish?`, `usage?`, `listWithUsage?`):

```ts
import '@mmdx/studio/theme-editor';
import { fetchThemeSource, localStorageAdapter, localStorageThemeStore } from '@mmdx/studio/theme-editor';

const base = fetchThemeSource('/themes/index.json');  // read-only themes to start from
const te = document.querySelector('mmdx-theme-editor')!;
te.store = localStorageThemeStore(localStorageAdapter(), base); // or your own ThemeStore
te.source = base;
```

Saved themes are validated and registered in the shared registry, so open viewers and editors redraw with them. Try it on an in-memory store of the built-in themes:

<MmdxDemo kind="theme-editor" />

See [`<mmdx-theme-editor>`](/components/theme-editor) for its attributes and events.
