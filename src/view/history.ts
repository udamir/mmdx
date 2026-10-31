// The History session facade (component architecture §8.3): what `editor.historySession` / `viewer.historySession`
// return while History is open — the `<mmdx-diff>` methods over the session History shows.
import type { DiagramDiff as DiffResult } from '../core/diff/index.js';

export interface HistorySession {
  setPair(base: string, head: string): void;
  viewVersion(id: string): void;
  setView(view: 'before' | 'merged' | 'after' | 'side'): void;
  setFilters(filters: readonly ('added' | 'removed' | 'content' | 'layout' | 'style')[], dim?: boolean): void;
  select(key: string | null): void;
  next(): void;
  prev(): void;
  readonly pair: { base: string | null; head: string | null; viewing: string | null };
  getDiff(): DiffResult | null;
  exportAs(kind: 'svg' | 'png' | 'mmdx' | 'mmd' | 'diff' | 'json' | 'md', opts?: Record<string, unknown>): Promise<void>;
  /** Leaves History. */
  close(): void;
}
