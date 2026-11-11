// The sequence ops kind: code order (participants trade places, items move within their blocks), positional ids and
// the metadata that follows them.
import { seqPresets } from '../render/sequence-presets.js';
import { activationsOf } from '../ids.js';
import type { ItemRef } from '../types.js';
import type { SequenceModel } from '../model.js';
import { activationsBalanced } from '../ops/activations.js';
import { remapSequenceMeta } from '../ops/remap.js';
import { swapParticipant } from '../ops/sequence.js';
import type { LineSpan } from '../ops/types.js';
import type { SequenceGeometry } from '../render/types.js';
import type { OpsKind } from '../kind/ops-types.js';
import { asPresets, lineSpan } from './ops-kit.js';


export const OPS: OpsKind<SequenceModel, SequenceGeometry> = {
  type: 'sequence',
  blocks(model) {
    const out: LineSpan[] = [];
    for (const b of model.boxes) if (b.endLine != null) out.push({ start: b.line, end: b.endLine });
    for (const it of model.items) if (it.kind === 'blockStart') out.push({ start: it.src, end: it.lines[it.lines.length - 1] ?? it.src });
    return out;
  },
  unit(M, sel) {
    switch (sel.kind) {
      case 'participant': {
        const p = M.participants.find((x) => x.id === sel.id);
        return p ? lineSpan(p.defLine) : null;
      }
      case 'box': {
        const b = M.boxes.find((x) => x.id === sel.id);
        return b ? { start: b.line, end: b.endLine ?? b.line } : null;
      }
      case 'block': {
        const it = M.items.find((x) => x.kind === 'blockStart' && x.id === sel.id);
        return it && it.kind === 'blockStart' ? { start: it.src, end: it.lines[it.lines.length - 1] ?? it.src } : null;
      }
      case 'message':
      case 'note':
        return lineSpan(M.items.find((x) => x.kind === sel.kind && x.id === sel.id)?.src);
      default:
        return null;
    }
  },
  checkMove: (code) => (activationsBalanced(code) ? null : 'Moving it there would deactivate a participant before it is activated (+/− markers)'),
  orderStep: (code, model, sel, dir) => (sel.kind === 'participant' ? swapParticipant(code, model, sel.id, dir) : undefined),
  relocate(M, sel, line) {
    if (sel.kind === 'box') return M.boxes.find((b) => b.line === line)?.id;
    const want = sel.kind === 'block' ? 'blockStart' : sel.kind;
    const it = M.items.find((x) => x.src === line && x.kind === want);
    return it && 'id' in it ? it.id : undefined;
  },
  orderLabels: (sel) => (sel.kind === 'participant' ? ['left', 'right'] : ['earlier', 'later']),
  swapBoxes: (geom) => geom.participants,
  remapMeta: remapSequenceMeta,
  codeShape(model, { kind, id }) {
    const p = kind === 'participant' ? model.participants.find((x) => x.id === id) : undefined;
    return (p?.shape || undefined) ?? (p?.kind === 'actor' ? 'actor' : undefined);
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
  isEmpty: (model) => !model.participants.length,
  theme: { slots: { participant: 'sequence.participant', message: 'sequence.message', block: 'sequence.block', note: 'sequence.note', activation: 'sequence.activation', box: 'sequence.box' } },
  presets: (theme, meta) => asPresets(seqPresets(theme, meta)),
  drawn: (g) => [
    ...[...g.participants].map(([id, box]) => ({ ref: { kind: 'participant' as const, id }, box })),
    ...[...g.boxes].map(([id, box]) => ({ ref: { kind: 'box' as const, id }, box })),
    ...[...g.notes].map(([id, box]) => ({ ref: { kind: 'note' as const, id }, box })),
    ...[...g.blocks].map(([id, box]) => ({ ref: { kind: 'block' as const, id }, box })),
    ...[...g.activations].map(([id, a]) => ({ ref: { kind: 'activation' as const, id }, box: { x: a.x, y: (a.y0 + a.y1) / 2, w: a.w, h: a.y1 - a.y0 } })),
    ...[...g.messages].map(([id, m]) => ({
      ref: { kind: 'message' as const, id },
      points: m.self ? [[m.x0, m.y], [m.x0 + 30, m.y], [m.x0 + 30, m.y + 18], [m.x0, m.y + 18]] as [number, number][] : [[m.x0, m.y], [m.x1, m.y]] as [number, number][],
    })),
  ],
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
};
