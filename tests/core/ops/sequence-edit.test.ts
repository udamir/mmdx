// Sequence editing ops (T11.3): renames that splice only the alias (S3), a rect's colour safe from relabels, block
// branches (S8), message arrows, reversing and re-attaching (S10), note placement and stretching (S11). Every output is
// read by stock Mermaid 12.2 and 11.17.
import { describe, expect, it } from 'vitest';
import {
  addBranch, branchLabels, MESSAGE_ARROWS, reattachMessage, relabelBranch, relabelSeq, removeBranch, reverseMessage, setMessageArrow,
  setNotePlacement, setNoteSpan,
} from '../../../src/core/ops/index.js';
import type { SeqMessage } from '../../../src/core/model.js';
import { stockParse } from '../../helpers/mermaid.js';
import { seq } from './helpers.js';

const line = (code: string, i: number): string => code.split('\n')[i] ?? '';
const msg = (code: string, id: string): SeqMessage => seq(code).items.find((x): x is SeqMessage => x.kind === 'message' && x.id === id)!;

describe('rename keeps everything but the alias (S3)', () => {
  const rename = (decl: string, text: string): string => {
    const code = `sequenceDiagram\n  ${decl}\n  B->>A: hi\n`;
    const out = relabelSeq(code, seq(code), { kind: 'participant', id: 'A' }, text).code;
    return line(out, 1).trim();
  };
  it.each([
    ['participant A', 'Alice', 'participant A as Alice'],
    ['participant A as Old', 'New', 'participant A as New'],
    ['participant A as Old', 'A', 'participant A'],
    ['create participant A as Old', 'New', 'create participant A as New'],
    ['actor A@{ "type": "actor" }', 'Alice', 'actor A@{ "type": "actor" } as Alice'],
    ['participant A@{ "type": "queue" } as Jobs', 'Work', 'participant A@{ "type": "queue" } as Work'],
    ['participant A@{ "type": "queue", "alias": "Jobs" }', 'Work', 'participant A@{ "type": "queue", "alias": Work }'],
    ['participant A@{ "alias": "Jobs", "type": "queue" }', 'A', 'participant A@{ "type": "queue" }'],
    ['participant A@{ "alias": "Jobs" }', 'Two words', 'participant A@{ "alias": "Two words" }'],
    ['PARTICIPANT A AS Old', 'New', 'PARTICIPANT A AS New'],
  ])('%s → %j', async (decl, text, want) => {
    const got = rename(decl, text);
    expect(got).toBe(want);
    const out = `sequenceDiagram\n  ${got}\n  B->>A: hi\n`;
    expect(seq(out).participants[0]!.label).toBe(text);
    await stockParse(out);
  });
  it('a 12.1 declaration keeps its form (mmdx writes no new 12.1 syntax)', () => {
    expect(rename('participant A @{ "type": "queue" }', 'Jobs')).toBe('participant A @{ "type": "queue" } as Jobs');
  });
  it('a rect has no label: a relabel leaves its colour alone', () => {
    const code = 'sequenceDiagram\n  rect rgb(200, 220, 255)\n    A->>B: x\n  end\n';
    expect(relabelSeq(code, seq(code), { kind: 'block', id: 'b1' }, 'oops').code).toBe(code);
  });
});

describe('block branches (S8)', () => {
  const CODE = 'sequenceDiagram\n  participant A\n  participant B\n  alt ok\n    A->>B: yes\n  else fail\n    A->>+B: no\n    B-->>-A: back\n  end\n  par one\n    A->>B: x\n  end\n  loop l\n    A->>B: y\n  end\n';
  const M = seq(CODE);
  it('adds else / and / option before the end; a loop has none', async () => {
    const a = addBranch(CODE, M, 'b1');
    expect(branchLabels(seq(a.code), 'b1')).toEqual(['fail', 'otherwise']);
    expect(line(a.code, a.line!)).toBe('  else otherwise');
    await stockParse(a.code);
    const p = addBranch(CODE, M, 'b2', 'second');
    expect(line(p.code, p.line!)).toBe('  and second');
    await stockParse(p.code);
    const c = 'sequenceDiagram\n  critical c\n    A->>B: x\n  end\n';
    const r = addBranch(c, seq(c), 'b1');
    expect(seq(r.code).items.filter((x) => x.kind === 'blockElse').map((x) => (x.kind === 'blockElse' ? x.label : ''))).toEqual(['on failure']);
    await stockParse(r.code);
    expect(addBranch(CODE, M, 'b3')).toEqual({ code: CODE, reason: 'Only alt, par and critical blocks have branches' });
  });
  it('relabels a branch (0: the block itself), keeping its keyword', async () => {
    const r = relabelBranch(CODE, M, 'b1', 1, 'broken <b>');
    expect(line(r.code, 5)).toBe('  else broken <b>');
    expect(branchLabels(seq(r.code), 'b1')).toEqual(['broken <b>']);
    expect(seq(relabelBranch(CODE, M, 'b1', 0, 'fine').code).items.find((x) => x.kind === 'blockStart')).toMatchObject({ label: 'fine' });
    await stockParse(r.code);
  });
  it('deletes a branch with its statements', async () => {
    const r = removeBranch(CODE, M, 'b1', 1);
    expect(r.code.split('\n').slice(3, 6)).toEqual(['  alt ok', '    A->>B: yes', '  end']);
    await stockParse(r.code);
    expect(removeBranch(CODE, M, 'b1', 2).code).toBe(CODE);
  });
  it('refuses to delete a branch whose deactivation another one needs', () => {
    const c = 'sequenceDiagram\n  alt a\n    A->>+B: x\n  else b\n    B-->>-A: y\n  end\n';
    expect(removeBranch(c, seq(c), 'b1', 0).code).toBe(c);
    const late = 'sequenceDiagram\n  alt a\n    A->>B: z\n  else b\n    A->>+B: x\n  end\n  B-->>-A: y\n';
    expect(removeBranch(late, seq(late), 'b1', 1).reason).toBe('That would leave a deactivation without its activation');
  });
});

