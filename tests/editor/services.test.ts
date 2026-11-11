// @vitest-environment jsdom
// The editor's kernel services (A10g): the group tree (pure functions of a model), the kind loader (waiters, a fit
// owed while a kind loads), the document's type as a computed (B42: followed without the `model` event), the version
// source (what showing a version puts aside and gives back) and the host's services (where an upload goes).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { forgetEditKinds } from '../../src/editor/kinds/registry.js';
import { forgetKinds, forgetOps } from '../../src/core/kinds/registry.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { groupDescendants, groupTarget, insideGroup, parentOf } from '../../src/editor/services/group-tree.js';
import { HostServices } from '../../src/editor/services/host-services.js';
import { KindLoader } from '../../src/editor/services/kind-loader.js';
import { editorHasKind, loadEditorKind } from '../../src/editor/kinds/loader.js';
import { effect } from '../../src/reactive/signal.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const eds: DiagramEditor[] = [];
afterEach(() => {
  for (const ed of eds.splice(0)) ed.destroy();
  document.body.replaceChildren();
});
const mount = async (value: string): Promise<DiagramEditor> => {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  eds.push(ed);
  await ed.whenLoaded();
  return ed;
};

const NESTED = 'flowchart TB\n  subgraph Outer\n    subgraph Inner\n      A --> B\n    end\n    C\n  end\n  D\n';

describe('GroupTree', () => {
  it('finds the parent, the descendants and whether an item is inside a group', async () => {
    const m = (await mount(NESTED)).core.model;
    expect(parentOf(m, { kind: 'node', id: 'A' })).toBe('Inner');
    expect(parentOf(m, { kind: 'group', id: 'Inner' })).toBe('Outer');
    expect(parentOf(m, { kind: 'node', id: 'D' })).toBeNull();
    expect(insideGroup(m, { kind: 'node', id: 'A' }, 'Outer')).toBe(true);
    expect(insideGroup(m, { kind: 'group', id: 'Outer' }, 'Outer')).toBe(true);
    expect(insideGroup(m, { kind: 'node', id: 'D' }, 'Outer')).toBe(false);
    const d = groupDescendants(m, 'Outer');
    expect([...d.nodes].sort()).toEqual(['A', 'B', 'C']);
    expect(d.groups).toEqual(['Inner']);
  });

  it('selects the outermost group a click reaches: it stops at the entered group and lanes, and skips locked groups', async () => {
    const m = (await mount(NESTED)).core.model;
    const a = { kind: 'node' as const, id: 'A' };
    const walk = { entered: null, isLane: () => false, locked: () => false };
    expect(groupTarget(m, a, walk)).toBe('Outer');
    expect(groupTarget(m, a, { ...walk, entered: 'Outer' })).toBe('Inner');
    expect(groupTarget(m, a, { ...walk, isLane: (g) => g === 'Outer' })).toBe('Inner');
    expect(groupTarget(m, a, { ...walk, locked: (g) => g === 'Outer' })).toBe('Inner');
    expect(groupTarget(m, a, { ...walk, locked: () => true })).toBeNull();
    expect(groupTarget(m, { kind: 'edge', id: 'A->B' }, walk)).toBeNull();
  });
});

describe('KindLoader', () => {
  it('resolves its waiters once the kinds arrive, and owes a fit only for a kind still loading', async () => {
    forgetKinds();
    forgetOps();
    forgetEditKinds();
    const loaded = vi.fn<(fit: boolean) => void>();
    const k = new KindLoader({ has: editorHasKind, load: loadEditorKind, live: () => false, loaded, failed: () => undefined });
    const code = 'sequenceDiagram\n  A->>B: hi\n';
    k.oweFit(code);
    await k.ready(code);
    expect(loaded).toHaveBeenCalledWith(true);
    // loaded now: nothing owed, ready at once, nothing to load
    k.oweFit(code);
    await k.ready(code);
    k.need(code);
    await Promise.resolve();
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});

describe('the document type (B42)', () => {
  it('follows the code, also when the new type was loaded before (no `model` event needed)', async () => {
    await mount('mindmap\n  root\n');
    const ed = await mount('flowchart LR\n  a --> b\n');
    const seen: (string | null)[] = [];
    const off = effect(() => void seen.push(ed.core.docType()));
    ed.setSource('mindmap\n  root\n    child\n', { history: 'push' });
    ed.setSource('mindmap\n  root\n    other\n', { history: 'push' });
    off();
    expect(seen).toEqual(['flowchart', 'mindmap']);
  });
});

describe('VersionSource', () => {
  it('puts the entered group and the layer override aside while a version shows, and gives them back', async () => {
    const ed = await mount(NESTED);
    const core = ed.core;
    core.enteredGroup.set('Outer');
    core.showVersion({ id: 'v1', source: 'flowchart TB\n  A --> B\n' });
    expect(core.version.peek()?.model.type).toBe('flowchart');
    expect(core.code.trim()).toBe('flowchart TB\n  A --> B');
    expect(core.enteredGroup.peek()).toBeNull();
    // the same version again is a no-op; another one keeps what was put aside
    core.showVersion({ id: 'v1', source: 'flowchart TB\n  A --> B\n' });
    core.showVersion({ id: 'v2', source: NESTED });
    core.showVersion(null);
    expect(core.version.peek()).toBeNull();
    expect(core.enteredGroup.peek()).toBe('Outer');
    expect(core.code.trim()).toBe(NESTED.trim());
  });
});

describe('HostServices', () => {
  it('uploads to the image store first, else through the host upload', async () => {
    const h = new HostServices();
    expect(h.upload()).toBeNull();
    const up = vi.fn(async () => ({ url: 'u' }));
    h.uploadImage.set(up);
    expect(h.upload()).toBe(up);
    const put = vi.fn(async () => ({ url: 's', id: '1', name: 'a.png' }));
    h.images.set({ list: async () => ({ items: [] }), put } as never);
    const file = new File(['x'], 'a.png');
    await expect(h.upload()!(file)).resolves.toMatchObject({ url: 's' });
    expect(put).toHaveBeenCalledWith(file, { name: 'a.png' });
    expect(up).not.toHaveBeenCalled();
  });
});
