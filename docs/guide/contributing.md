# Contributing

Pull requests are welcome. This page covers the development setup, the commands, the repository layout, tests and size budgets, and what to check before opening a pull request.

## Setup

The repository uses pnpm; `corepack enable` picks the version pinned in `package.json`:

```bash
git clone https://github.com/udamir/mmdx.git
cd mmdx
corepack enable
pnpm install
```

## Commands

```bash
pnpm dev              # the studio and one demo page per component at http://localhost:8790
pnpm storybook        # every component and feature as stories at http://localhost:6006
pnpm docs:dev         # this documentation portal at http://localhost:8791/mmdx/
pnpm test             # unit, geometry and golden SVG snapshots, security and DOM tests (Vitest + jsdom)
pnpm test:watch       # the tests in watch mode
pnpm typecheck        # strict TypeScript, plus a DOM-free check of src/core
pnpm build            # library (dist/), type declarations (dist/types) and the demo site
pnpm build:storybook  # static Storybook in storybook-static/
pnpm build:docs       # this portal in docs/.vitepress/dist/
pnpm build:pages      # the portal, the studio demo and Storybook together in _site/ (as deployed to GitHub Pages)
pnpm preview:pages    # serves _site/ at http://localhost:8792/mmdx/
pnpm size             # gzip size budgets per entry point
pnpm tour             # an animated tour of the basic features in the running studio (see Feature tour)
```

`pnpm build:pages` builds the portal, the demo site and Storybook, then `tools/pages.mjs` puts them together: the portal at the root, the studio demo at `studio/` and Storybook at `storybook/`. `pnpm preview:pages` serves the result the way GitHub Pages does, under `/mmdx/`.

## Repository layout

| Folder | Contents |
|---|---|
| `src/core` | Parsers, layout, renderers, metadata, themes — pure TypeScript, no DOM |
| `src/dom` | DOM patcher, viewport, `DiagramCanvas`, pen strokes, worker client, export |
| `src/ui` | Signals, the UI blocks (`src/ui/blocks`), toolbars, dialogs, styles and UI strings |
| `src/view` | The view kernel (`ViewCore`), module host, scene sources and the standard view modules |
| `src/diff` | The diff session, scene and modules (`<mmdx-diff>` and History) |
| `src/editor` | The editor core (on the kernel), its store scene and its feature modules |
| `src/theme-editor` | The theme editor |
| `src/elements` | The web components |
| `src/adapters`, `src/markdown`, `src/wrappers` | Host adapters, Markdown plugins, React wrappers |
| `themes/` | Built-in theme files (`node tools/build-themes.mjs` regenerates the generated ones) |
| `examples/` | Example diagrams used by the studio and the golden tests, and their version histories (`examples/history`) |
| `apps/studio-site/` | The demo site deployed to GitHub Pages, with the diff samples (`diff-samples/`) |
| `docs/` | This documentation portal (VitePress) |
| `stories/`, `.storybook/` | Storybook: the elements (the diff included), the UI pieces with mock APIs, core rendering and the semantic diff |
| `tests/` | Vitest tests, by area (`core`, `dom`, `ui`, `view`, `editor`, `diff`, `elements`, `adapters`, `markdown`, `theme-editor`) |
| `tools/` | Build helpers: size budgets, the inline worker source, theme generation, the Pages assembly, the feature tour |
| `brand/` | Logo files |

[Architecture](/guide/architecture) explains how the pieces fit together.

## Tests

`pnpm test` runs every `tests/**/*.test.ts` with Vitest (Node environment, jsdom where a test needs the DOM): unit and geometry tests of the core, golden SVG snapshots of the examples, security tests, and DOM tests of the canvas, the blocks, the kernel and the elements. Add a test next to the area you change; UI blocks also get a story.

Run one file or one name while you work:

```bash
pnpm vitest run tests/core/meta
pnpm vitest run -t "conflict"
```

## Size budgets

