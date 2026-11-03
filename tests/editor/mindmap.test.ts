// @vitest-environment jsdom
// Mindmap gestures (T08.6): the outline keys, the + and fold handles, drag to re-parent / reorder / switch sides,
// ⌥-drag copies, Shift+Delete, duplicate and paste of branches and of indented text, the Page property that writes
// colorBy, images in metadata — each one undo step, and every result parsed by stock Mermaid 11.17.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import { editKind } from '../../src/editor/kinds/registry.js';
import { setImageOf } from '../../src/editor/ops/media.js';
import { mindmapKeys } from '../../src/editor/modules/mindmap/index.js';
import { click, drag, handle, press, pev } from './connect.helpers.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

const SRC = `mindmap
  root((Topic))
    a[Alpha]
      a1
    Beta
      b1
    c(Gamma)
`;

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  mermaidParse = (code) => mermaid.parse(code);
});

/** An editor with every module; the mindmap gestures (the module's lazy part) loaded. */
async function mount(value = SRC): Promise<{ ed: DiagramEditor; core: EditorCore }> {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules: DEFAULT_MODULES, storage: memoryStorage() });
  ed.core.viewport.set({ k: 1, tx: 0, ty: 0 });
  editors.push(ed);
  await import('../../src/editor/modules/mindmap/gestures.js');
  await vi.waitFor(() => expect(Object.keys(mindmapKeys(ed.core)).length).toBeGreaterThan(0));
  return { ed, core: ed.core };
}

function key(core: EditorCore, k: string, o: { mod?: boolean; shift?: boolean; alt?: boolean } = {}): void {
  const t = core.dom.root;
  t.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, composed: true, cancelable: true, ctrlKey: !!o.mod, metaKey: !!o.mod, shiftKey: !!o.shift, altKey: !!o.alt }));
  t.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k, bubbles: true, composed: true, ctrlKey: !!o.mod, metaKey: !!o.mod, shiftKey: !!o.shift, altKey: !!o.alt }));
}

const geom = (core: EditorCore) => {
  if (core.geom.type !== 'mindmap') throw new Error('not a mindmap');
  return core.geom;
};
const nodeId = (core: EditorCore, label: string): string => {
  if (core.model.type !== 'mindmap') throw new Error('not a mindmap');
  return [...core.model.nodes.values()].find((n) => n.label === label)!.id;
};
const at = (core: EditorCore, label: string) => {
  const b = geom(core).nodes.get(nodeId(core, label))!;
  return { x: b.x, y: b.y, w: b.w, h: b.h };
};
const el = (core: EditorCore, label: string): Element => core.dom.body.querySelector(`.el.mm-node[data-id="${nodeId(core, label)}"] rect, .el.mm-node[data-id="${nodeId(core, label)}"] path`)!;
const select = (core: EditorCore, label: string): void => {
  core.select([{ kind: 'node', id: nodeId(core, label) }]);
  core.draw();
};
const body = (core: EditorCore): string[] => core.code.split('\n').slice(1).filter(Boolean);
const valid = async (core: EditorCore): Promise<void> => {
  await expect(mermaidParse(core.code), core.code).resolves.toBeTruthy();
};

describe('mindmap: outline keys', () => {
  it('Tab adds a child, Enter a sibling, both selected; one undo step each', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    select(core, 'Alpha');
    key(core, 'Tab');
    expect(body(core)).toEqual(['  root((Topic))', '    a[Alpha]', '      a1', '      New idea', '    Beta', '      b1', '    c(Gamma)']);
    expect(core.primary()).toEqual({ kind: 'node', id: nodeId(core, 'New idea') });
    key(core, 'Enter');
    expect(body(core)[4]).toBe('      New idea');
    await valid(core);
    ed.undo();
    ed.undo();
    expect(core.code).toBe(before);
  });

  it('Shift+Tab moves out, ⌥→ under the node above, ⌥↑ / ⌥↓ trade places', async () => {
    const { core } = await mount();
    select(core, 'a1');
    key(core, 'Tab', { shift: true });
    expect(body(core).slice(1, 3)).toEqual(['    a[Alpha]', '    a1']);
    key(core, 'ArrowRight', { alt: true });
    expect(body(core).slice(1, 3)).toEqual(['    a[Alpha]', '      a1']);
    select(core, 'Gamma');
    key(core, 'ArrowUp', { alt: true });
    expect(body(core).slice(3)).toEqual(['    c(Gamma)', '    Beta', '      b1']);
    expect(core.primary()).toEqual({ kind: 'node', id: 'c' });
    await valid(core);
  });

  it('the arrows walk the tree', async () => {
    const { core } = await mount();
    select(core, 'Alpha');
    const side = geom(core).nodes.get('a')!.side;
    key(core, side === 'l' ? 'ArrowLeft' : 'ArrowRight');
    expect(core.primary()?.id).toBe(nodeId(core, 'a1'));
    key(core, side === 'l' ? 'ArrowRight' : 'ArrowLeft');
    expect(core.primary()?.id).toBe('a');
  });

  it('Space folds and unfolds (metadata collapsed, a +N badge); Shift+Delete keeps the children', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    select(core, 'Alpha');
    key(core, ' ');
    expect(core.meta.nodes?.['a']).toEqual({ collapsed: true });
    expect(geom(core).nodes.has(nodeId(core, 'a1'))).toBe(false);
    expect(core.dom.body.querySelector('.mm-fold')).not.toBeNull();
    key(core, ' ');
    expect(core.meta.nodes?.['a']).toBeUndefined();
    key(core, 'Delete', { shift: true });
    expect(body(core).slice(1, 3)).toEqual(['    a1', '    Beta']);
    await valid(core);
    ed.undo();
    expect(core.code).toBe(before);
  });

  it('⌘D duplicates a branch next to it with a unique id; ⌘C / ⌘V pastes it under the selected node', async () => {
    const { core } = await mount();
    select(core, 'Alpha');
    key(core, 'd', { mod: true });
    expect(body(core).slice(3, 5)).toEqual(['    a_2[Alpha]', '      a1']);
    expect(core.primary()).toEqual({ kind: 'node', id: 'a_2' });
    select(core, 'Gamma');
    core.select([{ kind: 'node', id: 'a' }]);
    key(core, 'c', { mod: true });
    select(core, 'Gamma');
    key(core, 'v', { mod: true });
    expect(body(core).slice(-2)).toEqual(['      a_3[Alpha]', '        a1']);
    await valid(core);
  });

  it('pasted indented text becomes a subtree of the selected node', async () => {
    const { core } = await mount();
    select(core, 'Gamma');
    const ev = new Event('paste', { bubbles: true, composed: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => '- One\n  - Two\n- Three', files: [] } });
    core.dom.root.dispatchEvent(ev);
    expect(body(core).slice(-3)).toEqual(['      One', '        Two', '      Three']);
    await valid(core);
  });
});

