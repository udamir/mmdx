// History adapters (diff §8.6): where <mmdx-diff> reads the versions of a diagram. The component never writes
// history; it lists versions (newest first, optionally paged) and loads the source of the ones it shows.
import type { VersionInfo } from '../core/diff/report.js';

export type { VersionInfo };

export interface HistoryAdapter {
  /** Newest first. May page: pass `next` from the previous page as `cursor`. */
  list(cursor?: string): Promise<{ versions: VersionInfo[]; next?: string }>;
  /** The source of one version (untrusted: validated like any source). */
  load(id: string): Promise<string>;
  /** Calls `cb` when the history changed (a new version was saved); returns an unsubscribe. */
  subscribe?(cb: () => void): () => void;
}

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
  const base = url.replace(/\/+$/, '');
  const get = async (u: string): Promise<Response> => {
    const r = await fetch(u, { credentials: 'same-origin', ...init });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  };
  return {
    async list(cursor) {
      const u = cursor ? `${base}${base.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : base;
      const body = (await (await get(u)).json()) as unknown;
      const raw = Array.isArray(body) ? body : (body as { versions?: unknown }).versions;
      const versions = (Array.isArray(raw) ? raw : []).filter(isVersion).map(cleanVersion);
      const next = !Array.isArray(body) && typeof (body as { next?: unknown }).next === 'string' ? (body as { next: string }).next : undefined;
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
