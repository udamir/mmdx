// Sequence editing ops as Mermaid source rewrites (prototype edit.js, sequence part): participants, boxes, notes,
// blocks (loop / alt / …), block resizing, processes (activations) and participant order.
//
// T11.3: a rename splices only the alias (`as …`, or `@{ "alias" }` when that is the form in use) and keeps `create`,
// `@{…}` and the id as written; a block's branches (`else`, `and`, `option`) are added, relabelled and deleted; a
// message's arrow is changed in place (`()` and `+` / `-` kept), the message reversed or one end re-attached; a note
// is put left of, right of or over its participant. Every rewrite reads its line through the parser's own scans
// (`lexMessage`, `lexDecl`).
//
// T10.2: a participant's type is written as Mermaid writes it — `actor` and `participant` as the keyword, the other six
// as `@{ "type": "…" }` (the block's other entries, the alias and `create` kept); a participant without a declaration
// gets one on the line it is first mentioned on, so the order Mermaid draws stays (`declare`, which renames use too).
import { maxOf, minOf } from '../geom.js';
import { activationsOf } from '../ids.js';
import type { BlockKind, Participant, SeqBlockStart, SeqItem, SeqMessage, SeqNote, SequenceModel } from '../model.js';
import { encodeLabel } from '../parse/label.js';
import { applySplices, editBlock, type Splice } from '../parse/node-data.js';
import { arrowKind, lexDecl, lexMessage, type ParticipantType } from '../parse/sequence.js';
import type { ItemRef } from '../types.js';
import { activationsBalanced } from './activations.js';
import { blocksOf } from './reorder.js';
import { uniqueId } from './ids.js';
import { applyEdits, indentOf, splice, type LineEdit } from './lines.js';
import type { ActivationResult, CodeResult, LineResult, LineSpan, RefusableResult, ResizeBlockResult, SelectResult, SwapResult } from './types.js';

export { activationsOf } from '../ids.js';
export { activationsBalanced } from './activations.js';

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

/** `@{ "type": … }` of a type the keyword cannot write ('' for `participant` and `actor`). */
const typeBlock = (type: ParticipantType | undefined): string => (type && type !== 'participant' && type !== 'actor' ? `@{ "type": "${type}" }` : '');

/**
 * A declaration for a participant that has none yet, on the line it is first mentioned on (indented as that line), so
 * the order Mermaid draws participants in (first mention) stays: the participants mentioned on that line before it
 * are declared there too, ahead of it. `decl` is its declaration without the indent.
 */
function declare(code: string, model: SequenceModel, p: Participant, decl: string): string {
  const L = code.split('\n');
  const first = (q: Participant): number => minOf([...q.lines]);
  const at = first(p);
  const before = model.participants.slice(0, model.participants.indexOf(p)).filter((q) => q.defLine == null && first(q) === at);
  const ind = indentOf(L[at]) || '  ';
  return splice(code, at, 0, [...before.map((q) => `${ind}${declWord(q)} ${q.id}`), `${ind}${decl}`]);
}

export interface AddParticipantOpts {
  kind?: 'participant' | 'actor';
  /** A Mermaid type the keyword cannot write (`database`, `queue`…): `@{ "type": … }`. */
  type?: ParticipantType;
  label?: string;
  /** Insert before this participant (else last). */
  beforeId?: string | null;
}

/**
 * Inserts a participant before `beforeId` (or last). All participants outside boxes are written as explicit
 * declarations in display order, so the visual order is exactly what the user dropped.
 */
export function addParticipant(code: string, model: SequenceModel, { kind = 'participant', type, label, beforeId = null }: AddParticipantOpts = {}): SelectResult & { select: ItemRef } {
  const id = uniqueId(model, kind === 'actor' ? 'Actor' : 'P');
  const L = code.split('\n');
  const mine = `${kind === 'actor' ? 'actor' : 'participant'} ${id}${typeBlock(type)}${label ? ` as ${seqText(label)}` : ''}`;
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
    const want = text && text !== p.id ? seqText(text) : '';
    if (p.defLine != null) {
      const line = renameDecl(L[p.defLine] ?? '', want);
      if (line !== null) return { code: splice(code, p.defLine, 1, [line]) };
      return { code: splice(code, p.defLine, 1, [`${indentOf(L[p.defLine])}${declWord(p)} ${p.id}${want ? ` as ${want}` : ''}`]) };
    }
    return want ? { code: declare(code, model, p, `${declWord(p)} ${p.id} as ${want}`) } : { code };
  }
  const it = model.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === sel.id);
  if (!it) return { code };
  const line = L[it.src] ?? '';
  const t = seqText(text);
  // `rect <colour>` has no label: its argument is the colour
  if (it.kind === 'blockStart' && it.block === 'rect') return { code };
  if (it.kind === 'blockStart') return { code: splice(code, it.src, 1, [line.replace(/^(\s*\w+)\b.*$/, (_m, head: string) => `${head} ${t}`)]) };
  return { code: splice(code, it.src, 1, [line.replace(/:(.*)$/, () => `: ${t}`)]) };
}

