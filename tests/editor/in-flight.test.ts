// @vitest-environment jsdom
// Edits in flight (a pointer gesture, an open transaction) against everything else that touches the document: remote
// updates wait for them, a load / undo / stage or mode switch cancels them, autosave waits, and the adapter's
// subscription follows the adapter.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DocumentAdapter } from '../../src/adapters/documents.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor, type EditorOptions } from '../../src/editor/editor.js';
import { DocStore } from '../../src/editor/store.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

// jsdom has no PointerEvent: a MouseEvent with a pointer id is all the editor reads
if (typeof globalThis.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (globalThis as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

const SRC = 'flowchart TB\n  A[Alpha] --> B[Beta]\n';
const REMOTE = 'flowchart TB\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n';

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function mount(o: EditorOptions = {}): DiagramEditor {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value: SRC, storage: memoryStorage(), ui: 'light', ...o });
  editors.push(ed);
  return ed;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const nodeEl = (core: EditorCore, id: string): Element => {
  const e = Array.from(core.dom.body.querySelectorAll('.el')).find((n) => n.getAttribute('data-kind') === 'node' && n.getAttribute('data-id') === id && !n.hasAttribute('data-part'));
  if (!e) throw new Error(`no node ${id}`);
  return e.querySelector('rect, path, polygon, ellipse, circle, text') ?? e;
};
const center = (core: EditorCore, id: string): { x: number; y: number } => {
  const g = core.geom;
  if (g.type !== 'flowchart') throw new Error('flowchart expected');
  const b = g.nodes.get(id)!;
  return core.toScreen({ x: b.x, y: b.y });
};
const pointer = (target: Element, type: string, x: number, y: number): void =>
  void target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7 }));

/** Presses node A and drags it by 40 px (a transaction is open); returns the release. */
function startDrag(ed: DiagramEditor): { move(dx: number): void; release(): void } {
  const core = ed.core;
  const c = center(core, 'A');
  pointer(nodeEl(core, 'A'), 'pointerdown', c.x, c.y);
  const move = (dx: number): void => pointer(core.dom.svg, 'pointermove', c.x + dx, c.y);
  move(20);
  move(40);
  return { move, release: () => pointer(core.dom.svg, 'pointerup', c.x + 40, c.y) };
}

function adapter(source = SRC): DocumentAdapter & { push(src: string, v: string): void; subs: number; saves: string[] } {
  let cb: ((s: string, v: string) => void) | null = null;
  const a = {
    subs: 0,
    saves: [] as string[],
    push: (src: string, v: string) => cb?.(src, v),
    load: async () => ({ source, version: '1' }),
    save: async (src: string) => {
      a.saves.push(src);
      return { version: String(a.saves.length + 1) };
    },
    subscribe(f: (s: string, v: string) => void) {
      cb = f;
      a.subs++;
      return () => {
        if (cb === f) cb = null;
        a.subs--;
      };
    },
  };
  return a;
}

describe('a remote update during a gesture', () => {
  it('waits for the gesture; a rolled-back drag (Esc) lets it apply', async () => {
    const a = adapter();
    const ed = mount({ adapter: a });
    await tick();
    const d = startDrag(ed);
    expect(ed.store.inTransaction).toBe(true);
    a.push(REMOTE, '2');
    // not applied mid-gesture, and the next move does not write over it either
    expect(ed.store.code.peek()).not.toContain('Gamma');
    d.move(60);
    ed.core.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    await tick();
    expect(ed.getSource()).toBe(REMOTE);
    // the drag's later moves and release change nothing
    d.move(80);
    d.release();
    expect(ed.getSource()).toBe(REMOTE);
    // undo goes back to before the remote update (the drag left no step)
    ed.undo();
    expect(ed.getSource()).toBe(SRC);
  });

  it('a committed drag makes the document dirty: the remote update offers Reload instead', async () => {
    const a = adapter();
    const ed = mount({ adapter: a });
    await tick();
    const d = startDrag(ed);
    a.push(REMOTE, '2');
    d.release();
    await tick();
    expect(ed.dirty).toBe(true);
    expect(ed.getSource()).not.toContain('Gamma');
    // a pill at the top centre (its block loads on first use)
    await vi.waitFor(() => expect(ed.core.slots['top-center'].querySelector('.mmdx-pill.remote')).not.toBeNull());
    const bar = ed.core.slots['top-center'].querySelector('.mmdx-pill.remote')!;
    expect(bar.querySelector('[role=status]')?.textContent).toBe('Changed by someone else');
    bar.querySelector<HTMLButtonElement>('[data-tool=reload]')!.click();
    expect(ed.getSource()).toBe(REMOTE);
    expect(ed.core.slots['top-center'].querySelector('.mmdx-pill')).toBeNull();
  });
});

