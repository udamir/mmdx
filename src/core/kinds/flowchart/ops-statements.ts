// Flowchart statements rewritten by splicing (T02.5): a relabel, a reconnect or a delete changes only the tokens it has
// to — a label, an edge end, a node of an `&` group — and keeps everything else as written: `@{…}` node data, edge
// lengths and styles, chains, `&` groups and `:::` classes. A statement is split only where an edit breaks it apart
// (one edge of `A & B --> C`), and then only that part: the other links keep their own syntax.
import type { FlowEdge, FlowLink, FlowMention, FlowStatement, FlowchartModel } from '../../model.js';
import { labelText } from '../../parse/label.js';
import type { Splice } from '../../parse/node-data.js';
import { indentOf } from '../../ops/lines.js';

export interface StatementEdit {
  dropNodes?: ReadonlySet<string>;
  dropEdges?: ReadonlySet<string>;
  /** An edge of the statement with new ends and, when `label` is set, a new label (`md`: as a markdown string). */
  change?: { id: string; from: string; to: string; label?: string; md?: boolean };
  /** An edge taken out of the statement (the caller writes it elsewhere). */
  take?: string;
}

const NONE: ReadonlySet<string> = new Set();

/** A link with a new label: the arrow as written (length, heads, edge id) and the label in pipes (a markdown string stays one); '' drops it. */
function relabelLink(code: string, link: FlowLink, label: string, md = false): string {
  const id = link.idEnd !== undefined ? code.slice(link.start, link.idEnd) : '';
  return `${id}${link.arrow}${label ? `|${labelText(label, md)}|` : ''}`;
}

interface Pair {
  from: string;
  to: string;
  link: string;
  changed: boolean;
}

/**
 * The statement's new text after an edit (null: nothing changed) and, when the edit changed an edge, the offset of
 * the statement that holds it in the new text.
 */
