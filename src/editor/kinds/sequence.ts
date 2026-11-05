// The sequence edit kind. T11.3: a message's arrow (the toolbar's arrow popover, Mermaid's ten) and its Reverse
// action, re-attaching an end (`reconnect`; the sequence module drags the end circles), a note's placement (left of,
// right of, over), a block's branches (Add / Delete branch in the toolbar, their conditions and Delete in Properties),
// par, critical and break in the palette; a rect has no text (its argument is its colour).
import { activationsOf } from '../../core/ids.js';
import type { SequenceModel } from '../../core/model.js';
import { addSeqMessage } from '../../core/ops/connect.js';
import {
  addBranch, boxParticipants, BRANCH_WORD, branchLabels, deleteSeq, MESSAGE_ARROWS, reattachMessage, relabelBox, relabelBranch, relabelSeq,
  removeActivation, removeBranch, reverseMessage, setMessageArrow, setNotePlacement, unboxParticipants,
} from '../../core/ops/sequence.js';
import type { RefusableResult } from '../../core/ops/types.js';
import type { ItemRef } from '../../core/types.js';
import type { SequenceGeometry } from '../../core/render/types.js';
import type { EditorCore, Sel } from '../core.js';
import { reparse } from '../../core/kinds/registry.js';
import type { BlockKind, SeqBlockStart, SeqMessage, SeqNote } from '../../core/model.js';
import { addNote, addParticipant, seqInsertAfter, wrapBlock } from '../../core/ops/sequence.js';
import { applyThenStyle, focusLabel, setPreset } from '../modules/shapes/drop.js';
import { blockIcon, noteIcon, shapeIcon } from './palette.js';
import type { EditKind, ItemAction, PropControl } from './types.js';

const reparseSeq = (code: string): SequenceModel | null => {
  const N = reparse(code);
  return N.type === 'sequence' ? N : null;
};
const findBlock = (M: SequenceModel, id: string): SeqBlockStart | undefined => M.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.id === id);

