// Build step (T05 §4.5): the emoji picker's data. Reads emojibase's compact data (`emojibase-data`, MIT; the licence
// is in THIRD-PARTY-NOTICES) and writes src/emoji/<locale>.json per locale: the picker's nine groups in order, each one
// string of `emoji|CLDR short name|keywords` entries separated by `;` (a compact form that gzips to under 30 kB for
// English): at most five keywords, space-separated, without those the name's own words already find. A leading `~`
// marks an emoji that takes skin tones: the picker inserts the tone modifier after the first code point, which this
// script checks against emojibase's own tone variants (an emoji whose variants are written otherwise, such as couples,
// gets no mark). The files are committed and load as lazy chunks (src/emoji/data.ts); run
// `node tools/build-emoji.mjs [locale…]` after upgrading the package (default: every UI language mmdx ships, today `en`).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const DATA = dirname(require.resolve('emojibase-data/package.json'));

/** emojibase's groups → the picker's, in its order (2: skin tone and hair components, not offered). */
const GROUPS = [[0, 'smileys'], [1, 'people'], [3, 'animals'], [4, 'food'], [5, 'travel'], [6, 'activities'], [7, 'objects'], [8, 'symbols'], [9, 'flags']];
const TONES = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const plain = (s) => s.replace(/️/g, '');
/** The picker's rule (src/emoji/data.ts `withTone`): the modifier after the first code point. */
const withTone = (e, tone) => {
  const cps = [...e];
  const rest = cps.slice(1).join('').replace(/^️/, '');
  return cps[0] + tone + rest;
};

const fail = (msg) => {
  console.error(`build-emoji: ${msg}`);
  process.exit(1);
};
const MAX_KEYWORDS = 5;

const locales = process.argv.slice(2).length ? process.argv.slice(2) : ['en'];
for (const locale of locales) {
  const list = JSON.parse(readFileSync(join(DATA, locale, 'compact.json'), 'utf8'));
  const groupIndex = new Map(GROUPS.map(([g], i) => [g, i]));
  const out = GROUPS.map(() => []);
  let n = 0, toned = 0;
  for (const e of [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const gi = groupIndex.get(e.group);
    if (gi === undefined || !e.unicode) continue;
    const name = e.label;
    // a keyword the search finds through the name anyway (a word of it, or its prefix) is left out
    const own = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const keywords = [...new Set((e.tags ?? []).map((t) => t.toLowerCase()))]
      .filter((k) => k && !own.some((w) => w.startsWith(k) || (w.length > 3 && k.startsWith(w))))
      .slice(0, MAX_KEYWORDS);
    for (const f of [e.unicode, name, ...keywords]) if (/[|;~]/.test(f)) fail(`${locale}: "${f}" holds a separator`);
    const skins = e.skins ?? [];
    const tone = skins.length === TONES.length && TONES.every((t) => skins.some((s) => plain(s.unicode) === plain(withTone(e.unicode, t))));
    if (tone) toned++;
    n++;
    out[gi].push(`${tone ? '~' : ''}${e.unicode}|${name}|${keywords.join(' ')}`);
  }
  const json = JSON.stringify(Object.fromEntries(GROUPS.map(([, k], i) => [k, out[i].join(';')])));
  writeFileSync(join(ROOT, 'src/emoji', `${locale}.json`), json + '\n');
  console.log(`build-emoji: ${locale}: ${n} emoji, ${toned} with skin tones, ${(json.length / 1024).toFixed(1)} kB, ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(1)} kB gzip`);
}