/**
 * A declaration line with a new alias (`want`, '' for none), spliced so that only the alias changes: the `as` alias
 * when one is written, else `@{ "alias" }` when that is the form in use, else a new ` as …` after the id (or its
 * `@{…}`). `create`, the id and the rest of `@{…}` stay as written. Null when the line is not a declaration.
 */
function renameDecl(line: string, want: string): string | null {
  const d = lexDecl(line);
  if (!d) return null;
  if (d.alias !== undefined && d.asAt !== undefined && d.aliasAt !== undefined) {
    const end = d.aliasAt + d.alias.length;
    return want ? line.slice(0, d.aliasAt) + want + line.slice(end) : line.slice(0, d.asAt) + line.slice(end);
  }
  const block = d.data;
  // `@{ alias }`: Mermaid's lexer ends the block at the first `}`, so a name with one goes to an `as` alias instead
  if (block?.entries.some((e) => e.key === 'alias') && !want.includes('}')) return applySplices(line, editBlock(line, block, { alias: want || undefined }));
  if (!want) return line;
  const at = d.dataEnd ?? d.idEnd;
  return `${line.slice(0, at)} as ${want}${line.slice(at)}`;
}

const DECL_WORD = /^(\s*(?:create\s+)?)(participant|actor)\b/i;

/**
 * A participant of Mermaid type `type`: `actor` / `participant` as the keyword (a `type` entry of its block goes, and a
 * block left empty with it), the other six as `@{ "type": … }` after the id (an entry the block has is rewritten,
 * keeping its quotes; the keyword becomes `participant`). Null when Mermaid 11.17 could not read it (it takes no
 * `@{…}` after an id with a hyphen or `=`): the editor keeps the shape in metadata then.
 */
export function setParticipantType(code: string, model: SequenceModel, id: string, type: ParticipantType): CodeResult | null {
  const p = model.participants.find((x) => x.id === id);
  if (!p) return null;
  const block = typeBlock(type);
  const word = type === 'actor' ? 'actor' : 'participant';
  if (p.defLine == null) {
    if (block && /[-=]/.test(p.id)) return null;
    return type === 'participant' ? { code } : { code: declare(code, model, p, `${word} ${p.id}${block}`) };
  }
  const L = code.split('\n');
  const line = L[p.defLine] ?? '';
  const d = lexDecl(line);
  const w = DECL_WORD.exec(line);
  if (!d || !w) return null;
  const out: Splice[] = [];
  const at = w[1]!.length;
  if (w[2]!.toLowerCase() !== word) out.push({ from: at, to: at + w[2]!.length, text: word });
  const data = d.data;
  const entry = data ? [...data.entries].reverse().find((e) => e.key === 'type') : undefined;
  if (!block) {
    // the keyword writes it: the block's type goes (the whole block when nothing else is in it)
    if (data && entry && d.dataAt !== undefined && d.dataEnd !== undefined && data.entries.every((e) => e.key === 'type')) out.push({ from: d.dataAt, to: d.dataEnd, text: '' });
    else if (data && entry) out.push(...editBlock(line, data, { type: undefined }));
  } else if (data && entry) {
    if (entry.value !== type) out.push(...editBlock(line, data, { type: line[entry.valueAt] === '"' ? `"${type}"` : type }, new Set(['type'])));
  } else if (data) {
    // a new entry, quoted as the block's first one is (`"alias": "…"` JSON, `alias: …` YAML)
    const q = data.entries[0] && line[data.entries[0].at] === '"' ? '"' : '';
    out.push(...editBlock(line, data, { [`${q}type${q}`]: `${q}${type}${q}` }, new Set([`${q}type${q}`])));
  } else {
    if (/[-=]/.test(d.id)) return null;
    out.push({ from: d.idEnd, to: d.idEnd, text: block });
  }
  if (!out.length) return { code };
  L[p.defLine] = applySplices(line, out);
  return { code: L.join('\n') };
}

