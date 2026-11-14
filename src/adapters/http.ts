// What the HTTP adapters share (X20, 4.12): a fetch that rejects on an error status, a base URL without its trailing
// slashes, query parameters joined onto it, and a page of untrusted records read from either a plain array or
// `{ <field>: [...], next? }`.

/** Fetches `url` and rejects on an error status: `HTTP <status>`, after `what` when given (`Load failed: HTTP 404`). */
export async function okFetch(url: string | URL, init: RequestInit = {}, what?: string): Promise<Response> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${what ? `${what}: ` : ''}HTTP ${r.status}`);
  return r;
}

/** A base URL without its trailing slashes (`url/<id>` is joined onto it). */
export const trimBase = (url: string): string => url.replace(/\/+$/, '');

/** `base` with the set parameters (`?a=1&b=2`, or `&…` after a query it has). */
export function withQuery(base: string, params: Readonly<Record<string, string | undefined>>): string {
  const qs = Object.entries(params).filter((e): e is [string, string] => !!e[1]).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
}

/** The records of a page (`body` a plain array, or `{ [field]: [...], next? }`): the valid ones, cleaned, and the next cursor. */
export function pageOf<T>(body: unknown, field: string, valid: (v: unknown) => v is T, clean: (v: T) => T): { items: T[]; next?: string } {
  const raw = Array.isArray(body) ? body : (body as Record<string, unknown> | null)?.[field];
  const items = (Array.isArray(raw) ? raw : []).filter(valid).map(clean);
  const next = !Array.isArray(body) && typeof (body as { next?: unknown } | null)?.next === 'string' ? (body as { next: string }).next : undefined;
  return next ? { items, next } : { items };
}
