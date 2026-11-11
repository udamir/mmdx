// @vitest-environment jsdom
// The state diagram parser (T09.1): every row of the usage table (analysis.md §4.4), the headers, Mermaid's statement
// rules and the diagnostics with their fixes; Mermaid's own docs samples (tests/fixtures/mermaid-docs/state-*.mmd), the
// examples and edge cases parse as stock Mermaid 12.2 and 11.17 parses them — a source mmdx reads without errors is one Mermaid
// accepts, one Mermaid rejects gets an mmdx error (`classDef default` the one deliberate difference) — and, where
// Mermaid accepts, the states, composites, regions, transitions, notes, classes and directions are the ones Mermaid's
// own StateDB builds (its jison parser and data fetcher, loaded from Mermaid's bundle).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import type { StateGroup, StateModel, StateNode } from '../../../src/core/model.js';
import { detectType } from '../../../src/core/parse/dispatch.js';
import { parse } from '../../../src/core/parse/index.js';
import { isPseudo, parseState, pseudoId } from '../../../src/core/kinds/state/parse.js';
import { stockParse } from '../../helpers/mermaid.js';

const P = parseState;
const H = 'stateDiagram-v2\n';
const ROOT = join(__dirname, '../../..');
const FIXTURES = readdirSync(join(ROOT, 'tests/fixtures/mermaid-docs')).filter((f) => f.startsWith('state-')).map((f) => ({ name: f, src: readFileSync(join(ROOT, 'tests/fixtures/mermaid-docs', f), 'utf8') }));
const EXAMPLES = ['order-lifecycle.mmdx', 'traffic-light.mmdx'].map((f) => ({ name: f, src: splitSource(readFileSync(join(ROOT, 'examples', f), 'utf8')).doc.code }));
const fixture = (name: string): string => FIXTURES.find((f) => f.name === name)!.src;

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
});
const mermaidOk = async (code: string): Promise<boolean> => {
  try {
    await mermaidParse(code);
    return true;
  } catch {
    return false;
  }
};

const codes = (m: StateModel): string[] => m.diagnostics.map((d) => d.code);
const errors = (m: StateModel): string[] => m.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const node = (m: StateModel, id: string): StateNode => {
  const n = m.nodes.get(id);
  if (!n) throw new Error(`no state ${id}: ${[...m.nodes.keys()].join(', ')}`);
  return n;
};
const group = (m: StateModel, id: string): StateGroup => {
  const g = m.groups.get(id);
  if (!g) throw new Error(`no composite ${id}: ${[...m.groups.keys()].join(', ')}`);
  return g;
};
const edges = (m: StateModel): string[] => m.edges.map((e) => (e.label ? `${e.from}->${e.to}: ${e.label}` : `${e.from}->${e.to}`));
const fixOf = (m: StateModel, code: string): ((c: string) => string) => {
  const d = m.diagnostics.find((x) => x.code === code);
  if (!d?.fix) throw new Error(`no fix for ${code}`);
  return d.fix.apply;
};

describe('state: headers and type detection', () => {
  it('stateDiagram and stateDiagram-v2 are one type; the header is kept as written', () => {
    expect(detectType('stateDiagram\n  a')).toBe('state');
    expect(detectType('stateDiagram-v2\n  a')).toBe('state');
    expect(detectType('---\ntitle: x\n---\n%%{init: {"theme": "dark"}}%%\nstateDiagram-v2\n  a')).toBe('state');
    expect(parse('stateDiagram\n  a --> b').type).toBe('state');
    expect(P('stateDiagram\n  a')).toMatchObject({ header: 'stateDiagram', headerLine: 0 });
    expect(P('\n\nstateDiagram-v2\n  a')).toMatchObject({ header: 'stateDiagram-v2', headerLine: 2 });
    expect(errors(P('stateDiagram-v2\n  a'))).toEqual([]);
  });

  it('a missing header is an error', () => {
    expect(codes(P(''))).toEqual(['state.header']);
    expect(errors(P('a --> b'))).toContain('state.header');
  });
});

