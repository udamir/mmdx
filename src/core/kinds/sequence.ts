// The sequence view kind: what drawing a sequence needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import type { SequenceModel } from '../model.js';
import type { ItemRef } from '../types.js';
import { emptySequence, parseSequence } from '../parse/sequence.js';
import { renderSequence } from '../render/sequence.js';
import type { ViewKind } from '../kind/types.js';

export const VIEW: ViewKind<SequenceModel> = {
  type: 'sequence',
  parse: parseSequence,
  empty: emptySequence,
  render: renderSequence,

  items(model) {
    const out: ItemRef[] = [];
    for (const p of model.participants) out.push({ kind: 'participant', id: p.id });
    for (const it of model.items) {
      if (it.kind === 'message') out.push({ kind: 'message', id: it.id });
      else if (it.kind === 'note') out.push({ kind: 'note', id: it.id });
      else if (it.kind === 'blockStart') out.push({ kind: 'block', id: it.id });
    }
    for (const b of model.boxes) out.push({ kind: 'box', id: b.id });
    return out;
  },
  parents(model) {
    const out: [ItemRef, ItemRef][] = [];
    for (const b of model.boxes) for (const p of b.members) out.push([{ kind: 'participant', id: p }, { kind: 'box', id: b.id }]);
    const stack: string[] = [];
    for (const it of model.items) {
      const top = stack[stack.length - 1];
      if (it.kind === 'blockStart') {
        if (top) out.push([{ kind: 'block', id: it.id }, { kind: 'block', id: top }]);
        stack.push(it.id);
      } else if (it.kind === 'blockEnd') stack.pop();
      else if ((it.kind === 'message' || it.kind === 'note') && top) out.push([{ kind: it.kind, id: it.id }, { kind: 'block', id: top }]);
    }
    return out;
  },
  connectors: (model) =>
    model.items.flatMap((i) => (i.kind === 'message' ? [{ ref: { kind: 'message' as const, id: i.id }, from: { kind: 'participant' as const, id: i.from }, to: { kind: 'participant' as const, id: i.to } }] : [])),
  hideWith(model, sets) {
    // a hidden box hides its participants (and through them their messages and notes)
    for (const b of model.boxes) if (sets.box?.has(b.id)) for (const p of b.members) (sets.participant ??= new Set()).add(p);
  },
  frames: (model, lit) => model.boxes.filter((b) => b.members.some((m) => lit.has(m))).map((b) => ({ kind: 'box', id: b.id })),
  summary(model) {
    const messages = model.items.filter((i) => i.kind === 'message').length;
    return model.participants.length ? { key: 'label.sequence', params: { participants: model.participants.length, messages } } : { key: 'label.empty', params: {} };
  },
};
