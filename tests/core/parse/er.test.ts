// @vitest-environment jsdom
// The ER parser (T11.4, T11.6): Mermaid's lexer rules (Unicode ids, `type?`, word cardinalities, one-word labels,
// `.-` / `-.`), aliases, classes and styles, the frontmatter, `accTitle` / `accDescr`, the `title` statement, subgraphs
// and the diagnostics with their fixes; Mermaid's own docs samples (tests/fixtures/mermaid-docs/er-*.mmd), the
// examples and edge cases parse as stock Mermaid 12.2 and 11.17 parses them — a source mmdx reads without errors is
// one Mermaid accepts, one Mermaid rejects gets an mmdx error — and, where Mermaid accepts, the entities, attributes,
// relationships, classes, styles, subgraphs and directions are the ones Mermaid's own ErDB builds (its jison parser,
// loaded from Mermaid's bundle).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import type { ErModel } from '../../../src/core/model.js';
import { erId, isErWord, lexLine, parseAttrLine, parseER } from '../../../src/core/kinds/er/parse.js';
import { stockOk } from '../../helpers/mermaid.js';

const ROOT = join(__dirname, '../../..');
const E = (src: string): ErModel => parseER(`erDiagram\n${src}`);
const errors = (m: ErModel): string[] => m.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const FIXTURES = readdirSync(join(ROOT, 'tests/fixtures/mermaid-docs')).filter((f) => f.startsWith('er-')).map((f) => ({ name: f, src: readFileSync(join(ROOT, 'tests/fixtures/mermaid-docs', f), 'utf8') }));
const EXAMPLES = readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.mmdx')).map((f) => ({ name: f, src: splitSource(readFileSync(join(ROOT, 'examples', f), 'utf8')).doc.code })).filter((x) => /^\s*erDiagram/m.test(x.src));

