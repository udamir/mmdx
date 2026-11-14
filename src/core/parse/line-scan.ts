// Linear replacements for the lexer rules that would re-scan a whole line at every token (B1). Mermaid's jison
// lexers have rules like `.*direction\s+TB[^\n]*` and `.*<<fork>>`, tried at every position; as sticky RegExps each
// attempt reads to the end of the line, so a long line costs O(line²). Here each line is read once: the result for a
// position is answered from a per-line index, with exactly the RegExp's result.
//
// "Line" is what `.` stops at in a non-unicode RegExp: `\n`, `\r`, U+2028, U+2029.

const isDotEnd = (c: number): boolean => c === 10 || c === 13 || c === 0x2028 || c === 0x2029;

interface Hit {
  start: number;
  end: number;
}

export type Direction4 = 'TB' | 'BT' | 'RL' | 'LR';

export class LineScan {
  private bounds: number[] | null = null;
  private readonly memo = new Map<string, Hit | null>();
  private readonly dirs = new Map<number, Partial<Record<Direction4, Hit>>>();

  constructor(readonly src: string) {}

  /** Index of the `.`-line holding `pos`, and that line's [start, end). */
  private line(pos: number): { i: number; start: number; end: number } {
    if (!this.bounds) {
      const b: number[] = [];
      for (let i = 0; i < this.src.length; i++) if (isDotEnd(this.src.charCodeAt(i))) b.push(i);
      this.bounds = b;
    }
    const b = this.bounds;
    let lo = 0, hi = b.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (b[mid]! < pos) lo = mid + 1;
      else hi = mid;
    }
    return { i: lo, start: lo > 0 ? b[lo - 1]! + 1 : 0, end: lo < b.length ? b[lo]! : this.src.length };
  }

  /** End (exclusive) of the `.`-line holding `pos`: how far a failed `.*` attempt from `pos` reads. */
  lineEnd(pos: number): number {
    return this.line(pos).end;
  }

  /**
   * `.*NEEDLE` as a sticky match at `pos`: the length up to the end of NEEDLE's last occurrence on the line at or
   * after `pos`, or -1. `needle` is a global, case-insensitive RegExp whose matches stay inside one line and cannot
   * overlap each other (a fixed word such as `<<fork>>`).
   */
  upToLast(pos: number, needle: RegExp): number {
    const L = this.line(pos);
    const key = `${needle.source}\0${L.i}`;
    let hit = this.memo.get(key);
    if (hit === undefined) {
      hit = null;
      const text = this.src.slice(L.start, L.end);
      needle.lastIndex = 0;
      for (let m = needle.exec(text); m; m = needle.exec(text)) {
        hit = { start: L.start + m.index, end: L.start + m.index + m[0].length };
        if (!m[0].length) needle.lastIndex++;
      }
      this.memo.set(key, hit);
    }
    return hit && hit.start >= pos ? hit.end - pos : -1;
  }

  /**
   * `.*direction\s+D[^\n]*` as a sticky match at `pos` (case-insensitive): the last `direction` on the line at or
   * after `pos` that is followed by whitespace and D (the whitespace may run past the line), then everything up to
   * the next `\n`. Returns the match length or -1.
   */
  direction(pos: number, d: Direction4): number {
    const L = this.line(pos);
    let per = this.dirs.get(L.i);
    if (!per) {
      per = {};
      const starts: number[] = [];
      const text = this.src.slice(L.start, L.end);
      for (const m of text.matchAll(/direction/gi)) starts.push(L.start + m.index);
      const after = /direction\s+(TB|BT|RL|LR)/iy;
      let found = 0;
      for (let k = starts.length - 1; k >= 0 && found < 4; k--) {
        after.lastIndex = starts[k]!;
        const m = after.exec(this.src);
        if (!m) continue;
        const dir = m[1]!.toUpperCase() as Direction4;
        if (per[dir]) continue;
        per[dir] = { start: starts[k]!, end: starts[k]! + m[0].length };
        found++;
      }
      this.dirs.set(L.i, per);
    }
    const hit = per[d];
    if (!hit || hit.start < pos) return -1;
    const nl = this.src.indexOf('\n', hit.end);
    return (nl < 0 ? this.src.length : nl) - pos;
  }
}
