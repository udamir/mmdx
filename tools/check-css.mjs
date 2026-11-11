// Dead CSS classes (tests/arch/css.test.ts): every class a stylesheet in src/ defines (the `/* css */` template
// strings) should be one the code can put on an element — written as a word in a string, or built from a prefix
// (`flt-${kind}`). Returns the classes no code names, sorted; a baseline of today's may only shrink.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));

/** The CSS template strings of a source file and the rest of it. */
function split(text) {
  const css = [];
  const rest = text.replace(/\/\*\s*css\s*\*\/\s*`((?:[^`\\]|\\.)*)`/g, (_m, body) => (css.push(body), '``'));
  return { css, rest };
}

export function deadClasses(root) {
  const defined = new Map();
  let code = '';
  for (const f of walk(join(root, 'src'))) {
    const { css, rest } = split(readFileSync(f, 'utf8'));
    code += rest + '\n';
    for (const body of css) {
      // selectors only: drop declarations, url(), numbers like .5 and ${…} expressions
      const sel = body.replace(/\$\{[^}]*\}/g, ' ').replace(/\{[^{}]*\}/g, '{}');
      for (const m of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) if (!defined.has(m[1])) defined.set(m[1], f);
    }
  }
  const prefixes = new Set([...code.matchAll(/([A-Za-z][\w]*-)\$\{/g)].map((m) => m[1]));
  const used = (c) => new RegExp(`(?<![\\w-])${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(code) || [...prefixes].some((p) => c.startsWith(p));
  return [...defined.keys()].filter((c) => !used(c)).sort();
}
