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
```

`pnpm build:pages` builds the portal, the demo site and Storybook, then `tools/pages.mjs` puts them together: the portal at the root, the studio demo at `studio/` and Storybook at `storybook/`. `pnpm preview:pages` serves the result the way GitHub Pages does, under `/mmdx/`.

## Repository layout

| Folder | Contents |
|---|---|
| `src/core` | Parsers, layout, renderers, metadata, themes — pure TypeScript, no DOM; each diagram type's kinds in `src/core/kinds` |
| `src/dom` | DOM patcher, viewport, `DiagramCanvas`, pen strokes, worker client, export |
| `src/ui` | Signals, the UI blocks (`src/ui/blocks`), toolbars, dialogs, styles and UI strings |
| `src/view` | The view kernel (`ViewCore`), module host, scene sources and the standard view modules |
| `src/diff` | The diff session, scene and modules (`<mmdx-diff>` and History) |
| `src/editor` | The editor core (on the kernel), its store scene, its feature modules and each diagram type's edit kind (`src/editor/kinds`) |
| `src/theme-editor` | The theme editor |
| `src/elements` | The web components |
| `src/adapters`, `src/markdown`, `src/wrappers` | Host adapters, Markdown plugins, React wrappers |
| `themes/` | Built-in theme files (`node tools/build-themes.mjs` regenerates the generated ones) |
| `examples/` | Example diagrams used by the studio and the golden tests, and their version histories (`examples/history`) |
| `apps/studio-site/` | The demo site deployed to GitHub Pages, with the diff samples (`diff-samples/`) |
| `docs/` | This documentation portal (VitePress) |
| `stories/`, `.storybook/` | Storybook: the elements (the diff included), the UI pieces with mock APIs, core rendering and the semantic diff |
| `tests/` | Vitest tests, by area (`core`, `dom`, `ui`, `view`, `editor`, `diff`, `elements`, `adapters`, `markdown`, `theme-editor`) |
| `tools/` | Build helpers: size budgets, the inline worker source, theme generation, the Pages assembly |
| `brand/` | Logo files |

[Architecture](/guide/architecture) explains how the pieces fit together.

## Adding a diagram type

A diagram type is a set of kinds ([Architecture → Diagram kinds](/guide/architecture#diagram-kinds)); the compiler points at every table that still lacks the new type.

1. Add the type to `DiagramType` (`src/core/types.ts`), its header and starter to `KIND_INFO` (`src/core/kinds/info.ts`) and its names to `KIND_NAMES`.
2. Write the model (`src/core/model.ts`), the parser (`src/core/parse/<type>.ts`) and the renderer with its geometry index (`src/core/render/<type>.ts`, `src/core/render/types.ts`).
3. Write the view, diff and ops kinds (`src/core/kinds/<type>.ts`, `<type>-diff.ts`, `<type>-ops.ts`) and add them to `all.ts`, `all-diff.ts` and `all-ops.ts`; the outline goes to `<type>-outline.ts` and the `OUTLINES` table.
4. Write the edit kind (`src/editor/kinds/<type>.ts`, re-exporting the view and ops kinds) and add it to `src/editor/kinds/all.ts`.
5. Fill the tables the compiler asks for: the viewer's and the diff's importers (`src/view/kinds.ts`, `src/diff/kinds.ts`), the editor's (`src/editor/kinds/loader.ts`), the theme section (`src/core/theme/types.ts`, the registry's `SECTION_DEFAULTS`, the theme editor's `SECTION_UI` and `DEFAULT_SAMPLES`), the empty-state pictogram.
6. Add an example to `examples/` (golden snapshots for every theme follow), parser and ops tests, a size row in `tools/size.mjs`, and the docs.

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
