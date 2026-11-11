// The rows of the ER table being edited, as pure functions (5.5): what is at a point of the table (a row, the empty
// last row, the title), the gap a dragged row drops into, row ranges and steps, reordering and deleting rows, and the
// attribute highlights keyed by the names that result.
import type { AttrHighlight } from '../../../core/meta/types.js';

/** A table's box in the geometry: its rows (the empty last row is `add`) and its title's height (`head`). */
export interface TableBox {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
  head?: number;
  rows?: { name: string; y: number; h: number; add?: boolean }[];
}

/** An attribute row (`i`), the empty last row (`add`), the title, or nothing. */
export type RowHit = { i: number; add: boolean } | 'title' | null;

/** What is at diagram point p of the table. */
export function rowAt(b: TableBox | null, p: { x: number; y: number }): RowHit {
  if (!b || p.x < b.x - b.w / 2 || p.x > b.x + b.w / 2 || p.y < b.y - b.h / 2 || p.y > b.y + b.h / 2) return null;
  const rows = b.rows ?? [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (p.y >= r.y && p.y < r.y + r.h) return r.add ? { i: -1, add: true } : { i, add: false };
  }
  const first = rows[0];
  if (!first || p.y < first.y) return 'title';
  return { i: -1, add: true }; // below the rows (a table taller than its rows): the new attribute
}

/** The gap a dragged row would drop into at diagram y (before attribute g; the count: after the last). */
export function gapAt(b: TableBox | null, y: number): number {
  const rows = (b?.rows ?? []).filter((r) => !r.add);
  const g = rows.findIndex((r) => y < r.y + r.h / 2);
  return g < 0 ? rows.length : g;
}

/** The rows from a to b, both included, in order. */
export function rowRange(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
  return out;
}

/** ⌘-click: the row in or out of the selection. */
export function toggleRow(sel: readonly number[], i: number): number[] {
  return sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b);
}

/** ↑ / ↓ over n rows: the previous / next row (`extend`: added to the selection). */
export function stepRow(sel: readonly number[], n: number, dir: -1 | 1, extend: boolean): number[] {
  const cur = dir < 0 ? sel[0] ?? n : sel[sel.length - 1] ?? -1;
  const next = Math.max(0, Math.min(n - 1, cur + dir));
  return extend ? [...new Set([...sel, next])].sort((a, b) => a - b) : [next];
}

/** ⌥↑ / ⌥↓: the gap the selected rows move to. */
export function stepGap(sel: readonly number[], n: number, dir: -1 | 1): number {
  return dir < 0 ? Math.max(0, sel[0]! - 1) : Math.min(n, sel[sel.length - 1]! + 2);
}

/**
 * Moves rows to the gap before item `gap` (the count: after the last), keeping their order: the new list and where
 * the moved rows are; null when nothing moves.
 */
export function moveRows<T>(old: readonly T[], rows: readonly number[], gap: number): { next: T[]; sel: number[] } | null {
  const moving = new Set(rows);
  const rest = old.filter((_, i) => !moving.has(i));
  const at = old.slice(0, gap).filter((_, i) => !moving.has(i)).length;
  const moved = old.filter((_, i) => moving.has(i));
  const next = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
  if (next.every((a, i) => a === old[i])) return null;
  return { next, sel: moved.map((_, k) => at + k) };
}

/** Deletes rows: what is left, and each old row's name afterwards (null: gone; a name another row still has stays). */
export function deleteRows<T extends { name: string }>(old: readonly T[], rows: readonly number[]): { next: T[]; names: (string | null)[] } {
  const drop = new Set(rows);
  const next = old.filter((_, i) => !drop.has(i));
  const names = old.map((a, i) => (drop.has(i) ? (next.some((x) => x.name === a.name) ? a.name : null) : a.name));
  return { next, names };
}

/** The table's highlights keyed by the new names (`names[i]`: old row i → its new name or null); the title's stays. */
export function renameHighlights(hl: Readonly<Record<string, AttrHighlight>>, old: readonly { name: string }[], names: readonly (string | null)[]): Record<string, AttrHighlight> {
  const next: Record<string, AttrHighlight> = {};
  if (hl['__title']) next['__title'] = hl['__title'];
  old.forEach((a, i) => {
    const n = names[i];
    if (n && hl[a.name] && !next[n]) next[n] = hl[a.name]!;
  });
  return next;
}
