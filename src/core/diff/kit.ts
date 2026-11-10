// Building blocks of the per-type diffs (core/diff/<type>.ts, used by each diagram type's view kind): field changes
// with their facets, metadata and Mermaid-style comparison, alignment of positional items and rename detection.
import { classOf, keyDef } from '../meta/keys.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { MermaidStyle } from '../model.js';
import type { ItemKind } from '../types.js';
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

/** Longest common subsequence of two key lists: index pairs, in order. */
export function lcs<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): [number, number][] {
  const n = a.length, m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) t[i]![j] = eq(a[i]!, b[j]!) ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (eq(a[i]!, b[j]!)) out.push([i++, j++]);
    else if (t[i + 1]![j]! >= t[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * Aligns two ordered lists: exact matches first (LCS on `key`), then, between two anchors, items that are `similar`
 * are paired in order (an edited message). Returns pairs plus what is left on each side.
 */
export function align<T>(a: readonly T[], b: readonly T[], key: (x: T) => string, similar: (x: T, y: T) => boolean): { pairs: [T, T][]; onlyA: T[]; onlyB: T[] } {
  const anchors = lcs(a.map(key), b.map(key));
  const pairs: [T, T][] = [], onlyA: T[] = [], onlyB: T[] = [];
  let pi = 0, pj = 0;
  const gap = (i1: number, j1: number) => {
    const ga = a.slice(pi, i1), gb = b.slice(pj, j1);
    const used = new Set<number>();
    for (const x of ga) {
      const k = gb.findIndex((y, idx) => !used.has(idx) && similar(x, y));
      if (k >= 0) {
        used.add(k);
        pairs.push([x, gb[k]!]);
      } else onlyA.push(x);
    }
    gb.forEach((y, idx) => used.has(idx) || onlyB.push(y));
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
export function renames<T>(goneIds: string[], newIds: string[], sig: (side: 'a' | 'b', id: string) => string): Map<string, string> {
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
