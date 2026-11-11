// Text formatters shared by blocks and products (A5): what a block used to export for its neighbours.

/** Relative age of an ISO date (`3 days ago`), or '' without a valid date. */
export const ago = (iso: string | undefined, locale: string): string => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return '';
  const s = (Date.now() - ms) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 60) return rtf.format(-Math.round(s / 86400), 'day');
  return rtf.format(-Math.round(s / (86400 * 30)), 'month');
};

/**
 * A document's name from a file name, a path or a URL (exports, titles, X12): its last segment without the query and
 * the hash, and without a document extension (`.mmdx`, `.mmd`, `.md`, `.markdown`, `.txt`, `.json`); `fallback` when
 * nothing is left.
 */
export function fileStem(name: string | null | undefined, fallback = 'diagram'): string {
  const last = (name ?? '').split(/[?#]/)[0]!.split(/[/\\]/).pop() ?? '';
  return last.replace(/\.(mmdx|mmd|md|markdown|txt|json)$/i, '') || fallback;
}

