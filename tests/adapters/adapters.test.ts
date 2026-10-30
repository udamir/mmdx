import { describe, expect, it } from 'vitest';
import { memoryDocumentAdapter } from '../../src/adapters/documents.js';
import { localStorageThemeStore, memoryThemeStore } from '../../src/adapters/themes.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';

describe('memoryDocumentAdapter', () => {
  it('detects a conflicting save', async () => {
    const a = memoryDocumentAdapter('flowchart LR\n  a');
    const { version } = await a.load();
    a.setRemote('flowchart LR\n  b');
    const r = await a.save('flowchart LR\n  c', version === undefined ? {} : { version });
    expect('conflict' in r && r.conflict.source).toBe('flowchart LR\n  b');
  });
  it('notifies subscribers of remote changes', async () => {
    const a = memoryDocumentAdapter('x');
    const seen: string[] = [];
    a.subscribe!((s) => seen.push(s));
    a.setRemote('y');
    expect(seen).toEqual(['y']);
  });
});

describe('theme stores', () => {
  it('memory store saves with versions and reports conflicts', async () => {
    const s = memoryThemeStore(BUILTIN_THEMES);
    const list = await s.list();
    expect(list.map((t) => t.id)).toContain('default-light');
    const t = await s.get('default-dark');
    const r1 = await s.save({ ...t, name: 'Dark 2' }, { version: '1' });
    expect('version' in r1 && r1.version).toBe('2');
    const r2 = await s.save({ ...t, name: 'Dark 3' }, { version: '1' });
    expect('conflict' in r2).toBe(true);
  });
  it('local store layers browser edits over a source', async () => {
    const storage = memoryStorage();
    const base = memoryThemeStore(BUILTIN_THEMES);
    const s = localStorageThemeStore(storage, base);
    await s.save({ id: 'mine', name: 'Mine', extends: 'default-light' }, {});
    const ids = (await s.list()).map((t) => t.id);
    expect(ids).toContain('mine');
    expect(ids).toContain('default-light');
    expect((await s.get('mine')).name).toBe('Mine');
    await s.delete!('mine');
    expect((await s.list()).map((t) => t.id)).not.toContain('mine');
  });
});
