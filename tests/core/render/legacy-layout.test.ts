// `canvas.layout: "legacy"` (T07): flowcharts with subgraphs keep the auto layout from before the compound engine for one
// minor release. The snapshots were written by the renderer before T07 (rendering the same files, where the key did
// nothing), so this checks the escape hatch reproduces the earlier output byte for byte.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import { parse } from '../../../src/core/parse/index.js';
import { render, renderSvgString } from '../../../src/core/render/index.js';
import { EXAMPLES, makeCtx, registry } from './helpers.js';

const FIXTURES = join(__dirname, '../../fixtures');
const files = [
  ...EXAMPLES.filter((ex) => /^\s*subgraph\b/m.test(ex.src)),
  { name: 'whiteboard.mmd', src: readFileSync(join(FIXTURES, 'mermaid-chart/whiteboard.mmd'), 'utf8') },
  ...readdirSync(join(FIXTURES, 'mermaid-docs'))
    // the flowchart samples (the mindmap ones are tests/core/parse/mindmap.test.ts's)
    .filter((f) => f.endsWith('.mmd') && f.startsWith('subgraph-'))
    .sort()
    .map((name) => ({ name, src: readFileSync(join(FIXTURES, 'mermaid-docs', name), 'utf8') })),
];

describe('canvas.layout "legacy"', () => {
  for (const f of files)
    for (const theme of ['default-light', 'github-dark'])
      it(`${f.name} × ${theme}`, () => {
        const { doc } = splitSource(f.src);
        doc.meta.canvas.layout = 'legacy';
        const T = registry.get(theme);
        const ctx = makeCtx(T, doc.meta);
        expect(renderSvgString(render(parse(doc.code), doc.meta, T, ctx, {}), ctx)).toMatchSnapshot();
      });
});
