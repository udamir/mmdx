// Sequence diagram helpers of the editor (5.5): the processes on a lifeline, the statement above a height, the
// heights a block edge snaps to, a live code change carrying positional metadata, and Show as process.
import type { SeqBlockStart, SeqMessage, SeqNote, SequenceModel } from '../../../core/model.js';
import { remapSequenceMeta } from '../../../core/ops/remap.js';
import { toggleActivation } from '../../../core/ops/sequence.js';
import type { SequenceGeometry } from '../../../core/render/types.js';
import type { EditorCore } from '../../core.js';

export const seqModel = (core: EditorCore): SequenceModel | null => (core.model.type === 'sequence' ? core.model : null);
export const seqGeom = (core: EditorCore): SequenceGeometry | null => (core.geom.type === 'sequence' ? core.geom : null);

/** The processes of a participant that cover height y. */
export function llBars(core: EditorCore, pid: string, y: number): { x: number; y0: number; y1: number; w: number }[] {
  const gm = seqGeom(core);
  return gm ? [...gm.activations.values()].filter((a) => a.participant === pid && y >= a.y0 && y <= a.y1) : [];
}

/** Source line after which something dropped at height y belongs (last statement above it). */
export function seqLineAbove(core: EditorCore, y: number): number | null {
  const M = seqModel(core), gm = seqGeom(core);
  if (!M || !gm) return null;
  let best: { line: number; y: number } | null = null;
  const take = (line: number | undefined, yy: number | undefined): void => {
    if (line != null && yy != null && yy < y && (!best || yy > best.y)) best = { line, y: yy };
  };
  for (const it of M.items) {
    if (it.kind === 'message') take(it.src, gm.messages.get(it.id)?.y);
    else if (it.kind === 'note') take(it.src, gm.notes.get(it.id)?.y);
    else if (it.kind === 'blockStart') {
      const b = gm.blocks.get(it.id);
      if (b) {
        take(it.src, b.y0 + 30);
        take(it.lines[it.lines.length - 1], b.y1);
      }
    }
  }
  return (best as { line: number } | null)?.line ?? null;
}

/**
 * The height of the statement on a line (undefined: a non-visual line, keep scanning), with the items indexed by line
 * once (P22: every item scanned per line of a block resize); a line is the first item's in code order that is on it.
 */
function seqAnchors(M: SequenceModel, gm: SequenceGeometry): (j: number) => number | null | undefined {
  const blocks = new Map<number, SeqBlockStart>(), items = new Map<number, SeqMessage | SeqNote>();
  for (const x of M.items) {
    if (x.kind === 'blockStart') {
      for (const l of [x.src, x.lines[x.lines.length - 1]!]) if (!blocks.has(l)) blocks.set(l, x);
    } else if ((x.kind === 'message' || x.kind === 'note') && !items.has(x.src)) items.set(x.src, x);
  }
  return (j) => {
    const blk = blocks.get(j);
    if (blk) {
      const b = gm.blocks.get(blk.id);
      return b ? (b.y0 + b.y1) / 2 : null;
    }
    const it = items.get(j);
    if (!it) return undefined;
    return (it.kind === 'message' ? gm.messages.get(it.id)?.y : gm.notes.get(it.id)?.y) ?? null;
  };
}

/** Heights where a block edge pulls in the next statement outside (`out`) or pushes out the last inside (`inn`). */
export function edgeAnchors(core: EditorCore, id: string, edge: 'top' | 'bottom'): { out?: number | null; inn?: number | null } {
  const M = seqModel(core), gm = seqGeom(core);
  const it = M?.items.find((x) => x.kind === 'blockStart' && x.id === id);
  if (!M || !gm || !it || it.kind !== 'blockStart') return {};
  const L = core.code.split('\n');
  const s = it.src, e = it.lines[it.lines.length - 1]!;
  const seqAnchor = seqAnchors(M, gm);
  const startsAt = new Map<number, SeqBlockStart[]>();
  for (const x of M.items) if (x.kind === 'blockStart') (startsAt.get(x.src) ?? startsAt.set(x.src, []).get(x.src)!).push(x);
  const isBlockStartAt = (j: number): boolean => startsAt.has(j);
  const scan = (from: number, dir: number, stop: (t: string, j: number) => boolean): number | null => {
    for (let j = from; j >= 0 && j < L.length; j += dir) {
      const t = (L[j] ?? '').trim();
      if (!t || t.startsWith('%%')) continue;
      if (stop(t, j)) return null;
      const a = seqAnchor(j);
      if (a !== undefined) return a;
    }
    return null;
  };
  const outerStop = (t: string): boolean => /^(sequenceDiagram|participant|actor|box|title|autonumber|else|and|option)\b/.test(t);
  if (edge === 'bottom')
    return {
      out: scan(e + 1, +1, (t, j) => (t === 'end' && !isBlockStartAt(j)) || /^(else|and|option)\b/.test(t)),
      inn: scan(e - 1, -1, (t, j) => j <= s || /^(else|and|option)\b/.test(t)),
    };
  return {
    out: scan(s - 1, -1, (t, j) => outerStop(t) || !!startsAt.get(j)?.some((x) => x.lines[x.lines.length - 1]! > s)),
    inn: scan(s + 1, +1, (t, j) => j >= e || /^(else|and|option)\b/.test(t)),
  };
}

/** Replaces the code inside an open transaction (live gesture preview), carrying positional metadata along. */
export function liveCode(core: EditorCore, code: string): void {
  const oldModel = core.model, oldCode = core.code;
  core.write({ code: code });
  const M = core.model;
  if (oldModel.type === 'sequence' && M.type === 'sequence') core.write({ meta: remapSequenceMeta(core.meta, oldModel, oldCode, M, code) });
}

/** Two selected messages → can they become a process (`activationInfo`)? */
export function activationInfo(core: EditorCore): { participant?: string; removed?: boolean; reason?: string } | null {
  const sel = core.selection(), M = seqModel(core);
  if (!M || sel.length !== 2 || sel.some((x) => x.kind !== 'message')) return null;
  const r = toggleActivation(core.code, M, sel[0]!.id, sel[1]!.id);
  if (r.reason) return { reason: r.reason };
  const out: { participant?: string; removed?: boolean } = {};
  if (r.participant !== undefined) out.participant = r.participant;
  if (r.removed !== undefined) out.removed = r.removed;
  return out;
}

/** Two selected messages → a process on their shared participant, or removes it (`applyActivation`). */
export function applyActivation(core: EditorCore): void {
  const sel = core.selection(), M = seqModel(core);
  if (!M || sel.length !== 2) return;
  const r = toggleActivation(core.code, M, sel[0]!.id, sel[1]!.id);
  if (r.reason) {
    core.toast(r.reason);
    return;
  }
  const t = core.i18n.t;
  core.applyCode(r, t(r.removed ? 'history.removeProcess' : 'history.showProcess'), { select: sel });
  core.toast(t(r.removed ? 'seq.processOff' : 'seq.processOn', { p: r.participant ?? '' }));
}