describe('state: the usage table (analysis.md §4.4)', () => {
  it('simple state: a lone id, and states made by transitions', () => {
    const m = P(`${H}  s1\n  a --> b`);
    expect([...m.nodes.keys()]).toEqual(['s1', 'a', 'b']);
    expect(node(m, 's1')).toMatchObject({ kind: 'state', label: 's1', descriptions: [], parent: null, region: 0, defLine: null });
    expect(m.groups.size).toBe(0);
    expect(m.diagnostics).toEqual([]);
  });

  it('description: `state "…" as id` and `id : text`; repeated texts are description rows after the title', () => {
    const m = P(`${H}  state "Long name" as s1\n  s2 : This is a state description\n  s1 : row one\n  s1 : row two`);
    expect(node(m, 's1')).toMatchObject({ label: 'Long name', descriptions: ['row one', 'row two'], defLine: 1 });
    expect(node(m, 's1').texts.map((t) => [t.form, t.line])).toEqual([['as', 1], ['colon', 3], ['colon', 4]]);
    expect(node(m, 's2')).toMatchObject({ label: 'This is a state description', descriptions: [], defLine: 2 });
    // the first text is the title whichever form gives it
    const c = P(`${H}  s : first\n  state "T" as s`);
    expect(node(c, 's')).toMatchObject({ label: 'first', descriptions: ['T'] });
    // `state "x" as id:more`: Mermaid splits at the colon, the rest is a row
    expect(node(P(`${H}  state "Title" as s1:extra`), 's1')).toMatchObject({ label: 'Title', descriptions: ['extra'] });
  });

  it('transition: `a --> b`, `a --> b : label`, a single `:` inside the label', () => {
    const m = P(`${H}  s1 --> s2\n  s1 --> s2: A transition\n  a --> b : time: 10:30`);
    expect(edges(m)).toEqual(['s1->s2', 's1->s2: A transition', 'a->b: time: 10:30']);
    expect(m.edges.map((e) => e.id)).toEqual(['s1->s2', 's1->s2#2', 'a->b']);
    expect(m.edges[1]).toMatchObject({ src: 2, index: 1, scope: null, region: 0 });
    const code = `${H}  s1 --> s2: A transition`;
    const e = P(code).edges[0]!;
    expect(code.slice(...e.fromAt)).toBe('s1');
    expect(code.slice(...e.toAt)).toBe('s2');
    expect(code.slice(...e.labelAt!)).toBe(': A transition');
  });

  it('start / end: `[*]` is one start and one end per scope', () => {
    const m = P(`${H}  [*] --> a\n  [*] --> b\n  a --> [*]\n  b --> [*]\n  state X {\n    [*] --> c\n    c --> [*]\n  }`);
    expect([...m.nodes.values()].filter((n) => n.kind === 'start' || n.kind === 'end').map((n) => [n.id, n.kind, n.parent, n.label])).toEqual([
      ['[*]start', 'start', null, ''],
      ['[*]end', 'end', null, ''],
      ['X/[*]start', 'start', 'X', ''],
      ['X/[*]end', 'end', 'X', ''],
    ]);
    expect(edges(m)).toEqual(['[*]start->a', '[*]start->b', 'a->[*]end', 'b->[*]end', 'X/[*]start->c', 'c->X/[*]end']);
    expect(pseudoId(null, 0, false)).toBe('[*]start');
    expect(pseudoId('X', 1, true)).toBe('X/2/[*]end');
    expect(['[*]start', 'X/[*]end', 'X/2/[*]start', 'start', 'a[*]start'].map(isPseudo)).toEqual([true, true, true, false, false]);
  });

  it('composite: nested to any depth, titled, a transition end', () => {
    const m = P(fixture('state-composite-nested.mmd'));
    expect([...m.groups.values()].map((g) => [g.id, g.parent, g.children])).toEqual([
      ['First', null, ['First/[*]start', 'Second']],
      ['Second', 'First', ['Second/[*]start', 'second', 'Third']],
      ['Third', 'Second', ['Third/[*]start', 'third', 'Third/[*]end']],
    ]);
    expect(node(m, 'third').parent).toBe('Third');
    expect(group(m, 'First')).toMatchObject({ label: 'First', line: 3, endLine: 15, regions: 1 });
    const t = P(`${H}  state "Named composite" as NC {\n    a\n  }\n  [*] --> NC\n  NC --> b : done`);
    expect(group(t, 'NC')).toMatchObject({ label: 'Named composite', children: ['a'] });
    expect(edges(t)).toEqual(['[*]start->NC', 'NC->b: done']);
    // one `X : title` line is the composite's title
    expect(group(P(fixture('state-composite.mmd')), 'NamedComposite').label).toBe('Another Composite');
    // transitions between composites
    expect(edges(P(fixture('state-composite-transitions.mmd'))).slice(0, 3)).toEqual(['[*]start->First', 'First->Second', 'First->Third']);
  });

  it('choice / fork / join, with << >> and [[ ]]', () => {
    const m = P(`${H}  state c <<choice>>\n  state f <<fork>>\n  state j <<join>>\n  state c2 [[choice]]\n  state f2 [[fork]]\n  state j2 [[join]]`);
    expect([...m.nodes.values()].map((n) => [n.id, n.kind, n.defLine])).toEqual([
      ['c', 'choice', 1], ['f', 'fork', 2], ['j', 'join', 3], ['c2', 'choice', 4], ['f2', 'fork', 5], ['j2', 'join', 6],
    ]);
    const forks = P(fixture('state-forks.mmd'));
    expect([node(forks, 'fork_state').kind, node(forks, 'join_state').kind]).toEqual(['fork', 'join']);
    expect(edges(P(fixture('state-choice.mmd')))).toContain('if_state->False: if n < 0');
  });

  it('notes: one line, several lines to `end note`; a floating note is ignored', () => {
    const m = P(fixture('state-notes.mmd'));
    expect(m.notes.map((n) => [n.id, n.target, n.side, n.text, n.line, n.endLine, n.multi])).toEqual([
      ['n1', 'State1', 'right', 'Important information! You can write\nnotes.', 2, 5, true],
      ['n2', 'State2', 'left', 'This is the note to the left.', 7, 7, false],
    ]);
    const f = P(`${H}  note "floating" as N1\n  a`);
    expect(f.notes).toEqual([]);
    expect([...f.nodes.keys()]).toEqual(['a']);
    expect(f.diagnostics).toEqual([]);
    const c = P(`${H}  state X {\n    a\n    note left of a\n      line one\n        indented\n    end note\n  }`);
    expect(c.notes[0]).toMatchObject({ target: 'a', scope: 'X', region: 0, text: 'line one\n  indented', line: 3, endLine: 6 });
  });

  it('concurrency: `--` separates regions, each with its own start and end', () => {
    const m = P(fixture('state-concurrency.mmd'));
    const g = group(m, 'Active');
    expect(g.regions).toBe(3);
    expect(g.blocks[0]!.dividers).toEqual([7, 11]);
    expect([node(m, 'NumLockOff').region, node(m, 'CapsLockOn').region, node(m, 'ScrollLockOff').region]).toEqual([0, 1, 2]);
    expect([...m.nodes.keys()].filter(isPseudo)).toEqual(['[*]start', 'Active/[*]start', 'Active/2/[*]start', 'Active/3/[*]start']);
    expect(m.edges.find((e) => e.to === 'CapsLockOff' && e.from.startsWith('Active'))).toMatchObject({ scope: 'Active', region: 1 });
    const r = P(`${H}  state X {\n    [*] --> a\n    a --> [*]\n    --\n    [*] --> b\n    b --> [*]\n  }`);
    expect(edges(r)).toEqual(['X/[*]start->a', 'a->X/[*]end', 'X/2/[*]start->b', 'b->X/2/[*]end']);
    expect(node(r, 'X/2/[*]end')).toMatchObject({ kind: 'end', parent: 'X', region: 1 });
  });

  it('direction: at the top and inside a composite (TB without)', () => {
    const m = P(fixture('state-direction.mmd'));
    expect(m).toMatchObject({ direction: 'LR', dirLine: 1 });
    expect(group(m, 'B').dir).toBe('LR');
    expect(P(`${H}  a`).direction).toBe('TB');
    expect(group(P(`${H}  state X {\n    a\n  }`), 'X').dir).toBeUndefined();
    for (const d of ['TB', 'BT', 'RL', 'LR'] as const) expect(P(`${H}  direction ${d}\n  a`).direction).toBe(d);
  });

  it('styling: classDef, `class a, b c`, `a:::c` in a transition, `style a,b …`', () => {
    const m = P(fixture('state-class-statement.mmd'));
    expect(m.classDefs).toEqual({
      notMoving: { fill: 'white' },
      movement: {},
      badBadEvent: { fill: '#f00', text: 'white', strokeWidth: 2, stroke: 'yellow' },
    });
    expect(m.classDefLines).toEqual({ notMoving: 6, movement: 7, badBadEvent: 8 });
    expect([node(m, 'Still').classes, node(m, 'Moving').classes, node(m, 'Crash').classes]).toEqual([['notMoving'], ['movement'], ['movement', 'badBadEvent']]);
    // `class end …` names no state: nothing is created
    expect(m.nodes.has('end')).toBe(false);
    const op = P(fixture('state-class-operator.mmd'));
    expect([node(op, 'Still').classes, node(op, 'Crash').classes]).toEqual([['notMoving'], ['movement', 'badBadEvent']]);
    expect(op.classDefLines['movement']).toBe(7);
    const s = P(`${H}  a --> b\n  style a,b fill:#f00,stroke:#333`);
    expect([node(s, 'a').style, node(s, 'b').style]).toEqual([{ fill: '#f00', stroke: '#333' }, { fill: '#f00', stroke: '#333' }]);
    // a class without a classDef is listed once
    expect(P(`${H}  a:::hot --> b:::hot`).undefinedClasses).toEqual([{ cls: 'hot', line: 1 }]);
  });

  it('`a:::c` on its own or with `: text` keeps no class (Mermaid only keeps it on transition ends)', () => {
    const m = P(`${H}  classDef c fill:#f00\n  a:::c\n  b:::c : text\n  d:::c --> e`);
    expect([node(m, 'a').classes, node(m, 'b').classes, node(m, 'd').classes]).toEqual([[], [], ['c']]);
    expect(node(m, 'b').label).toBe('text');
  });

  it('click: `click s "url" "tip"` and `click s href "url"`', () => {
    const m = P(`${H}  a --> b\n  click a "https://x.org" "Go to x"\n  click b href "https://y.org"`);
    expect([node(m, 'a').link, node(m, 'a').tooltip, node(m, 'b').link, node(m, 'b').tooltip]).toEqual(['https://x.org', 'Go to x', 'https://y.org', undefined]);
    expect(m.diagnostics).toEqual([]);
    const g = P(`${H}  state X {\n    a\n  }\n  click X "https://x.org" "tip"`);
    expect(group(g, 'X')).toMatchObject({ link: 'https://x.org', tooltip: 'tip' });
  });

  it('accessibility: accTitle, accDescr (one line and block), the frontmatter title', () => {
    const m = P(`---\ntitle: Order flow\n---\n${H}  accTitle: The title\n  accDescr: One line\n  a`);
    expect(m).toMatchObject({ title: 'Order flow', accTitle: 'The title', accDescr: 'One line' });
    const b = P(`${H}  accDescr {\n    first line\n    second line\n  }\n  a`);
    expect(b.accDescr).toBe('first line\nsecond line');
    expect([...b.nodes.keys()]).toEqual(['a']);
    expect(b.diagnostics).toEqual([]);
  });

  it('comments: `%%` lines and `#` lines; `%%` after `: label` is part of the label, after an id it ends it', () => {
    const m = P(`${H}  %% a comment\n  # also a comment\n  a --> b : x %% y\n  c %% trailing`);
    expect([...m.nodes.keys()]).toEqual(['a', 'b', 'c']);
    expect(edges(m)).toEqual(['a->b: x %% y']);
    expect(m.diagnostics).toEqual([]);
    expect(edges(P(fixture('state-comments.mmd')))).toContain('Moving->Still');
  });

  it('PlantUML leftovers: `hide empty description` and `scale 350 width` are accepted and ignored', () => {
    const m = P(`${H}  hide empty description\n  scale 350 width\n  a --> b`);
    expect([...m.nodes.keys()]).toEqual(['a', 'b']);
    expect(m.diagnostics).toEqual([]);
  });

  it('text: `<br/>` is a line break; `#9829;` inside a quoted state is an entity', () => {
    const m = P(`${H}  state "one<br/>two #9829;" as s\n  s --> t : a<br>b`);
    expect(node(m, 's').label).toBe('one\ntwo ♥');
    expect(m.edges[0]!.label).toBe('a\nb');
    expect(m.diagnostics).toEqual([]);
  });

  it('emoji and fa: tokens are kept as text', () => {
    const m = P(`${H}  a : 🚀 go\n  a --> b : ✅ fa:fa-check done`);
    expect(node(m, 'a').label).toBe('🚀 go');
    expect(m.edges[0]!.label).toBe('✅ fa:fa-check done');
  });

  it('layout config in the frontmatter or an init directive is ignored', () => {
    const m = P(`---\nconfig:\n  layout: elk\n  state:\n    nodeSpacing: 80\n    rankSpacing: 60\n    padding: 12\n---\n%%{init: {"state": {"padding": 4}}}%%\n${H}  a --> b`);
    expect(edges(m)).toEqual(['a->b']);
    expect(m.diagnostics).toEqual([]);
  });

  it('the docs samples read as the docs describe them', () => {
    const simple = P(fixture('state-simple.mmd'));
    expect(simple.title).toBe('Simple sample');
    expect(edges(simple)).toEqual(['[*]start->Still', 'Still->[*]end', 'Still->Moving', 'Moving->Still', 'Moving->Crash', 'Crash->[*]end']);
    expect(edges(P(fixture('state-older-renderer.mmd')))).toEqual(edges(simple));
    expect(P(fixture('state-older-renderer.mmd')).header).toBe('stateDiagram');
    expect(node(P(fixture('state-description-as.mmd')), 's2').label).toBe('This is a state description');
    expect(node(P(fixture('state-description-colon.mmd')), 's2').label).toBe('This is a state description');
    expect([...P(fixture('state-state-id.mmd')).nodes.keys()]).toEqual(['stateId']);
    const sp = P(fixture('state-spaces-in-names.mmd'));
    expect(node(sp, 'yswsii')).toMatchObject({ label: 'Your state with spaces in it', classes: ['yourState'] });
    const ex = P(EXAMPLES[0]!.src);
    expect(group(ex, 'Fulfilment').regions).toBe(2);
    expect(node(ex, 'Cart')).toMatchObject({ label: 'Shopping cart', descriptions: ['items and totals', 'editable by the customer'] });
    expect(ex.diagnostics).toEqual([]);
  });
});

