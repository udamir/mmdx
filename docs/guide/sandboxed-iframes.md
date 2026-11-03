# Sandboxed iframes

Hosts that run mmdx in a sandboxed iframe with an opaque origin — an app inside another product, a plugin frame — usually have no `allowfullscreen`, no `localStorage`, no relative `fetch` and no module workers from URLs. The diagram types and the chrome's pieces still load as JavaScript chunks of your bundle (`import()`), like the rest of your app's code; the hooks on this page replace the rest.

## At a glance

```ts
import { registerThemes, type HostFullscreen } from '@mmdx/studio/viewer';
import { starterSource, BUILTIN_THEMES } from '@mmdx/studio/core';
import { preloadedStorage } from '@mmdx/studio/adapters';
import { useInlineWorker } from '@mmdx/studio/worker-inline';
import github from '@mmdx/studio/themes/github-light.theme.json';

// themes: registered from your bundle, nothing is fetched (the menus list them)
registerThemes([...BUILTIN_THEMES, github]);

// the render worker from a blob: URL (diagrams over 300 lines render off the main thread)
useInlineWorker();

// UI preferences in the host's async key-value store
const storage = await preloadedStorage(() => host.storage.getAll(), (key, value) => host.storage.set(key, value));

// full screen through the host (a modal), since the frame has no allowfullscreen
const fullscreen: HostFullscreen = { available: () => true, enter: () => host.enterModal(), exit: () => host.exitModal() };
viewer.storage = storage;
viewer.fullscreen = fullscreen;
viewer.setAttribute('ui', host.theme); // the host owns light / dark …
viewer.setAttribute('scheme-toggle', 'false'); // … so the theme menu stays and the toggle goes

// a new diagram starts from the studio's starter; a draft comes back as unsaved, undoable changes
editor.adapter = adapter;
editor.storage = storage;
editor.features = { schemeToggle: false };
await editor.whenLoaded();
if (draft) editor.setSource(draft, { history: 'push', markSaved: false });
const blank = starterSource('sequence'); // 'flowchart' | 'sequence' | 'er'
```

`host` stands for whatever API the embedding product gives the frame.

