// What the HTTP adapters share (X20, 4.12): the error-status fetch, the base URL and query joining, a page of
// untrusted records from either shape, the subscriber set, base64 of bytes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { okFetch, pageOf, trimBase, withQuery } from '../../src/adapters/http.js';
import { createSubscribers } from '../../src/adapters/subscribers.js';
import { toBase64 } from '../../src/dom/base64.js';

afterEach(() => vi.unstubAllGlobals());

describe('adapters/http', () => {
  it('okFetch rejects on an error status, named after what failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => new Response('x', { status: u.endsWith('missing') ? 404 : 200 })));
    expect(await (await okFetch('/a')).text()).toBe('x');
    await expect(okFetch('/missing')).rejects.toThrow('HTTP 404');
    await expect(okFetch('/missing', {}, 'Load failed')).rejects.toThrow('Load failed: HTTP 404');
  });

  it('joins a base and its query', () => {
    expect(trimBase('https://h/api//')).toBe('https://h/api');
    expect(withQuery('https://h/api', {})).toBe('https://h/api');
    expect(withQuery('https://h/api', { cursor: 'a b', query: undefined })).toBe('https://h/api?cursor=a%20b');
    expect(withQuery('https://h/api?x=1', { cursor: '2', query: 'q' })).toBe('https://h/api?x=1&cursor=2&query=q');
  });

  it('reads a page from a plain array or { field, next }, keeping the valid records, cleaned', () => {
    const valid = (v: unknown): v is { id: string } => !!v && typeof (v as { id?: unknown }).id === 'string';
    const clean = (v: { id: string }): { id: string } => ({ id: v.id });
    expect(pageOf([{ id: 'a', extra: 1 }, 3, null], 'versions', valid, clean)).toEqual({ items: [{ id: 'a' }] });
    expect(pageOf({ versions: [{ id: 'b' }], next: 'c2' }, 'versions', valid, clean)).toEqual({ items: [{ id: 'b' }], next: 'c2' });
    expect(pageOf({ other: [] , next: 5 }, 'versions', valid, clean)).toEqual({ items: [] });
    expect(pageOf(null, 'versions', valid, clean)).toEqual({ items: [] });
  });
});

describe('createSubscribers', () => {
  it('adds, notifies with arguments, and removes', () => {
    const subs = createSubscribers<[string]>();
    const got: string[] = [];
    const off = subs.add((s) => got.push(`a:${s}`));
    // one that unsubscribes while notified does not make the next one miss the call
    const offB = subs.add((s) => {
      got.push(`b:${s}`);
      offB();
    });
    subs.add((s) => got.push(`c:${s}`));
    subs.notify('1');
    off();
    subs.notify('2');
    expect(got).toEqual(['a:1', 'b:1', 'c:1', 'c:2']);
    expect(subs.size).toBe(1);
  });
});

describe('toBase64', () => {
  it('encodes bytes, also past one chunk', () => {
    expect(toBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=');
    const big = new Uint8Array(0x8000 * 2 + 3).fill(65);
    expect(atob(toBase64(big.buffer))).toBe('A'.repeat(big.length));
  });
});
