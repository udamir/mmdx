// ER editing ops as Mermaid source rewrites (prototype edit.js, ER part; T11). The parser keeps the offsets of every
// statement, relationship token and label, so the ops splice only what changes (T11.5): a relationship edit rewrites
// one cardinality, its line or its label and keeps the form it is written in (`only one to zero or more` stays words,
// `||--o{` symbols); an alias is rewritten where Mermaid reads it (the first one written); ids are quoted where
// Mermaid would not read them as one word (`erId`, E2). Subgraphs (11.17+): ⌘G writes `subgraph id ["Title"]` …
// `end` around the selected tables and subgraphs, Ungroup and Delete remove the frame and keep what is in it.
import { descendantsIn, groupChain } from './tree.js';
import type { Cardinality, Direction, Entity, ErAttribute, ErGroup, ErModel, ErRel } from '../model.js';
import { erId, erLabel, erQuoted } from '../parse/er-id.js';
import { applySplices, type Splice } from '../parse/node-data.js';
import type { ItemRef } from '../types.js';
import { copyIds, uniqueId } from './ids.js';
import { append, contentEnd, indentOf, lineStart } from './lines.js';
import type { CloneInto, CloneResult, CodeResult, ConnectResult, LineResult, RefusableResult, SelectResult } from './types.js';
import { minOf } from '../geom.js';

// ---- writing --------------------------------------------------------------------------------------------------------

const LEFT: Record<Cardinality, string> = { 'zero-one': '|o', one: '||', 'zero-many': '}o', 'one-many': '}|' };
const RIGHT: Record<Cardinality, string> = { 'zero-one': 'o|', one: '||', 'zero-many': 'o{', 'one-many': '|{' };
/** Mermaid's word for each cardinality (either side). */
const WORDS: Record<Cardinality, string> = { 'zero-one': 'zero or one', one: 'only one', 'zero-many': 'zero or more', 'one-many': 'one or more' };

export interface RelTextInput {
  fromCard: Cardinality;
  toCard: Cardinality;
  identifying: boolean;
  label: string;
}

/** A new relationship line (symbols; ids quoted where needed; the label Mermaid requires, `""` for none). */
export function relText(r: RelTextInput, from: string, to: string): string {
  return `${erId(from)} ${LEFT[r.fromCard]}${r.identifying ? '--' : '..'}${RIGHT[r.toCard]} ${erId(to)} : ${erLabel(r.label)}`;
}

/** The written text of a relationship with its ends replaced (its cardinalities, line and label as written). */
function relWithEnds(code: string, r: ErRel, from: string, to: string): string {
  const s = r.start;
  const sp: Splice[] = [];
  if (from !== r.from) sp.push({ from: r.fromAt[0] - s, to: r.fromAt[1] - s, text: erId(from) });
  if (to !== r.to) sp.push({ from: r.toAt[0] - s, to: r.toAt[1] - s, text: erId(to) });
  return applySplices(code.slice(r.start, r.end), sp);
}

/** Removes a statement: its whole lines when nothing else is on them, else the statement and the spaces after it. */
function cut(code: string, start: number, end: number): Splice {
  const ls = code.lastIndexOf('\n', start - 1) + 1;
  let le = code.indexOf('\n', end);
  if (le < 0) le = code.length;
  if (!code.slice(ls, start).trim() && !code.slice(end, le).trim()) return { from: ls, to: Math.min(le + 1, code.length), text: '' };
  let e = end;
  while (code[e] === ' ' || code[e] === '\t') e++;
  return { from: start, to: e, text: '' };
}

/** Inserts lines before line `li` (or at the end of the content when `li` is null), ending with a newline. */
function insertLines(code: string, li: number | null, lines: readonly string[]): string {
  if (!lines.length) return code;
  if (li === null) return append(code, lines);
  const at = lineStart(code, li);
  return code.slice(0, at) + lines.map((l) => `${l}\n`).join('') + code.slice(at);
}

/** The indentation of the lines inside a subgraph (its header's plus two spaces), or the top level's. */
const innerIndent = (code: string, g: ErGroup | undefined): string => (g ? indentOf(code.split('\n')[g.line]) + '  ' : '  ');

// ---- tables -----------------------------------------------------------------------------------------------------------