describe('ER entities', () => {
  it('reads blocks, attributes, aliases, quoted ids, {} and bare lines', () => {
    const m = E([
      '  direction LR',
      '  CUSTOMER["Customer<br>account"] {',
      '    string id PK "the key"',
      '    int order_id FK, UK',
      '    varchar(255) name',
      '    string[] tags',
      '  }',
      '  "LINE ITEM" {}',
      '  PRODUCT',
    ].join('\n'));
    expect(m.direction).toBe('LR');
    expect([...m.entities.values()].map((e) => [e.id, e.label, e.order, e.defLine, e.endLine])).toEqual([
      ['CUSTOMER', 'Customer\naccount', 0, 2, 7],
      ['LINE ITEM', 'LINE ITEM', 1, 8, 8],
      ['PRODUCT', 'PRODUCT', 2, undefined, undefined],
    ]);
    expect(m.entities.get('CUSTOMER')?.attrs).toEqual([
      { type: 'string', name: 'id', keys: ['PK'], comment: 'the key' },
      { type: 'int', name: 'order_id', keys: ['FK', 'UK'], comment: '' },
      { type: 'varchar(255)', name: 'name', keys: [], comment: '' },
      { type: 'string[]', name: 'tags', keys: [], comment: '' },
    ]);
    expect([...(m.entities.get('CUSTOMER')?.lines ?? [])]).toEqual([2, 3, 4, 5, 6, 7]);
    const st = m.entities.get('CUSTOMER')!.stmts;
    expect(st.map((x) => [x.line, x.endLine, x.block])).toEqual([[2, 7, true]]);
    expect(st[0]!.end - st[0]!.start).toBe('CUSTOMER["Customer<br>account"] {\n    string id PK "the key"\n    int order_id FK, UK\n    varchar(255) name\n    string[] tags\n  }'.length);
    expect(m.diagnostics).toEqual([]);
  });

  it('E1: Unicode and emoji in ids, attribute types and names', () => {
    const m = E('  Ünïcødé ||--o{ 😀x : "r"\n  Ünïcødé {\n    strïng näme PK\n    日付 作成日\n  }');
    expect([...m.entities.keys()]).toEqual(['Ünïcødé', '😀x']);
    expect(m.entities.get('Ünïcødé')!.attrs.map((a) => `${a.type} ${a.name}`)).toEqual(['strïng näme', '日付 作成日']);
    expect(m.rels[0]).toMatchObject({ from: 'Ünïcødé', to: '😀x', label: 'r' });
    expect(m.diagnostics).toEqual([]);
  });

  it('E7: optional types (`type?`), generics, backtick words, several attributes on a line', () => {
    const m = E('  A {\n    string? middle\n    list~string~ tags\n    `my type` `my name`\n    int a int b PK\n  }');
    expect(m.entities.get('A')!.attrs.map((a) => `${a.type}|${a.name}|${a.keys.join()}`)).toEqual(['string?|middle|', 'list~string~|tags|', 'my type|my name|', 'int|a|', 'int|b|PK']);
    expect(m.diagnostics).toEqual([]);
  });

  it('aliases: the first one written is kept; markdown backticks dropped; a block on one line', () => {
    const m = E('  p[Person]\n  p["Other"] { string a }\n  q["`**Bold** text`"]');
    expect(m.entities.get('p')).toMatchObject({ alias: 'Person', label: 'Person', attrs: [{ name: 'a' }], defLine: 2, endLine: 2 });
    expect(m.entities.get('q')).toMatchObject({ alias: '**Bold** text' });
  });

  it('reports bad attributes (the block goes on) and lines Mermaid cannot read', () => {
    const m = E('  A {\n    string ok\n    only\n  }\n  ???');
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line])).toEqual([
      ['error', 'er.bad-attribute', 3],
      ['error', 'er.cannot-parse', 5],
    ]);
    expect(m.entities.get('A')!.attrs.map((a) => a.name)).toEqual(['ok']);
  });

  it('Mermaid keywords cannot be ids; numbers can', () => {
    expect(errors(E('  one'))).toEqual(['er.cannot-parse']);
    expect(errors(E('  end'))).toEqual(['er.cannot-parse']);
    const m = E('  42 ||--|| 3.5 : x');
    expect(m.rels[0]).toMatchObject({ from: '42', to: '3.5' });
  });
});

