import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  META_HEADER, checkMetaLine, decodeId, encodeId, joinSource, mergeLegacySidecar, metaToLines, migrate, normalizeMeta,
  pruneMeta, splitSource,
} from '../../../src/core/meta/index.js';
import type { DiagramMeta } from '../../../src/core/meta/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith('.mmd'));
const read = (f: string): string => readFileSync(`${root}examples/${f}`, 'utf8');

// What our writer produces: a file it saved already (`"v"` first in `%%@ canvas`) comes back unchanged; an unversioned
// (v0) file gains `"v":1` first in `%%@ canvas` (a canvas line is added when there was none) and the legacy `frame`
// key migrated to `border`.
function expectedRoundTrip(x: string): string {
  if (!x.includes(META_HEADER)) return x;
  const lines = x.split('\n');
  const h = lines.indexOf(META_HEADER);
  const next = lines[h + 1]!;
  if (next.startsWith('%%@ canvas {"v":')) return x;
  if (next.startsWith('%%@ canvas {')) lines[h + 1] = next.replace('%%@ canvas {', '%%@ canvas {"v":1,').replace('"frame":false', '"border":"none"');
  else lines.splice(h + 1, 0, '%%@ canvas {"v":1}');
  return lines.join('\n');
}

describe('examples round-trip', () => {
  it('finds the examples', () => expect(examples.length).toBeGreaterThanOrEqual(4));
  for (const f of examples) {
    it(`${f}: joinSource(splitSource(x)) is x (plus the version when it had none)`, () => {
      const x = read(f);
      const r = splitSource(x);
      expect(r.diagnostics).toEqual([]);
      expect(r.hadMeta).toBe(x.includes('%%@'));
      expect(joinSource(r.doc)).toBe(expectedRoundTrip(x));
    });
    it(`${f}: second round-trip is byte-identical`, () => {
      const once = joinSource(splitSource(read(f)).doc);
      expect(joinSource(splitSource(once).doc)).toBe(once);
    });
  }
});

