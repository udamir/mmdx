// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramStudio } from '../../src/elements/studio.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { MmdxDiffElement } from '../../src/elements/diff.js';

const files: Record<string, string> = {
  '/examples/index.json': readFileSync('examples/index.json', 'utf8'),
  '/examples/simple-flow.mmd': readFileSync('examples/simple-flow.mmd', 'utf8'),
  '/examples/history/simple-flow.json': readFileSync('examples/history/simple-flow.json', 'utf8'),
};
const newest = JSON.parse(files['/examples/history/simple-flow.json']!).versions[0];

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

describe('studio History mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('opens an example at its newest version and shows its history; saved versions join it; a version can be restored', async () => {
    vi.stubGlobal('fetch', async (u: string | URL) => {
      const path = new URL(String(u), 'http://localhost/').pathname;
      return files[path] !== undefined ? new Response(files[path]) : new Response('', { status: 404 });
    });
    const host = document.createElement('div');
    document.body.append(host);
    const storage = memoryStorage();
    const studio = new DiagramStudio(host, { examples: '/examples/index.json', initial: 'simple-flow', persist: ['local'], storage });
    const root = host.shadowRoot!;
    await wait(() => studio.editor?.getSource() === newest.source);

    const btn = (name: string): HTMLButtonElement => [...root.querySelectorAll<HTMLButtonElement>('.top button')].find((b) => b.textContent?.trim() === name)!;
    btn('History').click();
    await wait(() => root.querySelector('mmdx-diff')?.shadowRoot?.querySelectorAll('.version').length === 6);
    const diff = root.querySelector('mmdx-diff') as MmdxDiffElement;
    expect(btn('History').getAttribute('aria-pressed')).toBe('true');
    expect(diff.instance!.pair.head).toBe(newest.id);

    // an edit becomes the working copy on top of the history
    btn('Edit').click();
    expect(root.querySelector('mmdx-diff')).toBeNull();
    studio.editor!.setSource(`${newest.source}\n  extra[Extra step]`, { history: 'push' });
    btn('Save version').click();
    await wait(() => root.querySelector('.mmdx-dialog input'));
    root.querySelector<HTMLInputElement>('.mmdx-dialog input')!.value = 'Add an extra step';
    root.querySelector<HTMLButtonElement>('.mmdx-dialog button.primary')!.click();
    await wait(() => (storage.get<Record<string, unknown[]>>('studio.versions')?.['example:simple-flow']?.length ?? 0) === 1);

    btn('History').click();
    await wait(() => root.querySelector('mmdx-diff')?.shadowRoot?.querySelectorAll('.version').length === 7);
    const d = (root.querySelector('mmdx-diff') as MmdxDiffElement).instance!;
    expect(root.querySelector('mmdx-diff')!.shadowRoot!.querySelector('.vmsg')!.textContent).toBe('Add an extra step');
    expect(d.getDiff()!.counts.added).toBeGreaterThan(0);

    // restore the newest bundled version into the editor
    d.setPair(JSON.parse(files['/examples/history/simple-flow.json']!).versions[1].id, newest.id);
    await wait(() => d.pair.head === newest.id && !btn('Restore this version').disabled);
    btn('Restore this version').click();
    await wait(() => studio.editor?.getSource() === newest.source);
    expect(btn('Edit').getAttribute('aria-pressed')).toBe('true');
    studio.destroy();
  });
});
