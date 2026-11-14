// The cloud icon pack converter (T04 §4.9), used by the `mmdx-icons` CLI: a provider's official SVG download (Azure
// Architecture Icons, AWS Architecture Icons, Google Cloud icons) → one Iconify JSON pack whose icon names are the
// ones Mermaid Chart writes (`azure:computer-vision`). Naming is table-driven per provider (naming/<provider>.json):
// patterns stripped from the file name, CamelCase split, kebab-case, an override list for names that differ, and which
// file wins when several sizes of one icon map to the same name. Each SVG is normalised: its view box becomes the
// icon's box, `<style>` class rules are inlined, ids are prefixed per icon, and comments, titles and metadata go.
// mmdx validates every body again when it draws it (core/icons/svg-body.ts); this script only shapes the pack.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

/** A naming table (naming/<provider>.json), checked. */
export function readNaming(json) {
  const t = typeof json === 'string' ? JSON.parse(json) : json;
  const list = (v, what) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`naming: "${what}" must be a list of strings`);
    return v;
  };
  const overrides = t.overrides ?? {};
  if (typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('naming: "overrides" must map file names to icon names');
  return {
    provider: String(t.provider ?? ''),
    strip: list(t.strip, 'strip').map((r) => new RegExp(r, 'i')),
    camelCase: t.camelCase === true,
    skip: list(t.skip, 'skip').map((r) => new RegExp(r, 'i')),
    prefer: list(t.prefer, 'prefer').map((r) => new RegExp(r, 'i')),
    categoryStrip: list(t.categoryStrip, 'categoryStrip').map((r) => new RegExp(r, 'i')),
    categorySkip: list(t.categorySkip, 'categorySkip').map((r) => new RegExp(r, 'i')),
    overrides,
  };
}

/** Words of a name: separators, and CamelCase boundaries when asked (`ComputeEngine` → Compute, Engine). */
function words(s, camel) {
  const t = camel ? s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') : s;
  return t.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/** The icon name a file gets (`10044-icon-service-Computer-Vision.svg` → `computer-vision` with the Azure table). */
export function iconName(file, naming) {
  const base = basename(file).replace(/\.svg$/i, '');
  const o = naming.overrides[base];
  if (typeof o === 'string') return o;
  let s = base;
  for (const r of naming.strip) s = s.replace(r, '');
  return words(s, naming.camelCase).join('-').toLowerCase();
}

/** The category of a file: the nearest folder that is not a size or format folder, with the table's patterns stripped. */
export function categoryOf(file, naming) {
  const parts = dirname(file).split(/[\\/]/).filter((p) => p && p !== '.');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (naming.categorySkip.some((r) => r.test(parts[i]))) continue;
    let c = parts[i];
    for (const r of naming.categoryStrip) c = c.replace(r, '');
    c = words(c, false).join(' ').trim();
    if (c) return c.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }
  return '';
}

/** Words of the providers' file names that say nothing about the icon. */
const NOISE = new Set(['icon', 'icons', 'service', 'arch', 'res', 'category', 'color', 'rgb', 'light', 'dark', 'svg']);

/** Search keywords: the words of the file name and of its category, lowercased, without the icon's own and noise. */
export function keywordsOf(file, naming, name) {
  const base = basename(file).replace(/\.svg$/i, '');
  const out = new Set([...words(base, naming.camelCase), ...words(categoryOf(file, naming), false)].map((w) => w.toLowerCase()).filter((w) => w.length > 1 && !/^\d+(x)?$/.test(w) && !NOISE.has(w)));
  for (const w of name.split('-')) out.delete(w);
  return [...out];
}

// ---- SVG normalisation ----

const attrOf = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3]) : undefined;
};
const num = (v) => (v === undefined ? NaN : parseFloat(v));

/** `.a,.b{fill:#fff}` rules of the `<style>` blocks, by class name. */
function classRules(svg) {
  const rules = new Map();
  for (const m of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = r[2].split(';').map((d) => d.trim()).filter(Boolean).join(';');
      for (const sel of r[1].split(',')) {
        const c = /^\s*\.([\w-]+)\s*$/.exec(sel);
        if (c) rules.set(c[1], [rules.get(c[1]), decls].filter(Boolean).join(';'));
      }
    }
  }
  return rules;
}

/**
 * One SVG file → `{ body, left, top, width, height }`: the view box (else width and height), the inside of the root
 * element with class rules inlined as `style`, ids prefixed with `idPrefix`, and no comments, titles or metadata.
 */