/** `Note over <over>: note` after line `afterLine` (else at the end). */
export function addNote(code: string, _model: SequenceModel, { over, afterLine = null }: { over: string; afterLine?: number | null }): LineResult {
  const at = afterLine != null ? afterLine + 1 : code.trimEnd().split('\n').length;
  return { code: splice(code.trimEnd() + '\n', at, 0, [`  Note over ${over}: note`]), line: at };
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

/**
 * A message line as its head (through the arrow, read by the parser's scan), its `+` / `-` marker and the rest; the
 * spaces around the marker are dropped. A regex for this backtracked on long runs of spaces. A central connection
 * (`()`) takes no marker in Mermaid's grammar: null.
 */
function markerParts(line: string): { head: string; mark: string; rest: string } | null {
  const x = lexMessage(line);
  if (!x || x.fromCentral || x.toCentral) return null;
  const head = line.slice(0, x.arrowAt + x.arrow.length);
  return { head, mark: x.act, rest: line.slice(x.toAt) };
}
const setMarker = (line: string | undefined, mark: '' | '+' | '-'): string => {
  const p = markerParts(line ?? '');
  return p ? `${p.head}${mark}${p.rest}` : line ?? '';
};
const markerOf = (line: string | undefined): string => markerParts(line ?? '')?.mark ?? '';
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
  } else if (m1.to === P && m2.from === P && !m1.activate && !m1.deactivate && !m2.activate && !m2.deactivate && !m1.central && !m2.central) {
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
  const free = m.from !== m.to && !m.central && !markerOf(L[m.src]);
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

/**
 * `Note over A,B: text` spans every participant from A to B; a single id gives `Note over A: text`, or keeps `left of`
 * / `right of` when the note had that form and still covers one participant (T11, S11).
 */
export function setNoteSpan(code: string, model: SequenceModel, noteId: string, fromId: string, toId: string): CodeResult {
  const it = model.items.find((x): x is SeqNote => x.kind === 'note' && x.id === noteId);
  if (!it) return { code };
  const pos = fromId === toId && it.pos !== 'over' ? it.pos : 'over';
  return writeNote(code, it, pos, fromId === toId ? fromId : `${fromId},${toId}`);
}

/** A note left of, right of or over its participant (one target: the first of an `over A,B` note). */
export function setNotePlacement(code: string, model: SequenceModel, noteId: string, pos: SeqNote['pos']): CodeResult {
  const it = model.items.find((x): x is SeqNote => x.kind === 'note' && x.id === noteId);
  if (!it || it.pos === pos) return { code };
  return writeNote(code, it, pos, pos === 'over' ? it.targets.join(',') : it.targets[0] ?? '');
}

/** Rewrites a note's placement and targets; its keyword (`Note` / `note`) and text stay as written. */
function writeNote(code: string, it: SeqNote, pos: SeqNote['pos'], targets: string): CodeResult {
  const L = code.split('\n');
  const cur = L[it.src] ?? '';
  const line = cur.replace(/^(\s*)(note)\s+(?:left of|right of|over)\s+[^:]+:/i, (_m, sp: string, kw: string) => `${sp}${kw} ${pos} ${targets}:`);
  if (line === cur) return { code };
  L[it.src] = line;
  return { code: L.join('\n') };
}

// ---- block branches (`else` for alt, `and` for par, `option` for critical) -------------------------------------------

/** The divider word of a block's branches (undefined: the block has none). */
export const BRANCH_WORD: Readonly<Partial<Record<BlockKind, string>>> = { alt: 'else', par: 'and', critical: 'option' };
const BRANCH_LABEL: Readonly<Record<string, string>> = { else: 'otherwise', and: 'in parallel', option: 'on failure' };

const blockOf = (model: SequenceModel, id: string): SeqBlockStart | undefined => model.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.id === id);

/** The labels of a block's branches after its first (the `else` / `and` / `option` conditions), in order. */
export function branchLabels(model: SequenceModel, blockId: string): string[] {
  return model.items.filter((x) => x.kind === 'blockElse' && x.id === blockId).map((x) => (x.kind === 'blockElse' ? x.label : ''));
}

/** Adds a branch at the end of a block (`else` / `and` / `option` before its `end`); Mermaid reads an empty branch. */
export function addBranch(code: string, model: SequenceModel, blockId: string, label?: string): RefusableResult & { line?: number } {
  const b = blockOf(model, blockId);
  const word = b && BRANCH_WORD[b.block];
  if (!b || !word) return { code, reason: 'Only alt, par and critical blocks have branches' };
  const L = code.split('\n');
  const end = blockEnd(b);
  const ind = indentOf(L[b.src]);
  const t = seqText(label ?? BRANCH_LABEL[word] ?? 'condition');
  L.splice(end, 0, `${ind}${word} ${t}`);
  return { code: L.join('\n'), line: end };
}

