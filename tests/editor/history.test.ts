// @vitest-environment jsdom
// History in the editor (component architecture §8.2, R11): open History, copy an item of an old version, go Back,
// paste it into the current document — even though the document no longer has it.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HistoryAdapter } from '../../src/adapters/history.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { loadKind } from '../../src/elements/kinds.js';
import { changeKey } from '../../src/core/diff/merge.js';
import { WORKING_COPY } from '../../src/diff/history.js';

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

describe('History: Restore, the working copy, destroy', () => {
  /** An adapter whose v1 source waits for `gate`; `loads` counts the source requests. */
  const gated = (gate: Promise<void>): HistoryAdapter & { loads: string[]; lists: number } => {
    const loads: string[] = [];
    return {
      loads,
      lists: 0,
      async list() {
        this.lists++;
        return { versions: [{ id: 'v2', message: 'Now' }, { id: 'v1', message: 'Old' }] };
      },
      async load(id) {
        loads.push(id);
        if (id === 'v1') await gate;
        return id === 'v1' ? OLD : NOW;
      },
    };
  };

  const open = async (history: HistoryAdapter): Promise<{ root: ShadowRoot; events: string[] }> => {
    host = document.createElement('div');
    document.body.append(host);
    const events: string[] = [];
    for (const t of ['mmdx-history-restore', 'mmdx-history-close', 'mmdx-history-error']) host.addEventListener(t, () => events.push(t));
    ed = new DiagramEditor(host, { value: NOW, storage: memoryStorage(), ui: 'light', history });
    ed.toggleHistory(true);
    await wait(() => ed.historySession);
    return { root: host.shadowRoot!, events };
  };

  /** Clicks Restore in the "⋮" menu of the History panel's version `i`. */
  const clickRestore = async (root: ShadowRoot, i: number): Promise<void> => {
    await wait(() => root.querySelector('.mmdx-panel.history [role=tab][data-tab=history]'));
    root.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=history]')!.click();
    await wait(() => root.querySelectorAll('.mmdx-stack .version .vmenu').length > i);
    root.querySelectorAll<HTMLButtonElement>('.mmdx-stack .version .vmenu')[i]!.click();
    root.querySelector<HTMLButtonElement>('[role=menu] .restore')!.click();
  };

  it('Restore restores nothing when Back was pressed while the version loaded', async () => {
    let release!: () => void;
    const { root, events } = await open(gated(new Promise<void>((r) => (release = r))));
    await clickRestore(root, 1);
    ed.historySession!.close();
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(ed.getSource()).toBe(NOW);
    expect(events).toEqual(['mmdx-history-close']);
  });

  it('a version that fails to load is an error, and History stays open', async () => {
    let fail!: (e: unknown) => void;
    const { root, events } = await open(gated(new Promise<void>((_, r) => (fail = r))));
    await clickRestore(root, 1);
    fail(new Error('HTTP 500'));
    await wait(() => events.includes('mmdx-history-error'));
    expect(ed.core.stage.peek()).toBe('history');
    expect(ed.getSource()).toBe(NOW);
    expect(events).not.toContain('mmdx-history-restore');
  });

  it('the working copy check reads the newest version once, not on every document change', async () => {
    const a = gated(Promise.resolve());
    await open(a);
    await wait(() => ed.historySession?.getDiff());
    const newest = (): number => a.loads.filter((id) => id === 'v2').length;
    const n = newest(), lists = a.lists;
    for (const label of ['One', 'Two', 'Three']) {
      ed.setSource(`flowchart LR\n  a[${label}] --> b[End]\n`);
      await new Promise((r) => setTimeout(r, 30));
    }
    // the list was read again on each change; the newest version's source was not
    expect(a.lists).toBe(lists + 3);
    expect(newest()).toBe(n);
    ed.historySession!.setPair('v2', WORKING_COPY);
    await wait(() => ed.historySession!.getDiff()?.items.some((c) => c.status === 'changed'));
  });

  it('destroying the host with History open closes it without giving the canvas back (no repaint)', async () => {
    const { events } = await open(gated(Promise.resolve()));
    await wait(() => ed.historySession?.getDiff());
    const pop = vi.spyOn(ed.core, 'popScene');
    ed.destroy();
    expect(pop).not.toHaveBeenCalled();
    expect(events).toEqual(['mmdx-history-close']);
  });
});
