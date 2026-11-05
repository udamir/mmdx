// The sequence parser (A.9, T11.1): participants (aliases, `@{…}` with `type` and `alias`, `create`, `destroy`),
// Mermaid's 26 arrows and central connections read as its lexer reads them, notes, blocks, `autonumber` statements,
// `accTitle` / `accDescr`, `link` / `links` / `properties` / `details`, and the Mermaid 12.1 syntax 11.17 rejects;
// the model checked against Mermaid's own SequenceDB (12.2 and 11.17) over a corpus, and `mermaid.parse()` agreement.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { SeqMessage, SequenceModel } from '../../../src/core/model.js';
import { ARROW_KINDS, lexDecl, lexMessage, messageNumbers, parseSequence, shapeType } from '../../../src/core/parse/sequence.js';
import { stockResults } from '../../helpers/mermaid.js';

const P = (src: string) => parseSequence(`sequenceDiagram\n${src}`);
const msgs = (m: SequenceModel): SeqMessage[] => m.items.filter((i): i is SeqMessage => i.kind === 'message');
const codes = (m: SequenceModel) => m.diagnostics.map((d) => [d.code, d.severity, d.range?.line]);

describe('sequence participants', () => {
  it('reads participant / actor, aliases, create and @{ type }', () => {
    const m = P([
      '  participant A as Alice<br>Smith',
      '  actor B',
      '  participant DB@{ "type": "database" } as Store',
      '  create participant C',
      '  A->>C: hi',
      '  A->>D: there',
    ].join('\n'));
    expect(m.participants.map((p) => [p.id, p.label, p.kind, p.defLine, p.shape, p.created, p.createdBy])).toEqual([
      ['A', 'Alice\nSmith', 'participant', 1, undefined, undefined, undefined],
      ['B', 'B', 'actor', 2, undefined, undefined, undefined],
      ['DB', 'Store', 'participant', 3, 'database', undefined, undefined],
      ['C', 'C', 'participant', 4, undefined, true, 'm1'],
      ['D', 'D', 'participant', undefined, undefined, undefined, undefined],
    ]);
    expect('shape' in (m.participants[0] ?? {})).toBe(false);
    expect([...(m.participants[0]?.lines ?? [])]).toEqual([1, 5, 6]);
    expect(m.diagnostics).toEqual([]);
  });
  it('reads boxes with and without colour', () => {
    const m = P([
      '  box Aqua Team A',
      '    participant A',
      '  end',
      '  box rgb(10, 20, 30) Second',
      '    participant B',
      '  end',
      '  box Just a label',
      '    participant C',
      '  end',
      '  box #abc',
      '  end',
      '  box',
      '  end',
    ].join('\n'));
    expect(m.boxes.map((b) => [b.id, b.color, b.label, b.members, b.line, b.endLine])).toEqual([
      ['box1', 'Aqua', 'Team A', ['A'], 1, 3],
      ['box2', 'rgb(10, 20, 30)', 'Second', ['B'], 4, 6],
      ['box3', null, 'Just a label', ['C'], 7, 9],
      ['box4', '#abc', '', [], 10, 11],
      ['box5', null, '', [], 12, 13],
    ]);
    expect(m.participants.map((p) => p.box)).toEqual(['box1', 'box2', 'box3']);
    expect(m.diagnostics).toEqual([]);
  });
  it('@{ "alias" } (11.13+) is the label unless an `as` alias other than the id is written; unquoted keys too', () => {
    const m = P([
      '  participant A@{ "alias": "Alice" }',
      '  participant B@{ "type": "queue", "alias": "Jobs" } as Queue',
      '  participant C@{ alias: Carol } as C',
      '  participant D@{ type: database }',
    ].join('\n'));
    expect(m.participants.map((p) => [p.id, p.label, p.shape])).toEqual([
      ['A', 'Alice', undefined], ['B', 'Queue', 'queue'], ['C', 'Carol', undefined], ['D', 'D', 'database'],
    ]);
    expect(m.diagnostics).toEqual([]);
  });
  it('an id the way Mermaid lexes a declaration: spaces, hyphens, `as` only with a space after it', () => {
    expect(P('  participant Alice Smith').participants.map((p) => p.id)).toEqual(['Alice Smith']);
    expect(P('  participant my-svc as Service').participants.map((p) => [p.id, p.label])).toEqual([['my-svc', 'Service']]);
    expect(P('  PARTICIPANT A AS Big').participants.map((p) => [p.id, p.label])).toEqual([['A', 'Big']]);
    expect(lexDecl('  create actor A@{ "type": "actor" } as Al')).toMatchObject({ create: true, word: 'actor', id: 'A', idAt: 15, idEnd: 16, dataAt: 16, alias: 'Al', v12: '' });
    expect(lexDecl('participant A: x')).toBeNull();
  });
});

