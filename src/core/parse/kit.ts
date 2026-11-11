// The parser kit (X2, task 4.3): what the Mermaid parsers did each in their own copy — an offset's line, a label's
// text, the quotes around a word, an `%%{init}%%` directive's keys. The frontmatter's rule is in frontmatter.ts, the
// jison lexers' preprocessing and first-match step in jison.ts (only the ER and state parsers lex that way, so the
// first flowchart a page draws does not load them).
import { decodeLabel } from './label.js';

// ---- lines ----------------------------------------------------------------------------------------------------------

/** An offset's line (0-based), by binary search over the line starts; `starts` are those starts. */
export type LineIndex = ((at: number) => number) & { readonly starts: readonly number[] };

export function lineIndex(src: string): LineIndex {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  const at = (o: number): number => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= o) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return Object.assign(at, { starts });
}

// ---- text -----------------------------------------------------------------------------------------------------------

// control characters, minus the line break a label keeps
// eslint-disable-next-line no-control-regex
const CONTROL_BUT_NL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;

/** Text without control characters; line breaks stay. */
export const textOnly = (s: string): string => s.replace(CONTROL_BUT_NL, '');

/** A label as Mermaid shows it: entity codes decoded, `<br>` as a line break, control characters out. */
export const labelText = (raw: string): string => textOnly(decodeLabel(raw));

/** A word without the one pair of double quotes around it (`"a b"` → `a b`). */
export const unquotePair = (s: string): string => (s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

/** A word without any double quotes at its ends (Mermaid's state ids: `""a""` → `a`). */
export const stripQuotes = (v: string): string => v.replace(/^"+|"+$/g, '');

// ---- `%%{init: {…}}%%` -----------------------------------------------------------------------------------------------

/** The text of a directive's `name: { … }` section (one level deep, as Mermaid's config sections are); '' when absent. */
export const initSection = (t: string, name: string): string => new RegExp(`["']?${name}["']?\\s*:\\s*\\{([^}]*)\\}`).exec(t)?.[1] ?? '';

/** A key of a directive's text (JSON-ish: quoted or not): its value; undefined when it is not there. */
export function initKey(t: string, key: string): string | undefined {
  const m = new RegExp(`["']?${key}["']?\\s*:\\s*(?:["']([^"']*)["']|([\\w.]+))`).exec(t);
  return m ? m[1] ?? m[2] ?? '' : undefined;
}
