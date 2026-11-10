// State diagram editing ops (T09.5) as Mermaid source rewrites. Every function takes (code, model, …) and returns the
// new code (+ what to select); the caller re-parses. Mermaid's rules shape where a statement goes:
// - a mention inside a composite moves the state there (the last composite that mentions a state holds it), and a
//   mention at the top level moves nothing, so a transition is written in the scope both ends share, else at the top;
// - `[*]` is the start or end of the scope it is written in, so a transition with a pseudo-state is written in that
//   pseudo-state's scope (a composite's start reaches only states in it; nothing transitions into a start or out of an
//   end);
// - a state's kind comes from its first mention: `state c <<choice>>` goes before the first line that mentions `c`;
// - `click` exists only at the top level (the composite's lexer state has no `click`).
// Texts keep the form in use (`state "Text" as id`, `id : text`); a state without one gets `state "Text" as id`.
import type { Direction, StateEdge, StateGroup, StateKind, StateModel, StateNode, StateNote } from '../model.js';
import { encodeLabel } from '../parse/label.js';
import { isPseudo, parseState, pseudoId } from '../parse/state.js';
import type { ItemRef } from '../types.js';
import { copyIds, uniqueId } from './ids.js';
import { applyEdits, contentEnd, indentOf, type LineEdit } from './lines.js';
import type { CloneInto, CloneResult, CodeResult, ConnectResult, RefusableResult, SelectResult } from './types.js';
import { minOf } from '../geom.js';

/** A scope: a composite (null: the top level) and a region of it. */
export interface StateScope {
  g: string | null;
  r: number;
}

const ROOT: StateScope = { g: null, r: 0 };
const same = (a: StateScope, b: StateScope): boolean => a.g === b.g && a.r === b.r;

// ---- text forms ---------------------------------------------------------------------------------------------------

/** Text inside `state "…" as id` and composite titles: quotes and line breaks encoded. */
export const quoted = (t: string): string => encodeLabel(t.trim());

/**
 * Text after a colon (`id : text`, `a --> b : text`): Mermaid ends it at `;`, `::` and a colon at its end, and at a
 * line break, so those are written as entity codes.
 */