describe('mindmap: handles and drag', () => {
  it('the + handle adds a child; the fold handle folds', async () => {
    const { core } = await mount();
    select(core, 'Beta');
    core.drawOverlay();
    const h = handle(core, '[data-handle="mm-add"]');
    click(core, h, { x: 0, y: 0 });
    expect(body(core)[5]).toBe('      New idea');
    select(core, 'Beta');
    core.drawOverlay();
    click(core, handle(core, '[data-handle="mm-fold"]'), { x: 0, y: 0 });
    expect(core.meta.nodes?.[nodeId(core, 'Beta')]).toEqual({ collapsed: true });
  });

  it('dragging a node onto another re-parents it, between siblings reorders it; ⌥-drag copies', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    const a1 = at(core, 'a1'), gamma = at(core, 'Gamma');
    drag(core, el(core, 'a1'), a1, gamma);
    expect(body(core)).toEqual(['  root((Topic))', '    a[Alpha]', '    Beta', '      b1', '    c(Gamma)', '      a1']);
    await valid(core);
    ed.undo();
    expect(core.code).toBe(before);
    const b1 = at(core, 'b1');
    drag(core, el(core, 'b1'), b1, at(core, 'Gamma'), { altKey: true });
    expect(body(core).slice(-2)).toEqual(['    c(Gamma)', '      b1']);
    expect(body(core)).toContain('      b1');
    await valid(core);
  });

  it('a first-level branch dropped across the root switches sides (metadata side)', async () => {
    const { core } = await mount();
    const root = at(core, 'Topic'), c = at(core, 'Gamma');
    const side = geom(core).nodes.get('c')!.side;
    const to = { x: root.x + (side === 'r' ? -1 : 1) * (root.w / 2 + 120), y: root.y + 200 };
    const g = press(core, el(core, 'Gamma'), c);
    expect(g).not.toBeNull();
    for (const t of [0.5, 1]) g!.move((to.x - c.x) * t, (to.y - c.y) * t, pev('pointermove', to));
    g!.end?.(pev('pointerup', to));
    expect(core.meta.nodes?.['c']?.side).toBe(side === 'r' ? 'l' : 'r');
    expect(geom(core).nodes.get('c')!.side).toBe(side === 'r' ? 'l' : 'r');
  });
});

describe('mindmap: the edit kind', () => {
  it('icons are label tokens; images are metadata; colorBy is written to the frontmatter', async () => {
    const { core } = await mount();
    const k = editKind('mindmap')!;
    const M = core.model;
    if (M.type !== 'mindmap') throw new Error();
    expect(k.setIcon!(core.code, M, { kind: 'node', id: 'a' }, 'fa:book', core)!.code).toContain('a[fa:fa-book Alpha]');
    expect(setImageOf(core, [{ kind: 'node', id: 'a' }], 'https://example.com/x.png')).toBe(true);
    expect(core.meta.nodes?.['a']?.img).toBe('https://example.com/x.png');
    expect(k.media!(core.model as never, { kind: 'node', id: 'a' }, core)).toMatchObject({ image: 'https://example.com/x.png', canImage: true });
    const opt = k.pageOptions!(core.model as never, core)[0]!;
    opt.set('depth');
    expect(core.code.startsWith('---\nconfig:\n  mindmap:\n    colorBy: depth\n---\n')).toBe(true);
    await valid(core);
  });

  it('the Shapes menu adds a child of the selected node in that shape; an empty map gets its root', async () => {
    const { core } = await mount();
    select(core, 'Beta');
    const k = editKind('mindmap')!;
    const item = k.palette!.items.find((x) => 'key' in x && x.key === 'cloud')!;
    expect(k.drop!(core, core.model as never, item as never, { x: 0, y: 0 })).toBe(true);
    expect(body(core)[5]).toBe('      )New idea(');
    const e = await mount('mindmap\n');
    expect(k.addText!(e.core, e.core.model as never, { x: 0, y: 0 })).toBe(true);
    expect(e.core.code.trimEnd()).toBe('mindmap\n  ((New idea))');
  });
});
