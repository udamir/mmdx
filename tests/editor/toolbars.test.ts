// @vitest-environment jsdom
// The toolbars' wiring over the editor, characterized before its split (5.5, R6): the style toolbar's API (effective
// values, an override as one history step, lock, layers, the type filter of a multi-selection, the Order slider
// previewed live and committed once, ⌘[ / ⌘]), the diagram palette shared with the page bar, and the page bar (its
// badge selects the page; a page value is one step).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PageToolbarApi } from '../../src/ui/diagram/page-toolbar.js';
import type { ToolbarApi } from '../../src/ui/diagram/style-toolbar.js';

const captured: { style: ToolbarApi | null; page: PageToolbarApi | null } = { style: null, page: null };
vi.mock('../../src/ui/diagram/style-toolbar.js', async (orig) => {
  const m = await orig<typeof import('../../src/ui/diagram/style-toolbar.js')>();
  return { ...m, createStyleToolbar: (wrap: HTMLElement, api: ToolbarApi, o: never) => ((captured.style = api), m.createStyleToolbar(wrap, api, o)) };
});
vi.mock('../../src/ui/diagram/page-toolbar.js', async (orig) => {
  const m = await orig<typeof import('../../src/ui/diagram/page-toolbar.js')>();
  return { ...m, createPageToolbar: (wrap: HTMLElement, api: PageToolbarApi, o: never) => ((captured.page = api), m.createPageToolbar(wrap, api, o)) };
});

import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});
const eds: DiagramEditor[] = [];
afterEach(() => {
  for (const e of eds.splice(0)) e.destroy();
  captured.style = captured.page = null;
  document.body.replaceChildren();
});
const mount = async (value: string): Promise<DiagramEditor> => {
  const host = document.createElement('div');
  document.body.append(host);
  const e = new DiagramEditor(host, { value, storage: memoryStorage() });
  eds.push(e);
  await e.whenLoaded();
  return e;
};
const styleApi = async (e: DiagramEditor): Promise<ToolbarApi> => {
  e.core.select([{ kind: 'node', id: 'A' }]);
  e.core.fire('selection');
  await vi.waitFor(() => expect(captured.style).toBeTruthy());
  return captured.style!;
};

const FLOW = 'flowchart LR\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n';

describe('the style toolbar API', () => {
  it('reads effective values and sets an override as one history step', async () => {
    const e = await mount(FLOW);
    const api = await styleApi(e);
    expect(api.selection()).toEqual({ kind: 'node', id: 'A' });
    expect(api.editable()).toBe(true);
    api.set('fill', '#ff0000');
    api.commit!();
    expect(e.core.getM('node', 'A')['fill']).toBe('#ff0000');
    expect(api.effRaw!('fill')).toBe('#ff0000');
    e.undo();
    expect(e.core.getM('node', 'A')['fill']).toBeUndefined();
  });

  it('locks and unlocks the selection', async () => {
    const e = await mount(FLOW);
    const api = await styleApi(e);
    expect(api.isLocked!()).toBe(false);
    api.toggleLock!();
    expect(api.isLocked!()).toBe(true);
    api.toggleLock!();
    expect(api.isLocked!()).toBe(false);
  });

  it('moves the selection to a new layer, and back to the base layer', async () => {
    const e = await mount(FLOW);
    const api = await styleApi(e);
    api.newLayer!();
    const layers = api.layers!();
    const made = layers.find((l) => l.id !== layers[0]!.id) ?? layers.at(-1)!;
    expect(api.currentLayer!()).toBe(made.id);
    api.setLayer!(layers[0]!.id);
    expect(api.currentLayer!()).toBe(layers[0]!.id);
  });

  it('a multi-selection counts its kinds; a kind taken out can be put back while the selection lasts', async () => {
    const e = await mount(FLOW);
    const api = await styleApi(e);
    e.core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }, { kind: 'edge', id: 'A->B' }]);
    expect(api.selectionTypes!()).toEqual([{ kind: 'node', count: 2, selected: true }, { kind: 'edge', count: 1, selected: true }]);
    api.setTypeSelected!('edge', false);
    expect(e.core.selection().map((s) => s.kind)).toEqual(['node', 'node']);
    expect(api.selectionTypes!()).toEqual([{ kind: 'node', count: 2, selected: true }, { kind: 'edge', count: 1, selected: false }]);
    api.setTypeSelected!('edge', true);
    expect(e.core.selection()).toHaveLength(3);
  });

  it('the Order slider previews each position live and commits one step', async () => {
    const e = await mount(FLOW);
    const api = await styleApi(e);
    const o = api.order!()!;
    expect(o.count).toBeGreaterThan(1);
    const before = e.getSource();
    const other = o.index === 0 ? 1 : 0;
    api.orderPreview!(other);
    expect(e.core.store.inTransaction).toBe(true);
    expect(e.getSource()).not.toBe(before);
    api.orderCommit!();
    expect(e.core.store.inTransaction).toBe(false);
    expect(api.order!()!.index).toBe(other);
    e.undo();
    expect(e.getSource()).toBe(before);
  });

  it('⌘[ / ⌘] move the selected item in the code; several items are refused', async () => {
    const e = await mount(FLOW);
    const toast = vi.spyOn(e.core, 'toast');
    e.core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    e.core.run('moveSelection', 1);
    expect(toast).toHaveBeenCalled();
    e.core.select([{ kind: 'edge', id: 'A->B' }]);
    const before = e.getSource();
    e.core.run('moveSelection', 1);
    expect(e.getSource()).not.toBe(before);
  });

  it('the diagram palette: + adds a colour to the diagram, removing it takes it out', async () => {
    const e = await mount(FLOW);
    const api = await styleApi(e);
    const name = api.addLocalColor!('#123456');
    expect(api.localPalette!()).toEqual([{ name, value: '#123456' }]);
    api.removeLocalColor!(name);
    expect(api.localPalette!()).toEqual([]);
  });
});

describe('the page toolbar', () => {
  it('the badge selects the page and opens its bar; a page value is one step', async () => {
    const e = await mount(FLOW);
    const badge = e.core.dom.root.querySelector<HTMLButtonElement>('.page-badge')!;
    expect(badge).toBeTruthy();
    e.core.select([{ kind: 'node', id: 'A' }]);
    badge.click();
    expect(e.core.pageSelected.peek()).toBe(true);
    expect(e.core.selection()).toEqual([]);
    await vi.waitFor(() => expect(captured.page).toBeTruthy());
    const api = captured.page!;
    expect(api.visible()).toBe(true);
    expect(api.diagramType()).toBe('flowchart');
    api.set({ background: '#eeeeee' });
    expect(e.core.meta.canvas['background']).toBe('#eeeeee');
    expect(api.getRaw('background')).toBe('#eeeeee');
    e.undo();
    expect(e.core.meta.canvas['background']).toBeUndefined();
    api.setRouting!('straight');
    expect(api.routing!()).toBe('straight');
  });
});
