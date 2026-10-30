// Order (z-index) slider and ⌘[ / ⌘] (row 39; prototype app `orderStep`, `orderInfo`, `orderRank`,
// `orderPreview`, `moveSelection`). Every position the selected item can reach in the code is computed up front;
// the editor previews `applyOrderState(base, states[i])` live while the slider moves and records history once.
import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { parse } from '../parse/index.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { ItemKind, ItemRef } from '../types.js';
import { cloneMeta } from './meta-util.js';
import { remapSeqMeta } from './meta-ops.js';
import { moveStatement } from './reorder.js';
import { swapParticipant } from './sequence.js';
import type { DocResult } from './types.js';

/** One reachable position: the code there, its model and the item's (possibly positional) new ref. */
export interface OrderState {
  code: string;
  model: DiagramModel;
  sel: ItemRef;
  /** Participants: every neighbour swapped with on the way from the base (their x positions trade too). */
  others: string[];
}

export type OrderStepResult = { code: string; model: DiagramModel; sel: ItemRef; other?: string } | { reason: string } | null;

// Ids of these kinds survive a move; edges, messages, notes, blocks and boxes are positional.
const STABLE_IDS: ReadonlySet<ItemKind> = new Set(['node', 'group', 'entity', 'participant']);

/** One step of the code order: the new code / model / ref, a reason it cannot move, or null. */
export function orderStep(code: string, model: DiagramModel, sel: ItemRef, dir: -1 | 1): OrderStepResult {
  const r = sel.kind === 'participant' && model.type === 'sequence' ? swapParticipant(code, model, sel.id, dir) : moveStatement(code, model, sel, dir);
  if (r.reason || r.code === code) return r.reason ? { reason: r.reason } : null;
  const M = parse(r.code);
  const other = 'other' in r ? r.other : undefined;
  if (STABLE_IDS.has(sel.kind)) return { code: r.code, model: M, sel, ...(other !== undefined ? { other } : {}) };
  // Positional ids: find the moved item by its line.
  const line = 'line' in r ? r.line : undefined;
  let id: string | undefined;
  if (sel.kind === 'edge' && M.type === 'flowchart') id = M.edges.find((e) => e.src === line)?.id;
  else if (sel.kind === 'rel' && M.type === 'er') id = M.rels.find((x) => x.src === line)?.id;
  else if (sel.kind === 'box' && M.type === 'sequence') id = M.boxes.find((b) => b.line === line)?.id;
  else if (M.type === 'sequence') {
    const want = sel.kind === 'block' ? 'blockStart' : sel.kind;
    const it = M.items.find((x) => x.src === line && x.kind === want);
    id = it && 'id' in it ? it.id : undefined;
  }
  return id !== undefined ? { code: r.code, model: M, sel: { kind: sel.kind, id } } : null;
}

/** Draw order among items of the same kind (nodes and tables by definition line, edges and relations by line). */
export function orderRank(M: DiagramModel, sel: ItemRef): number | null {
  const byLine = (arr: { id: string; key: number | null | undefined }[]): number =>
    arr.slice().sort((a, b) => (a.key ?? 1e9) - (b.key ?? 1e9)).findIndex((x) => x.id === sel.id);
  if (sel.kind === 'node' && M.type === 'flowchart') return byLine([...M.nodes.values()].map((n) => ({ id: n.id, key: n.defLine })));
  if (sel.kind === 'entity' && M.type === 'er') return byLine([...M.entities.values()].map((e) => ({ id: e.id, key: e.defLine })));
  if (sel.kind === 'edge' && M.type === 'flowchart') return byLine(M.edges.map((e) => ({ id: e.id, key: e.src })));
  if (sel.kind === 'rel' && M.type === 'er') return byLine(M.rels.map((r) => ({ id: r.id, key: r.src })));
  return null;
}

export interface OrderPositions {
  /** Every reachable position, first (back / earlier / left) to last; `states[index]` is the current one. */
  states: OrderState[];
  index: number;
  /** Slider end labels. */
  labels: [string, string];
}

/** Every position the item can reach (at most 400 steps each way); steps that change nothing visible are skipped. */
export function orderPositions(code: string, model: DiagramModel, sel: ItemRef): OrderPositions {
  const base: OrderState = { code, model, sel, others: [] };
  const walk = (dir: -1 | 1): OrderState[] => {
    const out: OrderState[] = [];
    let cur = base;
    for (let i = 0; i < 400; i++) {
      const nx = orderStep(cur.code, cur.model, cur.sel, dir);
      if (!nx || 'reason' in nx) break;
      const st: OrderState = { code: nx.code, model: nx.model, sel: nx.sel, others: nx.other !== undefined ? [...cur.others, nx.other] : cur.others };
      out.push(st);
      cur = st;
    }
    return out;
  };
  // Steps past statements of another kind (an edge line for a node…) change nothing on the canvas: keep one per rank.
  const distinct = (list: OrderState[]): OrderState[] => {
    let last = orderRank(base.model, sel);
    return list.filter((st) => {
      const r = orderRank(st.model, st.sel);
      if (r == null || r !== last) {
        last = r;
        return true;
      }
      return false;
    });
  };
  const before = distinct(walk(-1)).reverse(), after = distinct(walk(1));
  const labels: [string, string] = sel.kind === 'participant' ? ['left', 'right'] : model.type === 'sequence' ? ['earlier', 'later'] : ['back', 'front'];
  return { states: [...before, base, ...after], index: before.length, labels };
}

/** Hand-placed participants trade places too (mutates `meta`). */
export function swapParticipantX(meta: DiagramMeta, a: string, b: string, geom: ReadonlyMap<string, Pick<BoxGeom, 'x'>> | null | undefined): void {
  const P = (meta.participants ??= {});
  if (P[a]?.x == null && P[b]?.x == null) return;
  const xa = P[a]?.x ?? geom?.get(a)?.x, xb = P[b]?.x ?? geom?.get(b)?.x;
  if (xa == null || xb == null) return;
  (P[a] ??= {}).x = Math.round(xb);
  (P[b] ??= {}).x = Math.round(xa);
}

export interface OrderBase {
  code: string;
  model: DiagramModel;
  meta: DiagramMeta;
  /** Participant boxes of the base render (sequence), for hand-placed x swaps. */
  participants?: ReadonlyMap<string, Pick<BoxGeom, 'x'>> | null;
}

/** The document at one reachable position (live preview and commit of the order slider). */
export function applyOrderState(base: OrderBase, st: OrderState): DocResult {
  let meta = cloneMeta(base.meta);
  if (st.model.type === 'sequence' && base.model.type === 'sequence') meta = remapSeqMeta(base.model, base.code, st.model, st.code, meta);
  if (st.sel.kind === 'participant' && base.participants) for (const other of st.others) swapParticipantX(meta, st.sel.id, other, base.participants);
  return { code: st.code, meta, selection: [st.sel] };
}

/** ⌘[ / ⌘]: one step back / forward, with the metadata following (refused with a reason at the ends). */
export function moveOrder(code: string, meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, sel: ItemRef, dir: -1 | 1): DocResult {
  const r = orderStep(code, model, sel, dir);
  if (!r || 'reason' in r) return { code, meta, reason: r?.reason ?? 'Cannot move further' };
  const participants = geom?.type === 'sequence' ? geom.participants : null;
  return applyOrderState({ code, model, meta, participants }, { code: r.code, model: r.model, sel: r.sel, others: r.other !== undefined ? [r.other] : [] });
}
