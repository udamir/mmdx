# Icons

Diagrams name icons as `pack:name` — `fa:fa-car`, `tabler:database`, `logos:aws-ec2`, `azure:computer-vision` — and mmdx draws them from **icon packs**: [Iconify JSON](https://iconify.design/docs/types/iconify-json.html) files, registered the way Mermaid's `registerIconPacks` takes them. The same configuration feeds mmdx and stock Mermaid (the fallback for the diagram types mmdx does not draw), so a diagram shows the same icons in both. mmdx ships a small generic set of its own (a subset of Tabler Icons under `tabler:`); logos, cloud icons and Font Awesome come from packs the host registers.

## Writing icons

An icon is written in the Mermaid code, in one of three forms:

```mmdx
flowchart LR
  A[fa:fa-user Customer] --> B[tabler:server API]
  C@{ icon: "logos:aws-ec2", label: "EC2" }
```

- **Label tokens** — `fa:fa-car Car`, `tabler:server API`, `azure:computer-vision Vision`: a token in a label draws the icon in the text. Font Awesome's form (`fa:fa-…`, and `fab`, `fak`, `fal`, `far`, `fas`) is always read as an icon, as Mermaid reads it; any other `pack:name` is an icon only when `pack` is a registered pack, so `Note: …` or `http://…` stay text.
- **Icon nodes** — `A@{ icon: "logos:aws-ec2" }` in a flowchart takes any `pack:name`.
- **Mindmap icons** — `::icon(fa fa-book)`, `::icon(fa-solid fa-car)`, `::icon(mdi mdi-skull-outline)`: CSS class forms as Mermaid's mindmap writes them.

Labels in every diagram type use tokens. Stock Mermaid draws `fa*` tokens (in all types but sequence diagrams) and icon nodes; tokens of other packs show as text there. The diagram types draw icons as they gain icon support: flowcharts draw icon nodes and tokens in node, edge and subgraph labels (see [Flowchart content](/guide/flowchart)); mindmap, state, sequence and ER labels follow.

## The built-in set

About 250 generic icons from [Tabler Icons](https://tabler.io/icons) (MIT) ship with mmdx under Tabler's own prefix, `tabler`: people, devices, documents, data and storage, network, security, status, time, money, communication, arrows, shapes, general symbols and common brands. Because the name is Tabler's, a diagram that uses `tabler:database` renders anywhere Mermaid has `@iconify-json/tabler` registered.

The set is a chunk of its own (about 20 kB gzip), loaded the first time a diagram shows one of its icons; a page whose diagrams use none never downloads it. A host that registers its own full `tabler` pack replaces the built-in subset. `configure({ builtinIcons: false })` turns it off.

### Font Awesome without Font Awesome

Many Mermaid files use Font Awesome (`fa:fa-car`). When no Font Awesome pack is registered, mmdx draws a look-alike from the built-in set for about 350 common Font Awesome names (`fa:fa-car` → `tabler:car`, `fab:fa-github` → `tabler:brand-github`) and reports an `icon.fa-fallback` note. Register a Font Awesome pack under `fa` (and `fab`, `fas`… as your files use them) to draw the real icons:

```ts
configure({
  iconPacks: [
    { name: 'fa', loader: () => import('@iconify-json/fa6-solid/icons.json').then((m) => m.default) },
    { name: 'fab', loader: () => import('@iconify-json/fa6-brands/icons.json').then((m) => m.default) },
  ],
});
```

## Registering packs

```ts
import { configure } from '@mmdx/studio/viewer'; // also exported by the editor, diff and studio entries
import logos from '@iconify-json/logos/icons.json';

configure({
  iconPacks: [
    // bundled with your app: works under a strict CSP and in sandboxed iframes
    { name: 'logos', icons: logos },
    // bundled, but split off: loaded the first time a diagram shows one of its icons
    { name: 'mdi', loader: () => import('@iconify-json/mdi/icons.json').then((m) => m.default) },
    // from a CDN
    { name: 'simple-icons', loader: () => fetch('https://unpkg.com/@iconify-json/simple-icons@1/icons.json').then((r) => r.json()) },
    // cloud packs you converted and serve yourself (see Cloud packs)
    { name: 'azure', loader: () => fetch('/icons/azure.json').then((r) => r.json()) },
    { name: 'aws', loader: () => fetch('/icons/aws.json').then((r) => r.json()) },
    { name: 'gcp', loader: () => fetch('/icons/gcp.json').then((r) => r.json()) },
  ],
});
```

- A pack is `{ name, icons }` or `{ name, loader }`. `name` is the prefix diagrams write and overrides the pack's own `prefix`, as in Mermaid.
- `configure()` calls merge: a pack of a name registered before replaces it.
- A loader is called the first time a diagram shows one of the pack's icons, once per page; lookups while it loads share the load. A failed load is tried again on a render 30 s later.
- Packs are read when a component renders, so packs registered after a component started still reach it.
- A component can have packs of its own, over the shared ones: `new DiagramViewer(el, { iconPacks })`, and the same option on `DiagramEditor` and `DiagramDiff`.

Prefer bundling (`import … from '@iconify-json/…/icons.json'`): CDN loaders need the CDN in your CSP's `connect-src` and do not work in sandboxed iframes that block the network.

### Logos and cloud icons from Iconify

Iconify's public [logos](https://icon-sets.iconify.design/logos/) set (`@iconify-json/logos`) has the AWS, Azure and Google Cloud product logos under its own names — `logos:aws-ec2`, `logos:aws-lambda`, `logos:microsoft-azure`, `logos:google-cloud` — and needs no conversion. Use it when your files do not have to match Mermaid Chart's names.

## Rendering

Rendering stays synchronous. While a pack loads, its icons are drawn as empty boxes of their size, so nothing moves when they arrive; when the load finishes, the viewer, the editor and the diff render again. An icon that is not available — an unregistered pack, a name the pack does not have, a pack that failed to load — is drawn as a "?" placeholder, with an `icon.unknown` warning (once per pack or icon). The editor's code panel lists them.

Monochrome icons (Tabler, Material Design Icons, Font Awesome: drawn in `currentColor`) take the item's text colour, so they follow the theme; multicolour icons (logos) keep their colours.

### On the server

`renderToSvg` loads the icons a source references before it renders, from the context's registry (the built-in set) plus `iconPacks`:

```ts
import { renderToSvg, createContext, createIconRegistry } from '@mmdx/studio/core';
import logos from '@iconify-json/logos/icons.json';

const svg = await renderToSvg(source, { iconPacks: [{ name: 'logos', icons: logos }] });
// or a registry kept for many renders
const ctx = createContext({ icons: createIconRegistry([{ name: 'logos', icons: logos }]) });
```

The rehype plugin takes `iconPacks` too, and waits for the icons a page's diagrams need. The markdown-it plugin renders synchronously: load the icons first with `preloadIcons(ctx, sources)` from `@mmdx/studio/markdown` and pass the same `ctx`. `renderSource` with your own context draws what is loaded: call `ctx.icons.preload(iconNamesOf(source, ctx.icons))` before it.

### The render worker

Large diagrams render in a worker, which cannot call loaders. The component resolves the icons a source references on the main thread and sends them with the request; a pack that loads later renders the diagram again.

## Stock Mermaid

Before its first render, stock Mermaid (the viewer's fallback for the diagram types mmdx does not draw, and the editor's Plain Mermaid preview) receives the same packs through `mermaid.registerIconPacks` — the built-in set as `tabler` included, sharing mmdx's loads — so its `fa:` tokens, flowchart icon nodes and architecture diagrams draw them. Register packs with `configure({ iconPacks })`, not with `mermaid.registerIconPacks` directly: mmdx does not read Mermaid's packs. Mermaid 11.1 and later have `registerIconPacks`; with older versions nothing is forwarded.

## Cloud packs

Mermaid Chart writes cloud icons as `azure:computer-vision`, `aws:…` and `gcp:…`. Those packs are Mermaid Chart's own, and the providers' icon terms allow using the icons in diagrams but not redistributing them in a library, so mmdx does not ship them. It ships a converter instead, which builds an Iconify pack with Mermaid Chart's names from the provider's official download:

```sh
npx mmdx-icons build --from ./Azure_Public_Service_Icons --prefix azure --naming azure --out public/icons/azure.json
npx mmdx-icons build --from ./Asset-Package --prefix aws --naming aws --out public/icons/aws.json
npx mmdx-icons build --from ./google-cloud-icons --prefix gcp --naming gcp --out public/icons/gcp.json
```

- **Downloads**: [Azure Architecture Icons](https://learn.microsoft.com/azure/architecture/icons/), [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/), [Google Cloud icons](https://cloud.google.com/icons). Read each provider's terms before you publish diagrams with them.
- **Names** follow a naming table per provider: Azure's `10044-icon-service-Computer-Vision.svg` becomes `computer-vision` (the number and `icon-service-` go, the rest is kebab-cased); AWS drops `Arch_` / `Res_`, the size and Light / Dark (`Arch_Amazon-EC2_64.svg` → `amazon-ec2`) and keeps the largest size; Google Cloud splits CamelCase and drops size and colour suffixes (`ComputeEngine-512-color-rgb.svg` → `compute-engine`). Each table has an override list for names that differ; `--naming ./my-table.json` takes a table of your own (the built-in ones are in `tools/icons/naming/` of the package).
- **Normalising**: each icon's view box becomes its box, `<style>` class rules are inlined, ids are prefixed per icon, and comments, titles and metadata go. Folders become search categories and file name words keywords.
- `--dry-run` lists the names without writing the pack.

Serve or bundle the JSON and register it (`{ name: 'azure', loader: () => fetch('/icons/azure.json').then((r) => r.json()) }`). A diagram that uses a pack nobody registered draws "?" placeholders and the warning names the pack ("Icons from "azure" are not available").

## Security

Icons never become markup in the page. An icon's body is read by a strict SVG tokenizer — shapes, gradients, masks, clip paths, filters and `use` only; geometry, paint and transform attributes; no `<script>`, `<foreignObject>` or `<image>`, no `on*` attributes, no `href` or `url()` that leaves the icon, no entities, at most 64 KB — and written out again from what it read. mmdx then builds the icon's SVG document itself and draws it as a `data:image/svg+xml` image, which runs no script and loads nothing. An icon that fails the check is drawn as the placeholder. The image policy does not apply to icons; the page's CSP must allow `img-src data:` (see [Security](/guide/security#content-security-policy)).
