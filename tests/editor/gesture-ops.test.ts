// The gestures' shared history step (editor/ops/gesture.ts, X17): the transaction begins at the first write, the release commits one step, a cancel rolls back, and a click that never moved records nothing.
import { describe, expect, it } from 'vitest';
import { gestureTx, metaGesture } from '../../src/editor/ops/gesture.js';

const fake = (): { log: string[]; core: Parameters<typeof metaGesture>[0] } => {
  const log: string[] = [];
  return { log, core: { begin: () => void log.push('begin'), commit: (l: string) => void log.push(`commit ${l}`), rollback: () => void log.push('rollback'), draw: () => void log.push('draw') } };
};
const ev = {} as PointerEvent;

describe('metaGesture', () => {
  it('begins on the first move, writes and draws on every move, and commits one step on release', () => {
    const { log, core } = fake();
    let done = 0;
    const g = metaGesture(core, 'Move', (dx) => void log.push(`apply ${dx}`), () => done++);
    g.move(1, 0, ev);
    g.move(2, 0, ev);
    g.end!(ev);
    expect(log).toEqual(['begin', 'apply 1', 'draw', 'apply 2', 'draw', 'commit Move']);
    expect(done).toBe(1);
  });

  it('rolls back on cancel, and records nothing when it never moved', () => {
    const a = fake();
    const g = metaGesture(a.core, 'Move', () => undefined);
    g.move(1, 1, ev);
    g.cancel!();
    expect(a.log).toEqual(['begin', 'draw', 'rollback']);
    const b = fake();
    const h = metaGesture(b.core, 'Move', () => undefined);
    h.end!(ev);
    h.cancel!();
    expect(b.log).toEqual([]);
  });
});

describe('gestureTx', () => {
  it('begins once, and commits or rolls back only what began', () => {
    const { log, core } = fake();
    const tx = gestureTx(core);
    tx.commit('x');
    expect(tx.began).toBe(false);
    tx.begin();
    tx.begin();
    expect(tx.began).toBe(true);
    tx.commit('Bend');
    tx.rollback();
    expect(log).toEqual(['begin', 'commit Bend']);
  });
});