| Missing in the frame | Hook |
|---|---|
| `allowfullscreen` | The viewer's [`fullscreen`](#full-screen) property |
| `localStorage` | [`preloadedStorage`](#storage) or `memoryStorage` |
| Relative `fetch` of theme files | [`registerThemes`](#themes) |
| Module workers from URLs | [`useInlineWorker`](#worker) |
| Relative `fetch` of diagrams | The [`source` property and adapters](#loading-diagrams) |

## Full screen

Without `allowfullscreen`, the browser's full screen is unavailable. The viewer's `fullscreen` property (type `HostFullscreen`) lets the host page show it full screen instead:

```ts
interface HostFullscreen {
  /** Whether the host can show the component full screen now. */
  available(): boolean;
  enter(): Promise<void>;
  exit(): Promise<void>;
  /** Whether the host shows it full screen, for hosts that can leave full screen by themselves. */
  active?(): boolean;
}
```

- When the browser's full screen is unavailable and `available()` is true, the zoom bar's full-screen button shows and calls `enter()` / `exit()` within the click (the host may need the user's activation).
- While the host shows it full screen, the viewer fills its frame and has a `data-fullscreen` attribute; `mmdx-fullscreen` `{ active }` fires on every change.
- Give `active()` when the host can leave full screen by itself (its own close button); it is read on the next click and when the window resizes.
- `mmdx-fullscreen-request` `{ enter }` comes first and is cancelable, to handle full screen yourself:

```ts
viewer.addEventListener('mmdx-fullscreen-request', (e) => {
  e.preventDefault();
  host.openInModal({ diagram: viewer.source });
});
```

`setControls(list)` (or the `controls` attribute) changes the viewer's controls at run time, for example to add `fullscreen` once the host says it can.

## Storage

The components keep UI preferences (open panels, widths, the light / dark toggle, the picked theme) through a synchronous `StorageAdapter`; the default is `localStorage`, which an opaque origin does not have. `preloadedStorage(read, write, { onError? })` from `@mmdx/studio/adapters` serves it over the host's async key-value store:

- it awaits `read()` once, for every stored key and value;
- then it serves reads from memory and writes each change through `write(key, value)` in the background, in order per key (`remove(key)` writes `undefined`);
- a failed write is ignored, or reported to `onError(error, key)`; the value stays in memory.

```ts
import { preloadedStorage } from '@mmdx/studio/adapters';

const storage = await preloadedStorage(
  () => host.storage.getAll(),                 // Promise<Record<string, unknown>>
  (key, value) => host.storage.set(key, value), // Promise<void>; value undefined: remove
  { onError: (e, key) => console.warn('mmdx preference not saved', key, e) },
);
viewer.storage = storage;
editor.storage = storage;
```

Without any store, `memoryStorage()` keeps preferences for the page's life. The document itself is never kept in storage.

## Themes

`registerThemes(files)` (from every element entry) registers theme files into the shared registry, with no fetch; import the files you want from `@mmdx/studio/themes/*`. Default Light is part of every component; Default Dark loads as a chunk of the library on first use, or not at all after `registerThemes(BUILTIN_THEMES)`. `registerBuiltinThemes()` resolves once both are registered.

Do not set a `themeSource` that fetches. If the host stores custom themes, read them through its API and register them:

```ts
registerThemes(await host.storage.get('themes') ?? []);
```

See [Themes](/guide/themes#registering-themes).

## Worker

Diagrams over 300 lines render in a worker. `@mmdx/studio/worker-inline` exports the render worker as one classic script (`workerSource`) and `useInlineWorker()`, which starts it from a `blob:` URL through `setWorkerUrl(url, { type: 'classic' })`:

```ts
import { useInlineWorker } from '@mmdx/studio/worker-inline';

if (!useInlineWorker()) console.info('diagrams render on the main thread');
```

It returns false when `Blob` or `URL.createObjectURL` is unavailable; diagrams then render on the main thread. Calling it again reuses the URL. The CSP needs `worker-src blob:`. Only pages that import it download the extra 39 kB (gzip). See [`@mmdx/studio/worker-inline`](/api/worker-inline).

## Loading diagrams

`src` on the viewer and `before` / `after` on the diff are fetched with the page's `fetch`, which cannot reach relative URLs from an opaque origin. Hand the sources over instead:

- the viewer's `source` property (or a `loader` function that fetches through the host);
- the editor's `adapter` (a `DocumentAdapter` over the host's API — see [Saving documents](/guide/documents)) or `value`;
- the diff's `beforeSource` / `afterSource`, or a `history` adapter.

```ts
viewer.loader = (url) => host.files.readText(url); // src="…" now goes through the host
viewer.setAttribute('src', 'diagrams/arch.mmdx');
```

## Light and dark

When the host decides the light / dark scheme (an app inside a product follows the product's theme), set `ui` to `light` or `dark` and hide the toggle, keeping the theme menu:

- the viewer: `scheme-toggle="false"` (the `schemeToggle` option);
- the editor: `features = { schemeToggle: false }`.

Update `ui` when the host's theme changes.

## Drafts

`<mmdx-editor>`'s `setSource(src, { history, fit, markSaved })` with `markSaved: false` keeps the source as unsaved changes; with `history: 'push'` the user can undo back to the saved document. `whenLoaded()` resolves once the adapter's document is in (`mmdx-load` `{ source, version }` fires then), so a restored draft is not overwritten by the load:

```ts
editor.adapter = adapter;
await editor.whenLoaded();
const draft = await host.storage.get(`draft:${documentId}`);
if (draft) editor.setSource(draft, { history: 'push', markSaved: false });
editor.addEventListener('mmdx-change', (e) => {
  if (e.detail.reason !== 'load') void host.storage.set(`draft:${documentId}`, e.detail.source);
});
editor.addEventListener('mmdx-saved', () => void host.storage.set(`draft:${documentId}`, undefined));
```

See [Saving documents](/guide/documents#drafts).

## Starters

`starterSource('flowchart' | 'sequence' | 'er')` from `@mmdx/studio/core` is the source a new diagram starts from, as in the studio's New menu:

```ts
import { starterSource, type StarterType } from '@mmdx/studio/core';

function newDiagram(type: StarterType) {
  editor.setSource(starterSource(type)); // 'flowchart TB\n', 'sequenceDiagram\n' or 'erDiagram\n'
}
```

## CSP

The components run under this Content Security Policy (the one in [Security](/guide/security#content-security-policy)):

```http
Content-Security-Policy: script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob: https://images.example.com
```

- `script-src 'self'`: the library and its chunks are part of your bundle; nothing is evaluated from strings.
- `worker-src 'self' blob:`: the render worker from its file or, with `useInlineWorker()`, from a `blob:` URL. Without `blob:`, `useInlineWorker()` cannot start the worker and diagrams render on the main thread.

- `img-src 'self' data: blob:` and your image hosts: icons are drawn as `data:` images, PNG export draws the SVG into a canvas through a `blob:` image, and diagrams show remote images from the hosts the [image policy](/guide/security#image-policy) allows (`https:` by default). A frame whose CSP leaves out an image host shows the image as broken, though the policy allowed it; set the same hosts in both, or turn images off (`configure({ imagePolicy: { ...DEFAULT_IMAGE_POLICY, protocols: [] } })`), which draws placeholders instead.

The frame also needs `connect-src` for the APIs your adapters call, the font files of `configure({ fonts })`, and, for PNG export of diagrams with remote images, the image hosts: the export fetches each image to put it into the PNG, and an image host must answer with CORS headers (`Access-Control-Allow-Origin`) for it to be included — a sandboxed frame without `allow-same-origin` has an opaque `null` origin, so the host must allow `*`. An image that cannot be fetched is a placeholder in the PNG, with a toast and an `export.image-missing` warning. See [Security](/guide/security).
