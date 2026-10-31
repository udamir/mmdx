// @vitest-environment jsdom
// The custom elements' lifecycle (elements/base.ts): a move in the DOM keeps the component (the editor's document,
// undo history, selection and an open History); properties are one store, kept across a real disconnect and never
// overridden by an older value; properties set after connect apply live; attributes apply one at a time.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StaticVersion } from '../../src/adapters/history.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { ThemeSource } from '../../src/adapters/themes.js';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';
import type { ThemeFile } from '../../src/core/theme/types.js';
import { defineEditor, type MmdxEditorElement } from '../../src/editor/editor.js';
import { defineDiff, type MmdxDiffElement } from '../../src/elements/diff.js';
import { defineStudio, type MmdxStudioElement } from '../../src/elements/studio.js';
import { defineThemeEditor, type MmdxThemeEditorElement } from '../../src/elements/theme-editor.js';
import { defineViewer, type MmdxViewerElement } from '../../src/elements/viewer.js';
import { loadKind } from '../../src/view/kinds.js';

beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  await loadKind('flowchart');
  defineViewer();
  defineEditor();
  defineDiff();
  defineThemeEditor();
  defineStudio();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const wait = async (f: () => unknown, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
/** After a disconnect, the component is destroyed in a microtask (unless the element is connected again). */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const A = 'flowchart LR\n  a --> b\n';
const B = 'flowchart LR\n  a --> b --> c\n';
const C = 'flowchart TB\n  x --> y\n';

const box = (): HTMLElement => document.body.appendChild(document.createElement('div'));

const viewer = (): MmdxViewerElement => {
  const el = document.createElement('mmdx-viewer');
  el.setAttribute('lazy', 'false');
  el.storage = memoryStorage();
  return el;
};
const editor = (value = A): MmdxEditorElement => {
  const el = document.createElement('mmdx-editor');
  el.storage = memoryStorage();
  el.value = value;
  return el;
};

describe('moving an element keeps its component', () => {
  it('viewer: the same instance, with the properties set while connected', async () => {
    const el = viewer();
    el.source = A;
    box().append(el);
    const v = el.instance!;
    el.source = B;
    el.history = [{ id: 'v1', source: A }];
    box().append(el);
    await flush();
    expect(el.instance).toBe(v);
    expect(v.sourceText).toBe(B);
    expect(v.core.isDestroyed).toBe(false);
  });

  it('editor: document, undo history, selection and an open History survive', async () => {
    const versions: StaticVersion[] = [{ id: 'v2', message: 'Now', source: B }, { id: 'v1', message: 'Old', source: A }];
    const el = editor(A);
    box().append(el);
    const e = el.instance!;
    e.setSource(B, { history: 'push' });
    expect(e.store.canUndo.peek()).toBe(true);
    e.select([{ kind: 'node', id: 'a' }]);
    el.history = versions;
    el.toggleHistory(true);
    await wait(() => el.historySession?.getDiff());
    const session = el.historySession;

    box().append(el);
    await flush();
    expect(el.instance).toBe(e);
    expect(e.core.isDestroyed).toBe(false);
    expect(el.getSource()).toBe(B);
    expect(e.store.canUndo.peek()).toBe(true);
    expect(e.core.stage.peek()).toBe('history');
    expect(el.historySession).toBe(session);
    el.toggleHistory(false);
    expect(e.core.selection().map((s) => s.id)).toEqual(['a']);
    el.undo();
    expect(el.getSource()).toBe(A);
  });

  it('diff, theme editor and studio keep their instance too', async () => {
    const d = document.createElement('mmdx-diff') as MmdxDiffElement;
    d.storage = memoryStorage();
    d.beforeSource = A;
    d.afterSource = B;
    const te = document.createElement('mmdx-theme-editor') as MmdxThemeEditorElement;
    te.storage = memoryStorage();
    const st = document.createElement('mmdx-studio') as MmdxStudioElement;
    st.setAttribute('persist', '');
    st.storage = memoryStorage();
    const first = box();
    first.append(d, te, st);
    const before = [d.instance, te.instance, st.instance];
    const ed = st.editor;
    expect(before.every(Boolean)).toBe(true);
    box().append(d, te, st);
    await flush();
    expect([d.instance, te.instance, st.instance]).toEqual(before);
    expect(st.editor).toBe(ed);
  });
});

describe('a real disconnect', () => {
  it('instance is null while the element is not connected, for every element', async () => {
    const els = [viewer(), editor(), document.createElement('mmdx-diff'), document.createElement('mmdx-theme-editor')];
    for (const el of els) expect(el.instance).toBeNull();
    const parent = box();
    parent.append(...els);
    for (const el of els) expect(el.instance).not.toBeNull();
    for (const el of els) el.remove();
    for (const el of els) expect(el.instance).toBeNull();
    await flush();
    for (const el of els) expect(el.instance).toBeNull();
  });

  it('viewer: a property set before the first connect does not override a later one', async () => {
    const el = viewer();
    el.source = A;
    const parent = box();
    parent.append(el);
    el.source = B;
    const first = el.instance!;
    el.remove();
    await flush();
    expect(first.core.isDestroyed).toBe(true);
    parent.append(el);
    expect(el.instance).not.toBe(first);
    expect(el.instance!.options.source).toBe(B);
    expect(el.instance!.sourceText).toBe(B);
  });

  it('editor: the next editor starts from the last document, not from the value set before connect', async () => {
    const el = editor(A);
    const parent = box();
    parent.append(el);
    el.instance!.setSource(C, { history: 'push' });
    el.remove();
    await flush();
    expect(el.getSource()).toBe(C);
    parent.append(el);
    expect(el.getSource()).toBe(C);
  });

  it('diff: sources and features set while connected are kept', async () => {
    const el = document.createElement('mmdx-diff') as MmdxDiffElement;
    el.storage = memoryStorage();
    el.beforeSource = A;
    el.afterSource = A;
    const parent = box();
    parent.append(el);
    el.afterSource = B;
    el.features = { pen: false };
    el.remove();
    await flush();
    parent.append(el);
    expect(el.instance!.options).toMatchObject({ beforeSource: A, afterSource: B, features: { pen: false } });
  });
});

describe('properties set after connect apply live', () => {
  it('viewer: storage and theme source', async () => {
    const el = viewer();
    el.source = A;
    box().append(el);
    const core = el.instance!.core;
    el.storage = memoryStorage({ 'viewer.ui': 'dark', 'viewer.theme': 'default-dark' });
    expect(core.scheme.peek()).toBe('dark');
    expect(core.themes.current.peek()).toBe('default-dark');
    expect(core.storage.get('viewer.ui')).toBe('dark');
    const file: ThemeFile = { ...BUILTIN_THEMES.find((t) => t.id === 'default-light')!, id: 'brand', name: 'Brand' } as ThemeFile;
    const get = vi.fn(async () => file);
    const src: ThemeSource = { list: async () => [], get };
    el.setAttribute('theme', 'brand');
    el.themeSource = src;
    expect(core.themeSource).toBe(src);
    await wait(() => core.ctx.themes.has('brand'));
    expect(get).toHaveBeenCalledWith('brand');
  });

  it('editor: features, panels, modules, storage and theme source', async () => {
    const el = editor();
    box().append(el);
    const e = el.instance!;
    const core = e.core;
    expect(core.moduleIds).toContain('pen');
    el.features = { pen: false };
    expect(core.features.pen).toBe(false);
    expect(core.moduleIds).not.toContain('pen');
    expect(el.shadowRoot!.querySelector('.vt-pen')).toBeNull();
    el.features = undefined;
    expect(core.moduleIds).toContain('pen');

    el.panels = { code: false };
    expect(core.panels.peek().code).toBe(false);

    const only = core.moduleIds.length;
    el.modules = [];
    expect(core.moduleIds).toEqual([]);
    el.modules = undefined;
    expect(core.moduleIds.length).toBe(only);

    el.storage = memoryStorage({ 'editor.ui': 'dark' });
    expect(core.scheme.peek()).toBe('dark');
    const src: ThemeSource = { list: async () => [], get: async () => { throw new Error('none'); } };
    el.themeSource = src;
    expect(core.themeSource).toBe(src);
    expect(el.getSource()).toBe(A);
  });

  it('diff: storage and theme source apply; ctx warns once that it is read on creation', async () => {
    const el = document.createElement('mmdx-diff') as MmdxDiffElement;
    el.storage = memoryStorage();
    el.beforeSource = A;
    el.afterSource = B;
    box().append(el);
    const core = el.instance!.core;
    el.storage = memoryStorage({ 'diff.ui': 'dark' });
    expect(core.scheme.peek()).toBe('dark');
    const src: ThemeSource = { list: async () => [], get: async () => { throw new Error('none'); } };
    el.themeSource = src;
    expect(core.themeSource).toBe(src);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    el.ctx = { idPrefix: 'a' };
    el.ctx = { idPrefix: 'b' };
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('ctx');
    expect(el.ctx).toEqual({ idPrefix: 'b' });
  });
});

describe('attributes', () => {
  it('viewer: the default fit is not written onto the host', () => {
    const el = viewer();
    el.source = A;
    box().append(el);
    expect(el.hasAttribute('fit')).toBe(false);
    expect(el.instance!.options.fit).toBe('width');
    el.setAttribute('fit', 'contain');
    expect(el.instance!.options.fit).toBe('contain');
    el.removeAttribute('fit');
    expect(el.instance!.options.fit).toBe('width');
  });

  it('editor: a removed ui or name goes back to the default; features is a list like the viewer\'s controls', () => {
    const el = editor();
    el.setAttribute('ui', 'dark');
    el.setAttribute('name', 'deploy');
    el.setAttribute('features', 'pen code-panel');
    box().append(el);
    const e = el.instance!;
    expect(e.fileName).toBe('deploy');
    expect(e.core.scheme.peek()).toBe('dark');
    expect(e.core.features).toMatchObject({ pen: true, codePanel: true, help: false, export: false });
    const setUi = vi.spyOn(e, 'setUi');
    el.removeAttribute('ui');
    expect(setUi).toHaveBeenCalledWith('auto');
    el.removeAttribute('name');
    expect(e.fileName).toBe('diagram');
    el.setAttribute('features', 'none');
    expect(e.core.features.pen).toBe(false);
    expect(e.core.moduleIds).not.toContain('pen');
    el.removeAttribute('features');
    expect(e.core.features.pen).toBe(true);
    // a later property replaces the attribute's value, and the other way round
    el.features = 'help';
    expect(e.core.features).toMatchObject({ help: true, pen: false });
  });

  it('diff: features is a list of the parts that are on', async () => {
    const el = document.createElement('mmdx-diff') as MmdxDiffElement;
    el.storage = memoryStorage();
    el.beforeSource = A;
    el.afterSource = B;
    el.setAttribute('features', 'changes views');
    box().append(el);
    const d = el.instance!;
    expect(d.core.feature('changes')).toBe(true);
    expect(d.core.feature('pen')).toBe(false);
    el.removeAttribute('features');
    expect(d.core.feature('pen')).toBe(true);
    expect(d.options.features).toBeUndefined();
  });

  it('theme editor: one changed attribute applies only that option', async () => {
    const el = document.createElement('mmdx-theme-editor') as MmdxThemeEditorElement;
    el.storage = memoryStorage();
    el.setAttribute('can-edit', '');
    box().append(el);
    await el.ready;
    const te = el.instance!;
    const set = vi.spyOn(te, 'set');
    const main = el.shadowRoot!.querySelector('.te-main')!.firstElementChild;
    el.setAttribute('ui', 'dark');
    expect(set).toHaveBeenLastCalledWith({ ui: 'dark' });
    expect(el.shadowRoot!.querySelector('.te-main')!.firstElementChild).toBe(main);
    el.removeAttribute('ui');
    expect(set).toHaveBeenLastCalledWith({ ui: undefined });
    el.setAttribute('can-edit', 'false');
    expect(set).toHaveBeenLastCalledWith({ canEdit: false });
    expect(set).toHaveBeenCalledTimes(3);
  });
});
