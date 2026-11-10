// Mermaid without styling: the structure only, for reading and copying (viewer code view) and for diff views.
import { KIND_INFO } from './kinds/info.js';
import { detectType } from './parse/dispatch.js';

/** Mermaid style statements (`classDef`, `class`, `style`, `linkStyle`). */
const STYLE_LINE = /^\s*(classDef|class|style|linkStyle)\s/;
/** `A:::cls` class shorthand, after an id or a closing shape bracket. */
const CLASS_SHORTHAND = /([\w\])}>])(:::[\w-]+)/g;
/** Quoted label text, which is left as written (`"a:::b"` is text, not a class). */
const QUOTED = /("[^"\n]*")/;

const withoutShorthand = (line: string): string =>
  line.split(QUOTED).map((part, i) => (i % 2 ? part : part.replace(CLASS_SHORTHAND, '$1'))).join('');

/**
 * Mermaid code (no `%%@` metadata) without classes and style statements. Runs of blank lines the removed
 * statements leave behind collapse to one, and trailing blank lines go. Only for the types that have such statements
 * (B8): a sequence message `see a:::b` or a mindmap node named `class notes` is text, kept as written.
 */
export function stripMermaidStyles(code: string): string {
  const type = detectType(code);
  if (type && !KIND_INFO[type].styleStatements) return code.trimEnd();
  return code
    .split('\n')
    .filter((l) => !STYLE_LINE.test(l))
    .map(withoutShorthand)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