/** A new table `ENTITY_<k> { string id PK }`: at the end of the code, or before the `end` of subgraph `group`. */
export function addEntity(code: string, model: ErModel, group?: string | null): SelectResult & { select: ItemRef } {
  const id = uniqueId(model, 'ENTITY_');
  const g = group ? model.groups.get(group) : undefined;
  const ind = innerIndent(code, g);
  const lines = [`${ind}${id} {`, `${ind}  string id PK`, `${ind}}`];
  return { code: g?.endLine !== undefined ? insertLines(code, g.endLine, lines) : append(code, lines), select: { kind: 'entity', id } };
}

/**
 * Deletes tables (their statements and every relationship touching them), relationships and subgraphs (the frame
 * only: what is in it stays, as Ungroup). An entity that only lived in a deleted relationship stays, declared where
 * that relationship was (so it keeps its subgraph).
 */
export function deleteER(code: string, model: ErModel, items: readonly ItemRef[]): CodeResult {
  const ents = new Set(items.filter((s) => s.kind === 'entity').map((s) => s.id));
  const rels = new Set(items.filter((s) => s.kind === 'rel').map((s) => s.id));
  const groups = new Set(items.filter((s) => s.kind === 'group' && model.groups.has(s.id)).map((s) => s.id));
  const sp: Splice[] = [];
  const goneRels = model.rels.filter((r) => rels.has(r.id) || ents.has(r.from) || ents.has(r.to) || groups.has(r.from) || groups.has(r.to));
  const gone = new Set(goneRels);
  // entities that would vanish with the relationships: kept as a bare declaration in place of the first one
  const kept = new Set<string>();
  const keep = (id: string): string | null => {
    const e = model.entities.get(id);
    if (!e || ents.has(id) || kept.has(id) || e.stmts.length) return null;
    if (model.rels.some((x) => !gone.has(x) && (x.from === id || x.to === id))) return null;
    kept.add(id);
    return erId(id);
  };
  for (const r of goneRels) {
    const decl = [keep(r.from), keep(r.to)].filter((x): x is string => !!x);
    const c = cut(code, r.start, r.end);
    if (decl.length) {
      const whole = c.to > r.end;
      sp.push(whole ? { from: r.start, to: r.end, text: decl.join('\n' + code.slice(code.lastIndexOf('\n', r.start - 1) + 1, r.start)) } : { from: r.start, to: r.end, text: decl.join(' ') });
    } else sp.push(c);
  }
  for (const id of ents) for (const st of model.entities.get(id)?.stmts ?? []) sp.push(cut(code, st.start, st.end));
  for (const gid of groups) sp.push(...frameCuts(code, model.groups.get(gid)!));
  return { code: applySplices(code, dedupe(sp)) };
}

/** Overlapping cuts (a statement listed twice) kept once. */
function dedupe(sp: Splice[]): Splice[] {
  const out: Splice[] = [];
  for (const s of [...sp].sort((a, b) => a.from - b.from || b.to - a.to)) {
    const last = out[out.length - 1];
    if (last && s.from < last.to) continue;
    out.push(s);
  }
  return out;
}

const attrLine = (a: ErAttribute): string =>
  `${a.type || 'string'} ${a.name}${a.keys.length ? ' ' + a.keys.join(', ') : ''}${a.comment ? ` "${a.comment.replace(/"/g, "'")}"` : ''}`;

/** An attribute as the editor shows it: `type name PK (comment)`, the comment in brackets (parseAttrLine reads it back). */
export const attrText = (a: ErAttribute): string =>
  `${a.type || 'string'} ${a.name}${a.keys.length ? ' ' + a.keys.join(', ') : ''}${a.comment ? ` (${a.comment})` : ''}`;

export interface EntityPatch {
  /** Display label (the alias); the id itself or '' removes the alias. */
  label?: string;
  attrs?: readonly ErAttribute[];
}

/**
 * Rewrites a table's alias and attributes. The alias is rewritten in the statement that gives it (Mermaid keeps the
 * first one written), else added to the table's first statement; the attributes go into its last block (other blocks
 * are emptied: Mermaid joins the attributes of all of them), else into a new block at the end of the code.
 */