`pnpm size` measures the gzip size of what a browser downloads and fails when anything is over budget, in two ways:

- **Consumer bundles**: each entry bundled on its own the way a consumer's bundler ships it (esbuild, minified, code splitting). The viewer budget applies to the first diagram on screen: the viewer's static imports plus the lazily loaded parser and renderer of that diagram type. There are rows for the viewer with History opened, the editor (and with History), the theme editor, the diff and the core.
- **The library build**: the real multi-entry build of `dist/`, whose shared chunks a per-entry bundle never sees, per entry and per scenario (a diagram kind, History opened).

A change that grows a budget says why in `tools/size.mjs`, next to the number.

## Feature tour

`pnpm tour` plays an animated tour of the basic features in the running studio and can record it as a video, for a demo or to review a change end to end. It drives a real browser with Playwright, shows a cursor with click ripples, and explains each step in a caption strip under the app:

1. **Start**: a new flowchart from a small plain Mermaid diagram, no classes, no styles.
2. **Style visually**: the Properties panel once, then the floating toolbar only (style presets, bold, fill colour) and the page badge (a Whiteboard page, right-angle lines); the Metadata tab shows the Mermaid text stays clean.
3. **Edit content**: a shape dragged from the Shapes menu, named and connected by a handle, then Mermaid lines typed in the code panel.
4. **Iterations**: more code and visual edits, fast-forwarded, each saved as a version.
5. **History**: every version stepped through, oldest to newest.
6. **Diff**: the first version against the current one in the Before, After, Side by side and Merged views, the filters, the change list, a single step (⋮ → Compare with the previous version), and Before / After swapped.

Install the browser once, start the studio, and run the tour in a second terminal:

```bash
pnpm exec playwright install chromium   # once
pnpm dev                                # the studio at http://localhost:8790
pnpm tour                               # in a second terminal
```

| Option | Default | What it does |
|---|---|---|
| `--url <url>` | `http://localhost:8790/` | The studio to drive |
| `--speed <n>` | `1` | Scales the pauses: `0.5` plays twice as fast, `2` half as fast |
| `--iterations <n>` | `5` | Versions added in step 4 (at most 5) |
| `--video <dir>` | — | Records the run as a `.webm` file in the folder |
| `--shots <dir>` | — | Saves a screenshot at the end of every captioned step, to review a run without watching it |
| `--headless` | off | Runs without a visible window (with `--video` or `--shots`) |

```bash
pnpm tour --video tour-video            # record a video
pnpm tour --headless --speed 0.4 --shots tour-shots   # a quick check after a UI change
```

The tour clears the studio's browser storage first, so every run starts from the same empty state. It finds the controls by their accessible names and `data-f` attributes; a change to the toolbars, the panels or the History list can break a step, and the error names the control it could not find.

## Documentation

The portal lives in `docs/`: the guide in `docs/guide/`, the components in `docs/components/`, the API reference in `docs/api/`. Live components on a page use `<MmdxDemo>` (see `docs/.vitepress/theme/MmdxDemo.vue`), and every ` ```mermaid ` block is a live viewer; ` ```mmdx ` shows code without rendering it. The changelog page includes `CHANGELOG.md`. Run `pnpm docs:dev` while writing, and `pnpm build:docs` to check for dead links.

## Before opening a pull request

- `pnpm typecheck` passes.
- `pnpm test` passes; new behaviour has a test (and a story for a UI piece).
- `pnpm size` passes, or the budget change is explained.
- User-facing changes are in `CHANGELOG.md` (under the unreleased version) and in the documentation portal (`docs/`); `README.md` is a short overview that links to it.
- Untrusted input stays untrusted: no `innerHTML` for document content, values validated where they enter, links through `safeUrl`.

CI runs the type check, the tests, the build and the size budgets on every pull request, and builds the Pages site (portal, demo and Storybook), so a broken page or a dead link in the docs fails the check.

## License

[MIT](https://github.com/udamir/mmdx/blob/master/LICENSE).