describe('sequence messages', () => {
  // [token, line, head, both, half, stick, reverse]
  const TABLE: [string, string, string, boolean, string | undefined, boolean, boolean][] = [
    ['->>', 'solid', 'arrow', false, undefined, false, false], ['-->>', 'dotted', 'arrow', false, undefined, false, false],
    ['->', 'solid', 'open', false, undefined, false, false], ['-->', 'dotted', 'open', false, undefined, false, false],
    ['-x', 'solid', 'cross', false, undefined, false, false], ['--x', 'dotted', 'cross', false, undefined, false, false],
    ['-)', 'solid', 'async', false, undefined, false, false], ['--)', 'dotted', 'async', false, undefined, false, false],
    ['<<->>', 'solid', 'arrow', true, undefined, false, false], ['<<-->>', 'dotted', 'arrow', true, undefined, false, false],
    ['-|\\', 'solid', 'arrow', false, 'top', false, false], ['-|/', 'solid', 'arrow', false, 'bottom', false, false],
    ['-\\\\', 'solid', 'arrow', false, 'top', true, false], ['-//', 'solid', 'arrow', false, 'bottom', true, false],
    ['--|\\', 'dotted', 'arrow', false, 'top', false, false], ['--|/', 'dotted', 'arrow', false, 'bottom', false, false],
    ['--\\\\', 'dotted', 'arrow', false, 'top', true, false], ['--//', 'dotted', 'arrow', false, 'bottom', true, false],
    ['/|-', 'solid', 'arrow', false, 'top', false, true], ['\\|-', 'solid', 'arrow', false, 'bottom', false, true],
    ['//-', 'solid', 'arrow', false, 'top', true, true], ['\\\\-', 'solid', 'arrow', false, 'bottom', true, true],
    ['/|--', 'dotted', 'arrow', false, 'top', false, true], ['\\|--', 'dotted', 'arrow', false, 'bottom', false, true],
    ['//--', 'dotted', 'arrow', false, 'top', true, true], ['\\\\--', 'dotted', 'arrow', false, 'bottom', true, true],
  ];
  it('the table covers Mermaid\'s 26 arrow tokens', () => expect(TABLE.map((r) => r[0]).sort()).toEqual(ARROW_KINDS.map(([a]) => a).sort()));
  it.each(TABLE)('%s', async (arrow, line, head, both, half, stick, reverse) => {
    const m = P(`  A${arrow}B: hello #quot;x#quot;`);
    const want: Record<string, unknown> = {
      kind: 'message', id: 'm1', from: 'A', to: 'B', text: 'hello "x"', arrow, line, head, both, activate: false, deactivate: false, src: 1,
    };
    if (half) want['half'] = half;
    if (stick) want['stick'] = true;
    if (reverse) want['reverse'] = true;
    expect(m.items).toEqual([want]);
    expect(m.diagnostics).toEqual([]);
    // with spaces around the arrow too, and both Mermaid versions read it
    expect(msgs(P(`  A ${arrow} B: x`)).map((x) => [x.from, x.arrow, x.to])).toEqual([['A', arrow, 'B']]);
    expect(await stockResults(`sequenceDiagram\n  A ${arrow} B: x`)).toEqual({ '12': true, '11': true });
  });
  it('reads +/- activation shorthands and activate / deactivate', () => {
    const m = P('  A->>+B: go\n  B-->>-A: back\n  activate A\n  deactivate A');
    expect(m.items.map((i) => (i.kind === 'message' ? [i.activate, i.deactivate] : [i.kind]))).toEqual([
      [true, false], [false, true], ['activate'], ['deactivate'],
    ]);
  });
  it('central connections: `()` at the receiver, the sender or both (no participant "()B")', () => {
    const m = P('  A->>()B: to\n  A()->>B: from\n  A()-->>()B: both\n  A ()->> () B: spaced');
    expect(msgs(m).map((x) => [x.from, x.to, x.arrow, x.central])).toEqual([
      ['A', 'B', '->>', 'to'], ['A', 'B', '->>', 'from'], ['A', 'B', '-->>', 'both'], ['A', 'B', '->>', 'both'],
    ]);
    expect(m.participants.map((p) => p.id)).toEqual(['A', 'B']);
    expect(m.diagnostics).toEqual([]);
    // Mermaid's grammar has no `()` together with `+` / `-`
    expect(codes(P('  A()->>+B: x'))).toEqual([['seq.cannot-parse', 'warning', 1]]);
  });
  it('actors as Mermaid lexes them: hyphens, slashes, parentheses, spaces; an arrow or `--` ends one', () => {
    expect(msgs(P('  my-svc->>Alice Smith: a\n  A/B-->>C(x): b\n  a-b-c-)d: c')).map((x) => [x.from, x.arrow, x.to])).toEqual([
      ['my-svc', '->>', 'Alice Smith'], ['A/B', '-->>', 'C(x)'], ['a-b-c', '-)', 'd'],
    ]);
    // `-x` starts an arrow: `a-xb` is `a` -x `b`
    expect(msgs(P('  a-xb: c')).map((x) => [x.from, x.arrow, x.to])).toEqual([['a', '-x', 'b']]);
    expect(lexMessage('  A ->>+ B : hi')).toMatchObject({ from: 'A', fromAt: 2, fromEnd: 3, arrow: '->>', arrowAt: 4, act: '+', markAt: 7, to: 'B', toAt: 9, toEnd: 10, colon: 11 });
    expect(lexMessage('A->>B')).toBeNull();
  });
});

