// @vitest-environment jsdom
// History in the editor (component architecture §8.2, R11): open History, copy an item of an old version, go Back,
// paste it into the current document — even though the document no longer has it.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HistoryAdapter } from '../../src/adapters/history.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { loadKind } from '../../src/view/kinds.js';
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
    await wait(() => ed.historySession);
    const s = ed.historySession!;
    // opening shows the version panel only: nothing is compared until a version is picked
    expect(s.pair).toEqual({ base: null, head: null, viewing: null });
    expect(ed.core.stage.peek()).toBe('document');
    const panels = { ...ed.core.panels.peek() };
    s.setPair('v1', 'v2');
    await wait(() => s.getDiff());
    expect(s.pair).toMatchObject({ base: 'v1', head: 'v2' });
    // a comparison leaves the panels as they are (Code open stays open, as the diff's code; Changes stays closed);
    // Layers shows as its view settings
    expect(ed.core.panels.peek()).toEqual({ ...panels, 'view-settings': !!panels['layers'] });
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

describe('History: side by side in the editor', () => {
  it('draws both versions like the editor (its board, its page) and names each on badges at its page corner', async () => {
    host = document.createElement('div');
    document.body.append(host);
    ed = new DiagramEditor(host, { value: NOW, storage: memoryStorage(), ui: 'light', history: [{ id: 'v2', message: 'Now', author: 'Ann', source: NOW }, { id: 'v1', message: 'Old', author: 'Bob', source: OLD }] });
    ed.toggleHistory(true);
    await wait(() => ed.historySession);
    const s = ed.historySession!;
    s.setPair('v1', 'v2');
    await wait(() => s.getDiff());
    s.setView('side');
    const stage = ed.core.area.querySelector<HTMLElement>('.dx-stage')!;
    await wait(() => stage.querySelectorAll(':scope > .pane').length === 2);
    expect(stage.className).toBe('dx-stage side host-look');
    const panes = [...stage.querySelectorAll<HTMLElement>(':scope > .pane')];
    // no pane background: the editor's board shows through, and each page is drawn as the editor draws its own
    expect(panes.map((p) => p.style.background)).toEqual(['', '']);
    expect(panes.map((p) => p.querySelector('svg .page-layer')?.getAttribute('class'))).toEqual(['page-layer page-shadow', 'page-layer page-shadow']);
    // no title pinned to the pane: the diagram type and the version on badges at the page's corner
    expect(stage.querySelector('.pane-title')).toBeNull();
    const badges = panes.map((p) => p.querySelector<HTMLElement>(':scope > .dx-page-badges')!);
    await wait(() => badges.every((b) => !b.hidden));
    const t = ed.core.i18n.t;
    expect(badges.map((b) => b.querySelector('.dx-page-badge')!.textContent)).toEqual([t('type.flowchart'), t('type.flowchart')]);
    expect(badges.map((b) => b.querySelector('.dx-page-version b')!.textContent)).toEqual([t('diff.view.before'), t('diff.view.after')]);
    expect(badges.map((b) => b.querySelector('.dx-page-version span')!.textContent!.split(' · ').slice(0, 2))).toEqual([['v1', 'Bob'], ['v2', 'Ann']]);
    // they move with the page
    const was = badges.map((b) => b.style.transform);
    ed.core.canvas.viewport!.panBy(40, 25);
    ed.core.fire('view');
    expect(badges.map((b) => b.style.transform)).not.toEqual(was);
    // the single views keep the type badge only
    s.setView('merged');
    await wait(() => stage.querySelectorAll(':scope > .pane').length === 1);
    const single = stage.querySelector<HTMLElement>(':scope > .pane > .dx-page-badges')!;
    expect(single.querySelector('.dx-page-version')).toBeNull();
  });
});

