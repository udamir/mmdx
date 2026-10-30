import { describe, expect, it } from 'vitest';
import { DocStore } from '../../src/editor/store.js';

const SRC = 'flowchart LR\n  a --> b\n';

describe('DocStore', () => {
  it('loads source and derives the model', () => {
    const s = new DocStore();
    s.load(SRC);
    expect(s.model.peek().type).toBe('flowchart');
    expect(s.source()).toBe(SRC);
    expect(s.dirty.peek()).toBe(false);
  });

  it('records one history step per transaction', () => {
    const s = new DocStore();
    s.load(SRC);
    s.begin();
    (s.meta.peek().nodes ??= {})['a'] = { x: 10, y: 10 };
    s.preview();
    s.meta.peek().nodes!['a']!.x = 20;
    s.commit('Move');
    expect(s.canUndo.peek()).toBe(true);
    expect(s.undoLabel()).toBe('Move');
    expect(s.dirty.peek()).toBe(true);
    s.undo();
    expect(s.source()).toBe(SRC);
    expect(s.canRedo.peek()).toBe(true);
    s.redo();
    expect(s.meta.peek().nodes!['a']).toEqual({ x: 20, y: 10 });
  });

  it('records nothing when a transaction changes nothing', () => {
    const s = new DocStore();
    s.load(SRC);
    s.begin();
    s.commit('Noop');
    expect(s.canUndo.peek()).toBe(false);
  });

  it('rolls a transaction back', () => {
    const s = new DocStore();
    s.load(SRC);
    s.begin();
    s.code.set('flowchart LR\n  x --> y');
    s.rollback();
    expect(s.source()).toBe(SRC);
    expect(s.canUndo.peek()).toBe(false);
  });

  it('moves %%@ lines typed into the code into metadata', () => {
    const s = new DocStore();
    s.load(SRC);
    s.setCode('flowchart LR\n  a --> b\n%%@ node a {"x":5,"y":6}');
    expect(s.code.peek()).not.toContain('%%@');
    expect(s.meta.peek().nodes?.['a']).toEqual({ x: 5, y: 6 });
  });

  it('keeps history within the byte budget', () => {
    const s = new DocStore({ historyBytes: 2000 });
    s.load(SRC);
    for (let i = 0; i < 100; i++) s.setCode(`flowchart LR\n  a --> b${i}`);
    let n = 0;
    while (s.canUndo.peek()) {
      s.undo();
      n++;
    }
    expect(n).toBeLessThan(100);
    expect(n).toBeGreaterThan(5);
  });

  it('a pushed load is undoable (remote update)', () => {
    const s = new DocStore();
    s.load(SRC);
    s.load('flowchart LR\n  a --> c\n', { history: 'push', reason: 'remote' });
    s.undo();
    expect(s.source()).toBe(SRC);
  });

  it('notifies changes with a reason', () => {
    const reasons: string[] = [];
    const s = new DocStore({ onChange: (_src, r) => reasons.push(r) });
    s.load(SRC);
    s.setCode('flowchart TB\n  a --> b');
    s.undo();
    expect(reasons).toEqual(['load', 'code', 'undo']);
  });
});
