// The sequence edit kind.
import { activationsOf } from '../../core/ids.js';
import type { SequenceModel } from '../../core/model.js';
import { boxParticipants, deleteSeq, relabelBox, relabelSeq, removeActivation, unboxParticipants } from '../../core/ops/sequence.js';
import type { SequenceGeometry } from '../../core/render/types.js';
import type { Sel } from '../core.js';
import type { EditKind } from './types.js';

export const EDIT: EditKind<SequenceModel, SequenceGeometry> = {
  type: 'sequence',
  describe(M, { kind, id }) {
    if (kind === 'participant') {
      const p = M.participants.find((x) => x.id === id);
      if (p) return { title: p.label, sub: `${p.kind} · id ${id}` };
    } else if (kind === 'message') {
      const it = M.items.find((x) => x.kind === 'message' && x.id === id);
      if (it?.kind === 'message') return { title: it.text || '(no text)', sub: `message ${id} · ${it.from} → ${it.to}` };
    } else if (kind === 'note') {
      const it = M.items.find((x) => x.kind === 'note' && x.id === id);
      if (it?.kind === 'note') return { title: it.text, sub: `note ${id}` };
    } else if (kind === 'block') {
      const it = M.items.find((x) => x.kind === 'blockStart' && x.id === id);
      if (it?.kind === 'blockStart') return { title: it.label || it.block, sub: `${it.block} block ${id}` };
    } else if (kind === 'activation') {
      const a = activationsOf(M).find((x) => x.id === id);
      return { title: `Process on ${a?.participant ?? '?'}`, sub: `activation · line ${(a?.start.src ?? 0) + 1}${a?.end ? `–${a.end.src + 1}` : ' (never deactivated)'}` };
    } else if (kind === 'box') {
      const b = M.boxes.find((x) => x.id === id);
      return { title: b?.label || 'Box', sub: `participant group · ${b?.members.length ?? 0} participants` };
    }
    return null;
  },
  text(M, { kind, id }) {
    const it = M.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === id);
    if (kind === 'participant') return { value: M.participants.find((p) => p.id === id)?.label ?? '', multi: false, title: 'props.name', write: (code, v) => relabelSeq(code, M, { kind, id }, v) };
    if ((kind === 'message' || kind === 'note') && it && (it.kind === 'message' || it.kind === 'note'))
      return { value: it.text, multi: false, title: 'props.text', write: (code, v) => relabelSeq(code, M, { kind, id }, v) };
    if (kind === 'block' && it?.kind === 'blockStart') return { value: it.label, multi: false, title: 'props.condition', write: (code, v) => relabelSeq(code, M, { kind, id }, v) };
    if (kind === 'box') return { value: M.boxes.find((b) => b.id === id)?.label ?? '', multi: false, title: 'props.titleText', write: (code, v) => relabelBox(code, M, id, v) };
    return null;
  },
  remove: deleteSeq,
  removeOne(core, M, it) {
    if (it.kind !== 'activation') return false;
    const r = removeActivation(core.code, M, it.id);
    if (r.reason) core.toast(r.reason);
    else if (core.applyCode(r, 'Delete', { select: null })) core.toast(`Process on ${r.participant ?? ''} removed — ⌘/Ctrl+Z to undo`);
    return true;
  },
  canGroup(M, sel) {
    const ps = sel.filter((x) => x.kind === 'participant');
    if (!ps.length) return { ok: false, reason: 'group.selectParticipants' };
    if (ps.some((x) => M.participants.find((p) => p.id === x.id)?.box)) return { ok: false, reason: 'group.alreadyBoxed' };
    return { ok: true, reason: '' };
  },
  group: (code, M, sel, title) => boxParticipants(code, M, sel.filter((x) => x.kind === 'participant').map((x) => x.id), title),
  ungroup(code, M, it) {
    if (it.kind !== 'box') return null;
    const members: Sel[] = (M.boxes.find((b) => b.id === it.id)?.members ?? []).map((id) => ({ kind: 'participant', id }));
    return { code: unboxParticipants(code, M, it.id).code, members };
  },
  renameContainer: (code, M, it, name) => (it.kind === 'box' ? relabelBox(code, M, it.id, name) : null),
  noCopy: 'Copy works for flowchart shapes / groups and ER tables',
};