describe('History: a version as it is', () => {
  const key = (k: string, mod = false): void =>
    void ed.core.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: mod, metaKey: mod, bubbles: true, cancelable: true, composed: true }));

  it('opening shows only the panel (the current version disabled); a picked version is read-only: select and copy, nothing writes; Esc goes back to the document', async () => {
    host = document.createElement('div');
    document.body.append(host);
    ed = new DiagramEditor(host, { value: NOW, storage: memoryStorage(), ui: 'light', history: [{ id: 'v2', message: 'Now', source: NOW }, { id: 'v1', message: 'Old', source: OLD }] });
    const root = host.shadowRoot!;
    ed.toggleHistory(true);
    await wait(() => root.querySelectorAll('.mmdx-panel.history .version').length === 2);
    // nothing changed but the panel: the document, editable, Shapes and Undo in the dock
    expect(ed.core.stage.peek()).toBe('document');
    expect(ed.core.version.peek()).toBeNull();
    expect(root.querySelector('.mmdx-pill')).toBeNull();
    // the current version is the document: selected on open
    const rows = (): NodeListOf<HTMLButtonElement> => root.querySelectorAll<HTMLButtonElement>('.mmdx-panel.history .version-main');
    expect(rows()[0]!.getAttribute('aria-current')).toBe('true');
    // switching to Compare and back shows nothing new
    root.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=compare]')!.click();
    root.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=history]')!.click();
    expect(ed.core.stage.peek()).toBe('document');

    // an old version, then the current one again: editing is back
    rows()[1]!.click();
    await wait(() => ed.core.version.peek()?.id === 'v1');
    expect(rows()[1]!.getAttribute('aria-current')).toBe('true');
    rows()[0]!.click();
    expect(ed.core.stage.peek()).toBe('document');
    expect(ed.core.version.peek()).toBeNull();
    expect(rows()[0]!.getAttribute('aria-current')).toBe('true');
    rows()[1]!.click();
    await wait(() => ed.core.version.peek()?.id === 'v1');
    expect(ed.core.stage.peek()).toBe('version');
    expect(ed.historySession!.pair).toEqual({ base: null, head: null, viewing: 'v1' });
    // drawn by the editor itself: the old node is on the canvas, the page too
    expect(ed.core.dom.body.querySelector('.el[data-kind=node][data-id=x]')).not.toBeNull();
    // read-only: no Shapes, Properties or Undo / Redo; the code shows the version and cannot be typed into
    expect(ed.core.root.dataset['stage']).toBe('version');
    expect(ed.core.code).toContain('x[Gone step]');
    ed.core.select([{ kind: 'node', id: 'x' }]);
    expect(ed.core.selection()).toEqual([{ kind: 'node', id: 'x' }]);
    // writes are refused while it shows
    expect(ed.core.applyCode({ code: 'flowchart LR\n  q --> r\n' }, 'Edit')).toBe(false);
    ed.core.undo();
    key('delete');
    expect(ed.getSource()).toBe(NOW);
    // the version exports as itself (the Export menu stays)
    expect(ed.core.exportFormats.peek().map((f) => f.id)).toEqual(['mmdx', 'mmd', 'svg', 'png']);
    let exported: { name: string; data: unknown } | null = null;
    host.addEventListener('mmdx-export', (e) => {
      exported = (e as CustomEvent<{ name: string; data: unknown }>).detail;
      e.preventDefault();
    }, { once: true });
    await ed.core.run('exportAs', 'mmdx');
    expect(exported!.name).toBe('diagram-v1.mmdx');
    expect(String(exported!.data)).toContain('x[Gone step]');
    // the action bar has Copy only; ⌘C copies the version's item
    const bar = root.querySelector<HTMLElement>('.ver-copy')!;
    expect(bar.hidden).toBe(false);
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Copy']);
    key('c', true);
    expect(ed.core.clipboard?.items).toEqual([{ kind: 'node', id: 'x' }]);
    // Esc (the selection first) goes back to the document; the panel stays
    key('escape');
    key('escape');
    expect(ed.core.stage.peek()).toBe('document');
    expect(ed.core.version.peek()).toBeNull();
    expect(ed.core.historyOpen.peek()).toBe(true);
    expect(root.querySelector('.ver-copy:not([hidden])')).toBeNull();
    // the copy pastes into the document
    ed.core.run('pasteAt');
    const after = ed.core.model;
    if (after.type !== 'flowchart') throw new Error();
    expect([...after.nodes.values()].map((n) => n.label)).toContain('Gone step');
  });
});

