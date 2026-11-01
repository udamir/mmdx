# Inline worker

`@mmdx/studio/worker-inline` is the render worker as a string, for pages that cannot start it from a URL: sandboxed iframes with an opaque origin, where module workers from URLs fail. `useInlineWorker()` starts it from a `blob:` URL, so diagrams over 300 lines render off the main thread there too. Import it next to `@mmdx/studio/viewer` or `@mmdx/studio/editor`.

```ts
import '@mmdx/studio/viewer';
import { useInlineWorker } from '@mmdx/studio/worker-inline';

useInlineWorker(); // before the first large diagram renders
```

## When to use it

The viewer renders diagrams with more than 300 source lines in a render worker (see [Render worker](/api/configuration#render-worker)). By default it starts that worker as a module worker from the library's own file, which works on ordinary pages. A page with an opaque origin (an app inside another product, a plugin frame: a sandboxed iframe without `allow-same-origin`) cannot start module workers from URLs; there the worker fails to start and every diagram renders on the main thread, which can block the page for large diagrams.

Use this entry on such pages. Pages that can start the worker from its file do not need it, and pages with a strict CSP that serve the worker file themselves use [`setWorkerUrl()`](/api/configuration#setworkerurl) instead. See [Sandboxed iframes](/guide/sandboxed-iframes) for the other hooks such hosts need.

::: warning CSP
The page's Content Security Policy must allow workers from `blob:` URLs: `worker-src blob:`. If the policy blocks them, the worker fails to start and diagrams render on the main thread.
:::

## Size

Only pages that import the entry download the worker source: about 39 kB gzip on top of the viewer. The viewer and editor entries do not contain it. The repository's size check (`pnpm size`, `tools/size.mjs`) has no budget row for this entry; it only keeps the viewer and diff budgets with the worker client in a chunk of its own, which the entry shares with the viewer.

## API

### `useInlineWorker()`

```ts
function useInlineWorker(): boolean;
```

Starts the render worker from a `blob:` URL of [`workerSource`](#workersource), through `setWorkerUrl(url, { type: 'classic' })`. Returns `true` when the worker URL was set.

Returns `false` when `Blob` or `URL.createObjectURL` is unavailable, or creating the URL throws. Nothing changes then: diagrams render as before, with the worker from its file (or the URL an earlier `setWorkerUrl()` set), else on the main thread.

Calling it again reuses the same `blob:` URL (it is created once per page and never revoked), but, like every `setWorkerUrl()` call, restarts the worker: a job in flight renders on the main thread. Call it once, at startup.

`true` means the URL is set, not that the worker runs: if the worker then fails to start (a CSP that blocks `blob:` workers, no `Worker` at all), the viewer renders every diagram on the main thread, as with any worker URL.

The hook name starts with `use` but it is not a React hook: it is a plain function you call once.

### `workerSource`

```ts
const workerSource: string;
```

The render worker as one classic script with no imports: the worker module and everything it uses, bundled by esbuild as a minified IIFE when the library is built. Use it when you start the worker yourself, for example from a URL your host provides:

```ts
import { setWorkerUrl } from '@mmdx/studio/viewer';
import { workerSource } from '@mmdx/studio/worker-inline';

const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
setWorkerUrl(url, { type: 'classic' });
```

This is what `useInlineWorker()` does. Start the script as a classic worker (`type: 'classic'`).

## Relation to `setWorkerUrl()`

[`setWorkerUrl(url, { type })`](/api/configuration#setworkerurl) from `@mmdx/studio/viewer` decides where the render worker comes from; `type` is `'module'` by default and `'classic'` for this entry's source. `useInlineWorker()` is a shortcut for `setWorkerUrl(blobUrlOf(workerSource), { type: 'classic' })`. Both act on the same worker client as the viewer, so import them from the same copy of the package as the viewer (one bundle, one `node_modules` copy); otherwise the call configures a worker client the viewer does not use.

## How it is built

Advanced: the entry imports `virtual:mmdx-render-worker-source`, a virtual module that the library's Vite build (`vite.lib.config.ts`) resolves with the `workerSourcePlugin()` of `tools/worker-source.mjs`. The plugin bundles `src/dom/render-worker.ts` with esbuild (`format: 'iife'`, `target: 'es2022'`, minified) and exports the result as a string. The string is part of the published `dist/worker-inline.js`, so apps that use the entry need no plugin of their own.
