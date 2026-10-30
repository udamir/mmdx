// DocumentAdapter (§8.2): how the editor loads and saves its document. The host implements it for its backend.

export interface LoadResult {
  source: string;
  name?: string;
  version?: string;
}

export type DocumentSaveResult = { version?: string } | { conflict: { source: string; version: string } };

export interface DocumentAdapter {
  load(): Promise<LoadResult>;
  /** Always `.mmdx` content (§5.1). */
  save(source: string, ctx: { version?: string }): Promise<DocumentSaveResult>;
  /** Live updates from the host (another tab or user). Returns an unsubscribe function. */
  subscribe?(cb: (source: string, version: string) => void): () => void;
}

/** A document held in memory (tests, demos); `conflictOn` simulates a concurrent edit. */
export function memoryDocumentAdapter(initial: string, name = 'diagram'): DocumentAdapter & { readonly current: string; setRemote(src: string): void } {
  let source = initial;
  let version = 1;
  const subs = new Set<(s: string, v: string) => void>();
  return {
    get current() {
      return source;
    },
    async load() {
      return { source, name, version: String(version) };
    },
    async save(src, ctx) {
      if (ctx.version !== undefined && ctx.version !== String(version)) return { conflict: { source, version: String(version) } };
      source = src;
      version++;
      return { version: String(version) };
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    setRemote(src) {
      source = src;
      version++;
      for (const cb of subs) cb(source, String(version));
    },
  };
}

/**
 * Reference HTTP adapter (§11.5): GET loads, PUT saves with If-Match; 412 means someone else saved first.
 */
export function httpDocumentAdapter(url: string, init: { headers?: Record<string, string>; credentials?: RequestCredentials } = {}): DocumentAdapter {
  const credentials = init.credentials ?? 'same-origin';
  const load = async (): Promise<{ source: string; version?: string }> => {
    const r = await fetch(url, { credentials, headers: init.headers ?? {} });
    if (!r.ok) throw new Error(`Load failed: HTTP ${r.status}`);
    const out: { source: string; version?: string } = { source: await r.text() };
    const etag = r.headers.get('ETag');
    if (etag) out.version = etag;
    return out;
  };
  return {
    load,
    async save(source, ctx) {
      const headers: Record<string, string> = { 'Content-Type': 'text/vnd.mermaid; charset=utf-8', ...(init.headers ?? {}) };
      if (ctx.version) headers['If-Match'] = ctx.version;
      const r = await fetch(url, { method: 'PUT', body: source, credentials, headers });
      if (r.status === 412) {
        const cur = await load();
        return { conflict: { source: cur.source, version: cur.version ?? '' } };
      }
      if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
      const etag = r.headers.get('ETag');
      return etag ? { version: etag } : {};
    },
  };
}
