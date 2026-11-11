// History's working copy: the host's history with the document on top while it differs from the newest version
// (read live; the newest version's source is fetched once per id, not on every document change).
import { staticHistory, type StaticVersion } from '../adapters/history.js';
import type { HistoryAdapter, VersionInfo } from '../ports.js';

/** The id of the working copy among the versions. */
export const WORKING_COPY = 'working';

export type HistorySource = HistoryAdapter | readonly StaticVersion[];

/** A history with History's working copy: it can tell the working copy's row without reading the history again. */
export interface WorkingCopyAdapter extends HistoryAdapter {
  workingCopy(): Promise<VersionInfo | null>;
}

export function withWorkingCopy(history: HistorySource, current: () => string, message: string): WorkingCopyAdapter {
  const base = Array.isArray(history) ? staticHistory(history as readonly StaticVersion[]) : (history as HistoryAdapter);
  let newestSource: { id: string; source: Promise<string> } | null = null;
  const sourceOfNewest = (id: string): Promise<string> => {
    if (newestSource?.id !== id) {
      const source = base.load(id);
      const entry = { id, source };
      newestSource = entry;
      source.catch(() => {
        if (newestSource === entry) newestSource = null;
      });
    }
    return newestSource!.source;
  };
  /** The newest saved version of the last first page read (the working copy is compared with it). */
  let newestId: string | undefined;
  const workingRow = async (): Promise<VersionInfo | null> =>
    newestId && (await sourceOfNewest(newestId)) === current() ? null : { id: WORKING_COPY, message, date: new Date().toISOString() };
  const adapter: WorkingCopyAdapter = {
    async list(cursor) {
      const page = await base.list(cursor);
      if (cursor) return page;
      const versions = page.versions.filter((v) => v.id !== WORKING_COPY);
      newestId = versions[0]?.id;
      const working = await workingRow();
      return { ...page, versions: working ? [working, ...versions] : versions };
    },
    // a document change: the working copy's row only, without reading the history again (B10)
    workingCopy: workingRow,
    load: (id) => (id === WORKING_COPY ? Promise.resolve(current()) : base.load(id)),
    ...(base.subscribe ? { subscribe: base.subscribe.bind(base) } : {}),
  };
  return adapter;
}