describe('History: the panel closed', () => {
  it('closing the panel keeps the version or comparison shown; the History button shows and hides the panel; Back then leaves History', async () => {
    host = document.createElement('div');
    document.body.append(host);
    ed = new DiagramEditor(host, { value: NOW, storage: memoryStorage(), ui: 'light', history: [{ id: 'v2', message: 'Now', source: NOW }, { id: 'v1', message: 'Old', source: OLD }] });
    ed.toggleHistory(true);
    await wait(() => ed.historySession);
    ed.historySession!.viewVersion('v1');
    await wait(() => ed.core.version.peek()?.id === 'v1');
    ed.core.run('setPanel', 'history', false);
    await new Promise((r) => setTimeout(r, 20));
    expect(ed.core.stage.peek()).toBe('version');
    expect(ed.historySession).not.toBeNull();
    // the History button: the panel again, nothing else changes
    ed.toggleHistory();
    expect(ed.core.panels.peek()['history']).toBe(true);
    expect(ed.core.version.peek()?.id).toBe('v1');
    // and hides it again: the History button is the panel's toggle while something is shown
    ed.toggleHistory();
    await new Promise((r) => setTimeout(r, 20));
    expect(ed.core.panels.peek()['history']).toBe(false);
    expect(ed.core.version.peek()?.id).toBe('v1');
    expect(ed.historySession).not.toBeNull();
    ed.toggleHistory();
    expect(ed.core.panels.peek()['history']).toBe(true);
    // a comparison stays too
    ed.historySession!.setPair('v1', 'v2');
    await wait(() => ed.historySession!.getDiff());
    ed.core.run('setPanel', 'history', false);
    await new Promise((r) => setTimeout(r, 20));
    expect(ed.core.stage.peek()).toBe('history');
    // Back with the panel closed: the document, History left
    ed.core.root.querySelector<HTMLButtonElement>('.mmdx-pill .mmdx-pill-btn')!.click();
    expect(ed.core.stage.peek()).toBe('document');
    expect(ed.historySession).toBeNull();
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
    expect(ed.core.historyOpen.peek()).toBe(true);
    expect(ed.getSource()).toBe(NOW);
    expect(events).not.toContain('mmdx-history-restore');
  });

  it('the working copy check reads neither the history nor the newest version on every document change', async () => {
    const a = gated(Promise.resolve());
    await open(a);
    await wait(() => a.lists > 0 && a.loads.includes('v2'));
    await new Promise((r) => setTimeout(r, 30));
    const newest = (): number => a.loads.filter((id) => id === 'v2').length;
    const n = newest(), lists = a.lists;
    for (const label of ['One', 'Two', 'Three']) {
      ed.setSource(`flowchart LR\n  a[${label}] --> b[End]\n`);
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 250));
    // the working copy's row follows the document without reading the history again (B10), nor the newest source
    expect(a.lists).toBe(lists);
    expect(newest()).toBe(n);
    ed.historySession!.setPair('v2', WORKING_COPY);
    await wait(() => ed.historySession!.getDiff()?.items.some((c) => c.status === 'changed'));
  });

  it('exportAs exports nothing while History shows no version and no comparison (B23)', async () => {
    await open(gated(Promise.resolve()));
    const exports: unknown[] = [];
    // the host takes the export (cancels the download)
    ed.core.host.addEventListener('mmdx-history-export', (e) => {
      exports.push((e as CustomEvent).detail);
      e.preventDefault();
    });
    await ed.historySession!.exportAs('mmdx');
    expect(exports).toEqual([]);
    ed.historySession!.setPair('v1', 'v2');
    await wait(() => ed.historySession?.getDiff());
    await ed.historySession!.exportAs('mmdx', { version: 'before' });
    expect(exports).toHaveLength(1);
  });

  it('destroying the host with History open closes it without giving the canvas back (no repaint, no event)', async () => {
    const { events } = await open(gated(Promise.resolve()));
    ed.historySession!.setPair('v1', 'v2');
    await wait(() => ed.historySession?.getDiff());
    const pop = vi.spyOn(ed.core, 'popScene');
    ed.destroy();
    expect(pop).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});
