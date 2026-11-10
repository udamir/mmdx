// Sequence item ids are positional (m1, m2…, B:1…): when items are inserted or removed, their layout / style
// metadata is carried over by matching the source text in order (prototype `remapSeqMeta`).
import { activationsOf } from '../ids.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { SequenceModel, SeqItem } from '../model.js';
import { setOwn } from '../own.js';

type Coll = 'messages' | 'notes' | 'blocks';
const KINDS: [Coll, (x: SeqItem) => boolean][] = [
  ['messages', (x) => x.kind === 'message'],
  ['notes', (x) => x.kind === 'note'],
  ['blocks', (x) => x.kind === 'blockStart'],
];

const idOf = (x: SeqItem): string => ('id' in x ? x.id : '');

interface Keyed {
  id: string;
  /** What identifies the item across the edit (its source text). */
  t: string;
}

/** Moves each entry of `m` from its old id to the new id of the item with the same key; else the same id, if it still exists. */
function carry(m: Record<string, ItemMeta>, o: readonly Keyed[], n: readonly Keyed[]): Record<string, ItemMeta> {
  const free = new Map<string, string[]>();
  for (const x of n) {
    const q = free.get(x.t);
    if (q) q.push(x.id);
    else free.set(x.t, [x.id]);
  }
  const nIds = new Set(n.map((x) => x.id));
  const used = new Set<string>(), res: Record<string, ItemMeta> = {}, pending: Keyed[] = [];
  // match by key (any order), then fall back to the same id (e.g. the text itself was edited)
  for (const a of o) {
    const nid = free.get(a.t)?.find((id) => !used.has(id));
    if (nid) {
      used.add(nid);
      if (m[a.id]) setOwn(res, nid, m[a.id]!);
    } else pending.push(a);
  }
  for (const a of pending)
    if (m[a.id] && nIds.has(a.id) && !used.has(a.id)) {
      used.add(a.id);
      setOwn(res, a.id, m[a.id]!);
    }
  return res;
}

const unchanged = (o: readonly Keyed[], n: readonly Keyed[]): boolean => o.length === n.length && o.every((a, i) => n[i]!.id === a.id && n[i]!.t === a.t);

/** Returns the metadata with positional sequence ids moved to the items' new ids. Pure; `meta` is not modified. */
export function remapSequenceMeta(meta: DiagramMeta, oldModel: SequenceModel, oldCode: string, newModel: SequenceModel, newCode: string): DiagramMeta {
  const OL = oldCode.split('\n'), NL = newCode.split('\n');
  const out: DiagramMeta = { ...meta };
  for (const [coll, f] of KINDS) {
    const m = meta[coll];
    if (!m || !Object.keys(m).length) continue;
    const o = oldModel.items.filter(f).map((x) => ({ id: idOf(x), t: OL[x.src]?.trim() ?? '' }));
    const n = newModel.items.filter(f).map((x) => ({ id: idOf(x), t: NL[x.src]?.trim() ?? '' }));
    if (!unchanged(o, n)) out[coll] = carry(m, o, n);
  }
  // boxes are numbered in source order too (box1, box2…): matched by their \`box\` line (B30)
  const bm = meta.boxes;
  if (bm && Object.keys(bm).length) {
    const o = oldModel.boxes.map((b) => ({ id: b.id, t: OL[b.line]?.trim() ?? '' }));
    const n = newModel.boxes.map((b) => ({ id: b.id, t: NL[b.line]?.trim() ?? '' }));
    if (!unchanged(o, n)) out.boxes = carry(bm, o, n);
  }
  // processes: match by participant + the statements they start on, else keep the same id (B:1, B:2…)
  const am = meta.activations;
  if (am && Object.keys(am).length) {
    const key = (participant: string, src: number, L: string[]): string => `${participant}|${L[src]?.trim()}|${L[src + 1]?.trim()}`;
    const o = activationsOf(oldModel).map((a) => ({ id: a.id, t: key(a.participant, a.start.src, OL) }));
    const n = activationsOf(newModel).map((a) => ({ id: a.id, t: key(a.participant, a.start.src, NL) }));
    out.activations = carry(am, o, n);
  }
  return out;
}