describe('splitSource / joinSource', () => {
  it('a file without metadata stays pure Mermaid', () => {
    const src = 'flowchart LR\n  A --> B\n';
    expect(joinSource(splitSource(src).doc)).toBe(src);
    expect(joinSource({ code: 'flowchart LR', meta: { canvas: {}, styles: {}, nodes: {} } })).toBe('flowchart LR\n');
  });

  it('writes the canvas version first, in the fixed order', () => {
    const meta: DiagramMeta = {
      canvas: { theme: 'clean' },
      styles: { node: { mine: { fill: '@lime' } } },
      rels: { 'a-b': { curve: 1 } },
      nodes: { 'my node': { x: 1 } },
      layers: { default: { hidden: true } },
    };
    expect(metaToLines(meta)).toEqual([
      '%%@ canvas {"v":1,"theme":"clean"}',
      '%%@ style.node mine {"fill":"@lime"}',
      '%%@ layer default {"hidden":true}',
      '%%@ node my%20node {"x":1}',
      '%%@ rel a-b {"curve":1}',
    ]);
  });

  it('a file without "v" is v1, and v is not kept in the model', () => {
    const { doc } = splitSource('graph TD\n%%@ canvas {"v":1,"theme":"clean"}\n%%@ node A {"x":1}');
    expect(doc.meta.canvas).toEqual({ theme: 'clean' });
  });

  it('keeps unknown kinds verbatim and writes them after the known lines', () => {
    const src = 'graph TD\n  A\n%%@ sticker s1 {"x":1,"emoji":"*"}\n%%@ node A {"x":5}';
    const r = splitSource(src);
    expect(r.doc.meta.unknown).toEqual(['%%@ sticker s1 {"x":1,"emoji":"*"}']);
    expect(r.diagnostics).toMatchObject([{ code: 'meta.unknown-kind', severity: 'info', source: 'meta', range: { line: 2 } }]);
    const out = joinSource(r.doc);
    expect(out).toBe(`graph TD\n  A\n\n${META_HEADER}\n%%@ canvas {"v":1}\n%%@ node A {"x":5}\n%%@ sticker s1 {"x":1,"emoji":"*"}\n`);
    expect(joinSource(splitSource(out).doc)).toBe(out);
  });

  it('keeps unknown keys inside known kinds', () => {
    const r = splitSource('graph TD\n%%@ node A {"x":5,"future":{"a":[1,2]}}\n%%@ canvas {"later":true}');
    expect(r.doc.meta.nodes?.['A']).toEqual({ x: 5, future: { a: [1, 2] } });
    expect(r.doc.meta.canvas).toEqual({ later: true });
    expect(joinSource(r.doc)).toContain('%%@ node A {"x":5,"future":{"a":[1,2]}}');
  });

  it('flags bad JSON and bad ids without throwing, and keeps the lines', () => {
    const src = 'graph TD\n%%@ node A {"x":1,}\n%%@ node %E0%A4%A {"x":2}\n%%@ edge B {"x":[1]}\n%%@ node C ["no"]';
    let r!: ReturnType<typeof splitSource>;
    expect(() => (r = splitSource(src))).not.toThrow();
    expect(r.diagnostics.map((d) => [d.code, d.range?.line, d.source])).toEqual([
      ['meta.bad-json', 1, 'meta'],
      ['meta.bad-id', 2, 'meta'],
      ['meta.bad-value', 3, 'meta'],
    ]);
    expect(r.doc.meta.unknown).toEqual(['%%@ node A {"x":1,}', '%%@ node %E0%A4%A {"x":2}']);
    // not `kind id {json}` at all: an ordinary Mermaid comment, left in the code
    expect(r.doc.code.endsWith('%%@ node C ["no"]')).toBe(true);
    expect(r.doc.meta.edges).toEqual({ B: {} });
    expect(joinSource(r.doc)).toContain('%%@ node %E0%A4%A {"x":2}');
  });

  it('a known kind without an id is flagged, not stored under "undefined"', () => {
    const r = splitSource('graph TD\n%%@ style.node {"fill":"red"}');
    expect(r.doc.meta.styles).toEqual({});
    expect(r.diagnostics[0]?.code).toBe('meta.bad-id');
  });

  it('keeps a newer version and its data', () => {
    const r = splitSource('graph TD\n%%@ canvas {"v":2,"theme":"x"}');
    expect(r.diagnostics[0]?.code).toBe('meta.newer-version');
    expect(metaToLines(r.doc.meta)[0]).toBe('%%@ canvas {"v":2,"theme":"x"}');
  });

  it('round-trips ids with spaces and percent signs', () => {
    expect(encodeId('a b%')).toBe('a%20b%25');
    expect(decodeId('a%20b%25')).toBe('a b%');
    expect(decodeId('%E0%A4%A')).toBeNull();
    const r = splitSource(joinSource({ code: 'graph TD', meta: { canvas: {}, styles: {}, nodes: { 'a b%': { x: 1 } } } }));
    expect(r.doc.meta.nodes).toEqual({ 'a b%': { x: 1 } });
  });

  it('handles CRLF input', () => {
    const r = splitSource('graph TD\r\n  A\r\n%%@ node A {"x":1}\r\n');
    expect(r.doc.code).toBe('graph TD\n  A');
    expect(r.doc.meta.nodes).toEqual({ A: { x: 1 } });
  });
});

describe('checkMetaLine', () => {
  it('ignores blanks, plain comments and the header', () => {
    expect(checkMetaLine('')).toBeNull();
    expect(checkMetaLine('%% note')).toBeNull();
    expect(checkMetaLine(META_HEADER)).toBeNull();
  });
  it('reports syntax, JSON and id errors', () => {
    expect(checkMetaLine('node A {}')).toMatchObject({ code: 'meta.syntax' });
    expect(checkMetaLine('%%@ node A')).toMatchObject({ code: 'meta.syntax', error: 'missing the {json} part' });
    expect(checkMetaLine('%%@ node A {x}')).toMatchObject({ code: 'meta.bad-json' });
    expect(checkMetaLine('%%@ node %zz {}')).toMatchObject({ code: 'meta.bad-id' });
    expect(checkMetaLine('%%@ node {"x":1}')).toMatchObject({ code: 'meta.bad-id' });
  });
  it('parses known and unknown kinds and lists dropped values', () => {
    expect(checkMetaLine('%%@ node a%20b {"x":1,"fill":"url(x)"}')).toEqual({ kind: 'node', id: 'a b', data: { x: 1 }, known: true, dropped: ['fill'] });
    expect(checkMetaLine('%%@ canvas {"theme":"t"}')).toEqual({ kind: 'canvas', data: { theme: 't' }, known: true, dropped: [] });
    expect(checkMetaLine('%%@ widget w {"a":1}')).toEqual({ kind: 'widget', id: 'w', data: { a: 1 }, known: false, dropped: [] });
  });
});