describe('ER relationships', () => {
  const rel = (src: string) => {
    const m = E(`  ${src}`);
    const r = m.rels[0]!;
    return { from: r.from, to: r.to, fromCard: r.fromCard, toCard: r.toCard, identifying: r.identifying, label: r.label, n: m.rels.length };
  };
  it.each([
    ['A ||--o{ B : places', 'one', 'zero-many', true, 'places'],
    ['A |o..|{ B : "may have"', 'zero-one', 'one-many', false, 'may have'],
    ['A }|--|| B : x', 'one-many', 'one', true, 'x'],
    ['A||--||B : x', 'one', 'one', true, 'x'],
    ['A o{--}| B : x', 'zero-many', 'one-many', true, 'x'],
    ['A |o.-o| B : x', 'zero-one', 'zero-one', false, 'x'],
    ['A |o-.o| B : x', 'zero-one', 'zero-one', false, 'x'],
  ])('symbolic: %s', (src, fromCard, toCard, identifying, label) => {
    expect(rel(src)).toEqual({ from: 'A', to: 'B', fromCard, toCard, identifying, label, n: 1 });
  });
  it.each([
    ['A 1 to zero or more B : allows', 'one', 'zero-many', true],
    ['A only one optionally to one or many B : x', 'one', 'one-many', false],
    ['A one or zero to 1+ B : x', 'zero-one', 'one-many', true],
    ['A zero or one to many(0) B : x', 'zero-one', 'zero-many', true],
    ['A many(1) optionally to 0+ B : x', 'one-many', 'zero-many', false],
    ['A one or more to only one B : x', 'one-many', 'one', true],
    ['A one to many B : x', 'one', 'zero-many', true],
    ['A ||--zero or more B : x', 'one', 'zero-many', true],
    ['A one or more..o{ B : x', 'one-many', 'zero-many', false],
    ['A 1 TO 1 B : x', 'one', 'one', true],
    ['A 1--1 B : x', 'one', 'one', true],
  ])('words: %s', (src, fromCard, toCard, identifying) => {
    expect(rel(src)).toMatchObject({ from: 'A', to: 'B', fromCard, toCard, identifying, n: 1 });
  });

  it('a label is one word or a quoted text: the next word is an entity (as in Mermaid)', () => {
    const m = E('  A ||--o{ B : places order');
    expect(m.rels[0]!.label).toBe('places');
    expect([...m.entities.keys()]).toEqual(['A', 'B', 'order']);
  });

  it('keeps the offsets of every token', () => {
    const code = 'erDiagram\n  A only one to zero or more "B c" : "has many"\n';
    const r = parseER(code).rels[0]!;
    const at = (x: [number, number] | undefined): string => (x ? code.slice(x[0], x[1]) : '');
    expect([at(r.fromAt), at(r.fromCardAt), at(r.lineAt), at(r.toCardAt), at(r.toAt), at(r.labelAt), code.slice(r.start, r.end)]).toEqual([
      'A', 'only one', 'to', 'zero or more', '"B c"', '"has many"', 'A only one to zero or more "B c" : "has many"',
    ]);
  });

  it('numbers parallel relationships', () => {
    const m = E('  "A x" ||--o{ b : first\n  "A x" ||--o{ b : second');
    expect(m.rels.map((r) => r.id)).toEqual(['A x--b', 'A x--b#2']);
  });

  it('a missing label: read, with an error and a fix', () => {
    const code = 'erDiagram\n  A }o--o| B\n';
    const m = parseER(code);
    expect(m.rels).toHaveLength(1);
    const d = m.diagnostics.find((x) => x.code === 'er.rel-label')!;
    expect(d.severity).toBe('error');
    expect(d.fix!.apply(code)).toBe('erDiagram\n  A }o--o| B : ""\n');
  });

  it('an alias on a relationship line: read, with an error and a fix', () => {
    const code = 'erDiagram\n  b[Bee] ||--o{ C : x\n';
    const m = parseER(code);
    expect(m.entities.get('b')!.label).toBe('Bee');
    expect(m.rels[0]).toMatchObject({ from: 'b', to: 'C' });
    const fixed = m.diagnostics.find((x) => x.code === 'er.rel-alias')!.fix!.apply(code);
    expect(fixed).toBe('erDiagram\n  b[Bee]\n  b ||--o{ C : x\n');
    expect(errors(parseER(fixed))).toEqual([]);
  });

  it('`u` (MD_PARENT) reads as exactly one, with an info', () => {
    const m = E('  A u--o{ B : x');
    expect(m.rels[0]!.fromCard).toBe('one');
    expect(m.diagnostics.map((d) => d.code)).toEqual(['er.md-parent']);
  });

  it('does not read a word cardinality glued to an entity name', () => {
    expect(E('  CAR1 to 1 B').rels).toEqual([]);
  });
});

