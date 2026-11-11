// Message catalogue hygiene (D6, X19): every key is used somewhere in src/ — as a string literal, or under one of the
// prefixes code builds keys from at run time — and no key is defined twice (the first table registered would win
// silently).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const SRC = join(ROOT, 'src');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n.endsWith('.ts') ? [join(d, n)] : []));
const files = walk(SRC);
const isCatalogue = (f: string): boolean => /[\\/]ui[\\/]messages[\\/]/.test(f) || /[\\/]ui[\\/]i18n\.ts$/.test(f);

/** Every `'key': 'text'` entry of the catalogues, with where it is. */
function catalogue(): { key: string; at: string }[] {
  const out: { key: string; at: string }[] = [];
  for (const f of files.filter(isCatalogue)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:^|[\s{,])'([a-z][\w-]*(?:\.[\w-]+)+)':\s*['"`]/g)) out.push({ key: m[1]!, at: relative(ROOT, f) });
  }
  return out;
}

/** Keys built at run time: `t(\`diff.kind.${kind}\`)` and the like (prefix up to the template's first `${`). */
const dynamicPrefixes = (): string[] => {
  const out = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/`([a-z][\w-]*(?:\.[\w-]*)*\.)\$\{/g)) out.add(m[1]!);
  return [...out];
};

describe('message catalogue', () => {
  const entries = catalogue();

  it('finds the catalogues', () => {
    expect(entries.length).toBeGreaterThan(500);
  });

  it('every key is used', () => {
    const code = files.filter((f) => !isCatalogue(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    const prefixes = dynamicPrefixes();
    const unused = entries.filter(({ key }) => !code.includes(`'${key}'`) && !code.includes(`"${key}"`) && !code.includes(`\`${key}\``) && !prefixes.some((p) => key.startsWith(p)));
    expect(unused.map((e) => `${e.key} (${e.at})`)).toEqual([]);
  });

  it('no key is defined twice', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const { key, at } of entries) {
      if (seen.has(key)) twice.push(`${key}: ${seen.get(key)} and ${at}`);
      else seen.set(key, at);
    }
    expect(twice).toEqual([]);
  });
});
