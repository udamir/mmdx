// @vitest-environment jsdom
// Smart guides through the editor (task 005): a drag snaps to another item's edge or centre, to equal gaps and to
// equal margins in a hand-sized subgraph, and draws its guides while it runs; Alt turns them off with the grid; the
// release and Esc leave none; one history step. Multi-moves and Alt-drag copies align as one block; the corner
// handle snaps the right / bottom edge. ER tables and state diagrams have them; sequence diagrams do not.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { CANVAS_MODULES } from '../../src/editor/modules/canvas/index.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import type { ItemKind } from '../../src/core/types.js';

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

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});
function mount(value: string, modules = CANVAS_MODULES): { ed: DiagramEditor; core: EditorCore } {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules, storage: memoryStorage() });
  editors.push(ed);
  return { ed, core: ed.core };
}

const itemEl = (core: EditorCore, kind: string, id: string): Element => {
  const e = Array.from(core.dom.body.querySelectorAll('.el')).find((n) => n.getAttribute('data-kind') === kind && n.getAttribute('data-id') === id && !n.hasAttribute('data-part'));
  if (!e) throw new Error(`no element ${kind}:${id}`);
  return e.querySelector('rect, path, polygon, ellipse, circle, text') ?? e;
};
const box = (core: EditorCore, kind: ItemKind, id: string): { x0: number; y0: number; x1: number; y1: number; x: number; y: number } => {
  const b = core.boxOf({ kind, id });
  if (!b) throw new Error(`no box ${kind}:${id}`);
  return { x0: b.x - b.w / 2, y0: b.y - b.h / 2, x1: b.x + b.w / 2, y1: b.y + b.h / 2, x: b.x, y: b.y };
};
const guides = (core: EditorCore, cls = 'guide-line'): number => core.dom.overlay.querySelectorAll(`.${cls}`).length;

let pid = 1;
const pointer = (target: Element, type: string, x: number, y: number, alt = false): void =>
  void target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: pid, altKey: alt }));

/** Presses `target` at diagram point `at`; `move` / `up` take a diagram delta from there. */
function drag(core: EditorCore, target: Element, at: { x: number; y: number }, o: { alt?: boolean } = {}) {
  pid++;
  const s = core.toScreen(at);
  pointer(target, 'pointerdown', s.x, s.y, o.alt);
  const to = (dx: number, dy: number): { x: number; y: number } => core.toScreen({ x: at.x + dx, y: at.y + dy });
  return {
    move(dx: number, dy: number, alt = !!o.alt): void {
      const p = to(dx, dy);
      pointer(core.dom.svg, 'pointermove', p.x, p.y, alt);
      core.flushPreview();
    },
    /** Moves there (a release without a move is a click) and lets go. */
    up(dx: number, dy: number, alt = !!o.alt): void {
      this.move(dx, dy, alt);
      const p = to(dx, dy);
      pointer(core.dom.svg, 'pointerup', p.x, p.y, alt);
    },
  };
}
const dragItem = (core: EditorCore, kind: ItemKind, id: string, o: { alt?: boolean } = {}) => {
  const b = box(core, kind, id);
  return drag(core, itemEl(core, kind, id), { x: b.x, y: b.y }, o);
};

// A and B in a row, C below between them; same labels, so the same sizes
const ROW = 'flowchart TB\n  A[Alpha]\n  B[Alpha]\n  C[Alpha]\n%%@ node A {"x":100,"y":100}\n%%@ node B {"x":500,"y":100}\n%%@ node C {"x":250,"y":300}\n';

