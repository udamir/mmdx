// Line-level helpers shared by the source-rewriting ops (prototype edit.js / connect.js). Every op splits the
// Mermaid code into lines, edits them against the parser's 0-based line numbers, and joins them again.
import type { LineResult } from './types.js';

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
export const append = (code: string, lines: readonly string[]): string => `${code.trimEnd()}\n${lines.join('\n')}\n`;

/** Applies several edits computed against the original line numbers (bottom-up, so they do not shift each other). */
export function applyEdits(code: string, edits: readonly LineEdit[]): string {
  const L = code.split('\n');
  for (const e of [...edits].sort((a, b) => b.at - a.at)) L.splice(e.at, e.del, ...e.ins);
  return L.join('\n');
}

/** A line at the end of the code (trailing blank lines dropped), ending with a newline, and its line number. */
export function appendLine(code: string, line: string): LineResult {
  const t = code.trimEnd();
  return { code: `${t}\n${line}\n`, line: t.split('\n').length };
}

/** The width of the indentation step a line starts with: two spaces or a tab (0: none). */
export const stepWidth = (l: string): number => (l.startsWith('  ') ? 2 : l.startsWith('\t') ? 1 : 0);

/** A line one indentation step to the left (two spaces or a tab off): an ungroup's contents. */
export const outdentLine = (l: string): string => l.slice(stepWidth(l));

/** Lines one indentation step to the left. */
export const outdentBlock = (lines: readonly string[]): string[] => lines.map(outdentLine);

/**
 * Lines moved from one indentation to another (a block moved into a new group, a copy, a subtree moved in the tree): `from`, the block's own indentation, becomes `to`, deeper lines keep what they have beyond it, a line indented less loses its indentation, and a blank line stays blank.
 */
export const reindentBlock = (lines: readonly string[], from: string, to: string): string[] =>
  lines.map((l) => (!l.trim() ? '' : to + (l.startsWith(from) ? l.slice(from.length) : l.slice(Math.min(from.length, indentOf(l).length)))));

const DIRECTION = /direction\s+\w+/i;

/** The top-level direction: the `direction` line at `dirLine` rewritten, else a new one after the header (`indent` before it); the code as it is without a header. */
export function setDirectionLine(code: string, dirLine: number | undefined, headerLine: number, dir: string, indent = '  '): string {
  const L = code.split('\n');
  if (dirLine !== undefined && DIRECTION.test(L[dirLine] ?? '')) {
    L[dirLine] = L[dirLine]!.replace(DIRECTION, `direction ${dir}`);
    return L.join('\n');
  }
  if (headerLine < 0) return code;
  L.splice(headerLine + 1, 0, `${indent}direction ${dir}`);
  return L.join('\n');
}

/**
 * The edits that set a block's own direction: its `direction` lines (`own`, the line numbers the type finds in the block, not in blocks inside it) rewritten, or removed for `dir` null (the default); without one, a new line at `at` (`indent` before it).
 */
export function blockDirection(L: readonly string[], own: readonly number[], at: number, indent: string, dir: string | null): LineEdit[] {
  if (!own.length) return dir ? [{ at, del: 0, ins: [`${indent}direction ${dir}`] }] : [];
  return own.map((li) => ({ at: li, del: 1, ins: dir ? [(L[li] ?? '').replace(DIRECTION, `direction ${dir}`)] : [] }));
}

/** Index after the last non-blank line. */
export function contentEnd(L: readonly string[]): number {
  let end = L.length;
  while (end > 0 && !(L[end - 1] ?? '').trim()) end--;
  return end;
}

// the last code's line offsets: an op asks for many lines of one code (P16: a scan from the top per line)
let startsOf: string | null = null;
let starts: number[] = [];

/** The offset of the start of line `li` (the code's length past its last line). */
export function lineStart(code: string, li: number): number {
  if (code !== startsOf) {
    starts = [0];
    for (let i = code.indexOf('\n'); i >= 0; i = code.indexOf('\n', i + 1)) starts.push(i + 1);
    startsOf = code;
  }
  return li < starts.length ? starts[li]! : code.length;
}
