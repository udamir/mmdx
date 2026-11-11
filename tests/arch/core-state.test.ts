// Core's module state (A18): core holds no instance state. What lives at module level is a registry of code (kinds,
// shapes, the media kit, the icon decoder), a cache keyed by its inputs (a result a later call with the same inputs
// reuses), an id counter, or a render's collection of what it drew without — each named below with its reason. A new
// `let` or container at module level in src/core fails here until it is reviewed and listed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = join(__dirname, '../../src/core');
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n.endsWith('.ts') ? [join(d, n)] : []));

/** `file name` → what it is. */
const ALLOWED: Record<string, string> = {
  'context-base.ts counter': 'id counter: each context a unique id prefix',
  'kinds/mindmap/diff.ts matched': 'cache: the node matching of a pair of models (WeakMap on the models)',
  'diff/render.ts marklessContexts': 'cache: the derived mark-free context per context (WeakMap)',
  'icons/draw.ts placeholders': 'cache: the placeholder image per colour',
  'icons/draw.ts reported': 'cache: what a diagnostics list already holds (WeakMap on the list)',
  'icons/draw.ts urls': 'cache: an icon\'s data URLs (WeakMap on the icon data)',
  'icons/registry.ts builtin': 'registry: the built-in icon set, once loaded',
  'icons/registry.ts builtinLoad': 'registry: its load in flight',
  'icons/registry.ts decoder': 'registry: the icon decoder code, once loaded',
  'icons/registry.ts decoderLoad': 'registry: its load in flight',
  'icons/registry.ts ids': 'id counter: registry keys',
  'icons/search.ts indexes': 'cache: the search index of a pack (WeakMap on the pack data)',
  'media/kit.ts kit': 'registry: the media kit code, once loaded',
  'ops/lines.ts starts': 'cache: the line offsets of the last code',
  'ops/lines.ts startsOf': 'cache: the code they belong to',
  'kinds/state/ops.ts patterns': 'cache: compiled patterns by source',
  'pipeline-core.ts layoutCaches': 'cache: the layout cache per context (WeakMap)',
  'pipeline-core.ts resolvers': 'cache: the colour resolver per context (WeakMap)',
  'kinds/flowchart/style.ts shapeStylesOf': 'cache: the shape styles of a resolved theme (WeakMap on the theme)',
  'shapes/misses.ts collecting': "a render's collection of what it drew without (A18: read from RenderResult.missing)",
  'text/measure.ts segmenter': 'registry: the platform grapheme segmenter, once made',
};

describe('core module state (A18)', () => {
  it('is code registries, caches, id counters and render collections only — each one reviewed', () => {
    const found: string[] = [];
    const re = /^(?:let|var) ([a-z]\w*)|^const ([a-z]\w*)(?:: [^=]+)? = (?:new (?:Map|Set|WeakMap|WeakSet|Lru)\b|(?:\[\]|\{\});)/gm;
    for (const f of walk(CORE)) for (const m of readFileSync(f, 'utf8').matchAll(re)) found.push(`${relative(CORE, f).split('\\').join('/')} ${m[1] ?? m[2]}`);
    expect(found.filter((k) => !(k in ALLOWED)), 'module state not reviewed').toEqual([]);
    expect(Object.keys(ALLOWED).filter((k) => !found.includes(k)), 'listed but gone — remove from ALLOWED').toEqual([]);
  });
});
