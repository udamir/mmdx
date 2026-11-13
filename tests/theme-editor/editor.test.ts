// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryThemeStore } from '../../src/adapters/themes.js';
import { type ThemeStore } from '../../src/ports.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';
import type { ThemeFile } from '../../src/core/theme/types.js';
import { ThemeEditor } from '../../src/theme-editor/editor.js';
import type { ThemeEditorOptions } from '../../src/theme-editor/types.js';
import { drawItemPreview } from '../../src/ui/diagram/item-preview.js';

vi.mock('../../src/ui/diagram/item-preview.js', async (orig) => {
  const m = await orig<typeof import('../../src/ui/diagram/item-preview.js')>();
  return { ...m, drawItemPreview: vi.fn(m.drawItemPreview) };
});

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
const drawn = vi.mocked(drawItemPreview);

function mount(opts: ThemeEditorOptions = {}): { te: ThemeEditor; root: ShadowRoot; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const te = new ThemeEditor(host, { store: memoryThemeStore(BUILTIN_THEMES), storage: memoryStorage(), ...opts });
  return { te, root: host.shadowRoot!, host };
}

const openCard = (root: ShadowRoot, key: string): HTMLElement => {
  const head = root.querySelector<HTMLButtonElement>(`[data-card="${key}"]`)!;
  if (head.getAttribute('aria-expanded') !== 'true') head.click();
  return head.parentElement!;
};
const button = (root: ParentNode, text: string): HTMLButtonElement => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

afterEach(() => {
  vi.useRealTimers();
  drawn.mockClear();
  document.body.replaceChildren();
});

