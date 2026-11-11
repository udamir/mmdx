// A flowchart edge's animation in the Mermaid code (Mermaid 11.10's edge data): dashes flowing along the line,
// `e1@{ animate: true }` (Mermaid's fast speed) or `e1@{ animation: slow }`. The data needs the edge's own id: an edge
// written without one gets one (`A e1@--> B`), and an edge of an `&` group (one link, several edges) is first written
// as a statement of its own. Existing edge data is changed in place, other keys, quotes and spacing kept as written; a
// block left empty that stands alone on its line is removed.
import type { FlowchartModel } from '../../model.js';
import { applySplices, editBlock, type Splice } from '../../parse/node-data.js';
import { parseFlowchart } from './parse.js';
import { uniqueId } from '../../ops/ids.js';
import { append } from '../../ops/lines.js';
import { rewriteStatement, statementSplice } from './ops-statements.js';
import type { SelectResult } from '../../ops/types.js';

/** `off`, Mermaid's default speed (`fast`), or `slow`. */
export type EdgeAnimation = 'off' | 'fast' | 'slow';

/** An edge's animation as Mermaid draws it: `animation` names the speed, `animate: true` alone is fast. */
export function flowEdgeAnimation(model: FlowchartModel, edgeId: string): EdgeAnimation | null {
  const e = model.edges.find((x) => x.id === edgeId);
  if (!e) return null;
  const d = e.data ?? {};
  if (d.animation === 'slow') return 'slow';
  return d.animation || d.animate ? 'fast' : 'off';
}

/** Sets an edge's animation (null: the edge is not in the code's statements); `select` is the edge under its new id when it got one. */
export function setFlowEdgeAnimation(code: string, model: FlowchartModel, edgeId: string, a: EdgeAnimation): SelectResult | null {
  const e = model.edges.find((x) => x.id === edgeId);
  if (!e) return null;
  if (flowEdgeAnimation(model, edgeId) === a) return { code };
  const patch = a === 'off' ? { animate: undefined, animation: undefined } : a === 'slow' ? { animate: undefined, animation: 'slow' } : { animate: true, animation: undefined };
  if (e.uid) {
    const blocks = e.blocks ?? [];
    const last = blocks[blocks.length - 1];
    if (!last) return a === 'off' ? { code } : { code: append(code, [`  ${e.uid}@{ ${dataText(a)} }`]) };
    // a block of the animation keys only is written anew (`{ animation: slow }`, not a removal and an addition)
    if (a !== 'off' && blocks.length === 1 && last.entries.every((x) => x.key === 'animate' || x.key === 'animation'))
      return { code: applySplices(code, [{ from: last.open, to: last.end, text: `{ ${dataText(a)} }` }]) };
    const splices: Splice[] = [];
    for (const b of blocks) {
      const p: Record<string, string | boolean | undefined> = {};
      for (const [k, v] of Object.entries(patch)) if (v === undefined ? b.entries.some((x) => x.key === k) : b === last) p[k] = v;
      if (!Object.keys(p).length) continue;
      // the entries the block keeps: an emptied block alone on its line goes with its line
      const removed = new Set(Object.keys(p).filter((k) => p[k] === undefined));
      const added = Object.keys(p).filter((k) => p[k] !== undefined && !b.entries.some((x) => x.key === k)).length;
      const left = b.entries.filter((x) => !removed.has(x.key)).length + added;
      const drop = left ? null : dropLine(code, e.uid, b.open, b.end);
      splices.push(...(drop ? [drop] : editBlock(code, b, p)));
    }
    return { code: applySplices(code, splices) };
  }
  if (a === 'off' || e.stmt === undefined || e.seg === undefined) return a === 'off' ? { code } : null;
  // the edge needs its own id first
  const st = model.statements[e.stmt]!, link = st.links[e.seg]!;
  const uid = uniqueId(model, 'e');
  const shared = model.edges.filter((x) => x.stmt === e.stmt && x.seg === e.seg).length > 1;
  let out: string;
  if (shared) {
    // one edge of `A & B --> C`: taken out of the statement and written as one of its own, with the id
    const r = rewriteStatement(code, model, e.stmt, { take: e.id });
    if (!r) return null;
    out = applySplices(code, [statementSplice(code, st, r.text)]);
    out = `${out.trimEnd()}\n  ${e.from} ${uid}@${code.slice(link.start, link.end)} ${e.to}\n`;
  } else {
    const space = /\s/.test(code[link.start - 1] ?? ' ') ? '' : ' ';
    out = code.slice(0, link.start) + `${space}${uid}@` + code.slice(link.start);
  }
  out = append(out, [`  ${uid}@{ ${dataText(a)} }`]);
  // the result must read back with the id on the same edge
  const back = parseFlowchart(out);
  return back.edges.some((x) => x.uid === uid && x.from === e.from && x.to === e.to) ? { code: out, select: { kind: 'edge', id: uid } } : null;
}

const dataText = (a: EdgeAnimation): string => (a === 'slow' ? 'animation: slow' : 'animate: true');

/** The splice that removes a data block standing alone on its line (`  e1@{ … }`), with the line; else null. */
function dropLine(code: string, uid: string, open: number, end: number): Splice | null {
  const ls = code.lastIndexOf('\n', open) + 1;
  const nl = code.indexOf('\n', end);
  const le = nl < 0 ? code.length : nl;
  if (code.slice(ls, le).trim() !== `${uid}@${code.slice(open, end)}`.trim()) return null;
  return nl < 0 ? { from: Math.max(0, ls - 1), to: le, text: '' } : { from: ls, to: nl + 1, text: '' };
}