describe('ER classes, styles, title and accessibility', () => {
  it('E3: `:::a,b`, `class`, `style`, `classDef` (merged), `classDef default`', () => {
    const m = E('  A:::foo,bar ||--o{ B:::baz : x\n  classDef foo fill:#f00,stroke:#00f\n  classDef foo color:#fff\n  class A,B qux\n  style A fill:#0f0,stroke-width:3px\n  classDef default fill:#eee');
    expect(m.entities.get('A')).toMatchObject({ classes: ['foo', 'bar', 'qux'], style: { fill: '#0f0', strokeWidth: 3 } });
    expect(m.entities.get('B')!.classes).toEqual(['baz', 'qux']);
    expect(m.classDefs).toEqual({ foo: { fill: '#f00', stroke: '#00f', text: '#fff' }, default: { fill: '#eee' } });
    expect(m.undefinedClasses.map((u) => u.cls)).toEqual(['bar', 'baz', 'qux']);
    expect(m.diagnostics).toEqual([]);
  });

  it('`class` and `style` apply to entities that exist when they are read (as Mermaid)', () => {
    const m = E('  class A c\n  style A fill:#f00\n  A');
    expect(m.entities.get('A')).toMatchObject({ classes: [], style: {} });
  });

  it('E4: the frontmatter is not an entity; its title is read', () => {
    const m = parseER('---\ntitle: Orders 😀\nconfig:\n  theme: dark\n---\nerDiagram\n  A\n');
    expect([...m.entities.keys()]).toEqual(['A']);
    expect(m.title).toBe('Orders 😀');
    expect(m.headerLine).toBe(5);
    expect(m.diagnostics).toEqual([]);
  });

  it('E9: accTitle, accDescr (one line and block), the `title` statement with its fix', () => {
    const m = E('  accTitle: Shop\n  accDescr {\n    multi\n    line\n  }\n  A');
    expect([m.accTitle, m.accDescr]).toEqual(['Shop', 'multi\nline']);
    expect([...m.entities.keys()]).toEqual(['A']);
    const code = 'erDiagram\n  title Order model\n  A\n';
    const t = parseER(code);
    expect(t.title).toBe('Order model');
    expect([...t.entities.keys()]).toEqual(['A']);
    const d = t.diagnostics.find((x) => x.code === 'er.title-statement')!;
    expect(d.severity).toBe('warning');
    expect(d.fix!.apply(code)).toBe('---\ntitle: Order model\n---\nerDiagram\n  A\n');
  });

  it('comments and directives are skipped; `%%` after a statement is an error (as in Mermaid)', () => {
    expect(E('  %% a comment\n  %%{init: {"theme": "dark"}}%%\n  A').diagnostics).toEqual([]);
    expect(errors(E('  A %% no'))).toEqual(['er.cannot-parse']);
  });
});

describe('ER subgraphs (11.17+)', () => {
  it('E6: members, titles, nesting, direction, relationships to a subgraph', () => {
    const m = E([
      '  subgraph S1 [My group]',
      '    A ||--o{ B : x',
      '    direction LR',
      '    subgraph S2',
      '      C',
      '    end',
      '  end',
      '  A ||--|| S1 : y',
    ].join('\n'));
    expect([...m.groups.values()].map((g) => [g.id, g.label, g.parent, g.children, g.dir ?? null, g.line, g.endLine])).toEqual([
      ['S1', 'My group', null, ['A', 'B', 'S2'], 'LR', 1, 7],
      ['S2', 'S2', 'S1', ['C'], null, 4, 6],
    ]);
    expect([...m.entities.values()].map((e) => [e.id, e.parent])).toEqual([['A', 'S1'], ['B', 'S1'], ['C', 'S2']]);
    expect(m.rels[1]).toMatchObject({ from: 'A', to: 'S1' });
    expect(m.direction).toBe('TB');
    expect(m.diagnostics).toEqual([]);
  });

  it('an entity is in the first subgraph that closes with it (inner first, then earlier siblings)', () => {
    const m = E('  subgraph X\n    A\n    subgraph Y\n      A\n    end\n  end\n  subgraph Z\n    A\n    B\n  end');
    expect(m.entities.get('A')!.parent).toBe('Y');
    expect(m.groups.get('Z')!.children).toEqual(['B']);
  });

  it('an unclosed subgraph and a stray `end` are errors', () => {
    expect(errors(E('  subgraph S\n    A'))).toEqual(['er.unclosed']);
    expect(errors(E('  A\n  end'))).toEqual(['er.cannot-parse']);
  });
});