describe('ThemeEditor', () => {
  it('a theme asked for before the list loaded is opened once it is in', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = memoryThemeStore(BUILTIN_THEMES);
    const slow: ThemeStore = { ...store, list: async () => (await gate, store.list()) };
    const { te } = mount({ store: slow });
    const id = te.set({ theme: 'default-dark' });
    release();
    await te.ready;
    expect(te.themeId).toBe('default-dark');
    expect(await id).toBe('default-dark');
  });

  it('a store with listWithUsage is read once: no get or usage per theme (P19); without it, the list then each theme', async () => {
    const store = memoryThemeStore(BUILTIN_THEMES);
    const get = vi.fn(store.get), usage = vi.fn(async () => 3);
    const bulk: ThemeStore = { ...store, get, usage, listWithUsage: async () => Promise.all((await store.list()).map(async (info) => ({ info, file: await store.get(info.id), usage: 2 }))) };
    const { te, root } = mount({ store: bulk });
    await te.ready;
    expect(get).not.toHaveBeenCalled();
    expect(usage).not.toHaveBeenCalled();
    expect(root.querySelector('.te-ttag')!.textContent).toContain('used by 2 diagrams');
    te.destroy();
    const each: ThemeStore = { ...store, get, usage };
    const { te: te2, root: root2 } = mount({ store: each });
    await te2.ready;
    expect(get).toHaveBeenCalledTimes((await store.list()).length);
    expect(usage).toHaveBeenCalledTimes((await store.list()).length);
    expect(root2.querySelector('.te-ttag')!.textContent).toContain('used by 3 diagrams');
  });

  it('set({ theme }) resolves with the theme open: the old one when the user stays', async () => {
    const { te, root } = mount();
    await te.ready;
    const name = root.querySelector<HTMLInputElement>('.te-name')!;
    name.value = 'Changed';
    name.dispatchEvent(new Event('change'));
    const id = te.set({ theme: 'default-dark' });
    await tick();
    button(root.querySelector('.mmdx-dialog')!, 'Cancel').click();
    expect(await id).toBe('default-light');
    expect(te.themeId).toBe('default-light');
    expect(await te.set({ canDelete: true })).toBe('default-light');
  });

  it('a failed save leaves the draft as it was (no schema version written into it)', async () => {
    const plain: ThemeFile = { id: 'plain', name: 'Plain', extends: 'default-light' };
    const { te, root } = mount({ store: memoryThemeStore([...BUILTIN_THEMES, plain]), theme: 'plain' });
    await te.ready;
    openCard(root, 'page');
    const grid = root.querySelector<HTMLInputElement>('.te-f[data-dirty="canvas.grid"] input')!;
    grid.value = 'not a colour';
    grid.dispatchEvent(new Event('change'));
    expect(await te.save()).toBe(false);
    expect(te.draftTheme!.schemaVersion).toBeUndefined();
    // taking the bad value back: clean again
    grid.value = '';
    grid.dispatchEvent(new Event('change'));
    expect(te.dirty).toBe(false);
  });

  it('a store that fails to delete: the error is shown, nothing is left half done', async () => {
    const extra: ThemeFile = { id: 'extra', name: 'Extra', extends: 'default-light' };
    const store = memoryThemeStore([...BUILTIN_THEMES, extra]);
    store.delete = () => Promise.reject(new Error('read-only disk'));
    const { te, root } = mount({ store, theme: 'extra', canDelete: true });
    await te.ready;
    root.querySelector<HTMLButtonElement>('.te-more')!.click();
    button(root.querySelector('.te-menu')!, 'Delete').click();
    await tick();
    button(root.querySelector('.mmdx-dialog')!, 'Delete').click();
    await tick(10);
    expect(root.querySelector('.mmdx-toast.error')!.textContent).toBe('Could not delete: read-only disk');
    expect(te.themeId).toBe('extra');
    expect((await store.list()).map((i) => i.id)).toContain('extra');
  });

  it('presentation: a dialog has no fixed height, embedded fills the host; switching keeps it shown', async () => {
    const { te, root } = mount({ presentation: 'dialog' });
    await te.ready;
    const frame = root.querySelector<HTMLElement>('.te-overlay')!;
    expect(frame.hidden).toBe(false);
    expect(await te.close()).toBe(true);
    expect(frame.hidden).toBe(true);
    void te.set({ presentation: 'inline' });
    expect(frame.className).toBe('te-inline');
    expect(frame.style.height).toBe('100%');
    expect(frame.hidden).toBe(false);
    void te.set({ presentation: 'dialog' });
    expect(frame.className).toBe('te-overlay');
    expect(frame.style.height).toBe('');
    expect(root.querySelector('.te-dialog')!.getAttribute('role')).toBe('dialog');
  });

  it('destroy: open dialogs are cancelled, no timer outlives it', async () => {
    const storage = memoryStorage();
    const { te, root } = mount({ storage });
    await te.ready;
    const name = root.querySelector<HTMLInputElement>('.te-name')!;
    name.value = 'Changed';
    name.dispatchEvent(new Event('change'));
    const sw = te.select('default-dark');
    await tick();
    expect(root.querySelector('.mmdx-dialog')).not.toBeNull();
    vi.useFakeTimers();
    // the sample code is being typed in (its save is debounced)
    root.querySelector<HTMLButtonElement>('.te-codebtn')!.click();
    const ta = root.querySelector<HTMLTextAreaElement>('.te-code')!;
    ta.value = 'flowchart LR\n  x --> y';
    ta.dispatchEvent(new Event('input'));
    te.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    expect(await sw).toBe(false);
    expect(root.querySelector('.mmdx-dialog')).toBeNull();
    expect(root.querySelector('.te-overlay')).toBeNull();
    expect(storage.get('teSamples')).toBeUndefined();
  });

  it('an edit redraws only the tiles it affects', async () => {
    const { te, root } = mount({ theme: 'default-dark' });
    await te.ready;
    const card = openCard(root, 'flowchart.node');
    const tiles = card.querySelectorAll('.te-tile[data-kind="node"]').length;
    expect(tiles).toBeGreaterThan(2);
    openCard(root, 'flowchart.edge');
    card.querySelector<HTMLElement>('.te-tile[data-preset="core"]')!.click();
    drawn.mockClear();
    // a preset of the node: that tile only
    root.querySelector<HTMLButtonElement>('.mtb [data-c="bold"]')!.click();
    await tick(150);
    expect(drawn.mock.calls.map((c) => [c[1], c[2]])).toEqual([["node", "core"]]);
    // the name: nothing drawn
    drawn.mockClear();
    const name = root.querySelector<HTMLInputElement>('.te-name')!;
    name.value = 'Renamed';
    name.dispatchEvent(new Event('change'));
    await tick(150);
    expect(drawn).not.toHaveBeenCalled();
    // a palette colour: every tile of every open gallery
    drawn.mockClear();
    openCard(root, 'palette');
    const lime = root.querySelector<HTMLInputElement>('.te-dot[data-dirty="palette.lime"] input')!;
    lime.value = '#123456';
    lime.dispatchEvent(new Event('input'));
    await tick(150);
    const edges = card.parentElement!.querySelector('[data-card="flowchart.edge"]')!.parentElement!.querySelectorAll('.te-tile[data-kind="edge"]').length;
    expect(drawn).toHaveBeenCalledTimes(tiles + edges);
  });

  it('a gallery in a closed card catches up when it opens', async () => {
    const { te, root } = mount();
    await te.ready;
    openCard(root, 'flowchart.node');
    const head = root.querySelector<HTMLButtonElement>('[data-card="flowchart.node"]')!;
    head.click(); // closed
    drawn.mockClear();
    openCard(root, 'palette');
    const lime = root.querySelector<HTMLInputElement>('.te-dot[data-dirty="palette.lime"] input')!;
    lime.value = '#654321';
    lime.dispatchEvent(new Event('input'));
    await tick(150);
    expect(drawn).not.toHaveBeenCalled();
    head.click(); // open again
    expect(drawn.mock.calls.length).toBeGreaterThan(0);
  });

  it('tiles: a list of buttons with roving focus; the selected one has aria-current', async () => {
    const { te, root } = mount({ theme: 'default-dark' });
    await te.ready;
    const card = openCard(root, 'flowchart.node');
    const list = card.querySelector('.te-tiles')!;
    expect(list.getAttribute('role')).toBe('list');
    const tiles = [...list.querySelectorAll<HTMLButtonElement>('.te-tile[data-kind]')];
    expect(tiles.every((x) => x.tagName === 'BUTTON' && !x.querySelector('button'))).toBe(true);
    expect(tiles.filter((x) => x.tabIndex === 0)).toHaveLength(1);
    tiles[1]!.click();
    expect(tiles[1]!.getAttribute('aria-current')).toBe('true');
    tiles[1]!.focus();
    tiles[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
    expect(root.activeElement).toBe(tiles[2]);
    // the shape strip: icon buttons in a toolbar, the current shape pressed
    const strip = card.querySelector('.te-shapes')!;
    expect(strip.getAttribute('role')).toBe('toolbar');
    expect(strip.querySelector('[data-value="rect"]')!.getAttribute('aria-pressed')).toBe('true');
    // the preview's tabs and the code toggle
    const tablist = root.querySelector('.te-ptabs')!;
    expect(tablist.getAttribute('role')).toBe('tablist');
    expect(root.querySelector('.te-codebtn')!.getAttribute('aria-pressed')).toBe('false');
  });
});