/** New condition of branch `index` (0: the block's own label, 1…: its `else` / `and` / `option` lines). */
export function relabelBranch(code: string, model: SequenceModel, blockId: string, index: number, text: string): CodeResult {
  const b = blockOf(model, blockId);
  if (!b || b.block === 'rect') return { code };
  if (index === 0) return relabelSeq(code, model, { kind: 'block', id: blockId }, text);
  const li = b.lines[index];
  if (li === undefined || index >= b.lines.length - 1) return { code };
  const L = code.split('\n');
  return { code: splice(code, li, 1, [(L[li] ?? '').replace(/^(\s*\w+)\b.*$/, (_m, head: string) => `${head} ${seqText(text)}`)]) };
}

/** Deletes branch `index` (1…) of a block with its statements. Refused when that would unbalance the processes. */
export function removeBranch(code: string, model: SequenceModel, blockId: string, index: number): RefusableResult {
  const b = blockOf(model, blockId);
  if (!b || index < 1 || index >= b.lines.length - 1) return { code };
  const from = b.lines[index]!, to = b.lines[index + 1]!;
  const L = code.split('\n');
  L.splice(from, to - from);
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: 'That would leave a deactivation without its activation' };
  return { code: out };
}

// ---- message arrows, direction and ends ------------------------------------------------------------------------------

/** The arrows the editor offers, in two rows: solid, dotted (Mermaid's classic ten; half arrows are kept, not offered). */
export const MESSAGE_ARROWS: readonly (readonly string[])[] = [
  ['->>', '->', '-x', '-)', '<<->>'],
  ['-->>', '-->', '--x', '--)', '<<-->>'],
];

/** A message with another arrow: only the arrow token changes (`()`, `+` / `-` and the text stay). */
export function setMessageArrow(code: string, model: SequenceModel, msgId: string, arrow: string): CodeResult {
  const m = findMessage(model, msgId);
  if (!m || !arrowKind(arrow)) return { code };
  const L = code.split('\n');
  const line = L[m.src] ?? '';
  const x = lexMessage(line);
  if (!x || x.arrow === arrow) return { code };
  L[m.src] = line.slice(0, x.arrowAt) + arrow + line.slice(x.arrowAt + x.arrow.length);
  return { code: L.join('\n') };
}

/**
 * The message the other way round: its two ends trade places (a central connection's circle stays with its
 * participant; `+` / `-` stay with the arrow). Refused when the processes would no longer balance.
 */
export function reverseMessage(code: string, model: SequenceModel, msgId: string): RefusableResult {
  const m = findMessage(model, msgId);
  if (!m) return { code };
  if (m.from === m.to) return { code, reason: 'A message to itself has no direction to reverse' };
  const L = code.split('\n');
  const line = L[m.src] ?? '';
  const x = lexMessage(line);
  if (!x) return { code };
  const head = `${x.to}${x.toCentral ? '()' : ''}${x.arrow}${x.act}${x.fromCentral ? '()' : ''}${x.from}`;
  L[m.src] = line.slice(0, x.fromAt) + head + line.slice(x.toEnd);
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: UNBALANCED };
  return { code: out };
}

/** End `which` of a message re-attached to participant `target` (the same as the other end: a self message). */
export function reattachMessage(code: string, model: SequenceModel, msgId: string, which: 'from' | 'to', target: string): RefusableResult {
  const m = findMessage(model, msgId);
  if (!m || (which === 'from' ? m.from : m.to) === target) return { code };
  const L = code.split('\n');
  const line = L[m.src] ?? '';
  const x = lexMessage(line);
  if (!x) return { code };
  const [a, b] = which === 'from' ? [x.fromAt, x.fromEnd] : [x.toAt, x.toEnd];
  L[m.src] = line.slice(0, a) + target + line.slice(b);
  const out = L.join('\n');
  if (!activationsBalanced(out)) return { code, reason: UNBALANCED };
  return { code: out };
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

/** Sequence: `autonumber` numbers the messages — a line after the header. */
export function setAutonumber(code: string, on: boolean): CodeResult {
  const L = code.split('\n');
  const i = L.findIndex((l) => /^\s*autonumber\b/.test(l));
  if (!on && i >= 0) L.splice(i, 1);
  else if (on && i < 0) {
    const hd = L.findIndex((l) => /^\s*sequenceDiagram\b/.test(l));
    if (hd < 0) return { code };
    L.splice(hd + 1, 0, '  autonumber');
  } else return { code };
  return { code: L.join('\n') };
}
