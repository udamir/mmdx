// The sequence diff (the view kind's `diff`: items matched by identity, or by aligning positional ones, each change put into one
// facet) and its merged picture (`merge`: the after version plus the removed items, changed text marked word by word).
import type { DiagramMeta } from '../meta/types.js';
import type { Participant, SeqBlockStart, SeqItem, SeqMessage, SeqNote, SequenceModel } from '../model.js';
import { field, metaFields, finish, added, removed, changedPresets, align } from './kit.js';
import type { FieldChange, ItemChange } from './types.js';
import { carryMeta, changedField, REMOVED, type MergeEnv } from './merge.js';
import { mergeText } from './text.js';

// ---- diff ---------------------------------------------------------------------------------------------------

export function diffSequence(a: SequenceModel, b: SequenceModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'content', 'title', a.title, b.title);
  field(doc, 'content', 'autonumber', a.autonumber, b.autonumber);
  const none = new Set<string>();
  const pa = new Map(a.participants.map((p) => [p.id, p]));
  const pb = new Map(b.participants.map((p) => [p.id, p]));
  const boxLabel = (m: SequenceModel, p: Participant) => (p.box ? m.boxes.find((x) => x.id === p.box)?.label ?? p.box : null);
  for (const [id, b1] of pb) {
    const a1 = pa.get(id);
    if (!a1) {
      items.push(added('participant', id, b1.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', a1.label, b1.label);
    field(f, 'content', 'kind', a1.kind, b1.kind);
    field(f, 'content', 'shape', a1.shape, b1.shape);
    field(f, 'content', 'box', boxLabel(a, a1), boxLabel(b, b1));
    field(f, 'content', 'order', a.participants.indexOf(a1), b.participants.indexOf(b1));
    metaFields(f, ma.participants?.[id], mb.participants?.[id], changedPresets(ma, mb, 'participant'));
    items.push(finish('participant', id, b1.label || id, f));
  }
  for (const [id, a1] of pa) if (!pb.has(id)) items.push(removed('participant', id, a1.label || id));

  const msgs = (m: SequenceModel) => m.items.filter((x): x is SeqMessage => x.kind === 'message');
  const msgName = (x: SeqMessage) => `${x.from} → ${x.to}: ${x.text}`;
  const m = align(msgs(a), msgs(b), (x) => `${x.from}|${x.to}|${x.text}|${x.arrow}|${x.central ?? ''}`, (x, y) => x.from === y.from && x.to === y.to);
  for (const [x, y] of m.pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'content', 'line', x.line, y.line);
    field(f, 'content', 'arrow', x.arrow + (x.central ? ` ${x.central}` : ''), y.arrow + (y.central ? ` ${y.central}` : ''));
    field(f, 'content', 'activation', `${x.activate ? '+' : ''}${x.deactivate ? '-' : ''}`, `${y.activate ? '+' : ''}${y.deactivate ? '-' : ''}`);
    metaFields(f, ma.messages?.[x.id], mb.messages?.[y.id], none);
    items.push(finish('message', y.id, msgName(y), f, x.id));
  }
  for (const x of m.onlyB) items.push(added('message', x.id, msgName(x)));
  for (const x of m.onlyA) items.push(removed('message', x.id, msgName(x)));

  const notes = (s: SequenceModel) => s.items.filter((x): x is SeqNote => x.kind === 'note');
  const n = align(notes(a), notes(b), (x) => `${x.pos}|${x.targets.join(',')}|${x.text}`, (x, y) => x.targets.join(',') === y.targets.join(','));
  for (const [x, y] of n.pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'content', 'placement', `${x.pos} ${x.targets.join(',')}`, `${y.pos} ${y.targets.join(',')}`);
    metaFields(f, ma.notes?.[x.id], mb.notes?.[y.id], none);
    items.push(finish('note', y.id, `Note: ${y.text}`, f, x.id));
  }
  for (const x of n.onlyB) items.push(added('note', x.id, `Note: ${x.text}`));
  for (const x of n.onlyA) items.push(removed('note', x.id, `Note: ${x.text}`));

  const blocks = (s: SequenceModel) => s.items.filter((x): x is SeqBlockStart => x.kind === 'blockStart');
  const bl = align(blocks(a), blocks(b), (x) => `${x.block}|${x.label}`, (x, y) => x.block === y.block);
  for (const [x, y] of bl.pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'label', x.label, y.label);
    field(f, 'style', 'colour', x.color, y.color);
    metaFields(f, ma.blocks?.[x.id], mb.blocks?.[y.id], none);
    items.push(finish('block', y.id, `${y.block} ${y.label}`.trim(), f, x.id));
  }
  for (const x of bl.onlyB) items.push(added('block', x.id, `${x.block} ${x.label}`.trim()));
  for (const x of bl.onlyA) items.push(removed('block', x.id, `${x.block} ${x.label}`.trim()));
}

