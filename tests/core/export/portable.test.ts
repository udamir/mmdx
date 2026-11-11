import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mmdxOnlyContent, toPortableMermaid, stripMetaLines, PORTABLE_MARKER } from '../../../src/core/export/portable.js';
// the style lines come from each type's extras kind (core's entry registers them all)
import '../../../src/core/kinds/all-extras.js';
import { splitSource } from '../../../src/core/meta/index.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { parse } from '../../../src/core/parse/index.js';
import { createDefaultRegistry } from '../../../src/core/theme/builtin.js';
import { createColorResolver, diagramPaletteOf } from '../../../src/core/theme/colors.js';

const ROOT = join(__dirname, '../../..');
const EXAMPLES = readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.mmdx')).sort()
  .map((name) => ({ name, src: readFileSync(join(ROOT, 'examples', name), 'utf8') }));
const registry = createDefaultRegistry();

function portable(src: string, themeId?: string): string {
  const { doc } = splitSource(src);
  const theme = registry.get(themeId ?? 'default-light');
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

  it('uses the renderer\'s layers: the diagram\'s _base styles reach the output (B14)', () => {
    const code = 'flowchart LR\n  A --> B\n';
    const meta = { ...emptyMeta(), styles: { node: { _base: { fill: '#123456' } }, edge: { _base: { color: '#654321' } } } };
    const theme = registry.get('default-light');
    const out = toPortableMermaid(code, meta, parse(code), theme, createColorResolver(theme));
    expect(out).toMatch(/^classDef studioDefault .*fill:#123456/m);
    expect(out).toMatch(/^linkStyle 0 .*stroke:#654321/m);
  });

  it('strips %%@ lines left in the code; sequence / ER pass through', () => {
    const src = 'sequenceDiagram\n  A->>B: x\n%%@ message m1 {"color":"@lime"}\n';
    expect(stripMetaLines(src)).toBe('sequenceDiagram\n  A->>B: x\n');
    const theme = registry.get('default-light');
    expect(toPortableMermaid(src, emptyMeta(), parse(src), theme, createColorResolver(theme))).toBe('sequenceDiagram\n  A->>B: x\n');
  });
});

describe('mmdx-only content (T10.6)', () => {
  const STATE = `stateDiagram-v2
  state "fa:fa-cog Running" as run
  state "tabler:user Waiting" as wait
  [*] --> run
  run --> wait
  wait --> [*]
%%@ node run {"img":"https://example.com/a.png","iconPos":"t","shape":"hex"}
%%@ node wait {"shape":"stadium","img":""}
%%@ node gone {"img":"https://example.com/b.png","shape":"hex"}
`;
  const MIND = `mindmap
  root((Root))
    a[fa:fa-car Car]
    ::icon(fa fa-book)
    b[Plain]
%%@ node b {"img":"https://example.com/p.png"}
`;

  it('label tokens and ::icon stay (they are code); metadata images and shapes are dropped', () => {
    const out = portable(STATE);
    expect(out).toContain('state "fa:fa-cog Running" as run');
    expect(out).toContain('state "tabler:user Waiting" as wait');
    expect(out).not.toMatch(/img|shape|iconPos|%%@/);
    const mind = portable(MIND);
    expect(mind).toContain('a[fa:fa-car Car]');
    expect(mind).toContain('::icon(fa fa-book)');
    expect(mind).not.toContain('example.com');
  });

  it('lists the items with a metadata image or shape the code still has (an image not chosen yet is no content)', () => {
    const only = (src: string): ReturnType<typeof mmdxOnlyContent> => {
      const { doc } = splitSource(src);
      return mmdxOnlyContent(doc.meta, parse(doc.code));
    };
    expect(only(STATE)).toEqual({ images: [{ kind: 'node', id: 'run' }], shapes: [{ kind: 'node', id: 'run' }, { kind: 'node', id: 'wait' }] });
    expect(only(MIND)).toEqual({ images: [{ kind: 'node', id: 'b' }], shapes: [] });
    expect(only('flowchart LR\n  A --> B\n%%@ node A {"fill":"#fff"}')).toEqual({ images: [], shapes: [] });
    // a flowchart's shape in metadata (not in its code) is mmdx-only too
    expect(only('flowchart LR\n  A --> B\n%%@ node A {"shape":"hex"}').shapes).toEqual([{ kind: 'node', id: 'A' }]);
    expect(only('pie\n  "a" : 1')).toEqual({ images: [], shapes: [] });
  });
});
