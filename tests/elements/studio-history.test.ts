// @vitest-environment jsdom
// History is part of the editor and the viewer (component architecture §8): their History button enters the `history`
// stage in their own canvas and panels. The studio only provides the versions (an example's history and the versions
// saved in the studio).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramStudio } from '../../src/elements/studio.js';
import { DiagramViewer } from '../../src/elements/viewer.js';
import { loadKind } from '../../src/view/kinds.js';
import { memoryStorage } from '../../src/adapters/storage.js';

const files: Record<string, string> = {
  '/examples/index.json': readFileSync('examples/index.json', 'utf8'),
  '/examples/simple-flow.mmdx': readFileSync('examples/simple-flow.mmdx', 'utf8'),
  '/examples/history/simple-flow.json': readFileSync('examples/history/simple-flow.json', 'utf8'),
};
const versions = JSON.parse(files['/examples/history/simple-flow.json']!).versions;
const newest = versions[0];

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const wait = async (f: () => unknown, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('History in the editor (studio)', () => {
  it('shows the example history from the tool dock, adds saved versions and the working copy, and restores a version', async () => {
    vi.stubGlobal('fetch', async (u: string | URL) => {
      const path = new URL(String(u), 'http://localhost/').pathname;
      return files[path] !== undefined ? new Response(files[path]) : new Response('', { status: 404 });
    });
    const host = document.createElement('div');
    document.body.append(host);
    const storage = memoryStorage();
    const studio = new DiagramStudio(host, { examples: '/examples/index.json', initial: 'simple-flow', persist: ['local'], storage });
    const root = host.shadowRoot!;
    // the example opens at its newest version, and the editor gets a History button
    await wait(() => studio.editor?.getSource() === newest.source);
    const ed = root.querySelector('mmdx-editor')!.shadowRoot!;
    await wait(() => ed.querySelector<HTMLButtonElement>('.vt-history') && !ed.querySelector<HTMLButtonElement>('.vt-history')!.hidden);
    // no History mode in the studio's top bar
    expect([...root.querySelectorAll('.top button')].some((b) => b.textContent?.trim() === 'History')).toBe(false);

    const events: string[] = [];
    for (const ev of ['mmdx-history-open', 'mmdx-history-close', 'mmdx-history-compare', 'mmdx-history-restore'])
      root.querySelector('mmdx-editor')!.addEventListener(ev, () => events.push(ev));
    const editor = studio.editor!;
    const rows = (): NodeListOf<HTMLElement> => ed.querySelectorAll('.mmdx-stack .version');
    ed.querySelector<HTMLButtonElement>('.vt-history')!.click();
    await wait(() => rows().length === 6);
    // in place, the panel only: the document stays as it is (editable), nothing is compared
    const modeBtn = (v: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`.top button.mode[data-value=${v}]`)!;
    expect(editor.core.stage.peek()).toBe('document');
    expect(ed.querySelector('mmdx-diff')).toBeNull();
    expect(ed.querySelector('.vt-history')!.getAttribute('aria-pressed')).toBe('true');
    expect(ed.querySelector('.mmdx-pill')).toBeNull();
    expect(editor.historySession).not.toBeNull();
    expect(events).toEqual(['mmdx-history-open']);
    expect(modeBtn('edit').getAttribute('aria-pressed')).toBe('true');

    // a version viewed as it is: drawn by the editor, read-only; the pill names it, the canvas carries no title of it
    for (const v of [versions[2], versions[1]]) {
      editor.historySession!.viewVersion(v.id);
      await wait(() => editor.core.version.peek()?.id === v.id);
      expect(editor.core.stage.peek()).toBe('version');
      expect(ed.querySelector('.mmdx-pill')!.textContent).toContain(v.id);
      expect(editor.core.area.querySelector('.pane-title')).toBeNull();
    }
    // Edit / View cannot switch while a version shows
    editor.setMode('view');
    expect(editor.readOnly).toBe(false);

    // a version on the Compare tab: compared with the current one; the studio's switch shows Diff
    ed.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=compare]')!.click();
    expect(editor.core.stage.peek()).toBe('version');
    ed.querySelectorAll<HTMLButtonElement>('.mmdx-stack .version .version-main')[2]!.click();
    await wait(() => events.includes('mmdx-history-compare'));
    expect(editor.historySession!.pair).toMatchObject({ base: versions[2].id, head: versions[0].id });
    expect(editor.core.stage.peek()).toBe('history');
    expect(ed.querySelector('.mmdx-pill [role=status]')!.textContent).toMatch(/^\w+ → \w+$/);
    expect(modeBtn('diff').getAttribute('aria-pressed')).toBe('true');

    // Back (the pill's ×) goes back to the document; the panel stays
    ed.querySelector<HTMLButtonElement>('.mmdx-pill .mmdx-pill-btn')!.click();
    expect(editor.core.stage.peek()).toBe('document');
    expect(editor.historySession).not.toBeNull();
    expect(ed.querySelector('.mmdx-pill')).toBeNull();
    expect(modeBtn('edit').getAttribute('aria-pressed')).toBe('true');
    // closing the panel leaves History
    editor.toggleHistory(false);
    expect(editor.historySession).toBeNull();
    expect(events).toContain('mmdx-history-close');

    // Diff in the mode switch opens History on the newest version against the one before; Edit leaves it
    modeBtn('diff').click();
    await wait(() => editor.historySession?.getDiff());
    expect(editor.historySession!.pair).toMatchObject({ base: versions[1].id, head: versions[0].id });
    expect(modeBtn('diff').getAttribute('aria-pressed')).toBe('true');
    modeBtn('view').click();
    expect(editor.core.stage.peek()).toBe('document');
    expect(editor.readOnly).toBe(true);
    expect(modeBtn('view').getAttribute('aria-pressed')).toBe('true');
    modeBtn('edit').click();
    expect(editor.readOnly).toBe(false);

    // an edit, saved as a version, then edited again: saved version + working copy join the history
    editor.setSource(`${newest.source}\n  extra[Extra step]`, { history: 'push' });
    const save = [...root.querySelectorAll<HTMLButtonElement>('.top button')].find((b) => b.textContent?.trim() === 'Save version')!;
    save.click();
    await wait(() => root.querySelector('.mmdx-dialog input'));
    root.querySelector<HTMLInputElement>('.mmdx-dialog input')!.value = 'Add an extra step';
    root.querySelector<HTMLButtonElement>('.mmdx-dialog button.primary')!.click();
    await wait(() => (storage.get<Record<string, unknown[]>>('studio.versions')?.['example:simple-flow']?.length ?? 0) === 1);
    editor.setSource(`${newest.source}\n  extra[Extra step] --> more[More]`, { history: 'push' });
    editor.toggleHistory(true);
    await wait(() => rows().length === 8);
    const msgs = [...ed.querySelectorAll('.mmdx-stack .vmsg')].map((e) => e.textContent);
    expect(msgs.slice(0, 2)).toEqual(['Working copy (not saved as a version)', 'Add an extra step']);

    // the working copy follows the document while History is open (the same as the saved version: no working copy)
    editor.setSource(`${newest.source}\n  extra[Extra step]`, { history: 'push' });
    await wait(() => rows().length === 7);
    editor.setSource(`${newest.source}\n  extra[Extra step] --> more[More]`, { history: 'push' });
    await wait(() => rows().length === 8);
    expect(editor.historySession).not.toBeNull();

    // each version's ⋮ menu, on both tabs: Restore (not for the current version) and Compare with the previous version
    ed.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=compare]')!.click();
    await wait(() => ed.querySelector('.mmdx-stack .version .vrail ~ .vmenu'));
    const historyTab = (): void => ed.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=history]')!.click();
    historyTab();
    await wait(() => ed.querySelector('.mmdx-stack .version .vmenu'));
    const menuOf = (i: number): HTMLButtonElement => ed.querySelectorAll<HTMLButtonElement>('.mmdx-stack .version .vmenu')[i]!;
    const items = (): string[] => [...ed.querySelectorAll('[role=menu] [role=menuitem]')].map((b) => b.textContent!);
    // the current version (the working copy here) has nothing to restore
    menuOf(0).click();
    expect(items()).toEqual(['Compare with the previous version']);
    menuOf(3).click(); // the same popover manager: another opener replaces the menu
    [...ed.querySelectorAll<HTMLButtonElement>('[role=menu] [role=menuitem]')].find((b) => b.textContent === 'Compare with the previous version')!.click();
    await wait(() => editor.historySession!.pair.base === versions[2].id);
    expect(editor.historySession!.pair).toMatchObject({ base: versions[2].id, head: versions[1].id });
    // restore the newest bundled version: the editor gets it as an undoable change
    historyTab();
    await wait(() => ed.querySelector('.mmdx-stack .version .vmenu'));
    menuOf(2).click();
    expect(items()[0]).toBe(`Restore ${newest.id}`);
    ed.querySelector<HTMLButtonElement>('[role=menu] .restore')!.click();
    await wait(() => editor.getSource() === newest.source);
    expect(editor.core.stage.peek()).toBe('document');
    expect(events).toContain('mmdx-history-restore');
    editor.undo();
    expect(editor.getSource()).toContain('more[More]');
    studio.destroy();
  });

  it('a document without versions has no History button and no Diff mode', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    const host = document.createElement('div');
    document.body.append(host);
    const studio = new DiagramStudio(host, { persist: [], storage: memoryStorage() });
    await wait(() => studio.editor);
    const ed = host.shadowRoot!.querySelector('mmdx-editor')!.shadowRoot!;
    await wait(() => ed.querySelector('.vt-history'));
    expect(ed.querySelector<HTMLButtonElement>('.vt-history')!.hidden).toBe(true);
    // nothing to compare: Diff is off in the mode switch
    expect(host.shadowRoot!.querySelector<HTMLButtonElement>('.top button.mode[data-value=diff]')!.disabled).toBe(true);
    studio.destroy();
  });
});

