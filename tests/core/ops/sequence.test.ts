import { describe, expect, it } from 'vitest';
import {
  activationsBalanced, activationsOf, addActivation, addNote, addParticipant, addSeqMessage, addSeqMessageAt, boxParticipants, deleteSeq,
  moveActivationEdge, moveStatement, relabelBox, relabelSeq, removeActivation, resizeBlockStep, seqInsertAfter, setNoteSpan,
  swapParticipant, toggleActivation, unboxParticipants, wrapBlock,
} from '../../../src/core/ops/index.js';
import { expectKept, expectParses, seq } from './helpers.js';

const CODE = `sequenceDiagram
  participant A
  participant B
  participant C
  A->>B: call
  B-->>A: reply
  loop every minute
    A->>C: ping
    Note over C: busy
  end
  C->>B: done
`;
const M = seq(CODE);
const L = (code: string): string[] => code.split('\n').map((l) => l.trim());

describe('sequence ops', () => {
  it('addParticipant declares every free participant in order', () => {
    const r = addParticipant(CODE, M, { kind: 'actor', label: 'The\nuser', beforeId: 'B' });
    expect(r.select).toEqual({ kind: 'participant', id: 'Actor1' });
    const m = seq(r.code);
    expectParses(CODE, r.code);
    expectKept(M, m);
    expect(m.participants.map((p) => p.id)).toEqual(['A', 'Actor1', 'B', 'C']);
    expect(m.participants[1]).toMatchObject({ kind: 'actor', label: 'The\nuser' });
    expect(seq(addParticipant(CODE, M).code).participants.map((p) => p.id)).toEqual(['A', 'B', 'C', 'P1']);
  });

  it('deleteSeq removes participants with their lines, messages, notes and blocks', () => {
    const p = seq(deleteSeq(CODE, M, [{ kind: 'participant', id: 'C' }]).code);
    expect(p.participants.map((x) => x.id)).toEqual(['A', 'B']);
    const b = deleteSeq(CODE, M, [{ kind: 'block', id: 'b1' }]);
    expect(L(b.code)).not.toContain('loop every minute');
    expect(L(b.code)).not.toContain('end');
    expectParses(CODE, b.code);
    const mm = seq(deleteSeq(CODE, M, [{ kind: 'message', id: 'm1' }, { kind: 'note', id: 'n1' }]).code);
    expect(mm.items.filter((x) => x.kind === 'message').length).toBe(3);
  });

  it('relabelSeq for participants, messages, notes and block conditions', () => {
    const p = seq(relabelSeq(CODE, M, { kind: 'participant', id: 'B' }, 'Back end').code);
    expect(p.participants[1]!.label).toBe('Back end');
    const m = seq(relabelSeq(CODE, M, { kind: 'message', id: 'm1' }, 'two\nlines $1').code);
    expect(m.items.find((x) => x.kind === 'message' && x.id === 'm1')).toMatchObject({ text: 'two\nlines $1' });
    const n = seq(relabelSeq(CODE, M, { kind: 'note', id: 'n1' }, 'idle').code);
    expect(n.items.find((x) => x.kind === 'note')).toMatchObject({ text: 'idle' });
    const b = seq(relabelSeq(CODE, M, { kind: 'block', id: 'b1' }, 'hourly').code);
    expect(b.items.find((x) => x.kind === 'blockStart')).toMatchObject({ label: 'hourly' });
    // an undeclared participant gets a declaration after the others
    const u = 'sequenceDiagram\n  X->>Y: hi\n';
    expect(seq(relabelSeq(u, seq(u), { kind: 'participant', id: 'Y' }, 'Why').code).participants.find((x) => x.id === 'Y')!.label).toBe('Why');
  });

  it('adds notes and messages at the right place', () => {
    const n = addNote(CODE, M, { over: 'A,B', afterLine: 4 });
    expect(n.line).toBe(5);
    expect(L(n.code)[5]).toBe('Note over A,B: note');
    expect(seqInsertAfter(M, CODE)).toBe(3);
    const top = addSeqMessageAt(CODE, M, 'C', 'A', null);
    expect(top.code.split('\n')[top.line]).toBe('  C->>A: message');
    const inLoop = addSeqMessageAt(CODE, M, 'C', 'A', 6);
    expect(inLoop.code.split('\n')[inLoop.line]).toBe('    C->>A: message');
    expectParses(CODE, inLoop.code);
    expect(addSeqMessage(CODE, 'A', 'B').line).toBe(11);
  });

  it('wrapBlock, boxes', () => {
    const w = wrapBlock(CODE, M, { block: 'opt', label: 'maybe', fromLine: 4, toLine: 5 });
    const wm = seq(w.code);
    expect(wm.items.filter((x) => x.kind === 'blockStart').map((x) => x.kind === 'blockStart' && x.block)).toEqual(['opt', 'loop']);
    expectParses(CODE, w.code);
    const rect = wrapBlock(CODE, M, { block: 'rect', fromLine: 4, toLine: 4 });
    expect(L(rect.code)[4]).toBe('rect rgb(240, 245, 255)');
    const b = boxParticipants(CODE, M, ['B', 'C'], 'Backend');
    expect(b.select).toEqual({ kind: 'box', id: 'box1' });
    const bm = seq(b.code);
    expectParses(CODE, b.code);
    expectKept(M, bm);
    expect(bm.boxes[0]).toMatchObject({ label: 'Backend', members: ['B', 'C'] });
    expect(bm.participants.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    const r = seq(relabelBox(b.code, bm, 'box1', 'Server side').code);
    expect(r.boxes[0]!.label).toBe('Server side');
    const u = seq(unboxParticipants(b.code, bm, 'box1').code);
    expect(u.boxes).toEqual([]);
    expect(boxParticipants(CODE, M, []).code).toBe(CODE);
  });

  it('activations: toggle, add, remove, move edges, balance check', () => {
    const t = toggleActivation(CODE, M, 'm1', 'm2');
    expect(t).toMatchObject({ participant: 'B', removed: false });
    expect(L(t.code).slice(4, 6)).toEqual(['A->>+B: call', 'B-->>-A: reply']);
    const tm = seq(t.code);
    expect(activationsOf(tm).map((a) => a.id)).toEqual(['B:1']);
    const back = toggleActivation(t.code, tm, 'm1', 'm2');
    expect(back).toMatchObject({ code: CODE, removed: true });
    // no shared participant: refused
    expect(toggleActivation(CODE, M, 'm2', 'm4').reason).toBeUndefined(); // B is shared (reply from B, done to B)
    expect(toggleActivation(CODE, M, 'm1', 'm1').reason).toBe('Pick two different messages');
    expect(toggleActivation(CODE, M, 'm1', 'zz').reason).toBe('Select two messages');
    const a = addActivation(CODE, M, 'C', 4, 10);
    expect(L(a.code)).toContain('activate C');
    expect(L(a.code)).toContain('deactivate C');
    const am = seq(a.code);
    expectParses(CODE, a.code);
    expect(activationsOf(am).map((x) => x.id)).toEqual(['C:1']);
    expect(addActivation(CODE, M, 'C', 5, 4).reason).toBe('Drag the process across at least one message');
    const mv = moveActivationEdge(a.code, am, 'C:1', 'bottom', 'm3');
    expect(mv.participant).toBe('C');
    expectParses(a.code, mv.code);
    expect(moveActivationEdge(a.code, am, 'C:1', 'top', 'm4').reason).toBeUndefined();
    const rm = removeActivation(a.code, am, 'C:1');
    expect(rm.code).toBe(CODE);
    expect(activationsBalanced('sequenceDiagram\n  A->>-B: x')).toBe(false);
    expect(activationsBalanced('sequenceDiagram\n  deactivate A')).toBe(false);
    expect(activationsBalanced(t.code)).toBe(true);
  });

  it('resizeBlockStep pulls in and pushes out one statement', () => {
    const grow = resizeBlockStep(CODE, M, 'b1', 'bottom', true);
    expect(L(grow.code).slice(6, 11)).toEqual(['loop every minute', 'A->>C: ping', 'Note over C: busy', 'C->>B: done', 'end']);
    expectParses(CODE, grow.code);
    const up = resizeBlockStep(CODE, M, 'b1', 'top', true);
    expect(up.start).toBe(5);
    const shrink = resizeBlockStep(CODE, M, 'b1', 'top', false);
    expect(L(shrink.code).slice(6, 8)).toEqual(['A->>C: ping', 'loop every minute']);
    const once = seq(shrink.code);
    expect(resizeBlockStep(shrink.code, once, 'b1', 'top', false).reason).toBe('A block needs at least one statement');
    expect(resizeBlockStep(CODE, M, 'zz', 'top', true).reason).toBe('Block not found');
  });

  it('note span, participant swap, statement moves', () => {
    const n = seq(setNoteSpan(CODE, M, 'n1', 'A', 'C').code);
    expect(n.items.find((x) => x.kind === 'note')).toMatchObject({ pos: 'over', targets: ['A', 'C'] });
    const s = swapParticipant(CODE, M, 'A', 1);
    expect(s.other).toBe('B');
    expect(seq(s.code).participants.map((p) => p.id)).toEqual(['B', 'A', 'C']);
    expect(swapParticipant(CODE, M, 'A', -1).reason).toBe('Already the first participant');
    const mv = moveStatement(CODE, M, { kind: 'message', id: 'm2' }, -1);
    expect(L(mv.code).slice(4, 6)).toEqual(['B-->>A: reply', 'A->>B: call']);
    expect(mv.line).toBe(4);
    // an activation would be unbalanced: refused
    const t = toggleActivation(CODE, M, 'm1', 'm2').code;
    expect(moveStatement(t, seq(t), { kind: 'message', id: 'm2' }, -1).reason).toMatch(/deactivate/);
    expect(moveStatement(CODE, M, { kind: 'message', id: 'm3' }, -1).reason).toBe('Already first in its group');
  });
});
