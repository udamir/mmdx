# Reviewing changes in CI

A line diff of a `.mmdx` file shows which `%%@` lines changed, not what changed in the picture. `@mmdx/studio/core` compares two versions of a diagram item by item without a DOM, so a CI job can post a change report on every merge request that touches a diagram, with a rendered picture of the change.

## The diff API

Everything runs in Node 18 or newer (and in workers and browsers):

```ts
import { diffDiagrams, ignoreFacets, diffReport, renderDiffToSvg, unifiedDiff } from '@mmdx/studio/core';

const diff = diffDiagrams(before, after);                         // what changed, item by item
const md = diffReport(diff, { format: 'markdown', name: 'docs/arch.mmdx' });
const svg = await renderDiffToSvg(before, after, { view: 'merged' }); // a standalone SVG of the change
const patch = unifiedDiff(before, after, { name: 'docs/arch.mmdx' }); // a git-style patch
```

Nodes, edges, tables, relationships, participants and messages are matched across the versions — renamed nodes and shifted sequence messages included — and every change is **added**, **removed** or **changed**. Each change of a kept item belongs to one facet:

| Facet | What it covers |
|---|---|
| `content` | What the diagram says: items, labels, shapes, connections, ER attributes, message text, links |
| `layout` | Where things are: positions, sizes, bend points, ports, label offsets, layers |
| `style` | How things look: colours, fonts, presets, Mermaid classes, `style` / `classDef` / `linkStyle` |

## diffDiagrams

`diffDiagrams(before, after)` takes two sources (Mermaid with or without `%%@` lines) and never throws on bad input. It returns a `DiagramDiff`:

```ts
interface DiagramDiff {
  type: DiagramType | null;
  typeChanged: boolean;  // the versions are different diagram types
  items: ItemChange[];   // every item, with its status
  doc: FieldChange[];    // diagram-wide changes: page settings, local presets, classDef, direction
  counts: { added: number; removed: number; changed: number; content: number; layout: number; style: number };
}

interface ItemChange {
  kind: ItemKind;        // 'node', 'edge', 'participant', 'message', 'entity', 'rel', …
  id: string;            // the id in the after version (the before id for removed items)
  beforeId?: string;     // when it differs (renamed node, shifted message)
  label: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  facets: ('content' | 'layout' | 'style')[];
  fields: { facet: 'content' | 'layout' | 'style'; field: string; before?: unknown; after?: unknown }[];
}
```

`diffDiagrams` of `@mmdx/studio/core` is synchronous and bundles every diagram kind. `@mmdx/studio/diff` exports an asynchronous `diffDiagrams` and `renderDiffToSvg` that load the parsers of the two versions' types first; use those in browser bundles.

## Ignoring facets

`ignoreFacets(diff, { layout: true })` drops the changes of the named facets: an item whose only changes were ignored becomes unchanged, and the counts follow. Added and removed items always stay. Reviewers usually care about content first:

```ts
const contentOnly = ignoreFacets(diffDiagrams(before, after), { layout: true, style: true });
if (contentOnly.counts.added + contentOnly.counts.removed + contentOnly.counts.changed === 0) console.log('Only layout or style changed');
```

## diffReport

`diffReport(diff, options)` writes a change report:

| Option | Meaning |
|---|---|
| `format` | `'markdown'` (for merge request descriptions and bot comments) or `'json'` (schema-versioned, `version: 1`) |
| `before`, `after` | `VersionInfo` of the two versions: `{ id, message?, author?, date?, url? }`; shown in the Markdown header, kept in the JSON |
| `name` | The diagram's name in the Markdown title |
| `links` | `(change) => string \| null`: a link for each change, for example into a hosted diff view |

The Markdown report has a title, the versions, the counts, then sections for diagram-wide changes and for added, removed and changed items (with every changed field, before → after). Text from the diagram is escaped, so a label cannot inject Markdown. The JSON report holds `version`, `type`, `typeChanged`, `counts`, `before`, `after`, `doc` and the items that changed.

## renderDiffToSvg

`renderDiffToSvg(before, after, options)` resolves to one standalone SVG of a view, with the highlights, badges, move arrows and a legend — the picture `<mmdx-diff>` shows:

