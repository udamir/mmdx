// @vitest-environment jsdom
// The editor's View mode (A16): characterization of what it does on the canvas — a linked item opens its link
// (`mmdx-link`, cancelable) on a plain click, not after a pan, not in Edit mode, once per click; hovering highlights
// an item and what it connects to, unless the Display setting is off; a pen stroke follows no link.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';


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


beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

const LINKED = 'flowchart TB\n  A[Docs] --> B[Home]\n  B --> C[Other]\n  click A href "https://example.com/docs"\n';

function mount(value: string): DiagramEditor {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  editors.push(ed);
  return ed;
}

function links(ed: DiagramEditor): unknown[] {
  const got: unknown[] = [];
  (ed.core.dom.shadow.host as HTMLElement).addEventListener('mmdx-link', (ev) => {
    got.push((ev as CustomEvent).detail);
    ev.preventDefault();
  });
  return got;
}

const at = (x: number, y: number): MouseEventInit & PointerEventInit => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y });

describe('editor View mode', () => {
  it('a click on a linked item raises one mmdx-link; a click after a pan or in Edit mode none', async () => {
    const ed = mount(LINKED);
    await ed.whenLoaded();
    const got = links(ed);
    ed.setMode('view');
    const target = () => ed.core.dom.body.querySelector('[data-link]')!;
    target().dispatchEvent(new PointerEvent('pointerdown', at(10, 10)));
    target().dispatchEvent(new MouseEvent('click', at(10, 10)));
    expect(got).toEqual([{ href: 'https://example.com/docs', id: 'A' }]);
    // the end of a pan
    target().dispatchEvent(new PointerEvent('pointerdown', at(10, 10)));
    target().dispatchEvent(new MouseEvent('click', at(40, 10)));
    expect(got).toHaveLength(1);
    ed.setMode('edit');
    target().dispatchEvent(new PointerEvent('pointerdown', at(10, 10)));
    target().dispatchEvent(new MouseEvent('click', at(10, 10)));
    expect(got).toHaveLength(1);
  });

  it('hovering highlights an item and its connections, unless the Display setting is off', async () => {
    const ed = mount(LINKED);
    await ed.whenLoaded();
    const core = ed.core;
    core.setMode('view');
    const b = core.dom.body.querySelector('.el[data-kind="node"][data-id="B"]')!;
    b.dispatchEvent(new PointerEvent('pointermove', at(5, 5)));
    expect(core.dom.body.classList.contains('dim')).toBe(true);
    const lit = [...core.dom.body.querySelectorAll('.el.hl')].map((n) => n.getAttribute('data-id'));
    expect(lit).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    core.dom.svg.dispatchEvent(new PointerEvent('pointerleave'));
    expect(core.dom.body.classList.contains('dim')).toBe(false);
    core.setDisplay({ hoverHighlight: false });
    b.dispatchEvent(new PointerEvent('pointermove', at(6, 6)));
    expect(core.dom.body.classList.contains('dim')).toBe(false);
    // Edit mode: no highlight
    core.setDisplay({ hoverHighlight: true });
    core.setMode('edit');
    b.dispatchEvent(new PointerEvent('pointermove', at(7, 7)));
    expect(core.dom.body.classList.contains('dim')).toBe(false);
  });
});