// ---- merged picture -----------------------------------------------------------------------------------------

/** The merged sequence: the after version plus the removed items, changed text marked word by word. */
export function mergeSequence(env: MergeEnv, a: SequenceModel, b: SequenceModel): SequenceModel {
  const { diff, meta, byAfter, removed, mark } = env;
  const ma = env.before;
  const participants = [...b.participants];
  for (const [i, p] of participants.entries()) {
    const c = byAfter.get(`participant:${p.id}`);
    const pa = a.participants.find((x) => x.id === p.id);
    if (pa && changedField(c, 'label')) participants[i] = { ...p, label: mergeText(pa.label, p.label) };
  }
  for (const c of removed.filter((x) => x.kind === 'participant')) {
    const p = a.participants.find((x) => x.id === c.id)!;
    const at = Math.min(a.participants.indexOf(p), participants.length);
    participants.splice(at, 0, { ...p, box: null, lines: new Set() });
    mark(c, p.id);
  }
  const items: SeqItem[] = b.items.map((it) => {
    if (it.kind !== 'message' && it.kind !== 'note' && it.kind !== 'blockStart') return it;
    const kind = it.kind === 'blockStart' ? 'block' : it.kind;
    const c = byAfter.get(`${kind}:${it.id}`);
    if (c?.status !== 'changed') return it;
    const prev = a.items.find((x) => x.kind === it.kind && x.id === (c.beforeId ?? it.id));
    if (it.kind === 'message' && prev?.kind === 'message' && changedField(c, 'text')) return { ...it, text: mergeText(prev.text, it.text) };
    if (it.kind === 'note' && prev?.kind === 'note' && changedField(c, 'text')) return { ...it, text: mergeText(prev.text, it.text) };
    if (it.kind === 'blockStart' && prev?.kind === 'blockStart' && changedField(c, 'label')) return { ...it, label: mergeText(prev.label, it.label) };
    return it;
  });
  // removed messages and notes go right after the nearest earlier item that both versions have
  const afterOf = new Map<string, string>();
  for (const c of diff.items) if (c.status !== 'removed' && (c.kind === 'message' || c.kind === 'note')) afterOf.set(`${c.kind}:${c.beforeId ?? c.id}`, `${c.kind}:${c.id}`);
  const gone = new Set(removed.filter((c) => c.kind === 'message' || c.kind === 'note').map((c) => `${c.kind}:${c.id}`));
  let anchor: string | null = null;
  const pending = new Map<string | null, SeqItem[]>();
  for (const x of a.items) {
    if (x.kind !== 'message' && x.kind !== 'note') continue;
    const k = `${x.kind}:${x.id}`;
    if (gone.has(k)) {
      const copy: SeqMessage | SeqNote = x.kind === 'message' ? { ...x, id: x.id + REMOVED, activate: false, deactivate: false } : { ...x, id: x.id + REMOVED };
      pending.set(anchor, [...(pending.get(anchor) ?? []), copy]);
      carryMeta(meta, ma, x.kind, x.id, x.id + REMOVED);
      mark(removed.find((c) => `${c.kind}:${c.id}` === k)!, x.id + REMOVED);
    } else anchor = afterOf.get(k) ?? anchor;
  }
  const merged: SeqItem[] = [...(pending.get(null) ?? [])];
  for (const it of items) {
    merged.push(it);
    if (it.kind === 'message' || it.kind === 'note') merged.push(...(pending.get(`${it.kind}:${it.id}`) ?? []));
  }
  const model: SequenceModel = { ...b, participants, items: merged };
  return model;
}
