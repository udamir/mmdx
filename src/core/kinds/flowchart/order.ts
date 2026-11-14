// The flowchart's order walk without a parse (X11, P2; core/ops/order.ts): what the ops kind's `unit`, `blocks`,
// `relocate` and `orderRank` give after statement moves, worked out from the base model. A move only rearranges whole
// lines and every fact the parser takes from a line stays with it, so a node's unit is the first of its definition
// lines (else of its lines) now, a subgraph's its declaration and `end` lines, an edge's its line; the ranks sort by
// those lines now, ties in the order of first mention; an edge's positional id numbers the edges of its pair in their
// order now, and an edge id (`e1@-->`) stays with its edge while its data (`e1@{…}`) stays after it. The walk parses a
// move that splits a statement or `accDescr {…}` written over several lines, or that puts edge data before its edge
// (it would be a node), or an edge id after another edge with that id (the first one has it); it parses each step
// for an id that is a node and a subgraph, a subgraph declared twice or with other statements on its line, the item
// budget spent, and from a tie between two nodes of one definition line first mentioned on one line by a `class`,
// `style` or `click` statement (whose order the model does not keep).
import type { FlowchartModel, FlowEdge, FlowNode } from '../../model.js';
import type { LineOrder, OrderSim } from '../../kind/ops-types.js';
import type { LineSpan } from '../../ops/types.js';
import type { ItemRef } from '../../types.js';
import { lineIndex } from '../../parse/kit.js';
import { IDENTITY, lineRank, PairIds } from '../order-kit.js';
import { joinedLines } from './parse.js';

interface NodeFacts {
  n: FlowNode;
  /** Lines with a bracket or node data for it. */
  defs: number[];
  lines: number[];
  /** Column of its first mention on each line, by the chain statements (absent: a line only other statements touch). */
  col: Map<number, number>;
}

/** Null where the base model cannot tell the walk what a rearrangement gives (see above). */
export function orderSim(code: string, M: FlowchartModel): OrderSim | null {
  if (M.idClashes.length || M.diagnostics.some((d) => /^doc\.too-/.test(d.code))) return null;
  const text = code.split('\n');
  let decls = 0, ends = 0;
  for (const l of text) {
    const t = l.trim();
    if (t.includes(';') && /\b(subgraph|end)\b/.test(t)) return null;
    if (/^subgraph\s/.test(t)) decls++;
    if (t === 'end') ends++;
  }
  if (decls !== M.groups.size || ends !== [...M.groups.values()].filter((g) => g.endLine !== undefined).length) return null;
  const starts = lineIndex(code).starts;
  const facts = new Map<string, NodeFacts>();
  for (const n of M.nodes.values()) facts.set(n.id, { n, defs: [], lines: [...n.lines], col: new Map() });
  // a class / style / click statement sharing a line with others: its touches have no column
  const mixed = new Set(text.flatMap((l, i) => (l.includes(';') && /\b(class|style|click)\b/.test(l) ? [i] : [])));
  for (const st of M.statements)
    for (const g of st.groups)
      for (const m of g) {
        const f = facts.get(m.id);
        if (!f) continue;
        if (m.def && !f.defs.includes(st.line)) f.defs.push(st.line);
        const c = m.start - (starts[st.line] ?? 0), was = f.col.get(st.line);
        if (!mixed.has(st.line) && (was === undefined || c < was)) f.col.set(st.line, c);
      }
  for (const f of facts.values()) if ((f.defs.length ? Math.min(...f.defs) : null) !== f.n.defLine) return null;
  const sim = new FlowSim(M, facts, joinedLines(code), edgeIdOrder(code, M, text));
  if (M.edges.some((e) => sim.edgeId(IDENTITY, e) !== e.id)) return null;
  return sim;
}

/**
 * The line orders edge ids rely on: each id's edge before every other link written with that id (the first one has
 * it), and on its side of each line naming its data (`e1@{` is the edge's data after it, a node before it).
 */