describe("state: Mermaid's statement rules", () => {
  it('`;` ends a label: `a --> b : x; y` is a transition and the states `;` and `y`, with a warning and its fix', () => {
    const code = `${H}  a --> b : x; y`;
    const m = P(code);
    expect(edges(m)).toEqual(['a->b: x']);
    expect([...m.nodes.keys()]).toEqual(['a', 'b', ';', 'y']);
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line])).toEqual([['warning', 'state.semicolon', 1]]);
    const fixed = fixOf(m, 'state.semicolon')(code);
    expect(fixed).toBe(`${H}  a --> b : x#59; y`);
    const f = P(fixed);
    expect(edges(f)).toEqual(['a->b: x; y']);
    expect([...f.nodes.keys()]).toEqual(['a', 'b']);
    expect(f.diagnostics).toEqual([]);
  });

  it('`state My State {` is an error (one word); its block is still read', () => {
    const m = P(`${H}  state My State {\n    a\n  }\n  b`);
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['state.single-word', 1]]);
    expect(group(m, 'My').children).toEqual(['a']);
    expect(node(m, 'b').parent).toBeNull();
  });

  it('`direction TD` is two states in Mermaid: a warning with a fix to TB', () => {
    const code = `${H}  direction TD\n  a --> b`;
    const m = P(code);
    expect([...m.nodes.keys()]).toEqual(['direction', 'TD', 'a', 'b']);
    expect(m.direction).toBe('TB');
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line])).toEqual([['warning', 'state.td', 1]]);
    const fixed = fixOf(m, 'state.td')(code);
    expect(fixed).toBe(`${H}  direction TB\n  a --> b`);
    expect([...P(fixed).nodes.keys()]).toEqual(['a', 'b']);
    expect(P(fixed).diagnostics).toEqual([]);
  });

  it('`classDef default` is applied with a warning (stock Mermaid rejects it); the fix removes the line', () => {
    const code = `${H}  classDef default fill:#f00\n  a`;
    const m = P(code);
    expect(m.classDefs['default']).toEqual({ fill: '#f00' });
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line])).toEqual([['warning', 'state.classdef-default', 1]]);
    expect(fixOf(m, 'state.classdef-default')(code)).toBe(`${H}  a`);
  });

  it('a kind is set by the first mention: `<<choice>>` after a use is ignored, with a warning', () => {
    const m = P(`${H}  a --> c\n  state c <<choice>>`);
    expect(node(m, 'c').kind).toBe('state');
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line, d.params])).toEqual([['warning', 'state.kind-late', 2, { id: 'c', kind: 'choice' }]]);
    // declared first: no warning
    expect(P(`${H}  state c <<choice>>\n  a --> c`).diagnostics).toEqual([]);
  });

  it('a composite with description rows is an error (one title is fine)', () => {
    const m = P(`${H}  X : one\n  X : two\n  state X {\n    a\n  }`);
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line])).toEqual([['error', 'state.composite-description', 2]]);
    expect(group(m, 'X').label).toBe('one');
    expect(P(`${H}  X : one\n  state X {\n    a\n  }`).diagnostics).toEqual([]);
  });

  it('a transition between inner states of two composites is drawn, with a warning', () => {
    const m = P(`${H}  state A {\n    a\n  }\n  state B {\n    b\n  }\n  a --> b`);
    expect(edges(m)).toEqual(['a->b']);
    expect(m.diagnostics.map((d) => [d.severity, d.code, d.range?.line, d.params])).toEqual([['warning', 'state.cross-composite', 7, { from: 'a', to: 'b' }]]);
    // to a composite, or out to the top level: fine
    expect(P(`${H}  state A {\n    a\n  }\n  a --> b\n  b --> A`).diagnostics).toEqual([]);
  });

  it('a state is drawn in the last composite that mentions it; a top-level mention does not move it out', () => {
    const m = P(`${H}  state A {\n    x\n  }\n  state B {\n    x --> y\n  }\n  x --> z`);
    expect(node(m, 'x')).toMatchObject({ parent: 'B', region: 0, order: 1 });
    expect(group(m, 'A').children).toEqual([]);
    expect(group(m, 'B').children).toEqual(['x', 'y']);
    expect(node(m, 'x').lines).toEqual(new Set([2, 5, 7]));
    // a composite too
    const c = P(`${H}  state A {\n    state X {\n      x\n    }\n  }\n  state B {\n    X --> y\n  }`);
    expect(group(c, 'X').parent).toBe('B');
  });

  it('a state mentioned before its composite block becomes the composite', () => {
    const m = P(`${H}  a --> X\n  state X {\n    b\n  }`);
    expect(m.nodes.has('X')).toBe(false);
    expect(group(m, 'X')).toMatchObject({ parent: null, children: ['b'], order: 1 });
    expect(edges(m)).toEqual(['a->X']);
  });

  it('a composite written in two blocks is one composite', () => {
    const m = P(`${H}  state X {\n    a\n  }\n  state X {\n    b\n  }`);
    const g = group(m, 'X');
    expect(g.children).toEqual(['a', 'b']);
    expect(g.blocks.map((b) => [b.line, b.endLine])).toEqual([[1, 3], [4, 6]]);
    expect([g.line, g.endLine]).toEqual([1, 3]);
    expect(m.groups.size).toBe(1);
  });

  it('`state x` alone declares nothing (Mermaid draws no state)', () => {
    const m = P(`${H}  state x\n  a`);
    expect([...m.nodes.keys()]).toEqual(['a']);
    expect(m.diagnostics).toEqual([]);
  });

  it('the `{` of `state "x" as id` may be on the next line', () => {
    const m = P(`${H}  state "Long" as L\n  {\n    a\n  }`);
    expect(group(m, 'L')).toMatchObject({ label: 'Long', children: ['a'] });
    expect(m.diagnostics).toEqual([]);
  });

  it('a note may target a composite or a pseudo-state', () => {
    const m = P(`${H}  state X {\n    a\n  }\n  note right of X : on X\n  [*] --> X\n  note left of [*] : at the start`);
    expect(m.notes.map((n) => [n.target, n.side, n.text])).toEqual([['X', 'right', 'on X'], ['[*]start', 'left', 'at the start']]);
  });

  it('an unclosed composite is an error; its contents are kept', () => {
    const m = P(`${H}  state X {\n    a`);
    expect(m.diagnostics.map((d) => [d.code, d.range?.line, d.params])).toEqual([['state.unclosed', 1, { id: 'X' }]]);
    expect(node(m, 'a').parent).toBe('X');
  });

  it('a line Mermaid cannot read is an error; the next lines are still read', () => {
    const m = P(`${H}  a -> b\n  c --> d\n  e --> f --> g\n  h`);
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['state.syntax', 1], ['state.syntax', 3]]);
    expect(edges(m)).toContain('c->d');
    expect(m.nodes.has('h')).toBe(true);
  });
});

