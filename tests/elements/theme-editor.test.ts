// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryThemeStore, type ThemeStore } from '../../src/adapters/themes.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { getShared } from '../../src/config.js';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';
import type { ThemeFile } from '../../src/core/theme/types.js';
import { contrastRatio, defineThemeEditor, type MmdxThemeEditorElement } from '../../src/elements/theme-editor.js';

defineThemeEditor();

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function mount(opts: { store?: ThemeStore; theme?: string; attrs?: Record<string, string> } = {}) {
  const el = document.createElement('mmdx-theme-editor') as MmdxThemeEditorElement;
  const store = opts.store ?? memoryThemeStore(BUILTIN_THEMES);
  el.store = store;
  el.storage = memoryStorage();
  if (opts.theme) el.setAttribute('theme', opts.theme);
  for (const [k, v] of Object.entries(opts.attrs ?? {})) el.setAttribute(k, v);
  document.body.append(el);
  await el.ready;
  const root = el.shadowRoot!;
  return { el, store, root };
}

const openCard = (root: ShadowRoot, key: string): HTMLElement => {
  const head = root.querySelector<HTMLButtonElement>(`[data-card="${key}"]`)!;
  if (head.getAttribute('aria-expanded') !== 'true') head.click();
  return head.parentElement!;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('<mmdx-theme-editor>', () => {
  it('lists the store themes and opens the requested one', async () => {
    const { el, root } = await mount({ theme: 'default-dark' });
    expect(Array.from(root.querySelectorAll('.te-theme .te-tname')).map((e) => e.textContent)).toEqual(['Default Light', 'Default Dark']);
    expect(el.theme).toBe('default-dark');
    expect(root.querySelector<HTMLInputElement>('.te-name')!.value).toBe('Default Dark');
    // the sample preview is drawn with the production renderer
    expect(root.querySelector('.vw-svg g g [data-kind="node"]')).not.toBeNull();
  });

  it('palette edit → dirty with amber markers → Save stores schemaVersion 1 and registers the theme', async () => {
    const { el, store, root } = await mount();
    const dirty = vi.fn();
    const saved = vi.fn();
    el.addEventListener('ds-theme-dirty', (e) => dirty((e as CustomEvent).detail));
    el.addEventListener('ds-theme-saved', (e) => saved((e as CustomEvent).detail));
    const dot = root.querySelector<HTMLElement>('.te-dot[data-dirty="palette.lime"]')!;
    const input = dot.querySelector<HTMLInputElement>('input[type=color]')!;
    input.value = '#123456';
    input.dispatchEvent(new Event('input'));
    expect(el.dirty).toBe(true);
    expect(dirty).toHaveBeenLastCalledWith({ id: 'default-light', dirty: true });
    expect(root.querySelector<HTMLElement>('.te-unsaved')!.hidden).toBe(false);
    await tick(150); // the view refresh is debounced
    expect(root.querySelector('.te-dot[data-dirty="palette.lime"]')!.classList.contains('dirty')).toBe(true);
    expect(root.querySelector('.te-card[data-dirty="palette"]')!.classList.contains('dirty')).toBe(true);
    expect(root.querySelector('.te-theme.on')!.classList.contains('dirty')).toBe(true);

    expect(await el.save()).toBe(true);
    const file = await store.get('default-light');
    expect(file.schemaVersion).toBe(1);
    expect(file.palette?.['lime']).toBe('#123456');
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].theme.palette.lime).toBe('#123456');
    expect(el.dirty).toBe(false);
    expect(dirty).toHaveBeenLastCalledWith({ id: 'default-light', dirty: false });
    expect(root.querySelector('.te-dot[data-dirty="palette.lime"]')!.classList.contains('dirty')).toBe(false);
    // open viewers / editors pick it up through the shared registry
    expect(getShared().themes.raw('default-light')?.palette?.['lime']).toBe('#123456');
  });

  it('⌘/Ctrl+S saves; ds-theme-save is cancelable', async () => {
    const { el, store, root } = await mount({ theme: 'default-dark' });
    el.addEventListener('ds-theme-save', (e) => e.preventDefault(), { once: true });
    const name = root.querySelector<HTMLInputElement>('.te-name')!;
    name.value = 'Renamed';
    name.dispatchEvent(new Event('change'));
    expect(await el.save()).toBe(false);
    expect((await store.get('default-dark')).name).toBe('Default Dark');
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, metaKey: true, bubbles: true, composed: true, cancelable: true }));
    await tick(10);
    expect((await store.get('default-dark')).name).toBe('Renamed');
  });

  it('the linked-theme field keeps light / dark links mutual on save', async () => {
    const themes: ThemeFile[] = [
      ...BUILTIN_THEMES,
      { id: 'sun', name: 'Sun', extends: 'default-light', appearance: 'light' },
      { id: 'moon', name: 'Moon', extends: 'default-light', appearance: 'dark', counterpart: 'default-light' },
    ];
    const { el, store, root } = await mount({ store: memoryThemeStore(themes), theme: 'sun' });
    const card = openCard(root, 'page');
    const sel = card.querySelector<HTMLSelectElement>('select[aria-label="Linked theme"]')!;
    // only themes of the other appearance are offered
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', 'default-dark', 'moon']);
    sel.value = 'moon';
    sel.dispatchEvent(new Event('change'));
    expect(await el.save()).toBe(true);
    expect((await store.get('sun')).counterpart).toBe('moon');
    // moon links back; baseline, which moon linked before, keeps its own link to studio-dark
    expect((await store.get('moon')).counterpart).toBe('sun');
    expect((await store.get('default-light')).counterpart).toBe('default-dark');
  });

  it('undo / redo', async () => {
    const { el, root } = await mount();
    const input = root.querySelector<HTMLInputElement>('.te-dot[data-dirty="palette.sky"] input')!;
    const before = el.instance!.draftTheme!.palette!['sky'];
    input.value = '#010203';
    input.dispatchEvent(new Event('input'));
    expect(el.instance!.draftTheme!.palette!['sky']).toBe('#010203');
    el.undo();
    expect(el.instance!.draftTheme!.palette!['sky']).toBe(before);
    expect(el.dirty).toBe(false);
    el.redo();
    expect(el.instance!.draftTheme!.palette!['sky']).toBe('#010203');
    // keyboard: Ctrl/⌘+Z outside text fields
    root.querySelector('.te-dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, metaKey: true, bubbles: true, composed: true, cancelable: true }));
    expect(el.instance!.draftTheme!.palette!['sky']).toBe(before);
  });

  it('importing an invalid file shows the errors and saves nothing', async () => {
    const { el, store, root } = await mount();
    const bad = { id: 'evil', name: 'Evil', palette: { red: 'url(javascript:alert(1))' }, flowchart: { node: { fill: 'red" onload="x' } } };
    const p = el.instance!.importText(JSON.stringify(bad));
    await tick(10);
    const dlg = root.querySelector('.ds-dialog')!;
    expect(dlg.textContent).toContain('Not a valid theme file');
    expect(dlg.textContent).toContain('palette.red');
    expect(dlg.textContent).toContain('flowchart.node.fill');
    dlg.querySelector<HTMLButtonElement>('button.primary')!.click();
    expect(await p).toBe(false);
    expect((await store.list()).map((t) => t.id)).not.toContain('evil');

    // not JSON at all
    const q = el.instance!.importText('{ nope');
    await tick(10);
    expect(root.querySelector('.ds-dialog')!.textContent).toContain('Not JSON');
    root.querySelector<HTMLButtonElement>('.ds-dialog button.primary')!.click();
    expect(await q).toBe(false);

    // a valid file is saved and opened
    const ok = el.instance!.importText(JSON.stringify({ id: 'mine', name: 'Mine', palette: { lime: '#00ff00' } }));
    expect(await ok).toBe(true);
    const file = await store.get('mine');
    expect(file.extends).toBe('default-light');
    expect(file.schemaVersion).toBe(1);
    expect(el.theme).toBe('mine');
  });

  it('save validates the draft and shows errors per field', async () => {
    const { el, store, root } = await mount({ theme: 'default-dark' });
    openCard(root, 'page');
    const grid = root.querySelector<HTMLInputElement>('.te-f[data-dirty="canvas.grid"] input')!;
    grid.value = 'not a colour';
    grid.dispatchEvent(new Event('change'));
    expect(await el.save()).toBe(false);
    const row = root.querySelector('.te-f[data-dirty="canvas.grid"]')!;
    expect(row.classList.contains('invalid')).toBe(true);
    expect(row.querySelector('.te-ferr')!.textContent).toMatch(/canvas\.grid/);
    expect(root.querySelector<HTMLElement>('.te-errors')!.hidden).toBe(false);
    expect((await store.get('default-dark')).canvas?.grid).toBeUndefined();
  });

  it('warns about low contrast (text on fill < 4.5:1) per preset tile', async () => {
    const low: ThemeFile = { id: 'low', name: 'Low', extends: 'default-light', flowchart: { nodePresets: { faint: { fill: '#ffffff', text: '#eeeeee' }, strong: { fill: '#ffffff', text: '#111111' } } } };
    const { root } = await mount({ store: memoryThemeStore([...BUILTIN_THEMES, low]), theme: 'low' });
    const card = openCard(root, 'flowchart.node');
    const tile = (p: string): HTMLElement => card.querySelector<HTMLElement>(`.te-tile[data-preset="${p}"]`)!;
    expect(tile('faint').querySelector('.te-warn')).not.toBeNull();
    expect(tile('faint').getAttribute('aria-label')).toMatch(/Low contrast: text on fill is 1\.1:1/);
    expect(tile('strong').querySelector('.te-warn')).toBeNull();
    // the tiles are real renders
    expect(tile('strong').querySelector('.te-tile-pic svg [data-kind="node"]')).not.toBeNull();
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('tile click opens the style toolbar and All properties; toolbar edits the preset', async () => {
    const { el, root } = await mount({ theme: 'default-dark' });
    const card = openCard(root, 'flowchart.node');
    card.querySelector<HTMLElement>('.te-tile[data-preset="core"]')!.click();
    const bar = root.querySelector<HTMLElement>('.mtb')!;
    expect(bar.hidden).toBe(false);
    expect(card.querySelector('.te-allprops summary')!.textContent).toBe('All properties — core');
    bar.querySelector<HTMLButtonElement>('[data-c="bold"]')!.click();
    expect(el.instance!.draftTheme!.flowchart!.nodePresets!['core']!.fontWeight).toBeDefined();
    // Esc order: toolbar popover → tile
    bar.querySelector<HTMLButtonElement>('[data-c="fill"]')!.click();
    expect(bar.querySelector('.mtb-pop')).not.toBeNull();
    const esc = (): boolean => root.querySelector('.te-dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    esc();
    expect(bar.querySelector('.mtb-pop')).toBeNull();
    expect(card.querySelector('.te-tile.on')).not.toBeNull();
    esc();
    expect(card.querySelector('.te-tile.on')).toBeNull();
    expect(bar.hidden).toBe(true);
    // nothing left to close inline: Esc is not consumed (a host dialog may close)
    expect(esc()).toBe(true);
  });

  it('Page tab edits <type>.pagePresets', async () => {
    const { el, store, root } = await mount();
    const card = openCard(root, 'flowchart.pagePresets');
    const tiles = Array.from(card.querySelectorAll<HTMLElement>('.te-tile[data-kind="page"]')).map((t) => t.dataset['preset']);
    expect(tiles).toEqual(['whiteboard', 'grid', 'technical', 'slide']);
    card.querySelector<HTMLElement>('.te-tile[data-preset="whiteboard"]')!.click();
    const pad = card.querySelector<HTMLInputElement>('.te-f[data-dirty="flowchart.pagePresets.whiteboard.pad"] input')!;
    pad.value = '24';
    pad.dispatchEvent(new Event('change'));
    const routing = card.querySelector<HTMLSelectElement>('.te-f[data-dirty="flowchart.pagePresets.whiteboard.routing"] select')!;
    routing.value = 'orthogonal';
    routing.dispatchEvent(new Event('change'));
    expect(el.instance!.draftTheme!.flowchart!.pagePresets!['whiteboard']).toMatchObject({ label: 'Whiteboard', pad: 24, routing: 'orthogonal' });
    // + Preset: a named page preset
    card.querySelector<HTMLButtonElement>('.te-tile-add')!.click();
    await tick(10);
    const input = root.querySelector<HTMLInputElement>('.ds-dialog input')!;
    input.value = 'Poster';
    root.querySelector<HTMLButtonElement>('.ds-dialog button.primary')!.click();
    await tick(10);
    expect(el.instance!.draftTheme!.flowchart!.pagePresets!['poster']).toEqual({ label: 'Poster' });
    // sequence page presets offer the sequence layout fields
    const seq = openCard(root, 'sequence.pagePresets');
    seq.querySelector<HTMLElement>('.te-tile[data-preset="compact"]')!.click();
    expect(seq.querySelector('.te-f[data-dirty="sequence.pagePresets.compact.rowH"]')).not.toBeNull();
    expect(seq.querySelector('.te-f[data-dirty="sequence.pagePresets.compact.mirror"]')).not.toBeNull();
    expect(seq.querySelector('.te-f[data-dirty="sequence.pagePresets.compact.routing"]')).toBeNull();
    expect(await el.save()).toBe(true);
    expect((await store.get('default-light')).flowchart?.pagePresets?.['whiteboard']?.pad).toBe(24);
  });

  it('switching themes with unsaved changes asks first; a version conflict offers overwrite / reload', async () => {
    const store = memoryThemeStore(BUILTIN_THEMES);
    const { el, root } = await mount({ store, theme: 'default-dark' });
    const name = root.querySelector<HTMLInputElement>('.te-name')!;
    name.value = 'Mine';
    name.dispatchEvent(new Event('change'));
    // someone else saves the same theme meanwhile
    await store.save({ ...(await store.get('default-dark')), name: 'Theirs' }, {});
    const p = el.save();
    await tick(10);
    const dlg = root.querySelector('.ds-dialog')!;
    expect(dlg.textContent).toContain('changed elsewhere');
    Array.from(dlg.querySelectorAll('button')).find((b) => b.textContent === 'Overwrite')!.click();
    expect(await p).toBe(true);
    expect((await store.get('default-dark')).name).toBe('Mine');

    name.value = 'Again';
    name.dispatchEvent(new Event('change'));
    const sw = el.select('default-light');
    await tick(10);
    expect(root.querySelector('.ds-dialog')!.textContent).toContain('Save the changes to "Again"?');
    Array.from(root.querySelectorAll<HTMLButtonElement>('.ds-dialog button')).find((b) => b.textContent === 'Cancel')!.click();
    expect(await sw).toBe(false);
    expect(el.theme).toBe('default-dark');
  });

  it('can-edit="false" is read only', async () => {
    const { el, root } = await mount({ attrs: { 'can-edit': 'false' } });
    expect(root.querySelector<HTMLInputElement>('.te-dot input')!.disabled).toBe(true);
    expect(Array.from(root.querySelectorAll('.te-list-acts button')).map((b) => b.textContent)).toEqual(['Export']);
    expect(await el.save()).toBe(false);
  });

  it('keeps edited sample code in storage (teSamples) and the zoom (teZoom)', async () => {
    const storage = memoryStorage();
    const el = document.createElement('mmdx-theme-editor') as MmdxThemeEditorElement;
    el.storage = storage;
    document.body.append(el);
    await el.ready;
    const root = el.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.te-codebtn')!.click();
    const ta = root.querySelector<HTMLTextAreaElement>('.te-code')!;
    ta.value = 'flowchart LR\n  a --> b';
    ta.dispatchEvent(new Event('input'));
    await tick(250);
    expect(storage.get<Record<string, string>>('teSamples')?.['flowchart']).toBe('flowchart LR\n  a --> b');
    root.querySelector<HTMLButtonElement>('.te-zoom button[aria-label="Bigger"]')!.click();
    expect(storage.get('teZoom')).toBe(1.1);
  });
});
