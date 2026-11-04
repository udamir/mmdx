# Security

Diagram sources, metadata and theme files are treated as untrusted input: a diagram can come from a merge request, a wiki page or a file someone uploaded. Every value is validated when it is read, the SVG is built through one escaping serializer, links go through a link policy, images through an image policy, and size limits keep a hostile diagram from freezing the page.

## Untrusted input

These inputs are untrusted, and handled as such:

- the Mermaid source and its `%%@` metadata lines — from `src`, `source`, inline scripts, adapters, history versions and pasted text;
- theme files — from theme sources, stores, `registerThemes` and the theme editor's import;
- version records of a history (`id`, `message`, `author`, `date`, `url`);
- text that ends up in diff reports.

Nothing from a diagram is evaluated as code or inserted as HTML.

## Validation

- **Metadata.** Every value of a `%%@` line is validated when the line is parsed. An invalid value is dropped with a `meta.bad-value` diagnostic, and the rest of the line is kept. Lines that cannot be parsed are kept verbatim as unknown lines and never interpreted.
- **Themes.** Theme files are validated when they are loaded, registered or saved; invalid values are dropped with a diagnostic.
- **Ids and names from documents.** Mermaid accepts ids such as `__proto__`, `constructor` or `toString`. Ids, preset, palette and layer names are read and written as own properties only, so a diagram cannot reach or change `Object.prototype`.
- **History records.** `httpHistoryAdapter` keeps only the known string fields of each version from the server.

Diagnostics reach the host through `mmdx-error` `{ diagnostics }` and the `diagnostics` of `renderSource`.

## The serializer

Every SVG — on screen, exported, or rendered on the server — is built from a scene tree by one serializer:

- text and attribute values are escaped;
- only an allowlist of presentation and geometry attributes (`fill`, `stroke`, `x`, `d`, `transform`, `font-family`, …) and the library's own `data-*` attributes are written; anything else is dropped;
- `url(…)` values are allowed only as local fragment references (`url(#marker-1)`) in marker, clip-path, fill and stroke attributes — never `url(javascript:…)` or a remote resource;
- `href` is not an allowed attribute name: only `<a>` writes it, from a URL that passed the link policy, and `<image>`, from a URL that passed the image policy or an icon mmdx built itself.

## No innerHTML for diagram content

The components build and update their SVG and UI with DOM calls, and text goes into text nodes; diagram content is never set through `innerHTML`. The exceptions are the library's own constant icon markup and the SVG of stock Mermaid for diagram types mmdx does not draw, which Mermaid renders with `securityLevel: 'strict'` and sanitises itself. `upgradeMermaidBlocks()` reads code blocks through `textContent` and hands the code to the viewer as a property. The Markdown plugins escape the source for the inline `<script type="text/mermaid">` (`scriptSafe`), and the Markdown diff report escapes diagram text so a label cannot inject Markdown.

## Link policy

Diagram items can carry links — the `link` metadata key, or Mermaid's `click <id> "<url>"`. Every link goes through `safeUrl(url, policy)` before it reaches the SVG:

- it must be a string of at most 2048 characters, with no control characters, whitespace or backslashes (which browsers strip before the scheme: `java\tscript:`);
- a relative URL (a path, query or fragment) passes, except a protocol-relative one (`//evil.com`);
- an absolute URL passes only when its protocol is in the policy's `protocols`.

```ts
// the default, DEFAULT_LINK_POLICY in @mmdx/studio/core
{ protocols: ['https:', 'http:', 'mailto:'], target: '_blank' }
```

`javascript:`, `data:` and every protocol you do not list are rejected. Set your own policy app-wide with `configure({ linkPolicy })`, or per component through the `ctx` option:

```ts
import { configure } from '@mmdx/studio/viewer';

configure({ linkPolicy: { protocols: ['https:'], target: '_self' } });
```

A click on a linked item fires `mmdx-link` `{ href, id }` first; it is cancelable, to route links through your router or confirm external ones:

```ts
viewer.addEventListener('mmdx-link', (e) => {
  if (!e.detail.href.startsWith('/')) return; // external links open with the policy's target
  e.preventDefault();
  router.push(e.detail.href);
});
```

## Image policy

Diagrams reference images by URL; mmdx never embeds an image in a diagram file, and the editor never writes a `data:` image. Before an image URL from a diagram reaches the SVG, it goes through `checkImageUrl(url, policy)` (`@mmdx/studio/core`):

- it must be a string with no control characters, whitespace or backslashes, of at most 2048 characters;
- an absolute URL passes only when its protocol is in the policy's `protocols`, and, when the policy lists `hosts`, its host is one of them;
- a `data:` URL (only with `data:` in `protocols`) must be base64 of one of the policy's `dataTypes`, at most `maxDataBytes` decoded;
- a relative URL passes only with `relative: true`, and a protocol-relative one (`//host/…`) never.

```ts
// the default, DEFAULT_IMAGE_POLICY in @mmdx/studio/core
{
  protocols: ['https:'],
  dataTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'],
  maxDataBytes: 262144,
}
```

