# Changelog

All notable changes to `mmdx`. The project follows [semantic versioning](https://semver.org/); while it is below 1.0, a minor version may change public API, and such changes are listed under **Changed**.

## 0.2.0 — History and diff

How a diagram changed, at a glance: the editor and the viewer get a History of the diagram, the view behind it is a new `<mmdx-diff>` component, and a DOM-free diff API serves CI bots.

### Added

- **`<mmdx-diff>` and `DiagramDiff`** (`mmdx/diff`): compares two versions of a flowchart, sequence or ER diagram item by item. Views: Before, Merged and After on one animated canvas, and Side by side with linked pan and zoom. The Merged view keeps removed items where they were (removed ER rows and sequence messages get their own room), marks text changes word by word and draws an arrow from the old place of every moved item.
- **Change filters**: hide added or removed items, and ignore content, layout or style changes (Layout off draws the old version on the new layout, Style off draws both versions unstyled); Dim fades everything that did not change.
- **Panels**: the version history (Compare two versions, or view one as it is, with `+added −removed ~changed` per version) and the code and metadata diff narrowed to the selected change, stacked on the left with a splitter between them, and the change list on the right, toggled from the end of the bottom bar; any combination can be open. Panels resize and remember their sizes like the editor's.
- **Review tools**: J / K through the changes, the magic pen with strokes shared by every view, the editor's zoom bar and help popup, full screen, keyboard shortcuts, light and dark chrome with `--mmdx-diff-*` tokens.
- **Export** from the diff: PNG and SVG of the current view with a legend, either version as `.mmdx` or portable `.mmd`, a unified patch (applies with `git apply`), and a change report in Markdown or JSON. `mmdx-export` is cancelable so hosts can upload instead of downloading.
- **History adapters** (`mmdx/diff`, `mmdx/adapters`): `staticHistory(versions)` and `httpHistoryAdapter(url)` (paged with `next` / `?cursor=`); write your own `{ list, load }` for GitLab, GitHub or any backend.
- **History in the editor**: give `<mmdx-editor>` a `history` (a `HistoryAdapter` or a list of versions) and its tool dock gets a History button (⇧H): the diff of the document's versions plus the working copy, **Restore this version** (an undoable change, Edit mode) and **Back to the diagram**. Feature flag `history`; `toggleHistory(on?)`.
- **History in the viewer**: `controls="history"` with a `history` property: the same view over the viewer, without Restore.
- The History of the editor and the viewer shows `<mmdx-diff>` by its tag: load `mmdx/diff` on the page (the button appears once it is defined), so viewer- and editor-only pages never download the diff.
- **Studio**: gives the editor the open document's versions — the example's bundled history and the versions recorded with **Save version** or ⌘S (browser storage, per document).
- **Example histories**: every bundled example ships six versions (`examples/history/*.json`, generated with the editor's own ops by `apps/studio-site/diff-samples/generate.ts`) covering added, removed and changed items across content, layout and style for flowchart, sequence and ER diagrams. Examples with a history open at their newest version.
- **Core diff API** (`mmdx/core`): `diffDiagrams`, `diffModels`, `ignoreFacets`, `withoutStyle`, `withLayoutOf`, `mergeDiagrams`, `renderDiff`, `renderDiffToSvg` (any view, side by side with titles, SSR-ready), `diffSvg`, `diffReport` (Markdown / JSON), `unifiedDiff`, `diffWords`, `diffLines`, `mergeText`, `annotate`, `DIFF_COLORS`, and their types. A small Myers diff replaces the `diff` package of the prototype, so the library still has no runtime dependencies.
- React wrapper `MmdxDiff` from `createReactWrappers(React)`.
- Storybook: Elements/Diff, and "With history" stories for the editor and the viewer.

### Changed

- The text measurers count the zero-width change marks as nothing; the scene serializer and the DOM patcher accept a hook that draws marked words as `<tspan class="dx-ins|dx-del">` runs (registered by the diff, so viewer-only pages do not ship it). `data-key` and `data-ck` join the allowed `data-*` attributes.
- The editor's floating-panel resizer and its zoom bar / help styles moved to `src/ui/panes.ts` and `src/ui/zoom-bar.ts`, shared with the diff; the editor looks and behaves the same.
- `penOptions()` accepts any object with the pen settings (`PenSettings`), so the diff's shared ink uses the viewer's pen popup.
- The examples manifest entries may name a `history` file.
- The `diff.html` prototype page of the demo site was removed: the diff lives in the History of the editor (studio) and the viewer (viewer demo page), and in Storybook.

### Size

Gzip budgets checked by `pnpm size`: the viewer grows from 44.9 kB to 45.3 kB with its History control (budget raised from 45 to 46 kB) and the editor from 161.9 kB to 162.8 kB (budget 165 kB) — neither bundle contains the diff, which their History uses as `<mmdx-diff>` once the page loads `mmdx/diff`; `mmdx/core` grows from 40.8 kB to 52.8 kB with the diff engine (budget raised to 55 kB); the new `mmdx/diff` entry is 86.5 kB with every diagram kind loaded statically (budget 90 kB). The studio loads `mmdx/diff` in the background after start.

### Upgrading from 0.1

No breaking changes for the viewer, editor, theme editor or studio. If you import `ZOOM_BAR_CSS` or `slidePanel` from the editor modules, they are still re-exported there.

### Release checklist

1. `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm size` (CI runs the same).
2. Check the studio (`pnpm dev`): open each example, open History from the tool dock, compare versions, view one, restore one (and undo), export a PNG and a Markdown report, in light and dark; check the viewer page's "With history" example.
3. `pnpm build:storybook` and look through Elements/Diff.
4. Merge to `master` (CI deploys the demo site to GitHub Pages), tag `v0.2.0`, and `npm publish` from a clean `dist/`.
5. Create a GitHub release from this section.

## 0.1.0 — Diagram Studio

First release: `<mmdx-viewer>`, `<mmdx-editor>`, `<mmdx-theme-editor>`, `<mmdx-studio>`, the `.mmdx` format, themes, `mmdx/core` with server-side rendering, Markdown plugins and React wrappers.
