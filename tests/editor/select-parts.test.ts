// @vitest-environment jsdom
// The parts of canvas selection one at a time (R5, BUG-025): each test installs one part — the shared state with the overlay, the overlay, the gestures, the pointer extras, the nudge — in a module of its own, without the rest of the canvas modules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import type { EditorModule } from '../../src/editor/module.js';
import { installNudge, type Nudge } from '../../src/editor/modules/canvas/nudge.js';
import { installSelectGestures } from '../../src/editor/modules/canvas/select-gestures.js';
import { installSelectionOverlay } from '../../src/editor/modules/canvas/select-overlay.js';
import { installSelectPointer } from '../../src/editor/modules/canvas/select-pointer.js';
import type { SelectScope, SelectState } from '../../src/editor/modules/canvas/select-state.js';

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

const FLOW = 'flowchart LR\n  A[Alpha] --> B[Beta]\n  subgraph G\n    C[Gamma]\n  end\n';

const editors: DiagramEditor[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

/** An editor with one part of the selection installed (and `extra` modules). */
function mount(part: (scope: SelectScope, st: SelectState) => void, extra: EditorModule[] = []): { ed: DiagramEditor; core: EditorCore; st: SelectState } {
  const st: SelectState = { marquee: null, sizing: null };
  const host = document.createElement('div');
  document.body.append(host);
  const mod: EditorModule = { id: 'select-part', install: (scope) => part(scope, st) };
  const ed = new DiagramEditor(host, { value: FLOW, modules: [mod, ...extra], storage: memoryStorage() });
  editors.push(ed);
  return { ed, core: ed.core, st };
}

const box = (core: EditorCore, id: string): { x: number; y: number; w: number; h: number } => {
  const g = core.geom;
  if (g.type !== 'flowchart') throw new Error('flowchart expected');
  return g.nodes.get(id)!;
};
const center = (core: EditorCore, id: string): { x: number; y: number } => core.toScreen(box(core, id));
const itemEl = (core: EditorCore, id: string): Element => {
  const e = core.itemElements({ kind: 'node', id }).find((n) => !n.hasAttribute('data-part'));
  if (!e) throw new Error(`no element ${id}`);
  return e.querySelector('rect, path, polygon, ellipse, circle, text') ?? e;
};
let pid = 1;
const pointer = (target: Element, type: string, x: number, y: number, o: { alt?: boolean } = {}): void =>
  void target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: pid, altKey: !!o.alt }));
const drag = (core: EditorCore, from: Element, a: { x: number; y: number }, dx: number, dy: number): void => {
  pid++;
  pointer(from, 'pointerdown', a.x, a.y);
  pointer(core.dom.svg, 'pointermove', a.x + dx / 2, a.y + dy / 2);
  pointer(core.dom.svg, 'pointermove', a.x + dx, a.y + dy);
  core.flushPreview();
  pointer(core.dom.svg, 'pointerup', a.x + dx, a.y + dy);
};
const key = (core: EditorCore, type: 'keydown' | 'keyup', k: string): void =>
  void core.dom.root.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, bubbles: true, composed: true, cancelable: true }));
const overlay = (core: EditorCore, cls: string): Element[] => Array.from(core.dom.overlay.querySelectorAll(`.${cls}`));
const sel = (core: EditorCore): string[] => core.selection().map((s) => `${s.kind}:${s.id}`);

describe('select-state (with the overlay that draws it)', () => {
  it('a marquee in the state is drawn, dashed when dragged right to left; the item being sized gets its size badge', () => {
    const { core, st } = mount(installSelectionOverlay);
    st.marquee = { x0: 0, y0: 0, x1: 40, y1: 30 };
    core.drawOverlay();
    const [m] = overlay(core, 'marquee');
    expect(m?.getAttribute('width')).toBe('40');
    expect(m?.classList.contains('crossing')).toBe(false);
    st.marquee = { x0: 40, y0: 0, x1: 0, y1: 30 };
    core.drawOverlay();
    expect(overlay(core, 'marquee')[0]?.classList.contains('crossing')).toBe(true);
    st.marquee = null;
    st.sizing = { kind: 'node', id: 'A' };
    core.drawOverlay();
    expect(overlay(core, 'marquee')).toHaveLength(0);
    const b = box(core, 'A');
    expect(overlay(core, 'size-badge-text')[0]?.textContent).toBe(`${Math.round(b.w)} × ${Math.round(b.h)}`);
  });
});

describe('select-overlay', () => {
  it('a box per selected item and the resize handle for one; the entered group\'s box; the page box; no handle on an old version', () => {
    const { core } = mount(installSelectionOverlay);
    core.select([{ kind: 'node', id: 'A' }]);
    core.drawOverlay();
    expect(overlay(core, 'sel-box')).toHaveLength(1);
    expect(overlay(core, 'sel-handle')).toHaveLength(1);
    core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    core.drawOverlay();
    expect(overlay(core, 'sel-box')).toHaveLength(2);
    expect(overlay(core, 'sel-handle')).toHaveLength(0);
    core.select([]);
    core.enterGroup('G');
    core.selectPage(true);
    core.drawOverlay();
    expect(overlay(core, 'entered-box')).toHaveLength(1);
    expect(overlay(core, 'page-sel')).toHaveLength(1);
    core.enterGroup(null);
    core.selectPage(false);
    core.showVersion({ id: 'v1', source: FLOW });
    core.select([{ kind: 'node', id: 'A' }]);
    core.drawOverlay();
    expect(overlay(core, 'sel-box')).toHaveLength(1);
    expect(overlay(core, 'sel-handle')).toHaveLength(0);
  });
});

