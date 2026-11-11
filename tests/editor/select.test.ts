// @vitest-environment jsdom
// Canvas selection, characterized before its split (5.4): Miro-like groups (a click selects the outermost group, a
// double-click enters it and fades the rest, Esc leaves it and selects it, a click outside leaves it), the selection
// overlay (boxes, one resize handle, the entered group's box, the page), a burst of held arrow keys as one step, the
// resize handle, the hover highlight in View mode, and the selection announced.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { CANVAS_MODULES } from '../../src/editor/modules/canvas/index.js';

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

const GROUPS = 'flowchart TB\n  subgraph Outer\n    subgraph Inner\n      A[Alpha] --> B[Beta]\n    end\n    C[Gamma]\n  end\n  D[Delta] --> A\n';

const editors: DiagramEditor[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});
function mount(value: string): { ed: DiagramEditor; core: EditorCore } {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules: CANVAS_MODULES, storage: memoryStorage() });
  editors.push(ed);
  return { ed, core: ed.core };
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const itemEl = (core: EditorCore, kind: string, id: string): Element => {
  const e = Array.from(core.dom.body.querySelectorAll('.el')).find((n) => n.getAttribute('data-kind') === kind && n.getAttribute('data-id') === id && !n.hasAttribute('data-part'));
  if (!e) throw new Error(`no element ${kind}:${id}`);
  return e.querySelector('rect, path, polygon, ellipse, circle, text') ?? e;
};
const center = (core: EditorCore, id: string): { x: number; y: number } => {
  const g = core.geom;
  if (g.type !== 'flowchart') throw new Error('flowchart expected');
  const b = g.nodes.get(id)!;
  return core.toScreen({ x: b.x, y: b.y });
};
let pid = 1;
const pointer = (target: Element, type: string, x: number, y: number): void =>
  void target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: pid }));
const click = (core: EditorCore, kind: string, id: string): void => {
  pid++;
  const c = center(core, id);
  pointer(itemEl(core, kind, id), 'pointerdown', c.x, c.y);
  pointer(core.dom.svg, 'pointerup', c.x, c.y);
};
const dbl = (core: EditorCore, id: string): void => {
  const c = center(core, id);
  itemEl(core, 'node', id).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, cancelable: true, clientX: c.x, clientY: c.y, detail: 2 }));
};
const keydown = (core: EditorCore, k: string, o: { shift?: boolean } = {}): void =>
  void core.dom.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, composed: true, cancelable: true, shiftKey: !!o.shift }));
const keyup = (core: EditorCore, k: string): void => void core.dom.root.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: k, bubbles: true, composed: true }));
const sel = (core: EditorCore): string[] => core.selection().map((s) => `${s.kind}:${s.id}`);
const overlay = (core: EditorCore, cls: string): number => core.dom.overlay.querySelectorAll(`.${cls}`).length;
const inEdit = (core: EditorCore): string[] => Array.from(core.dom.body.querySelectorAll('.el.in-edit')).map((n) => `${n.getAttribute('data-kind')}:${n.getAttribute('data-id')}`).sort();

describe('canvas selection: groups', () => {
  it('a click selects the outermost group; double-clicks enter one level at a time; Esc leaves and selects the group', async () => {
    const { core } = mount(GROUPS);
    await settle();
    click(core, 'node', 'A');
    expect(sel(core)).toEqual(['group:Outer']);
    dbl(core, 'A');
    expect(core.enteredGroup.peek()).toBe('Outer');
    expect(sel(core)).toEqual(['group:Inner']);
    expect(overlay(core, 'entered-box')).toBe(1);
    // what is inside the entered group stays, the rest fades
    expect(inEdit(core)).toContain('node:C');
    expect(inEdit(core)).toContain('edge:A->B');
    expect(inEdit(core)).not.toContain('node:D');
    expect(inEdit(core).filter((k) => k.startsWith('edge:'))).toEqual(['edge:A->B']);
    dbl(core, 'A');
    expect(core.enteredGroup.peek()).toBe('Inner');
    expect(sel(core)).toEqual(['node:A']);
    // a click inside selects the item itself
    click(core, 'node', 'B');
    expect(sel(core)).toEqual(['node:B']);
    keydown(core, 'Escape');
    expect(core.enteredGroup.peek()).toBeNull();
    expect(sel(core)).toEqual(['group:Inner']);
    expect(inEdit(core)).toEqual([]);
  });

  it('a click outside the entered group leaves it; a locked group is skipped', () => {
    const { core } = mount(`${GROUPS}%%@ group Outer {"locked":true}\n`);
    click(core, 'node', 'A');
    expect(sel(core)).toEqual(['group:Inner']);
    core.run('enterGroup', 'Inner');
    expect(core.enteredGroup.peek()).toBe('Inner');
    expect(sel(core)).toEqual([]);
    click(core, 'node', 'D');
    expect(core.enteredGroup.peek()).toBeNull();
    expect(sel(core)).toEqual(['node:D']);
  });
});

