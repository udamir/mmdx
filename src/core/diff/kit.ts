// Building blocks of the per-type diffs (core/diff/<type>.ts, used by each diagram type's view kind): field changes
// with their facets, metadata and Mermaid-style comparison, alignment of positional items and rename detection.
import { classOf, keyDef } from '../meta/keys.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { MermaidStyle } from '../model.js';
import type { ItemKind } from '../types.js';
import { diffArrays } from './text.js';
import type { ChangeFacet, FieldChange, ItemChange } from './types.js';

export const FACETS: readonly ChangeFacet[] = ['content', 'layout', 'style'];

// ---- facet of a metadata key ------------------------------------------------------------------------------------

/**
 * The facet a metadata key's change belongs to, from its class (meta/keys.ts): layout and state (a fold, a hidden
 * item) are layout, content is content, look is style; locks and the format version are no change. A key the table
 * does not know is reported as content, so filtering out style never hides it.
 */
export function metaFacet(k: string): ChangeFacet | null {
  if (keyDef(k)?.diffIgnore) return null;
  const c = classOf(k);
  return c === 'look' ? 'style' : c === 'layout' || c === 'state' ? 'layout' : 'content';
}

// ---- helpers ----------------------------------------------------------------------------------------------------

/**
 * Structural equality of two values read from documents (B12): objects compare as key sets (a reordered `style`,
 * `classDef` or nested canvas key is no change), arrays in order; a key set to `undefined` is the same as no key, as it
 * is once written.
 */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
  for (const k of Object.keys(A)) if (A[k] !== undefined && !same(A[k], B[k])) return false;
  for (const k of Object.keys(B)) if (B[k] !== undefined && A[k] === undefined) return false;
  return true;
}

export const isEmpty = (o: object | undefined): boolean => !o || Object.keys(o).length === 0;

export function field(out: FieldChange[], facet: ChangeFacet, name: string, before: unknown, after: unknown): void {
  if (same(before, after)) return;
  const f: FieldChange = { facet, field: name };
  if (before !== undefined) f.before = before;
  if (after !== undefined) f.after = after;
  out.push(f);
}

/** Position, size and the other geometry keys are grouped so a moved node reads as one change, not two. */
export function metaFields(out: FieldChange[], a: ItemMeta | undefined, b: ItemMeta | undefined, presetDefsChanged: ReadonlySet<string>): void {
  const A = a ?? {}, B = b ?? {};
  const pick = (o: ItemMeta, ks: string[]) => (ks.some((k) => o[k] !== undefined) ? Object.fromEntries(ks.map((k) => [k, o[k]])) : undefined);
  field(out, 'layout', 'position', pick(A, ['x', 'y']), pick(B, ['x', 'y']));
  field(out, 'layout', 'size', pick(A, ['w', 'h']), pick(B, ['w', 'h']));
  const grouped = new Set(['x', 'y', 'w', 'h']);
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (grouped.has(k)) continue;
    const facet = metaFacet(k);
    if (facet) field(out, facet, k === 'points' ? 'bend points' : k, A[k], B[k]);
  }
  const preset = typeof B.preset === 'string' ? B.preset : undefined;
  if (preset && A.preset === preset && presetDefsChanged.has(preset)) field(out, 'style', `preset "${preset}" definition`, 'old', 'new');
}

export function mermaidStyleOf(classes: readonly string[] | undefined, own: MermaidStyle | undefined, defs: Record<string, MermaidStyle>): MermaidStyle | undefined {
  const s: MermaidStyle = {};
  for (const c of classes ?? []) Object.assign(s, defs[c]);
  Object.assign(s, own);
  return isEmpty(s) ? undefined : s;
}

export function finish(kind: ItemKind, id: string, label: string, fields: FieldChange[], beforeId?: string): ItemChange {
  const facets = FACETS.filter((f) => fields.some((x) => x.facet === f));
  const c: ItemChange = { kind, id, label, status: facets.length ? 'changed' : 'unchanged', facets, fields };
  if (beforeId !== undefined && beforeId !== id) c.beforeId = beforeId;
  return c;
}

