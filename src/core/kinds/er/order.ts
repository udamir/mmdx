// The ER diagram's order walk without a parse (X11, P2; core/ops/order.ts): what the ops kind's `unit`, `blocks`,
// `relocate` and `orderRank` give after statement moves, worked out from the base model. A move only rearranges whole
// lines and every fact the parser takes from a line stays with it, so a table's unit is its block (else the first of
// its lines now), a subgraph's its `subgraph` and `end` lines, a relationship's its line; the ranks sort by those
// lines now, ties in the order the tables are first named (each name's offset is in the model); a relationship's
// positional id numbers the relationships of its pair in their order now. The walk parses instead where the base model
// cannot tell: an error other than a missing label or an alias on a relationship line (an unclosed block or subgraph,
// an unreadable line: what follows depends on where it ends), a table with two blocks (its last one is its unit), a
// subgraph declared twice or not on lines of its own, and the item budget spent; and it parses a move that splits an
// `accDescr {…}` or a relationship (its quoted label) written over several lines.
import type { Entity, ErModel, ErRel } from '../../model.js';
import type { LineOrder, OrderSim } from '../../kind/ops-types.js';
import type { LineSpan } from '../../ops/types.js';
import type { ItemRef } from '../../types.js';
import { lineIndex } from '../../parse/kit.js';
import { descriptionRuns, IDENTITY, lineRank, PairIds, runOf } from '../order-kit.js';

/** Where a table is named: a line and the column on it. */
interface Site {
  line: number;
  col: number;
}

interface TableFacts {
  e: Entity;
  lines: number[];
  sites: Site[];
}

const LINE_LOCAL_ERRORS: ReadonlySet<string> = new Set(['er.rel-label', 'er.rel-alias']);

/** Null where the base model cannot tell the walk what a rearrangement gives (see above). */
export function erOrderSim(code: string, M: ErModel): OrderSim | null {
  const text = code.split('\n');
  if (M.diagnostics.some((d) => d.code === 'doc.too-many-items' || (d.severity === 'error' && !LINE_LOCAL_ERRORS.has(d.code)))) return null;
  let decls = 0, ends = 0;
  for (const l of text) {
    const t = l.trim();
    if (/^subgraph\b/.test(t)) decls++;
    if (t === 'end') ends++;
  }
  if (decls !== M.groups.size || ends !== [...M.groups.values()].filter((g) => g.endLine !== undefined).length) return null;
  const lineOf = lineIndex(code), starts = lineOf.starts;
  const site = (line: number, at: number): Site => ({ line, col: at - (starts[line] ?? 0) });
  const facts = new Map<string, TableFacts>();
  for (const e of M.entities.values()) {
    if (e.stmts.filter((s) => s.block).length > 1) return null;
    facts.set(e.id, { e, lines: [...e.lines], sites: e.stmts.map((s) => site(s.line, s.nameAt[0])) });
  }
  for (const r of M.rels) {
    facts.get(r.from)?.sites.push(site(r.src, r.fromAt[0]));
    facts.get(r.to)?.sites.push(site(r.src, r.toAt[0]));
  }
  // a relationship whose quoted label goes on over lines, an `accDescr {…}`: runs of lines that stay together
  const runs = [...descriptionRuns(code), ...M.rels.flatMap((r) => runOf(r.src, lineOf(Math.max(r.start, r.end - 1))))];
  const sim = new ErSim(M, facts, runs);
  return M.rels.some((r) => sim.ids.id(IDENTITY, r) !== r.id) ? null : sim;
}

const span = (li: number): LineSpan => ({ start: li, end: li });
const src = (r: ErRel): number => r.src;

class ErSim implements OrderSim {
  private readonly rels: readonly ErRel[];
  readonly ids: PairIds<ErRel>;
  constructor(private readonly M: ErModel, private readonly facts: ReadonlyMap<string, TableFacts>, readonly fragile: readonly (readonly number[])[]) {
    this.rels = M.rels;
    this.ids = new PairIds(M.rels, (r) => `${r.from}--${r.to}`, src);
  }

  unit(o: LineOrder, { kind, id }: ItemRef): LineSpan | null {
    if (kind === 'entity') {
      const f = this.facts.get(id);
      if (!f) return null;
      const { e } = f;
      if (e.defLine != null) return { start: o.at(e.defLine), end: o.at(e.endLine ?? e.defLine) };
      return f.lines.length ? span(Math.min(...f.lines.map(o.at))) : null;
    }
    if (kind === 'group') {
      const g = this.M.groups.get(id);
      return g ? { start: o.at(g.line), end: o.at(g.endLine ?? g.line) } : null;
    }
    const r = kind === 'rel' ? this.ids.find(o, id) : undefined;
    return r ? span(o.at(r.src)) : null;
  }

  blocks(o: LineOrder): LineSpan[] {
    return [
      ...[...this.M.entities.values()].flatMap((e) => (e.defLine != null && e.endLine != null ? [{ start: o.at(e.defLine), end: o.at(e.endLine) }] : [])),
      ...[...this.M.groups.values()].flatMap((g) => (g.endLine !== undefined ? [{ start: o.at(g.line), end: o.at(g.endLine) }] : [])),
    ];
  }

  relocate(o: LineOrder, ref: ItemRef, line: number): string | null {
    const r = ref.kind === 'rel' ? this.rels.find((x) => x.src === o.orig(line)) : undefined;
    return r ? this.ids.id(o, r) : null;
  }

  rank(o: LineOrder, { kind, id }: ItemRef): number | null {
    if (kind === 'rel') {
      const r = this.ids.find(o, id);
      return r ? lineRank(o, this.rels, r, src) : -1;
    }
    if (kind !== 'entity') return null;
    const f = this.facts.get(id);
    if (!f) return -1;
    // rankByLine: by block line (none: last), ties in the tables' order (of first naming)
    const key = (x: TableFacts): number => (x.e.defLine != null ? o.at(x.e.defLine) : 1e9);
    const k = key(f), first = this.first(o, f);
    let r = 0;
    for (const x of this.facts.values()) {
      const kx = key(x);
      if (x !== f && (kx < k || (kx === k && before(this.first(o, x), first)))) r++;
    }
    return r;
  }

  /** Where a table is first named now. */
  private first(o: LineOrder, f: TableFacts): [number, number] {
    let best: [number, number] = [Infinity, Infinity];
    for (const s of f.sites) {
      const p: [number, number] = [o.at(s.line), s.col];
      if (before(p, best)) best = p;
    }
    return best;
  }
}

const before = (a: readonly [number, number], b: readonly [number, number]): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