// ---- agreement with stock Mermaid 12.2 and 11.17 ---------------------------------------------------------------------------

const EDGE_CASES: { name: string; src: string }[] = [
  { name: 'semicolon in a label', src: `${H}  a --> b : x; y` },
  { name: 'direction TD', src: `${H}  direction TD\n  a --> b` },
  { name: 'unknown direction', src: `${H}  direction XY` },
  { name: 'kind after first use', src: `${H}  a --> c\n  state c <<choice>>` },
  { name: '[[ ]] kinds', src: `${H}  state c [[choice]]\n  state f [[fork]]\n  state j [[join]]\n  a --> c` },
  { name: 'PlantUML leftovers', src: `${H}  hide empty description\n  scale 350 width\n  a --> b` },
  { name: 'click forms', src: `${H}  a --> b\n  click a "https://x.org" "tip"\n  click b href "https://y.org"` },
  { name: 'accDescr block', src: `${H}  accTitle: T\n  accDescr {\n    one\n    two\n  }\n  a` },
  { name: '# comment', src: `${H}  # hello\n  a --> b` },
  { name: '%% in a label', src: `${H}  a --> b : x %% y` },
  { name: '{ on the next line', src: `${H}  state "Long" as L\n  {\n    a\n  }` },
  { name: 'state alone', src: `${H}  state x\n  a` },
  { name: 'floating note', src: `${H}  note "t" as N1\n  a` },
  { name: 'composite in two blocks', src: `${H}  state X {\n    a\n  }\n  state X {\n    b\n  }` },
  { name: '<br/> and an entity', src: `${H}  state "one<br/>two #9829;" as s\n  s --> t` },
  { name: 'emoji', src: `${H}  a : 🚀 go\n  a --> b : ✅` },
  { name: 'cross-composite transition', src: `${H}  state A {\n    a\n  }\n  state B {\n    b\n  }\n  a --> b` },
  { name: 'style', src: `${H}  a --> b\n  style a,b fill:#f00,stroke:#333` },
  { name: 'last composite mention', src: `${H}  state A {\n    x\n  }\n  state B {\n    x --> y\n  }\n  x --> z` },
  { name: 'composite last mention', src: `${H}  state A {\n    state X {\n      x\n    }\n  }\n  state B {\n    X --> y\n  }` },
  { name: 'colons in a label', src: `${H}  a --> b : time: 10:30` },
  { name: 'composite with one title', src: `${H}  X : one\n  state X {\n    a\n  }` },
  { name: 'stray }', src: `${H}  a\n  }` },
  { name: 'frontmatter title', src: `---\ntitle: Hello\n---\n${H}  a` },
  { name: 'regions with starts and ends', src: `${H}  state X {\n    [*] --> a\n    a --> [*]\n    --\n    [*] --> b\n    b --> [*]\n  }\n  [*] --> X\n  X --> [*]` },
  { name: 'nested regions', src: `${H}  state X {\n    a\n    --\n    state Y {\n      [*] --> b\n      --\n      c --> [*]\n    }\n  }` },
  { name: 'class line', src: `${H}  classDef hot fill:#f00\n  a --> b\n  class a, b hot` },
  { name: '::: alone and in a description', src: `${H}  classDef c fill:#f00\n  a:::c\n  b:::c : text\n  d:::c --> e` },
  { name: '::: on a composite', src: `${H}  classDef c fill:#f00\n  state X {\n    a\n  }\n  X:::c --> b\n  class X c` },
  { name: 'note in a composite', src: `${H}  state X {\n    a\n    note left of a\n      line one\n        indented\n    end note\n  }` },
  { name: 'notes on a composite and a start', src: `${H}  state X {\n    a\n  }\n  note right of X : on X\n  [*] --> X\n  note left of [*] : at the start` },
  { name: 'as with a colon', src: `${H}  state "Title" as s1:extra\n  s1 --> s2` },
  { name: 'composite after its use', src: `${H}  a --> X\n  state X {\n    b\n  }` },
  { name: '%% inside an id', src: `${H}  a%%b --> c` },
  { name: 'texts in both forms', src: `${H}  s : first\n  state "T" as s\n  s : row` },
  { name: 'repeated transitions', src: `${H}  a --> b\n  a --> b : again` },
  { name: 'unicode ids', src: `${H}  Ärger --> Größe : ü` },
  { name: 'directions in composites', src: `${H}  direction RL\n  state X {\n    direction LR\n    a --> b\n  }` },
  { name: 'a label of ";"', src: `${H}  a --> b : ;` },
  // rejected by Mermaid
  { name: 'state name of two words', src: `${H}  state My State {\n    a\n  }` },
  { name: 'composite with description rows', src: `${H}  X : one\n  X : two\n  state X {\n    a\n  }` },
  { name: 'no header', src: 'a --> b' },
  { name: 'unclosed composite', src: `${H}  state X {\n    a` },
  { name: 'single-dash arrow', src: `${H}  a -> b` },
  { name: 'missing target', src: `${H}  a -->` },
  { name: 'unclosed note', src: `${H}  a\n  note left of a\n    text` },
  { name: 'click without a URL', src: `${H}  a\n  click a` },
  { name: 'quoted state without as', src: `${H}  state "x"` },
  { name: '-- at the top level', src: `${H}  a\n  --\n  b` },
  { name: 'chained transitions', src: `${H}  a --> b --> c` },
  { name: 'empty label', src: `${H}  a --> b :` },
];

