// Sequence item ids are positional (m1, m2…, B:1…): when items are inserted or removed, their layout / style
// metadata is carried over by matching the source text in order (prototype `remapSeqMeta`).
import { activationsOf } from '../ids.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { SequenceModel, SeqItem } from '../model.js';

type Coll = 'messages' | 'notes' | 'blocks';
const KINDS: [Coll, (x: SeqItem) => boolean][] = [
  ['messages', (x) => x.kind === 'message'],
  ['notes', (x) => x.kind === 'note'],
  ['blocks', (x) => x.kind === 'blockStart'],
];

const idOf = (x: SeqItem): string => ('id' in x ? x.id : '');

/** Returns the metadata with positional sequence ids moved to the items' new ids. Pure; `meta` is not modified. */
export function remapSequenceMeta(meta: DiagramMeta, oldModel: SequenceModel, oldCode: string, newModel: SequenceModel, newCode: string): DiagramMeta {
  const OL = oldCode.split('\n'), NL = newCode.split('\n');
  const out: DiagramMeta = { ...meta };
  for (const [coll, f] of KINDS) {
    const m = meta[coll];
    if (!m || !Object.keys(m).length) continue;
    const o = oldModel.items.filter(f).map((x) => ({ id: idOf(x), t: OL[x.src]?.trim() ?? '' }));
    const n = newModel.items.filter(f).map((x) => ({ id: idOf(x), t: NL[x.src]?.trim() ?? '' }));
    if (o.length === n.length && o.every((a, i) => n[i]!.id === a.id && n[i]!.t === a.t)) continue;
    // match by source text (any order), then fall back to the same id (e.g. the text itself was edited)
    const free = new Map<string, string[]>();
    for (const x of n) {
      const q = free.get(x.t);
      if (q) q.push(x.id);
      else free.set(x.t, [x.id]);
    }
    const nIds = new Set(n.map((x) => x.id));
    const used = new Set<string>(), res: Record<string, ItemMeta> = {}, pending: typeof o = [];
    for (const a of o) {
      const q = free.get(a.t);
      const nid = q?.find((id) => !used.has(id));
      if (nid) {
        used.add(nid);
        if (m[a.id]) res[nid] = m[a.id]!;
      } else pending.push(a);
    }
    for (const a of pending)
      if (m[a.id] && nIds.has(a.id) && !used.has(a.id)) {
        used.add(a.id);
        res[a.id] = m[a.id]!;
      }
    out[coll] = res;
  }
  // processes: match by participant + the statements they start on, else keep the same id (B:1, B:2…)
  const am = meta.activations;
  if (am && Object.keys(am).length) {
    const key = (participant: string, src: number, L: string[]): string => `${participant}|${L[src]?.trim()}|${L[src + 1]?.trim()}`;
    const o = activationsOf(oldModel).map((a) => ({ id: a.id, t: key(a.participant, a.start.src, OL) }));
    const n = activationsOf(newModel).map((a) => ({ id: a.id, t: key(a.participant, a.start.src, NL) }));
    const byKey = new Map<string, string[]>();
    for (const x of n) {
      const q = byKey.get(x.t);
      if (q) q.push(x.id);
      else byKey.set(x.t, [x.id]);
    }
    const nIds = new Set(n.map((x) => x.id));
    const used = new Set<string>(), res: Record<string, ItemMeta> = {}, pending: typeof o = [];
    for (const a of o) {
      const hit = byKey.get(a.t)?.find((id) => !used.has(id));
      if (hit) {
        used.add(hit);
        if (am[a.id]) res[hit] = am[a.id]!;
      } else pending.push(a);
    }
    for (const a of pending)
      if (am[a.id] && nIds.has(a.id) && !used.has(a.id)) {
        used.add(a.id);
        res[a.id] = am[a.id]!;
      }
    out.activations = res;
  }
  return out;
}