describe('sequence notes and blocks', () => {
  it('reads notes', () => {
    const m = P('  Note left of A: x\n  note right of B: y\n  Note over A, B: z');
    expect(m.items.map((i) => (i.kind === 'note' ? [i.id, i.pos, i.targets, i.text] : null))).toEqual([
      ['n1', 'left of', ['A'], 'x'], ['n2', 'right of', ['B'], 'y'], ['n3', 'over', ['A', 'B'], 'z'],
    ]);
  });
  it('reads every block with else / and / option, nested', () => {
    const m = P([
      '  loop Every minute', '    alt ok', '      A->>B: a', '    else fail', '      A->>B: b', '    end', '  end',
      '  par one', '  and two', '  end',
      '  critical c', '  option o', '  end',
      '  opt maybe', '  end', '  break stop', '  end',
      '  rect rgba(0, 0, 255, .1)', '  end',
    ].join('\n'));
    const starts = m.items.filter((i) => i.kind === 'blockStart');
    expect(starts.map((b) => (b.kind === 'blockStart' ? [b.id, b.block, b.label, b.color, b.lines] : null))).toEqual([
      ['b1', 'loop', 'Every minute', null, [1, 7]],
      ['b2', 'alt', 'ok', null, [2, 4, 6]],
      ['b3', 'par', 'one', null, [8, 9, 10]],
      ['b4', 'critical', 'c', null, [11, 12, 13]],
      ['b5', 'opt', 'maybe', null, [14, 15]],
      ['b6', 'break', 'stop', null, [16, 17]],
      ['b7', 'rect', '', 'rgba(0, 0, 255, .1)', [18, 19]],
    ]);
    expect(m.items.filter((i) => i.kind === 'blockElse').map((i) => (i.kind === 'blockElse' ? [i.id, i.label] : null))).toEqual([
      ['b2', 'fail'], ['b3', 'two'], ['b4', 'o'],
    ]);
    expect(m.diagnostics).toEqual([]);
  });
});

