// Architecture guard: what an entry's static import graph (value imports, no dynamic ones) may pull in. `mmdx/diff`
// loads the built-in themes on demand; a static path to them puts every theme into every page that shows a diff (B41).
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importEdges } from '../../tools/check-layers.mjs';

const ROOT = join(__dirname, '../..');
const edges: { from: string; to: string; kind: string }[] = importEdges(ROOT);

/** The files an entry reaches through static value imports. */
function staticClosure(entry: string): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of edges) if (e.kind === 'value') (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
  const seen = new Set<string>([entry]);
  const todo = [entry];
  while (todo.length) for (const n of out.get(todo.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), todo.push(n));
  return seen;
}

describe('static import graphs', () => {
  it('mmdx/diff and the item previews carry no built-in theme data', () => {
    for (const entry of ['diff.ts', 'ui/diagram/item-preview-core.ts']) {
      // an entry that moved matches no edge and would pass without checking anything (BUG-022)
      expect(edges.some((e) => e.from === entry), `${entry} is not a source file`).toBe(true);
      const c = staticClosure(entry);
      expect([...c].filter((f) => /^core\/theme\/builtin(-extra)?\.ts$/.test(f)), entry).toEqual([]);
    }
  });

  it('the sequence ops kind does not pull in the sequence renderer (P15)', () => {
    expect(edges.some((e) => e.from === 'core/kinds/sequence/ops-kind.ts')).toBe(true);
    expect(staticClosure('core/kinds/sequence/ops-kind.ts').has('core/kinds/sequence/render.ts')).toBe(false);
  });
});