describe('state: agreement with stock Mermaid 12.2 and 11.17 (mermaid.parse)', () => {
  for (const c of [...FIXTURES, ...EXAMPLES, ...EDGE_CASES])
    it(c.name, async () => {
      const ok = await mermaidOk(c.src);
      expect(errors(P(c.src)).length === 0, `mermaid ${ok ? 'accepts' : 'rejects'}: ${c.src}`).toBe(ok);
    });

  it('every docs sample and example is one Mermaid accepts', async () => {
    for (const c of [...FIXTURES, ...EXAMPLES]) expect(await mermaidOk(c.src), c.name).toBe(true);
  });

  it('the deliberate difference: `classDef default` — Mermaid rejects it, mmdx warns and applies it', async () => {
    const src = `${H}  classDef default fill:#f00\n  a`;
    expect(await mermaidOk(src)).toBe(false);
    expect(errors(P(src))).toEqual([]);
    expect(codes(P(src))).toEqual(['state.classdef-default']);
  });

  it('every fix gives code Mermaid accepts', async () => {
    for (const code of [`${H}  a --> b : x; y`, `${H}  direction TD\n  a --> b`, `${H}  classDef default fill:#f00\n  a`]) {
      const m = P(code);
      const d = m.diagnostics.find((x) => x.fix)!;
      const fixed = d.fix!.apply(code);
      expect(await mermaidOk(fixed), fixed).toBe(true);
      expect(P(fixed).diagnostics, fixed).toEqual([]);
    }
  });
});

