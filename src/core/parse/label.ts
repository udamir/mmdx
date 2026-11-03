// Mermaid label text <-> plain text. `cleanLabel` reads a label as written in the code; `encodeLabel` is its inverse
// for write-back (`id["…"]`): newlines become `<br>`, `"` becomes `#quot;`, and only text that would otherwise be
// decoded on the way back in is escaped, so ordinary labels stay readable in the code.

// One pass, so `&amp;lt;` reads as `&lt;` rather than being decoded twice. `</br>` breaks a line too, as in Mermaid.
const DECODE = /<\/?br\s*\/?>|#quot;|#(\d{1,7});|&(amp|lt|gt);/gi;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>' };

/** True for a label written as a Mermaid markdown string (`"`…`"`): its emphasis is drawn and it wraps on its own (T06). */
export function isMarkdownString(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  let t = raw.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) t = t.slice(1, -1);
  return t.length >= 2 && t.startsWith('`') && t.endsWith('`');
}

export function cleanLabel(s: string | null | undefined): string {
  if (s == null) return '';
  let t = String(s).trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) t = t.slice(1, -1);
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`')) t = t.slice(1, -1);
  return t.replace(DECODE, (m: string, num?: string, ent?: string) => {
    if (num !== undefined) {
      const cp = Number(num);
      // surrogates and out-of-range code points stay as written
      return cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : m;
    }
    if (ent !== undefined) return ENTITIES[ent.toLowerCase()] ?? m;
    return m.startsWith('<') ? '\n' : '"';
  });
}

/** Text -> the inside of a double-quoted Mermaid label. `cleanLabel('"' + encodeLabel(s) + '"') === s` for trimmed `s`. */
export function encodeLabel(s: string): string {
  let t = String(s)
    .replace(/&(?=(?:amp|lt|gt);)/gi, '&amp;')
    .replace(/#(?=(?:quot|\d{1,7});)/gi, '#35;')
    .replace(/<(?=\/?br\s*\/?>)/gi, '&lt;')
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, '<br>');
  // a label wrapped in backticks would read back as a markdown string
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`')) t = '#96;' + t.slice(1);
  return t;
}

/**
 * A label as written inside its bracket or pipes: `"…"`, or a markdown string `"`…`"` when `md` is set (its emphasis
 * as typed, line breaks as `<br/>`, which Mermaid's markdown reads in HTML and SVG labels alike).
 */
export const labelText = (s: string, md = false): string =>
  md ? `"\`${encodeLabel(s).replace(/^#96;/, '`').replace(/<br>/g, '<br/>')}\`"` : `"${encodeLabel(s)}"`;

/** The text of a markdown string as Mermaid reads it: the indentation after a line break is dropped, blank lines collapse. */
export const markdownText = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n');
