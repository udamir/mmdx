// The default loader of a URL attribute (`src` of <mmdx-viewer>, `before` / `after` of <mmdx-diff>): the text at the URL, fetched with the page's same-origin credentials; an HTTP error status rejects.
import { okFetch } from './http.js';

/** Fetches the text at a URL (same-origin credentials); rejects with `HTTP <status>` on an error status. */
export async function fetchText(url: string): Promise<string> {
  return (await okFetch(url, { credentials: 'same-origin' })).text();
}
