// The mindmap diff (T08.7): nodes matched by written id, place in the tree, then label; a move is a layout change,
// a rename content, a class or metadata look style; the merged picture keeps removed nodes where they were.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffDiagrams } from '../../../src/core/diff/all.js';
import { diffModels, mergeDiagrams, stripMarks } from '../../../src/core/diff/index.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { MindmapModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';
import { renderDiffWith } from '../../../src/core/diff/render.js';
import { createContext } from '../../../src/core/context.js';
import { ALL_VIEW_KINDS } from '../../../src/core/kinds/all.js';

const A = `mindmap
  root((Plan))
    goals[Goals]
      Grow
      Keep
    Research
      Interviews
    Risks
      Budget
`;
const find = (d: ReturnType<typeof diffDiagrams>, label: string) => d.items.find((i) => i.label === label);

describe('mindmap diff', () => {
  it('identical sources: nothing changed', () => {
    expect(diffDiagrams(A, A).items.every((i) => i.status === 'unchanged')).toBe(true);
  });

  it('a renamed node is content; an added and a removed subtree; a moved node is layout', () => {
    const B = `mindmap
  root((Plan))
    goals[Targets]
      Grow
    Research
      Interviews
      Keep
    Launch
      Beta
`;
    const d = diffDiagrams(A, B);
    expect(find(d, 'Targets')).toMatchObject({ status: 'changed', facets: ['content'], fields: [{ field: 'label', before: 'Goals', after: 'Targets' }] });
    expect(find(d, 'Keep')).toMatchObject({ status: 'changed', facets: ['layout'], fields: [{ field: 'parent', before: 'Goals', after: 'Research' }] });
    expect(find(d, 'Launch')?.status).toBe('added');
    expect(find(d, 'Beta')?.status).toBe('added');
    expect(find(d, 'Risks')?.status).toBe('removed');
    expect(find(d, 'Budget')?.status).toBe('removed');
    expect(find(d, 'Grow')?.status).toBe('unchanged');
  });

  it('shape and icon are content, classes and metadata looks style, a fold and a side layout', () => {
    const B = A.replace('    Research', '    Research((Research))\n    ::icon(fa fa-book)').replace('    Risks', '    Risks\n    :::urgent');
    const d = diffDiagrams(`${A}%%@ node mm8 {"collapsed":true}\n`, `${B}%%@ node mm8 {"fill":"#f00"}\n`);
    expect(find(d, 'Research')).toMatchObject({ facets: ['content'] });
    expect(find(d, 'Research')!.fields.map((f) => f.field)).toEqual(['shape', 'icon']);
    expect(find(d, 'Risks')?.facets).toEqual(['style']);
    expect(find(d, 'Budget')?.facets).toEqual(['layout', 'style']);
    const by = diffDiagrams(A, `---\nconfig:\n  mindmap:\n    colorBy: depth\n---\n${A}`);
    expect(by.doc).toEqual([{ facet: 'style', field: 'colour by', before: 'branch', after: 'depth' }]);
  });

  it('the merged picture keeps removed nodes under their old parent, at their old place, and marks renames', () => {
    const B = A.replace('      Keep\n', '').replace('[Goals]', '[Targets]');
    const [a, b] = [A, B].map((s) => splitSource(s).doc);
    const ma = parse(a!.code) as MindmapModel, mb = parse(b!.code) as MindmapModel;
    const merged = mergeDiagrams(diffModels(ma, mb, a!.meta, b!.meta), ma, mb, a!.meta, b!.meta)!;
    const m = merged.model as MindmapModel;
    const goals = m.nodes.get('goals')!;
    expect(goals.children.map((c) => stripMarks(m.nodes.get(c)!.label))).toEqual(['Grow', 'Keep']);
    expect(stripMarks(goals.label)).toBe('Goals Targets');
    const removed = [...merged.status].find(([, c]) => c.status === 'removed');
    expect(removed?.[0]).toMatch(/~del$/);
    // and it draws: the removed node in the merged render
    const r = renderDiffWith(ALL_VIEW_KINDS, A, B, createContext());
    expect(r.merged?.result.geom.type).toBe('mindmap');
  });

  it('the examples against their history: every version diffs and merges', () => {
    for (const f of ['product-mindmap', 'study-notes']) {
      const now = readFileSync(`examples/${f}.mmdx`, 'utf8');
      const h = JSON.parse(readFileSync(`examples/history/${f}.json`, 'utf8')) as { versions: { source: string }[] };
      for (const v of h.versions) {
        const d = diffDiagrams(v.source, now);
        expect(d.type).toBe('mindmap');
        expect(d.items.some((i) => i.status !== 'unchanged')).toBe(true);
        expect(renderDiffWith(ALL_VIEW_KINDS, v.source, now, createContext()).merged).toBeTruthy();
      }
    }
  });
});