describe('pruneMeta', () => {
  it('removes only entries of known collections whose id is gone', () => {
    const meta: DiagramMeta = {
      canvas: { theme: 'x' }, styles: { node: { p: { fill: 'red' } } },
      nodes: { A: { x: 1 }, B: { x: 2 } }, edges: { e1: {} }, layers: { L: { name: 'L' } },
      unknown: ['%%@ sticker s {"x":1}'],
    };
    const out = pruneMeta(meta, { nodes: new Set(['A']), edges: new Set() });
    expect(out.nodes).toEqual({ A: { x: 1 } });
    expect(out.edges).toEqual({});
    expect(out.layers).toEqual({ L: { name: 'L' } });
    expect(out.styles).toBe(meta.styles);
    expect(out.unknown).toEqual(meta.unknown);
    expect(meta.nodes).toEqual({ A: { x: 1 }, B: { x: 2 } });
  });
});

describe('normalizeMeta', () => {
  it('always has canvas and styles, drops malformed parts', () => {
    expect(normalizeMeta(null)).toEqual({ canvas: {}, styles: {} });
    expect(normalizeMeta({ nodes: 'x', edges: { e: 5, f: { color: 'red' } } })).toEqual({ canvas: {}, styles: {}, edges: { f: { color: 'red' } } });
  });
});

describe('migrations', () => {
  const m = (canvas: Record<string, unknown>): DiagramMeta => ({ canvas, styles: {} });
  it('maps frame / frameColor to border in place', () => {
    expect(Object.entries(migrate(m({ x: 0, frame: false, w: 2 }), 1).canvas)).toEqual([['x', 0], ['border', 'none'], ['w', 2]]);
    expect(migrate(m({ frame: true, frameColor: '#123456' }), 1).canvas).toEqual({ border: '#123456' });
    expect(migrate(m({ frame: true }), 1).canvas).toEqual({ border: '@frame' });
    expect(migrate(m({ frame: true, frameColor: 'x" onload="y' }), 1).canvas).toEqual({ border: '@frame' });
    expect(migrate(m({ frame: false, border: '#fff' }), 1).canvas).toEqual({ border: '#fff' });
  });
  it('leaves current metadata and newer versions alone', () => {
    const a = m({ border: 'red' });
    expect(migrate(a, 1)).toBe(a);
    const b = m({ frame: false });
    expect(migrate(b, 2)).toBe(b);
  });
  it('splitSource applies the migration', () => {
    expect(splitSource('graph TD\n%%@ canvas {"frame":false}').doc.meta.canvas).toEqual({ border: 'none' });
  });
});

describe('mergeLegacySidecar', () => {
  it('reads the sidecar, validates it and lets it win over inline lines', () => {
    const side = JSON.stringify({
      canvas: { theme: 'clean', frame: false },
      styles: { node: { p: { fill: '@sky' } } },
      nodes: { A: { x: 10, fill: 'javascript:alert(1)' }, B: { y: 2 } },
      extra: 1,
    });
    const r = mergeLegacySidecar('graph TD\n  A --> B\n%%@ node A {"x":1,"w":5}\n%%@ edge e {"color":"red"}', side);
    expect(r.doc.code).toBe('graph TD\n  A --> B');
    expect(r.doc.meta.canvas).toEqual({ theme: 'clean', border: 'none' });
    expect(r.doc.meta.styles).toEqual({ node: { p: { fill: '@sky' } } });
    expect(r.doc.meta.nodes).toEqual({ A: { x: 10 }, B: { y: 2 } });
    expect(r.doc.meta.edges).toEqual({ e: { color: 'red' } });
    expect(r.diagnostics.map((d) => d.code).sort()).toEqual(['meta.bad-value', 'meta.sidecar-unknown']);
  });
  it('flags invalid JSON and keeps the inline metadata', () => {
    const r = mergeLegacySidecar('graph TD\n%%@ node A {"x":1}', '{nope');
    expect(r.doc.meta.nodes).toEqual({ A: { x: 1 } });
    expect(r.diagnostics[0]?.code).toBe('meta.bad-json');
    expect(mergeLegacySidecar('graph TD', '[1]').diagnostics[0]?.code).toBe('meta.bad-json');
  });
});