describe('canvas selection: overlay', () => {
  it('one box per selected item, the resize handle for one only; the page box when the page is selected', () => {
    const { core } = mount(GROUPS);
    core.select([{ kind: 'node', id: 'D' }]);
    core.drawOverlay();
    expect(overlay(core, 'sel-box')).toBe(1);
    expect(overlay(core, 'sel-handle')).toBe(1);
    core.select([{ kind: 'node', id: 'D' }, { kind: 'group', id: 'Outer' }]);
    core.drawOverlay();
    expect(overlay(core, 'sel-box')).toBe(2);
    expect(overlay(core, 'sel-handle')).toBe(0);
    core.select([]);
    core.pageSelected.set(true);
    core.drawOverlay();
    expect(overlay(core, 'page-sel')).toBe(1);
    // a press on the canvas drops the page selection
    pointer(core.dom.svg, 'pointerdown', 1, 1);
    expect(core.pageSelected.peek()).toBe(false);
  });

  it('the resize handle sizes the item from its top-left corner, one step', () => {
    const { ed, core } = mount(GROUPS);
    core.select([{ kind: 'node', id: 'D' }]);
    core.drawOverlay();
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    const b0 = g.nodes.get('D')!;
    const handle = core.dom.overlay.querySelector('[data-handle="resize"]')!;
    const at = core.toScreen({ x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 });
    pid++;
    pointer(handle, 'pointerdown', at.x, at.y);
    pointer(core.dom.svg, 'pointermove', at.x + 20, at.y + 10);
    pointer(core.dom.svg, 'pointermove', at.x + 40, at.y + 20);
    pointer(core.dom.svg, 'pointerup', at.x + 40, at.y + 20);
    const m = core.getM('node', 'D');
    expect(m.w).toBeGreaterThan(b0.w);
    expect(m.h).toBeGreaterThan(b0.h);
    expect((m.x as number) - (m.w as number) / 2).toBeCloseTo(b0.x - b0.w / 2, 0);
    ed.undo();
    expect(core.getM('node', 'D').w).toBeUndefined();
  });
});

describe('canvas selection: keyboard and announcements', () => {
  it('held arrow keys are one history step, ended by the key-up', () => {
    const { ed, core } = mount(GROUPS);
    core.select([{ kind: 'node', id: 'D' }]);
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    const x0 = Math.round(g.nodes.get('D')!.x);
    for (let i = 0; i < 5; i++) keydown(core, 'ArrowRight');
    keyup(core, 'ArrowRight');
    expect(core.getM('node', 'D').x).toBe(x0 + 5);
    ed.undo();
    expect(core.getM('node', 'D').x).toBeUndefined();
  });

  it('a burst of nudges ends by itself after a pause', () => {
    vi.useFakeTimers();
    const { ed, core } = mount(GROUPS);
    core.select([{ kind: 'node', id: 'D' }]);
    keydown(core, 'ArrowDown');
    keydown(core, 'ArrowDown');
    expect(core.store.inTransaction).toBe(true);
    vi.advanceTimersByTime(500);
    expect(core.store.inTransaction).toBe(false);
    expect(ed.dirty).toBe(true);
  });

  it('announces the selection to screen readers, and its clearing once', () => {
    const { core } = mount(GROUPS);
    const live = core.dom.root.querySelector('.mmdx-sr[aria-live]')!;
    expect(live).toBeTruthy();
    core.select([{ kind: 'node', id: 'D' }]);
    expect(live.textContent).toMatch(/^Selected node Delta, 1 connection$/);
    core.select([{ kind: 'node', id: 'D' }, { kind: 'node', id: 'A' }]);
    expect(live.textContent).toBe('Selected 2 items');
    core.select([]);
    expect(live.textContent).toBe('Selection cleared');
  });
});

describe('canvas selection: View mode', () => {
  it('hovering highlights an item and its connections; leaving clears it', () => {
    const { core } = mount(GROUPS);
    core.setMode('view');
    const d = itemEl(core, 'node', 'D');
    d.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true }));
    expect(core.dom.body.classList.contains('dim')).toBe(true);
    const lit = Array.from(core.dom.body.querySelectorAll('.el.hl')).map((n) => `${n.getAttribute('data-kind')}:${n.getAttribute('data-id')}`);
    expect(lit).toEqual(expect.arrayContaining(['node:D', 'node:A']));
    expect(lit).not.toContain('node:C');
    core.dom.svg.dispatchEvent(new PointerEvent('pointerleave'));
    expect(core.dom.body.classList.contains('dim')).toBe(false);
    expect(core.dom.body.querySelectorAll('.hl').length).toBe(0);
  });
});