describe('ER helpers', () => {
  it('erId quotes what Mermaid would not read as one word (E2)', () => {
    expect(['A', 'LINE-ITEM', 'Ünï', '😀', 'a.b', 'one', 'end', 'my id', '1', '42', 'class', 'u'].map(erId)).toEqual([
      'A', 'LINE-ITEM', 'Ünï', '😀', 'a.b', '"one"', '"end"', '"my id"', '"1"', '"42"', '"class"', 'u',
    ]);
  });
  it("isErWord agrees with Mermaid's lexer", () => {
    const ids = [
      'A', 'a.b', '.x', '-x', '--x', '*x', 'x*', 'one', 'oneX', 'one_x', 'one-x', 'only', 'many', 'manyX', 'many(1)', 'to', 'toX', 'to-x', 'u', 'u-x',
      'u.x', 'ux', '1', '1a', 'a1', '0+', '3.5', 'end', 'endX', 'end-x', 'class', 'classes', 'classDef', 'style', 'styles', 'subgraph', 'erDiagram',
      'direction', 'accTitle', 'Ünï', '😀', 'µs', 'x"y', 'x%y', 'x y', 'x:y', 'x,y', 'x[y]', 'x|o', 'o{', '|o', 'zero', 'optionally',
    ];
    for (const id of ids) {
      const t = lexLine(id);
      expect(isErWord(id), id).toBe(t.length === 1 && t[0]!.t === 'TEXT' && t[0]!.text === id);
    }
  });
  it('parseAttrLine reads Unicode, `type?` and comments', () => {
    expect(parseAttrLine('strïng? näme PK, FK (a comment)')).toEqual({ type: 'strïng?', name: 'näme', keys: ['PK', 'FK'], comment: 'a comment' });
    expect(parseAttrLine('作成日')).toEqual({ type: 'string', name: '作成日', keys: [], comment: '' });
    expect(parseAttrLine('string PK')).toBeNull();
    expect(parseAttrLine('a b c')).toBeNull();
  });
});

// ---- agreement with stock Mermaid --------------------------------------------------------------------------------

const EDGE_CASES: { name: string; src: string }[] = [
  ['no label', 'A ||--o{ B'],
  ['alias on a relationship', 'p[Person] ||--o{ B : x'],
  ['label words', 'A ||--o{ B : places order'],
  ['numbers', '42 ||--|| 3.5 : x\n1'],
  ['keyword id', 'one'],
  ['dotted lines', 'A |o.-o| B : x\nA }o-.|{ B : y'],
  ['all words', 'A one or zero to one or more B : a\nA zero or one optionally to one or many B : b\nA zero or more to zero or many B : c\nA many(0) to many(1) B : d\nA 0+ to 1+ B : e\nA only one to many B : f'],
  ['md parent', 'A u--o{ B : x'],
  ['classes', 'A:::foo,bar ||--o{ B:::baz : x\nclassDef foo fill:#f00,stroke:#00f\nclass A,B qux\nstyle A fill:#0f0'],
  ['class order', 'class A c\nstyle A fill:#f00\nA'],
  ['alias classes block', 'p["Person"]:::c {\n  string? a PK "x"\n}\nq[Q]:::c\nr:::c {}'],
  ['one-line block', 'A { string a int b }'],
  ['bad attribute', 'A {\n  only\n}'],
  ['direction TD', 'direction TD\nA'],
  ['acc', 'accTitle: Shop\naccDescr {\n  multi\n  line\n}\nA'],
  ['comment after', 'A %% no'],
  ['nested subgraphs', 'subgraph S1 [My group]\n  A ||--o{ B : x\n  direction LR\n  subgraph S2\n    C\n  end\nend\nA ||--|| S1 : y'],
  ['subgraph claims', 'subgraph X\n  A\n  subgraph Y\n    A\n  end\nend\nsubgraph Z\n  A\n  B\nend'],
  ['subgraph quoted', 'subgraph "My sub"\n  A\nend'],
  ['unclosed subgraph', 'subgraph S\n  A'],
  ['stray end', 'A\nend'],
  ['subgraph header junk', 'subgraph S [a] b\n  A\nend'],
  ['unicode', 'Ünïcødé ||--o{ 😀x : "r"\nÜnïcødé {\n  strïng näme PK\n}'],
  ['generic types', 'A {\n  list~string~ tags\n  `my type` `my name`\n}'],
  ['style values', 'A\nstyle A fill:#f9f,stroke:#333,stroke-width:4px,stroke-dasharray: 5 5'],
  ['class on a subgraph', 'subgraph S\n  A\nend\nclass S foo\nstyle S fill:#f00'],
].map(([name, src]) => ({ name: name!, src: `erDiagram\n${src}\n` }));

