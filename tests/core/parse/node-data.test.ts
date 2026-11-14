// @vitest-environment jsdom
// Node data `A@{ … }` (T02.4): the reader keeps every entry with its offsets (unknown keys included), types values as
// js-yaml's JSON schema does, and handles what Mermaid accepts — quotes protecting `}` and `,`, multi-line blocks; the
// writer changes values in place. Checked against stock Mermaid's parser where the input is Mermaid's.
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFlowchart } from '../../../src/core/kinds/flowchart/parse.js';
import { applySplices, editBlock, formatValue, readNodeData } from '../../../src/core/parse/node-data.js';
import { type NodeDataBlock } from '../../../src/core/model.js';
import { stockParse } from '../../helpers/mermaid.js';

const read = (body: string): NodeDataBlock => {
  const s = `A@{${body}}`;
  const b = readNodeData(s, 2, 0);
  if (!b) throw new Error(`not closed: ${s}`);
  return b;
};
const values = (b: NodeDataBlock): Record<string, unknown> => Object.fromEntries(b.entries.map((e) => [e.key, e.value]));

describe('reader', () => {
  it.each([
    [' shape: doc ', { shape: 'doc' }],
    [' shape: "lin-cyl", label: "a}b, c" ', { shape: 'lin-cyl', label: 'a}b, c' }],
    [" label: 'it''s' ", { label: "it's" }],
    [' w: 60, h: 40.5, pos: t, animate: true, x: null, e: 1e3 ', { w: 60, h: 40.5, pos: 't', animate: true, x: null, e: 1000 }],
    [' icon: "fa:user", form: square, label: "User Icon" ', { icon: 'fa:user', form: 'square', label: 'User Icon' }],
    ['\n  shape: doc\n  label: "Two\\nlines"\n  custom: kept\n', { shape: 'doc', label: 'Two\nlines', custom: 'kept' }],
    [' "quoted key": 1, label: plain words here ', { 'quoted key': 1, label: 'plain words here' }],
    [' label: "#quot;x#quot;" ', { label: '#quot;x#quot;' }],
    ['', {}],
  ])('%j', (body, want) => {
    const b = read(body);
    expect(values(b)).toEqual(want);
    // spans point at the values as written
    for (const e of b.entries) if (typeof e.value === 'string' && !body.includes('\\')) expect(`A@{${body}}`.slice(e.valueAt, e.valueEnd)).toContain(e.value.slice(0, 1));
  });

  it('an unclosed block is reported, not read to the end of the file', () => {
    expect(readNodeData('A@{ shape: doc', 2, 0)).toBeNull();
    expect(readNodeData('A@{ label: "a}', 2, 0)).toBeNull();
    const m = parseFlowchart('flowchart LR\n  A@{ shape: doc\n  B --> C');
    expect(m.diagnostics.map((d) => d.code)).toContain('flow.node-data');
  });

  it('fuzz: never throws, offsets stay inside the block and in order', () => {
    const parts = ['shape', ':', ' ', ',', '"', "'", '}', '{', '\n', 'doc', 'a b', '\\', '#quot;', 'label', '1', 'true', '@'];
    let seed = 7;
    const rnd = (n: number): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % n;
    for (let i = 0; i < 3000; i++) {
      let body = '';
      for (let k = rnd(12); k >= 0; k--) body += parts[rnd(parts.length)];
      const s = `A@{${body}`;
      const b = readNodeData(s + '}', 2, 0);
      if (!b) continue;
      let last = 3;
      for (const e of b.entries) {
        expect(e.at).toBeGreaterThanOrEqual(last - 1);
        expect(e.valueAt).toBeGreaterThanOrEqual(e.at);
        expect(e.valueEnd).toBeGreaterThanOrEqual(e.valueAt);
        expect(e.valueEnd).toBeLessThanOrEqual(b.end);
        last = e.valueEnd;
      }
      // editing nothing changes nothing; setting a key then reading it back gives the value
      expect(applySplices(s + '}', editBlock(s + '}', b, {}))).toBe(s + '}');
      const out = applySplices(s + '}', editBlock(s + '}', b, { shape: 'lin-cyl' }));
      const again = readNodeData(out, 2, 0);
      if (again) expect([...again.entries].reverse().find((e) => e.key === 'shape')?.value).toBe('lin-cyl');
    }
  });
});