describe('smart guides: moving one item', () => {
  it('an edge within 6 px snaps to the other item’s edge and shows a guide while dragging; one step; none after', () => {
    const { ed, core } = mount(ROW);
    const a = box(core, 'node', 'A'), c = box(core, 'node', 'C');
    const d = dragItem(core, 'node', 'C');
    d.move(a.x0 - c.x0 + 3, -4); // its left edge 3 right of A's, and off the grid on y
    expect(box(core, 'node', 'C').x0).toBeCloseTo(a.x0, 0);
    expect(guides(core)).toBeGreaterThan(0);
    d.up(a.x0 - c.x0 + 3, -4);
    expect(box(core, 'node', 'C').x0).toBeCloseTo(a.x0, 0);
    expect(Number(core.getM('node', 'C').y) % 5).toBe(0); // the grid still applies on y
    expect(guides(core)).toBe(0);
    ed.undo();
    expect(core.getM('node', 'C').x).toBe(250);
  });

  it('a centre snaps to the other item’s centre (off the grid, the edges not in line)', () => {
    const { core } = mount(ROW.replace('C[Alpha]', 'C[Alpha Beta Gamma]'));
    const d = dragItem(core, 'node', 'C');
    d.move(100 - 250 + 3, 0);
    expect(guides(core)).toBe(1);
    d.up(100 - 250 + 3, 0);
    expect(core.getM('node', 'C').x).toBe(100);
  });

  it('equal gaps between two row neighbours: it snaps halfway and shows both gaps', () => {
    const { core } = mount(ROW);
    const d = dragItem(core, 'node', 'C');
    d.move(303 - 250, -200); // into A and B's row, 3 off the middle
    expect(core.getM('node', 'C').x).toBe(300);
    expect(guides(core, 'guide-gap')).toBe(2);
    d.up(303 - 250, -200);
    const a = box(core, 'node', 'A'), b = box(core, 'node', 'B'), c = box(core, 'node', 'C');
    expect(Math.abs(c.x0 - a.x1 - (b.x0 - c.x1))).toBeLessThanOrEqual(1);
    expect(guides(core, 'guide-gap')).toBe(0);
  });

  it('continuing the gap of a row neighbour pair: it snaps at the same gap and shows both gaps', () => {
    const { core } = mount('flowchart TB\n  A[Alpha]\n  B[Alpha]\n  C[Alpha]\n%%@ node A {"x":100,"y":100}\n%%@ node B {"x":300,"y":100}\n%%@ node C {"x":700,"y":300}\n');
    const d = dragItem(core, 'node', 'C');
    d.move(503 - 700, -200); // into the row, 3 past the next equal gap (the grid alone would give 505)
    expect(core.getM('node', 'C').x).toBe(500);
    expect(guides(core, 'guide-gap')).toBe(2);
    d.up(503 - 700, -200);
    const a = box(core, 'node', 'A'), b = box(core, 'node', 'B'), c = box(core, 'node', 'C');
    expect(Math.abs(b.x0 - a.x1 - (c.x0 - b.x1))).toBeLessThanOrEqual(1);
  });

  it('Alt while dragging: no guides and no grid', () => {
    const { core } = mount(ROW);
    const a = box(core, 'node', 'A'), c = box(core, 'node', 'C');
    const d = dragItem(core, 'node', 'C');
    d.move(a.x0 - c.x0 + 3, 1, true);
    expect(guides(core)).toBe(0);
    d.up(a.x0 - c.x0 + 3, 1, true);
    expect(box(core, 'node', 'C').x0).toBeCloseTo(a.x0 + 3, 0);
    expect(core.getM('node', 'C').y).toBe(301);
  });

  it('Esc cancels the drag: the item goes back and the guides go', () => {
    const { core } = mount(ROW);
    const a = box(core, 'node', 'A'), c = box(core, 'node', 'C');
    const d = dragItem(core, 'node', 'C');
    d.move(a.x0 - c.x0 + 3, 0);
    expect(guides(core)).toBeGreaterThan(0);
    core.dom.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
    expect(guides(core)).toBe(0);
    expect(core.getM('node', 'C').x).toBe(250);
  });
});

