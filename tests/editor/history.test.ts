// @vitest-environment jsdom
// History in the editor (component architecture §8.2, R11): open History, copy an item of an old version, go Back,
// paste it into the current document — even though the document no longer has it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { loadKind } from '../../src/elements/kinds.js';
import { changeKey } from '../../src/core/diff/merge.js';

beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  await loadKind('flowchart');
});

const wait = async (f: () => unknown, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const OLD = 'flowchart LR\n  a[Start] --> x[Gone step]\n  x --> b[End]\n';
const NOW = 'flowchart LR\n  a[Start] --> b[End]\n';

let host: HTMLElement;
let ed: DiagramEditor;
afterEach(() => {
  ed?.destroy();
  host?.remove();
});

describe('History in the editor', () => {
  it('copies an item from an old version and pastes it after Back', async () => {
    host = document.createElement('div');
    document.body.append(host);
    ed = new DiagramEditor(host, { value: NOW, storage: memoryStorage(), ui: 'light', history: [{ id: 'v2', message: 'Now', source: NOW }, { id: 'v1', message: 'Old', source: OLD }] });
    ed.toggleHistory(true);
    await wait(() => ed.historySession?.getDiff());
    const s = ed.historySession!;
    expect(s.pair).toMatchObject({ base: 'v1', head: 'v2' });
    // the pill names the two versions; its swap button and X exchange Before and After
    const pill = ed.core.root.querySelector('.mmdx-pill')!;
    await wait(() => pill.querySelector('[role=status]')!.textContent === 'v1 → v2');
    pill.querySelector<HTMLButtonElement>('[data-tool=swap]')!.click();
    expect(s.pair).toMatchObject({ base: 'v2', head: 'v1' });
    ed.core.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true, composed: true }));
    expect(s.pair).toMatchObject({ base: 'v1', head: 'v2' });
    await wait(() => s.getDiff()?.items.some((c) => c.id === 'x' && c.status === 'removed'));
    // the removed node, on the Before side
    s.setView('before');
    // select it once the comparison is drawn (mmdx-history-select carries the change)
    let selected: unknown = null;
    host.addEventListener('mmdx-history-select', (e) => (selected = (e as CustomEvent<{ change: unknown }>).detail.change));
    const key = changeKey({ kind: 'node', id: 'x', status: 'removed' });
    await wait(() => {
      s.select(key);
      return selected;
    });
    ed.core.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true, composed: true }));
    // the clipboard ops load on the first copy
    await wait(() => ed.core.clipboard);
    expect(ed.core.clipboard?.items).toEqual([{ kind: 'node', id: 'x' }]);
    // the document was never written
    expect(ed.getSource()).toBe(NOW);
    s.close();
    expect(ed.core.stage.peek()).toBe('document');
    ed.core.run('pasteAt');
    const after = ed.core.model;
    if (after.type !== 'flowchart') throw new Error();
    expect([...after.nodes.values()].map((n) => n.label)).toContain('Gone step');
    expect(after.nodes.has('x')).toBe(false); // a copy: a fresh id
  });
});
