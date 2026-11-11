// ER ids and labels as the writers put them in the code (T11, E2), apart from the parser so the editor's ops do not
// load it. Mermaid's lexer takes the first rule that matches, so an id is written bare only when its plain-word rule
// (`([^\x00-\x7F]|\w|-|\*|\.)+`) is the one that reads all of it: not a cardinality word (`one`, `many`, `to`), a
// number, a keyword (`class`, `end`, `subgraph`…) or a line holding `direction TB`. Anything else is quoted.
import { encodeLabel } from '../../parse/label.js';

const WORD = /^(?:[^\x00-\x7F]|[\w\-*.])+$/;
// the lexer rules before the plain word that can match at the start of a word (erDiagram.jison, rules 0–79)
const EARLIER = /^(?:accTitle\s*:|accDescr\s*[:{]|erDiagram\b|style\b|classDef\b|class\b|subgraph\b|end\b|one or zero\b|one or more\b|one or many\b|1\+|zero or one\b|zero or more\b|zero or many\b|0\+|many\(0\)|many\(1\)|many\b|one\b|only one\b|[0-9]|u(?=[.\-|])|\.\.|--|to\b|optionally to\b|\.-|-\.)/i;
const DIRECTION = /direction\s+(?:TB|BT|RL|LR)/i;

/** True when Mermaid reads `s` as one plain word. */
export const isErWord = (s: string): boolean => WORD.test(s) && !EARLIER.test(s) && !DIRECTION.test(s);

/** An entity or subgraph id as written: bare when Mermaid reads it as one word, else in double quotes. */
export const erId = (id: string): string => (isErWord(id) ? id : `"${id}"`);

/**
 * A quoted ER text (an alias, a label, a subgraph title): Mermaid's escapes for `"`, line breaks and entity codes,
 * and `%` / `\` as entity codes (a quoted name cannot hold them).
 */
export const erQuoted = (s: string): string => `"${encodeLabel(s).replace(/%/g, '#37;').replace(/\\/g, '#92;')}"`;

/** A relationship label: one plain word bare, anything else quoted (`""` for none). */
export const erLabel = (s: string): string => (s && isErWord(s) ? s : erQuoted(s));
