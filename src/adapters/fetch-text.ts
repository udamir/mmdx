// The default loader of a URL attribute (`src` of <mmdx-viewer>, `before` / `after` of <mmdx-diff>): the text at the URL, fetched with the page's same-origin credentials; an HTTP error status rejects.

/** Fetches the text at a URL (same-origin credentials); rejects with `HTTP <status>` on an error status. */
export async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
