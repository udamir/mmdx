// The sequence edit kind.
import { activationsOf } from '../../core/ids.js';
import type { SequenceModel } from '../../core/model.js';
import { addSeqMessage } from '../../core/ops/connect.js';
import { boxParticipants, deleteSeq, relabelBox, relabelSeq, removeActivation, unboxParticipants } from '../../core/ops/sequence.js';
import type { SequenceGeometry } from '../../core/render/types.js';
import type { Sel } from '../core.js';
import { reparse } from '../../core/kinds/registry.js';
import type { BlockKind, SeqBlockStart, SeqMessage, SeqNote } from '../../core/model.js';
import { addNote, addParticipant, seqInsertAfter, wrapBlock } from '../../core/ops/sequence.js';
import type { ItemKind } from '../../core/types.js';
import { applyThenStyle, focusLabel, setPreset } from '../modules/shapes/drop.js';
import { blockIcon, noteIcon, shapeIcon } from './palette.js';
import type { EditKind } from './types.js';

/** Palette item → the preset kind it is styled with. */
const SEQ_PRESET_KIND: Readonly<Record<string, ItemKind>> = {
  participant: 'participant', actor: 'participant', database: 'participant', note: 'note', loop: 'block', alt: 'block', opt: 'block', rect: 'block',
};

/** Palette item → the participant shape its previews show. */
const SEQ_SHAPE: Readonly<Record<string, string>> = { participant: 'box', actor: 'actor', database: 'database' };

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
  connectable: ['participant'],
  connect: addSeqMessage,
  added(M) {
    const msg = [...M.items].reverse().find((x) => x.kind === 'message');
    return msg && msg.kind === 'message' ? { ref: { kind: 'message', id: msg.id }, ports: false } : null;
  },
  connected: { label: 'Add message', toast: 'Message added — double-click it to edit its text' },
  palette: {
    mode: 'menu',
    title: 'Add to sequence',
    items: [
      { key: 'participant', label: 'Participant', icon: shapeIcon('box') },
      { key: 'actor', label: 'Actor', icon: shapeIcon('actor') },
      { key: 'database', label: 'Database', icon: shapeIcon('database') },
      { sep: true },
      { key: 'note', label: 'Note — drop next to a participant', icon: noteIcon },
      { key: 'loop', label: 'Loop — drop on a message (or select messages first)', icon: blockIcon('loop') },
      { key: 'alt', label: 'Alternative — drop on a message', icon: blockIcon('alt') },
      { key: 'opt', label: 'Optional — drop on a message', icon: blockIcon('opt') },
      { key: 'rect', label: 'Highlight — drop on a message', icon: blockIcon('hl') },
    ],
    presets: (item) => {
      const kind = SEQ_PRESET_KIND[item.key];
      if (!kind) return null;
      const shape = SEQ_SHAPE[item.key];
      return shape ? { kind, shape } : { kind };
    },
  },
  drop(core, M, item, pt) {
    const gm = core.geom;
    const pg = gm.type === 'sequence' ? gm : null;
    const px = M.participants
      .map((p) => ({ id: p.id, x: pg?.participants.get(p.id)?.x }))
      .filter((o): o is { id: string; x: number } => o.x != null)
      .sort((a, b) => a.x - b.x);
    if (item.key === 'participant' || item.key === 'actor' || item.key === 'database') {
      const res = addParticipant(core.code, M, { kind: item.key === 'actor' ? 'actor' : 'participant', beforeId: px.find((o) => o.x > pt.x)?.id ?? null });
      const ok = applyThenStyle(core, res.code, 'Add participant', res.select, () =>
        setPreset(core, 'participant', res.select.id, item.preset, item.key === 'database' ? { shape: 'database' } : {}));
      if (ok) focusLabel(core, res.select);
      return ok;
    }
    const msgs = M.items
      .filter((x): x is SeqMessage => x.kind === 'message')
      .map((x) => ({ it: x, y: pg?.messages.get(x.id)?.y }))
      .filter((o): o is { it: SeqMessage; y: number } => o.y != null);
    if (item.key === 'note') {
      if (!px.length) {
        core.toast('Add a participant first');
        return false;
      }
      const over = px.reduce((a, b) => (Math.abs(b.x - pt.x) < Math.abs(a.x - pt.x) ? b : a)).id;
      const above = msgs.filter((o) => o.y < pt.y);
      const afterLine = above.length ? Math.max(...above.map((o) => o.it.src)) : seqInsertAfter(M, core.code);
      const res = addNote(core.code, M, { over, afterLine });
      const N = reparse(res.code);
      const note = N.type === 'sequence' ? N.items.find((x): x is SeqNote => x.kind === 'note' && x.src === res.line) : undefined;
      const sel: Sel | null = note ? { kind: 'note', id: note.id } : null;
      const ok = applyThenStyle(core, res.code, 'Add note', sel, note ? () => setPreset(core, 'note', note.id, item.preset) : undefined);
      if (ok) focusLabel(core, sel);
      return ok;
    }
    const chosen = core.selection()
      .filter((x) => x.kind === 'message')
      .map((x) => M.items.find((i): i is SeqMessage => i.kind === 'message' && i.id === x.id))
      .filter((x): x is SeqMessage => !!x);
    let from: number, to: number;
    if (chosen.length) {
      from = Math.min(...chosen.map((x) => x.src));
      to = Math.max(...chosen.map((x) => x.src));
    } else if (msgs.length) {
      const near = msgs.reduce((a, b) => (Math.abs(b.y - pt.y) < Math.abs(a.y - pt.y) ? b : a));
      from = to = near.it.src;
    } else {
      core.toast('Add a message first (drag between two participants)');
      return false;
    }
    const labels: Record<string, string> = { loop: 'every minute', alt: 'success', opt: 'if needed' };
    const res = wrapBlock(core.code, M, { block: item.key as BlockKind, label: labels[item.key] ?? '', fromLine: from, toLine: to });
    const N = reparse(res.code);
    const blk = N.type === 'sequence' ? N.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.src === from) : undefined;
    const sel: Sel | null = blk ? { kind: 'block', id: blk.id } : null;
    const ok = applyThenStyle(core, res.code, 'Add block', sel, blk ? () => setPreset(core, 'block', blk.id, item.preset) : undefined);
    if (ok) focusLabel(core, sel);
    return ok;
  },
  numbered: (M) => M.autonumber,
  straight: true,
  layout: { title: 'page.seqLayout', fields: ['gap', 'rowH', 'mirror', 'blockSpan'] },
  orderTitle: 'tb.orderSeq',
};

// the type's view and ops kinds: the editor loads all three in one chunk (editor/kinds/loader.ts)
export { VIEW } from '../../core/kinds/sequence.js';
export { OPS } from '../../core/kinds/sequence-ops.js';
