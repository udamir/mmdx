// The state diagram's order walk without a parse (X11, P2; core/ops/order.ts): what the ops kind's `unit`, `blocks`
// and `relocate` give after statement moves, worked out from the base model (the type has no draw ranks). A move only
// rearranges whole lines, so a transition's unit is its line now, a note's its lines, a composite's block its
// `state … {` and `}` lines, a state's its definition line (else the first of its lines now); a note's id numbers the
// notes in their order now, a transition's its pair (the start and end pseudo-states named by their region) in their
// order now. The walk parses a move that splits a note or an `accDescr {…}` written over several lines, or that takes a
// transition from or to `[*]` past a `--` (its pseudo-state is the next region's); it parses each step for a state
// defined on two lines or a composite of two blocks (the parser picks one by what comes first), for a statement that
// may go on over lines (see `continues`), an error, and the item budget spent.
import type { StateEdge, StateModel } from '../../model.js';
import type { LineOrder, OrderSim } from '../../kind/ops-types.js';
import type { LineSpan } from '../../ops/types.js';
import type { ItemRef } from '../../types.js';
import { descriptionRuns, IDENTITY, PairIds, runOf } from '../order-kit.js';
import { isPseudo } from './parse.js';

/** Null where the base model cannot tell the walk what a rearrangement gives (see above). */
export function orderSim(code: string, M: StateModel): OrderSim | null {
  if (M.diagnostics.some((d) => d.severity === 'error' || d.code === 'doc.too-many-items')) return null;
  // the frontmatter and comments apart (the lexer reads neither)
  if (code.split('\n').some((l, li) => li >= M.headerLine && !l.trim().startsWith('%%') && continues(l))) return null;
  const runs = [...descriptionRuns(code), ...M.notes.flatMap((n) => runOf(n.line, n.endLine))];
  const dividers = [...M.groups.values()].flatMap((g) => g.blocks.flatMap((b) => b.dividers));
  const keep: [number, number][] = [];
  for (const e of M.edges) if (isPseudo(e.from) || isPseudo(e.to)) for (const d of dividers) keep.push(d < e.src ? [d, e.src] : [e.src, d]);
  const sim = new StateSim(M, code.split('\n'), runs, keep);
  return M.edges.every((e) => sim.ids.id(IDENTITY, e) === e.id) && M.notes.every((n, i) => n.id === `n${i + 1}`) ? sim : null;
}

/**
 * A line whose statement may go on over the next line, or one that may go on a statement from the line before (the
 * lexer reads a line break inside a composite, and after other white space, as a space): an odd number of quotes, a
 * keyword or an arrow that wants what follows, or a token that ends what precedes. Only the parser knows where such a
 * statement ends, so the walk parses.
 */
const continues = (line: string): boolean => {
  const t = line.trim();
  if (t === 'end note') return false;
  return (t.split('"').length - 1) % 2 === 1 || /^(?:-->|:|\{|as\b|width\b|--\S)/.test(t) || /(?:^|\s)(?:note|left of|right of|state|as|class|classDef|style|click|scale|direction|accTitle|accDescr)$|(?:-->|:::|:|<<|\[\[)$/.test(t);
};

/** A `<<choice>>` / `[[fork]]`… declaration (its line defines the state, and gives no text). */
const DECL = /<<(?:fork|join|choice)>>|\[\[(?:fork|join|choice)\]\]/i;
class StateSim implements OrderSim {
  readonly ids: PairIds<StateEdge>;
  constructor(private readonly M: StateModel, private readonly text: readonly string[], readonly fragile: readonly (readonly number[])[], readonly keep: readonly (readonly [number, number])[]) {
    this.ids = new PairIds(M.edges, (e) => `${e.from}->${e.to}`, (e) => e.src);
  }

  unit(o: LineOrder, { kind, id }: ItemRef): LineSpan | null | undefined {
    if (kind === 'edge') {
      const e = this.ids.find(o, id);
      return e ? { start: o.at(e.src), end: o.at(e.src) } : null;
    }
    if (kind === 'note') {
      const k = /^n(\d+)$/.exec(id);
      const n = k ? this.notesNow(o)[Number(k[1]) - 1] : undefined;
      return n ? { start: o.at(n.line), end: o.at(n.endLine) } : null;
    }
    if (kind === 'group') {
      const g = this.M.groups.get(id);
      if (!g) return null;
      const b = g.blocks[0];
      // its first block is its unit: with two, which comes first is the parser's reading
      return g.blocks.length !== 1 || !b ? undefined : { start: o.at(b.line), end: o.at(b.endLine ?? b.line) };
    }
    if (kind === 'node') {
      const n = this.M.nodes.get(id);
      if (!n) return null;
      // its definition line is the first or the last of its texts and declarations: one line, whatever the order
      const defs = new Set(n.texts.map((t) => t.line));
      if (n.defLine != null) defs.add(n.defLine);
      for (const li of n.lines) if (DECL.test(this.text[li] ?? '')) defs.add(li);
      if (defs.size > 1) return undefined;
      const li = defs.size ? o.at([...defs][0]!) : Math.min(...[...n.lines].map(o.at));
      return Number.isFinite(li) ? { start: li, end: li } : null;
    }
    return null;
  }

  blocks(o: LineOrder): LineSpan[] {
    return [...this.M.groups.values()].flatMap((g) => g.blocks.flatMap((b) => (b.endLine !== undefined ? [{ start: o.at(b.line), end: o.at(b.endLine) }] : [])));
  }

  relocate(o: LineOrder, { kind }: ItemRef, line: number): string | null {
    const orig = o.orig(line);
    if (kind === 'note') {
      const i = this.notesNow(o).findIndex((n) => n.line === orig);
      return i < 0 ? null : `n${i + 1}`;
    }
    if (kind !== 'edge') return null;
    const e = this.M.edges.find((x) => x.src === orig);
    return e ? this.ids.id(o, e) : null;
  }

  rank(): null {
    return null;
  }

  private notesNow(o: LineOrder): StateModel['notes'] {
    return this.M.notes.slice().sort((a, b) => o.at(a.line) - o.at(b.line));
  }
}