export function updateEntity(code: string, model: ErModel, id: string, { label, attrs }: EntityPatch): CodeResult {
  const e = model.entities.get(id);
  if (!e) return { code };
  const sp: Splice[] = [];
  const L = code.split('\n');
  const newLabel = label ?? e.label;
  const aliasText = newLabel && newLabel !== id ? `[${erQuoted(newLabel)}]` : '';
  let aliasDone = newLabel === e.label;
  if (!aliasDone) {
    const at = e.stmts.find((s) => s.aliasAt);
    const first = e.stmts[0];
    if (at && !aliasText) {
      // no alias: every one goes (a later one would become the alias)
      for (const s of e.stmts) if (s.aliasAt) sp.push({ from: s.aliasAt[0], to: s.aliasAt[1], text: '' });
      aliasDone = true;
    } else if (at) {
      sp.push({ from: at.aliasAt![0], to: at.aliasAt![1], text: aliasText });
      aliasDone = true;
    } else if (first && aliasText) {
      sp.push({ from: first.nameAt[1], to: first.nameAt[1], text: aliasText });
      aliasDone = true;
    } else if (!aliasText) aliasDone = true;
  }
  const blocks = e.stmts.filter((s) => s.blockAt);
  const last = blocks[blocks.length - 1];
  let tail: string[] = [];
  if (attrs) {
    if (last) {
      const ind = indentOf(L[last.line]);
      const body = attrs.map((a) => `${ind}  ${attrLine(a)}`);
      sp.push({ from: last.blockAt![0], to: last.blockAt![1], text: body.length ? `{\n${body.join('\n')}\n${ind}}` : '{\n' + ind + '}' });
      for (const b of blocks) if (b !== last) sp.push({ from: b.blockAt![0], to: b.blockAt![1], text: '{}' });
    } else {
      tail = [`  ${erId(id)}${aliasDone ? '' : aliasText} {`, ...attrs.map((a) => `    ${attrLine(a)}`), '  }'];
      aliasDone = true;
    }
  }
  if (!aliasDone) tail = [`  ${erId(id)}${aliasText}`];
  const out = applySplices(code, sp);
  return { code: tail.length ? append(out, tail) : out };
}

// ---- relationships ------------------------------------------------------------------------------------------------

export type RelPatch = Partial<Pick<ErRel, 'fromCard' | 'toCard' | 'identifying' | 'label' | 'from' | 'to'>>;

