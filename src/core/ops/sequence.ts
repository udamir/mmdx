// Sequence editing ops as Mermaid source rewrites (prototype edit.js, sequence part): participants, boxes, notes,
// blocks (loop / alt / …), block resizing, processes (activations) and participant order.
import { maxOf, minOf } from '../geom.js';
import { activationsOf } from '../ids.js';
import type { BlockKind, Participant, SeqBlockStart, SeqItem, SeqMessage, SequenceModel } from '../model.js';
import { encodeLabel } from '../parse/label.js';
import type { ItemRef } from '../types.js';
import { blocksOf } from './reorder.js';
import { uniqueId } from './ids.js';
import { applyEdits, indentOf, splice, type LineEdit } from './lines.js';
import type { ActivationResult, CodeResult, LineResult, LineSpan, RefusableResult, ResizeBlockResult, SelectResult, SwapResult } from './types.js';

export { activationsOf } from '../ids.js';

const headerLine = (code: string): number => Math.max(0, code.split('\n').findIndex((l) => /^\s*sequenceDiagram\b/.test(l)));

function lastDeclLine(model: SequenceModel, code: string): number {
  const d = model.participants.map((p) => p.defLine).filter((x): x is number => x != null);
  return d.length ? maxOf(d) : headerLine(code);
}

// Earliest line that mentions any participant (declarations must come before messages).
function firstMention(model: SequenceModel, code: string): number {
  const all: number[] = [];
  for (const p of model.participants) for (const li of p.lines) all.push(li);
  for (const b of model.boxes) all.push(b.line);
  return all.length ? minOf(all) : headerLine(code) + 1;
}