describe('writer', () => {
  it('changes a value in place, keeping quotes, spacing, order and unknown keys', () => {
    const code = 'A@{ shape: doc,  label: "Report", custom: "x" }';
    const b = readNodeData(code, 2, 0)!;
    expect(applySplices(code, editBlock(code, b, { shape: 'lin-cyl' }))).toBe('A@{ shape: lin-cyl,  label: "Report", custom: "x" }');
    expect(applySplices(code, editBlock(code, b, { label: 'New "one"' }))).toBe('A@{ shape: doc,  label: "New #quot;one#quot;", custom: "x" }');
    expect(applySplices(code, editBlock(code, b, { w: 80 }))).toBe('A@{ shape: doc,  label: "Report", custom: "x", w: 80 }');
    expect(applySplices(code, editBlock(code, b, { label: undefined }))).toBe('A@{ shape: doc, custom: "x" }');
    expect(applySplices(code, editBlock(code, b, { shape: undefined }))).toBe('A@{ label: "Report", custom: "x" }');
  });

  it('multi-line blocks get new keys on lines of their own', () => {
    const code = 'A@{\n    shape: doc\n    label: "R"\n}';
    const b = readNodeData(code, 2, 0)!;
    expect(applySplices(code, editBlock(code, b, { pos: 'b' }))).toBe('A@{\n    shape: doc\n    label: "R"\n    pos: b\n}');
    const empty = 'A@{ }';
    expect(applySplices(empty, editBlock(empty, readNodeData(empty, 2, 0)!, { shape: 'doc' }))).toBe('A@{ shape: doc }');
  });

  it('formats values so they read back as written', () => {
    expect(formatValue('doc')).toBe('doc');
    expect(formatValue('true')).toBe('"true"');
    expect(formatValue('12')).toBe('"12"');
    expect(formatValue('fa:user')).toBe('"fa:user"');
    expect(formatValue(3)).toBe('3');
    expect(formatValue(false)).toBe('false');
  });
});

describe('the flowchart reads node data', () => {
  it('types the known keys, keeps the rest, and lets a later statement win as Mermaid does', () => {
    const m = parseFlowchart('flowchart LR\n  A["Label"] --> B\n  A@{ shape: lin-cyl, icon: "fa:car", w: 60, custom: 1 }\n  B@{\n    shape: sm-circ\n    label: "Start"\n  }\n  B --> C');
    const a = m.nodes.get('A')!, b = m.nodes.get('B')!;
    // an `icon` key makes an icon node whatever the shape says, as Mermaid draws it (T06)
    expect([a.shape, a.label, a.shapeFrom, a.labelFrom]).toEqual(['icon', 'Label', 'data', 'bracket']);
    expect(a.data).toEqual({ icon: 'fa:car', w: 60 });
    expect(a.blocks?.[0]?.entries.map((e) => e.key)).toEqual(['shape', 'icon', 'w', 'custom']);
    expect([b.shape, b.label, b.defLine]).toEqual(['sm-circ', 'Start', 3]);
    expect(m.edges.map((e) => e.id)).toEqual(['A->B', 'B->C']);
    expect(m.edges[1]!.src).toBe(7);
    expect(m.diagnostics).toEqual([]);
  });

  it('warns about names Mermaid rejects, with a fix to the shortName', () => {
    const code = 'flowchart LR\n  A@{ shape: lean_r }\n  B@{ shape: parallelogram, label: "P" }\n  C@{ shape: nope }\n  D@{ shape: actor }';
    const m = parseFlowchart(code);
    expect(m.diagnostics.map((d) => [d.code, d.params?.['shape']])).toEqual([['flow.shape-name', 'lean_r'], ['flow.shape-name', 'parallelogram'], ['flow.unknown-shape', 'nope'], ['flow.shape-name', 'actor']]);
    expect(m.nodes.get('C')!.shape).toBe('rect');
    expect(m.nodes.get('D')!.shape).toBe('actor');
    const fixed = m.diagnostics[0]!.fix!.apply(code);
    expect(fixed).toBe('flowchart LR\n  A@{ shape: lean-r }\n  B@{ shape: lean-r, label: "P" }\n  C@{ shape: nope }\n  D@{ shape: actor }');
  });
});

describe('Mermaid agreement', () => {
  let parse: (code: string) => Promise<unknown>;
  beforeAll(async () => {
    parse = stockParse;
  });

  it('what the reader reads, Mermaid reads; what the writer writes, Mermaid reads', async () => {
    for (const body of [' shape: doc, label: "a}b, c" ', '\n  shape: doc\n  label: "Two"\n', ' label: \'single\' ', ' shape: lin-cyl, w: 60 ']) {
      const code = `flowchart LR\n  A@{${body}}\n  A --> B`;
      await expect(parse(code), body).resolves.toBeTruthy();
      const b = parseFlowchart(code).nodes.get('A')!.blocks![0]!;
      const out = applySplices(code, editBlock(code, b, { label: 'He said "hi", }', pos: 'b', shape: 'tag-doc' }));
      await expect(parse(out), out).resolves.toBeTruthy();
      expect(parseFlowchart(out).nodes.get('A')!.label).toBe('He said "hi", }');
    }
  });
});
