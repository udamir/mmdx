// Image stores: where the editor's image tool finds the host's pictures (its Library tab) and puts the files it uploads
// (its Upload tab, a picture pasted or dropped on the canvas). The editor never embeds a file: a picture is referenced
// by its record's `url` — a URL, or a host reference the `resolveUrl` hook maps to one — and the image policy checks it
// as any image URL.
import type { ImageInfo, ImageStore } from '../ports.js';
import { toBase64 } from '../dom/base64.js';
import { okFetch, pageOf, trimBase, withQuery } from './http.js';
import { createSubscribers } from './subscribers.js';

/** A `data:` URL of a blob (the memory store's pictures). */
async function dataUrl(blob: Blob): Promise<string> {
  return `data:${blob.type || 'application/octet-stream'};base64,${toBase64(await blob.arrayBuffer())}`;
}

export interface MemoryImageStoreOptions {
  /** The URL a put file is referenced by (default: a `data:` URL of it, which the image policy must allow: `protocols` with `data:`). */
  url?: (file: Blob, id: string) => string | Promise<string>;
  /** Page size of `list` (default 50). */
  pageSize?: number;
}

/** An image store held in memory: `initial` pictures (newest first), files put are added in front. */
export function memoryImageStore(initial: readonly ImageInfo[] = [], o: MemoryImageStoreOptions = {}): ImageStore {
  const images = [...initial];
  const subs = createSubscribers();
  const size = Math.max(1, o.pageSize ?? 50);
  let n = images.length;
  const changed = (): void => subs.notify();
  return {
    async list({ cursor, query } = {}) {
      const q = query?.trim().toLowerCase();
      const all = q ? images.filter((i) => (i.name ?? i.id).toLowerCase().includes(q)) : images;
      const from = cursor ? Math.max(0, Number(cursor) || 0) : 0;
      const page = all.slice(from, from + size);
      return from + size < all.length ? { images: page, next: String(from + size) } : { images: page };
    },
    async get(id) {
      const img = images.find((i) => i.id === id);
      if (!img) throw new Error(`Unknown image ${id}`);
      return img;
    },
    async put(file, opt = {}) {
      const id = `img-${++n}`;
      const name = opt.name ?? (file instanceof File ? file.name : id);
      const info: ImageInfo = { id, url: await (o.url ?? dataUrl)(file, id), name, size: file.size, date: new Date().toISOString() };
      if (file.type) info.type = file.type;
      images.unshift(info);
      changed();
      return info;
    },
    async delete(id) {
      const i = images.findIndex((x) => x.id === id);
      if (i >= 0) images.splice(i, 1), changed();
    },
    subscribe: (cb) => subs.add(cb),
  };
}

/**
 * An image store behind HTTP: `GET url` → `{ images: ImageInfo[], next? }` (or a plain array), with `?cursor=…` for the
 * next page and `?query=…` to filter; `GET url/<id>` → one record; `POST url` with a multipart form (`file`, `name`) →
 * the stored picture's record; `DELETE url/<id>`.
 */
export function httpImageStore(url: string, init: RequestInit = {}): ImageStore {
  const base = trimBase(url);
  const call = (u: string, more: RequestInit = {}): Promise<Response> => okFetch(u, { credentials: 'same-origin', ...init, ...more });
  const one = async (r: Response): Promise<ImageInfo> => {
    const v = (await r.json()) as unknown;
    if (!isImage(v)) throw new Error('Not an image record');
    return cleanImage(v);
  };
  return {
    async list({ cursor, query } = {}) {
      const { items: images, next } = pageOf((await (await call(withQuery(base, { cursor, query }))).json()) as unknown, 'images', isImage, cleanImage);
      return next ? { images, next } : { images };
    },
    async get(id) {
      return one(await call(`${base}/${encodeURIComponent(id)}`));
    },
    async put(file, o = {}) {
      const form = new FormData();
      const name = o.name ?? (file instanceof File ? file.name : 'image');
      form.append('file', file, name);
      form.append('name', name);
      return one(await call(base, { method: 'POST', body: form }));
    },
    async delete(id) {
      await call(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

const isImage = (v: unknown): v is ImageInfo => !!v && typeof v === 'object' && typeof (v as ImageInfo).id === 'string' && typeof (v as ImageInfo).url === 'string';

/** Keeps only the known fields of an untrusted image record. */
function cleanImage(v: ImageInfo): ImageInfo {
  const out: ImageInfo = { id: v.id, url: v.url };
  for (const k of ['thumb', 'name', 'type', 'date'] as const) if (typeof v[k] === 'string') out[k] = v[k];
  for (const k of ['w', 'h', 'size'] as const) if (typeof v[k] === 'number' && Number.isFinite(v[k])) out[k] = v[k];
  return out;
}