const declWord = (p: Pick<Participant, 'kind'>): string => (p.kind === 'actor' ? 'actor' : 'participant');
const declOf = (p: Participant, L: readonly string[]): string => (p.defLine != null ? (L[p.defLine] ?? '').trim() : `${declWord(p)} ${p.id}`);
// Free text after `as` / `:` / a block keyword: one line in the code (newlines → <br>), quotes kept as typed.
const seqText = (s: string): string => encodeLabel(s).replace(/#quot;/g, '"');

export interface AddParticipantOpts {
  kind?: 'participant' | 'actor';
  label?: string;
  /** Insert before this participant (else last). */
  beforeId?: string | null;
}

/**
 * Inserts a participant before `beforeId` (or last). All participants outside boxes are written as explicit
 * declarations in display order, so the visual order is exactly what the user dropped.
 */
export function addParticipant(code: string, model: SequenceModel, { kind = 'participant', label, beforeId = null }: AddParticipantOpts = {}): SelectResult & { select: ItemRef } {
  const id = uniqueId(model, kind === 'actor' ? 'Actor' : 'P');
  const L = code.split('\n');
  const mine = `${kind === 'actor' ? 'actor' : 'participant'} ${id}${label ? ` as ${seqText(label)}` : ''}`;
  const free = model.participants.filter((p) => !p.box);
  const list: string[] = [];
  let placed = false;
  for (const p of free) {
    if (p.id === beforeId) {
      list.push(mine);
      placed = true;
    }
    list.push(declOf(p, L));
  }
  if (!placed && !list.includes(mine)) list.push(mine);
  const declared = free.map((p) => p.defLine).filter((x): x is number => x != null);
  const at = firstMention(model, code);
  const edits: LineEdit[] = declared.map((li) => ({ at: li, del: 1, ins: [] }));
  edits.push({ at, del: 0, ins: list.map((x) => '  ' + x) });
  return { code: applyEdits(code, edits), select: { kind: 'participant', id } };
}

/** Deletes participants (every line mentioning them), messages, notes, blocks (their own lines) and box frames. */
export function deleteSeq(code: string, model: SequenceModel, items: readonly ItemRef[]): RefusableResult {
  const L = code.split('\n');
  const parts = new Set(items.filter((s) => s.kind === 'participant').map((s) => s.id));
  const ids = new Set(items.filter((s) => s.kind === 'message' || s.kind === 'note').map((s) => s.id));
  const blocks = new Set(items.filter((s) => s.kind === 'block').map((s) => s.id));
  const boxIds = new Set(items.filter((s) => s.kind === 'box').map((s) => s.id));
  const del = new Set<number>();
  for (const p of model.participants) if (parts.has(p.id)) p.lines.forEach((li) => del.add(li));
  for (const it of model.items) {
    if ((it.kind === 'message' || it.kind === 'note') && ids.has(it.id)) del.add(it.src);
    if (it.kind === 'blockStart' && blocks.has(it.id)) it.lines.forEach((li) => del.add(li));
  }
  for (const b of model.boxes)
    if (boxIds.has(b.id)) {
      del.add(b.line);
      if (b.endLine != null) del.add(b.endLine);
    }
  // processes: their activate / deactivate lines go, their +/- markers are cleared
  const acts = new Set(items.filter((s) => s.kind === 'activation').map((s) => s.id));
  if (acts.size)
    for (const a of activationsOf(model))
      if (acts.has(a.id))
        for (const e of [a.start, a.end])
          if (e) {
            if (e.type === 'line') del.add(e.src);
            else L[e.src] = setMarker(L[e.src], '');
          }
  const out = L.filter((_, i) => !del.has(i)).join('\n');
  if (acts.size && !activationsBalanced(out)) return { code, reason: 'That would leave a deactivation without its activation' };
  return { code: out };
}

/** New text for a participant (`as …`), message, note or block condition. */
export function relabelSeq(code: string, model: SequenceModel, sel: ItemRef, text: string): CodeResult {
  const L = code.split('\n');
  if (sel.kind === 'participant') {
    const p = model.participants.find((x) => x.id === sel.id);
    if (!p) return { code };
    const decl = `${declWord(p)} ${p.id}${text && text !== p.id ? ` as ${seqText(text)}` : ''}`;
    if (p.defLine != null) return { code: splice(code, p.defLine, 1, [indentOf(L[p.defLine]) + decl]) };
    return { code: splice(code, lastDeclLine(model, code) + 1, 0, ['  ' + decl]) };
  }
  const it = model.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === sel.id);
  if (!it) return { code };
  const line = L[it.src] ?? '';
  const t = seqText(text);
  if (it.kind === 'blockStart') return { code: splice(code, it.src, 1, [line.replace(/^(\s*\w+)\b.*$/, (_m, head: string) => `${head} ${t}`)]) };
  return { code: splice(code, it.src, 1, [line.replace(/:(.*)$/, () => `: ${t}`)]) };
}

/** `Note over <over>: note` after line `afterLine` (else at the end). */
export function addNote(code: string, _model: SequenceModel, { over, afterLine = null }: { over: string; afterLine?: number | null }): LineResult {
  const at = afterLine != null ? afterLine + 1 : code.replace(/\s+$/, '').split('\n').length;
  return { code: splice(code.replace(/\s+$/, '') + '\n', at, 0, [`  Note over ${over}: note`]), line: at };
}

/** Line after which new sequence items go when nothing is above the drop point. */
export function seqInsertAfter(model: SequenceModel, code: string): number {
  return lastDeclLine(model, code);
}

export interface WrapBlockOpts {
  block?: BlockKind;
  label?: string;
  fromLine: number;
  toLine: number;
}

/** Wraps lines [fromLine..toLine] into a block (loop / alt / opt / par / critical / break / rect). */
export function wrapBlock(code: string, _model: SequenceModel, { block = 'loop', label = 'condition', fromLine, toLine }: WrapBlockOpts): CodeResult {
  const L = code.split('\n');
  const ind = indentOf(L[fromLine]);
  const edits: LineEdit[] = [
    { at: toLine + 1, del: 0, ins: [ind + 'end'] },
    ...Array.from({ length: toLine - fromLine + 1 }, (_, i) => ({ at: fromLine + i, del: 1, ins: ['  ' + (L[fromLine + i] ?? '')] })),
    { at: fromLine, del: 0, ins: [`${ind}${block}${block === 'rect' ? ' rgb(240, 245, 255)' : ` ${seqText(label)}`}`] },
  ];
  return { code: applyEdits(code, edits) };
}

