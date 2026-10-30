// Line diff for the Code view (jsdiff over lines), grouped into hunks with context.
import { diffArrays } from 'diff';

export type LineOp = { op: 'same' | 'add' | 'del'; text: string; a?: number; b?: number };

export function lineDiff(a: readonly string[], b: readonly string[]): LineOp[] {
  const out: LineOp[] = [];
  let i = 0, j = 0;
  for (const c of diffArrays([...a], [...b])) {
    for (const text of c.value) {
      if (c.removed) out.push({ op: 'del', text, a: ++i });
      else if (c.added) out.push({ op: 'add', text, b: ++j });
      else out.push({ op: 'same', text, a: ++i, b: ++j });
    }
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