describe('ER: agreement with stock Mermaid 12.2 and 11.17 (mermaid.parse)', () => {
  it.each([...FIXTURES, ...EXAMPLES, ...EDGE_CASES].map((c) => [c.name, c.src]))('%s', async (_name, src) => {
    const ok = await stockOk(src);
    expect(errors(parseER(src)).length === 0, `mermaid ${ok ? 'accepts' : 'rejects'}: ${src}`).toBe(ok);
  });
  it('Mermaid accepts every docs sample and example', async () => {
    for (const c of [...FIXTURES, ...EXAMPLES]) expect(await stockOk(c.src), c.name).toBe(true);
  });
});

// ---- the model against Mermaid's own ErDB ------------------------------------------------------------------------

interface MermaidEntity {
  alias: string;
  cssClasses: string;
  cssStyles: string[];
  attributes: { type: string; name: string; keys: string[]; comment: string }[];
}
interface MermaidDB {
  clear(): void;
  getEntities(): Map<string, MermaidEntity>;
  getRelationships(): { entityA: string; entityB: string; roleA: string; relSpec: { cardA: string; cardB: string; relType: string } }[];
  getSubGraphs(): { id: string; nodes: string[]; title: string; classes: string[]; dir?: string }[];
  getClasses(): Map<string, { styles: string[] }>;
  getDirection(): string;
}
interface MermaidErModule {
  diagram: { parser: { parser: { yy: unknown }; parse(code: string): unknown }; readonly db: MermaidDB };
}

/** The chunk of a Mermaid package's bundle holding the ER parser and ErDB. */
function erChunk(pkg: string): string | null {
  const dir = join(ROOT, `node_modules/${pkg}/dist/chunks/mermaid.core`);
  const f = readdirSync(dir).find((x) => /^erDiagram-.*\.mjs$/.test(x));
  return f ? join(dir, f) : null;
}