export const added = (kind: ItemKind, id: string, label: string): ItemChange => ({ kind, id, label, status: 'added', facets: [], fields: [] });
export const removed = (kind: ItemKind, id: string, label: string): ItemChange => ({ kind, id, label, status: 'removed', facets: [], fields: [] });

/** Local presets (`%%@ style.<kind> <name>`) whose definition differs, per kind. */
export function changedPresets(a: DiagramMeta, b: DiagramMeta, kind: string): Set<string> {
  const A = a.styles[kind] ?? {}, B = b.styles[kind] ?? {};
  return new Set([...Object.keys(A), ...Object.keys(B)].filter((n) => n in A && n in B && !same(A[n], B[n])));
}

/**
 * The index pairs of a longest common subsequence of two key lists, from Myers' diff (core/diff/text.ts): linear
 * memory and close to linear time for lists that mostly agree (P3: the O(n·m) table took 253 ms and 129 MB for 4000
 * items).
 */
function anchorsOf(a: readonly string[], b: readonly string[]): [number, number][] {
  // a key the other list lacks is in no common subsequence: the diff runs on the keys that can match (a list
  // replaced in full, or every seventh item edited, costs no edit steps)
  const inA = new Set(a), inB = new Set(b);
  const ia = a.flatMap((k, x) => (inB.has(k) ? [x] : [])), ib = b.flatMap((k, y) => (inA.has(k) ? [y] : []));
  const out: [number, number][] = [];
  let i = 0, j = 0;
  for (const run of diffArrays(ia.map((x) => a[x]!), ib.map((y) => b[y]!))) {
    const n = run.items.length;
    if (run.op === 'same') for (let k = 0; k < n; k++) out.push([ia[i + k]!, ib[j + k]!]);
    if (run.op !== 'add') i += n;
    if (run.op !== 'del') j += n;
  }
  return out;
}

/**
 * Aligns two ordered lists: exact matches first (a common subsequence of `key`), then, between two anchors, items of
 * the same `group` are paired in order (an edited message). Returns pairs plus what is left on each side.
 */
export function align<T>(a: readonly T[], b: readonly T[], key: (x: T) => string, group: (x: T, side: 'a' | 'b') => string): { pairs: [T, T][]; onlyA: T[]; onlyB: T[] } {
  const anchors = anchorsOf(a.map(key), b.map(key));
  const pairs: [T, T][] = [], onlyA: T[] = [], onlyB: T[] = [];
  let pi = 0, pj = 0;
  // a gap's after items queued by group, so each before item takes the first free one of its group (P3)
  const gap = (i1: number, j1: number) => {
    const queues = new Map<string, { js: number[]; at: number }>();
    for (let j = pj; j < j1; j++) {
      const g = group(b[j]!, 'b');
      (queues.get(g) ?? queues.set(g, { js: [], at: 0 }).get(g)!).js.push(j);
    }
    const used = new Set<number>();
    for (let i = pi; i < i1; i++) {
      const q = queues.get(group(a[i]!, 'a'));
      const j = q && q.at < q.js.length ? q.js[q.at++]! : -1;
      if (j >= 0) {
        used.add(j);
        pairs.push([a[i]!, b[j]!]);
      } else onlyA.push(a[i]!);
    }
    for (let j = pj; j < j1; j++) if (!used.has(j)) onlyB.push(b[j]!);
  };
  for (const [i, j] of anchors) {
    gap(i, j);
    pairs.push([a[i]!, b[j]!]);
    pi = i + 1;
    pj = j + 1;
  }
  gap(a.length, b.length);
  return { pairs, onlyA, onlyB };
}