/** Groups participants into a Mermaid `box`. Their declarations move into the box block. */
export function boxParticipants(code: string, model: SequenceModel, ids: readonly string[], title = 'Group'): SelectResult {
  const L = code.split('\n');
  const want = new Set(ids);
  const parts = model.participants.filter((p) => want.has(p.id) && !p.box);
  if (!parts.length) return { code };
  const edits: LineEdit[] = [];
  const decls: string[] = [];
  for (const p of parts) {
    if (p.defLine != null) {
      decls.push('    ' + (L[p.defLine] ?? '').trim());
      edits.push({ at: p.defLine, del: 1, ins: [] });
    } else decls.push(`    ${declWord(p)} ${p.id}`);
  }
  // Undeclared participants that appear before the grouped ones must stay first.
  const firstIdx = model.participants.indexOf(parts[0]!);
  const lead = model.participants.slice(0, firstIdx).filter((p) => !p.box).map((p) => {
    if (p.defLine != null) edits.push({ at: p.defLine, del: 1, ins: [] });
    return '  ' + declOf(p, L);
  });
  const at = firstMention(model, code);
  edits.push({ at, del: 0, ins: [...lead, `  box ${title}`, ...decls, '  end'] });
  const id = `box${model.boxes.length + 1}`;
  return { code: applyEdits(code, edits), select: { kind: 'box', id } };
}

export function unboxParticipants(code: string, model: SequenceModel, boxId: string): CodeResult {
  const b = model.boxes.find((x) => x.id === boxId);
  if (!b) return { code };
  const L = code.split('\n');
  const edits: LineEdit[] = [{ at: b.line, del: 1, ins: [] }];
  if (b.endLine != null) {
    edits.push({ at: b.endLine, del: 1, ins: [] });
    for (let i = b.line + 1; i < b.endLine; i++) edits.push({ at: i, del: 1, ins: [(L[i] ?? '').replace(/^ {2}/, '')] });
  }
  return { code: applyEdits(code, edits) };
}

export function relabelBox(code: string, model: SequenceModel, boxId: string, title: string): CodeResult {
  const b = model.boxes.find((x) => x.id === boxId);
  if (!b) return { code };
  const L = code.split('\n');
  return { code: splice(code, b.line, 1, [`${indentOf(L[b.line])}box ${b.color ? b.color + ' ' : ''}${title}`]) };
}

// ---- activation balance -------------------------------------------------------------------------------------------

const MSG_MARK = /^(.+?)\s*(?:<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-])?\s*([^:]+?)\s*:/;

/** Mermaid rejects a deactivation (`-` or `deactivate X`) of a participant that is not active. */
export function activationsBalanced(code: string): boolean {
  const active = new Map<string, number>();
  const on = (p: string): void => void active.set(p, (active.get(p) ?? 0) + 1);
  const off = (p: string): boolean => {
    const n = active.get(p) ?? 0;
    if (!n) return false;
    active.set(p, n - 1);
    return true;
  };
  for (const raw of code.split('\n')) {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^activate\s+(.+)$/.exec(t))) {
      on((m[1] ?? '').trim());
      continue;
    }
    if ((m = /^deactivate\s+(.+)$/.exec(t))) {
      if (!off((m[1] ?? '').trim())) return false;
      continue;
    }
    m = MSG_MARK.exec(t);
    if (!m) continue;
    const [, from = '', mark, to = ''] = m;
    if (mark === '+') on(to.trim());
    if (mark === '-' && !off(from.trim())) return false;
  }
  return true;
}

