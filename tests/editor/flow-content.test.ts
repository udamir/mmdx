// @vitest-environment jsdom
// Flowchart content in the editor (T06): resizing an icon or image node writes `h` / `w` into its node data (an icon
// stays square, a locked image keeps its aspect), the inline editor's Bold and Italic on markdown labels and "Make rich
// text", "Convert to icon node" from Properties, invisible links not selectable, the "Animate edges" view setting.
// Every code written is parsed by stock Mermaid 12.2 and 11.17.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { loadBuiltinIcons } from '../../src/core/icons/registry.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { stockParse } from '../helpers/mermaid.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

// jsdom has no PointerEvent: a MouseEvent with a pointer id is all the editor reads
if (typeof globalThis.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (globalThis as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
  await loadBuiltinIcons();
});
const valid = async (code: string): Promise<void> => {
  await expect(mermaidParse(code), code).resolves.toBeTruthy();
};

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

async function mount(value: string): Promise<{ ed: DiagramEditor; core: EditorCore }> {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  editors.push(ed);
  await ed.whenLoaded?.();
  for (let i = 0; i < 4; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));
  }
  ed.core.viewport.set({ k: 1, tx: 0, ty: 0 });
  ed.core.draw();
  return { ed, core: ed.core };
}

let pid = 1;
function pointer(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: pid }));
}
/** Drags the selection's resize handle by (dx, dy). */
function resize(core: EditorCore, dx: number, dy: number): void {
  const handle = core.dom.overlay.querySelector('[data-handle="resize"]')!;
  const hx = Number(handle.getAttribute('x')), hy = Number(handle.getAttribute('y'));
  pid++;
  pointer(handle, 'pointerdown', hx, hy);
  for (let i = 1; i <= 4; i++) pointer(core.dom.svg, 'pointermove', hx + (dx * i) / 4, hy + (dy * i) / 4);
  pointer(core.dom.svg, 'pointerup', hx + dx, hy + dy);
}
const asset = (core: EditorCore, id: string): { w: number; h: number } => {
  const g = core.geom;
  if (g.type !== 'flowchart') throw new Error('flowchart expected');
  return g.nodes.get(id)!.asset!;
};

describe('resizing icon and image nodes (§3.6)', () => {
  it('an icon node: the icon grows square, `h` is written into its node data, nothing stays in metadata', async () => {
    const { core } = await mount('flowchart LR\n  A --> n4\n  n4["User"]\n  n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }\n');
    core.select([{ kind: 'node', id: 'n4' }]);
    core.drawOverlay();
    expect(asset(core, 'n4')).toMatchObject({ w: 60, h: 60 });
    resize(core, 40, 10);
    expect(core.code).toContain('n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 100 }');
    expect(core.getM('node', 'n4').w).toBeUndefined();
    expect(core.getM('node', 'n4').h).toBeUndefined();
    expect(asset(core, 'n4')).toMatchObject({ w: 100, h: 100 });
    await valid(core.code);
    // one step: undo gives the old size back
    core.undo();
    expect(core.code).toContain('h: 60 }');
  });

  it('an image node with the aspect lock keeps its aspect; without it, both sides follow the handle', async () => {
    const { core } = await mount('flowchart LR\n  n5["Photo"]\n  n5@{ img: "https://example.com/a.png", h: 100, w: 200, pos: "b" }\n');
    core.select([{ kind: 'node', id: 'n5' }]);
    core.drawOverlay();
    resize(core, 40, -10);
    expect(core.code).toContain('n5@{ img: "https://example.com/a.png", h: 90, w: 240, pos: "b" }');
    await valid(core.code);
    const { core: c2 } = await mount('flowchart LR\n  n5["Photo"]\n  n5@{ img: "https://example.com/a.png", h: 100, w: 200, constraint: "on" }\n');
    c2.select([{ kind: 'node', id: 'n5' }]);
    c2.drawOverlay();
    resize(c2, 40, 0);
    expect(c2.code).toContain('h: 120, w: 240, constraint: "on" }');
    await valid(c2.code);
  });
});

