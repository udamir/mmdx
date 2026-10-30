import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { toPortableMermaid, stripMetaLines, PORTABLE_MARKER } from '../../../src/core/export/portable.js';
import { splitSource } from '../../../src/core/meta/index.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { parse } from '../../../src/core/parse/index.js';
import { createDefaultRegistry } from '../../../src/core/theme/builtin.js';
import { createColorResolver, diagramPaletteOf } from '../../../src/core/theme/colors.js';

const ROOT = join(__dirname, '../../..');
const EXAMPLES = readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.mmd')).sort()
  .map((name) => ({ name, src: readFileSync(join(ROOT, 'examples', name), 'utf8') }));
const registry = createDefaultRegistry();

function portable(src: string, themeId?: string): string {
  const { doc } = splitSource(src);
  const theme = registry.get(themeId ?? (typeof doc.meta.canvas.theme === 'string' ? doc.meta.canvas.theme : 'default-light'));
  return toPortableMermaid(doc.code, doc.meta, parse(doc.code), theme, createColorResolver(theme, diagramPaletteOf(doc.meta.styles)));
}

// Every input of the generated styles: theme defaults, shape presets (db, decision), class / metadata / diagram
// presets, own node / group / edge styles with palette references, dotted and thick links.
const STYLED = `flowchart LR
  subgraph G [Group]
    A[Plain] --> B[(Store)]
    C{Choice} -.-> D[Hot]
  end
  subgraph H [Bare]
    E[Own] ==> F[Picked]
  end
  A -->|label| C
  F --- A
  class D hot
%% ---- diagram-studio layout (safe to keep: Mermaid ignores %% comments) ----
%%@ canvas {"v":1}
%%@ style.node hot {"fill":"@red","text":"@paper","strokeWidth":3}
%%@ style.edge loud {"color":"@orange","width":3,"dash":"6  3"}
%%@ node E {"fill":"@lime","stroke":"#123456"}
%%@ node F {"preset":"hot"}
%%@ group H {"fill":"none","titleColor":"@blue","stroke":"@ink"}
%%@ edge F->A {"preset":"loud","labelColor":"@violet"}
%%@ edge A->C {"color":"@teal"}
`;

describe('toPortableMermaid', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name}: no %%@ lines, no @references, parses`, () => {
      const out = portable(ex.src);
      expect(out).not.toContain('%%@');
      expect(out).not.toMatch(/(^|[\s:,])@[\w-]+/m);
      const before = parse(splitSource(ex.src).doc.code);
      const after = parse(out);
      expect(after.type).toBe(before.type);
      const had = new Set(before.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
      expect(after.diagnostics.filter((d) => d.severity === 'error' && !had.has(d.code))).toEqual([]);
      if (before.type !== 'flowchart') expect(out).toBe(splitSource(ex.src).doc.code.trimEnd() + '\n');
      else expect(out).toContain(PORTABLE_MARKER);
    });
  }

  it('generates classDef / class / style / linkStyle lines from the resolved styles', () => {
    const light = portable(STYLED, 'default-light');
    expect(light).toMatchSnapshot();
    expect(portable(STYLED, 'default-dark')).toMatchSnapshot();
    expect(light).not.toMatch(/%%@|@[\w-]+/);
    expect(light.split(PORTABLE_MARKER)[0]).toBe(splitSource(STYLED).doc.code.trimEnd() + '\n\n');
  });

  it('drops unresolvable references and invalid values instead of leaking them', () => {
    const code = 'flowchart LR\n  A --> B\n  B --> C\n';
    const meta = { ...emptyMeta(), nodes: { A: { fill: '@nope', stroke: 'red;x:y', text: '@ink' } }, edges: { 'A->B': { color: '@missing~+1,+1,+1' } } };
    const theme = registry.get('default-light');
    const out = toPortableMermaid(code, meta, parse(code), theme, createColorResolver(theme));
    expect(out).not.toMatch(/@|nope|missing|x:y/);
    expect(out).toMatch(new RegExp(`^style A .*color:${theme.palette['ink']}`, 'm')); // the valid reference is resolved
    expect(out).toMatch(/^linkStyle 0 /m);
  });

  it('strips %%@ lines left in the code; sequence / ER pass through', () => {
    const src = 'sequenceDiagram\n  A->>B: x\n%%@ message m1 {"color":"@lime"}\n';
    expect(stripMetaLines(src)).toBe('sequenceDiagram\n  A->>B: x\n');
    const theme = registry.get('default-light');
    expect(toPortableMermaid(src, emptyMeta(), parse(src), theme, createColorResolver(theme))).toBe('sequenceDiagram\n  A->>B: x\n');
  });
});