// ---- the model against Mermaid's own StateDB ---------------------------------------------------------------------

/** What Mermaid's StateDB gives (`getData()` after its jison parser ran). */
interface MermaidNode {
  id: string;
  shape: string;
  label?: unknown;
  description?: unknown;
  parentId?: string;
  isGroup?: boolean;
  cssClasses?: string;
  dir?: string;
}
interface MermaidEdge {
  start: string;
  end: string;
  label?: string;
  classes?: string;
}
type MermaidStateDB = { getData(): { nodes: MermaidNode[]; edges: MermaidEdge[]; direction: string } };
type MermaidStateParser = { yy: unknown; parse(text: string): unknown };
/** The state chunk's exports: 11.17 exports the parser and StateDB, 12.2 only the diagram (parser, and db as a getter). */
interface MermaidStateModule {
  StateDB?: new (version: number) => MermaidStateDB;
  stateDiagram_default?: MermaidStateParser;
  diagram?: { parser: MermaidStateParser; readonly db: MermaidStateDB };
}

/** The chunk of a Mermaid package's bundle holding the state parser and StateDB (its file name changes between versions). */
function stateChunk(pkg: string): string | null {
  const dir = join(ROOT, `node_modules/${pkg}/dist/chunks/mermaid.core`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    const t = readFileSync(join(dir, f), 'utf8');
    if (t.includes('var StateDB = class') && /export \{[^}]*\b(?:stateDiagram_default|diagram)\b/.test(t)) return join(dir, f);
  }
  return null;
}