/** Applies a rewrite of the type's own (a toast says why it was refused), keeping `select` selected. */
function apply(core: EditorCore, r: RefusableResult, label: string, select: ItemRef[] | null): void {
  if (r.reason) core.toast(r.reason);
  else if (r.code !== core.code) core.applyCode({ code: r.code }, label, { select });
}

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
    // a rect's argument is its colour, not a text
    if (kind === 'block' && it?.kind === 'blockStart' && it.block !== 'rect') return { value: it.label, multi: false, title: 'props.condition', write: (code, v) => relabelSeq(code, M, { kind, id }, v) };
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
  // the end circles of a message dragged to another lifeline (the sequence module): the end moves there
  reconnect: (code, M, ref, which, target) => (ref.kind === 'message' ? reattachMessage(code, M, ref.id, which === 'a' ? 'from' : 'to', target) : null),
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
      { key: 'par', label: 'Parallel — drop on a message', icon: blockIcon('par') },
      { key: 'critical', label: 'Critical region — drop on a message', icon: blockIcon('crit') },
      { key: 'break', label: 'Break — drop on a message', icon: blockIcon('break') },
      { key: 'rect', label: 'Highlight — drop on a message', icon: blockIcon('hl') },
    ],
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
    const labels: Record<string, string> = { loop: 'every minute', alt: 'success', opt: 'if needed', par: 'at once', critical: 'must succeed', break: 'on error' };
    const res = wrapBlock(core.code, M, { block: item.key as BlockKind, label: labels[item.key] ?? '', fromLine: from, toLine: to });
    const N = reparse(res.code);
    const blk = N.type === 'sequence' ? N.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.src === from) : undefined;
    const sel: Sel | null = blk ? { kind: 'block', id: blk.id } : null;
    const ok = applyThenStyle(core, res.code, 'Add block', sel, blk ? () => setPreset(core, 'block', blk.id, item.preset) : undefined);
    if (ok) focusLabel(core, sel);
    return ok;
  },
  codeArrow(core, M, ref) {
    if (ref.kind !== 'message') return null;
    const m = M.items.find((x): x is SeqMessage => x.kind === 'message' && x.id === ref.id);
    if (!m) return null;
    const t = core.i18n.t;
    return { rows: MESSAGE_ARROWS, value: m.arrow, set: (a) => apply(core, setMessageArrow(core.code, M, m.id, a), t('seq.arrow'), [ref]) };
  },
  actions(core, M, ref) {
    const t = core.i18n.t;
    const out: ItemAction[] = [];
    if (ref.kind === 'message') {
      const m = M.items.find((x): x is SeqMessage => x.kind === 'message' && x.id === ref.id);
      if (m) out.push({ id: 'reverse', label: t('seq.reverse'), icon: 'reverse', disabled: m.from === m.to, run: () => apply(core, reverseMessage(core.code, M, m.id), t('seq.reverse'), [ref]) });
    } else if (ref.kind === 'note') {
      const n = M.items.find((x): x is SeqNote => x.kind === 'note' && x.id === ref.id);
      if (n)
        for (const [pos, id, icon, key] of [['left of', 'left', 'noteLeft', 'seq.noteLeft'], ['right of', 'right', 'noteRight', 'seq.noteRight'], ['over', 'over', 'noteOver', 'seq.noteOver']] as const)
          out.push({ id, label: t(key), icon, active: n.pos === pos, run: () => apply(core, setNotePlacement(core.code, M, n.id, pos), t('seq.placement'), [ref]) });
    } else if (ref.kind === 'block') {
      const b = findBlock(M, ref.id);
      const word = b && BRANCH_WORD[b.block];
      if (b && word) {
        out.push({ id: 'addBranch', label: t('seq.addBranch', { word }), icon: 'branchAdd', run: () => apply(core, addBranch(core.code, M, b.id), t('seq.addBranch', { word }), [ref]) });
        const n = branchLabels(M, b.id).length;
        if (n) out.push({ id: 'deleteBranch', label: t('seq.deleteLastBranch'), icon: 'branchDel', run: () => apply(core, removeBranch(core.code, M, b.id, n), t('seq.deleteLastBranch'), [ref]) });
      }
    }
    return out;
  },
  properties(core, M, ref) {
    const t = core.i18n.t;
    const out: PropControl[] = [];
    if (ref.kind === 'note') {
      const n = M.items.find((x): x is SeqNote => x.kind === 'note' && x.id === ref.id);
      if (n)
        out.push({
          type: 'select', label: t('seq.placement'), value: n.pos, options: (['left of', 'right of', 'over'] as const).map((p) => [p, t(`seq.place.${p}`)] as const),
          set: (v) => apply(core, setNotePlacement(core.code, M, n.id, v as SeqNote['pos']), t('seq.placement'), [ref]),
        });
      return out;
    }
    const b = ref.kind === 'block' ? findBlock(M, ref.id) : undefined;
    const word = b && BRANCH_WORD[b.block];
    if (!b || !word) return out;
    // the conditions of the branches after the first, one per line (the first is the block's own text)
    const labels = branchLabels(M, b.id);
    if (labels.length)
      out.push({
        type: 'rows', label: t('seq.branches', { word }), value: labels, hint: t('seq.branchesHint'),
        set: (rows) => {
          let code = core.code;
          rows.slice(0, labels.length).forEach((v, i) => {
            if (v !== labels[i]) code = relabelBranch(code, reparseSeq(code) ?? M, b.id, i + 1, v).code;
          });
          apply(core, { code }, t('seq.branches', { word }), [ref]);
        },
      });
    out.push({ type: 'button', label: t('seq.addBranch', { word }), title: t('seq.addBranchTip', { word }), run: () => apply(core, addBranch(core.code, M, b.id), t('seq.addBranch', { word }), [ref]) });
    labels.forEach((label, i) =>
      out.push({ type: 'button', label: t('seq.deleteBranch', { label: label || word }), title: t('seq.deleteBranchTip'), run: () => apply(core, removeBranch(core.code, M, b.id, i + 1), t('seq.deleteBranch', { label: label || word }), [ref]) }));
    return out;
  },
  numbered: (M) => M.autonumber,
  straight: true,
  layout: { title: 'page.seqLayout', fields: ['gap', 'rowH', 'mirror', 'blockSpan'] },
  orderTitle: 'tb.orderSeq',
};

// the type's view and ops kinds: the editor loads all three in one chunk (editor/kinds/loader.ts)
export { VIEW } from '../../core/kinds/sequence.js';
export { OPS } from '../../core/kinds/sequence-ops.js';
