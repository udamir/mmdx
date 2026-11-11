// History adapters (diff §8.6): where <mmdx-diff> reads the versions of a diagram. The component never writes
// history; it lists versions (newest first, optionally paged) and loads the source of the ones it shows.
import type { HistoryAdapter, VersionInfo } from '../ports.js';
import { okFetch, pageOf, trimBase, withQuery } from './http.js';

/** A version with its source, for `staticHistory`. */
export type StaticVersion = VersionInfo & { source: string };

/** FNV-1a of a text as 7 hex digits: a stable id for versions without one (pasted text, two plain sources). */
export function contentId(text: string): string {
  let x = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return x.toString(16).padStart(8, '0').slice(0, 7);
}

/** A history held in memory. `versions` may be in any order; they are listed newest first by date when every one has a date, else as given. */
export function staticHistory(versions: readonly StaticVersion[]): HistoryAdapter {
  const list = [...versions];
  if (list.every((v) => v.date && !Number.isNaN(Date.parse(v.date)))) list.sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!));
  const byId = new Map(list.map((v) => [v.id, v.source]));
  return {
    list: async () => ({ versions: list.map(({ source: _s, ...info }) => info) }),
    load: async (id) => {
      const s = byId.get(id);
      if (s === undefined) throw new Error(`Unknown version ${id}`);
      return s;
    },
  };
}

/**
 * A history behind HTTP: `GET url` → `{ versions: VersionInfo[], next? }` (or a plain array), `GET url?cursor=…` for the
 * next page, and `GET url/<id>` → the source text of one version. GitLab / GitHub recipes are in the docs.
 */
export function httpHistoryAdapter(url: string, init: RequestInit = {}): HistoryAdapter {
  const base = trimBase(url);
  const get = (u: string): Promise<Response> => okFetch(u, { credentials: 'same-origin', ...init });
  return {
    async list(cursor) {
      const { items: versions, next } = pageOf((await (await get(withQuery(base, { cursor }))).json()) as unknown, 'versions', isVersion, cleanVersion);
      return next ? { versions, next } : { versions };
    },
    async load(id) {
      return (await get(`${base}/${encodeURIComponent(id)}`)).text();
    },
  };
}

const isVersion = (v: unknown): v is VersionInfo => !!v && typeof v === 'object' && typeof (v as VersionInfo).id === 'string';

/** Keeps only the known string fields of an untrusted version record. */
function cleanVersion(v: VersionInfo): VersionInfo {
  const out: VersionInfo = { id: v.id };
  for (const k of ['message', 'author', 'date', 'url'] as const) if (typeof v[k] === 'string') out[k] = v[k];
  return out;
}
