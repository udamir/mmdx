// Mermaid label text <-> plain text. `cleanLabel` reads a label as written in the code; `encodeLabel` is its inverse
// for write-back (`id["…"]`): newlines become `<br>`, `"` becomes `#quot;`, and only text that would otherwise be
// decoded on the way back in is escaped, so ordinary labels stay readable in the code.

// One pass, so `&amp;lt;` reads as `&lt;` rather than being decoded twice.
const DECODE = /<br\s*\/?>|#quot;|#(\d{1,7});|&(amp|lt|gt);/gi;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>' };

/** True for a label written as a Mermaid markdown string (`"`…`"`), which is shown as plain text. */
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
    .replace(/<(?=br\s*\/?>)/gi, '&lt;')
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, '<br>');
  // a label wrapped in backticks would read back as a markdown string
  if (t.length >= 2 && t.startsWith('`') && t.endsWith('`')) t = '#96;' + t.slice(1);
  return t;
}