// ---- resize a block (loop/alt/opt/…) ------------------------------------------------------------------------------
// Moving the block's first line (`loop …`) or its `end` past one neighbouring statement pulls that statement into
// the block (grow) or pushes it out (shrink). Nested blocks count as one statement; activate/deactivate lines travel
// along with the next statement; a block (or alt branch) always keeps at least one statement.

const skip = (t: string): boolean => !t || t.startsWith('%%');
const isHeader = (t: string): boolean => /^(flowchart|graph|sequenceDiagram|erDiagram)\b/.test(t);
const nonVisual = (t: string): boolean => skip(t) || /^(activate|deactivate|autonumber)\b/.test(t);
const isDivider = (t: string): boolean => /^(else|and|option)\b/.test(t);
const isDecl = (t: string): boolean => /^(participant|actor|create|box|title|autonumber)\b/.test(t);

const isBlockStart = (x: SeqItem): x is SeqBlockStart => x.kind === 'blockStart';
const blockEnd = (it: SeqBlockStart): number => it.lines[it.lines.length - 1] ?? it.src;

function blockSpan(model: SequenceModel, id: string): LineSpan | null {
  const it = model.items.find((x): x is SeqBlockStart => isBlockStart(x) && x.id === id);
  return it ? { start: it.src, end: blockEnd(it) } : null;
}

interface BlockIndex {
  byStart: Map<number, LineSpan>;
  byEnd: Map<number, LineSpan>;
  boxEnds: Set<number>;
}

function blockIndex(model: SequenceModel): BlockIndex {
  const blocks = blocksOf(model);
  return {
    byStart: new Map(blocks.map((b) => [b.start, b])),
    byEnd: new Map(blocks.map((b) => [b.end, b])),
    boxEnds: new Set(model.boxes.map((b) => b.endLine).filter((x): x is number => x != null)),
  };
}

// One statement next to line `i` going `dir` (±1), at the same nesting level. null at a boundary.
function neighbourUnit(L: readonly string[], ix: BlockIndex, i: number, dir: 1 | -1, stopAtDivider = true): LineSpan | null {
  let j = i + dir;
  while (j >= 0 && j < L.length && skip((L[j] ?? '').trim())) j += dir;
  if (j < 0 || j >= L.length) return null;
  const t = (L[j] ?? '').trim();
  if (isHeader(t) || (stopAtDivider && isDivider(t))) return null;
  if (dir > 0) {
    if (t === 'end' && !ix.byStart.has(j)) return null;
    return ix.byStart.get(j) ?? { start: j, end: j };
  }
  if (ix.byStart.has(j) || isDecl(t) || (t === 'end' && ix.boxEnds.has(j))) return null;
  return ix.byEnd.get(j) ?? { start: j, end: j };
}

// Move line `from` so it ends up at index `to` (in the array after removal).
function moveLine(L: string[], from: number, to: number): void {
  const [x] = L.splice(from, 1);
  L.splice(to, 0, x ?? '');
}

// Does the branch between lines s and e (exclusive) hold a visual statement?
function branchHasContent(L: readonly string[], s: number, e: number): boolean {
  for (let i = s + 1; i < e; i++) {
    const t = (L[i] ?? '').trim();
    if (!nonVisual(t) && !isDivider(t)) return true;
  }
  return false;
}

