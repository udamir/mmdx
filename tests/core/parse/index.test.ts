import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectType, parse, parseER, parseFlowchart, parseSequence, MAX_ITEMS, MAX_SOURCE_LENGTH } from '../../../src/core/parse/index.js';

const EXAMPLES = join(__dirname, '../../../examples');
const examples = readdirSync(EXAMPLES).filter((f) => f.endsWith('.mmd')).map((f) => ({
  name: f,
  code: readFileSync(join(EXAMPLES, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('%%@')).join('\n'),
}));

describe('detectType', () => {
  it.each([
    ['flowchart LR', 'flowchart'], ['graph TD', 'flowchart'], ['Graph', 'flowchart'], ['flowchart-elk TB', 'flowchart'],
    ['sequenceDiagram', 'sequence'], ['erDiagram', 'er'], ['gantt', null], ['', null], ['classDiagram', null],
    ['\n\n  %% c\n%%{init: {}}%%\nsequenceDiagram', 'sequence'],
    ['---\ntitle: graph x\nerDiagram: no\n---\nerDiagram', 'er'],
    ['---\nflowchart LR', null],
    ['hello\nflowchart LR', null],
  ])('%j -> %s', (code, type) => {
    expect(detectType(code)).toBe(type);
  });
});

describe('parse', () => {
  it('dispatches on the header', () => {
    expect(parse('flowchart LR\nA').type).toBe('flowchart');
    expect(parse('sequenceDiagram\nA->>B: x').type).toBe('sequence');
    expect(parse('erDiagram\nA').type).toBe('er');
  });
  it('returns an unsupported model with the keyword', () => {
    const m = parse('%% hi\ngantt\n  title x');
    expect(m.type).toBeNull();
    expect(m.type === null && m.keyword).toBe('gantt');
    expect(m.diagnostics).toMatchObject([{ code: 'type.unsupported', severity: 'error',
      message: 'Unsupported diagram: start with "flowchart", "sequenceDiagram" or "erDiagram".' }]);
    const empty = parse('');
    expect(empty.type === null && 'keyword' in empty).toBe(false);
  });
});

describe('examples', () => {
  it('there are examples', () => expect(examples.length).toBeGreaterThan(0));
  it.each(examples)('$name parses without warnings or errors', ({ code }) => {
    const m = parse(code);
    expect(m.type).not.toBeNull();
    expect(m.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});

describe('limits', () => {
  it('a source over the size cap gives the right type with no items', () => {
    const code = 'flowchart LR\n' + 'A --> B\n'.repeat(Math.ceil(MAX_SOURCE_LENGTH / 8) + 1);
    const m = parse(code);
    expect(m.type).toBe('flowchart');
    expect(m.type === 'flowchart' && m.nodes.size + m.edges.length).toBe(0);
    expect(m.diagnostics.map((d) => [d.code, d.severity])).toEqual([['doc.too-large', 'error']]);
    const s = parse('sequenceDiagram\n' + 'x'.repeat(MAX_SOURCE_LENGTH));
    expect(s.type === 'sequence' && s.items.length).toBe(0);
    expect(parse('gantt\n' + 'x'.repeat(MAX_SOURCE_LENGTH)).diagnostics.map((d) => d.code)).toEqual(['doc.too-large']);
  });
  it('caps items: flowchart fan-out on one line', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `n${i}`).join(' & ');
    const m = parseFlowchart(`flowchart LR\n  ${ids} --> ${ids.replace(/n/g, 'm')}\n  late`);
    expect(m.nodes.size + m.edges.length).toBe(MAX_ITEMS);
    expect(m.nodes.has('late')).toBe(false);
    expect(m.diagnostics.map((d) => d.code)).toEqual(['doc.too-many-items']);
  });
  it('caps items: sequence and ER', () => {
    const s = parseSequence('sequenceDiagram\n' + 'A->>B: x\n'.repeat(MAX_ITEMS + 10));
    expect(s.participants.length + s.items.length).toBe(MAX_ITEMS);
    expect(s.diagnostics.map((d) => d.code)).toEqual(['doc.too-many-items']);
    const e = parseER('erDiagram\n' + Array.from({ length: MAX_ITEMS + 10 }, (_, i) => `E${i}`).join('\n'));
    expect(e.entities.size).toBe(MAX_ITEMS);
    expect(e.diagnostics.map((d) => d.code)).toEqual(['doc.too-many-items']);
  });
  it('style references and block lookups stay linear', () => {
    const n = 4000;
    const flow = 'flowchart LR\n' + Array.from({ length: n }, (_, i) => `style X fill:#f00\nclass X c${i}`).join('\n');
    const seq = 'sequenceDiagram\n' + 'loop x\nelse y\n'.repeat(1500) + 'end\n'.repeat(1500);
    const t0 = performance.now();
    parseFlowchart(flow);
    parseSequence(seq);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it.each([
    ['deep subgraphs', 'flowchart LR\n' + Array.from({ length: 3000 }, (_, i) => `subgraph g${i}`).join('\n') + '\nA\n'.repeat(100000)],
    ['spaces in an inline edge label', 'flowchart LR\nA -- x' + ' '.repeat(300000) + 'y'],
    ['an edge chain without closers', 'flowchart LR\nA' + ' -- x'.repeat(100000)],
    ['unclosed shapes', 'flowchart LR\nA' + ' & B['.repeat(50000) + ' & C@{'.repeat(50000)],
    ['spaces before a message arrow', 'sequenceDiagram\nA' + ' '.repeat(300000) + '->>'],
    ['participant @{ runs', 'sequenceDiagram\nparticipant A' + '@{'.repeat(200000)],
    ['participant spaces', 'sequenceDiagram\nparticipant A' + ' '.repeat(300000) + 'x'],
  ])('pathological input stays fast: %s', (_name, code) => {
    const t0 = performance.now();
    parse(code);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('never throws', () => {
  let seed = 12345;
  const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const ALPHA = 'AB x-->|[](){}<>/\\"\'`:;,&@#%=.ox+*\n\t subgraph end style classDef linkStyle 0 fill:#f00 loop else box rect Note over ||--o{ to one or more';
  const parsers = [parseFlowchart, parseSequence, parseER, parse];

  it('random garbage', () => {
    for (let k = 0; k < 600; k++) {
      let s = '';
      for (let i = rnd(200); i > 0; i--) s += ALPHA[rnd(ALPHA.length)];
      for (const p of parsers) expect(() => p(s)).not.toThrow();
      for (const h of ['flowchart LR\n', 'sequenceDiagram\n', 'erDiagram\n']) expect(() => parse(h + s)).not.toThrow();
    }
  });
  it('random slices of the examples', () => {
    for (const { code } of examples) {
      for (let k = 0; k < 150; k++) {
        const a = rnd(code.length), b = a + rnd(code.length - a + 1);
        const s = code.slice(a, b);
        for (const p of parsers) expect(() => p(s)).not.toThrow();
        const lines = code.split('\n');
        const head = lines[0] ?? '';
        const mixed = [head, ...lines.slice(1).filter(() => rnd(3) > 0).map((l) => (rnd(5) ? l : l.slice(rnd(l.length + 1))))].join('\n');
        expect(() => parse(mixed)).not.toThrow();
      }
    }
  });
  it('non-string input', () => {
    expect(() => parse(undefined as unknown as string)).not.toThrow();
    expect(parse(null as unknown as string).type).toBeNull();
  });
});
