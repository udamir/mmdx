// `accDescr { … }` blocks, shared by the line-based parsers (flowchart, sequence).
import { checkStatement, stripControl } from './limits.js';

/**
 * `accDescr { … }`: the description over the lines up to the first `}`; each line read once (B2). Returns the text
 * and the index of its last line.
 */
export function readAccDescrBlock(first: string, lines: readonly string[], li: number): { text: string; last: number } {
  const parts = [first];
  let closed = first.includes('}'), length = first.length;
  while (!closed && li + 1 < lines.length) {
    const l = lines[++li] ?? '';
    parts.push(l);
    closed = l.includes('}');
    checkStatement((length += l.length + 1));
  }
  const body = parts.join('\n');
  const text = body.slice(0, closed ? body.indexOf('}') : undefined).split('\n').map((l) => stripControl(l).trim()).filter(Boolean).join('\n');
  return { text, last: li };
}