/** One step of resizing a block by its top or bottom edge. Returns the new code and the block's new first line. */
export function resizeBlockStep(code: string, model: SequenceModel, blockId: string, edge: 'top' | 'bottom', grow: boolean): ResizeBlockResult {
  const L = code.split('\n');
  const b = blockSpan(model, blockId);
  if (!b) return { code, reason: 'Block not found' };
  // the index is of the original lines; a step that moves only non-visual lines keeps scanning from the moved edge
  const ix = blockIndex(model);
  for (let guard = 0; guard < 50; guard++) {
    let unit: LineSpan | null, from: number, to: number, newStart: number;
    if (edge === 'bottom' && grow) {
      unit = neighbourUnit(L, ix, b.end, +1);
      if (!unit) return { code, reason: 'Nothing more to include below' };
      from = b.end; to = unit.end; newStart = b.start;
    } else if (edge === 'bottom') {
      unit = neighbourUnit(L, ix, b.end, -1);
      if (!unit || unit.start <= b.start) return { code, reason: 'A block needs at least one statement' };
      // the last branch must keep content
      let div = b.start;
      for (let i = b.start + 1; i < unit.start; i++) if (isDivider((L[i] ?? '').trim())) div = i;
      if (!branchHasContent(L, div, unit.start)) return { code, reason: 'A block needs at least one statement' };
      from = b.end; to = unit.start; newStart = b.start;
    } else if (grow) {
      unit = neighbourUnit(L, ix, b.start, -1);
      if (!unit) return { code, reason: 'Nothing more to include above' };
      from = b.start; to = unit.start; newStart = unit.start;
    } else {
      unit = neighbourUnit(L, ix, b.start, +1);
      if (!unit || unit.end >= b.end) return { code, reason: 'A block needs at least one statement' };
      let div = b.end;
      for (let i = b.end - 1; i > unit.end; i--) if (isDivider((L[i] ?? '').trim())) div = i;
      if (!branchHasContent(L, unit.end, div)) return { code, reason: 'A block needs at least one statement' };
      from = b.start; to = unit.end; newStart = unit.end;
    }
    const unitLines = L.slice(unit.start, unit.end + 1);
    moveLine(L, from, to);
    // Stop once a visual statement crossed the border; activate/deactivate lines just come along.
    if (unitLines.some((x) => !nonVisual(x.trim()))) return { code: L.join('\n'), start: edge === 'top' ? to : newStart };
    if (edge === 'top') b.start = to;
    else b.end = to;
  }
  return { code, reason: 'Could not resize' };
}

// ---- activation ("process") between two messages ------------------------------------------------------------------
// Turns two messages into a process (activation bar) on the participant they share:
//   call `A->>B` + reply `B-->>A`  →  `A->>+B` … `B-->>-A`   (Mermaid +/- markers)
// For any other arrangement the pair is wrapped in `activate P` / `deactivate P` lines.
// Applying it to an already-activated pair removes the activation instead.

const MSG_ARROW = /^(\s*.+?\s*(?:<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->))\s*([+-])?\s*(.+)$/;
const setMarker = (line: string | undefined, mark: '' | '+' | '-'): string =>
  (line ?? '').replace(MSG_ARROW, (_m, head: string, _mk: string | undefined, rest: string) => `${head}${mark}${rest}`);
const markerOf = (line: string | undefined): string => MSG_ARROW.exec(line ?? '')?.[2] ?? '';
const UNBALANCED = 'That would deactivate a participant that is not active (+/− markers)';
const BLOCK_HEAD = /^\s*(loop|alt|opt|par|critical|break|rect|else|and|option)\b/;

const findMessage = (model: SequenceModel, id: string): SeqMessage | undefined =>
  model.items.find((x): x is SeqMessage => x.kind === 'message' && x.id === id);

