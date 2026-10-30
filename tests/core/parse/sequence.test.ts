import { describe, it, expect } from 'vitest';
import { parseSequence } from '../../../src/core/parse/sequence.js';

const P = (src: string) => parseSequence(`sequenceDiagram\n${src}`);

describe('sequence participants', () => {
  it('reads participant / actor, aliases, create and @{ type }', () => {
    const m = P([
      '  participant A as Alice<br>Smith',
      '  actor B',
      '  participant DB@{ "type": "database" } as Store',
      '  create participant C',
      '  A->>D: hi',
    ].join('\n'));
    expect(m.participants.map((p) => [p.id, p.label, p.kind, p.defLine, p.shape, p.created])).toEqual([
      ['A', 'Alice\nSmith', 'participant', 1, undefined, undefined],
      ['B', 'B', 'actor', 2, undefined, undefined],
      ['DB', 'Store', 'participant', 3, 'database', undefined],
      ['C', 'C', 'participant', 4, undefined, true],
      ['D', 'D', 'participant', undefined, undefined, undefined],
    ]);
    expect('shape' in (m.participants[0] ?? {})).toBe(false);
    expect([...(m.participants[0]?.lines ?? [])]).toEqual([1, 5]);
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
});

describe('sequence messages', () => {
  it.each([
    ['->>', 'solid', 'arrow', false], ['-->>', 'dotted', 'arrow', false], ['->', 'solid', 'open', false],
    ['-->', 'dotted', 'open', false], ['-x', 'solid', 'cross', false], ['--x', 'dotted', 'cross', false],
    ['-)', 'solid', 'async', false], ['--)', 'dotted', 'async', false], ['<<->>', 'solid', 'arrow', true],
    ['<<-->>', 'dotted', 'arrow', true],
  ])('%s', (arrow, line, head, both) => {
    const m = P(`  A${arrow}B: hello #quot;x#quot;`);
    expect(m.items).toEqual([{
      kind: 'message', id: 'm1', from: 'A', to: 'B', text: 'hello "x"', line, head, both, activate: false, deactivate: false, src: 1,
    }]);
  });
  it('reads +/- activation shorthands and activate / deactivate', () => {
    const m = P('  A->>+B: go\n  B-->>-A: back\n  activate A\n  deactivate A');
    expect(m.items.map((i) => (i.kind === 'message' ? [i.activate, i.deactivate] : [i.kind]))).toEqual([
      [true, false], [false, true], ['activate'], ['deactivate'],
    ]);
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

describe('sequence misc', () => {
  it('keeps title and autonumber; ignores links / properties / details', () => {
    const m = P('  title: My flow\n  autonumber\n  link A: Doc @ https://x\n  links A: {}\n  properties A: {}\n  details A: {}');
    expect(m.title).toBe('My flow');
    expect(m.autonumber).toBe(true);
    expect(m.diagnostics).toEqual([]);
    expect(P('  title Plain').title).toBe('Plain');
  });
  it('destroy, accTitle and accDescr are reported as unsupported', () => {
    const m = P('  A->>B: x\n  destroy B\n  accTitle: t\n  accDescr: d');
    expect(m.diagnostics.map((d) => [d.code, d.severity, d.range?.line, d.message])).toEqual([
      ['seq.unsupported', 'warning', 2, 'cannot parse "destroy B"'],
      ['seq.unsupported', 'warning', 3, 'cannot parse "accTitle: t"'],
      ['seq.unsupported', 'warning', 4, 'cannot parse "accDescr: d"'],
    ]);
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
