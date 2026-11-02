# Security

Diagram sources, metadata and theme files are treated as untrusted input: a diagram can come from a merge request, a wiki page or a file someone uploaded. Every value is validated when it is read, the SVG is built through one escaping serializer, links go through a link policy, and size limits keep a hostile diagram from freezing the page.

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
- `url(…)` values are allowed only as local fragment references (`url(#marker-1)`) in marker, clip-path, fill and stroke attributes — never `url(javascript:…)` or remote images;
- `href`s accept only URLs that passed the link policy.

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
Content-Security-Policy: script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:
```

- Styles are adopted into each shadow root as constructable stylesheets, so the components need no inline `<style>` element where `adoptedStyleSheets` is supported.
- The render worker loads from its own file next to the library's chunks (`worker-src 'self'`). `setWorkerUrl(url)` points the components at a copy you serve; `useInlineWorker()` from `@mmdx/studio/worker-inline` starts it from a `blob:` URL (`worker-src blob:`). Without a worker, diagrams render on the main thread.
- Nothing is evaluated from strings, and diagram types load as chunks of the library.

See [Sandboxed iframes](/guide/sandboxed-iframes#csp) for a frame's policy.