describe('message arrows, reverse, re-attach (S10)', () => {
  it('the ten arrows the editor offers: only the token changes, `()` and +/- stay; every one reads in Mermaid', async () => {
    expect(MESSAGE_ARROWS.flat()).toHaveLength(10);
    const code = 'sequenceDiagram\n  A ->>+ B : go\n  B-->>-A: back\n  A->>()B: c\n';
    for (const a of MESSAGE_ARROWS.flat()) {
      const r = setMessageArrow(code, seq(code), 'm1', a);
      expect(line(r.code, 1)).toBe(`  A ${a}+ B : go`);
      const c = setMessageArrow(code, seq(code), 'm3', a).code;
      expect(msg(c, 'm3')).toMatchObject({ arrow: a, central: 'to' });
      await stockParse(r.code);
      await stockParse(c);
    }
    // a half arrow is replaced like any other
    const h = 'sequenceDiagram\n  A-|\\B: x\n';
    expect(line(setMessageArrow(h, seq(h), 'm1', '-->>').code, 1)).toBe('  A-->>B: x');
  });
  it('reverse swaps the ends; a central circle stays with its participant; unbalanced processes are refused', async () => {
    const code = 'sequenceDiagram\n  A->>B: call\n  A()->>B: c\n  A->>A: self\n';
    const r = reverseMessage(code, seq(code), 'm1');
    expect(line(r.code, 1)).toBe('  B->>A: call');
    const c = reverseMessage(code, seq(code), 'm2');
    expect(line(c.code, 2)).toBe('  B->>()A: c');
    expect(msg(c.code, 'm2')).toMatchObject({ from: 'B', to: 'A', central: 'to' });
    await stockParse(r.code);
    await stockParse(c.code);
    expect(reverseMessage(code, seq(code), 'm3').reason).toBe('A message to itself has no direction to reverse');
    const act = 'sequenceDiagram\n  A->>+B: go\n  B-->>-A: back\n';
    expect(reverseMessage(act, seq(act), 'm1').reason).toMatch(/not active/);
  });
  it('re-attaches one end; the same participant as the other end makes a self message', async () => {
    const code = 'sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>B: call\n';
    const r = reattachMessage(code, seq(code), 'm1', 'to', 'C');
    expect(line(r.code, 4)).toBe('  A->>C: call');
    const f = reattachMessage(code, seq(code), 'm1', 'from', 'C');
    expect(line(f.code, 4)).toBe('  C->>B: call');
    expect(line(reattachMessage(code, seq(code), 'm1', 'to', 'A').code, 4)).toBe('  A->>A: call');
    await stockParse(r.code);
    await stockParse(f.code);
    const act = 'sequenceDiagram\n  A->>+B: go\n  B-->>-A: back\n';
    expect(reattachMessage(act, seq(act), 'm1', 'to', 'C').reason).toMatch(/not active/);
  });
});

describe('note placement (S11)', () => {
  const CODE = 'sequenceDiagram\n  participant A\n  participant B\n  note left of A: x\n  Note over A,B: y\n';
  const M = seq(CODE);
  it('left of, right of, over: the keyword and text stay; a note over two goes beside the first', async () => {
    expect(line(setNotePlacement(CODE, M, 'n1', 'right of').code, 3)).toBe('  note right of A: x');
    expect(line(setNotePlacement(CODE, M, 'n1', 'over').code, 3)).toBe('  note over A: x');
    expect(line(setNotePlacement(CODE, M, 'n2', 'left of').code, 4)).toBe('  Note left of A: y');
    expect(setNotePlacement(CODE, M, 'n1', 'left of').code).toBe(CODE);
    for (const pos of ['left of', 'right of', 'over'] as const) await stockParse(setNotePlacement(CODE, M, 'n2', pos).code);
  });
  it('stretching keeps left of / right of while the note covers one participant', () => {
    expect(line(setNoteSpan(CODE, M, 'n1', 'A', 'A').code, 3)).toBe('  note left of A: x');
    expect(line(setNoteSpan(CODE, M, 'n1', 'A', 'B').code, 3)).toBe('  note over A,B: x');
    expect(line(setNoteSpan(CODE, M, 'n2', 'B', 'B').code, 4)).toBe('  Note over B: y');
  });
});
