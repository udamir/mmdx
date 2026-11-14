// @vitest-environment jsdom
// P1: a drag draws once per animation frame — the moves of one frame are coalesced to the last; the release applies
// the last move (the item ends where it was let go); a cancel drops a move still waiting for its frame.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';

if (typeof PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (globalThis as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});
const ptr = (el: Element, type: string, x: number, y: number): void =>
  void el.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 7 }));

describe('drag preview per frame (P1)', () => {
  it('many moves in one frame render once; the release commits where it was let go', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const ed = new DiagramEditor(host, { value: 'flowchart TB\n  A[Alpha] --> B[Beta]\n', storage: memoryStorage() });
    editors.push(ed);
    const core = ed.core;
    const el = core.dom.body.querySelector('[data-kind="node"][data-id="A"]')!;
    const b = core.geom.type === 'flowchart' ? core.geom.nodes.get('A')! : null;
    const s = core.toScreen({ x: b!.x, y: b!.y });
    const paint = vi.spyOn(core.storeScene, 'paintDocument');
    ptr(el, 'pointerdown', s.x, s.y);
    const before = paint.mock.calls.length;
    for (let i = 1; i <= 10; i++) ptr(core.dom.svg, 'pointermove', s.x + i * 5, s.y);
    expect(paint.mock.calls.length - before).toBe(0);
    core.flushPreview();
    expect(paint.mock.calls.length - before).toBe(1);
    // a release before the last move's frame: it ends where it was let go
    ptr(core.dom.svg, 'pointermove', s.x + 80, s.y);
    ptr(core.dom.svg, 'pointerup', s.x + 80, s.y);
    const moved = core.geom.type === 'flowchart' ? core.geom.nodes.get('A')! : null;
    const offset = core.toDiagram({ clientX: s.x + 80, clientY: s.y } as PointerEvent).x - core.toDiagram({ clientX: s.x, clientY: s.y } as PointerEvent).x;
    expect(Math.round(moved!.x - b!.x)).toBe(Math.round(offset));
  });

  it('Esc drops a move still waiting for its frame', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const ed = new DiagramEditor(host, { value: 'flowchart TB\n  A[Alpha] --> B[Beta]\n', storage: memoryStorage() });
    editors.push(ed);
    const core = ed.core;
    const before = ed.getSource();
    const el = core.dom.body.querySelector('[data-kind="node"][data-id="A"]')!;
    const b = core.geom.type === 'flowchart' ? core.geom.nodes.get('A')! : null;
    const s = core.toScreen({ x: b!.x, y: b!.y });
    ptr(el, 'pointerdown', s.x, s.y);
    ptr(core.dom.svg, 'pointermove', s.x + 50, s.y);
    core.dom.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    core.flushPreview();
    expect(ed.getSource()).toBe(before);
  });
});