function edgeIdOrder(code: string, M: FlowchartModel, text: readonly string[]): [number, number][] {
  const lines = new Map<string, number[]>();
  for (const st of M.statements)
    for (const l of st.links) {
      if (l.idEnd === undefined) continue;
      const uid = code.slice(l.start, l.idEnd - 1);
      lines.set(uid, [...(lines.get(uid) ?? []), st.line]);
    }
  const out: [number, number][] = [];
  for (const e of M.edges) {
    if (e.uid === undefined) continue;
    const pair = (li: number): void => void out.push(li > e.src ? [e.src, li] : [li, e.src]);
    for (const li of lines.get(e.uid) ?? []) if (li !== e.src) pair(li);
    text.forEach((l, li) => { if (li !== e.src && l.includes(`${e.uid}@{`)) pair(li); });
  }
  return out;
}

const span = (li: number): LineSpan => ({ start: li, end: li });
const minAt = (o: LineOrder, lines: readonly number[]): number | null => (lines.length ? Math.min(...lines.map(o.at)) : null);
const src = (e: FlowEdge): number => e.src;

class FlowSim implements OrderSim {
  private readonly edges: readonly FlowEdge[];
  private readonly ids: PairIds<FlowEdge>;
  constructor(private readonly M: FlowchartModel, private readonly facts: ReadonlyMap<string, NodeFacts>, readonly fragile: readonly (readonly number[])[], readonly keep: readonly (readonly [number, number])[]) {
    this.edges = M.edges;
    this.ids = new PairIds(M.edges, (e) => `${e.from}->${e.to}`, src);
  }

  unit(o: LineOrder, { kind, id }: ItemRef): LineSpan | null {
    if (kind === 'node') {
      const f = this.facts.get(id);
      const li = f ? minAt(o, f.defs) ?? minAt(o, f.lines) : null;
      return li === null ? null : span(li);
    }
    if (kind === 'group') {
      const g = this.M.groups.get(id);
      return g ? { start: o.at(g.line), end: o.at(g.endLine ?? g.line) } : null;
    }
    const e = kind === 'edge' ? this.edgeOf(o, id) : undefined;
    return e ? span(o.at(e.src)) : null;
  }

  blocks(o: LineOrder): LineSpan[] {
    return [...this.M.groups.values()].flatMap((g) => (g.endLine != null ? [{ start: o.at(g.line), end: o.at(g.endLine) }] : []));
  }

  relocate(o: LineOrder, ref: ItemRef, line: number): string | null {
    const e = ref.kind === 'edge' ? this.edges.find((x) => x.src === o.orig(line)) : undefined;
    return e ? this.edgeId(o, e) : null;
  }

  rank(o: LineOrder, { kind, id }: ItemRef): number | null | undefined {
    if (kind === 'edge') {
      const e = this.edgeOf(o, id);
      return e ? lineRank(o, this.edges, e, src) : -1;
    }
    if (kind !== 'node') return null;
    const f = this.facts.get(id);
    if (!f) return -1;
    // rankByLine: by definition line (none: last), ties in the nodes' order (of first mention)
    const key = (x: NodeFacts): number => minAt(o, x.defs) ?? 1e9;
    const k = key(f);
    let r = 0;
    for (const x of this.facts.values()) {
      const kx = key(x);
      if (x === f || kx > k) continue;
      const before = kx < k || this.firstBefore(o, x, f);
      if (before === undefined) return undefined;
      if (before) r++;
    }
    return r;
  }

  /** Whether `a` is first mentioned before `b` (undefined: on one line, in an order the model does not keep). */
  private firstBefore(o: LineOrder, a: NodeFacts, b: NodeFacts): boolean | undefined {
    const la = minAt(o, a.lines), lb = minAt(o, b.lines);
    if (la === null || lb === null) return undefined;
    if (la !== lb) return la < lb;
    const ca = a.col.get(o.orig(la)), cb = b.col.get(o.orig(lb));
    return ca === undefined || cb === undefined ? undefined : ca < cb;
  }

  /** An edge's id now: its own (`e1@`), else its pair numbered in the order now. */
  edgeId(o: LineOrder, e: FlowEdge): string {
    return e.uid ?? this.ids.id(o, e);
  }

  private edgeOf(o: LineOrder, id: string): FlowEdge | undefined {
    return this.edges.find((x) => x.uid === id) ?? this.ids.find(o, id);
  }
}