describe('sequence autonumber (S2)', () => {
  const nums = (src: string): (number | undefined)[] => {
    const m = P(src);
    const n = messageNumbers(m);
    return msgs(m).map((x) => n.get(x.id));
  };
  it('reads every statement: on, a start, a start and a step, off', () => {
    const m = P('  autonumber\n  A->>B: a\n  autonumber 10\n  autonumber 1.5 0.25\n  autonumber off');
    expect(m.numbering).toEqual([{ line: 1, on: true }, { line: 3, on: true, start: 10 }, { line: 4, on: true, start: 1.5, step: 0.25 }, { line: 5, on: false }]);
    expect(m.autonumber).toBe(true);
    expect(P('  autonumber off\n  A->>B: a').autonumber).toBe(false);
    expect(codes(P('  autonumber on'))).toEqual([['seq.cannot-parse', 'warning', 1]]);
  });
  it('numbers as Mermaid: every message counts, numbered or not; a statement restarts or re-steps the counter', () => {
    expect(nums('  A->>B: a\n  B->>A: b')).toEqual([undefined, undefined]);
    expect(nums('  autonumber\n  A->>B: a\n  A->>A: self\n  B->>A: b')).toEqual([1, 2, 3]);
    expect(nums('  autonumber 10 5\n  A->>B: a\n  B->>A: b')).toEqual([10, 15]);
    // off stops; the hidden message still counts; `autonumber` alone carries on from there
    expect(nums('  autonumber\n  A->>B: a\n  autonumber off\n  B->>A: b\n  autonumber\n  A->>B: c')).toEqual([1, undefined, 3]);
    expect(nums('  A->>B: a\n  autonumber 100\n  B->>A: b\n  autonumber 0 2\n  A->>B: c\n  A->>B: d')).toEqual([undefined, 100, 101, 103]);
    expect(nums('  autonumber 0.1 0.1\n  A->>B: a\n  A->>B: b\n  A->>B: c')).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('sequence create and destroy (S6)', () => {
  it('the creating and destroying messages', () => {
    const m = P('  A->>B: hi\n  create participant C\n  B->>C: make\n  destroy C\n  C-->>B: bye');
    const c = m.participants.find((p) => p.id === 'C')!;
    expect([c.created, c.createdBy, c.destroyedBy, [...c.lines]]).toEqual([true, 'm2', 'm3', [2, 3, 4, 5]]);
    expect(m.diagnostics).toEqual([]);
  });
  it('Mermaid\'s rules: no creating an existing participant; the next message must be to it (destroy: from or to it)', () => {
    expect(codes(P('  A->>B: hi\n  create participant B\n  A->>B: x'))).toEqual([['seq.create-existing', 'warning', 2]]);
    expect(codes(P('  create participant C\n  A->>B: x'))).toEqual([['seq.create-message', 'warning', 2]]);
    expect(codes(P('  A->>B: x\n  destroy B\n  A->>A: y'))).toEqual([['seq.destroy-message', 'warning', 3]]);
  });
});

describe('sequence accessibility, links and properties (S12, S13)', () => {
  it('accTitle, accDescr on one line or in braces', () => {
    const m = P('  accTitle: Ordering\n  accDescr: How an order goes\n  A->>B: hi');
    expect([m.accTitle, m.accDescr, m.diagnostics]).toEqual(['Ordering', 'How an order goes', []]);
    expect(P('  accDescr {\n    first line\n    second line\n  }\n  A->>B: hi').accDescr).toBe('first line\nsecond line');
    expect(P('  accDescr { inline }').accDescr).toBe('inline');
  });
  it('link and links give the menu in order (a label again keeps its place); properties are kept; details is read as nothing', () => {
    const m = P([
      '  participant A',
      '  link A: Dashboard @ https://dash.example.com',
      '  links A: {"Wiki": "https://wiki.example.com?a&equals;1", "Dashboard": "https://dash2.example.com"}',
      '  properties A: {"class": "internal", "icon": "https://x.example.com/i.png"}',
      '  details A: element-id',
      '  A->>B: hi',
    ].join('\n'));
    const a = m.participants[0]!;
    expect(a.links).toEqual([{ label: 'Dashboard', url: 'https://dash2.example.com' }, { label: 'Wiki', url: 'https://wiki.example.com?a=1' }]);
    expect(a.properties).toEqual({ class: 'internal', icon: 'https://x.example.com/i.png' });
    expect([...a.lines]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(m.diagnostics).toEqual([]);
  });
  it('JSON Mermaid cannot read is reported', () => {
    expect(codes(P('  participant A\n  links A: {oops}'))).toEqual([['seq.bad-json', 'warning', 2]]);
  });
});

describe('Mermaid 12.1 syntax (S14)', () => {
  it.each([
    ['whitespace before @{', '  participant A @{ "type": "queue" }\n  A->>B: hi', 'A'],
    ['a hyphenated id with @{}', '  participant my-svc@{ "type": "queue" }\n  my-svc->>B: hi', 'my-svc'],
    ['Link as an id', '  participant Link\n  Link->>B: hi', 'Link'],
    ['Details as a message target', '  A->>Details: hi', 'Details'],
  ])('%s: read, reported as seq.v12-syntax, rejected by 11.17 only', async (_name, src, id) => {
    const m = P(src);
    expect(m.participants.map((p) => p.id)).toContain(id);
    expect(m.diagnostics.map((d) => [d.code, d.severity])).toEqual([['seq.v12-syntax', 'info']]);
    expect(await stockResults(`sequenceDiagram\n${src}`)).toEqual({ '12': true, '11': false });
  });
  it('`link A: …` is a statement only with an actor after the keyword', () => {
    const m = P('  links->>B: hi');
    expect(msgs(m).map((x) => x.from)).toEqual(['links']);
  });
});

describe('sequence misc', () => {
  it('keeps the title', () => {
    expect(P('  title: My flow').title).toBe('My flow');
    expect(P('  title Plain').title).toBe('Plain');
  });
  it('reports unknown lines and a stray else', () => {
    const m = P('  what is this\n  else x');
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['seq.cannot-parse', 1], ['seq.cannot-parse', 2]]);
    expect(m.items).toEqual([]);
  });
  it('does not mistake words starting with box for a box', () => {
    const m = P('  boxer->>A: hi');
    expect(m.boxes).toEqual([]);
    expect(m.participants.map((p) => p.id)).toEqual(['boxer', 'A']);
  });
});

// ---- the model against Mermaid's own SequenceDB ----------------------------------------------------------------

interface MermaidActor { description: string; type: string }
interface MermaidMessage { from?: string; to?: string; type: number; message: unknown; centralConnection?: number }
interface MermaidSequenceDB {
  getActors(): Map<string, MermaidActor>;
  getMessages(): MermaidMessage[];
  getCreatedActors(): Map<string, number>;
  getDestroyedActors(): Map<string, number>;
}
interface MermaidSequenceModule { diagram: { parser: { yy: unknown; parse(text: string): unknown }; readonly db: MermaidSequenceDB } }

const ROOT = join(__dirname, '../../..');
/** The sequence chunk of a Mermaid package's bundle (its file name changes between versions). */
const chunk = (pkg: string): string => {
  const dir = join(ROOT, `node_modules/${pkg}/dist/chunks/mermaid.core`);
  return join(dir, readdirSync(dir).find((f) => f.startsWith('sequenceDiagram-') && f.endsWith('.mjs'))!);
};

/** Mermaid's LINETYPE of each arrow token (sequenceDb.ts), and of the central connections. */
const LINETYPE: Record<string, number> = {
  '->>': 0, '-->>': 1, '-x': 3, '--x': 4, '->': 5, '-->': 6, '-)': 24, '--)': 25, '<<->>': 33, '<<-->>': 34,
  '-|\\': 41, '-|/': 42, '-\\\\': 43, '-//': 44, '/|-': 45, '\\|-': 46, '//-': 47, '\\\\-': 48,
  '--|\\': 51, '--|/': 52, '--\\\\': 53, '--//': 54, '/|--': 55, '\\|--': 56, '//--': 57, '\\\\--': 58,
};
const CENTRAL: Record<string, number> = { to: 59, from: 60, both: 61 };

const CORPUS = [
  'sequenceDiagram\n  participant A as Alice\n  actor B\n  A->>B: hi\n  B-->>A: back\n  A-xB: cross\n  A--)B: async\n  A<<->>B: both',
  'sequenceDiagram\n  participant A@{ "type": "database", "alias": "Store" }\n  participant C@{ "alias": "Carol" } as Cee\n  A->>C: x',
  'sequenceDiagram\n  A->>()B: to\n  A()->>B: from\n  A()->>()B: both\n  A-|\\B: half\n  B//-A: stick back\n  A--\\\\B: dotted stick',
  'sequenceDiagram\n  A->>B: hi\n  create participant C\n  B->>C: make\n  create actor D as Dee\n  C->>D: make\n  destroy C\n  C-->>B: bye\n  destroy D\n  B->>D: end',
  'sequenceDiagram\n  autonumber 5 2\n  my-svc->>Alice Smith: a\n  A/B-->>C(x): b\n  autonumber off\n  a-b-c-)d: c',
  // T10.2: every type; the block's type outranks the keyword
  'sequenceDiagram\n  participant A@{ "type": "boundary" }\n  participant B@{ type: control }\n  actor C@{ "type": "entity" }\n  participant D@{ "type": "collections" } as Docs\n  participant E@{ "type": "queue" }\n  actor F@{ "type": "participant" }\n  participant G@{ "type": "actor" }\n  A->>G: x',
  // (no `box`: Mermaid checks its colour through `window`)
  'sequenceDiagram\n  participant A\n  participant B\n  loop every\n    A->>+B: go\n    B-->>-A: back\n  end\n  Note over A,B: n\n  alt x\n    A->>B: 1\n  else y\n    A->>B: 2\n  end',
];

describe('participant types (T10.2)', () => {
  it('the block\'s type is the shape (participant → box), outranking the keyword; a type Mermaid does not draw warns', () => {
    const m = P('  actor A@{ "type": "participant" }\n  participant B@{ "type": "actor" }\n  participant C@{ "type": "robot" }\n  actor D\n  A->>B: x');
    expect(m.participants.map((p) => [p.id, p.shape])).toEqual([['A', 'box'], ['B', 'actor'], ['C', undefined], ['D', undefined]]);
    expect(m.participants[3]!.kind).toBe('actor');
    expect(m.diagnostics.filter((d) => d.code === 'seq.bad-type').map((d) => d.range?.line)).toEqual([3]);
  });
  it('shapes back to the types that write them: hcyl is the queue, rounded and stadium have none', () => {
    expect(['box', 'actor', 'boundary', 'queue', 'hcyl', 'rounded', 'stadium', 'participant'].map(shapeType)).toEqual(['participant', 'actor', 'boundary', 'queue', 'queue', null, null, null]);
  });
  it('the `properties` icon is kept in the model', () => {
    const m = P('  participant A\n  properties A: {"icon": "https://example.com/a.png", "class": "x"}\n  A->>A: hi');
    expect(m.participants[0]!.properties).toEqual({ icon: 'https://example.com/a.png', class: 'x' });
  });
});

describe('sequence: the model against Mermaid\'s SequenceDB (12.2 and 11.17)', () => {
  for (const pkg of ['mermaid', 'mermaid-11'])
    it.each(CORPUS)(`${pkg}: %s`, async (src) => {
      const mod = (await import(chunk(pkg))) as MermaidSequenceModule;
      const db = mod.diagram.db;
      mod.diagram.parser.yy = db;
      mod.diagram.parser.parse(src + '\n');
      const m = parseSequence(src);
      expect(m.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
      expect(m.participants.map((p) => [p.id, p.label, p.shape === 'box' ? 'participant' : p.shape ?? (p.kind === 'actor' ? 'actor' : 'participant')])).toEqual(
        [...db.getActors()].map(([id, a]) => [id, a.description, a.type]),
      );
      const theirs = db.getMessages().filter((x) => x.from && x.to && x.type !== 2); // 2: a note
      expect(msgs(m).map((x) => [x.from, x.to, LINETYPE[x.arrow], x.text, x.central ? CENTRAL[x.central] : 0])).toEqual(
        theirs.map((x) => [x.from, x.to, x.type, String(x.message), x.centralConnection ?? 0]),
      );
      // created / destroyed: Mermaid keeps the index of the signal that does it; mmdx the message
      const at = (i: number): string => {
        const sig = db.getMessages()[i]!;
        return `m${theirs.indexOf(sig) + 1}`;
      };
      expect(m.participants.filter((p) => p.createdBy).map((p) => [p.id, p.createdBy])).toEqual([...db.getCreatedActors()].map(([id, i]) => [id, at(i)]));
      expect(m.participants.filter((p) => p.destroyedBy).map((p) => [p.id, p.destroyedBy])).toEqual([...db.getDestroyedActors()].map(([id, i]) => [id, at(i)]));
    });
});
