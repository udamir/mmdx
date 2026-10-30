// Line-level helpers shared by the source-rewriting ops (prototype edit.js / connect.js). Every op splits the
// Mermaid code into lines, edits them against the parser's 0-based line numbers, and joins them again.

/** One replacement against the ORIGINAL line numbers: delete `del` lines at `at`, insert `ins` there. */
export interface LineEdit {
  at: number;
  del: number;
  ins: string[];
}

export const indentOf = (l: string | undefined): string => /^\s*/.exec(l ?? '')?.[0] ?? '';

export function splice(code: string, at: number, del: number, ins: readonly string[]): string {
  const L = code.split('\n');
  L.splice(at, del, ...ins);
  return L.join('\n');
}

/** Appends lines after the code (trailing blank lines dropped), ending with a newline. */
export const append = (code: string, lines: readonly string[]): string => `${code.replace(/\s+$/, '')}\n${lines.join('\n')}\n`;

/** Applies several edits computed against the original line numbers (bottom-up, so they do not shift each other). */
export function applyEdits(code: string, edits: readonly LineEdit[]): string {
  const L = code.split('\n');
  for (const e of [...edits].sort((a, b) => b.at - a.at)) L.splice(e.at, e.del, ...e.ins);
  return L.join('\n');
}

/** Index after the last non-blank line. */
export function contentEnd(L: readonly string[]): number {
  let end = L.length;
  while (end > 0 && !(L[end - 1] ?? '').trim()) end--;
  return end;
}

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

