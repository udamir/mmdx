// The History session facade (component architecture §8.3): what `editor.historySession` / `viewer.historySession`
// return while History is open — the `<mmdx-diff>` methods over the session History shows.
// The contract types live here, not in diff/ (A6): the kernel holds a session, the diff implements it.
import type { DiffView } from '../core/diff/annotate.js';
import type { ChangeFacet, DiagramDiff as DiffResult } from '../core/diff/types.js';

export type DiffViewName = DiffView | 'side';
export type DiffFilter = 'added' | 'removed' | ChangeFacet;
export type DiffExportKind = 'svg' | 'png' | 'mmdx' | 'mmd' | 'diff' | 'json' | 'md';

export interface DiffExportOptions {
  /** The view of an image (default: the current one). */
  view?: DiffViewName;
  /** Which version a source export writes (default: after, or the viewed one in History mode). */
  version?: 'before' | 'after' | 'viewed';
  highlights?: boolean;
  legend?: boolean;
  /** PNG scale (1–4, default 2). */
  scale?: number;
  scheme?: 'light' | 'dark';
  /** Reports and patches with the filters applied (default true). */
  filtered?: boolean;
}

/** The two compared versions and the shown one (`viewing` only while one version is viewed as it is). */
export interface DiffPair {
  base: string | null;
  head: string | null;
  viewing: string | null;
}

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

/**
 * What a product that edits its document offers History (A7: an explicit port instead of probing actions): its own
 * scene for a version, a Restore and an item clipboard. A product without one (the viewer) gets History's own scene.
 */
export interface HistoryHost {
  /**
   * Shows a version of the document read-only in the host's own scene, drawn as the document is (History's version
   * view), or the document again (null). Nothing writes the document while a version shows.
   */
  showVersion(version: { id: string; source: string } | null): void;
  /** Opens a version in the document as one undoable change (History's Restore). */
  restoreVersion?(source: string, version: { id: string }): void;
  /** Puts copied items on the host's item clipboard (copying from History). */
  setClipboard?(data: unknown): void;
}