/** `on`: the participant to activate (when dragged from a message end); default: the one the two messages share. */
export function toggleActivation(code: string, model: SequenceModel, idA: string, idB: string, on: string | null = null): ActivationResult {
  if (idA === idB) return { code, reason: 'Pick two different messages' };
  const a = findMessage(model, idA), b = findMessage(model, idB);
  if (!a || !b) return { code, reason: 'Select two messages' };
  const [m1, m2] = a.src <= b.src ? [a, b] : [b, a];
  const shared = [m1.to, m1.from].filter((p) => p === m2.from || p === m2.to);
  if (!on && !shared.length) return { code, reason: 'The two messages have no participant in common' };
  const P = on || (m1.to === m2.from ? m1.to : shared[0]!);
  const L = code.split('\n');
  const before = L[m1.src - 1]?.trim(), after = L[m2.src + 1]?.trim();
  let removed = false;
  if (m1.activate && m1.to === P && m2.deactivate && m2.from === P) {
    L[m1.src] = setMarker(L[m1.src], '');
    L[m2.src] = setMarker(L[m2.src], '');
    removed = true;
  } else if (before === `activate ${P}` && after === `deactivate ${P}`) {
    L.splice(m2.src + 1, 1);
    L.splice(m1.src - 1, 1);
    removed = true;
  } else if (m1.to === P && m2.from === P && !m1.activate && !m1.deactivate && !m2.activate && !m2.deactivate) {
    L[m1.src] = setMarker(L[m1.src], '+');
    L[m2.src] = setMarker(L[m2.src], '-');
  } else {
    L.splice(m2.src + 1, 0, `${indentOf(L[m2.src])}deactivate ${P}`);
    L.splice(m1.src, 0, `${indentOf(L[m1.src])}activate ${P}`);
  }
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: UNBALANCED };
  return { code: out, participant: P, removed };
}

/**
 * A process on P drawn along its lifeline: `activate P` after line `afterA` (null = before the first message),
 * `deactivate P` after line `afterB` — so it spans every statement in between.
 */
export function addActivation(code: string, model: SequenceModel, P: string, afterA: number | null, afterB: number | null): ActivationResult {
  const L = code.split('\n');
  const top = Math.max(lastDeclLine(model, code), maxOf(model.boxes.map((b) => b.endLine ?? -1), -Infinity));
  const a = afterA == null ? top : Math.max(afterA, top);
  if (afterB == null || afterB <= a) return { code, reason: 'Drag the process across at least one message' };
  const indent = (li: number): string => {
    const ref = indentOf(L[li]);
    return BLOCK_HEAD.test(L[li] ?? '') ? ref + '  ' : li <= top ? '  ' : ref;
  };
  L.splice(afterB + 1, 0, `${indent(afterB)}deactivate ${P}`);
  L.splice(a + 1, 0, `${indent(a)}activate ${P}`);
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: UNBALANCED };
  return { code: out };
}

interface LineOp {
  at: number;
  del?: boolean;
  text?: string;
}

// Apply line deletions / insertions bottom-up (at the same line: delete first, then insert before it).
function lineOps(L: string[], ops: LineOp[]): void {
  ops.sort((a, b) => b.at - a.at || (a.del ? -1 : 1));
  for (const o of ops) if (o.del) L.splice(o.at, 1);
  else L.splice(o.at, 0, o.text ?? '');
}

/** Removes a process: its `+`/`-` markers or its activate / deactivate lines. */
export function removeActivation(code: string, model: SequenceModel, id: string): ActivationResult {
  const a = activationsOf(model).find((x) => x.id === id);
  if (!a) return { code };
  const L = code.split('\n'), ops: LineOp[] = [];
  for (const e of [a.start, a.end])
    if (e) {
      if (e.type === 'line') ops.push({ at: e.src, del: true });
      else L[e.src] = setMarker(L[e.src], '');
    }
  lineOps(L, ops);
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: 'That would leave a deactivation without its activation' };
  return { code: out, participant: a.participant };
}

/**
 * Moves the top (start) or bottom (end) of a process to message msgId: a +/− marker when the message arrives at /
 * leaves the participant, otherwise an `activate` line before it / a `deactivate` line after it.
 */