describe('select-gestures', () => {
  it('a press selects an item and a drag moves it, one history step', () => {
    const { ed, core } = mount(installSelectGestures);
    const x0 = Math.round(box(core, 'A').x);
    drag(core, itemEl(core, 'A'), center(core, 'A'), 30, 0);
    expect(sel(core)).toEqual(['node:A']);
    expect((core.getM('node', 'A').x as number) - x0).toBeGreaterThanOrEqual(20);
    ed.undo();
    expect(core.getM('node', 'A').x).toBeUndefined();
  });

  it('an item in a group selects the group; a marquee from the empty canvas selects what it encloses', () => {
    const { core } = mount(installSelectGestures);
    pid++;
    const c = center(core, 'C');
    pointer(itemEl(core, 'C'), 'pointerdown', c.x, c.y);
    pointer(core.dom.svg, 'pointerup', c.x, c.y);
    expect(sel(core)).toEqual(['group:G']);
    // left to right around A and B only
    const a = core.toScreen({ x: box(core, 'A').x - box(core, 'A').w, y: box(core, 'A').y - box(core, 'A').h });
    const b = core.toScreen({ x: box(core, 'B').x + box(core, 'B').w, y: box(core, 'B').y + box(core, 'B').h });
    drag(core, core.dom.svg, a, b.x - a.x, b.y - a.y);
    expect(sel(core).filter((s) => s.startsWith('node:')).sort()).toEqual(['node:A', 'node:B']);
    expect(sel(core)).not.toContain('group:G');
  });

  it('Alt-drag copies the item, one step', () => {
    const { ed, core } = mount(installSelectGestures);
    const n = core.model.type === 'flowchart' ? core.model.nodes.size : 0;
    pid++;
    const c = center(core, 'A');
    pointer(itemEl(core, 'A'), 'pointerdown', c.x, c.y, { alt: true });
    pointer(core.dom.svg, 'pointermove', c.x + 40, c.y + 40, { alt: true });
    core.flushPreview();
    pointer(core.dom.svg, 'pointerup', c.x + 40, c.y + 40, { alt: true });
    expect(core.model.type === 'flowchart' ? core.model.nodes.size : 0).toBe(n + 1);
    ed.undo();
    expect(core.model.type === 'flowchart' ? core.model.nodes.size : 0).toBe(n);
  });
});

describe('select-pointer', () => {
  it('Alt over the canvas shows the copy cursor; a press drops the page selection; a double-click edits the text', () => {
    const edits: string[] = [];
    const inline: EditorModule = { id: 'inline-stub', install: (scope) => scope.provide('inlineEdit', (it) => (edits.push(`${it.kind}:${it.id}`), true)) };
    const { core } = mount((scope) => installSelectPointer(scope), [inline]);
    const root = core.dom.root;
    key(core, 'keydown', 'Alt');
    expect(root.classList.contains('alt-copy')).toBe(true);
    key(core, 'keyup', 'Alt');
    expect(root.classList.contains('alt-copy')).toBe(false);
    core.selectPage(true);
    pointer(core.dom.svg, 'pointerdown', 1, 1);
    expect(core.pageSelected.peek()).toBe(false);
    const c = center(core, 'A');
    itemEl(core, 'A').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, cancelable: true, clientX: c.x, clientY: c.y, detail: 2 }));
    expect(edits).toEqual(['node:A']);
  });

  it('a double-click on a group\'s item enters the group', () => {
    const { core } = mount((scope) => installSelectPointer(scope));
    const c = center(core, 'C');
    itemEl(core, 'C').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, cancelable: true, clientX: c.x, clientY: c.y, detail: 2 }));
    expect(core.enteredGroup.peek()).toBe('G');
    expect(sel(core)).toEqual(['node:C']);
  });
});

describe('nudge', () => {
  let nudge: Nudge | null = null;
  const withNudge = (scope: SelectScope): void => void (nudge = installNudge(scope));

  it('moves the selection by the step, one history step per burst, ended by an arrow\'s key-up', () => {
    const { ed, core } = mount(withNudge);
    expect(nudge!.nudge(1, 0, 1)).toBe(false);
    core.select([{ kind: 'node', id: 'A' }]);
    const x0 = Math.round(box(core, 'A').x);
    nudge!.nudge(1, 0, 1);
    nudge!.nudge(1, 0, 10);
    expect(core.store.inTransaction).toBe(true);
    key(core, 'keyup', 'ArrowRight');
    expect(core.store.inTransaction).toBe(false);
    expect(core.getM('node', 'A').x).toBe(x0 + 11);
    ed.undo();
    expect(core.getM('node', 'A').x).toBeUndefined();
  });

  it('a locked item stays; a pause ends the burst', () => {
    vi.useFakeTimers();
    const { core } = mount(withNudge);
    core.change('lock', () => void (core.ensure('node', 'A').locked = true));
    core.select([{ kind: 'node', id: 'A' }]);
    expect(nudge!.nudge(1, 0, 1)).toBe(true);
    expect(core.getM('node', 'A').x).toBeUndefined();
    core.select([{ kind: 'node', id: 'B' }]);
    nudge!.nudge(0, 1, 1);
    expect(core.store.inTransaction).toBe(true);
    vi.advanceTimersByTime(500);
    expect(core.store.inTransaction).toBe(false);
  });
});