describe('rich labels in the inline editor (§3.4)', () => {
  const ta = (core: EditorCore): HTMLTextAreaElement => core.dom.wrap.querySelector<HTMLTextAreaElement>('textarea.inline-edit')!;
  const press = (t: HTMLTextAreaElement, key: string, mod = false, shift = false): void =>
    void t.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: mod, metaKey: mod, shiftKey: shift, bubbles: true, cancelable: true }));

  it('formats the selected words (the toolbar\'s menu, ⌘B, ⌘I, ⌘U, ⇧⌘X) and takes them off again; no "Make rich text"', async () => {
    const { core } = await mount('flowchart LR\n  A["`Hello world`"] --> B\n');
    expect(core.run('inlineEdit', { kind: 'node', id: 'A' })).toBe(true);
    const t = ta(core);
    expect(core.dom.wrap.querySelector('.inline-md')).toBeNull();
    const te = core.textEdit!;
    expect(te.rich).toBe(true);
    // the editor opens with the whole text selected: not a part of it
    expect(te.partial()).toBe(false);
    t.setSelectionRange(6, 11);
    expect(te.partial()).toBe(true);
    te.format('b');
    expect(t.value).toBe('Hello **world**');
    expect([t.selectionStart, t.selectionEnd]).toEqual([8, 13]);
    expect(te.formats()).toEqual({ b: true, i: false, u: false, s: false });
    te.format('b');
    expect(t.value).toBe('Hello world');
    t.setSelectionRange(0, 5);
    press(t, 'i', true);
    press(t, 'u', true);
    expect(t.value).toBe('*<u>Hello</u>* world');
    t.setSelectionRange(t.value.length - 5, t.value.length);
    press(t, 'X', true, true);
    expect(t.value).toBe('*<u>Hello</u>* <s>world</s>');
    press(t, 'Enter');
    expect(core.textEdit).toBeNull();
    expect(core.code).toContain('A["`*<u>Hello</u>* <s>world</s>`"]');
    await valid(core.code);
  });

  it('nothing selected formats the whole text; a plain label becomes a markdown string only once it is formatted', async () => {
    const { core } = await mount('flowchart LR\n  A -->|"plain"| B\n');
    const edge = core.model.type === 'flowchart' ? core.model.edges[0]!.id : '';
    expect(core.run('inlineEdit', { kind: 'edge', id: edge })).toBe(true);
    const t = ta(core);
    t.setSelectionRange(2, 2);
    core.textEdit!.format('b');
    expect(t.value).toBe('**plain**');
    press(t, 'Enter');
    expect(core.code).toContain('A -->|"`**plain**`"| B');
    await valid(core.code);
    // an edit without formatting keeps a plain label plain
    expect(core.run('inlineEdit', { kind: 'node', id: 'B' })).toBe(true);
    ta(core).value = 'Bee';
    press(ta(core), 'Enter');
    expect(core.code).toContain('B["Bee"]');
  });
});

describe('icons, links and the view', () => {
  it('"Convert to icon node" in Properties: the label\'s icon becomes the node\'s', async () => {
    const { core } = await mount('flowchart LR\n  C -- Three --> F["fa:fa-car Car"]\n');
    core.select([{ kind: 'node', id: 'F' }]);
    core.run('setPanel', 'properties', true);
    await vi.dynamicImportSettled();
    core.draw();
    const conv = Array.from(core.dom.root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Convert to icon node');
    expect(conv).toBeTruthy();
    conv!.click();
    expect(core.code).toBe('flowchart LR\n  C -- Three --> F["Car"]\n  F@{ icon: "fa:car", form: "rounded", pos: "b", h: 60 }\n');
    await valid(core.code);
  });

  it('an invisible link is in the code only: not drawn, not selectable', async () => {
    const { core } = await mount('flowchart LR\n  A ~~~ B\n  B --> C\n');
    expect(core.dom.body.querySelectorAll('[data-kind="edge"]')).toHaveLength(1);
    core.run('selectAll');
    expect(core.selection().filter((s) => s.kind === 'edge').map((s) => s.id)).toEqual(['B->C']);
    expect(core.selection().map((s) => s.id)).toContain('A');
  });

  it('"Animate edges": on by default, a view setting turns it off', async () => {
    const { core } = await mount('flowchart LR\n  A e1@--> B\n  e1@{ animate: true }\n');
    expect(core.dom.body.querySelector('path.line.mmdx-flow')).not.toBeNull();
    expect(core.root.dataset['edgeAnim']).toBe('on');
    core.setDisplay({ animate: false });
    expect(core.root.dataset['edgeAnim']).toBe('off');
  });
});