describe('History in the viewer', () => {
  it('controls="history" opens the versions in the viewer itself, without Restore; no <mmdx-diff> on the page needed', async () => {
    await loadKind('flowchart');
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    const v = new DiagramViewer(host, { lazy: false, source: newest.source, history: versions, controls: ['zoom', 'history'], storage: memoryStorage() });
    await rendered;
    const root = host.shadowRoot!;
    // the tool dock and the History button load on demand
    await wait(() => root.querySelector('button[aria-label^="History"]'));
    root.querySelector<HTMLButtonElement>('button[aria-label^="History"]')!.click();
    await wait(() => root.querySelectorAll('.mmdx-stack .version').length === 6);
    // the panel only: the diagram stays
    expect(v.core.stage.peek()).toBe('document');
    // the version menu (History tab) has no Restore in the viewer
    root.querySelector<HTMLButtonElement>('.mmdx-panel.history [role=tab][data-tab=history]')!.click();
    await wait(() => root.querySelector('.mmdx-stack .version .vmenu'));
    root.querySelector<HTMLButtonElement>('.mmdx-stack .version .vmenu')!.click();
    expect(root.querySelector('[role=menu] .restore')).toBeNull();
    expect(root.querySelectorAll('[role=menu] [role=menuitem]')).toHaveLength(1);
    // a version as it is: the viewer has no editor to draw it read-only, its diff scene shows it
    v.historySession!.viewVersion(versions[2].id);
    await wait(() => v.core.stage.peek() === 'history' && v.historySession?.pair.viewing === versions[2].id);
    v.toggleHistory(false);
    expect(v.core.stage.peek()).toBe('document');
    expect(root.querySelector('.mmdx-stack .version')).toBeNull();
    // the diagram is back
    expect(root.querySelectorAll('.body-layer .el[data-kind="node"]').length).toBeGreaterThan(0);
    v.destroy();
  });

  it('after Back the diagram shows what changed while History was open (source, theme), not the picture from before', async () => {
    await loadKind('flowchart');
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    const v = new DiagramViewer(host, { lazy: false, source: newest.source, history: versions, controls: ['zoom', 'history'], storage: memoryStorage(), ui: 'light' });
    await rendered;
    const root = host.shadowRoot!;
    const bg = (): string => v.core.root.style.getPropertyValue('--mmdx-page-bg');
    const lightBg = bg();
    await wait(() => v.core.has('toggleHistory'));
    v.toggleHistory(true);
    await wait(() => v.historySession);
    v.historySession!.viewVersion(versions[1].id);
    await wait(() => v.core.stage.peek() === 'history');
    v.set({ source: 'flowchart LR\n  fresh[Brand new step] --> b[End]' });
    v.core.themes.choose('default-dark');
    // nothing of the document is painted over History
    expect(root.querySelector('.body-layer')!.textContent).not.toContain('Brand new step');
    v.toggleHistory(false);
    expect(v.core.stage.peek()).toBe('document');
    await wait(() => root.querySelector('.body-layer')!.textContent!.includes('Brand new step') && bg() !== lightBg);
    expect(v.sourceText).toContain('Brand new step');
    v.destroy();
  });

  it('destroying the viewer with History open does not repaint the document nor emit mmdx-history-close', async () => {
    await loadKind('flowchart');
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    const v = new DiagramViewer(host, { lazy: false, source: newest.source, history: versions, controls: ['zoom', 'history'], storage: memoryStorage() });
    await rendered;
    await wait(() => v.core.has('toggleHistory'));
    v.toggleHistory(true);
    await wait(() => v.historySession);
    v.historySession!.viewVersion(versions[1].id);
    await wait(() => v.core.stage.peek() === 'history');
    const seen = vi.fn();
    host.addEventListener('mmdx-history-close', seen);
    host.addEventListener('mmdx-render', seen);
    v.destroy();
    expect(seen).not.toHaveBeenCalled();
  });
});


describe('History in the viewer has its layers card (B43)', () => {
  it('the comparison\'s view settings install in the history stage', async () => {
    await loadKind('flowchart');
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    const v = new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', history: [{ id: 'v2', source: 'flowchart LR\n  a --> b' }, { id: 'v1', source: 'flowchart LR\n  a' }], controls: ['zoom', 'history', 'layers'], storage: memoryStorage(), ui: 'light' });
    await rendered;
    await wait(() => v.core.has('toggleHistory'));
    v.toggleHistory(true);
    await wait(() => v.historySession);
    v.historySession!.setPair('v1', 'v2');
    await wait(() => v.core.stage.peek() === 'history' && v.historySession?.getDiff());
    // the Layers card is one of the panels over the comparison
    await wait(() => v.core.panelItems.peek().some((p) => p.id === 'view-settings'));
    expect(v.core.panelItems.peek().some((p) => p.id === 'view-settings')).toBe(true);
    v.toggleHistory(false);
    v.destroy();
  });
});