export function moveActivationEdge(code: string, model: SequenceModel, id: string, edge: 'top' | 'bottom', msgId: string): ActivationResult {
  const a = activationsOf(model).find((x) => x.id === id);
  const m = findMessage(model, msgId);
  if (!a || !m) return { code };
  if (edge === 'top' && a.end && m.src > a.end.src) return { code, reason: 'The process would start after it ends' };
  if (edge === 'bottom' && m.src < a.start.src) return { code, reason: 'The process would end before it starts' };
  const old = edge === 'top' ? a.start : a.end;
  if (old && old.msg === msgId) return { code }; // already there
  const L = code.split('\n'), ops: LineOp[] = [];
  if (old) {
    if (old.type === 'line') ops.push({ at: old.src, del: true });
    else L[old.src] = setMarker(L[old.src], '');
  }
  const free = m.from !== m.to && !markerOf(L[m.src]);
  const pid = a.participant;
  if (edge === 'top') {
    if (free && m.to === pid) L[m.src] = setMarker(L[m.src], '+');
    else ops.push({ at: m.src, text: `${indentOf(L[m.src])}activate ${pid}` });
  } else if (free && m.from === pid) L[m.src] = setMarker(L[m.src], '-');
  else ops.push({ at: m.src + 1, text: `${indentOf(L[m.src])}deactivate ${pid}` });
  lineOps(L, ops);
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: UNBALANCED };
  return { code: out, participant: pid };
}

/** `Note over A,B: text` spans every participant from A to B; a single id gives `Note over A: text`. */
export function setNoteSpan(code: string, model: SequenceModel, noteId: string, fromId: string, toId: string): CodeResult {
  const it = model.items.find((x) => x.kind === 'note' && x.id === noteId);
  if (!it) return { code };
  const L = code.split('\n');
  const span = fromId === toId ? fromId : `${fromId},${toId}`;
  const cur = L[it.src] ?? '';
  const line = cur.replace(/^(\s*)([Nn]ote)\s+(?:left of|right of|over)\s+[^:]+:/, (_m, sp: string, kw: string) => `${sp}${kw} over ${span}:`);
  if (line === cur) return { code };
  L[it.src] = line;
  return { code: L.join('\n') };
}

/**
 * Swaps a participant with its left (-1) or right (+1) neighbour. Outside boxes, all free participants are
 * re-declared in the new order before the first message; inside a box the two declarations swap.
 */
export function swapParticipant(code: string, model: SequenceModel, id: string, dir: -1 | 1): SwapResult {
  const order = model.participants;
  const i = order.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0) return { code };
  const a = order[i]!, b = order[j];
  if (!b) return { code, reason: dir < 0 ? 'Already the first participant' : 'Already the last participant' };
  if ((a.box || null) !== (b.box || null)) return { code, reason: a.box ? 'Ungroup the box first to move it out' : 'The neighbour is in a box — ungroup it first' };
  const L = code.split('\n');
  if (a.box) {
    if (a.defLine == null || b.defLine == null) return { code };
    const la = L[a.defLine] ?? '', lb = L[b.defLine] ?? '';
    L[a.defLine] = lb;
    L[b.defLine] = la;
    return { code: L.join('\n'), other: b.id };
  }
  const free = order.filter((p) => !p.box);
  const fi = free.indexOf(a), fj = free.indexOf(b);
  const list = free.map((p) => declOf(p, L));
  [list[fi], list[fj]] = [list[fj]!, list[fi]!];
  const declared = free.map((p) => p.defLine).filter((x): x is number => x != null);
  const edits: LineEdit[] = declared.map((li) => ({ at: li, del: 1, ins: [] }));
  edits.push({ at: firstMention(model, code), del: 0, ins: list.map((x) => '  ' + x) });
  return { code: applyEdits(code, edits), other: b.id };
}

/** A message inserted after line `afterLine` (null = right after the participant declarations). */
export function addSeqMessageAt(code: string, model: SequenceModel, from: string, to: string, afterLine: number | null): LineResult {
  const L = code.split('\n');
  const at = afterLine == null ? lastDeclLine(model, code) + 1 : afterLine + 1;
  const ref = afterLine == null ? '' : indentOf(L[afterLine]);
  const indent = ref && afterLine != null && !BLOCK_HEAD.test(L[afterLine] ?? '') ? ref : ref ? ref + '  ' : '  ';
  L.splice(at, 0, `${indent}${from}->>${to}: message`);
  return { code: L.join('\n'), line: at };
}
