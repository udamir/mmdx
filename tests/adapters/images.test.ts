import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpImageStore, memoryImageStore } from '../../src/adapters/images.js';

describe('image stores', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('memoryImageStore lists newest first, pages, filters by name, puts, gets, deletes and tells subscribers', async () => {
    const s = memoryImageStore([
      { id: 'a', url: 'https://x/a.png', name: 'cat.png' },
      { id: 'b', url: 'https://x/b.png', name: 'dog.png' },
      { id: 'c', url: 'https://x/c.png', name: 'Cat-2.png' },
    ], { pageSize: 2 });
    const first = await s.list();
    expect(first.images.map((i) => i.id)).toEqual(['a', 'b']);
    expect(first.next).toBe('2');
    expect((await s.list({ cursor: first.next! })).images.map((i) => i.id)).toEqual(['c']);
    expect((await s.list({ query: 'cat' })).images.map((i) => i.id)).toEqual(['a', 'c']);
    const changed = vi.fn();
    const off = s.subscribe!(changed);
    const put = await s.put(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(put).toMatchObject({ id: 'img-4', name: 'logo.svg', type: 'image/svg+xml', size: 6 });
    // a data: URL of the file by default (the image policy must allow data: for it)
    expect(put.url).toBe(`data:image/svg+xml;base64,${btoa('<svg/>')}`);
    expect((await s.list()).images[0]!.id).toBe('img-4');
    expect(await s.get('img-4')).toBe(put);
    await expect(s.get('zzz')).rejects.toThrow('Unknown image zzz');
    await s.delete!('a');
    expect(changed).toHaveBeenCalledTimes(2);
    off();
    await s.delete!('b');
    expect(changed).toHaveBeenCalledTimes(2);
    expect((await s.list()).images.map((i) => i.id)).toEqual(['img-4', 'c']);
  });

  it('memoryImageStore takes the URL a put file is referenced by', async () => {
    const s = memoryImageStore([], { url: (_f, id) => `asset:${id}` });
    expect((await s.put(new Blob(['x'], { type: 'image/png' }), { name: 'x.png' })).url).toBe('asset:img-1');
  });

  it('httpImageStore lists with a cursor and a query, gets, posts a form, deletes and keeps only the known fields', async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    vi.stubGlobal('fetch', async (u: string, init: RequestInit = {}) => {
      calls.push({ url: u, method: init.method ?? 'GET', body: init.body });
      if (init.method === 'POST') return Response.json({ id: 'n', url: 'https://cdn/n.png', name: 'n.png', w: 10, evil: '<x>' });
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      if (u.endsWith('/p1')) return Response.json({ id: 'p1', url: 'https://cdn/p1.png', size: 12 });
      if (u.endsWith('/bad')) return Response.json({ id: 'bad' });
      if (u.endsWith('/gone')) return new Response('', { status: 404 });
      return Response.json(u.includes('cursor=') ? [{ id: 'p0', url: 'https://cdn/p0.png' }] : { images: [{ id: 'p1', url: 'https://cdn/p1.png', thumb: 'https://cdn/p1-t.png', w: 'wide', onclick: 'x' }, { nope: 1 }], next: 'n2' });
    });
    const s = httpImageStore('/api/images/');
    const page = await s.list();
    expect(page).toEqual({ images: [{ id: 'p1', url: 'https://cdn/p1.png', thumb: 'https://cdn/p1-t.png' }], next: 'n2' });
    expect((await s.list({ cursor: 'n2', query: 'a b' })).images).toEqual([{ id: 'p0', url: 'https://cdn/p0.png' }]);
    expect(await s.get('p1')).toEqual({ id: 'p1', url: 'https://cdn/p1.png', size: 12 });
    await expect(s.get('bad')).rejects.toThrow('Not an image record');
    await expect(s.get('gone')).rejects.toThrow('HTTP 404');
    expect(await s.put(new File(['x'], 'n.png', { type: 'image/png' }))).toEqual({ id: 'n', url: 'https://cdn/n.png', name: 'n.png', w: 10 });
    await s.delete!('p 1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/images', 'GET /api/images?cursor=n2&query=a%20b', 'GET /api/images/p1', 'GET /api/images/bad', 'GET /api/images/gone',
      'POST /api/images', 'DELETE /api/images/p%201',
    ]);
    const form = calls.find((c) => c.method === 'POST')!.body as FormData;
    expect((form.get('file') as File).name).toBe('n.png');
    expect(form.get('name')).toBe('n.png');
  });
});
