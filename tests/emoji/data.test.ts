// The emoji data (T05 §4.5): the generated English set loads as its own chunk, is read into the nine groups, finds
// emoji by name and keywords, and puts skin tones where emojibase does.
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEmoji, searchEmoji, withTone } from '../../src/emoji/data.js';

describe('emoji data', () => {
  it('nine groups, nearly 2000 emoji, under 30 kB gzip', async () => {
    const set = await loadEmoji('en-GB');
    expect(set.locale).toBe('en');
    expect(set.groups.map((g) => g.key)).toEqual(['smileys', 'people', 'animals', 'food', 'travel', 'activities', 'objects', 'symbols', 'flags']);
    expect(set.groups.reduce((n, g) => n + g.items.length, 0)).toBeGreaterThan(1800);
    const raw = readFileSync(join(__dirname, '../../src/emoji/en.json'));
    expect(gzipSync(raw, { level: 9 }).length).toBeLessThan(30 * 1024);
  });

  it('search: names first, then keywords; every word must match', async () => {
    const set = await loadEmoji();
    expect(searchEmoji(set, 'rocket')[0]!.e).toBe('🚀');
    expect(searchEmoji(set, 'thumbs up')[0]!.name).toBe('thumbs up');
    expect(searchEmoji(set, 'happy').length).toBeGreaterThan(3);
    expect(searchEmoji(set, '')).toEqual([]);
  });

  it('skin tones after the first code point, as emojibase writes them', async () => {
    const set = await loadEmoji();
    const wave = set.groups[1]!.items.find((x) => x.name === 'waving hand')!;
    expect(wave.tones).toBe(true);
    expect(withTone(wave.e, 5)).toBe('👋🏿');
    expect(withTone('☝️', 1)).toBe('☝🏻');
    expect(withTone(wave.e, 0)).toBe('👋');
    expect(withTone('😀', 2, false)).toBe('😀');
  });
});