export function rewriteStatement(code: string, model: FlowchartModel, si: number, edit: StatementEdit): { text: string; changedAt: number } | null {
  const st = model.statements[si];
  if (!st) return null;
  const drop = edit.dropNodes ?? NONE, dropE = edit.dropEdges ?? NONE;
  const slice = (a: number, b: number): string => code.slice(a, b);
  const k = st.groups.length;
  const R = st.groups.map((g) => g.filter((m) => !drop.has(m.id)));
  const segEdges: FlowEdge[][] = st.links.map(() => []);
  for (const e of model.edges) if (e.stmt === si && e.seg !== undefined) segEdges[e.seg]?.push(e);
  const linkText = (j: number): string => slice(st.links[j]!.start, st.links[j]!.end);
  const ch = edit.change;
  const kept: Pair[][] = segEdges.map((es, j) =>
    es
      .filter((e) => !dropE.has(e.id) && !drop.has(e.from) && !drop.has(e.to) && e.id !== edit.take)
      .map((e) => (ch && e.id === ch.id
        ? { from: ch.from, to: ch.to, link: ch.label !== undefined ? relabelLink(code, st.links[j]!, ch.label, !!ch.md) : linkText(j), changed: true }
        : { from: e.from, to: e.to, link: linkText(j), changed: false })),
  );

  // an edge that changes alone in its link (one node on each side) needs no split: its link or its outer end is replaced
  const linkOver = new Map<number, string>();
  const groupOver = new Map<number, string>();
  const replaced: FlowMention[] = [];
  let cj = -1;
  if (ch) cj = segEdges.findIndex((es) => es.some((e) => e.id === ch.id));
  const orig = cj >= 0 ? segEdges[cj]!.find((e) => e.id === ch!.id) : undefined;
  if (ch && orig && kept[cj]!.length === 1 && R[cj]!.length === 1 && R[cj + 1]!.length === 1) {
    const pair = kept[cj]![0]!;
    const sameFrom = ch.from === orig.from, sameTo = ch.to === orig.to;
    let ok = true;
    if (!sameTo && sameFrom && cj + 1 === k - 1) {
      groupOver.set(cj + 1, ch.to);
      replaced.push(R[cj + 1]![0]!);
    } else if (!sameFrom && sameTo && cj === 0) {
      groupOver.set(0, ch.from);
      replaced.push(R[0]![0]!);
    } else if (!sameFrom || !sameTo) ok = false;
    if (ok) {
      pair.changed = false;
      linkOver.set(cj, pair.link);
    }
  }

  const intact = (j: number): boolean => {
    const ks = kept[j]!;
    return ks.length > 0 && !ks.some((p) => p.changed) && ks.length === R[j]!.length * R[j + 1]!.length;
  };
  const unchanged = !R.some((g, i) => g.length !== st.groups[i]!.length) && st.links.every((_, j) => intact(j)) && !linkOver.size && !groupOver.size;
  if (unchanged) return null;

  // ids an edge of the new text still mentions (a node only listed here stays alive through them)
  const onEdge = new Set<string>();
  for (const ks of kept) for (const p of ks) onEdge.add(p.from).add(p.to);
  for (const id of groupOver.values()) onEdge.add(id);
  const used = new Set<FlowMention>();
  // inside a subgraph a bare mention lists the node in it: it stays
  const inSub = [...model.groups.values()].some((g) => g.line < st.line && st.line < (g.endLine ?? Infinity));
  const keep = (m: FlowMention): boolean => {
    if (m.def || inSub) return true;
    const n = model.nodes.get(m.id);
    return !!n && !onEdge.has(m.id) && [...n.lines].every((l) => l === st.line);
  };
  const mtext = (m: FlowMention): string => {
    if (used.has(m)) return m.id;
    used.add(m);
    return slice(m.start, m.end);
  };
  const gtext = (g: number): string => groupOver.get(g) ?? R[g]!.map(mtext).join(' & ');

  const out: string[] = [];
  let changedAt = -1;
  // an old end replaced by the new one keeps its definition (or keeps the node alive) on its own
  for (const m of replaced) if (keep(m)) out.push(mtext(m));
  const flush = (groups: number[], links: number[]): void => {
    if (!links.length) {
      const g = groups[0]!;
      if (groupOver.has(g)) return;
      const ms = R[g]!.filter((m) => !used.has(m) && keep(m));
      if (ms.length) out.push(ms.map(mtext).join(' & '));
      return;
    }
    if (links.includes(cj)) changedAt = out.length;
    let t = gtext(groups[0]!);
    for (const j of links) t += ` ${linkOver.get(j) ?? linkText(j)} ${gtext(j + 1)}`;
    out.push(t);
  };
  let groups = [0], links: number[] = [];
  for (let j = 0; j < k - 1; j++) {
    if (intact(j) || linkOver.has(j)) {
      links.push(j);
      groups.push(j + 1);
      continue;
    }
    flush(groups, links);
    // the link's edges one by one, each with the link as written (an edge id only when the link keeps one edge)
    const ks = kept[j]!;
    const bare = ks.length > 1 && st.links[j]!.idEnd !== undefined;
    for (const p of ks) {
      if (p.changed) changedAt = out.length;
      const link = bare && !p.changed ? slice(st.links[j]!.idEnd!, st.links[j]!.end) : p.link;
      out.push(`${p.from} ${link} ${p.to}`);
    }
    groups = [j + 1];
    links = [];
  }
  flush(groups, links);

  const sep = '\n' + indentOf(lineAt(code, st.start));
  let at = 0;
  for (let i = 0; i < changedAt; i++) at += out[i]!.length + sep.length;
  return { text: out.join(sep), changedAt: changedAt < 0 ? -1 : at };
}

/** The whole line around offset `i`. */
function lineAt(code: string, i: number): string {
  const s = code.lastIndexOf('\n', i - 1) + 1;
  const e = code.indexOf('\n', i);
  return code.slice(s, e < 0 ? code.length : e);
}

/**
 * The splice that puts `text` in place of a statement; an empty text removes the statement, with its whole line when
 * nothing else is on it, else with the `;` next to it.
 */
export function statementSplice(code: string, st: FlowStatement, text: string): Splice {
  if (text) return { from: st.start, to: st.end, text };
  const ls = code.lastIndexOf('\n', st.start - 1) + 1;
  const le0 = code.indexOf('\n', st.end);
  const le = le0 < 0 ? code.length : le0;
  const before = code.slice(ls, st.start), after = code.slice(st.end, le);
  if (!before.trim() && !after.trim()) return le0 < 0 ? { from: Math.max(0, ls - 1), to: le, text: '' } : { from: ls, to: le + 1, text: '' };
  const semi = /^\s*;/.exec(after);
  if (semi) return { from: st.start, to: st.end + semi[0].length, text: '' };
  const prev = /;\s*$/.exec(before);
  if (prev) return { from: ls + prev.index, to: st.end, text: '' };
  return { from: st.start, to: st.end, text: '' };
}

/** The 0-based line of a code offset. */
export function lineOf(code: string, offset: number): number {
  let n = 0;
  for (let i = code.indexOf('\n'); i >= 0 && i < offset; i = code.indexOf('\n', i + 1)) n++;
  return n;
}
