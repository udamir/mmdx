// @vitest-environment jsdom
// A suspended module (History open, component architecture §7.2, §8.2) does not react: its listeners on the shared
// canvas and root, its effects and its late shortcuts are muted, and the DOM it created after install (inline text
// box, group-edit bar, style toolbar) goes away until it resumes. A file dropped in History never reaches the store.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor, type EditorOptions } from '../../src/editor/editor.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const FLOW = 'flowchart LR\n  subgraph G[Group]\n    A[Alpha] --> B[Beta]\n  end\n';

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});
const mount = (o: EditorOptions = {}): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value: FLOW, storage: memoryStorage(), ui: 'light', ...o });
  editors.push(ed);
  return ed;
};
const settle = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
const esc = (ed: DiagramEditor): void =>
  void ed.core.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));

describe('a suspended module does not react', () => {
  it('the late Esc links (leave group, clear selection) are muted in History and removed with the module', async () => {
    const ed = mount();
    await settle();
    ed.select([{ kind: 'node', id: 'A' }]);
    ed.core.setStage('history');
    esc(ed);
    expect(ed.core.selection().map((s) => s.id)).toEqual(['A']);
    ed.core.setStage('document');
    esc(ed);
    expect(ed.core.selection()).toEqual([]);
    ed.core.useModules([]);
    expect(ed.core.shortcuts.list(true).some((s) => s.id === 'deselect' || s.id === 'exit-group')).toBe(false);
  });

  it('a file dropped on the canvas in History is not loaded', async () => {
    const ed = mount({ features: { open: true } });
    const before = ed.getSource();
    ed.core.setStage('history');
    const ev = new Event('drop', { bubbles: true, composed: true, cancelable: true });
    const f = { name: 'x.mmd', text: async () => 'erDiagram\n  A ||--o{ B : has\n' } as unknown as File;
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [f], types: ['Files'] } });
    ed.core.dom.wrap.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    await settle(10);
    expect(ed.getSource()).toBe(before);
    ed.core.setStage('document');
  });

  it('group editing marks the group\'s items, shows no bar, and does not react in History', () => {
    const ed = mount();
    const marked = (): number => ed.core.dom.body.querySelectorAll('.el.in-edit').length;
    ed.core.run('enterGroup', 'G');
    expect(marked()).toBeGreaterThan(0);
    expect(ed.core.root.querySelector('.group-edit-bar')).toBeNull();
    ed.core.setStage('history');
    ed.core.enterGroup(null);
    ed.core.enterGroup('G');
    ed.core.fire('draw');
    expect(ed.core.root.querySelector('.group-edit-bar')).toBeNull();
    ed.core.setStage('document');
  });

  it('an open inline text box is cancelled when History opens', () => {
    const ed = mount();
    const before = ed.getSource();
    expect(ed.core.run('inlineEdit', { kind: 'node', id: 'B' })).toBe(true);
    const ta = ed.core.dom.wrap.querySelector<HTMLTextAreaElement>('textarea.inline-edit')!;
    ta.value = 'Bravo';
    ed.core.setStage('history');
    expect(ed.core.dom.wrap.querySelector('textarea.inline-edit')).toBeNull();
    expect(ed.getSource()).toBe(before);
    ed.core.setStage('document');
  });

  it('the style toolbar leaves in History and comes back', async () => {
    const ed = mount();
    ed.select([{ kind: 'node', id: 'A' }]);
    ed.core.fire('selection');
    const tb = (): Element | null => ed.core.dom.wrap.querySelector('.mtb');
    for (let i = 0; i < 100 && !tb(); i++) await settle(10);
    expect(tb()).not.toBeNull();
    ed.core.setStage('history');
    expect(tb()).toBeNull();
    ed.core.setStage('document');
    expect(tb()).not.toBeNull();
  });
});
