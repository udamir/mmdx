// ER editing ops as Mermaid source rewrites (prototype edit.js, ER part).
import type { ErAttribute, ErModel, ErRel } from '../model.js';
import { encodeLabel } from '../parse/label.js';
import type { ItemRef } from '../types.js';
import { relText } from './connect.js';
import { copyIds, uniqueId } from './ids.js';
import { append, applyEdits, escapeRegExp, indentOf, splice, type LineEdit } from './lines.js';
import type { CloneResult, CodeResult, SelectResult } from './types.js';

/** A new table `ENTITY_<k> { string id PK }` at the end of the code. */
export function addEntity(code: string, model: ErModel): SelectResult & { select: ItemRef } {
  const id = uniqueId(model, 'ENTITY_');
  return { code: append(code, [`  ${id} {`, '    string id PK', '  }']), select: { kind: 'entity', id } };
}

/**
 * Deletes tables (their block, bare mentions and every relationship touching them) and relationships. Entities
 * that only lived in deleted relationship lines stay as bare declarations.
 */
export function deleteER(code: string, model: ErModel, items: readonly ItemRef[]): CodeResult {
  const L = code.split('\n');
  const ents = new Set(items.filter((s) => s.kind === 'entity').map((s) => s.id));
  const rels = new Set(items.filter((s) => s.kind === 'rel').map((s) => s.id));
  const edits: LineEdit[] = [];
  const gone = new Set<number>();
  for (const r of model.rels)
    if (rels.has(r.id) || ents.has(r.from) || ents.has(r.to)) {
      edits.push({ at: r.src, del: 1, ins: [] });
      gone.add(r.src);
    }
  for (const id of ents) {
    const e = model.entities.get(id);
    if (!e) continue;
    const end = e.endLine ?? e.defLine;
    if (e.defLine != null) edits.push({ at: e.defLine, del: end! - e.defLine + 1, ins: [] });
    for (const li of e.lines)
      if (!gone.has(li) && (e.defLine == null || li < e.defLine || li > end!) && (L[li] ?? '').trim() === id) edits.push({ at: li, del: 1, ins: [] });
  }
  const removed = new Set<number>();
  for (const e of edits) for (let i = 0; i < e.del; i++) removed.add(e.at + i);
  for (const e of model.entities.values()) {
    if (ents.has(e.id) || e.defLine != null) continue;
    if ([...e.lines].every((li) => removed.has(li))) edits.push({ at: L.length, del: 0, ins: ['  ' + e.id] });
  }
  return { code: applyEdits(code, edits) };
}

const attrLine = (a: ErAttribute): string =>
  `    ${a.type || 'string'} ${a.name}${a.keys.length ? ' ' + a.keys.join(', ') : ''}${a.comment ? ` "${a.comment.replace(/"/g, "'")}"` : ''}`;

/** An attribute as the editor shows it: `type name PK (comment)`, the comment in brackets (parseAttrLine reads it back). */
export const attrText = (a: ErAttribute): string =>
  `${a.type || 'string'} ${a.name}${a.keys.length ? ' ' + a.keys.join(', ') : ''}${a.comment ? ` (${a.comment})` : ''}`;

export interface EntityPatch {
  /** Display label (`id["label"]`); the id itself or '' writes a plain `id {`. */
  label?: string;
  attrs?: readonly ErAttribute[];
}

/** Rewrites the entity block: optional display label and the attribute list. */
export function updateEntity(code: string, model: ErModel, id: string, { label, attrs }: EntityPatch): CodeResult {
  const e = model.entities.get(id);
  if (!e) return { code };
  const newLabel = label ?? e.label;
  const head = newLabel && newLabel !== id ? `${id}["${encodeLabel(newLabel)}"] {` : `${id} {`;
  const body = (attrs ?? e.attrs).map(attrLine);
  if (e.defLine != null) {
    const L = code.split('\n');
    const ind = indentOf(L[e.defLine]);
    return { code: splice(code, e.defLine, (e.endLine ?? e.defLine) - e.defLine + 1, [ind + head, ...body.map((b) => ind + b.slice(2)), ind + '}']) };
  }
  return { code: append(code, ['  ' + head, ...body, '  }']) };
}

export type RelPatch = Partial<Pick<ErRel, 'fromCard' | 'toCard' | 'identifying' | 'label' | 'from' | 'to'>>;

/** Rewrites a relationship line (cardinalities, identifying, label). */
export function updateRel(code: string, model: ErModel, relId: string, patch: RelPatch): CodeResult {
  const r = model.rels.find((x) => x.id === relId);
  if (!r) return { code };
  const n = { ...r, ...patch };
  const L = code.split('\n');
  return { code: splice(code, r.src, 1, [indentOf(L[r.src]) + relText(n, n.from, n.to)]) };
}

/** Copies ER tables (their attribute blocks) and the relationships between copied tables. */
export function cloneER(code: string, model: ErModel, items: readonly ItemRef[]): CloneResult {
  const ids = items.filter((s) => s.kind === 'entity' && model.entities.has(s.id)).map((s) => s.id);
  if (!ids.length) return { code };
  const map = copyIds(model, ids);
  const L = code.split('\n');
  const out: string[] = [];
  for (const id of ids) {
    const e = model.entities.get(id)!;
    if (e.defLine == null) {
      out.push('  ' + map[id]);
      continue;
    }
    const block = L.slice(e.defLine, (e.endLine ?? e.defLine) + 1);
    block[0] = (block[0] ?? '').replace(new RegExp(`^(\\s*)${escapeRegExp(id)}`), (_m, sp: string) => sp + map[id]);
    out.push(...block);
  }
  for (const r of model.rels) if (Object.hasOwn(map, r.from) && Object.hasOwn(map, r.to)) out.push('  ' + relText(r, map[r.from]!, map[r.to]!));
  return { code: append(code, out), map };
}