/** Was the cardinality written as words or numbers (`only one`, `1+`, `many`) rather than symbols (`||`, `o{`)? */
const isWords = (s: string): boolean => !/^(?:[|}][|o]|o[|{]|\|\{)$/i.test(s);

/**
 * Rewrites what changes in a relationship (E8): a cardinality, the line, the label or an end, each in place. A changed
 * cardinality or line keeps the form written there (words stay words: `zero or more`, `optionally to`; symbols stay
 * symbols: `o{`, `..`); a missing label is added.
 */
export function updateRel(code: string, model: ErModel, relId: string, patch: RelPatch): CodeResult {
  const r = model.rels.find((x) => x.id === relId);
  if (!r) return { code };
  const at = (x: [number, number]): string => code.slice(x[0], x[1]);
  const sp: Splice[] = [];
  if (patch.fromCard !== undefined && patch.fromCard !== r.fromCard)
    sp.push({ from: r.fromCardAt[0], to: r.fromCardAt[1], text: isWords(at(r.fromCardAt)) ? WORDS[patch.fromCard] : LEFT[patch.fromCard] });
  if (patch.toCard !== undefined && patch.toCard !== r.toCard)
    sp.push({ from: r.toCardAt[0], to: r.toCardAt[1], text: isWords(at(r.toCardAt)) ? WORDS[patch.toCard] : RIGHT[patch.toCard] });
  if (patch.identifying !== undefined && patch.identifying !== r.identifying) {
    const words = /^[a-z]/i.test(at(r.lineAt));
    sp.push({ from: r.lineAt[0], to: r.lineAt[1], text: words ? (patch.identifying ? 'to' : 'optionally to') : patch.identifying ? '--' : '..' });
  }
  if (patch.from !== undefined && patch.from !== r.from) sp.push({ from: r.fromAt[0], to: r.fromAt[1], text: erId(patch.from) });
  if (patch.to !== undefined && patch.to !== r.to) sp.push({ from: r.toAt[0], to: r.toAt[1], text: erId(patch.to) });
  if (patch.label !== undefined && (patch.label !== r.label || !r.labelAt)) {
    if (r.labelAt) sp.push({ from: r.labelAt[0], to: r.labelAt[1], text: erLabel(patch.label) });
    else sp.push({ from: r.end, to: r.end, text: ` : ${erLabel(patch.label)}` });
  }
  return { code: applySplices(code, sp) };
}

/** Re-attaches one end of a relationship (only that id is rewritten); an entity that only lived on that line stays declared. */
export function reconnectER(code: string, model: ErModel, relId: string, which: 'a' | 'b', newId: string): ConnectResult {
  const rel = model.rels.find((r) => r.id === relId);
  if (!rel) return { code };
  const from = which === 'a' ? newId : rel.from, to = which === 'b' ? newId : rel.to;
  const old = which === 'a' ? rel.from : rel.to;
  const e = model.entities.get(old);
  const li = rel.src;
  const lone = !!e && !e.stmts.length && [...e.lines].every((x) => x === li) && from !== old && to !== old;
  let out = updateRel(code, model, relId, which === 'a' ? { from: newId } : { to: newId }).code;
  if (lone) out = insertLines(out, li, [indentOf(code.split('\n')[li]) + erId(old)]);
  return { code: out, from, to, line: li + (lone ? 1 : 0) };
}

/** A new relationship at the end of the code. */
export function addERRel(code: string, from: string, to: string): LineResult {
  const t = code.trimEnd();
  return { code: `${t}\n  ${relText({ fromCard: 'one', toCard: 'zero-many', identifying: true, label: '' }, from, to)}\n`, line: t.split('\n').length };
}

// ---- clipboard ----------------------------------------------------------------------------------------------------

/**
 * Copies ER tables (their statements, ids replaced) and the relationships between copied tables (as written, ends
 * replaced). A copy of a table in a subgraph goes into the same subgraph.
 */
export function cloneER(code: string, model: ErModel, items: readonly ItemRef[], o: CloneInto = {}): CloneResult {
  const ids = items.filter((s) => s.kind === 'entity' && model.entities.has(s.id)).map((s) => s.id);
  if (!ids.length) return { code: o.into ?? code };
  const map = copyIds(model, ids, o.taken);
  const L = code.split('\n');
  const into = o.into !== undefined;
  // copies by subgraph (a paste into another diagram goes to the top level)
  const byGroup = new Map<string | null, string[]>();
  for (const id of ids) {
    const e = model.entities.get(id)!;
    const g = !into && e.parent ? e.parent : null;
    const ind = g ? innerIndent(code, model.groups.get(g)) : '  ';
    const out = byGroup.get(g) ?? [];
    byGroup.set(g, out);
    if (!e.stmts.length) {
      out.push(ind + erId(map[id]!));
      continue;
    }
    for (const st of e.stmts) {
      const text = applySplices(code.slice(st.start, st.end), [{ from: st.nameAt[0] - st.start, to: st.nameAt[1] - st.start, text: erId(map[id]!) }]);
      const base = indentOf(L[st.line]).length;
      out.push(...text.split('\n').map((l, k) => (k ? ind + l.slice(Math.min(base, indentOf(l).length)) : ind + l)));
    }
  }
  const rels: string[] = [];
  for (const r of model.rels) if (Object.hasOwn(map, r.from) && Object.hasOwn(map, r.to)) rels.push('  ' + relWithEnds(code, r, map[r.from]!, map[r.to]!));
  let res = o.into ?? code;
  // into subgraphs first (their lines are in the original code), bottom-up
  const inGroups = [...byGroup].filter(([g]) => g !== null).sort((a, b) => (model.groups.get(b[0]!)?.endLine ?? 0) - (model.groups.get(a[0]!)?.endLine ?? 0));
  for (const [g, lines] of inGroups) {
    const grp = model.groups.get(g!);
    res = grp?.endLine !== undefined ? insertLines(res, grp.endLine, lines) : append(res, lines);
  }
  return { code: append(res, [...(byGroup.get(null) ?? []), ...rels]), map };
}

// ---- direction ----------------------------------------------------------------------------------------------------

/** Direction: the top-level `direction LR` line (rewritten, or added after the header). */
export function setErDirection(code: string, model: ErModel, dir: Direction): CodeResult {
  const L = code.split('\n');
  if (model.dirLine !== undefined && /direction\s+\w+/i.test(L[model.dirLine] ?? '')) {
    L[model.dirLine] = L[model.dirLine]!.replace(/direction\s+\w+/i, `direction ${dir}`);
    return { code: L.join('\n') };
  }
  if (model.headerLine < 0) return { code };
  L.splice(model.headerLine + 1, 0, `  direction ${dir}`);
  return { code: L.join('\n') };
}

/** A subgraph's own direction (`direction LR` in it), or none (null: Mermaid's default). */
export function setErGroupDirection(code: string, model: ErModel, gid: string, dir: Direction | null): CodeResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const L = code.split('\n');
  // the subgraph's own direction lines (not those of subgraphs inside it)
  const inner = [...model.groups.values()].filter((x) => x.id !== gid && x.line > g.line && (x.endLine ?? Infinity) <= (g.endLine ?? Infinity));
  const own: number[] = [];
  for (let li = g.line + 1; li < (g.endLine ?? L.length); li++)
    if (/^\s*direction\s+(TB|BT|RL|LR)\s*$/i.test(L[li] ?? '') && !inner.some((x) => li > x.line && li < (x.endLine ?? Infinity))) own.push(li);
  if (dir === null) return { code: L.filter((_, li) => !own.includes(li)).join('\n') };
  if (own.length) {
    const li = own[own.length - 1]!;
    L[li] = L[li]!.replace(/direction\s+\w+/i, `direction ${dir}`);
    return { code: L.join('\n') };
  }
  L.splice(g.line + 1, 0, `${innerIndent(code, g)}direction ${dir}`);
  return { code: L.join('\n') };
}

