// The sequence diff (the view kind's `diff`: items matched by identity, or by aligning positional ones, each change put into one
// facet) and its merged picture (`merge`: the after version plus the removed items, changed text marked word by word).
import type { DiagramMeta } from '../../meta/types.js';
import type { Participant, SeqBlockStart, SeqItem, SeqMessage, SeqNote, SequenceModel } from '../../model.js';
import { field, metaFields, changedPresets, diffAligned, diffById } from '../../diff/kit.js';
import type { FieldChange, ItemChange } from '../../diff/types.js';
import { changedField, keepRemoved, placeRemoved } from '../../diff/merge.js';
import { type MergeEnv } from '../../diff/types.js';
import { mergeText } from '../../diff/text.js';

// ---- diff ---------------------------------------------------------------------------------------------------

export function diffSequence(a: SequenceModel, b: SequenceModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'content', 'title', a.title, b.title);
  field(doc, 'content', 'autonumber', a.autonumber, b.autonumber);
  const none = new Set<string>();
  const pa = new Map(a.participants.map((p) => [p.id, p]));
  const pb = new Map(b.participants.map((p) => [p.id, p]));
  const boxLabel = (m: SequenceModel, p: Participant) => (p.box ? m.boxes.find((x) => x.id === p.box)?.label ?? p.box : null);
  diffById(items, 'participant', pa, pb, (p, id) => p.label || id, (a1, b1, f) => {
    field(f, 'content', 'label', a1.label, b1.label);
    field(f, 'content', 'kind', a1.kind, b1.kind);
    field(f, 'content', 'shape', a1.shape, b1.shape);
    field(f, 'content', 'box', boxLabel(a, a1), boxLabel(b, b1));
    field(f, 'content', 'order', a.participants.indexOf(a1), b.participants.indexOf(b1));
    metaFields(f, ma.participants?.[b1.id], mb.participants?.[b1.id], changedPresets(ma, mb, 'participant'));
  });

  const msgs = (m: SequenceModel) => m.items.filter((x): x is SeqMessage => x.kind === 'message');
  const msgName = (x: SeqMessage) => `${x.from} → ${x.to}: ${x.text}`;
  diffAligned(items, 'message', msgs(a), msgs(b), (x) => `${x.from}|${x.to}|${x.text}|${x.arrow}|${x.central ?? ''}`, (x) => `${x.from}\n${x.to}`, msgName, (x, y, f) => {
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'content', 'line', x.line, y.line);
    field(f, 'content', 'arrow', x.arrow + (x.central ? ` ${x.central}` : ''), y.arrow + (y.central ? ` ${y.central}` : ''));
    field(f, 'content', 'activation', `${x.activate ? '+' : ''}${x.deactivate ? '-' : ''}`, `${y.activate ? '+' : ''}${y.deactivate ? '-' : ''}`);
    metaFields(f, ma.messages?.[x.id], mb.messages?.[y.id], none);
  });

  const notes = (s: SequenceModel) => s.items.filter((x): x is SeqNote => x.kind === 'note');
  diffAligned(items, 'note', notes(a), notes(b), (x) => `${x.pos}|${x.targets.join(',')}|${x.text}`, (x) => x.targets.join(','), (x) => `Note: ${x.text}`, (x, y, f) => {
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'content', 'placement', `${x.pos} ${x.targets.join(',')}`, `${y.pos} ${y.targets.join(',')}`);
    metaFields(f, ma.notes?.[x.id], mb.notes?.[y.id], none);
  });

  const blocks = (s: SequenceModel) => s.items.filter((x): x is SeqBlockStart => x.kind === 'blockStart');
  diffAligned(items, 'block', blocks(a), blocks(b), (x) => `${x.block}|${x.label}`, (x) => x.block, (x) => `${x.block} ${x.label}`.trim(), (x, y, f) => {
    field(f, 'content', 'label', x.label, y.label);
    field(f, 'style', 'colour', x.color, y.color);
    metaFields(f, ma.blocks?.[x.id], mb.blocks?.[y.id], none);
  });
}

// ---- merged picture -----------------------------------------------------------------------------------------

/** The merged sequence: the after version plus the removed items, changed text marked word by word. */
export function mergeSequence(env: MergeEnv, a: SequenceModel, b: SequenceModel): SequenceModel {
  const { diff, byAfter, removed, mark } = env;
  const participants = [...b.participants];
  // indexes, not scans in loops (P11)
  const aParts = new Map(a.participants.map((p) => [p.id, p]));
  const aItems = new Map(a.items.map((x) => [`${x.kind}:${'id' in x ? x.id : ''}`, x]));
  const removedBy = new Map(removed.map((c) => [`${c.kind}:${c.id}`, c]));
  for (const [i, p] of participants.entries()) {
    const c = byAfter.get(`participant:${p.id}`);
    const pa = aParts.get(p.id);
    if (pa && changedField(c, 'label')) participants[i] = { ...p, label: mergeText(pa.label, p.label) };
  }
  for (const c of removed.filter((x) => x.kind === 'participant')) {
    const p = aParts.get(c.id)!;
    const at = Math.min(a.participants.indexOf(p), participants.length);
    participants.splice(at, 0, { ...p, box: null, lines: new Set() });
    mark(c, p.id);
  }
  const items: SeqItem[] = b.items.map((it) => {
    if (it.kind !== 'message' && it.kind !== 'note' && it.kind !== 'blockStart') return it;
    const kind = it.kind === 'blockStart' ? 'block' : it.kind;
    const c = byAfter.get(`${kind}:${it.id}`);
    if (c?.status !== 'changed') return it;
    const prev = aItems.get(`${it.kind}:${c.beforeId ?? it.id}`);
    if (it.kind === 'message' && prev?.kind === 'message' && changedField(c, 'text')) return { ...it, text: mergeText(prev.text, it.text) };
    if (it.kind === 'note' && prev?.kind === 'note' && changedField(c, 'text')) return { ...it, text: mergeText(prev.text, it.text) };
    if (it.kind === 'blockStart' && prev?.kind === 'blockStart' && changedField(c, 'label')) return { ...it, label: mergeText(prev.label, it.label) };
    return it;
  });
  // removed messages and notes go right after the nearest earlier item that both versions have
  const afterOf = new Map<string, string>();
  for (const c of diff.items) if (c.status !== 'removed' && (c.kind === 'message' || c.kind === 'note')) afterOf.set(`${c.kind}:${c.beforeId ?? c.id}`, `${c.kind}:${c.id}`);
  const keyOf = (x: SeqItem): string | null => (x.kind === 'message' || x.kind === 'note' ? `${x.kind}:${x.id}` : null);
  const keep = (x: SeqItem): SeqItem | null => {
    const c = (x.kind === 'message' || x.kind === 'note') && removedBy.get(`${x.kind}:${x.id}`);
    if (!c) return null;
    return keepRemoved(env, c, (id): SeqMessage | SeqNote => (x.kind === 'message' ? { ...x, id, activate: false, deactivate: false } : { ...x, id }));
  };
  return { ...b, participants, items: placeRemoved(a.items, items, keyOf, afterOf, keep) };
}
