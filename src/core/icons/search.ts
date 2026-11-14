// Icon search (T04 §4.6) for the picker (T05): icon names (and their words, split at `-`), aliases, the packs'
// category names and keyword lists (the built-in pack ships keywords: `user` → person, account…). Ranked exact >
// prefix > word > fuzzy, then shorter names first. Packs with loaders are searched once loaded (`registry.load`); the
// picker shows the others as chips. The index of a pack is built on its first search and kept with its data.
import type { IconRegistry } from './registry.js';
import type { IconifyJSON } from './types.js';

export interface IconHit {
  /** `pack:icon`. */
  name: string;
  pack: string;
  icon: string;
  score: number;
  /** What matched: the name, an alias, a keyword or a category. */
  via: 'name' | 'alias' | 'keyword' | 'category';
}

export interface SearchOptions {
  /** Only these packs (default: every loaded one). */
  packs?: readonly string[];
  /** At most this many results (default 60). */
  limit?: number;
}

interface Entry {
  icon: string;
  words: string[];
  aliases: string[];
  keywords: string[];
  categories: string[];
  /** The words of each alias and category, split once (P22: per entry per keystroke). */
  aliasWords: string[][];
  categoryWords: string[][];
}

const indexes = new WeakMap<IconifyJSON, Entry[]>();
const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function indexOf(data: IconifyJSON): Entry[] {
  let idx = indexes.get(data);
  if (idx) return idx;
  const byIcon = new Map<string, Entry>();
  for (const [name, icon] of Object.entries(data.icons ?? {})) {
    if (!icon || icon.hidden) continue;
    byIcon.set(name, { icon: name, words: words(name), aliases: [], keywords: [], categories: [], aliasWords: [], categoryWords: [] });
  }
  for (const [alias, a] of Object.entries(data.aliases ?? {})) {
    // an alias (of an alias…) is another name of its icon
    let p: string | undefined = a?.parent;
    for (let d = 0; p && !byIcon.has(p) && d < 8; d++) p = data.aliases?.[p]?.parent;
    const e = p ? byIcon.get(p) : undefined;
    if (e && !a.hidden) e.aliases.push(alias.toLowerCase());
  }
  for (const [icon, kw] of Object.entries(data.keywords ?? {})) {
    const e = byIcon.get(icon);
    if (e && Array.isArray(kw)) e.keywords.push(...kw.map((k) => String(k).toLowerCase()));
  }
  for (const [cat, list] of Object.entries(data.categories ?? {}))
    if (Array.isArray(list)) for (const icon of list) byIcon.get(icon)?.categories.push(cat.toLowerCase());
  idx = [...byIcon.values()];
  for (const e of idx) {
    e.aliasWords = e.aliases.map(words);
    e.categoryWords = e.categories.map(words);
  }
  indexes.set(data, idx);
  return idx;
}

/** `q`'s letters in order inside `s` (a typo-free abbreviation: `dtbs` → `database`). */
const subsequence = (q: string, s: string): boolean => {
  let i = 0;
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true;
  return false;
};

/** How well one query word matches an entry: 4 exact, 3 prefix, 2 a word of it, 1 fuzzy; 0 none. */
function scoreWord(q: string, e: Entry): [number, IconHit['via']] {
  let best: [number, IconHit['via']] = [0, 'name'];
  const take = (s: number, via: IconHit['via']): void => {
    if (s > best[0]) best = [s, via];
  };
  if (e.icon === q) take(4, 'name');
  else if (e.icon.startsWith(q)) take(3, 'name');
  else if (e.words.some((w) => w === q)) take(2.6, 'name');
  else if (e.words.some((w) => w.startsWith(q))) take(2.3, 'name');
  e.aliases.forEach((a, i) => {
    if (a === q) take(3.9, 'alias');
    else if (a.startsWith(q)) take(2.9, 'alias');
    else if (e.aliasWords[i]!.includes(q)) take(2.2, 'alias');
  });
  for (const k of e.keywords) {
    if (k === q) take(2.5, 'keyword');
    else if (k.startsWith(q)) take(2.1, 'keyword');
  }
  e.categories.forEach((c, i) => {
    const cw = e.categoryWords[i]!;
    if (c === q || cw.includes(q)) take(2, 'category');
    else if (cw.some((w) => w.startsWith(q))) take(1.8, 'category');
  });
  if (!best[0] && q.length > 1 && subsequence(q, e.icon)) take(1, 'name');
  return best;
}

/** Icons matching `query` in the loaded packs, best first. Every word of the query must match. */
export function searchIcons(reg: IconRegistry, query: string, o: SearchOptions = {}): IconHit[] {
  const q = words(query);
  if (!q.length) return [];
  const hits: IconHit[] = [];
  for (const pack of o.packs ?? reg.packNames()) {
    const data = reg.packData(pack);
    if (!data) continue;
    for (const e of indexOf(data)) {
      let total = 0, via: IconHit['via'] = 'name';
      for (const w of q) {
        const [s, v] = scoreWord(w, e);
        if (!s) {
          total = 0;
          break;
        }
        if (!total) via = v;
        total += s;
      }
      if (total) hits.push({ name: `${pack}:${e.icon}`, pack, icon: e.icon, score: Math.round((total / q.length) * 100) / 100, via });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.icon.length - b.icon.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return hits.slice(0, o.limit ?? 60);
}
