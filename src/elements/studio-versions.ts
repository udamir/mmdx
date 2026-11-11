// The studio's versions (5.6, R8): the open document's own versions, saved in the studio's storage (newest first, the
// same source twice in a row is one version), and an example's bundled history (its history file, fetched once) — the
// History the editor shows for it.
import { contentId, type StaticVersion } from '../adapters/history.js';
import type { HistoryAdapter, StorageAdapter } from '../ports.js';

const VERSIONS_KEY = 'studio.versions';
const MAX_VERSIONS = 30;

/** What the studio knows of an example's history: its file. */
export interface ExampleHistory {
  id: string;
  history?: string;
}

export class StudioVersions {
  /** The open document's key (`file:<name>`, `example:<id>`): its versions are saved under it. */
  key = 'file:diagram';
  /** The open example's bundled history, newest first (empty for other documents). */
  bundled: StaticVersion[] = [];
  private readonly histories = new Map<string, Promise<StaticVersion[]>>();

  /** `changed`: a version was recorded (the editor's History follows). */
  constructor(private readonly storage: StorageAdapter, private readonly changed: () => void) {}

  /** An example's history file (fetched once), newest first; empty when it has none or it cannot be read. */
  fetchHistory(ex: ExampleHistory): Promise<StaticVersion[]> {
    if (!ex.history) return Promise.resolve([]);
    let p = this.histories.get(ex.history);
    if (!p) {
      p = fetch(ex.history).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const m = (await r.json()) as { versions?: unknown };
        return (Array.isArray(m.versions) ? m.versions : []).filter((v): v is StaticVersion =>
          !!v && typeof v === 'object' && typeof (v as StaticVersion).id === 'string' && typeof (v as StaticVersion).source === 'string');
      }).catch(() => []);
      this.histories.set(ex.history, p);
    }
    return p;
  }

  /** Loads the open example's bundled history (when the open document is an example that has one). */
  async loadBundled(examples: readonly ExampleHistory[], alive: () => boolean): Promise<void> {
    const key = this.key;
    const ex = key.startsWith('example:') ? examples.find((e) => `example:${e.id}` === key) : undefined;
    if (!ex) return;
    const list = await this.fetchHistory(ex);
    if (alive() && key === this.key) this.bundled = list;
  }

  /** The versions saved here for the open document, newest first. */
  saved(): StaticVersion[] {
    const all = this.storage.get<Record<string, StaticVersion[]>>(VERSIONS_KEY) ?? {};
    const list = all[this.key];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === 'string' && typeof v.source === 'string') : [];
  }

  /** The open document has a version (saved or bundled): the editor shows History. */
  get any(): boolean {
    return this.saved().length > 0 || this.bundled.length > 0;
  }

  /** Records a version of the open document; false when it is the newest one already. */
  record(src: string, message: string): boolean {
    const list = this.saved();
    const newest = list[0]?.source ?? this.bundled[0]?.source;
    if (newest === src) return false;
    const all = this.storage.get<Record<string, StaticVersion[]>>(VERSIONS_KEY) ?? {};
    const v: StaticVersion = { id: contentId(`${Date.now()}\n${src}`), message, author: 'You', date: new Date().toISOString(), source: src };
    all[this.key] = [v, ...list].slice(0, MAX_VERSIONS);
    this.storage.set(VERSIONS_KEY, all);
    this.changed();
    return true;
  }

  /** The open document's versions, newest first: the ones saved here, then the example's bundled history. */
  adapter(): HistoryAdapter {
    const all = (): StaticVersion[] => [...this.saved(), ...this.bundled];
    return {
      list: async () => ({ versions: all().map(({ source: _s, ...v }) => v) }),
      load: async (id) => {
        const v = all().find((x) => x.id === id);
        if (!v) throw new Error(`Unknown version ${id}`);
        return v.source;
      },
    };
  }
}