/** Removed + added nodes with the same label and shape (one candidate each way) are a rename. */
export function renames(goneIds: string[], newIds: string[], sig: (side: 'a' | 'b', id: string) => string): Map<string, string> {
  const bySig = (ids: string[], side: 'a' | 'b') => {
    const m = new Map<string, string[]>();
    for (const id of ids) m.set(sig(side, id), [...(m.get(sig(side, id)) ?? []), id]);
    return m;
  };
  const A = bySig(goneIds, 'a'), B = bySig(newIds, 'b');
  const out = new Map<string, string>();
  for (const [s, ids] of A) {
    const other = B.get(s);
    if (ids.length === 1 && other?.length === 1) out.set(ids[0]!, other[0]!);
  }
  return out;
}

// ---- the per-kind diff bodies (X4, task 4.6) ------------------------------------------------------------------------

/** What a kind compares on two versions of one item (its content, layout and style fields). */
export type FieldsFn<T> = (a: T, b: T, f: FieldChange[]) => void;

/**
 * Items matched by id: each item of the after version is added or compared, then the before version's items that are
 * gone are removed. `renamed` (before id → after id) pairs items whose id changed; the change keeps the before id.
 */
export function diffById<T>(out: ItemChange[], kind: ItemKind, A: ReadonlyMap<string, T>, B: ReadonlyMap<string, T>, name: (t: T, id: string) => string, fields: FieldsFn<T>, renamed?: ReadonlyMap<string, string>): void {
  const from = renamed ? new Map([...renamed].map(([a, b]) => [b, a])) : null;
  for (const [id, xb] of B) {
    const beforeId = from?.get(id) ?? id;
    const xa = A.get(beforeId);
    if (xa === undefined) {
      out.push(added(kind, id, name(xb, id)));
      continue;
    }
    const f: FieldChange[] = [];
    fields(xa, xb, f);
    out.push(finish(kind, id, name(xb, id), f, beforeId));
  }
  for (const [id, xa] of A) if (!B.has(id) && !renamed?.has(id)) out.push(removed(kind, id, name(xa, id)));
}

/**
 * Positional items matched by aligning the two lists (`align`: equal keys first, then in order within a group); the
 * pairs are compared, the rest added or removed. `name` reads an item in its own version.
 */
export function diffAligned<T extends { id: string }>(
  out: ItemChange[], kind: ItemKind, A: readonly T[], B: readonly T[], key: (x: T) => string, group: (x: T, side: 'a' | 'b') => string,
  name: (x: T, side: 'a' | 'b') => string, fields: FieldsFn<T>,
): void {
  const { pairs, onlyA, onlyB } = align(A, B, key, group);
  for (const [xa, xb] of pairs) {
    const f: FieldChange[] = [];
    fields(xa, xb, f);
    out.push(finish(kind, xb.id, name(xb, 'b'), f, xa.id));
  }
  for (const x of onlyB) out.push(added(kind, x.id, name(x, 'b')));
  for (const x of onlyA) out.push(removed(kind, x.id, name(x, 'a')));
}

/** Every `classDef` that differs, as a document-level style change. */
export function classDefFields(doc: FieldChange[], a: Readonly<Record<string, MermaidStyle>>, b: Readonly<Record<string, MermaidStyle>>): void {
  for (const c of new Set([...Object.keys(a), ...Object.keys(b)])) field(doc, 'style', `classDef ${c}`, a[c], b[c]);
}

/** An item's Mermaid classes (as written, space-separated) and its Mermaid style (its classes' and its own), as style changes. */
export function styleFields(
  f: FieldChange[], a: { readonly classes?: readonly string[]; readonly style?: MermaidStyle }, b: { readonly classes?: readonly string[]; readonly style?: MermaidStyle },
  defsA: Record<string, MermaidStyle>, defsB: Record<string, MermaidStyle>,
): void {
  field(f, 'style', 'classes', a.classes?.join(' ') || undefined, b.classes?.join(' ') || undefined);
  field(f, 'style', 'Mermaid style', mermaidStyleOf(a.classes, a.style, defsA), mermaidStyleOf(b.classes, b.style, defsB));
}

