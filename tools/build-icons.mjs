// Build step (T04 §4.7): the built-in icon set. Reads the curated list (tools/icons/builtin.txt: groups, names and
// search keywords) and the Font Awesome look-alikes (tools/icons/fa-fallback.txt), takes the icons from
// `@iconify-json/tabler` (MIT; the licence is in THIRD-PARTY-NOTICES) and writes src/icons/builtin.json (an Iconify
// JSON pack under Tabler's own prefix, with `categories` and `keywords`) and src/icons/fa-fallback.json. Both are
// committed; run `node tools/build-icons.mjs` after changing a list or upgrading the Tabler package.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const TABLER = dirname(require.resolve('@iconify-json/tabler/icons.json'));
const tabler = JSON.parse(readFileSync(join(TABLER, 'icons.json'), 'utf8'));
const info = JSON.parse(readFileSync(join(TABLER, 'info.json'), 'utf8'));

const fail = (msg) => {
  console.error(`build-icons: ${msg}`);
  process.exit(1);
};
const lines = (file) =>
  readFileSync(join(ROOT, 'tools/icons', file), 'utf8')
    .split('\n')
    .map((l, i) => [l.trim(), i + 1])
    .filter(([l]) => l && !(l.startsWith('#') && !l.startsWith('##')));

// ---- the curated list ----
const categories = {};
const keywords = {};
const order = [];
let group = null;
for (const [l, n] of lines('builtin.txt')) {
  if (l.startsWith('## ')) {
    group = l.slice(3).trim();
    categories[group] ??= [];
    continue;
  }
  const m = /^([a-z0-9-]+)\s*:\s*(.*)$/.exec(l);
  if (!m) fail(`builtin.txt:${n}: expected "name: keyword, keyword"`);
  if (!group) fail(`builtin.txt:${n}: an icon before the first "## Group" heading`);
  const [, name, kw] = m;
  if (keywords[name]) fail(`builtin.txt:${n}: "${name}" is listed twice`);
  keywords[name] = [...new Set(kw.split(',').map((k) => k.trim().toLowerCase()).filter((k) => k && k !== name))];
  categories[group].push(name);
  order.push(name);
}

// ---- the Font Awesome look-alikes ----
const fa = {};
for (const [l, n] of lines('fa-fallback.txt')) {
  const m = /^([a-z0-9-]+)\s+([a-z0-9-]+)$/.exec(l);
  if (!m) fail(`fa-fallback.txt:${n}: expected "fa-name tabler-name"`);
  if (fa[m[1]]) fail(`fa-fallback.txt:${n}: "${m[1]}" is mapped twice`);
  if (!keywords[m[2]]) fail(`fa-fallback.txt:${n}: "${m[2]}" is not in builtin.txt`);
  fa[m[1]] = m[2];
}

// ---- the icons ----
/** An icon of the Tabler pack by name, an alias followed to its icon (plain renames only). */
function icon(name) {
  for (let n = name, depth = 0; depth < 8; depth++) {
    const i = tabler.icons[n];
    if (i) return i;
    const a = tabler.aliases?.[n];
    if (!a) break;
    if (Object.keys(a).some((k) => k !== 'parent')) fail(`"${name}" is a transformed alias in Tabler; list its icon instead`);
    n = a.parent;
  }
  fail(`"${name}" is not a Tabler icon (${info.version})`);
}

const icons = {};
for (const name of [...order].sort()) {
  const i = icon(name);
  const e = { body: i.body };
  for (const k of ['width', 'height', 'left', 'top']) if (i[k] !== undefined) e[k] = i[k];
  icons[name] = e;
}

const pack = {
  prefix: 'tabler',
  info: {
    name: `${info.name} (built-in subset)`,
    author: info.author,
    license: info.license,
    version: info.version,
    palette: false,
  },
  width: tabler.width ?? 24,
  height: tabler.height ?? 24,
  icons,
  categories,
  keywords: Object.fromEntries(Object.entries(keywords).filter(([, k]) => k.length).sort(([a], [b]) => (a < b ? -1 : 1))),
};
const sorted = Object.fromEntries(Object.entries(fa).sort(([a], [b]) => (a < b ? -1 : 1)));
const out = JSON.stringify(pack);
writeFileSync(join(ROOT, 'src/icons/builtin.json'), `${out}\n`);
writeFileSync(join(ROOT, 'src/icons/fa-fallback.json'), `${JSON.stringify(sorted, null, 1)}\n`);
const gz = (s) => (gzipSync(s, { level: 9 }).length / 1024).toFixed(1);
console.log(`build-icons: ${order.length} icons in ${Object.keys(categories).length} groups (${(out.length / 1024).toFixed(1)} kB, ${gz(out)} kB gzip), ${Object.keys(fa).length} Font Awesome look-alikes (${gz(JSON.stringify(sorted))} kB gzip); Tabler ${info.version}`);