// ---- subgraphs (11.17+) -------------------------------------------------------------------------------------------

/** Entity and subgraph ids inside a subgraph (any depth). */
export function erDescendants(model: ErModel, gid: string): { nodes: string[]; groups: string[]; leaf: 'entity' } {
  return { ...descendantsIn(model.groups, (id) => model.entities.has(id), gid), leaf: 'entity' };
}

/** The subgraph an entity or a subgraph is in (null: the top level). */
const erParentOf = (model: ErModel, id: string): string | null => model.entities.get(id)?.parent ?? model.groups.get(id)?.parent ?? null;

/** The selected tables and subgraphs, without those inside another selected subgraph. */
function groupable(model: ErModel, items: readonly ItemRef[]): string[] {
  const ids = items.filter((x) => (x.kind === 'entity' && model.entities.has(x.id)) || (x.kind === 'group' && model.groups.has(x.id))).map((x) => x.id);
  const sel = new Set(ids);
  const inSelected = (id: string): boolean => {
    for (const p of groupChain((x) => erParentOf(model, x), id)) if (sel.has(p)) return true;
    return false;
  };
  return [...new Set(ids)].filter((id) => !inSelected(id));
}

/** Why the selection cannot become a subgraph (an i18n key or a message), else null. */
export function canGroupER(model: ErModel, items: readonly ItemRef[]): string | null {
  const ids = groupable(model, items);
  if (!ids.length) return 'Select tables or subgraphs to group';
  const p = erParentOf(model, ids[0]!);
  if (!ids.every((id) => erParentOf(model, id) === p)) return 'Select tables of one subgraph (or of the top level)';
  return null;
}

/**
 * Makes a subgraph of tables and subgraphs (⌘G): `subgraph group<n> ["Title"]` with a line per selected table and the
 * selected subgraphs' blocks moved into it, at the first selected item's line in the scope they share.
 */
export function groupER(code: string, model: ErModel, items: readonly ItemRef[], title = 'Group'): SelectResult & RefusableResult {
  const why = canGroupER(model, items);
  if (why) return { code, reason: why };
  const ids = groupable(model, items);
  const parent = erParentOf(model, ids[0]!);
  const pg = parent ? model.groups.get(parent) : undefined;
  const ind = innerIndent(code, pg);
  const id = uniqueId(model, 'group');
  const L = code.split('\n');
  const sp: Splice[] = [];
  const moved: string[] = [];
  for (const g of ids.map((x) => model.groups.get(x)).filter((g): g is ErGroup => !!g).sort((a, b) => a.line - b.line)) {
    if (g.endLine === undefined) continue; // an unclosed subgraph has no block to move
    const block = L.slice(g.line, g.endLine + 1);
    const base = indentOf(block[0]).length;
    moved.push(...block.map((l) => ind + '  ' + l.slice(Math.min(base, indentOf(l).length))));
    sp.push({ from: lineStart(code, g.line), to: lineStart(code, g.endLine + 1), text: '' });
  }
  const block = [`${ind}subgraph ${id} [${erQuoted(title)}]`, ...ids.filter((x) => model.entities.has(x)).map((x) => `${ind}  ${erId(x)}`), ...moved, `${ind}end`];
  // where the first selected item is (relationships after it that name a moved subgraph still follow its `end`),
  // else before the `end` of the subgraph they share, else at the end of the code
  const scopeOf = (li: number): string | null => {
    let best: ErGroup | null = null;
    for (const g of model.groups.values()) if (g.line < li && li < (g.endLine ?? Infinity) && (!best || g.line > best.line)) best = g;
    return best?.id ?? null;
  };
  const firsts = ids.map((x) => {
    const g = model.groups.get(x);
    if (g) return g.line;
    return minOf([...(model.entities.get(x)?.lines ?? [])].filter((li) => scopeOf(li) === parent));
  });
  const first = minOf(firsts);
  const at = Number.isFinite(first) ? lineStart(code, first) : pg?.endLine !== undefined ? lineStart(code, pg.endLine) : null;
  if (at !== null) sp.push({ from: at, to: at, text: block.map((l) => `${l}\n`).join('') });
  let out = applySplices(code, sp);
  if (at === null) {
    const OL = out.split('\n');
    out = [...OL.slice(0, contentEnd(OL)), ...block].join('\n') + '\n';
  }
  return { code: out, select: { kind: 'group', id } };
}

