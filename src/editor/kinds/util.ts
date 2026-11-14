// Helpers the edit kinds share (X17): a label on one line, the innermost group under a point, the newest connector between two items.
import type { Point } from '../../core/types.js';

/** A label on one line (a describe() title). */
export const oneLine = (s: string): string => s.replace(/\n/g, ' ');

/** The innermost (smallest) visible group box around a point, by id (a dropped item joins it); null: none. */
export function innermostAt(groups: ReadonlyMap<string, { x: number; y: number; w: number; h: number; hidden?: boolean }>, pt: Point): string | null {
  let best: { id: string; a: number } | null = null;
  for (const [id, b] of groups) {
    if (b.hidden || !Number.isFinite(b.x)) continue;
    if (Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2 && (!best || b.w * b.h < best.a)) best = { id, a: b.w * b.h };
  }
  return best?.id ?? null;
}

/** The newest connector from `from` to `to` (the last written: a connect or a reconnect just added it). */
export function newestBetween<T extends { from: string; to: string }>(list: readonly T[], from: string | undefined, to: string | undefined): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.from === from && list[i]!.to === to) return list[i];
  return undefined;
}