So by default a diagram shows `https:` images from any host; `http:` and `data:` images are off. An image the policy refuses is never written to the SVG: the item shows a placeholder (a dashed frame with a mountain glyph and the reason where it fits), and the render reports an `image.blocked` warning at the item's line, with the `reason` (`protocol`, `data-off`, `data-type`, `data-size`, `host`, `relative` or `invalid`) in its `params`.

Remote images load from the image host when the diagram is shown, which tells that host the viewer's IP address and the page (SVG `<image>` has no `referrerpolicy`). For diagrams from untrusted authors, allow only the hosts you trust, or no images at all:

```ts
import { configure } from '@mmdx/studio/viewer';
import { DEFAULT_IMAGE_POLICY } from '@mmdx/studio/core';

configure({ imagePolicy: { ...DEFAULT_IMAGE_POLICY, hosts: ['images.example.com', '*.cdn.example.com'] } });
configure({ imagePolicy: { ...DEFAULT_IMAGE_POLICY, protocols: [] } }); // no images
```

Set it app-wide with `configure({ imagePolicy })`, per component through the `ctx` option, or per render with `createContext({ imagePolicy })`. Hosts that want embedded images back (files written elsewhere, such as Mermaid Chart's) add `'data:'` to `protocols`.

Icons are not images from the diagram: mmdx builds each icon's SVG itself from a validated icon body and draws it as a `data:image/svg+xml` image, which runs no script and loads nothing. The image policy does not apply to them, and their markup is never put into the page. An icon body from a pack is read by a strict SVG tokenizer and written out again from what it read: shapes, gradients, masks, clip paths, filters and `use` only, geometry, paint and transform attributes; `<script>`, `<foreignObject>`, `<image>`, `on*` attributes, an `href` or `url()` that is not `#id`, entities and bodies over 64 KB are refused, and the icon is drawn as a placeholder. See [Icons](/guide/icons#security).

## Resolving URLs

A host decides what the URLs in its diagrams point at with `configure({ resolveUrl })` (or the `ctx` option, or `createContext({ resolveUrl })` for a render): a function called with each image and link URL as written and its kind, `'image'` or `'link'`. It returns the URL to use — a relative path made absolute against the document's folder, an attachment's name made its download URL — or null / undefined to use the URL as written; a resolver that throws leaves it as written too. The result then goes through the image or link policy like a written URL, so a resolver that makes `logo.png` into `https://tracker.example/files/logo.png` lets it show under the default policy (`relative` stays off), and one that returns an `http:` URL is still refused. The diagram's code and metadata keep what was written; only the SVG carries the resolved URLs.

```ts
import { configure } from '@mmdx/studio/viewer';

configure({
  resolveUrl: (url, kind) => {
    if (/^[a-z][a-z0-9+.-]*:|^[/#?]/i.test(url)) return null; // absolute, root-relative or a fragment: as written
    return kind === 'image' ? `${issue.url}/attachments/${encodeURIComponent(url)}` : new URL(url, document.baseURI).href;
  },
});
```

A function does not reach the render worker, so while a resolver is set every diagram renders on the main thread.

PNG export draws the SVG through an image, which loads no external resources, so it fetches each remote image first (`mode: 'cors'`, no credentials, 10 s and 5 MB at most) and puts it inline. An image host that sends no CORS headers cannot be included: the PNG shows the placeholder there, a toast says how many images are missing, and `mmdx-error` carries an `export.image-missing` warning. SVG export and server-side rendering keep the URLs as they are and fetch nothing.

## Limits

| Limit | Value | What happens |
|---|---|---|
| Mermaid source size | 1 048 576 characters (about 1 MB) | The diagram is not parsed; `doc.too-large` diagnostic, the viewer shows *Diagram too large* |
| Items | 5 000 per diagram (nodes, groups and edges; participants and sequence items; tables and relationships) | Parsing stops and nothing is rendered; `doc.too-many-items` diagnostic |
| Render time in the worker | 2 s per diagram | The worker is restarted and the diagram is reported as too large |

Diagrams over 300 lines render in the worker, so a slow diagram never blocks the page; the timeout starts when the worker takes the job.

## Stock Mermaid

Diagram types mmdx does not draw are rendered by stock Mermaid (when installed), always with `securityLevel: 'strict'`, in a detached container, one diagram at a time.

## Content Security Policy

The components run under this CSP:

```http
Content-Security-Policy: script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; img-src 'self' data: blob: https://images.example.com
```

- Styles are adopted into each shadow root as constructable stylesheets, so the components need no inline `<style>` element where `adoptedStyleSheets` is supported.
- The render worker loads from its own file next to the library's chunks (`worker-src 'self'`). `setWorkerUrl(url)` points the components at a copy you serve; `useInlineWorker()` from `@mmdx/studio/worker-inline` starts it from a `blob:` URL (`worker-src blob:`). Without a worker, diagrams render on the main thread.
- Nothing is evaluated from strings, and diagram types load as chunks of the library.
- `img-src` must allow `data:` (icons are drawn as `data:` images) and `blob:` (PNG export draws the SVG through a `blob:` image). Add the hosts of the images your diagrams show (the image policy decides which ones a diagram may use; the CSP is the browser's own check on top). PNG export also fetches those images, so `connect-src` must allow the same hosts when you offer PNG export of diagrams with remote images.

See [Sandboxed iframes](/guide/sandboxed-iframes#csp) for a frame's policy.