/** Mermaid's preprocessing before a parser runs (frontmatter, directives, comment lines, a line break at the end). */
const prep = (code: string): string =>
  code.replace(/\r\n?/g, '\n').replace(/^-{3}\s*\n[\s\S]*?\n-{3}\s*\n+/, '').replace(/%%\{[\s\S]*?\}%%/g, '').replace(/^\s*%%(?!\{)[^\n]+\n?/gm, '').trimStart() + '\n';

const CARDS: Record<string, string> = { ZERO_OR_ONE: 'zero-one', ONLY_ONE: 'one', ZERO_OR_MORE: 'zero-many', ONE_OR_MORE: 'one-many', MD_PARENT: 'one' };
const norm = (s: string): string => s.replace(/<br\s*\/?>/gi, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

interface View {
  entities: string[];
  rels: string[];
  groups: string[];
  classDefs: string[];
  dir: string;
}

function mermaidView(db: MermaidDB): View {
  const subs = db.getSubGraphs();
  const subIds = new Set(subs.map((s) => s.id));
  const ents = [...db.getEntities()].filter(([k]) => !subIds.has(k));
  const byInternal = new Map<string, string>();
  [...db.getEntities()].forEach(([k], i) => byInternal.set(`entity-${k}-${i}`, k));
  const name = (x: string): string => byInternal.get(x) ?? x;
  const known = new Set([...ents.map(([k]) => k), ...subIds]);
  const parent = new Map<string, string>();
  for (let i = subs.length - 1; i >= 0; i--) for (const n of subs[i]!.nodes) parent.set(n, subs[i]!.id);
  return {
    entities: ents.map(([k, e]) => [
      k, norm(e.alias || k), parent.get(k) ?? '-', e.cssClasses.split(' ').filter((c) => c && c !== 'default').join(','), e.cssStyles.join(';'),
      e.attributes.map((a) => `${a.type} ${a.name} ${a.keys.join(',')} ${a.comment}`).join('|'),
    ].join(' / ')),
    rels: db.getRelationships().map((r) => `${name(r.entityA)} ${CARDS[r.relSpec.cardB]} ${r.relSpec.relType === 'IDENTIFYING' ? '--' : '..'} ${CARDS[r.relSpec.cardA]} ${name(r.entityB)} : ${norm(r.roleA)}`),
    groups: subs.map((s) => `${s.id} "${s.title}" in ${parent.get(s.id) ?? '-'} [${s.nodes.filter((n) => known.has(n)).join(',')}] ${s.dir ?? '-'} ${s.classes.join(',')}`).sort(),
    classDefs: [...db.getClasses().keys()].sort(),
    dir: db.getDirection(),
  };
}

function ourView(m: ErModel): View {
  const css = (st: object): string => Object.keys(st).length ? 'x' : '';
  return {
    entities: [...m.entities.values()].map((e) => [
      e.id, e.label, e.parent ?? '-', e.classes.join(','), css(e.style),
      e.attrs.map((a) => `${a.type} ${a.name} ${a.keys.join(',')} ${a.comment}`).join('|'),
    ].join(' / ')),
    rels: m.rels.map((r) => `${r.from} ${r.fromCard} ${r.identifying ? '--' : '..'} ${r.toCard} ${r.to} : ${r.label}`),
    groups: [...m.groups.values()].map((g) => `${g.id} "${g.label}" in ${g.parent ?? '-'} [${g.children.join(',')}] ${g.dir ?? '-'} ${g.classes.join(',')}`).sort(),
    classDefs: Object.keys(m.classDefs).sort(),
    dir: m.direction,
  };
}

for (const [version, pkg] of [['12.2', 'mermaid'], ['11.17', 'mermaid-11']] as const)
  describe(`ER: the model is the one Mermaid ${version}'s ErDB builds`, () => {
    const chunk = erChunk(pkg);
    let mod: MermaidErModule | null = null;
    beforeAll(async () => {
      if (chunk) mod = (await import(chunk)) as MermaidErModule;
    });
    const mermaidModel = (code: string): View => {
      const db = mod!.diagram.db;
      db.clear();
      mod!.diagram.parser.parser.yy = db;
      mod!.diagram.parser.parse(prep(code));
      const v = mermaidView(db);
      // Mermaid's styles as a flag (mmdx validates and keeps the ones it models)
      v.entities = v.entities.map((x) => x.split(' / ').map((p, i) => (i === 4 ? (p ? 'x' : '') : p)).join(' / '));
      return v;
    };

    it("Mermaid's ER parser is found in its bundle", () => {
      expect(chunk).not.toBeNull();
    });

    for (const c of [...FIXTURES, ...EXAMPLES, ...EDGE_CASES])
      it(c.name, async () => {
        if (!(await stockOk(c.src))) return; // only what Mermaid accepts has a model to compare
        expect(ourView(parseER(c.src))).toEqual(mermaidModel(c.src));
      });

    it('known difference: a `title` statement — Mermaid reads its words as entities, mmdx as the title', () => {
      const src = 'erDiagram\n  title My Title\n  A\n';
      expect(mermaidModel(src).entities.map((e) => e.split(' / ')[0])).toEqual(['title', 'My', 'Title', 'A']);
      expect([...parseER(src).entities.keys()]).toEqual(['A']);
    });
  });
