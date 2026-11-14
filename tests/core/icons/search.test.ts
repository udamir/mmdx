// Icon search (T04.5): names, words of names, aliases, keywords and categories, ranked exact > prefix > word > fuzzy;
// packs with loaders are searched once loaded.
import { describe, expect, it } from 'vitest';
import { createIconRegistry } from '../../../src/core/icons/index.js';
import { searchIcons } from '../../../src/core/icons/search.js';
import type { IconifyJSON } from '../../../src/core/icons/types.js';

const P = '<path d="M0 0"/>';
const pack: IconifyJSON = {
  prefix: 'p',
  icons: { user: { body: P }, users: { body: P }, 'user-circle': { body: P }, 'brand-superuser': { body: P }, database: { body: P }, 'old-db': { body: P, hidden: true }, server: { body: P } },
  aliases: { person: { parent: 'user' }, account: { parent: 'person' }, gone: { parent: 'old-db', hidden: true } },
  keywords: { database: ['db', 'storage', 'sql'], server: ['host', 'backend'] },
  categories: { People: ['user', 'users', 'user-circle'], 'Data and storage': ['database'] },
};
const reg = createIconRegistry([{ name: 'p', icons: pack }], { builtin: false });
const names = (q: string, o?: Parameters<typeof searchIcons>[2]): string[] => searchIcons(reg, q, o).map((h) => h.icon);

describe('searchIcons', () => {
  it('ranks exact > prefix > word > fuzzy, shorter names first', () => {
    expect(names('user')).toEqual(['user', 'users', 'user-circle', 'brand-superuser']);
    expect(searchIcons(reg, 'user')[0]).toMatchObject({ name: 'p:user', pack: 'p', score: 4, via: 'name' });
    expect(names('circle')).toEqual(['user-circle']);
    expect(names('dtbs')).toEqual(['database']);
  });

  it('finds aliases (of aliases), keywords and categories, and never hidden icons', () => {
    expect(searchIcons(reg, 'account')[0]).toMatchObject({ icon: 'user', via: 'alias' });
    expect(searchIcons(reg, 'sql')[0]).toMatchObject({ icon: 'database', via: 'keyword' });
    expect(searchIcons(reg, 'backend')[0]).toMatchObject({ icon: 'server', via: 'keyword' });
    expect(names('people')).toEqual(['user', 'users', 'user-circle']);
    expect(names('storage')).toEqual(['database']);
    expect(names('old')).toEqual([]);
    expect(names('gone')).toEqual([]);
  });

  it('every word of the query must match; limit and packs', () => {
    expect(names('user circle')).toEqual(['user-circle']);
    expect(names('user zebra')).toEqual([]);
    expect(names('user', { limit: 2 })).toEqual(['user', 'users']);
    expect(names('user', { packs: ['other'] })).toEqual([]);
    expect(names('  ')).toEqual([]);
  });

  it('searches packs with loaders once loaded; the built-in set ships keywords', async () => {
    const r = createIconRegistry([{ name: 'late', loader: async () => pack }]);
    expect(searchIcons(r, 'database')).toEqual([]);
    await r.load('late');
    await r.load('tabler');
    expect(searchIcons(r, 'database').map((h) => h.name).slice(0, 4)).toEqual(['late:database', 'tabler:database', 'tabler:database-export', 'tabler:database-import']);
    const person = searchIcons(r, 'person', { packs: ['tabler'] });
    expect(person.slice(0, 3).map((h) => h.icon)).toContain('user');
    expect(person[0]!.via).toBe('keyword');
    expect(searchIcons(r, 'devices', { packs: ['tabler'] }).length).toBeGreaterThan(10);
  });
});
