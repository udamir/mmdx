// Adding an item from the Shapes menu at a diagram point, with the prototype's placement rules
// (prototype app.js `groupAt`, `dropPaletteItem`).
import { addEntity } from '../../../core/ops/er.js';
import { addFlowNode } from '../../../core/ops/flowchart.js';
import { cloneMeta, ensure as ensureIn } from '../../../core/ops/meta-util.js';
import { addNote, addParticipant, seqInsertAfter, wrapBlock } from '../../../core/ops/sequence.js';
import { parse } from '../../../core/parse/index.js';
import type { BlockKind, SeqBlockStart, SeqMessage, SeqNote } from '../../../core/model.js';
import type { ItemKind, Point } from '../../../core/types.js';
import type { EditorCore, Sel } from '../../core.js';
import { MERMAID_SHAPES, type PaletteItem } from './items.js';

/** The innermost visible group around a point (a dropped shape joins it). */
export function groupAt(core: EditorCore, pt: Point): string | null {
  const gm = core.geom;
  if (gm.type !== 'flowchart') return null;
  let best: { id: string; a: number } | null = null;
  gm.groups.forEach((b, id) => {
    if (b.hidden) return;
    if (Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2 && (!best || b.w * b.h < best.a)) best = { id, a: b.w * b.h };
  });
  return (best as { id: string } | null)?.id ?? null;
}

/** Opens the new item's text (inline editor, else the properties panel; prototype `focusLabel`). */
function focusLabel(core: EditorCore, it: Sel | null): void {
  if (!it) return;
  setTimeout(() => {
    if (!core.isSelected(it) || core.selection().length !== 1) return;
    if (!core.run('inlineEdit', it)) core.run('setPanel', 'properties', true);
  }, 0);
}

/**
 * Sequence: applies the rewrite and then styles the new item in the same history step (positional metadata is
 * remapped by applyCode, so the preset is set on the new id afterwards).
 */
function applySeq(core: EditorCore, code: string, label: string, sel: Sel | null, patch?: () => void): boolean {
  core.begin();
  const ok = core.applyCode({ code }, label, { select: sel ? [sel] : null });
  if (!ok) {
    core.store.rollback();
    return false;
  }
  if (patch) {
    patch();
    core.store.preview();
  }
  core.commit(label);
  return true;
}

const setPreset = (core: EditorCore, kind: ItemKind, id: string, preset: string | undefined, extra: Record<string, unknown> = {}): void => {
  if (!preset && !Object.keys(extra).length) return;
  const m = core.ensure(kind, id);
  Object.assign(m, extra);
  if (preset) m.preset = preset;
};

/** Adds a palette item at diagram point `pt` (snapped). Returns false when refused (a toast says why). */
export function dropPaletteItem(core: EditorCore, item: PaletteItem, at: Point): boolean {
  const M = core.model;
  const pt = { x: core.snapV(at.x), y: core.snapV(at.y) };
  if (M.type === 'flowchart') {
    const native = MERMAID_SHAPES.has(item.key);
    const res = addFlowNode(core.code, M, { label: item.label.split(' /')[0]!, shape: native ? item.key : 'rect', group: groupAt(core, pt) });
    const meta = cloneMeta(core.meta);
    const m = ensureIn(meta, 'node', res.select.id);
    Object.assign(m, { x: pt.x, y: pt.y }, native ? {} : { shape: item.key }, item.preset ? { preset: item.preset } : {});
    const ok = core.applyCode({ code: res.code, meta }, 'Add shape', { select: [res.select] });
    if (ok) focusLabel(core, res.select);
    return ok;
  }
  if (M.type === 'er') {
    const res = addEntity(core.code, M);
    const meta = cloneMeta(core.meta);
    Object.assign(ensureIn(meta, 'entity', res.select.id), { x: pt.x, y: pt.y }, item.preset ? { preset: item.preset } : {});
    const ok = core.applyCode({ code: res.code, meta }, 'Add table', { select: [res.select] });
    if (ok) focusLabel(core, res.select);
    return ok;
  }
  if (M.type !== 'sequence') return false;
  const gm = core.geom;
  const pg = gm.type === 'sequence' ? gm : null;
  const px = M.participants
    .map((p) => ({ id: p.id, x: pg?.participants.get(p.id)?.x }))
    .filter((o): o is { id: string; x: number } => o.x != null)
    .sort((a, b) => a.x - b.x);
  if (item.key === 'participant' || item.key === 'actor' || item.key === 'database') {
    const res = addParticipant(core.code, M, { kind: item.key === 'actor' ? 'actor' : 'participant', beforeId: px.find((o) => o.x > pt.x)?.id ?? null });
    const ok = applySeq(core, res.code, 'Add participant', res.select, () =>
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
    const N = parse(res.code);
    const note = N.type === 'sequence' ? N.items.find((x): x is SeqNote => x.kind === 'note' && x.src === res.line) : undefined;
    const sel: Sel | null = note ? { kind: 'note', id: note.id } : null;
    const ok = applySeq(core, res.code, 'Add note', sel, note ? () => setPreset(core, 'note', note.id, item.preset) : undefined);
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
  const N = parse(res.code);
  const blk = N.type === 'sequence' ? N.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.src === from) : undefined;
  const sel: Sel | null = blk ? { kind: 'block', id: blk.id } : null;
  const ok = applySeq(core, res.code, 'Add block', sel, blk ? () => setPreset(core, 'block', blk.id, item.preset) : undefined);
  if (ok) focusLabel(core, sel);
  return ok;
}