/** The splices that remove a subgraph's frame: its header and its `end` (whole lines when alone on them), contents one step left. */
function frameCuts(code: string, g: ErGroup): Splice[] {
  const sp: Splice[] = [cut(code, g.start, g.headEnd)];
  if (g.endLine === undefined) return sp;
  const endAt = lineStart(code, g.endLine);
  const endText = code.slice(endAt, lineStart(code, g.endLine + 1));
  if (/^\s*end\b\s*$/i.test(endText)) sp.push({ from: endAt, to: endAt + endText.length, text: '' });
  else {
    const k = endText.search(/\bend\b/i);
    if (k >= 0) sp.push({ from: endAt + k, to: endAt + k + 3, text: '' });
  }
  // the lines between, one indentation step to the left
  for (let li = g.line + 1; li < g.endLine; li++) {
    const s = lineStart(code, li);
    if (code.startsWith('  ', s)) sp.push({ from: s, to: s + 2, text: '' });
    else if (code[s] === '\t') sp.push({ from: s, to: s + 1, text: '' });
  }
  return sp;
}

/** Removes a subgraph's frame (Ungroup); its tables and subgraphs move up one level. */
export function ungroupER(code: string, model: ErModel, gid: string): { code: string; members: string[] } {
  const g = model.groups.get(gid);
  if (!g) return { code, members: [] };
  // relationships to the subgraph would become relationships to a new table of that name: they go with it
  const sp = [...frameCuts(code, g), ...model.rels.filter((r) => r.from === gid || r.to === gid).map((r) => cut(code, r.start, r.end))];
  return { code: applySplices(code, dedupe(sp)), members: [...g.children] };
}

/** A subgraph's new title (`subgraph id ["Title"]`; the id alone when the title is the id). */
export function relabelErGroup(code: string, model: ErModel, gid: string, title: string): CodeResult {
  const g = model.groups.get(gid);
  if (!g) return { code };
  const t = title.trim();
  return { code: applySplices(code, [{ from: g.idAt[1], to: g.headEnd, text: t && t !== gid ? ` [${erQuoted(t)}]` : '' }]) };
}

/** Plain Mermaid of copied tables and the relationships between them (the system clipboard's text). */
export function erFragment(model: ErModel, code: string, refs: readonly ItemRef[]): string {
  const out = ['erDiagram'];
  const ids = new Set<string>();
  const add = (e: Entity): void => {
    if (ids.has(e.id)) return;
    ids.add(e.id);
    if (!e.stmts.length) out.push(`  ${erId(e.id)}`);
    for (const st of e.stmts) {
      const base = indentOf(code.split('\n')[st.line]).length;
      out.push(...code.slice(st.start, st.end).split('\n').map((l, k) => '  ' + (k ? l.slice(Math.min(base, indentOf(l).length)) : l)));
    }
  };
  for (const r of refs) {
    const e = r.kind === 'entity' ? model.entities.get(r.id) : undefined;
    if (e) add(e);
    if (r.kind === 'group') for (const id of erDescendants(model, r.id).nodes) add(model.entities.get(id)!);
  }
  for (const r of model.rels) if (ids.has(r.from) && ids.has(r.to)) out.push(`  ${code.slice(r.start, r.end)}`);
  return `${out.join('\n')}\n`;
}
