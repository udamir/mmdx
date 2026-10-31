import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentId, httpHistoryAdapter, staticHistory } from '../../src/adapters/history.js';

describe('history adapters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('staticHistory lists newest first by date and loads sources', async () => {
    const h = staticHistory([
      { id: 'a', message: 'one', date: '2026-01-01T00:00:00Z', source: 'flowchart LR\n  a' },
      { id: 'b', message: 'two', date: '2026-02-01T00:00:00Z', source: 'flowchart LR\n  b' },
    ]);
    expect((await h.list()).versions.map((v) => v.id)).toEqual(['b', 'a']);
    expect((await h.list()).versions[0]).not.toHaveProperty('source');
    expect(await h.load('a')).toBe('flowchart LR\n  a');
    await expect(h.load('zzz')).rejects.toThrow();
  });

  it('httpHistoryAdapter pages and keeps only the known fields', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(u);
      if (u.endsWith('/v1')) return new Response('flowchart LR\n  a');
      return Response.json(u.includes('cursor=') ? [{ id: 'v0' }] : { versions: [{ id: 'v1', message: 'm', evil: '<x>' }, { nope: 1 }], next: 'p2' });
    });
    const h = httpHistoryAdapter('/api/versions');
    const page = await h.list();
    expect(page).toEqual({ versions: [{ id: 'v1', message: 'm' }], next: 'p2' });
    expect((await h.list(page.next)).versions).toEqual([{ id: 'v0' }]);
    expect(await h.load('v1')).toBe('flowchart LR\n  a');
    expect(calls).toEqual(['/api/versions', '/api/versions?cursor=p2', '/api/versions/v1']);
  });

  it('contentId is a stable 7-digit hash', () => {
    expect(contentId('abc')).toMatch(/^[0-9a-f]{7}$/);
    expect(contentId('abc')).toBe(contentId('abc'));
    expect(contentId('abc')).not.toBe(contentId('abd'));
  });
});
