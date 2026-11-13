# Configuration

App-level settings go through `configure()`, which sets the defaults every component instance reads when it is created. A few functions next to it register themes and the render worker, and each element can override some settings per instance.

## configure()

```ts
import { configure } from 'mmdx/viewer'; // also exported by the editor, theme editor, diff and studio entries
import { fetchThemeSource } from 'mmdx/adapters';
import { DEFAULT_IMAGE_POLICY } from 'mmdx/core';

configure({
  themeSource: fetchThemeSource('/themes/index.json'),   // themes a component needs but the page has not loaded
  i18n: { locale: 'de', messages: { 'zoom.fit': 'Einpassen' } },
  linkPolicy: { protocols: ['https:', 'mailto:'], target: '_blank' },
  imagePolicy: { ...DEFAULT_IMAGE_POLICY, hosts: ['images.example.com'] }, // images only from this host
  resolveUrl: (url, kind) => (/^[a-z]+:|^[/#?]/i.test(url) ? null : `/api/files/${encodeURIComponent(url)}`), // relative names are attachments
  iconPacks: [{ name: 'logos', loader: () => import('@iconify-json/logos/icons.json').then((m) => m.default) }],
  fonts: { Inter: '/fonts/inter.woff2' },                 // embedded into PNG exports
  mermaid: () => import('mermaid'),
});
```

Call it before the elements are created (before they are connected); a later call applies to instances created afterwards. Every option is optional, and a call changes only the options it names (`fonts` are added to the fonts set before).

