// DiffSession's parts (A13c): one `shown` model (nothing, a version as it is, a comparison) that the exports name
// their files and pick their content by, and the VersionStore that holds the versions, their sources and counts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StaticVersion } from '../../src/adapters/history.js';
import { createContext } from '../../src/core/context.js';
import { DiffSession } from '../../src/diff/session.js';
import { VersionStore } from '../../src/diff/version-store.js';
import { staticHistory } from '../../src/adapters/history.js';

const history = (id: string): StaticVersion[] => JSON.parse(readFileSync(`examples/history/${id}.json`, 'utf8')).versions;

function session(): { s: DiffSession; exports: { name: string; data: unknown }[] } {
  const exports: { name: string; data: unknown }[] = [];
  const s = new DiffSession({
    ctx: createContext(), t: (k) => k, renderOptions: () => ({ theme: 'baseline' }), scheme: () => 'light', name: () => 'doc',
    emit: (type, detail) => {
      if (type === 'mmdx-export') exports.push(detail as { name: string; data: unknown });
      // the host takes the export (no download)
      return type !== 'mmdx-export';
    },
  });
  return { s, exports };
}

describe('DiffSession shown', () => {
  it('is nothing, the compared pair, or the viewed version — and the exports follow it', async () => {
    const versions = history('docker-deploy-sequence');
    const { s, exports } = session();
    expect(s.shown.peek()).toEqual({ kind: 'none' });
    await s.load({ history: versions });
    expect(s.shown.peek()).toEqual({ kind: 'compare', base: versions[1]!.id, head: versions[0]!.id });
    await s.exportAs('mmdx');
    expect(exports.at(-1)).toMatchObject({ name: `doc-${versions[0]!.id}.mmdx`, data: versions[0]!.source });

    s.viewVersion(versions[2]!.id);
    expect(s.shown.peek()).toEqual({ kind: 'version', id: versions[2]!.id });
    await s.refresh();
    await s.exportAs('mmdx');
    expect(exports.at(-1)).toMatchObject({ name: `doc-${versions[2]!.id}.mmdx`, data: versions[2]!.source });
    await s.exportAs('svg');
    expect(exports.at(-1)!.name).toBe(`doc-${versions[2]!.id}.svg`);
    // the comparison's ends stay what Before and After export
    await s.exportAs('mmdx', { version: 'before' });
    expect(exports.at(-1)).toMatchObject({ name: `doc-${versions[1]!.id}.mmdx`, data: versions[1]!.source });

    s.setMode('compare');
    expect(s.shown.peek().kind).toBe('compare');
    s.destroy();
  });
});

describe('VersionStore', () => {
  it('reads pages, keeps sources per load, and forgets one changed version alone', async () => {
    const versions = history('docker-deploy-sequence');
    let gen = 1, reads = 0;
    const store = new VersionStore({ gen: () => gen, destroyed: () => false, shows: () => false, loadError: () => {} });
    const base = staticHistory(versions);
    store.adapter = { ...base, load: (id) => (reads++, base.load(id)) };
    const page = await store.adapter.list();
    store.setPage(page.versions, page.next);
    expect(store.versions.peek().map((v) => v.id)).toEqual(versions.map((v) => v.id));
    expect(store.hasMore.peek()).toBe(false);
    const a = versions[0]!.id, b = versions[1]!.id;
    expect(await store.sourceOf(a)).toBe(versions[0]!.source);
    await store.sourceOf(a);
    await store.sourceOf(b);
    expect(reads).toBe(2);
    store.forget(a);
    await store.sourceOf(a);
    await store.sourceOf(b);
    expect(reads).toBe(3);
    // a new load: every source is read again
    gen++;
    store.reset();
    await store.sourceOf(b);
    expect(reads).toBe(4);
    store.destroy();
  });
});
