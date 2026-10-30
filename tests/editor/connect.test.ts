// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { connectModule, MAGNETS, projectToBox } from '../../src/editor/modules/connect/index.js';
import { click, drag, handle, lines, mount, press } from './connect.helpers.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

const FLOW = 'flowchart LR\n  A["A"]\n  B["B"]\n  C["C"]\n';
const box = (core: ReturnType<typeof mount>['core'], id: string): { x: number; y: number; w: number; h: number } => {
  const g = core.geom;
  if (g.type !== 'flowchart' && g.type !== 'er') throw new Error('type');
  const b = g.type === 'flowchart' ? g.nodes.get(id) : g.entities.get(id);
  if (!b) throw new Error(`no box ${id}`);
  return b;
};

describe('connect: new connection', () => {
  test('dragging a dot of A onto B creates A --> B, selects it, undo removes it', () => {
    const { core, ed } = mount(FLOW, [connectModule]);
    core.select([{ kind: 'node', id: 'A' }]);
    const dots = core.dom.overlay.querySelectorAll('[data-handle="new"]');
    expect(dots.length).toBe(4);
    const a = box(core, 'A'), b = box(core, 'B');
    const dot = handle(core, '[data-handle="new"][data-side="r"]');
    drag(core, dot, { x: a.x + a.w / 2 + 16, y: a.y }, { x: b.x, y: b.y });
    expect(lines(core)).toContain('A --> B');
    const sel = core.primary();
    expect(sel?.kind).toBe('edge');
    const m = core.getM('edge', sel!.id);
    expect(m.fromSide).toBe('r');
    expect(m.fromAt).toBe(0.5);
    expect(m.toSide).toBeUndefined(); // dropped deep inside B: the renderer picks the side
    ed.undo();
    expect(lines(core)).not.toContain('A --> B');
  });

  test('dropping near the border of the target pins a magnet; nothing under the pointer adds nothing', () => {
    const { core } = mount(FLOW, [connectModule]);
    core.select([{ kind: 'node', id: 'A' }]);
    const a = box(core, 'A'), c = box(core, 'C');
    drag(core, handle(core, '[data-handle="new"][data-side="b"]'), { x: a.x, y: a.y + a.h / 2 + 16 }, { x: c.x - c.w / 2 + 2, y: c.y });
    const e = core.primary()!;
    expect(lines(core)).toContain('A --> C');
    expect(core.getM('edge', e.id).toSide).toBe('l');
    expect(MAGNETS).toContain(core.getM('edge', e.id).toAt);
    const before = core.code;
    core.select([{ kind: 'node', id: 'A' }]);
    drag(core, handle(core, '[data-handle="new"][data-side="t"]'), { x: a.x, y: a.y - a.h / 2 - 16 }, { x: a.x, y: a.y - 400 });
    expect(core.code).toBe(before);
  });

  test('ER: entity to entity creates a relationship', () => {
    const { core } = mount('erDiagram\n  A {\n    string id\n  }\n  B {\n    string id\n  }\n', [connectModule]);
    core.select([{ kind: 'entity', id: 'A' }]);
    const b = box(core, 'B');
    const dot = handle(core, '[data-handle="new"]');
    drag(core, dot, { x: 0, y: 0 }, { x: b.x, y: b.y });
    expect(lines(core)).toContain('A ||--o{ B : ""');
    expect(core.primary()?.kind).toBe('rel');
  });

  test('hover shows the dots of a connectable item', () => {
    const { core } = mount(FLOW, [connectModule]);
    const el = core.dom.body.querySelector('.el[data-kind="node"][data-id="B"]')!;
    el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(core.hover).toEqual({ kind: 'node', id: 'B' });
    expect(core.dom.overlay.querySelectorAll('[data-handle="new"][data-id="B"]').length).toBe(4);
  });
});

