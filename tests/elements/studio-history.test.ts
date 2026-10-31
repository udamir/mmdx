// @vitest-environment jsdom
// History is part of the editor and the viewer: their History button covers them with the diff of the document's
// versions. The studio only provides the versions (an example's history and the versions saved in the studio).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramStudio } from '../../src/elements/studio.js';
import { DiagramViewer } from '../../src/elements/viewer.js';
import { loadKind } from '../../src/elements/kinds.js';
import { memoryStorage } from '../../src/adapters/storage.js';

const files: Record<string, string> = {
  '/examples/index.json': readFileSync('examples/index.json', 'utf8'),
  '/examples/simple-flow.mmd': readFileSync('examples/simple-flow.mmd', 'utf8'),
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

    ed.querySelector<HTMLButtonElement>('.vt-history')!.click();
    const view = (): ShadowRoot | null | undefined => ed.querySelector('.mmdx-history-view')?.shadowRoot;
    await wait(() => view()?.querySelectorAll('.version').length === 6);
    expect(ed.querySelector('.vt-history')!.getAttribute('aria-pressed')).toBe('true');

    // Back closes it
    view()!.querySelector<HTMLButtonElement>('[data-action=back]')!.click();
    expect(ed.querySelector('.mmdx-history-view')).toBeNull();

    // an edit, saved as a version, then edited again: saved version + working copy join the history
    studio.editor!.setSource(`${newest.source}\n  extra[Extra step]`, { history: 'push' });
    const save = [...root.querySelectorAll<HTMLButtonElement>('.top button')].find((b) => b.textContent?.trim() === 'Save version')!;
    save.click();
    await wait(() => root.querySelector('.mmdx-dialog input'));
    root.querySelector<HTMLInputElement>('.mmdx-dialog input')!.value = 'Add an extra step';
    root.querySelector<HTMLButtonElement>('.mmdx-dialog button.primary')!.click();
    await wait(() => (storage.get<Record<string, unknown[]>>('studio.versions')?.['example:simple-flow']?.length ?? 0) === 1);
    studio.editor!.setSource(`${newest.source}\n  extra[Extra step] --> more[More]`, { history: 'push' });
    studio.editor!.toggleHistory(true);
    await wait(() => view()?.querySelectorAll('.version').length === 8);
    const msgs = [...view()!.querySelectorAll('.vmsg')].map((e) => e.textContent);
    expect(msgs.slice(0, 2)).toEqual(['Working copy (not saved as a version)', 'Add an extra step']);

    // restore the newest bundled version: the editor gets it as an undoable change
    view()!.querySelectorAll<HTMLButtonElement>('.version-main')[2]!.click();
    await wait(() => !view()!.querySelector<HTMLButtonElement>('[data-action=restore]')!.disabled);
    view()!.querySelector<HTMLButtonElement>('[data-action=restore]')!.click();
    await wait(() => studio.editor?.getSource() === newest.source);
    expect(ed.querySelector('.mmdx-history-view')).toBeNull();
    studio.editor!.undo();
    expect(studio.editor!.getSource()).toContain('more[More]');
    studio.destroy();
  });

  it('a document without versions has no History button', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    const host = document.createElement('div');
    document.body.append(host);
    const studio = new DiagramStudio(host, { persist: [], storage: memoryStorage() });
    await wait(() => studio.editor);
    const ed = host.shadowRoot!.querySelector('mmdx-editor')!.shadowRoot!;
    await wait(() => ed.querySelector('.vt-history'));
    expect(ed.querySelector<HTMLButtonElement>('.vt-history')!.hidden).toBe(true);
    studio.destroy();
  });
});

describe('History in the viewer', () => {
  it('controls="history" opens the versions over the viewer, without Restore', async () => {
    await loadKind('flowchart');
    // the page loads mmdx/diff: the History button appears once <mmdx-diff> is defined
    (await import('../../src/elements/diff.js')).defineDiff();
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    const v = new DiagramViewer(host, { lazy: false, source: newest.source, history: versions, controls: ['zoom', 'history'], storage: memoryStorage() });
    await rendered;
    const root = host.shadowRoot!;
    // the tool dock and the History button load on demand
    await wait(() => root.querySelector('button[aria-label^="History"]'));
    const btn = root.querySelector<HTMLButtonElement>('button[aria-label^="History"]')!;
    btn.click();
    const view = (): ShadowRoot | null | undefined => root.querySelector('.mmdx-history-view')?.shadowRoot;
    await wait(() => view()?.querySelectorAll('.version').length === 6);
    expect(view()!.querySelector('[data-action=restore]')).toBeNull();
    v.toggleHistory(false);
    expect(root.querySelector('.mmdx-history-view')).toBeNull();
    v.destroy();
  });
});
