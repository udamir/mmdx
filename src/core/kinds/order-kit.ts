// What the types' order walks without a parse (X11, P2; core/kinds/<type>/order.ts) share: the base order, runs of
// lines that stay together, and the positional ids of a pair's connectors (`A->B`, `A->B#2`) in their order now.
import type { LineOrder } from '../kind/ops-types.js';
import { lineIndex } from '../parse/kit.js';

/** The base code's own order. */
export const IDENTITY: LineOrder = { at: (orig) => orig, orig: (line) => line };

/** The lines `first` … `last`, when that is more than one line. */
export const runOf = (first: number, last: number): number[][] => (last > first ? [Array.from({ length: last - first + 1 }, (_, k) => first + k)] : []);

/** The lines of each `accDescr {…}` over several lines, up to its first `}` (as the line readers and the lexers read it). */
export function descriptionRuns(code: string): number[][] {
  const lineOf = lineIndex(code);
  return [...code.matchAll(/accDescr\s*\{/g)].flatMap((m) => {
    const close = code.indexOf('}', m.index + m[0].length);
    return runOf(lineOf(m.index), lineOf(close < 0 ? code.length : close));
  });
}

/** An item's place among `items` in the order of their lines now, ties in base order (rankByLine over lines). */
export function lineRank<T>(o: LineOrder, items: readonly T[], x: T, line: (x: T) => number): number {
  const at = o.at(line(x)), i = items.indexOf(x);
  return items.filter((y, j) => o.at(line(y)) < at || (line(y) === line(x) && j < i)).length;
}

/** Connectors numbered within their pair (`key`, then `key#2`…) in the order of their lines now, ties in base order. */
export class PairIds<T> {
  private readonly pairs = new Map<string, T[]>();
  constructor(items: readonly T[], private readonly key: (x: T) => string, private readonly line: (x: T) => number) {
    for (const x of items) {
      const list = this.pairs.get(key(x));
      if (list) list.push(x);
      else this.pairs.set(key(x), [x]);
    }
  }

  id(o: LineOrder, x: T): string {
    const key = this.key(x), n = 1 + lineRank(o, this.pairs.get(key) ?? [], x, this.line);
    return n > 1 ? `${key}#${n}` : key;
  }

  /** The connector an id names now (the id may be a pair key that ends in `#n` itself). */
  find(o: LineOrder, id: string): T | undefined {
    const n = /#\d+$/.exec(id);
    return [...(this.pairs.get(id) ?? []), ...(n ? this.pairs.get(id.slice(0, n.index)) ?? [] : [])].find((x) => this.id(o, x) === id);
  }
}