describe('a load during a gesture', () => {
  it('setSource cancels the gesture: its later moves and release write nothing', () => {
    const ed = mount();
    const d = startDrag(ed);
    ed.setSource(REMOTE);
    expect(ed.store.inTransaction).toBe(false);
    expect(ed.getSource()).toBe(REMOTE);
    d.move(80);
    d.release();
    expect(ed.getSource()).toBe(REMOTE);
    expect(ed.store.canUndo.peek()).toBe(false);
  });
});

describe('switching the stage or the mode during a gesture', () => {
  it('opening History rolls the drag back; the release commits nothing', () => {
    const ed = mount();
    const d = startDrag(ed);
    expect(ed.getSource()).not.toBe(SRC);
    ed.core.stage.set('history');
    expect(ed.store.inTransaction).toBe(false);
    expect(ed.getSource()).toBe(SRC);
    d.move(80);
    d.release();
    expect(ed.getSource()).toBe(SRC);
    expect(ed.store.canUndo.peek()).toBe(false);
    ed.core.stage.set('document');
  });

  it('switching to View rolls the drag back', () => {
    const ed = mount();
    const d = startDrag(ed);
    ed.setMode('view');
    d.release();
    expect(ed.getSource()).toBe(SRC);
    expect(ed.store.canUndo.peek()).toBe(false);
  });
});

describe('undo during a gesture', () => {
  it('cancels the gesture, then undoes the step before it; redo still works', () => {
    const ed = mount();
    ed.setSource(REMOTE, { history: 'push' });
    const d = startDrag(ed);
    ed.undo();
    expect(ed.store.inTransaction).toBe(false);
    expect(ed.getSource()).toBe(SRC);
    d.move(80);
    d.release();
    expect(ed.getSource()).toBe(SRC);
    expect(ed.store.canRedo.peek()).toBe(true);
    ed.redo();
    expect(ed.getSource()).toBe(REMOTE);
  });

  it('the store itself ignores undo / redo inside a transaction', () => {
    const s = new DocStore();
    s.load('flowchart TB\n  A');
    s.setCode('flowchart TB\n  A --> B');
    s.begin();
    s.meta.peek().canvas.snap = 4;
    s.undo();
    expect(s.code.peek()).toBe('flowchart TB\n  A --> B');
    s.commit('Snap');
    s.undo();
    expect(s.meta.peek().canvas.snap).toBeUndefined();
    s.undo();
    expect(s.code.peek()).toBe('flowchart TB\n  A');
    expect(s.canRedo.peek()).toBe(true);
  });
});

describe('autosave during a gesture', () => {
  it('waits for the gesture to end', async () => {
    const a = adapter();
    const ed = mount({ adapter: a, autosave: 5 });
    await tick();
    ed.setSource(REMOTE, { history: 'push', markSaved: false });
    ed.core.change('Snap', () => void (ed.core.meta.canvas.snap = 4));
    const d = startDrag(ed);
    await new Promise((r) => setTimeout(r, 30));
    expect(a.saves).toEqual([]);
    d.release();
    await new Promise((r) => setTimeout(r, 30));
    expect(a.saves.length).toBe(1);
    expect(a.saves[0]).toBe(ed.getSource());
  });
});

describe('the adapter subscription', () => {
  it('follows the adapter: the old one is unsubscribed and ignored; clearing it unsubscribes', async () => {
    const a1 = adapter(), a2 = adapter();
    const ed = mount({ adapter: a1 });
    await tick();
    expect(a1.subs).toBe(1);
    ed.adapter = a2;
    await tick();
    expect(a1.subs).toBe(0);
    expect(a2.subs).toBe(1);
    a1.push(REMOTE, '9');
    expect(ed.getSource()).toBe(SRC);
    a2.push(REMOTE, '2');
    expect(ed.getSource()).toBe(REMOTE);
    ed.adapter = undefined;
    expect(a2.subs).toBe(0);
  });
});

describe('DocStore.load', () => {
  it('a pushed load drops the redo steps', () => {
    const s = new DocStore();
    s.load('flowchart TB\n  A');
    s.setCode('flowchart TB\n  A --> B');
    s.undo();
    expect(s.canRedo.peek()).toBe(true);
    s.load('flowchart TB\n  X', { history: 'push' });
    expect(s.canRedo.peek()).toBe(false);
    s.redo();
    expect(s.code.peek()).toBe('flowchart TB\n  X');
  });

  it('abandons an open transaction', () => {
    const s = new DocStore();
    s.load('flowchart TB\n  A');
    s.begin();
    s.meta.peek().canvas.snap = 4;
    s.load('flowchart TB\n  X', { history: 'push' });
    expect(s.inTransaction).toBe(false);
    s.commit('Late');
    s.undo();
    expect(s.code.peek()).toBe('flowchart TB\n  A');
    expect(s.meta.peek().canvas.snap).toBeUndefined();
  });
});