describe('connect: end handles', () => {
  const SRC = 'flowchart LR\n  A["A"] --> B["B"]\n  C["C"]\n';

  test('dropping an end on another item re-attaches it (line rewritten), undo restores', () => {
    const { core, ed } = mount(SRC, [connectModule]);
    core.select([{ kind: 'edge', id: 'A->B' }]);
    const ends = core.dom.overlay.querySelectorAll('[data-handle="end"]');
    expect(ends.length).toBe(2);
    const g = core.geom.type === 'flowchart' ? core.geom.edges.get('A->B')! : null;
    const c = box(core, 'C');
    drag(core, handle(core, '[data-handle="end"][data-end="b"]'), g!.b, { x: c.x, y: c.y });
    expect(lines(core).some((l) => /^A --> C$/.test(l))).toBe(true);
    expect(core.primary()).toEqual({ kind: 'edge', id: 'A->C' });
    ed.undo();
    expect(lines(core).join('\n')).toContain('A["A"] --> B["B"]');
  });

  test('dragging an end around its own box pins it to a magnet (Alt = free); double press resets', () => {
    const { core, ed } = mount(SRC, [connectModule]);
    core.select([{ kind: 'edge', id: 'A->B' }]);
    const g = core.geom.type === 'flowchart' ? core.geom.edges.get('A->B')! : null;
    const b = box(core, 'B');
    const to = { x: b.x - b.w / 2, y: b.y - b.h / 2 + b.h * 0.3 };
    drag(core, handle(core, '[data-handle="end"][data-end="b"]'), g!.b, to);
    const m = core.getM('edge', 'A->B');
    expect(m.toSide).toBe('l');
    expect(m.toAt).toBe(projectToBox(b, to).at);
    expect(core.dom.overlay.querySelector('[data-handle="end"][data-end="b"]')?.getAttribute('class')).toContain('fixed');
    // Alt: free placement
    const g2 = core.geom.type === 'flowchart' ? core.geom.edges.get('A->B')! : null;
    drag(core, handle(core, '[data-handle="end"][data-end="b"]'), g2!.b, { x: b.x - b.w / 2, y: b.y - b.h / 2 + b.h * 0.42 }, { altKey: true });
    expect(core.getM('edge', 'A->B').toAt).toBe(0.42);
    // double press on the end handle: back to automatic
    const h = handle(core, '[data-handle="end"][data-end="b"]');
    click(core, h, g2!.b);
    click(core, handle(core, '[data-handle="end"][data-end="b"]'), g2!.b, { time: 200 });
    expect(core.getM('edge', 'A->B').toSide).toBeUndefined();
    expect(core.getM('edge', 'A->B').toAt).toBeUndefined();
    ed.undo();
    expect(core.getM('edge', 'A->B').toAt).toBe(0.42);
    ed.undo();
    expect(core.getM('edge', 'A->B').toAt).toBe(projectToBox(b, to).at);
  });

  test('Esc during an end drag rolls back', () => {
    const { core } = mount(SRC, [connectModule]);
    core.select([{ kind: 'edge', id: 'A->B' }]);
    const g = core.geom.type === 'flowchart' ? core.geom.edges.get('A->B')! : null;
    const b = box(core, 'B');
    const gst = press(core, handle(core, '[data-handle="end"][data-end="b"]'), g!.b)!;
    gst.move(-40, 0, new MouseEvent('pointermove', { clientX: b.x - b.w / 2, clientY: b.y }) as PointerEvent);
    expect(core.getM('edge', 'A->B').toSide).toBe('l');
    gst.cancel?.();
    expect(core.getM('edge', 'A->B').toSide).toBeUndefined();
  });
});

describe('connect: bend points', () => {
  test('pull a point out of a segment, move it, double press removes it; undo after each', () => {
    const { core, ed } = mount('flowchart LR\n  A["A"] --> B["B"]\n', [connectModule]);
    core.select([{ kind: 'edge', id: 'A->B' }]);
    const mid = core.geom.type === 'flowchart' ? core.geom.edges.get('A->B')!.mids[0]! : { x: 0, y: 0 };
    // a click on the middle handle adds nothing
    click(core, handle(core, '[data-handle="bendNew"]'), mid);
    expect(core.getM('edge', 'A->B').points).toBeUndefined();
    drag(core, handle(core, '[data-handle="bendNew"]'), mid, { x: mid.x + 3, y: mid.y + 60 });
    expect(core.getM('edge', 'A->B').points).toEqual([[core.snapV(mid.x + 3), core.snapV(mid.y + 60)]]);
    const p1 = core.getM('edge', 'A->B').points![0]!;
    drag(core, handle(core, '[data-handle="bend"][data-j="0"]'), { x: p1[0], y: p1[1] }, { x: p1[0] + 20, y: p1[1] + 20 });
    expect(core.getM('edge', 'A->B').points).toEqual([[p1[0] + 20, p1[1] + 20]]);
    ed.undo();
    expect(core.getM('edge', 'A->B').points).toEqual([p1]);
    const pt = { x: p1[0], y: p1[1] };
    click(core, handle(core, '[data-handle="bend"][data-j="0"]'), pt);
    click(core, handle(core, '[data-handle="bend"][data-j="0"]'), pt, { time: 150 });
    expect(core.getM('edge', 'A->B').points).toBeUndefined();
    ed.undo();
    expect(core.getM('edge', 'A->B').points).toEqual([p1]);
    ed.undo();
    expect(core.getM('edge', 'A->B').points).toBeUndefined();
  });

  test('hovering a line shows its bend handles', () => {
    const { core } = mount('flowchart LR\n  A["A"] --> B["B"]\n', [connectModule]);
    const line = core.dom.body.querySelector('.el.edge')!;
    line.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    expect(core.dom.overlay.querySelectorAll('[data-handle="bendNew"]').length).toBeGreaterThan(0);
  });
});

describe('connect with the default modules', () => {
  test('handles win over item gestures (priority 100 vs 50)', async () => {
    const { DEFAULT_MODULES } = await import('../../src/editor/modules/index.js');
    const { core } = mount(FLOW, DEFAULT_MODULES);
    core.select([{ kind: 'node', id: 'A' }]);
    const a = box(core, 'A'), b = box(core, 'B');
    drag(core, handle(core, '[data-handle="new"][data-side="r"]'), { x: a.x + a.w / 2 + 16, y: a.y }, { x: b.x, y: b.y });
    expect(lines(core)).toContain('A --> B');
    expect(box(core, 'A').x).toBe(a.x); // the node did not move
  });
});
