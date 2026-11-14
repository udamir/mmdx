// Word and line diff (§7.2): a small Myers O(ND) diff, so the core keeps its no-dependency promise. Words are
// whitespace-separated with punctuation kept on the word (`/networks/{name}` stays one token); line breaks are
// tokens of their own. `mergeText` writes one string with the removed and added words marked (text/marks.ts).
import { deleted, inserted } from '../text/marks.js';

export { MARK, hasMarks, stripMarks, markRuns, deleted, inserted, type MarkedRun, type MarkKind } from '../text/marks.js';

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffRun<T> {
  op: DiffOp;
  items: T[];
}

/** Over this many edits the diff gives up on minimality and reports the rest as removed + added. */
const MAX_EDITS = 4000;

/**
 * Myers' shortest edit script between two lists, as runs of equal, removed and added items (removed before added in
 * each changed stretch, like a text diff).
 */
export function diffArrays<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): DiffRun<T>[] {
  // common prefix and suffix first: most real edits are local
  let pre = 0;
  while (pre < a.length && pre < b.length && eq(a[pre]!, b[pre]!)) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && eq(a[a.length - 1 - suf]!, b[b.length - 1 - suf]!)) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
  const ops: [DiffOp, T][] = [];
  for (let i = 0; i < pre; i++) ops.push(['same', a[i]!]);
  ops.push(...middle(A, B, eq));
  for (let i = a.length - suf; i < a.length; i++) ops.push(['same', a[i]!]);
  return group(ops);
}

function middle<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): [DiffOp, T][] {
  const n = a.length, m = b.length;
  if (!n) return b.map((x) => ['add', x]);
  if (!m) return a.map((x) => ['del', x]);
  const max = Math.min(n + m, MAX_EDITS);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    // only the diagonals round d reads back (-d-1 … d+1): the whole array per round was O(D · max) memory
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x]!, b[y]!)) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return [...a.map((x): [DiffOp, T] => ['del', x]), ...b.map((x): [DiffOp, T] => ['add', x])];
  const out: [DiffOp, T][] = [];
  let x = n, y = m;
  for (let d = found; d >= 0; d--) {
    const t = trace[d]!, o = d + 1;
    const k = x - y;
    const prevK = k === -d || (k !== d && t[o + k - 1]! < t[o + k + 1]!) ? k + 1 : k - 1;
    const prevX = t[o + prevK]!, prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push(['same', a[--x]!]);
      y--;
    }
    if (d > 0) {
      if (x === prevX) out.push(['add', b[--y]!]);
      else out.push(['del', a[--x]!]);
    }
    x = prevX;
    y = prevY;
  }
  return out.reverse();
}

/** Consecutive ops → runs; within a changed stretch every removal comes before the additions. */
function group<T>(ops: readonly [DiffOp, T][]): DiffRun<T>[] {
  const out: DiffRun<T>[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]![0] === 'same') {
      const items: T[] = [];
      while (i < ops.length && ops[i]![0] === 'same') items.push(ops[i++]![1]);
      out.push({ op: 'same', items });
      continue;
    }
    const del: T[] = [], add: T[] = [];
    while (i < ops.length && ops[i]![0] !== 'same') (ops[i]![0] === 'del' ? del : add).push(ops[i++]![1]);
    if (del.length) out.push({ op: 'del', items: del });
    if (add.length) out.push({ op: 'add', items: add });
  }
  return out;
}

// ---- words ------------------------------------------------------------------------------------------------------

export interface TextOp {
  op: DiffOp;
  value: string;
}

/** Words (whitespace-separated, punctuation kept with its word) and line breaks. */
export const words = (s: string): string[] => s.split(/(\n)|[ \t]+/).filter((w): w is string => !!w);

const joinWords = (ws: readonly string[]): string => ws.join(' ').replace(/ ?\n ?/g, '\n');

/** Word-level diff of two texts. */
export function diffWords(a: string, b: string): TextOp[] {
  return diffArrays(words(a), words(b)).map((r) => ({ op: r.op, value: joinWords(r.items) }));
}

/**
 * `before` → `after` as one string with the removed and added words marked. A removed run followed by an added
 * run is separated by one space.
 */
export function mergeText(before: string, after: string): string {
  if (before === after) return after;
  const out = diffWords(before, after).map((r) => (r.op === 'del' ? deleted(r.value) : r.op === 'add' ? inserted(r.value) : r.value));
  return out.join(' ').replace(/ ?\n ?/g, '\n');
}

// ---- lines ------------------------------------------------------------------------------------------------------

export interface LineOp {
  op: DiffOp;
  text: string;
  /** 1-based line number in the before text (same / del). */
  a?: number;
  /** 1-based line number in the after text (same / add). */
  b?: number;
}

/** Line diff with old and new line numbers. */
export function diffLines(a: readonly string[], b: readonly string[]): LineOp[] {
  const out: LineOp[] = [];
  let i = 0, j = 0;
  for (const r of diffArrays(a, b))
    for (const text of r.items) {
      if (r.op === 'del') out.push({ op: 'del', text, a: ++i });
      else if (r.op === 'add') out.push({ op: 'add', text, b: ++j });
      else out.push({ op: 'same', text, a: ++i, b: ++j });
    }
  return out;
}

export type Hunk = { ops: LineOp[] } | { skip: number; ops: LineOp[] };

/** Splits a line diff into shown parts and collapsed runs of unchanged lines (more than 2 × context). */
export function hunks(ops: readonly LineOp[], context = 3): Hunk[] {
  const out: Hunk[] = [];
  let run: LineOp[] = [];
  let changes: LineOp[] = [];
  let first = true;
  const flushSame = (last: boolean): void => {
    const keepHead = first ? 0 : context, keepTail = last ? 0 : context;
    if (run.length > keepHead + keepTail + 2) {
      if (keepHead) out.push({ ops: run.slice(0, keepHead) });
      out.push({ skip: run.length - keepHead - keepTail, ops: run.slice(keepHead, run.length - keepTail) });
      if (keepTail) out.push({ ops: run.slice(run.length - keepTail) });
    } else if (run.length) out.push({ ops: run });
    run = [];
  };
  for (const o of ops) {
    if (o.op === 'same') {
      if (changes.length) {
        out.push({ ops: changes });
        changes = [];
      }
      run.push(o);
    } else {
      if (run.length) flushSame(false);
      first = false;
      changes.push(o);
    }
  }
  if (changes.length) out.push({ ops: changes });
  if (run.length) flushSame(true);
  return out;
}