| Option | Default | Meaning |
|---|---|---|
| `view` | `'merged'` | `'before'`, `'merged'`, `'after'` or `'side'` (both versions side by side, with titles) |
| `ignore` | — | `{ content?, layout?, style? }`: Layout off draws the old version on the new layout, Style off draws both unstyled |
| `hide` | — | `{ added?, removed? }`: leave added or removed items out of the highlights |
| `theme` | Default Light | The theme both versions are drawn with |
| `dim` | `true` | Fade unchanged items |
| `highlights` | `true` | Highlights, badges, move arrows and word marks |
| `legend` | `true` | A legend of the highlight colours with the counts under the picture |
| `scheme` | `'light'` | The highlight colours: the light or the dark set |
| `titles` | `Before`, `After` | `{ before?, after? }`: titles over the two pages of the side-by-side view |
| `badgeScale` | `1` | Badge size factor |
| `ctx` | a new context | A `CoreContext` (themes, text measurer); text is measured with the static measurer unless the context brings another one |

For a diagram whose type changed, Merged shows the After version. `renderDiff(before, after, ctx, options)` returns the rendered parts instead of a string, and `diffSvg(rendered, options)` turns them into the SVG.

## unifiedDiff

`unifiedDiff(before, after, options)` writes a standard unified diff (`---` / `+++` / `@@`) that applies with `git apply` when no facet is ignored; it returns an empty string when nothing changed.

| Option | Default | Meaning |
|---|---|---|
| `name` | `diagram.mmdx` | File name in the headers |
| `context` | `3` | Lines of context around each change |
| `part` | `'all'` | `'all'`, `'code'` (the Mermaid code only) or `'meta'` (the `%%@` lines only) |
| `ignore` | — | Facets left out: style lines removed, old layout replaced |

## A complete script

The script below compares every `.mmdx` file changed between two commits and writes a Markdown report and one SVG per diagram. Save it as `.github/scripts/diagram-diff.mjs`:

```js
// node .github/scripts/diagram-diff.mjs — needs BASE_SHA and HEAD_SHA, and the history of both commits
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { diffDiagrams, diffReport, ignoreFacets, renderDiffToSvg } from '@mmdx/studio/core';

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA;
const ignore = { layout: process.env.IGNORE_LAYOUT === '1' };
const out = 'diagram-diff';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
// a file that does not exist on one side (added or deleted) is an empty diagram there
const show = (ref, file) => {
  try {
    return git('show', `${ref}:${file}`);
  } catch {
    return '';
  }
};

const files = git('diff', '--name-only', base, head, '--', '*.mmdx').split('\n').filter(Boolean);
mkdirSync(out, { recursive: true });

const sections = [];
for (const file of files) {
  const before = show(base, file);
  const after = show(head, file);
  const diff = ignoreFacets(diffDiagrams(before, after), ignore);
  sections.push(diffReport(diff, { format: 'markdown', name: file, before: { id: base.slice(0, 7) }, after: { id: head.slice(0, 7) } }));
  const svg = await renderDiffToSvg(before, after, { view: 'merged', ignore });
  writeFileSync(`${out}/${file.replaceAll('/', '__')}.svg`, svg);
}

writeFileSync(`${out}/report.md`, files.length ? sections.join('\n') : 'No diagram changes.\n');
console.log(`${files.length} diagram(s) compared`);
```

Run it locally against your branch:

```bash
BASE_SHA=$(git merge-base origin/main HEAD) HEAD_SHA=$(git rev-parse HEAD) node .github/scripts/diagram-diff.mjs
```

## GitHub Actions

This workflow runs the script on pull requests that touch a `.mmdx` file, comments the report on the pull request and uploads the SVGs as an artifact:

```yaml
name: Diagram review
on:
  pull_request:
    paths: ['**/*.mmdx']

permissions:
  contents: read
  pull-requests: write

jobs:
  diagrams:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # both commits are needed
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --no-save @mmdx/studio
      - run: node .github/scripts/diagram-diff.mjs
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
      - uses: actions/upload-artifact@v4
        with:
          name: diagram-diff
          path: diagram-diff/
      - run: gh pr comment ${{ github.event.pull_request.number }} --body-file diagram-diff/report.md
        env:
          GH_TOKEN: ${{ github.token }}
```

::: tip
Pull requests from forks get a read-only token, so the comment step fails there; run the comment from a `workflow_run` or `pull_request_target` workflow that does not check out the fork's code, or keep only the artifact. If your repository already depends on `@mmdx/studio`, replace the install step with your usual `npm ci` / `pnpm install`.
:::

GitLab CI works the same way: run the script with `CI_MERGE_REQUEST_DIFF_BASE_SHA` and `CI_COMMIT_SHA`, and post `report.md` as a merge request note through the API.

## Reviewing in the browser

For an interactive review — every view animated, filters, the change list, the code diff and exports (PNG, SVG, `.diff`, Markdown and JSON reports) — put [`<mmdx-diff>`](/components/diff) on a page and give it the two versions or the file's history:

<MmdxDemo kind="diff" sample="architecture" />

See [Version history](/guide/history) for history adapters, including GitHub and GitLab.