export function normalizeSvg(svg, idPrefix) {
  let s = svg.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const open = /<svg\b[^>]*>/i.exec(s);
  const close = s.lastIndexOf('</svg>');
  if (!open || close < open.index) throw new Error('not an SVG document');
  const root = open[0];
  const vb = (attrOf(root, 'viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  let [left, top, width, height] = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, num(attrOf(root, 'width')), num(attrOf(root, 'height'))];
  if (!(width > 0 && height > 0)) throw new Error('no view box or size');
  const rules = classRules(s);
  let body = s.slice(open.index + root.length, close);
  body = body
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(title|desc|metadata)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(title|desc|metadata)\b[^>]*\/>/gi, '')
    .replace(/<sodipodi:[\s\S]*?\/>/gi, '');
  // class rules become style attributes (before the element's own style, which wins)
  body = body.replace(/<([A-Za-z][\w:-]*)(\s[^>]*?)?(\/?)>/g, (all, tag, attrs = '', slash) => {
    let a = attrs;
    const cls = attrOf(a, 'class');
    if (cls !== undefined) {
      const css = cls.split(/\s+/).map((c) => rules.get(c)).filter(Boolean).join(';');
      const own = attrOf(a, 'style');
      a = a.replace(/\s(class|style)\s*=\s*("[^"]*"|'[^']*')/gi, '');
      const style = [css, own].filter(Boolean).join(';');
      if (style) a += ` style="${style.replace(/"/g, "'")}"`;
    }
    a = a.replace(/\s(data-name|data-[\w-]+|xml:space|xmlns(:\w+)?)\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return `<${tag}${a}${slash}>`;
  });
  // ids prefixed per icon (Mermaid inlines icon bodies into one SVG, where ids must not collide)
  const ids = new Set([...body.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const id of ids) {
    const re = esc(id);
    body = body
      .replace(new RegExp(`(\\sid\\s*=\\s*["'])${re}(["'])`, 'g'), `$1${idPrefix}${id}$2`)
      .replace(new RegExp(`url\\(\\s*(['"]?)#${re}\\1\\s*\\)`, 'g'), `url(#${idPrefix}${id})`)
      .replace(new RegExp(`(\\s(?:xlink:)?href\\s*=\\s*["'])#${re}(["'])`, 'g'), `$1#${idPrefix}${id}$2`);
  }
  body = body.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  return { body, left, top, width, height };
}

// ---- the pack ----

/** Every `.svg` file under `dir`, relative paths, sorted. */
export function svgFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.svg$/i.test(n)) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

/** Which of two files mapped to one name is kept: the one matching the earlier `prefer` pattern, else the first. */
const rank = (file, naming) => {
  const i = naming.prefer.findIndex((r) => r.test(file));
  return i < 0 ? naming.prefer.length : i;
};

/**
 * The names the files get (the CLI's `--dry-run`): `[{ file, name }]` for the files kept, the files skipped, and the
 * files that lost to another of the same name.
 */
export function planNames(files, naming) {
  const byName = new Map();
  const skipped = [];
  const dropped = [];
  for (const file of files) {
    if (naming.skip.some((r) => r.test(file))) {
      skipped.push(file);
      continue;
    }
    const name = iconName(file, naming);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      skipped.push(file);
      continue;
    }
    const prev = byName.get(name);
    if (!prev) byName.set(name, file);
    else if (rank(file, naming) < rank(prev, naming)) {
      byName.set(name, file);
      dropped.push({ file: prev, name, kept: file });
    } else dropped.push({ file, name, kept: prev });
  }
  return { names: [...byName].map(([name, file]) => ({ file, name })).sort((a, b) => (a.name < b.name ? -1 : 1)), skipped, dropped };
}

/**
 * Builds the pack from SVG sources: `read(file)` returns a file's text. Icons that fail to normalise are reported in
 * `errors`. The most common size becomes the pack's default (icons of that size carry no width and height).
 */
export function buildPack(files, read, o) {
  const naming = o.naming;
  const plan = planNames(files, naming);
  const icons = {};
  const categories = {};
  const keywords = {};
  const errors = [];
  // the same icon in several category folders (Azure): one icon, listed in each category
  const also = new Map();
  for (const d of plan.dropped) if (basename(d.file) === basename(d.kept)) also.set(d.name, [...(also.get(d.name) ?? []), d.file]);
  for (const { file, name } of plan.names) {
    try {
      const n = normalizeSvg(read(file), `${o.prefix}-${name}-`);
      icons[name] = n;
      for (const c of new Set([file, ...(also.get(name) ?? [])].map((f) => categoryOf(f, naming)))) if (c) (categories[c] ??= []).push(name);
      const k = keywordsOf(file, naming, name);
      if (k.length) keywords[name] = k;
    } catch (e) {
      errors.push({ file, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const sizes = new Map();
  for (const i of Object.values(icons)) sizes.set(`${i.width}x${i.height}`, (sizes.get(`${i.width}x${i.height}`) ?? 0) + 1);
  const common = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0]?.split('x').map(Number) ?? [16, 16];
  const out = {};
  for (const [name, i] of Object.entries(icons)) {
    const e = { body: i.body };
    if (i.left) e.left = i.left;
    if (i.top) e.top = i.top;
    if (i.width !== common[0]) e.width = i.width;
    if (i.height !== common[1]) e.height = i.height;
    out[name] = e;
  }
  const pack = { prefix: o.prefix, info: { name: o.name ?? `${naming.provider || o.prefix} icons`, palette: true }, width: common[0], height: common[1], icons: out };
  if (Object.keys(categories).length) pack.categories = categories;
  if (Object.keys(keywords).length) pack.keywords = keywords;
  return { pack, skipped: plan.skipped, dropped: plan.dropped, errors };
}

/** `buildPack` over a folder on disk. */
export function buildPackFromDir(dir, o) {
  return buildPack(svgFiles(dir), (f) => readFileSync(join(dir, f), 'utf8'), o);
}
