// The sequence view kind: what drawing a sequence needs (the viewer loads it on demand, core bundles it in ALL_KINDS).
import { boxShape } from '../diff/shape.js';
import { diffSequence, mergeSequence } from '../diff/sequence.js';
import { activationsOf } from '../ids.js';
import type { SequenceModel } from '../model.js';
import type { OutlineItem } from '../outline.js';
import type { SequenceGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import { emptySequence, parseSequence } from '../parse/sequence.js';
import { renderSequence, seqPresets } from '../render/sequence.js';
import type { Presets, ViewKind } from './types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export const VIEW: ViewKind<SequenceModel, SequenceGeometry> = {
  type: 'sequence',
  parse: parseSequence,
  empty: emptySequence,
  render: renderSequence,
  presets: (theme, meta) => seqPresets(theme, meta) as unknown as Record<string, Presets>,
  codeShape(model, { kind, id }) {
    const p = kind === 'participant' ? model.participants.find((x) => x.id === id) : undefined;
    return (p?.shape || undefined) ?? (p?.kind === 'actor' ? 'actor' : undefined);
  },

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
  find(M, tok) {
    if (M.participants.some((p) => p.id === tok)) return { kind: 'participant', id: tok };
    if (M.boxes.some((b) => b.id === tok)) return { kind: 'box', id: tok };
    const it = M.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === tok);
    if (it) return { kind: it.kind === 'blockStart' ? 'block' : (it.kind as 'message' | 'note'), id: tok };
    if (activationsOf(M).some((a) => a.id === tok)) return { kind: 'activation', id: tok };
    return null;
  },
  search(M) {
    const out: { ref: ItemRef; texts: (string | undefined)[] }[] = [];
    for (const p of M.participants) out.push({ ref: { kind: 'participant', id: p.id }, texts: [p.id, p.label] });
    for (const b of M.boxes) out.push({ ref: { kind: 'box', id: b.id }, texts: [b.label] });
    for (const it of M.items) {
      if (it.kind === 'message' || it.kind === 'note') out.push({ ref: { kind: it.kind, id: it.id }, texts: [it.text] });
      else if (it.kind === 'blockStart') out.push({ ref: { kind: 'block', id: it.id }, texts: [it.label] });
    }
    return out;
  },
  exists(model, { kind, id }) {
    if (kind === 'participant') return model.participants.some((p) => p.id === id);
    if (kind === 'box') return model.boxes.some((b) => b.id === id);
    if (kind === 'activation') return activationsOf(model).some((a) => a.id === id);
    if (kind === 'message' || kind === 'note') return model.items.some((it) => it.kind === kind && it.id === id);
    if (kind === 'block') return model.items.some((it) => it.kind === 'blockStart' && it.id === id);
    return false;
  },
  takenIds: (model, participants) => (participants ? model.participants.map((p) => p.id) : []),
  usedIds(model) {
    const messages = new Set<string>(), notes = new Set<string>(), blocks = new Set<string>();
    for (const it of model.items) {
      if (it.kind === 'message') messages.add(it.id);
      else if (it.kind === 'note') notes.add(it.id);
      else if (it.kind === 'blockStart') blocks.add(it.id);
    }
    return {
      participants: new Set(model.participants.map((p) => p.id)),
      messages, notes, blocks,
      boxes: new Set(model.boxes.map((b) => b.id)),
      activations: new Set(activationsOf(model).map((a) => a.id)),
    };
  },
  lines(M, { kind, id }) {
    const set = new Set<number>();
    const add = (x: number | null | undefined): void => {
      if (x != null) set.add(x);
    };
    const range = (a: number | null | undefined, b: number | null | undefined): void => {
      if (a == null) return;
      for (let i = a; i <= (b ?? a); i++) set.add(i);
    };
    if (kind === 'activation') {
      const a = activationsOf(M).find((x) => x.id === id);
      if (a) {
        add(a.start.src);
        add(a.end?.src);
      }
    } else if (kind === 'participant') M.participants.find((p) => p.id === id)?.lines.forEach(add);
    else if (kind === 'message' || kind === 'note') add(M.items.find((i) => i.kind === kind && i.id === id)?.src);
    else if (kind === 'block') {
      const it = M.items.find((i) => i.kind === 'blockStart' && i.id === id);
      if (it?.kind === 'blockStart') range(it.src, it.lines[it.lines.length - 1]);
    } else if (kind === 'box') {
      const b = M.boxes.find((x) => x.id === id);
      range(b?.line, b?.endLine);
    }
    return [...set].sort((a, b) => a - b);
  },
  diffLines(m, { kind, id }) {
    const out = new Set<number>();
    const add = (n: number | null | undefined): void => {
      if (n !== null && n !== undefined) out.add(n);
    };
    if (kind === 'participant') m.participants.find((p) => p.id === id)?.lines.forEach(add);
    else
      for (const it of m.items) {
        if (it.kind === 'message' && kind === 'message' && it.id === id) add(it.src);
        else if (it.kind === 'note' && kind === 'note' && it.id === id) add(it.src);
        else if (it.kind === 'blockStart' && kind === 'block' && it.id === id) it.lines.forEach(add);
      }
    return out;
  },
  box(g, it, activations) {
    if (it.kind === 'participant') return (it.foot ? g.participantFeet.get(it.id) : null) ?? g.participants.get(it.id) ?? null;
    if (it.kind === 'box') return g.boxes.get(it.id) ?? null;
    if (it.kind === 'block') return g.blocks.get(it.id) ?? null;
    if (it.kind === 'note') return g.notes.get(it.id) ?? null;
    if (it.kind === 'activation' && activations) {
      const a = g.activations.get(it.id);
      return a ? { x: a.x, y: (a.y0 + a.y1) / 2, w: a.w, h: a.y1 - a.y0 } : null;
    }
    return null;
  },
  frames: (model, lit) => model.boxes.filter((b) => b.members.some((m) => lit.has(m))).map((b) => ({ kind: 'box', id: b.id })),
  isEmpty: (model) => !model.participants.length,
  outline(model) {
    const name = new Map(model.participants.map((p) => [p.id, one(p.label)]));
    const out: OutlineItem[] = [];
    let n = 0;
    for (const it of model.items) {
      if (it.kind === 'message')
        out.push({ text: `${model.autonumber ? `${++n}. ` : ''}${name.get(it.from) ?? it.from} → ${name.get(it.to) ?? it.to}${it.text ? `: ${one(it.text)}` : ''}` });
      else if (it.kind === 'note') out.push({ text: `Note (${it.targets.map((t) => name.get(t) ?? t).join(', ')}): ${one(it.text)}` });
      else if (it.kind === 'blockStart') out.push({ text: `${it.block}${it.label ? ` ${one(it.label)}` : ''}` });
      else if (it.kind === 'blockElse') out.push({ text: `else${it.label ? ` ${one(it.label)}` : ''}` });
      else if (it.kind === 'blockEnd') out.push({ text: 'end' });
    }
    return out;
  },
  summary(model) {
    const messages = model.items.filter((i) => i.kind === 'message').length;
    return model.participants.length ? { key: 'label.sequence', params: { participants: model.participants.length, messages } } : { key: 'label.empty', params: {} };
  },
  diff: diffSequence,
  merge: mergeSequence,
  shape(geom, { kind, id }) {
    if (kind === 'participant') return boxShape(geom.participants.get(id));
    if (kind === 'note') return boxShape(geom.notes.get(id));
    if (kind === 'block') return boxShape(geom.blocks.get(id));
    if (kind === 'box') return boxShape(geom.boxes.get(id));
    if (kind === 'message') {
      const m = geom.messages.get(id);
      if (!m) return null;
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1);
      return { t: 'rect', r: m.self ? { x: x0 - 6, y: m.y - 26, w: x1 - x0 + 40, h: 62 } : { x: x0, y: m.y - 26, w: x1 - x0, h: 36 } };
    }
    return null;
  },
  positionalIds: true,
};
