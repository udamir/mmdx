// The History session facade (component architecture §8.3): what `editor.historySession` / `viewer.historySession`
// return while History is open — the `<mmdx-diff>` methods over the session History shows.
import type { DiagramDiff as DiffResult } from '../core/diff/types.js';
import type { DiffExportKind, DiffExportOptions, DiffFilter, DiffPair, DiffViewName } from '../diff/session.js';
import type { ViewCore } from './core.js';

export interface HistorySession {
  setPair(base: string, head: string): void;
  viewVersion(id: string): void;
  setView(view: DiffViewName): void;
  setFilters(filters: readonly DiffFilter[], dim?: boolean): void;
  select(key: string | null): void;
  next(): void;
  prev(): void;
  readonly pair: DiffPair;
  getDiff(): DiffResult | null;
  exportAs(kind: DiffExportKind, opts?: DiffExportOptions): Promise<void>;
  /** Leaves History. */
  close(): void;
}

/** Opens the `history` stage on a component (src/diff/history.ts); `onClose` runs when it is left. */
export type HistoryOpener = (core: ViewCore, o: { onClose(): void }) => { close(): void };

/** Loads the History code on first use (`() => import('…/diff/history.js')`): the kernel never imports the diff. */
export type HistoryLoader = () => Promise<{ openHistory: HistoryOpener }>;
