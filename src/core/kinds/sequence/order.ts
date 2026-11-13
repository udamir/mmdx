// The sequence diagram's order walk without a parse (X11, P2; core/ops/order.ts): what the ops kind's `unit`, `blocks`
// and `relocate` give after statement moves, worked out from the base model (the type has no draw ranks). A move only
// rearranges whole lines, one statement each, so a message's or note's unit is its line now, a block's its first and
// `end` lines, a box's its `box` and `end` lines, and a positional id (`m3`, `n1`, `b2`, `box1`) numbers the items of
// its kind in their order now. A participant trades places by the type's own step (its declarations are rewritten),
// which the walk parses. It also parses a move that splits an `accDescr {…}` written over several lines, and each
// step when the item budget is spent.
import type { SeqBlockStart, SeqItem, SequenceModel } from '../../model.js';
import type { LineOrder, OrderSim } from '../../kind/ops-types.js';
import type { LineSpan } from '../../ops/types.js';
import type { ItemRef } from '../../types.js';
import { descriptionRuns, IDENTITY } from '../order-kit.js';

type Positional = { id: string; line: number };
type Kind = 'message' | 'note' | 'block' | 'box';
const PREFIX: Readonly<Record<Kind, string>> = { message: 'm', note: 'n', block: 'b', box: 'box' };

/** Null where the base model cannot tell the walk what a rearrangement gives (see above). */
export function seqOrderSim(code: string, M: SequenceModel): OrderSim | null {
  if (M.diagnostics.some((d) => /^doc\.too-/.test(d.code))) return null;
  const sim = new SeqSim(M, descriptionRuns(code));
  return sim.numbered() ? sim : null;
}


const span = (li: number): LineSpan => ({ start: li, end: li });
const lastLine = (b: SeqBlockStart): number => b.lines[b.lines.length - 1] ?? b.src;

class SeqSim implements OrderSim {
  /** Each positional kind's items, in base order. */
  private readonly of: Record<Kind, Positional[]>;
  private readonly starts: readonly SeqBlockStart[];
  constructor(private readonly M: SequenceModel, readonly fragile: readonly (readonly number[])[]) {
    const items = (k: SeqItem['kind']): Positional[] => M.items.flatMap((x) => (x.kind === k && 'id' in x ? [{ id: x.id, line: x.src }] : []));
    this.starts = M.items.filter((x): x is SeqBlockStart => x.kind === 'blockStart');
    this.of = { message: items('message'), note: items('note'), block: items('blockStart'), box: M.boxes.map((b) => ({ id: b.id, line: b.line })) };
  }

  /** The base index of the item a positional id names now (its kind's items in their order now). */
  private find(o: LineOrder, kind: Kind, id: string): number {
    const list = this.of[kind];
    const k = Number(id.slice(PREFIX[kind].length));
    if (!id.startsWith(PREFIX[kind]) || !Number.isInteger(k) || k < 1) return -1;
    return list.map((_, i) => i).sort((a, b) => o.at(list[a]!.line) - o.at(list[b]!.line))[k - 1] ?? -1;
  }

  /** The id the item at base index `i` of a kind has now. */
  private idOf(o: LineOrder, kind: Kind, i: number): string {
    const list = this.of[kind], at = o.at(list[i]!.line);
    return `${PREFIX[kind]}${1 + list.filter((x) => o.at(x.line) < at).length}`;
  }

  unit(o: LineOrder, { kind, id }: ItemRef): LineSpan | null | undefined {
    switch (kind) {
      case 'participant':
        return undefined; // the type's own step
      case 'box': {
        const b = this.M.boxes[this.find(o, 'box', id)];
        return b ? { start: o.at(b.line), end: o.at(b.endLine ?? b.line) } : null;
      }
      case 'block': {
        const b = this.starts[this.find(o, 'block', id)];
        return b ? { start: o.at(b.src), end: o.at(lastLine(b)) } : null;
      }
      case 'message':
      case 'note': {
        const x = this.of[kind][this.find(o, kind, id)];
        return x ? span(o.at(x.line)) : null;
      }
      default:
        return null;
    }
  }

  blocks(o: LineOrder): LineSpan[] {
    const out: LineSpan[] = [];
    for (const b of this.M.boxes) if (b.endLine != null) out.push({ start: o.at(b.line), end: o.at(b.endLine) });
    for (const b of this.starts) out.push({ start: o.at(b.src), end: o.at(lastLine(b)) });
    return out;
  }

  relocate(o: LineOrder, { kind }: ItemRef, line: number): string | null {
    const k = Object.hasOwn(PREFIX, kind) ? (kind as Kind) : null;
    if (!k) return null;
    const orig = o.orig(line);
    const i = this.of[k].findIndex((x) => x.line === orig);
    return i < 0 ? null : this.idOf(o, k, i);
  }

  /** The base ids are the positional ones (each kind numbered in code order). */
  numbered(): boolean {
    return (Object.keys(PREFIX) as Kind[]).every((k) => this.of[k].every((x, i) => x.id === this.idOf(IDENTITY, k, i)));
  }

  rank(): null {
    return null;
  }
}