| Option | Type | Default | Meaning |
|---|---|---|---|
| `themeSource` | `ThemeSource` | — | Where themes the components need but do not have are loaded from. See [Theme sources](/guide/themes#theme-sources) |
| `themes` | `ThemeRegistry` | a registry with Default Light | The shared theme registry. Prefer [`registerThemes`](#registerthemes) to add themes to the default one |
| `i18n` | `{ locale, messages? }` | `en`, English | The locale and a catalog of UI strings that replaces the bundled English. See [UI strings](#ui-strings-i18n) |
| `linkPolicy` | `{ protocols, target? }` | `https:`, `http:`, `mailto:`; `_blank` | Which link protocols diagrams may use and where links open. See [Security](/guide/security#link-policy) |
| `imagePolicy` | `{ protocols, dataTypes, maxDataBytes, hosts?, relative? }` | `https:` only, any host; `data:` (base64 PNG, JPEG, GIF, WebP, SVG, AVIF up to 256 KiB) and relative URLs off | Which image URLs diagrams may show. `protocols: []` turns images off; `hosts` limits them to a list (`*.example.com` matches its subdomains); `'data:'` in `protocols` allows embedded images; `relative: true` allows `./img/logo.png`, resolved against the page. A refused image is drawn as a placeholder with an `image.blocked` warning. See [Security](/guide/security#image-policy) |
| `resolveUrl` | `(url, kind) => string \| null \| undefined` | — | What the URLs diagrams point at mean: called with each image (`kind` `'image'`) and link (`'link'`) URL as written, it returns the URL to use — a relative path made absolute, an attachment's name made its download URL — or null / undefined to use it as written. The result goes through the image or link policy; the diagram's code keeps what was written. Diagrams render on the main thread while it is set (a function does not reach the render worker). See [Security](/guide/security#resolving-urls) |
| `iconPacks` | `IconPack[]` | — | Icon packs diagrams draw `pack:name` icons from, as Mermaid's `registerIconPacks` takes them: `{ name, icons }` or `{ name, loader }` (called on the first icon of the pack a diagram shows). Merged across calls; stock Mermaid receives the same packs. See [Icons](/guide/icons) |
| `builtinIcons` | `boolean` | `true` | The built-in Tabler subset under `tabler:` (a lazy chunk), which also draws look-alikes for Font Awesome names when no Font Awesome pack is registered. See [Icons](/guide/icons#the-built-in-set) |
| `fonts` | `Record<string, string \| ArrayBuffer>` | — | Font files embedded into PNG exports: family name → URL or bytes. Without them, PNG export uses locally installed fonts |
| `mermaid` | a Mermaid instance or `() => Promise<…>` | `mermaid` imported at run time where it resolves (Node, an import map); a bundled app passes `() => import('mermaid')` | Stock Mermaid for diagram types mmdx does not draw and for the editor's "Plain Mermaid" preview |
| `measure` | `TextMeasurer` | a canvas measurer (static estimate where no canvas exists) | How text is measured for layout |

Stock Mermaid always runs with `securityLevel: 'strict'`, through one queue shared by all instances. mmdx gives it its theme (`default` or `dark`, following the component's scheme), its look (`classic`) and its layout (`dagre`) explicitly, so Mermaid 10 to 12 draw alike: Mermaid 12 changed these defaults (the `redux-color` theme, the `neo` look, the ELK layout).

## registerThemes()

`registerThemes(files)` registers theme files into the shared registry with no fetch; the theme menus list them. Every element entry exports it, and it returns the validation diagnostics (invalid values are dropped):

```ts
import { registerThemes } from 'mmdx/editor';
import { BUILTIN_THEMES } from 'mmdx/core';
import dracula from 'mmdx/themes/dracula.theme.json';
import roseDawn from 'mmdx/themes/rose-pine-dawn.theme.json';

const diagnostics = registerThemes([...BUILTIN_THEMES, dracula, roseDawn]);
```

A file with the id of a registered theme replaces it.

## registerBuiltinThemes()

`registerBuiltinThemes()` registers Default Dark next to Default Light (it loads as a chunk of the library) and resolves once both are in the shared registry. Components that list themes call it themselves on start; call it when you need the pair registered before anything is shown. After `registerThemes(BUILTIN_THEMES)` nothing loads.

## setWorkerUrl()

Diagrams over 300 lines render in a module worker. The worker file sits next to the library's chunks (`assets/render-worker-….js`) and your bundler emits it. `setWorkerUrl(url, { type })` from `mmdx/viewer` points the components at another copy — for a host with a strict CSP that serves the file itself (`worker-src 'self'`):

```ts
import { setWorkerUrl } from 'mmdx/viewer';

setWorkerUrl('/static/mmdx/render-worker.js'); // type: 'module' by default
```

`type: 'classic'` starts a classic worker; `useInlineWorker()` from `mmdx/worker-inline` uses it to start the worker from a `blob:` URL in [sandboxed iframes](/guide/sandboxed-iframes#worker). When no worker can start (a CSP without `worker-src`, `file://`, old engines), diagrams render on the main thread.

## UI strings (i18n)

Every UI string goes through a message key. English is bundled; `configure({ i18n })` sets the locale and a catalog of strings that win over the English ones. Keys you leave out stay English:

```ts
configure({
  i18n: {
    locale: 'de',
    messages: {
      'zoom.in': 'Vergrößern',
      'zoom.out': 'Verkleinern',
      'zoom.fit': 'Einpassen',
      'fullscreen.enter': 'Vollbild',
      'label.flowchart': 'Flussdiagramm: {nodes} Knoten, {edges} Verbindungen',
    },
  },
});
```

Placeholders in braces (`{nodes}`) are filled in by the component. The English catalogs are the reference for the keys:

| File | Strings of |
|---|---|
| `src/i18n.ts` | The viewer: zoom, full screen, layers, pen, export, code view, errors, accessible names (`label.*`) |
| `src/view/messages.ts` | The tool dock, pen, view settings, code view and History button shared by every component |
| `src/editor/messages.ts` | The editor's panels and chrome |
| `src/editor/messages-media.ts` | The editor's insert parts that load on demand: the shape palette's sections, the pickers' toasts, the Icon and Image sections of Properties |
| `src/ui/messages/toolbar.ts`, `toolbar-media.ts` | The style toolbar and page toolbar; the toolbar's icon, image and shape palette controls (registered when they load) |
| `src/diff/messages.ts`, `src/ui/messages/blocks-diff.ts` | `<mmdx-diff>` and History |
| `src/theme-editor/messages.ts` | `<mmdx-theme-editor>` |
| `src/ui/messages/blocks.ts`, `blocks-panels.ts` | Shared UI pieces |
| `src/ui/messages/blocks-media.ts` | The editor's insert dock: shape palette, icon picker, image tool, emoji picker (registered when they load) |

The English strings of a component are registered when the component is first used, so a page with only viewers ships only the viewer's strings. The accessible name of a viewer (`label.flowchart`, `label.sequence`, `label.er`, `label.mindmap`, `label.state`) can also be set per element with the `label` attribute.

## Per-instance overrides

`configure()` sets the defaults; these element properties override them for one instance:

| Property | Elements | Overrides |
|---|---|---|
| `themeSource` | viewer, editor, diff | Where this component loads unknown themes from |
| `storage` | viewer, editor, diff, theme editor, studio | Where UI preferences are kept (default `localStorage` under `mmdx.` keys, memory where it is unavailable) |
| `theme`, `theme-dark`, `ui` (attributes) | viewer, editor, diff | The theme and the chrome scheme |
| `ctx` | diff (property); the `ctx` option of `DiagramViewer`, `DiagramEditor` and `DiagramDiff` | A partial `CoreContext`: `themes` (a registry of its own), `measure`, `linkPolicy`, `imagePolicy`, `resolveUrl`, `icons` (an icon registry of its own), `locale` |
| `iconPacks` | the `iconPacks` option of `DiagramViewer`, `DiagramEditor` and `DiagramDiff` | Icon packs of this component, over the shared ones of `configure({ iconPacks })` |
| `images` | editor (property, no attribute), the `images` option of `DiagramEditor` | The host's image store ([`ImageStore`](/api/adapters#images)): the image tool's Library, and where uploads go |
| `uploadImage` | editor (property, no attribute), the `uploadImage` option of `DiagramEditor` | Uploads a picture dropped, pasted or chosen in the image tool: `async (file) => ({ url })`; without it images are added by URL only (see [Images](/components/editor#images)) |

```ts
import { DiagramViewer } from 'mmdx/viewer';
import { DEFAULT_LINK_POLICY } from 'mmdx/core';
import { memoryStorage } from 'mmdx/adapters';

const viewer = new DiagramViewer(hostElement, {
  source,
  storage: memoryStorage(),                                    // nothing remembered across page loads
  ctx: { linkPolicy: { ...DEFAULT_LINK_POLICY, target: '_self' } }, // links open in the same tab
});
```

`ctx` is read when the component is created: a change on a live component warns once.

## Storage

UI preferences — open panels, panel widths, the light / dark toggle, the picked theme — are kept per component kind under keys such as `editor.ui`, `viewer.theme` and `diff.panels`. The document itself is never stored there. `mmdx/adapters` has three `StorageAdapter`s:

| Adapter | Use |
|---|---|
| `localStorageAdapter(namespace = 'mmdx.')` | The default: `localStorage` under a prefix, memory when it is unavailable |
| `memoryStorage(initial?)` | For the page's life only |
| `preloadedStorage(read, write, { onError? })` | Over a host's async key-value store (sandboxed iframes) |

A `StorageAdapter` is `{ get(key), set(key, value), remove(key) }`, synchronous. See [Sandboxed iframes](/guide/sandboxed-iframes#storage) for `preloadedStorage`.

See also the [configuration API reference](/api/configuration).
