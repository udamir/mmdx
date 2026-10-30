// Line diff for the Code view: LCS over lines, grouped into hunks with context.
import { lcs } from '../../../src/core/diff/index.js';

export type LineOp = { op: 'same' | 'add' | 'del'; text: string; a?: number; b?: number };

export function lineDiff(a: readonly string[], b: readonly string[]): LineOp[] {
  const pairs = lcs(a, b);
  const out: LineOp[] = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    while (i < pi) out.push({ op: 'del', text: a[i]!, a: ++i });
    while (j < pj) out.push({ op: 'add', text: b[j]!, b: ++j });
    if (i < a.length && j < b.length) out.push({ op: 'same', text: a[i]!, a: ++i, b: ++j });
  }
  return out;
}

export type Hunk = { ops: LineOp[] } | { skip: number; ops: LineOp[] };

/** Splits into shown hunks and collapsed runs of unchanged lines (more than 2 × context). */
export function hunks(ops: readonly LineOp[], context = 3): Hunk[] {
  const out: Hunk[] = [];
  let run: LineOp[] = [];
  const flushSame = (first: boolean, last: boolean) => {
    const keepHead = first ? 0 : context, keepTail = last ? 0 : context;
    if (run.length > keepHead + keepTail + 2) {
      if (keepHead) out.push({ ops: run.slice(0, keepHead) });
      out.push({ skip: run.length - keepHead - keepTail, ops: run.slice(keepHead, run.length - keepTail) });
      if (keepTail) out.push({ ops: run.slice(run.length - keepTail) });
    } else if (run.length) out.push({ ops: run });
    run = [];
  };
  let first = true;
  let changes: LineOp[] = [];
  for (const o of ops) {
    if (o.op === 'same') {
      if (changes.length) {
        out.push({ ops: changes });
        changes = [];
      }
      run.push(o);
    } else {
      if (run.length) flushSame(first, false);
      first = false;
      changes.push(o);
    }
  }
  if (changes.length) out.push({ ops: changes });
  if (run.length) flushSame(first, true);
  return out;
}