/** Mermaid's preprocessing before a parser runs (mermaidAPI: frontmatter, directives, comment lines, entities). */
const prep = (code: string): string =>
  code
    .replace(/\r\n?/g, '\n')
    .replace(/^-{3}\s*\n[\s\S]*?\n-{3}\s*\n+/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '')
    .replace(/^\s*%%(?!\{)[^\n]+\n?/gm, '')
    .trimStart()
    .replace(/(?:style|classDef).*:\S*#.*;/g, (x) => x.slice(0, -1))
    .replace(/#\w+;/g, (x) => (/^#\+?\d+;$/.test(x) ? `ﬂ\xB0\xB0${x.slice(1, -1)}\xB6\xDF` : `ﬂ\xB0${x.slice(1, -1)}\xB6\xDF`)) + '\n';

/** Text compared loosely: Mermaid's encoded entities and sanitizing undone, `<br>` as a break, spaces collapsed. */
const norm = (s: unknown): string =>
  String(s ?? '')
    .replace(/ﬂ\xB0\xB0(\d+)\xB6\xDF/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

interface View {
  dir: string;
  states: string[];
  groups: string[];
  edges: string[];
  notes: string[];
}

/** Mermaid's nodes and edges in mmdx's terms: regions (Mermaid's divider groups) by index, pseudo-state ids mapped. */
function mermaidView(nodes: readonly MermaidNode[], edgeList: readonly MermaidEdge[], dir: string): View {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dividers = new Map<string, { comp: string; region: number }>();
  const count = new Map<string, number>();
  for (const n of nodes)
    if (n.shape === 'divider' && n.parentId) {
      const k = count.get(n.parentId) ?? 0;
      count.set(n.parentId, k + 1);
      dividers.set(n.id, { comp: n.parentId, region: k });
    }
  const scopeOf = (p: string | undefined): [string | null, number] => {
    if (!p || p === 'root') return [null, 0];
    const d = dividers.get(p);
    if (d) return [d.comp, d.region];
    const pn = byId.get(p);
    if (pn?.shape === 'noteGroup') return scopeOf(pn.parentId);
    return [p, 0];
  };
  const idOf = (id: string): string => {
    const n = byId.get(id);
    if (n && (n.shape === 'stateStart' || n.shape === 'stateEnd')) {
      const [sc, r] = scopeOf(id.replace(/_(?:start|end)$/, ''));
      return pseudoId(sc, r, n.shape === 'stateEnd');
    }
    return id;
  };
  const kind = (s: string): string => (s === 'stateStart' ? 'start' : s === 'stateEnd' ? 'end' : ['choice', 'fork', 'join'].includes(s) ? s : 'state');
  const states: string[] = [], groups: string[] = [], notes: string[] = [];
  for (const n of nodes) {
    if (n.shape === 'divider' || n.shape === 'noteGroup') continue;
    if (n.shape === 'note') {
      const e = edgeList.find((x) => x.end === n.id || x.start === n.id)!;
      notes.push(`${idOf(e.end === n.id ? e.start : e.end)}: ${norm(n.label)}`);
      continue;
    }
    const [sc, r] = scopeOf(n.parentId);
    const cls = [...new Set((n.cssClasses ?? '').split(' ').filter((c) => c && !c.startsWith('statediagram')))].join(',');
    const pseudo = n.shape === 'stateStart' || n.shape === 'stateEnd';
    const rows = Array.isArray(n.description) && n.description.length ? ` [${n.description.map(norm).join('|')}]` : '';
    if (n.isGroup) groups.push(`${n.id} in ${sc}/${r} "${norm(n.label)}" ${n.dir} .${cls}`);
    else states.push(`${idOf(n.id)} ${kind(n.shape)} in ${sc}/${r}${pseudo ? '' : ` "${norm(n.label)}"${rows}`} .${cls}`);
  }
  const es = edgeList.filter((e) => !e.classes?.includes('note-edge')).map((e) => `${idOf(e.start)}->${idOf(e.end)} "${norm(e.label)}"`);
  return { dir, states: states.sort(), groups: groups.sort(), edges: es.sort(), notes: notes.sort() };
}

function ourView(m: StateModel): View {
  const cls = (c: readonly string[]): string => [...new Set(c)].join(',');
  return {
    dir: m.direction,
    states: [...m.nodes.values()]
      .map((n) => {
        const pseudo = n.kind === 'start' || n.kind === 'end';
        const rows = n.descriptions.length ? ` [${n.descriptions.map(norm).join('|')}]` : '';
        return `${n.id} ${n.kind} in ${n.parent}/${n.region}${pseudo ? '' : ` "${norm(n.label)}"${rows}`} .${cls(n.classes)}`;
      })
      .sort(),
    groups: [...m.groups.values()].map((g) => `${g.id} in ${g.parent}/${g.region} "${norm(g.label)}" ${g.dir ?? 'TB'} .${cls(g.classes)}`).sort(),
    edges: m.edges.map((e) => `${e.from}->${e.to} "${norm(e.label)}"`).sort(),
    notes: m.notes.map((n) => `${n.target}: ${norm(n.text)}`).sort(),
  };
}

for (const [version, pkg] of [['12.2', 'mermaid'], ['11.17', 'mermaid-11']] as const)
describe(`state: the model is the one Mermaid ${version}'s StateDB builds`, () => {
  const chunk = stateChunk(pkg);
  let mod: MermaidStateModule | null = null;
  beforeAll(async () => {
    if (chunk) mod = (await import(chunk)) as MermaidStateModule;
  });
  const mermaidModel = (code: string): View => {
    const parser = mod!.diagram?.parser ?? mod!.stateDiagram_default!;
    const db = mod!.diagram ? mod!.diagram.db : new mod!.StateDB!(2);
    parser.yy = db;
    parser.parse(prep(code));
    const d = db.getData();
    return mermaidView(d.nodes, d.edges, d.direction);
  };

  it("Mermaid's state parser is found in its bundle", () => {
    expect(chunk).not.toBeNull();
  });

  for (const c of [...FIXTURES, ...EXAMPLES, ...EDGE_CASES])
    it(c.name, async () => {
      if (!(await mermaidOk(c.src))) return; // only what Mermaid accepts has a model to compare
      expect(ourView(P(c.src))).toEqual(mermaidModel(c.src));
    });

  it('known difference: `[*] : text` — Mermaid draws that start as a plain state with the text; mmdx keeps a start', () => {
    const src = `${H}  [*] : hi\n  [*] --> a`;
    expect(mermaidModel(src).states).toContain('root_start state in null/0 "hi" .');
    expect(node(P(src), '[*]start')).toMatchObject({ kind: 'start', label: '' });
  });
});