describe('smart guides: parent margins', () => {
  const FRAME = 'flowchart TB\n  subgraph G\n    N[Alpha]\n  end\n  O[Alpha]\n%%@ group G {"x":0,"y":0,"w":400,"h":300}\n%%@ node N {"x":190,"y":150}\n%%@ node O {"x":700,"y":600}\n';

  it('inside a hand-sized subgraph: equal left and right margins snap and show', () => {
    const { core } = mount(FRAME);
    core.enterGroup('G');
    core.draw();
    const g = box(core, 'group', 'G');
    const d = dragItem(core, 'node', 'N');
    d.move(7, 0); // the grid alone would put it at 195
    const n = box(core, 'node', 'N');
    expect(Math.abs(n.x0 - g.x0 - (g.x1 - n.x1))).toBeLessThanOrEqual(1);
    expect(guides(core, 'guide-margin')).toBeGreaterThanOrEqual(2);
    d.up(7, 0);
    expect(guides(core, 'guide-margin')).toBe(0);
  });

  it('the guides paint over the connection dots (they would hide the markers’ ends)', () => {
    const { core } = mount(FRAME, DEFAULT_MODULES);
    core.enterGroup('G');
    core.draw();
    const d = dragItem(core, 'node', 'N');
    d.move(7, 0);
    const dot = core.dom.overlay.querySelector('.conn-dot'), marker = core.dom.overlay.querySelector('.guide-margin');
    expect(dot).not.toBeNull();
    expect(marker).not.toBeNull();
    expect(dot!.compareDocumentPosition(marker!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    d.up(7, 0);
  });

  it('a subgraph sized by its contents shows no margins', () => {
    const { core } = mount('flowchart TB\n  subgraph G\n    N[Alpha]\n    M[Alpha]\n  end\n%%@ node N {"x":190,"y":150}\n%%@ node M {"x":190,"y":350}\n');
    core.enterGroup('G');
    core.draw();
    const d = dragItem(core, 'node', 'N');
    d.move(8, 0);
    expect(guides(core, 'guide-margin')).toBe(0);
    d.up(8, 0);
  });
});

describe('smart guides: several items, copies, resize', () => {
  it('a multi-selection aligns as one block', () => {
    const { core } = mount(ROW);
    core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    core.draw();
    const a = box(core, 'node', 'A'), c = box(core, 'node', 'C');
    // the block's left edge (A's) 4 off C's left edge
    const d = dragItem(core, 'node', 'A');
    d.up(c.x0 - a.x0 + 4, 0);
    expect(box(core, 'node', 'A').x0).toBeCloseTo(c.x0, 0);
    expect(core.getM('node', 'B').x).toBe(500 + (Number(core.getM('node', 'A').x) - 100));
  });

  it('an Alt-drag copy snaps and shows guides (Alt means copy there)', () => {
    const { core } = mount(ROW);
    const a = box(core, 'node', 'A'), c = box(core, 'node', 'C');
    const d = dragItem(core, 'node', 'C', { alt: true });
    d.move(a.x0 - c.x0 + 3, 0);
    expect(guides(core)).toBeGreaterThan(0);
    d.up(a.x0 - c.x0 + 3, 0);
    const copy = core.selection()[0]!;
    expect(copy.id).not.toBe('C');
    expect(box(core, 'node', copy.id).x0).toBeCloseTo(a.x0, 0);
    expect(core.getM('node', 'C').x).toBe(250);
    expect(guides(core)).toBe(0);
  });

  it('the corner handle snaps the right edge to another item’s right edge; the top-left stays', () => {
    const { ed, core } = mount(ROW);
    core.select([{ kind: 'node', id: 'C' }]);
    core.drawOverlay();
    const c0 = box(core, 'node', 'C'), b = box(core, 'node', 'B');
    const handle = core.dom.overlay.querySelector('[data-handle="resize"]')!;
    const d = drag(core, handle, { x: c0.x1, y: c0.y1 });
    d.move(b.x1 - c0.x1 - 3, 7);
    expect(guides(core)).toBeGreaterThan(0);
    d.up(b.x1 - c0.x1 - 3, 7);
    const c = box(core, 'node', 'C');
    expect(Math.abs(c.x1 - b.x1)).toBeLessThanOrEqual(1);
    expect(c.x0).toBeCloseTo(c0.x0, 5);
    expect(Number(core.getM('node', 'C').h) % 5).toBe(0); // no guide on y: the grid
    expect(guides(core)).toBe(0);
    ed.undo();
    expect(core.getM('node', 'C').w).toBeUndefined();
  });

  it('resizing inside a hand-sized subgraph snaps to equal margins', () => {
    const { core } = mount('flowchart TB\n  subgraph G\n    N[Alpha]\n  end\n%%@ group G {"x":0,"y":0,"w":400,"h":300}\n%%@ node N {"x":100,"y":150,"w":100,"h":40}\n');
    core.enterGroup('G');
    core.select([{ kind: 'node', id: 'N' }]);
    core.draw();
    const g = box(core, 'group', 'G'), n0 = box(core, 'node', 'N');
    const handle = core.dom.overlay.querySelector('[data-handle="resize"]')!;
    // the left margin is 50: the right edge 3 short of a right margin of 50
    const want = g.x1 - (n0.x0 - g.x0);
    const d = drag(core, handle, { x: n0.x1, y: n0.y1 });
    d.up(want - n0.x1 - 3, 0);
    expect(Math.abs(box(core, 'node', 'N').x1 - want)).toBeLessThanOrEqual(1);
  });
});

describe('smart guides: diagram types', () => {
  it('ER tables align', () => {
    const { core } = mount('erDiagram\n  CUSTOMER {\n    string name\n  }\n  ORDER {\n    string id\n  }\n%%@ entity CUSTOMER {"x":100,"y":100}\n%%@ entity ORDER {"x":400,"y":300}\n');
    const c = box(core, 'entity', 'CUSTOMER'), o = box(core, 'entity', 'ORDER');
    const d = dragItem(core, 'entity', 'ORDER');
    d.move(c.x0 - o.x0 + 3, 0);
    expect(guides(core)).toBeGreaterThan(0);
    d.up(c.x0 - o.x0 + 3, 0);
    expect(box(core, 'entity', 'ORDER').x0).toBeCloseTo(c.x0, 0);
  });

  it('state diagrams: a state snaps inside a composite state with a fixed frame', () => {
    const { core } = mount('stateDiagram-v2\n  state Comp {\n    a\n  }\n  b\n%%@ group Comp {"x":0,"y":0,"w":400,"h":300}\n%%@ node a {"x":190,"y":150}\n%%@ node b {"x":700,"y":600}\n');
    core.enterGroup('Comp');
    core.draw();
    const g = box(core, 'group', 'Comp');
    const d = dragItem(core, 'node', 'a');
    d.move(7, 0);
    const n = box(core, 'node', 'a');
    expect(Math.abs(n.x0 - g.x0 - (g.x1 - n.x1))).toBeLessThanOrEqual(1);
    expect(guides(core, 'guide-margin')).toBeGreaterThanOrEqual(2);
    d.up(7, 0);
  });

  it('mindmap branches move as before: their own drag, no guides', async () => {
    const { core } = mount('mindmap\n  root((Topic))\n    a[Alpha]\n    b[Beta]\n    c[Gamma]\n', DEFAULT_MODULES);
    await import('../../src/editor/modules/mindmap/gestures.js');
    await vi.waitFor(() => expect(core.geom.type).toBe('mindmap'));
    const g = core.geom;
    if (g.type !== 'mindmap') throw new Error('mindmap expected');
    const [id] = [...g.nodes.keys()].filter((k) => k !== [...g.nodes.keys()][0]);
    const d = dragItem(core, 'node', id!);
    d.move(4, 30);
    expect(guides(core, 'guide-line') + guides(core, 'guide-gap') + guides(core, 'guide-margin')).toBe(0);
    d.up(4, 30);
    expect(guides(core, 'guide-line')).toBe(0);
  });

  it('sequence participants move as before: the grid, no guides', () => {
    const { core } = mount('sequenceDiagram\n  participant A\n  participant B\n  A->>B: hi\n');
    const b0 = box(core, 'participant', 'B');
    const d = dragItem(core, 'participant', 'B');
    d.move(13, 0);
    expect(guides(core)).toBe(0);
    d.up(13, 0);
    expect(Number(core.getM('participant', 'B').x) % 5).toBe(0);
    expect(Math.abs(Number(core.getM('participant', 'B').x) - (b0.x + 13))).toBeLessThanOrEqual(2.5);
  });
});