export function colonText(t: string): string {
  return encodeLabel(t.trim())
    .replace(/;/g, '#59;')
    .replace(/#(?=(?:quot|\d{1,7});)/g, '#')
    .replace(/:(?=:|$)/g, '#58;')
    .replace(/#59#59;/g, '#59;');
}

/** One-line note text: Mermaid's `: text` form stops at `:` and `;`. */
const noteFits = (t: string): boolean => !/[:;\n]/.test(t) && t.trim() === t && t.length > 0;

// ---- scopes and lines ---------------------------------------------------------------------------------------------

/** The composite and region an item is drawn in. */
export function scopeOf(model: StateModel, id: string): StateScope {
  const n = model.nodes.get(id);
  if (n) return { g: n.parent, r: n.region };
  const g = model.groups.get(id);
  if (g) return { g: g.parent, r: g.region };
  // a pseudo-state not written yet (a new start or end): its scope from its id (`X/[*]end`, `X/2/[*]start`)
  if (isPseudo(id)) {
    const rest = id.slice(0, id.lastIndexOf('[*]')).replace(/\/$/, '');
    if (!rest) return ROOT;
    const m = /^(.*)\/(\d+)$/.exec(rest);
    return m && model.groups.has(m[1]!) ? { g: m[1]!, r: Number(m[2]) - 1 } : { g: rest, r: 0 };
  }
  return ROOT;
}

/** The indentation of the top-level statements. */
function rootIndent(model: StateModel, L: readonly string[]): string {
  for (let i = model.headerLine + 1; i < L.length; i++) {
    const t = L[i]!;
    if (t.trim() && !t.trim().startsWith('%%')) return indentOf(t) || '  ';
  }
  return '  ';
}

/** Where a new statement of a scope goes (before the `}` of the composite's last block, or before the next region's `--`), and its indentation. */
function scopeEnd(model: StateModel, L: readonly string[], s: StateScope): { at: number; indent: string } {
  const g = s.g ? model.groups.get(s.g) : undefined;
  if (!g) return { at: contentEnd(L), indent: rootIndent(model, L) };
  const blocks = g.blocks.filter((b) => b.dividers.length >= s.r);
  const b = blocks[blocks.length - 1] ?? g.blocks[g.blocks.length - 1]!;
  const indent = indentOf(L[b.line]) + '  ';
  if (s.r < b.dividers.length) return { at: b.dividers[s.r]!, indent };
  return { at: b.endLine ?? contentEnd(L), indent };
}

/** The written token of an id (`[*]` for a pseudo-state). */
const tok = (id: string): string => (isPseudo(id) ? '[*]' : id);

/** The composites holding an item, innermost first. */
function ancestors(model: StateModel, id: string): string[] {
  const out: string[] = [];
  for (let p = scopeOf(model, id).g; p && out.length <= model.groups.size; p = model.groups.get(p)?.parent ?? null) out.push(p);
  return out;
}

/** Every state and composite inside a composite (any depth). */
export function stateDescendants(model: StateModel, gid: string): { nodes: string[]; groups: string[] } {
  const nodes: string[] = [], groups: string[] = [];
  const seen = new Set<string>([gid]);
  const stack = [...(model.groups.get(gid)?.children ?? [])].reverse();
  while (stack.length) {
    const c = stack.pop()!;
    const g = model.groups.get(c);
    if (g) {
      if (seen.has(c)) continue;
      seen.add(c);
      groups.push(c);
      stack.push(...[...g.children].reverse());
    } else if (model.nodes.has(c)) nodes.push(c);
  }
  return { nodes, groups };
}

/** The lines of every block of a composite (headers to `}`). */
const blockLines = (g: StateGroup): number[] => g.blocks.flatMap((b) => Array.from({ length: (b.endLine ?? b.line) - b.line + 1 }, (_, i) => b.line + i));

// ---- adding -------------------------------------------------------------------------------------------------------

export interface AddStateOpts {
  kind?: StateKind;
  /** The composite (and region) the state goes into. */
  scope?: StateScope;
  /** A title (`state "Title" as s3`); absent: the id alone. */
  label?: string;
}

/** A new state `s<k>` (a bare id line), or `state c<k> <<choice>>` / `<<fork>>` / `<<join>>`, at the end of its scope. */
export function addState(code: string, model: StateModel, { kind = 'state', scope = ROOT, label }: AddStateOpts = {}): SelectResult & { select: ItemRef } {
  const base = kind === 'choice' ? 'choice' : kind === 'fork' ? 'fork' : kind === 'join' ? 'join' : 's';
  const id = uniqueId(model, base);
  const L = code.split('\n');
  const { at, indent } = scopeEnd(model, L, scope);
  const line = kind === 'choice' || kind === 'fork' || kind === 'join' ? `state ${id} <<${kind}>>` : label && label !== id ? `state "${quoted(label)}" as ${id}` : id;
  return { code: applyEdits(code, [{ at, del: 0, ins: [indent + line] }]), select: { kind: 'node', id } };
}

/**
 * A start pseudo-state in a scope: `[*] --> <state>` when a state is given, else a lone `[*]` (Mermaid's start
 * without a transition; the first connection from it replaces it). Refused when the scope has a start already.
 */
export function addStart(code: string, model: StateModel, scope: StateScope, to: string | null): SelectResult & RefusableResult {
  const id = pseudoId(scope.g, scope.r, false);
  if (model.nodes.has(id)) return { code, reason: 'This scope has a start already', select: { kind: 'node', id } };
  if (to) {
    const r = connectState(code, model, id, to);
    return r.reason ? r : { ...r, select: { kind: 'node', id } };
  }
  const L = code.split('\n');
  const { at, indent } = scopeEnd(model, L, scope);
  return { code: applyEdits(code, [{ at, del: 0, ins: [`${indent}[*]`] }]), select: { kind: 'node', id } };
}

/** An end pseudo-state: `<state> --> [*]` (Mermaid has no end without a transition into it). */
export function addEnd(code: string, model: StateModel, from: string | null): SelectResult & RefusableResult {
  if (!from) return { code, reason: 'An end needs a state before it: drop it next to a state' };
  const s = scopeOf(model, from);
  const r = connectState(code, model, from, pseudoId(s.g, s.r, true));
  return r.reason ? r : { ...r, select: { kind: 'node', id: pseudoId(s.g, s.r, true) } };
}

/** A note beside a state: `note right of X : Note`, in the state's scope. */
export function addNote(code: string, model: StateModel, target: string, side: 'left' | 'right', text = 'Note'): CodeResult & { line: number } {
  const L = code.split('\n');
  const { at, indent } = scopeEnd(model, L, scopeOf(model, target));
  return { code: applyEdits(code, [{ at, del: 0, ins: [...noteLines(indent, target, side, text)] }]), line: at };
}

function noteLines(indent: string, target: string, side: 'left' | 'right', text: string): string[] {
  const head = `${indent}note ${side} of ${tok(target)}`;
  if (noteFits(text)) return [`${head} : ${text}`];
  return [head, ...text.split('\n').map((l) => `${indent}  ${l.replace(/^\s*end note\b/i, '#101;nd note')}`), `${indent}end note`];
}

// ---- transitions --------------------------------------------------------------------------------------------------

/** Where a transition between two items is written (null: it cannot be, with the reason). */
export function transitionScope(model: StateModel, from: string, to: string): StateScope | string {
  const a = model.nodes.get(from), b = model.nodes.get(to);
  if (a?.kind === 'end') return 'An end has no outgoing transitions';
  if (b?.kind === 'start') return 'A start has no incoming transitions';
  const sa = scopeOf(model, from), sb = scopeOf(model, to);
  if (same(sa, sb)) return sa;
  if (isPseudo(from) && sa.g !== null) return 'A composite\'s start connects only to states inside that composite';
  if (isPseudo(to) && sb.g !== null) return 'A composite\'s end is reached only from states inside that composite';
  return ROOT;
}

/** `from --> to` (with a label) in the scope `transitionScope` gives; a lone `[*]` start it replaces is removed. */
export function connectState(code: string, model: StateModel, from: string, to: string, label = ''): ConnectResult & RefusableResult {
  const s = transitionScope(model, from, to);
  if (typeof s === 'string') return { code, reason: s };
  const L = code.split('\n');
  const { at, indent } = scopeEnd(model, L, s);
  const edits: LineEdit[] = [{ at, del: 0, ins: [`${indent}${tok(from)} --> ${tok(to)}${label ? ` : ${colonText(label)}` : ''}`] }];
  // a start written as a lone `[*]` (the palette's) is replaced by its first transition
  const start = model.nodes.get(from);
  if (start?.kind === 'start') for (const li of start.lines) if (L[li]?.trim() === '[*]') edits.push({ at: li, del: 1, ins: [] });
  const out = applyEdits(code, edits);
  const removedBefore = edits.filter((e) => e.del && e.at < at).length;
  return { code: out, from, to, line: at - removedBefore };
}

/** Re-attaches end `which` of a transition to another item: in place when its scope can hold the new end, else moved. */
export function reconnectState(code: string, model: StateModel, edgeId: string, which: 'a' | 'b', target: string): ConnectResult & RefusableResult {
  const e = model.edges.find((x) => x.id === edgeId);
  if (!e) return { code };
  const from = which === 'a' ? target : e.from, to = which === 'b' ? target : e.to;
  const s = transitionScope(model, from, to);
  if (typeof s === 'string') return { code, reason: s };
  if (same(s, { g: e.scope, r: e.region }) || (s.g === null && e.scope === null)) {
    const at = which === 'a' ? e.fromAt : e.toAt;
    // keep a `:::class` written with the end
    const written = code.slice(at[0], at[1]);
    const cls = written.indexOf(':::');
    const t = tok(target) + (cls >= 0 ? written.slice(cls) : '');
    const out = code.slice(0, at[0]) + t + code.slice(at[1]);
    return { code: out, from, to, line: e.src };
  }
  const del = removeEdgeLine(code, model, e);
  const r = connectState(del, parseState(del), from, to, e.label);
  return r;
}

/** The code without a transition's line (states only it mentioned stay, as a bare id in its place). */
function removeEdgeLine(code: string, model: StateModel, e: StateEdge): string {
  return applyEdits(code, deleteLines(code, model, new Set([e.src]), new Set()));
}

// ---- text ---------------------------------------------------------------------------------------------------------

/** Rewrites a state's title, keeping the form in use; a state without one gets `state "Title" as id` before its first mention. */
export function relabelState(code: string, model: StateModel, id: string, label: string): CodeResult {
  const n = model.nodes.get(id);
  const g = model.groups.get(id);
  const item = n ?? g;
  if (!item || (n && n.kind !== 'state')) return { code };
  const v = label.trim();
  const t = item.texts[0];
  if (t) {
    const enc = t.form === 'as' ? quoted(v || id) : colonText(v || id);
    return { code: code.slice(0, t.start) + enc + code.slice(t.end) };
  }
  if (!v || v === id) return { code };
  const L = code.split('\n');
  if (g) {
    // `state X {` → `state "Title" as X {`
    const b = g.blocks[0]!;
    const re = new RegExp(`^(\\s*state\\s+)${escape(id)}(\\s*\\{)`, 'i');
    const line = L[b.line] ?? '';
    if (!re.test(line)) return { code };
    L[b.line] = line.replace(re, `$1"${quoted(v)}" as ${id}$2`);
    return { code: L.join('\n') };
  }
  const first = minOf(n!.lines);
  return { code: applyEdits(code, [{ at: first, del: 0, ins: [`${indentOf(L[first])}state "${quoted(v)}" as ${id}`] }]) };
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sets a state's description rows (the texts after its title) as `id : row` lines after the title's statement; a
 * state without a title gets one first (its id), since the first text is the title.
 */
export function setDescriptions(code: string, model: StateModel, id: string, rows: readonly string[]): CodeResult {
  const n = model.nodes.get(id);
  if (!n || n.kind !== 'state') return { code };
  const clean = rows.map((r) => r.trim()).filter(Boolean);
  const L = code.split('\n');
  const edits: LineEdit[] = [];
  const old = n.texts.slice(1);
  // rows written as their own `id : row` lines go; a row in `state "x" as id:row` stays (rare)
  const gone = new Set(old.filter((t) => t.form === 'colon' && isDescLine(L[t.line] ?? '', id)).map((t) => t.line));
  for (const li of gone) edits.push({ at: li, del: 1, ins: [] });
  let at: number, indent: string;
  const title = n.texts[0];
  if (title) {
    const lastKept = Math.max(title.line, ...old.filter((t) => !gone.has(t.line)).map((t) => t.line));
    at = lastKept + 1;
    indent = indentOf(L[title.line]);
  } else {
    const first = minOf(n.lines);
    at = first;
    indent = indentOf(L[first]);
  }
  // one edit (the title first): two inserts at one line would land in reverse order
  if (clean.length) edits.push({ at, del: 0, ins: [...(title ? [] : [`${indent}state "${quoted(n.label || id)}" as ${id}`]), ...clean.map((r) => `${indent}${id} : ${colonText(r)}`)] });
  return { code: applyEdits(code, edits) };
}

const isDescLine = (line: string, id: string): boolean => new RegExp(`^\\s*${escape(id)}(?::::\\S+)?\\s*:(?!::)`).test(line);

/** Rewrites a transition's label (`a --> b : label`), adding or removing it. */
export function relabelTransition(code: string, model: StateModel, edgeId: string, label: string): CodeResult {
  const e = model.edges.find((x) => x.id === edgeId);
  if (!e) return { code };
  const v = label.trim();
  if (e.labelAt) {
    // the spaces before the colon go too (` : label` is written with its own)
    let s = e.labelAt[0];
    while (s > e.toAt[1] && (code[s - 1] === ' ' || code[s - 1] === '\t')) s--;
    return { code: code.slice(0, s) + (v ? ` : ${colonText(v)}` : '') + code.slice(e.labelAt[1]) };
  }
  if (!v) return { code };
  return { code: code.slice(0, e.toAt[1]) + ` : ${colonText(v)}` + code.slice(e.toAt[1]) };
}

/** Rewrites a note's text (one line `: text`, or lines up to `end note` when it needs them). */
export function relabelNote(code: string, model: StateModel, noteId: string, text: string): CodeResult {
  const n = model.notes.find((x) => x.id === noteId);
  if (!n) return { code };
  const L = code.split('\n');
  const indent = indentOf(L[n.line]);
  return { code: applyEdits(code, [{ at: n.line, del: n.endLine - n.line + 1, ins: noteLines(indent, n.target, n.side, text.trim() || 'Note') }]) };
}

/** Moves a note to the other side of its state. */
export function setNoteSide(code: string, model: StateModel, noteId: string, side: 'left' | 'right'): CodeResult {
  const n = model.notes.find((x) => x.id === noteId);
  if (!n || n.side === side) return { code };
  const L = code.split('\n');
  L[n.line] = (L[n.line] ?? '').replace(/\b(left|right)(\s+of\b)/i, `${side}$2`);
  return { code: L.join('\n') };
}

// ---- kind, direction, regions, links ------------------------------------------------------------------------------

/**
 * Makes a state a plain state, a choice, a fork or a join: its `state id <<kind>>` line is rewritten or removed, and
 * a new one goes before the state's first mention (Mermaid takes the kind of the first mention).
 */
export function setStateKind(code: string, model: StateModel, id: string, kind: StateKind): CodeResult {
  const n = model.nodes.get(id);
  if (!n || n.kind === 'start' || n.kind === 'end' || kind === 'start' || kind === 'end') return { code };
  const L = code.split('\n');
  const decl = new RegExp(`^\\s*state\\s+${escape(id)}\\s*(?:<<(?:choice|fork|join)>>|\\[\\[(?:choice|fork|join)\\]\\])\\s*$`, 'i');
  const decls = [...n.lines].filter((li) => decl.test(L[li] ?? ''));
  const edits: LineEdit[] = decls.map((li) => ({ at: li, del: 1, ins: [] }));
  const rest = [...n.lines].filter((li) => !decls.includes(li));
  if (kind !== 'state') {
    const first = rest.length ? minOf(rest) : decls[0] ?? contentEnd(L);
    edits.push({ at: first, del: 0, ins: [`${indentOf(L[first] ?? L[decls[0] ?? 0])}state ${id} <<${kind}>>`] });
  } else if (!rest.length) {
    // a choice known only by its declaration stays as a plain state
    edits.push({ at: decls[0]!, del: 0, ins: [`${indentOf(L[decls[0]!])}${id}`] });
  }
  return { code: applyEdits(code, edits) };
}

/** The top-level direction: the last `direction` line rewritten, else a new one after the header. */
export function setStateDirection(code: string, model: StateModel, dir: Direction): CodeResult {
  const L = code.split('\n');
  if (model.dirLine !== undefined) {
    L[model.dirLine] = (L[model.dirLine] ?? '').replace(/direction\s+\w+/i, `direction ${dir}`);
    return { code: L.join('\n') };
  }
  if (model.headerLine < 0) return { code };
  return { code: applyEdits(code, [{ at: model.headerLine + 1, del: 0, ins: [`${rootIndent(model, L)}direction ${dir}`] }]) };
}

/** A composite's direction: its `direction` line rewritten, else a new one as the block's first line (null: Mermaid's TB, the line removed). */
export function setCompositeDirection(code: string, model: StateModel, gid: string, dir: Direction | null): CodeResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const L = code.split('\n');
  const edits: LineEdit[] = [];
  let found = false;
  for (const b of g.blocks)
    for (let li = b.line + 1; li < (b.endLine ?? b.line); li++)
      if (/^\s*direction\s+(?:TB|BT|LR|RL)\b/i.test(L[li] ?? '') && depthAt(L, b.line, li) === 1) {
        found = true;
        edits.push(dir ? { at: li, del: 1, ins: [`${indentOf(L[li])}direction ${dir}`] } : { at: li, del: 1, ins: [] });
      }
  if (!found && dir) edits.push({ at: g.blocks[0]!.line + 1, del: 0, ins: [`${indentOf(L[g.blocks[0]!.line])}  direction ${dir}`] });
  return { code: applyEdits(code, edits) };
}

/** How many blocks are open at line `li`, counting from the block that opens on `from` (1: directly inside it). */
function depthAt(L: readonly string[], from: number, li: number): number {
  let d = 0;
  for (let i = from; i < li; i++) {
    const t = L[i] ?? '';
    if (/\{\s*$/.test(t)) d++;
    if (/^\s*\}\s*$/.test(t)) d--;
  }
  return d;
}

/** A new concurrency region at the end of a composite: `--` and a new state in it (Mermaid needs one after the last `--`). */
export function addRegion(code: string, model: StateModel, gid: string): SelectResult {
  const g = model.groups.get(gid);
  const b = g?.blocks[g.blocks.length - 1];
  if (!g || !b || b.endLine === undefined) return { code };
  const L = code.split('\n');
  const indent = indentOf(L[b.line]) + '  ';
  const id = uniqueId(model, 's');
  return { code: applyEdits(code, [{ at: b.endLine, del: 0, ins: [`${indent}--`, `${indent}${id}`] }]), select: { kind: 'node', id } };
}

/** `click id href "url"` (at the top level, where Mermaid reads `click`), replacing the item's links; null removes it. */
export function setStateLink(code: string, model: StateModel, id: string, url: string | null): CodeResult {
  // `click [*]` reads as a link of no state
  if (isPseudo(id)) return { code };
  const L = code.split('\n');
  const re = new RegExp(`^\\s*click\\s+${escape(id)}\\s`, 'i');
  const edits: LineEdit[] = [];
  L.forEach((l, i) => {
    if (re.test(l)) edits.push({ at: i, del: 1, ins: [] });
  });
  if (url) edits.push({ at: contentEnd(L), del: 0, ins: [`${rootIndent(model, L)}click ${id} href "${url.replace(/"/g, '%22')}"`] });
  return { code: applyEdits(code, edits) };
}

// ---- deleting -----------------------------------------------------------------------------------------------------

/**
 * Line edits that delete whole lines; a state mentioned only on those lines (the other end of a deleted transition)
 * keeps a bare id line in the first one's place, so deleting a transition never deletes a state. `gone`: items that
 * are deleted too (no line kept for them).
 */
function deleteLines(code: string, model: StateModel, lines: ReadonlySet<number>, gone: ReadonlySet<string>): LineEdit[] {
  const L = code.split('\n');
  const keep = new Map<number, string[]>();
  for (const n of model.nodes.values()) {
    if (gone.has(n.id) || isPseudo(n.id) || ![...n.lines].length || ![...n.lines].every((li) => lines.has(li))) continue;
    const li = minOf(n.lines);
    (keep.get(li) ?? keep.set(li, []).get(li)!).push(indentOf(L[li]) + n.id);
  }
  return [...lines].map((li) => ({ at: li, del: 1, ins: keep.get(li) ?? [] }));
}

/** `class a,b c` / `style a,b …` lines: the ids removed from their lists (the line goes with the last one). */
function listEdits(code: string, ids: ReadonlySet<string>): { edits: LineEdit[]; lines: Set<number> } {
  const L = code.split('\n');
  const edits: LineEdit[] = [], lines = new Set<number>();
  L.forEach((l, i) => {
    // the list as Mermaid's lexer reads it (`a,b`, `a, b`), then the class or the styles
    const m = /^(\s*(?:class|style)\s+)(\w+(?:\s*,\s*\w+)*)(\s+\S.*)$/i.exec(l);
    if (!m) return;
    const list = m[2]!.split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.some((x) => ids.has(x))) return;
    lines.add(i);
    const rest = list.filter((x) => !ids.has(x));
    edits.push({ at: i, del: 1, ins: rest.length ? [`${m[1]}${rest.join(',')}${m[3]}`] : [] });
  });
  return { edits, lines };
}

/**
 * Deletes items: a state with its texts, transitions, notes, link and style lines; a composite with its blocks and
 * everything inside them (or, `keep`, without its blocks: the contents stay, its inner starts and ends go); a
 * transition's line; a note's lines.
 */
export function deleteState(code: string, model: StateModel, items: readonly ItemRef[], keep = false): RefusableResult {
  const ids = new Set<string>();
  const lines = new Set<number>();
  let out = code;
  const L = code.split('\n');
  const groupsKept: string[] = [];
  for (const it of items) {
    if (it.kind === 'node' && model.nodes.has(it.id)) ids.add(it.id);
    else if (it.kind === 'group' && model.groups.has(it.id)) {
      ids.add(it.id);
      if (keep) groupsKept.push(it.id);
      else {
        const d = stateDescendants(model, it.id);
        d.nodes.forEach((x) => ids.add(x));
        d.groups.forEach((x) => ids.add(x));
        for (const li of blockLines(model.groups.get(it.id)!)) lines.add(li);
      }
    } else if (it.kind === 'edge') {
      const e = model.edges.find((x) => x.id === it.id);
      if (e) lines.add(e.src);
    } else if (it.kind === 'note') {
      const n = model.notes.find((x) => x.id === it.id);
      if (n) for (let li = n.line; li <= n.endLine; li++) lines.add(li);
    }
  }
  // a kept composite: unwrapped first (its inner `[*]` transitions removed), then deleted as a state
  if (groupsKept.length) {
    for (const gid of groupsKept) out = ungroupState(out, parseState(out), gid, false).code;
    const M = parseState(out);
    const rest = items.filter((it) => !(it.kind === 'group' && groupsKept.includes(it.id))).map(remapNote(model, M));
    return deleteState(out, M, [...rest, ...groupsKept.filter((g) => M.nodes.has(g)).map((id) => ({ kind: 'node' as const, id }))]);
  }
  const textLines = (x: StateNode | StateGroup): number[] => x.texts.map((t) => t.line);
  for (const id of ids) {
    const n = model.nodes.get(id), g = model.groups.get(id);
    const x = n ?? g;
    if (!x) continue;
    for (const li of textLines(x)) lines.add(li);
    for (const e of model.edges) if (e.from === id || e.to === id) lines.add(e.src);
    for (const note of model.notes) if (note.target === id) for (let li = note.line; li <= note.endLine; li++) lines.add(li);
    if (n) {
      for (const li of n.lines) {
        const t = L[li] ?? '';
        // its own statements: a bare id, a declaration, a link
        if (new RegExp(`^\\s*(?:state\\s+)?${escape(id)}(?::::\\S+)?\\s*(?:<<\\w+>>|\\[\\[\\w+\\]\\])?\\s*$`).test(t) || /^\s*\[\*\]\s*$/.test(t) || new RegExp(`^\\s*click\\s+${escape(id)}\\s`, 'i').test(t)) lines.add(li);
      }
    }
    // its `click` lines (a state's are not among the lines that mention it)
    for (const li of L.keys()) if (new RegExp(`^\\s*click\\s+${escape(id)}\\s`, 'i').test(L[li] ?? '')) lines.add(li);
  }
  const lists = listEdits(code, ids);
  for (const li of lists.lines) lines.delete(li);
  // block lines inside a deleted composite are covered by its block; the lines of list edits are rewritten instead
  const edits = [...deleteLines(code, model, lines, ids), ...lists.edits];
  if (!edits.length) return { code };
  return { code: applyEdits(code, edits) };
}

/** A note reference from one model to the next (notes are numbered: the same target and side, then order). */
const remapNote = (a: StateModel, b: StateModel) => (it: ItemRef): ItemRef => {
  if (it.kind !== 'note') return it;
  const n = a.notes.find((x) => x.id === it.id);
  if (!n) return it;
  const k = a.notes.filter((x) => x.target === n.target && x.side === n.side).indexOf(n);
  const m = b.notes.filter((x) => x.target === n.target && x.side === n.side)[k];
  return m ? { kind: 'note', id: m.id } : it;
};

// ---- composites ---------------------------------------------------------------------------------------------------

/** Can the items become a composite? They must share a scope; pseudo-states need theirs. */
export function canMakeComposite(model: StateModel, items: readonly ItemRef[]): string | null {
  const refs = items.filter((x) => x.kind === 'node' || x.kind === 'group');
  if (!refs.length) return 'Select states to make a composite';
  const s = scopeOf(model, refs[0]!.id);
  if (!refs.every((x) => same(scopeOf(model, x.id), s))) return 'Select states of one composite (or of the top level)';
  return null;
}

/**
 * Makes a composite of states (⌘G): `state Group1 {` … `}` wraps the statements of the selected states (their texts,
 * declarations, notes, lone ids) and the transitions with both ends among them; the rest stays where it is.
 */
export function makeComposite(code: string, model: StateModel, items: readonly ItemRef[], title = 'Group'): SelectResult & RefusableResult {
  const why = canMakeComposite(model, items);
  if (why) return { code, reason: why };
  const refs = items.filter((x) => x.kind === 'node' || x.kind === 'group');
  const s = scopeOf(model, refs[0]!.id);
  const inside = new Set<string>();
  for (const r of refs) {
    inside.add(r.id);
    if (r.kind === 'group') {
      const d = stateDescendants(model, r.id);
      d.nodes.forEach((x) => inside.add(x));
      d.groups.forEach((x) => inside.add(x));
    }
  }
  const L = code.split('\n');
  const range = s.g ? scopeRange(model, s) : null;
  const inScope = (li: number): boolean => (range ? li > range.start && li < range.end : !insideAnyBlock(model, li));
  const moved = new Set<number>();
  for (const r of refs) {
    const g = model.groups.get(r.id);
    if (g) for (const li of blockLines(g)) if (inScope(g.blocks[0]!.line)) moved.add(li);
    const n = model.nodes.get(r.id);
    const x = n ?? g!;
    for (const t of x.texts) if (inScope(t.line)) moved.add(t.line);
    if (n)
      for (const li of n.lines) {
        const t = L[li] ?? '';
        if (inScope(li) && (new RegExp(`^\\s*(?:state\\s+)?${escape(r.id)}(?::::\\S+)?\\s*(?:<<\\w+>>|\\[\\[\\w+\\]\\])?\\s*$`).test(t) || /^\s*\[\*\]\s*$/.test(t))) moved.add(li);
      }
  }
  for (const e of model.edges) if (inside.has(e.from) && inside.has(e.to) && inScope(e.src)) moved.add(e.src);
  for (const n of model.notes) if (inside.has(n.target) && inScope(n.line)) for (let li = n.line; li <= n.endLine; li++) moved.add(li);
  if (!moved.size) return { code, reason: 'Nothing to group' };
  const sorted = [...moved].sort((a, b) => a - b);
  // the block goes where the first moved line was; inside a composite after its last mention of these states, so a
  // later mention there does not take them back out
  let at = sorted[0]!;
  if (range)
    for (let li = range.start + 1; li < range.end; li++)
      if (!moved.has(li) && [...inside].some((id) => mentions(L[li] ?? '', id))) at = Math.max(at, li + 1);
  const id = uniqueId(model, 'Group');
  const indent = s.g ? scopeEnd(model, L, s).indent : rootIndent(model, L);
  const minInd = minOf(sorted.map((li) => indentOf(L[li]).length));
  const body = sorted.map((li) => `${indent}  ${(L[li] ?? '').slice(minInd)}`);
  const head = title && title !== id && title !== 'Group' ? `${indent}state "${quoted(title)}" as ${id} {` : `${indent}state ${id} {`;
  const block = [head, ...body, `${indent}}`];
  const edits: LineEdit[] = sorted.map((li) => ({ at: li, del: 1, ins: [] }));
  edits.push({ at, del: 0, ins: block });
  return { code: applyEdits(code, edits), select: { kind: 'group', id } };
}

const mentions = (line: string, id: string): boolean => new RegExp(`(^|[\\s>:,])${escape(id)}($|[\\s:,]|-->)`).test(line);

/** The lines of a scope: inside the composite's first block (region ignored). */
function scopeRange(model: StateModel, s: StateScope): { start: number; end: number } | null {
  const g = s.g ? model.groups.get(s.g) : undefined;
  const b = g?.blocks.find((x) => x.endLine !== undefined);
  return b ? { start: b.line, end: b.endLine! } : null;
}

const insideAnyBlock = (model: StateModel, li: number): boolean => [...model.groups.values()].some((g) => g.blocks.some((b) => li > b.line && li < (b.endLine ?? Infinity)));

/**
 * Unwraps a composite: its block lines go (`state X {`, `}`, `--`, its `direction`), the contents move out one level.
 * Its inner starts and ends are rewired (`rewire`): a transition into the composite goes to each state its start
 * led to, one out of it leaves from each state that led to its end; without `rewire`, or when nothing reaches the
 * composite, they are removed. Transitions to and from the composite itself go.
 */
export function ungroupState(code: string, model: StateModel, gid: string, rewire = true): CodeResult & { members: string[] } {
  const g = model.groups.get(gid);
  if (!g) return { code, members: [] };
  const L = code.split('\n');
  const edits: LineEdit[] = [];
  const removed = new Set<number>();
  const own = (li: number): boolean => g.blocks.some((b) => li > b.line && li < (b.endLine ?? b.line) && depthAt(L, b.line, li) === 1);
  for (const b of g.blocks) {
    removed.add(b.line);
    if (b.endLine !== undefined) removed.add(b.endLine);
    for (const d of b.dividers) removed.add(d);
    for (let li = b.line + 1; li < (b.endLine ?? b.line); li++) if (own(li) && /^\s*direction\s+(?:TB|BT|LR|RL)\b/i.test(L[li] ?? '')) removed.add(li);
  }
  // the composite's own pseudo-states and the transitions with them or with the composite
  const isInner = (id: string): boolean => isPseudo(id) && id.startsWith(`${gid}/`) && id.split('/').length <= 3;
  const into = model.edges.filter((e) => e.to === gid && e.from !== gid), outOf = model.edges.filter((e) => e.from === gid && e.to !== gid);
  const starts = model.edges.filter((e) => isInner(e.from) && model.nodes.get(e.from)?.kind === 'start');
  const ends = model.edges.filter((e) => isInner(e.to) && model.nodes.get(e.to)?.kind === 'end');
  for (const e of [...into, ...outOf, ...starts, ...ends]) removed.add(e.src);
  for (const e of model.edges) if (e.from === gid && e.to === gid) removed.add(e.src);
  for (const n of model.notes) if (n.target === gid || isInner(n.target)) for (let li = n.line; li <= n.endLine; li++) removed.add(li);
  for (const t of g.texts) removed.add(t.line);
  for (const [li, l] of L.entries()) if (new RegExp(`^\\s*click\\s+${escape(gid)}\\s`, 'i').test(l) || (own(li) && /^\s*\[\*\]\s*$/.test(l))) removed.add(li);
  const added: string[] = [];
  if (rewire) {
    for (const a of into) for (const s of starts) if (!isPseudo(s.to)) added.push(`${tok(a.from)} --> ${s.to}${a.label ? ` : ${colonText(a.label)}` : ''}`);
    for (const b of outOf) for (const e of ends) if (!isPseudo(e.from)) added.push(`${e.from} --> ${tok(b.to)}${b.label ? ` : ${colonText(b.label)}` : ''}`);
  }
  for (const li of removed) edits.push({ at: li, del: 1, ins: [] });
  // the contents one level out
  for (const b of g.blocks)
    for (let li = b.line + 1; li < (b.endLine ?? b.line); li++) if (!removed.has(li)) edits.push({ at: li, del: 1, ins: [(L[li] ?? '').replace(/^ {2}|^\t/, '')] });
  // rewired transitions in the composite's scope (the top level when the ends cannot be there)
  if (added.length) {
    const s = { g: g.parent, r: g.region };
    const { at, indent } = scopeEnd(model, L, s);
    edits.push({ at: Math.min(at, L.length), del: 0, ins: added.map((x) => indent + x) });
  }
  return { code: applyEdits(code, edits), members: [...g.children].filter((c) => !isInner(c)) };
}

/** Inner starts and ends of a composite, whose transitions an ungroup rewires or removes. */
export const innerPseudo = (model: StateModel, gid: string): number =>
  [...model.nodes.values()].filter((n) => isPseudo(n.id) && n.id.startsWith(`${gid}/`) && n.id.split('/').length <= 3).length;

// ---- copies -------------------------------------------------------------------------------------------------------

/**
 * The Mermaid statements of items (and what is inside the composites among them), ids mapped through `map`: states
 * with their kinds and texts, composites as blocks with their regions, the transitions between them (a pseudo-state
 * of a copied composite inside its block, one of the top level as the copies' own), and their notes.
 */
export function stateStatements(model: StateModel, items: readonly ItemRef[], map: Readonly<Record<string, string>>, indent = '  '): string[] {
  const set = new Set<string>();
  for (const it of items)
    if (it.kind === 'node' || it.kind === 'group') {
      set.add(it.id);
      if (it.kind === 'group') {
        const d = stateDescendants(model, it.id);
        d.nodes.forEach((x) => set.add(x));
        d.groups.forEach((x) => set.add(x));
      }
    }
  const id = (x: string): string => (isPseudo(x) ? '[*]' : map[x] ?? x);
  // a pseudo-state goes with its scope: copied when its composite is, or the copies' own at the top level
  const pseudoOk = (x: string): boolean => {
    const s = scopeOf(model, x);
    return s.g === null || set.has(s.g);
  };
  const inSet = (x: string): boolean => set.has(x) || (isPseudo(x) && (pseudoOk(x) || set.has(x)));
  const edges = model.edges.filter((e) => inSet(e.from) && inSet(e.to) && (set.has(e.from) || set.has(e.to)));
  const tops = [...set].filter((x) => !isPseudo(x) && !set.has(scopeOf(model, x).g ?? '\u0000'));
  const scopeKey = (s: StateScope): string => `${s.g ?? ''}\u0000${s.r}`;
  /** Where an edge is written in the copy: its pseudo-state's scope, else the scope both ends share, else the top. */
  const edgeScope = (e: StateEdge): string => {
    const p = isPseudo(e.from) ? e.from : isPseudo(e.to) ? e.to : null;
    if (p) {
      const s = scopeOf(model, p);
      return s.g && set.has(s.g) ? scopeKey(s) : '';
    }
    const a = scopeOf(model, e.from), b = scopeOf(model, e.to);
    return same(a, b) && a.g && set.has(a.g) ? scopeKey(a) : '';
  };
  const out: string[] = [];
  const emitState = (n: StateNode, ind: string): void => {
    if (isPseudo(n.id)) return;
    const nid = id(n.id);
    if (n.kind === 'choice' || n.kind === 'fork' || n.kind === 'join') out.push(`${ind}state ${nid} <<${n.kind}>>`);
    else if (n.texts[0]) out.push(`${ind}state "${quoted(n.label)}" as ${nid}`);
    else if (!edges.some((e) => e.from === n.id || e.to === n.id)) out.push(`${ind}${nid}`);
    for (const r of n.descriptions) out.push(`${ind}${nid} : ${colonText(r)}`);
  };
  const emitNotes = (x: string, ind: string): void => {
    for (const note of model.notes) if (note.target === x) out.push(...noteLines(ind, id(x), note.side, note.text));
  };
  const emitEdges = (key: string, ind: string): void => {
    for (const e of edges) if (edgeScope(e) === key) out.push(`${ind}${id(e.from)} --> ${id(e.to)}${e.label ? ` : ${colonText(e.label)}` : ''}`);
  };
  const emit = (x: string, ind: string, depth: number): void => {
    const n = model.nodes.get(x);
    if (n) {
      emitState(n, ind);
      emitNotes(x, ind);
      return;
    }
    const g = model.groups.get(x);
    if (!g || depth > 64) return;
    out.push(g.label !== g.id ? `${ind}state "${quoted(g.label)}" as ${id(x)} {` : `${ind}state ${id(x)} {`);
    if (g.dir) out.push(`${ind}  direction ${g.dir}`);
    for (let r = 0; r < g.regions; r++) {
      if (r) out.push(`${ind}  --`);
      for (const c of g.children) if (scopeOf(model, c).r === r) emit(c, `${ind}  `, depth + 1);
      emitEdges(scopeKey({ g: x, r }), `${ind}  `);
    }
    out.push(`${ind}}`);
    emitNotes(x, ind);
  };
  for (const x of tops) emit(x, indent, 0);
  emitEdges('', indent);
  return out;
}

/** Copies of states and composites with new ids at the end of the code (or of `into`), the transitions between them copied too. */
export function cloneState(code: string, model: StateModel, items: readonly ItemRef[], o: CloneInto = {}): CloneResult {
  const refs = items.filter((x) => (x.kind === 'node' && !isPseudo(x.id)) || x.kind === 'group');
  if (!refs.length) return { code: o.into ?? code };
  const ids = new Set<string>();
  for (const r of refs) {
    ids.add(r.id);
    if (r.kind === 'group') {
      const d = stateDescendants(model, r.id);
      d.nodes.filter((x) => !isPseudo(x)).forEach((x) => ids.add(x));
      d.groups.forEach((x) => ids.add(x));
    }
  }
  const map = copyIds(model, ids, o.taken ?? []);
  const target = o.into ?? code;
  const M = o.into !== undefined ? parseState(o.into) : model;
  const lines = stateStatements(model, items.filter((x) => x.kind === 'node' || x.kind === 'group'), map, rootIndent(M, target.split('\n')));
  const L = target.split('\n');
  const at = contentEnd(L);
  return { code: applyEdits(target, [{ at, del: 0, ins: lines }]), map };
}

/** Plain Mermaid of copied items (the system clipboard's text). */
export function stateFragment(model: StateModel, refs: readonly ItemRef[]): string {
  const ids: Record<string, string> = {};
  return `${model.header}\n${stateStatements(model, refs, ids).join('\n')}\n`;
}

// ---- metadata of positional ids -----------------------------------------------------------------------------------

/** Notes are numbered in code order: their metadata follows them (matched by target and side, then order) after a code change. */
export function remapStateNotes<T>(notes: Readonly<Record<string, T>> | undefined, before: readonly StateNote[], after: readonly StateNote[]): Record<string, T> | undefined {
  if (!notes) return notes;
  const out: Record<string, T> = {};
  let moved = false;
  const key = (n: StateNote): string => `${n.target}\u0000${n.side}`;
  const groupOf = (list: readonly StateNote[]): Map<string, StateNote[]> => {
    const m = new Map<string, StateNote[]>();
    for (const n of list) (m.get(key(n)) ?? m.set(key(n), []).get(key(n))!).push(n);
    return m;
  };
  const A = groupOf(before), B = groupOf(after);
  for (const [k, list] of A)
    list.forEach((n, i) => {
      const v = notes[n.id];
      const to = B.get(k)?.[i];
      if (v === undefined || !to) return;
      out[to.id] = v;
      if (to.id !== n.id) moved = true;
    });
  for (const [id, v] of Object.entries(notes)) if (!before.some((n) => n.id === id) && !(id in out)) out[id] = v;
  return moved || Object.keys(out).length !== Object.keys(notes).length ? out : (notes as Record<string, T>);
}

/** The composites holding an item, innermost first. */
export { ancestors as stateAncestorsOf };
